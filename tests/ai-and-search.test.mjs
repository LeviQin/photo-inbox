import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { averageColorDistance, classifyPhoto, effectivePhotoBytes, findSimilarGroups, hammingDistance, rankBestPhoto, similarityProfiles } from '../src/services/aiService.ts';
import { buildSearchPlan, explainSearchHit, localSemanticSearch } from '../src/services/searchService.ts';
import { photoGridIndexAtPoint } from '../src/services/gridSelection.ts';
import { resolvePhotoCreatedAt, shouldQueuePhotoAnalysis } from '../src/services/indexingPolicy.ts';
import { formatDate } from '../src/utils/format.ts';
import { isDeletedAssetError, isDeletionCancelled, partitionDeletionResult } from '../src/services/deletionPolicy.ts';
import { applyReviewDecision, buildReviewSourceQuery, canDecideReviewTarget, nextDailyReviewProgress, reviewDayKey, undoLatestReviewDecision } from '../src/services/reviewPolicy.ts';

const NOW = new Date('2026-08-30T12:00:00+08:00').getTime();
const REVIEW_SCREEN_SOURCE = readFileSync(new URL('../app/review/index.tsx', import.meta.url), 'utf8');
const PHOTO_DETAIL_SOURCE = readFileSync(new URL('../app/photo/[id].tsx', import.meta.url), 'utf8');
const DATABASE_SOURCE = readFileSync(new URL('../src/db/database.ts', import.meta.url), 'utf8');
const PHOTO_INDEXER_SOURCE = readFileSync(new URL('../src/services/photoIndexer.ts', import.meta.url), 'utf8');
const AI_PHOTO_INPUT_SOURCE = readFileSync(new URL('../src/services/aiPhotoInput.ts', import.meta.url), 'utf8');

function photo(overrides = {}) {
  return {
    id: 'photo-1',
    assetId: 'asset-1',
    uri: 'file:///photo.jpg',
    filename: 'photo.jpg',
    width: 3000,
    height: 4000,
    createdAt: NOW,
    modifiedAt: NOW,
    category: 'other',
    status: 'active',
    favorite: false,
    aiScore: 80,
    visualHash: null,
    averageColor: null,
    exactHash: null,
    actualBytes: null,
    analysisVersion: 0,
    estimatedBytes: 1_000_000,
    searchText: 'photo other',
    aiDescription: null,
    ...overrides
  };
}

test('真实扫描规则能够生成旅行分类', () => {
  assert.equal(classifyPhoto('tokyo-trip-2026.jpg', 3024, 4032), 'travel');
  assert.equal(classifyPhoto('京都旅拍-001.heic', 3024, 4032), 'travel');
});

test('“最近”默认只返回最近 30 天的匹配照片', () => {
  const recent = photo({ id: 'recent', category: 'food', searchText: 'food 美食', createdAt: NOW - 10 * 86_400_000 });
  const old = photo({ id: 'old', category: 'food', searchText: 'food 美食', createdAt: NOW - 40 * 86_400_000 });
  assert.deepEqual(localSemanticSearch([old, recent], '最近的美食照片', NOW).map((item) => item.id), ['recent']);
});

test('“最近 N 天”使用用户指定时间窗口', () => {
  const yesterday = photo({ id: 'yesterday', createdAt: NOW - 86_400_000 });
  const lastWeek = photo({ id: 'last-week', createdAt: NOW - 7 * 86_400_000 });
  assert.deepEqual(localSemanticSearch([lastWeek, yesterday], '最近 3 天', NOW).map((item) => item.id), ['yesterday']);
});

test('数据库搜索计划正确生成去年边界和中文分类 token', () => {
  const plan = buildSearchPlan('去年的截图', NOW);
  assert.deepEqual(plan.tokens, ['截图', 'screenshot']);
  assert.equal(plan.startAt, new Date(2025, 0, 1).getTime());
  assert.equal(plan.endAt, new Date(2026, 0, 1).getTime());
});

test('搜索结果说明优先显示本机识别文字与附近片段', () => {
  const match = explainSearchHit({
    filename: 'IMG_0042.jpg', category: 'document', searchText: '文档 document', aiDescription: '一张纸',
    ocrText: '订单编号 2468\n应付金额 300 元\n收件地址 杭州'
  }, buildSearchPlan('应付金额', NOW));
  assert.equal(match.label, '图片文字');
  assert.match(match.snippet, /应付金额 300 元/);
  assert.equal(explainSearchHit({ filename: '发票.jpg', category: 'document', searchText: '文档', aiDescription: null, ocrText: null }, buildSearchPlan('发票', NOW)).label, '文件名');
});

test('数据库全文索引随识别文字更新和删除而同步', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE photos (id TEXT PRIMARY KEY, search_text TEXT, category TEXT, ocr_text TEXT, ai_description TEXT);');
  const start = DATABASE_SOURCE.indexOf('CREATE VIRTUAL TABLE IF NOT EXISTS photo_search_fts');
  const deleteTrigger = DATABASE_SOURCE.indexOf('CREATE TRIGGER IF NOT EXISTS photos_search_delete', start);
  const end = DATABASE_SOURCE.indexOf('END;', deleteTrigger) + 4;
  assert.ok(start > 0 && deleteTrigger > start && end > deleteTrigger);
  db.exec(DATABASE_SOURCE.slice(start, end));
  db.exec("INSERT INTO photos(id, search_text, category) VALUES ('1', 'IMG_0042.jpg', 'document')");
  const find = (term) => db.prepare('SELECT rowid FROM photo_search_fts WHERE body LIKE ?').all(`%${term}%`).length;
  assert.equal(find('应付金额'), 0);
  db.exec("UPDATE photos SET ocr_text = '应付金额 300 元' WHERE id = '1'");
  assert.equal(find('应付金额'), 1);
  db.exec("UPDATE photos SET ocr_text = NULL WHERE id = '1'");
  assert.equal(find('应付金额'), 0);
  db.exec("DELETE FROM photos WHERE id = '1'");
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM photo_search_fts').get().count, 0);
  db.close();
});

test('V1.2 数据库升级保留已识别文字并给旧截图入队', async () => {
  const db = new DatabaseSync(':memory:');
  const schemaStart = DATABASE_SOURCE.indexOf('CREATE TABLE IF NOT EXISTS photos (');
  const schemaEnd = DATABASE_SOURCE.indexOf(');', schemaStart) + 2;
  const oldSchema = DATABASE_SOURCE.slice(schemaStart, schemaEnd)
    .replace(/\s+category_source TEXT NOT NULL DEFAULT 'auto',/, '')
    .replace(/\s+ocr_version INTEGER NOT NULL DEFAULT 0,/, '');
  db.exec(oldSchema);
  db.exec("PRAGMA user_version = 6; INSERT INTO photos(id, asset_id, uri, filename, width, height, created_at, modified_at, category, status, estimated_bytes, search_text, ai_description) VALUES ('one', 'asset-one', 'file:///one.jpg', 'IMG_01.jpg', 1000, 2000, 1, 1, 'document', 'active', 1000, 'document', '纸张');");
  db.exec("INSERT INTO photos(id, asset_id, uri, filename, width, height, created_at, modified_at, category, status, estimated_bytes, search_text, ocr_text) VALUES ('two', 'asset-two', 'file:///two.jpg', 'Screenshot.jpg', 1000, 2000, 2, 2, 'screenshot', 'active', 1000, 'screenshot', '旧发票号码');");
  const migrationStart = DATABASE_SOURCE.indexOf('async function migrateDatabase(');
  const migrationEnd = DATABASE_SOURCE.indexOf('export async function getDatabase()', migrationStart);
  const supportsSearchFts = true;
  const migrateDatabase = eval(`(${stripTypeScriptTypes(DATABASE_SOURCE.slice(migrationStart, migrationEnd)).trim()})`);
  const adapter = {
    execAsync: async (sql) => db.exec(sql),
    getFirstAsync: async (sql, ...params) => db.prepare(sql).get(...params),
    getAllAsync: async (sql, ...params) => db.prepare(sql).all(...params),
    runAsync: async (sql, ...params) => ({ changes: db.prepare(sql).run(...params).changes })
  };
  await migrateDatabase(adapter);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
  const pendingPhoto = db.prepare('SELECT category_source, ocr_version FROM photos WHERE id = ?').get('one');
  assert.equal(pendingPhoto.category_source, 'manual');
  assert.equal(pendingPhoto.ocr_version, 0);
  assert.equal(db.prepare('SELECT ocr_version FROM photos WHERE id = ?').get('two').ocr_version, 1);
  assert.deepEqual(db.prepare('SELECT asset_id FROM ocr_queue').all().map((row) => row.asset_id), ['asset-one']);
  assert.equal(db.prepare('SELECT rowid FROM photo_search_fts WHERE body LIKE ?').all('%旧发票号码%').length, 1);
  await migrateDatabase(adapter);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM ocr_queue').get().count, 1);
  db.close();
});

test('Web SQLite 无 FTS5 时仍能完成数据库迁移', async () => {
  const db = new DatabaseSync(':memory:');
  const supportsSearchFts = false;
  const start = DATABASE_SOURCE.indexOf('async function migrateDatabase(');
  const end = DATABASE_SOURCE.indexOf('export async function getDatabase()', start);
  const migrateDatabase = eval(`(${stripTypeScriptTypes(DATABASE_SOURCE.slice(start, end)).trim()})`);
  await migrateDatabase({
    execAsync: async (sql) => db.exec(sql),
    getFirstAsync: async (sql, ...params) => db.prepare(sql).get(...params),
    getAllAsync: async (sql, ...params) => db.prepare(sql).all(...params),
    runAsync: async (sql, ...params) => ({ changes: db.prepare(sql).run(...params).changes })
  });
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'photo_search_fts'").get().count, 0);
  db.close();
});

test('搜索可匹配已保存的 AI 画面描述，并用类别别名补齐英文分类', () => {
  const cat = photo({ id: 'cat', aiDescription: '一只灰猫站在猫草盆旁边' });
  const screenshot = photo({ id: 'screenshot', category: 'screenshot', searchText: 'screen-1.jpg 截图 screenshot' });
  assert.deepEqual(localSemanticSearch([cat, screenshot], '猫', NOW).map((item) => item.id), ['cat']);
  assert.deepEqual(localSemanticSearch([cat, screenshot], 'screen shot', NOW).map((item) => item.id), ['screenshot']);
  assert.deepEqual(buildSearchPlan('截图 旅行', NOW).tokenMatch, 'any');
});

test('英文分类别名只匹配完整单词，不会把文件名前缀误当分类', () => {
  const travel = photo({ id: 'travel', category: 'travel', searchText: 'osaka.jpg travel' });
  assert.deepEqual(buildSearchPlan('tripflow', NOW).tokens, ['tripflow']);
  assert.deepEqual(localSemanticSearch([travel], 'tripflow', NOW), []);
  assert.ok(buildSearchPlan('my trip', NOW).tokens.includes('travel'));
  assert.deepEqual(buildSearchPlan('category', NOW).tokens, ['category']);
});

test('AI 画面描述保存到本地数据库并参与 SQL 搜索，旧数据库会平滑迁移', () => {
  assert.match(PHOTO_DETAIL_SOURCE, /savePhotoAiDescription\(photo\.id, searchableDescription\)/);
  assert.match(DATABASE_SOURCE, /ALTER TABLE photos ADD COLUMN ai_description TEXT/);
  assert.match(DATABASE_SOURCE, /ai_description LIKE \?/);
  assert.match(DATABASE_SOURCE, /ai_description=CASE WHEN excluded\.modified_at != photos\.modified_at THEN NULL ELSE photos\.ai_description END/);
});

test('详情信息面板把顶部把手交给 PanResponder 处理点击和上下滑动', () => {
  assert.match(PHOTO_DETAIL_SOURCE, /onStartShouldSetPanResponder: \(\) => true/);
  assert.match(PHOTO_DETAIL_SOURCE, /onPanResponderTerminationRequest: \(\) => false/);
  assert.match(PHOTO_DETAIL_SOURCE, /onAccessibilityAction=\{togglePanel\}/);
});

test('输入明确年份按照片拍摄时间筛选', () => {
  const inYear = photo({ id: 'in-year', createdAt: new Date(2026, 2, 1).getTime() });
  const outside = photo({ id: 'outside', createdAt: new Date(2025, 2, 1).getTime() });
  const plan = buildSearchPlan('2026', NOW);
  assert.deepEqual(localSemanticSearch([outside, inYear], '2026', NOW).map((item) => item.id), ['in-year']);
  assert.equal(plan.startAt, new Date(2026, 0, 1).getTime());
  assert.equal(plan.endAt, new Date(2027, 0, 1).getTime());
});

test('回收站滑动选择按网格行列映射触点，并忽略间隙和列表外坐标', () => {
  const layout = { originX: 10, originY: 100, scrollOffset: 40, headerHeight: 80, horizontalPadding: 16, tileSide: 100, gap: 4, columns: 3, itemCount: 9 };
  assert.equal(photoGridIndexAtPoint({ pageX: 30, pageY: 150, ...layout }), 0);
  assert.equal(photoGridIndexAtPoint({ pageX: 140, pageY: 150, ...layout }), 1);
  assert.equal(photoGridIndexAtPoint({ pageX: 30, pageY: 260, ...layout }), 3);
  assert.equal(photoGridIndexAtPoint({ pageX: 127, pageY: 150, ...layout }), null);
  assert.equal(photoGridIndexAtPoint({ pageX: 30, pageY: 700, ...layout }), null);
});

test('只有新增、修改或缺少指纹的照片进入分析队列', () => {
  assert.equal(shouldQueuePhotoAnalysis(undefined, NOW), true);
  assert.equal(shouldQueuePhotoAnalysis({ modifiedAt: NOW - 1, visualHash: '0123456789abcdef', actualBytes: 1, analysisVersion: 2 }, NOW), true);
  assert.equal(shouldQueuePhotoAnalysis({ modifiedAt: NOW, visualHash: null, actualBytes: null, analysisVersion: 0 }, NOW), true);
  assert.equal(shouldQueuePhotoAnalysis({ modifiedAt: NOW, visualHash: '0123456789abcdef', actualBytes: 1, analysisVersion: 2 }, NOW), false);
});

test('没有拍摄时间时使用文件修改时间，均缺失时显示日期未知', () => {
  assert.equal(resolvePhotoCreatedAt(NOW - 1000, NOW), NOW - 1000);
  assert.equal(resolvePhotoCreatedAt(0, NOW), NOW);
  assert.equal(resolvePhotoCreatedAt(0, 0), 0);
  assert.equal(formatDate(0), '日期未知');
  assert.equal(formatDate(new Date(2026, 7, 30, 12).getTime()), '2026 年 8 月 30 日');
});

test('永久删除只清理已从系统相册消失的记录', () => {
  const result = partitionDeletionResult(['deleted', 'still-there'], ['demo'], new Set(['still-there']));
  assert.deepEqual(result.deletedAssetIds, ['demo', 'deleted']);
  assert.deepEqual(result.failedAssetIds, ['still-there']);
});

test('永久删除识别系统取消与不存在结果', () => {
  assert.equal(isDeletionCancelled(new Error("User didn't grant write permission to requested files.")), true);
  assert.equal(isDeletedAssetError(new Error('Asset not found: content://42. It may have been deleted or is no longer accessible.')), true);
  assert.equal(isDeletedAssetError(new Error("Couldn't find asset with id: 42")), true);
  assert.equal(isDeletedAssetError(new Error('Permission denied')), false);
});

test('永久删除使用 legacy assetId API，避免把 content URI 交给 Asset.delete', () => {
  assert.match(PHOTO_INDEXER_SOURCE, /MediaLibrary\.deleteAssetsAsync\(realIds\)/);
  assert.match(PHOTO_INDEXER_SOURCE, /Platform\.OS === 'android'[\s\S]*?getAssetContentUriAsync/);
  assert.doesNotMatch(PHOTO_INDEXER_SOURCE, /\bAsset\.delete\b|new Asset\(/);
});

test('dHash 汉明距离按位计算', () => {
  assert.equal(hammingDistance('0000000000000000', '0000000000000003'), 2);
  assert.equal(hammingDistance('invalid', '0000000000000000'), Number.POSITIVE_INFINITY);
});

test('只有 SHA-256 相同才跨时间标记为精确重复', () => {
  const first = photo({ id: 'first', visualHash: '0123456789abcdef', exactHash: 'same-sha256', createdAt: NOW - 200_000, aiScore: 70 });
  const copy = photo({ id: 'copy', visualHash: '0123456789abcdef', exactHash: 'same-sha256', createdAt: NOW, aiScore: 92 });
  const groups = findSimilarGroups([first, copy]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'exact');
  assert.equal(groups[0].bestId, 'copy');
});

test('短时间内汉明距离较小的照片归为相似构图', () => {
  const first = photo({ id: 'first', visualHash: '0000000000000000', averageColor: '#202020', createdAt: NOW - 5_000 });
  const similar = photo({ id: 'similar', visualHash: '0000000000000007', averageColor: '#252525', createdAt: NOW });
  assert.equal(findSimilarGroups([first, similar]).length, 1);
});

test('严格、均衡、宽松使用规定的视觉阈值', () => {
  assert.deepEqual(similarityProfiles.strict, { hashDistance: 4, colorDistance: 24, timeWindowMs: 15_000, ratioTolerance: 0.03 });
  assert.deepEqual(similarityProfiles.balanced, { hashDistance: 8, colorDistance: 48, timeWindowMs: 30_000, ratioTolerance: 0.04 });
  assert.deepEqual(similarityProfiles.loose, { hashDistance: 12, colorDistance: 72, timeWindowMs: 60_000, ratioTolerance: 0.06 });
  const first = photo({ id: 'first', visualHash: '0000000000000000', averageColor: '#101010', createdAt: NOW - 20_000 });
  const second = photo({ id: 'second', visualHash: '000000000000003f', averageColor: '#202020', createdAt: NOW });
  assert.equal(findSimilarGroups([first, second], 'strict').length, 0);
  assert.equal(findSimilarGroups([first, second], 'balanced').length, 1);
});

test('推荐顺序优先分辨率、真实大小、评分和更早时间', () => {
  const lowResolution = photo({ id: 'low', width: 1000, height: 1000, actualBytes: 9_000_000, aiScore: 99 });
  const highSmall = photo({ id: 'high-small', width: 2000, height: 2000, actualBytes: 2_000_000, aiScore: 70 });
  const highLarge = photo({ id: 'high-large', width: 2000, height: 2000, actualBytes: 4_000_000, aiScore: 60 });
  assert.equal(rankBestPhoto([lowResolution, highSmall, highLarge]).id, 'high-large');
  assert.equal(effectivePhotoBytes(photo({ actualBytes: 88, estimatedBytes: 10 })), 88);
  assert.equal(effectivePhotoBytes(photo({ actualBytes: null, estimatedBytes: 10 })), 10);
  assert.ok(averageColorDistance('#000000', '#101010') > 24);
});

test('整理来源支持截图、最近、年份和大文件排序', () => {
  assert.match(buildReviewSourceQuery('screenshot', null, NOW).where, /category = 'screenshot'/);
  assert.match(buildReviewSourceQuery('large', null, NOW).orderBy, /COALESCE\(actual_bytes, estimated_bytes\) DESC/);
  assert.equal(buildReviewSourceQuery('recent', null, NOW).params[0], NOW - 30 * 86_400_000);
  const year = buildReviewSourceQuery('year', '2025', NOW);
  assert.deepEqual(year.params, [new Date(2025, 0, 1).getTime(), new Date(2026, 0, 1).getTime()]);
});

test('每日目标按本地自然日重置且撤销不小于零', () => {
  const previousDay = reviewDayKey(NOW - 86_400_000);
  assert.deepEqual(nextDailyReviewProgress(previousDay, 49, 1, NOW), { date: reviewDayKey(NOW), count: 1 });
  assert.deepEqual(nextDailyReviewProgress(reviewDayKey(NOW), 0, -1, NOW), { date: reviewDayKey(NOW), count: 0 });
});

test('整理会话决定可恢复，并按最后决定执行撤销', () => {
  const initial = [
    { photoId: 'a', position: 0, decision: null, decidedAt: null },
    { photoId: 'b', position: 1, decision: null, decidedAt: null }
  ];
  const first = applyReviewDecision(initial, 'a', 'kept', NOW - 10);
  assert.equal(first.completed, false);
  const restoredSnapshot = structuredClone(first.items);
  const second = applyReviewDecision(restoredSnapshot, 'b', 'trashed', NOW);
  assert.equal(second.completed, true);
  const undone = undoLatestReviewDecision(second.items);
  assert.equal(undone.restoredId, 'b');
  assert.equal(undone.items.find((item) => item.photoId === 'b').decision, null);
  assert.equal(undone.items.find((item) => item.photoId === 'a').decision, 'kept');
});

test('整理只提交仍处于当前活动队列的照片，过期项可安全同步', () => {
  assert.equal(canDecideReviewTarget(true, { decision: null, status: 'active' }), true);
  assert.equal(canDecideReviewTarget(false, { decision: null, status: 'active' }), false);
  assert.equal(canDecideReviewTarget(true, null), false);
  assert.equal(canDecideReviewTarget(true, { decision: 'kept', status: 'kept' }), false);
  assert.equal(canDecideReviewTarget(true, { decision: null, status: 'trashed' }), false);
  assert.match(REVIEW_SCREEN_SOURCE, /result\.unavailable[\s\S]*?await load\(\)/);
});

test('Android 图片识别使用已索引 URI，不读取 EXIF 位置元数据', () => {
  assert.match(AI_PHOTO_INPUT_SOURCE, /let resolvedUri = photo\.uri;\s*if \(Platform\.OS !== 'android'\) \{[\s\S]*?getAssetInfoAsync/);
});

test('整理页 PanResponder 保持 JS 驱动，避免 Release 手势处理器被当作对象调用', () => {
  assert.match(REVIEW_SCREEN_SOURCE, /onPanResponderMove: Animated\.event\([^\n]+useNativeDriver: false/);
  assert.doesNotMatch(REVIEW_SCREEN_SOURCE, /onPanResponderMove: Animated\.event\([^\n]+useNativeDriver: (?:true|nativeDriver)/);
  assert.match(REVIEW_SCREEN_SOURCE, /const actionLocked = useRef\(false\)/);
});

test('大文件搜索使用真实大小优先并排除小文件', () => {
  const plan = buildSearchPlan('大文件', NOW);
  assert.equal(plan.minBytes, 10 * 1024 * 1024);
  const measured = photo({ id: 'measured', actualBytes: 11 * 1024 * 1024, estimatedBytes: 1 });
  const small = photo({ id: 'small', actualBytes: 2 * 1024 * 1024, estimatedBytes: 20 * 1024 * 1024 });
  assert.deepEqual(localSemanticSearch([small, measured], '大文件', NOW).map((item) => item.id), ['measured']);
});
