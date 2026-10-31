import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchPlan, expandSearchPlan, localSemanticSearch } from '../src/services/searchService.ts';
import { createTestDatabase, makePhoto } from './helpers/database.mjs';

for (const fts of [true, false]) {
  test(`组合搜索同时匹配分类、文字和日期（FTS=${fts}）`, async (t) => {
    const { db, raw, close } = await createTestDatabase({ fts });
    t.after(close);
    const now = new Date(2026, 9, 14, 12).getTime();
    const recent = now - 86_400_000;
    await db.upsertPhotos([
      makePhoto({ id: 'hit', assetId: 'hit', category: 'screenshot', createdAt: recent }),
      makePhoto({ id: 'no-text', assetId: 'no-text', category: 'screenshot', createdAt: recent }),
      makePhoto({ id: 'wrong-category', assetId: 'wrong-category', category: 'document', createdAt: recent }),
      makePhoto({ id: 'old', assetId: 'old', category: 'screenshot', createdAt: now - 40 * 86_400_000 })
    ]);
    for (const id of ['hit', 'wrong-category', 'old']) await db.savePhotoOcrText(id, '订单号 A2468 应付金额 300 元');
    for (const query of ['最近 3 天 截图 订单号', '最近3天截图订单号']) {
      const page = await db.getPhotoPage({ search: buildSearchPlan(query, now) });
      assert.deepEqual(page.items.map((item) => item.id), ['hit']);
      assert.equal(page.items[0].searchHit.label, '图片文字');
    }
    raw.prepare("UPDATE photos SET actual_bytes = ? WHERE id = 'hit'").run(12 * 1024 * 1024);
    assert.deepEqual((await db.getPhotoPage({ search: buildSearchPlan('大文件 截图 订单号', now) })).items.map((item) => item.id), ['hit']);
  });
}

test('分类同义词保留任意命中，多个文字条件需要同时命中', () => {
  const photos = [
    makePhoto({ id: 'both', category: 'screenshot', ocrText: '订单号 A2468 应付金额 300 元' }),
    makePhoto({ id: 'one-term', category: 'screenshot', ocrText: '订单号 B1234' }),
    makePhoto({ id: 'category-only', category: 'screenshot' })
  ];
  assert.deepEqual(localSemanticSearch(photos, '截图 订单号 应付金额').map((photo) => photo.id), ['both']);
  assert.deepEqual(localSemanticSearch(photos, '截屏').map((photo) => photo.id).sort(), ['both', 'category-only', 'one-term']);
});

test('较长的分类别名不会被较短别名抢先匹配', () => {
  const photo = makePhoto({ category: 'screenshot', ocrText: '订单号 A2468' });
  assert.equal(localSemanticSearch([photo], '屏幕截图').length, 1);
  assert.equal(localSemanticSearch([photo], '屏幕截图订单号').length, 1);
});

test('文件名中的通配符按字面检索，不扩大为整个图库', async (t) => {
  const { db, close } = await createTestDatabase();
  t.after(close);
  await db.upsertPhotos([
    makePhoto({ id: 'literal', assetId: 'literal', filename: 'discount_50%.jpg', searchText: 'discount_50%.jpg other' }),
    makePhoto({ id: 'other', assetId: 'other', filename: 'discountX500.jpg', searchText: 'discountX500.jpg other' })
  ]);
  assert.deepEqual((await db.getPhotoPage({ search: buildSearchPlan('50%') })).items.map((photo) => photo.id), ['literal']);
});

test('AI 扩展只替换文字条件，保留原来的分类和时间限制', async (t) => {
  const { db, close } = await createTestDatabase();
  t.after(close);
  const now = Date.now();
  await db.upsertPhotos([
    makePhoto({ id: 'hit', assetId: 'hit', category: 'screenshot', createdAt: now }),
    makePhoto({ id: 'other', assetId: 'other', category: 'document', createdAt: now }),
    makePhoto({ id: 'old', assetId: 'old', category: 'screenshot', createdAt: now - 10 * 86_400_000 })
  ]);
  for (const id of ['hit', 'other', 'old']) await db.savePhotoOcrText(id, '应付金额 300 元');
  const plan = expandSearchPlan(buildSearchPlan('最近 3 天 截图 付款', now), ['应付金额', '支付总额']);
  assert.deepEqual((await db.getPhotoPage({ search: plan })).items.map((item) => item.id), ['hit']);
});
