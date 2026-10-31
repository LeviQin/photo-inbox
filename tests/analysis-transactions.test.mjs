import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase, makePhoto } from './helpers/database.mjs';

test('OCR 与视觉队列可并发领取和完成，不嵌套开启 SQLite 事务', async (t) => {
  const { db, close } = await createTestDatabase();
  t.after(close);
  await db.upsertPhotos([makePhoto({ category: 'screenshot' })]);
  await db.enqueuePhotoAnalysis(['one']);
  await db.enqueuePhotoOcr(['one']);
  const [visual, ocr] = await Promise.all([db.claimPhotoAnalysisBatch(), db.claimPhotoOcrBatch()]);
  assert.equal(visual.length, 1);
  assert.equal(ocr.length, 1);
  await Promise.all([
    db.finishPhotoAnalysis(visual[0], { visualHash: '0000000000000000', averageColor: '#ffffff', actualBytes: 1000 }),
    db.finishPhotoOcr(ocr[0], '订单号 A2468')
  ]);
  assert.equal(await db.getAnalysisQueueCount(), 0);
  assert.equal(await db.getOcrQueueCount(), 0);
  assert.equal(await db.getPhotoOcrText('one'), '订单号 A2468');
  assert.equal((await db.getPhoto('one')).analysisVersion, 2);
});

test('一笔事务失败回滚后，后续收藏事务仍可提交', async (t) => {
  const { db, close } = await createTestDatabase();
  t.after(close);
  await db.upsertPhotos([makePhoto()]);
  const invalid = db.upsertPhotos([makePhoto({ assetId: 'duplicate-id' })]);
  const favorite = db.setManyFavorites(['one'], true);
  await assert.rejects(invalid, /UNIQUE constraint/);
  await favorite;
  assert.equal((await db.getPhoto('one')).favorite, true);
  assert.equal((await db.getDashboardStats()).total, 1);
});

test('照片编辑后，旧指纹、原文件哈希与 OCR 失败不能覆盖新任务', async (t) => {
  const { db, raw, close } = await createTestDatabase();
  t.after(close);
  const original = makePhoto({ category: 'screenshot', visualHash: '0000000000000000', analysisVersion: 2 });
  await db.upsertPhotos([original, makePhoto({ id: 'two', assetId: 'two', visualHash: original.visualHash })]);
  await db.enqueuePhotoAnalysis(['one']);
  await db.enqueuePhotoOcr(['one']);
  await db.enqueueExactHashCandidates();
  const [oldVisual] = await db.claimPhotoAnalysisBatch();
  const oldExact = (await db.claimExactHashBatch()).find((photo) => photo.id === 'one');
  const [oldOcr] = await db.claimPhotoOcrBatch();
  assert.ok(oldExact);
  await db.upsertPhotos([makePhoto({ category: 'screenshot', modifiedAt: 2 })]);
  await db.enqueuePhotoOcr(['one'], ['one']);
  await db.finishPhotoAnalysis(oldVisual, { visualHash: 'ffffffffffffffff', averageColor: '#ffffff', actualBytes: 9000 });
  assert.equal((await db.getPhoto('one')).visualHash, null);
  await db.finishExactHash(oldExact, 'old-file-sha', 9000);
  assert.equal((await db.getPhoto('one')).exactHash, null);
  await db.finishPhotoOcr(oldOcr, null, 'ocr_failed');
  assert.equal(raw.prepare('SELECT state FROM ocr_queue WHERE asset_id = ?').get('one').state, 'queued');
  assert.equal((await db.getPhoto('one')).analysisVersion, 0);
});

test('回收站真实大小覆盖率独立于图库中尚未测量的照片', async (t) => {
  const { db, close } = await createTestDatabase();
  t.after(close);
  await db.upsertPhotos([
    makePhoto({ id: 'measured-trash', assetId: 'measured-trash', status: 'trashed', actualBytes: 100 }),
    makePhoto({ id: 'estimated-trash', assetId: 'estimated-trash', status: 'trashed' }),
    makePhoto({ id: 'active', assetId: 'active' })
  ]);
  assert.equal((await db.getDashboardStats()).measuredTrashedCount, 1);
  await db.finishPhotoAnalysis(await db.getPhoto('estimated-trash'), { visualHash: null, averageColor: null, actualBytes: 200 });
  const stats = await db.getDashboardStats();
  assert.equal(stats.measuredTrashedCount, stats.trashed);
  assert.ok(stats.sizeCoverage < 100);
  assert.equal(stats.reclaimableBytes, 300);
});
