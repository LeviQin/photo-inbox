import { performance } from 'node:perf_hooks';
import { buildSearchPlan } from '../src/services/searchService.ts';
import { findSimilarGroups } from '../src/services/aiService.ts';
import { createTestDatabase, makePhoto } from '../tests/helpers/database.mjs';

const now = new Date(2026, 9, 14, 12).getTime();
const results = [];
for (const count of [1000, 10000, 50000]) {
  const { db, raw, close } = await createTestDatabase();
  try {
    const start = performance.now();
    for (let offset = 0; offset < count; offset += 150) {
      await db.upsertPhotos(Array.from({ length: Math.min(150, count - offset) }, (_, index) => {
        const id = offset + index;
        return makePhoto({
          id: `photo-${id}`, assetId: `photo-${id}`, createdAt: now - id * 2000,
          category: id % 5 === 0 ? 'screenshot' : 'other',
          visualHash: id.toString(16).padStart(16, '0'), averageColor: '#202020',
          exactHash: id % 100 === 0 ? `exact-${Math.floor(id / 200)}` : null
        });
      }));
    }
    const insertMs = performance.now() - start;
    const statement = raw.prepare('UPDATE photos SET ocr_text = ? WHERE category = ?');
    statement.run(`订单号 A2468 应付金额 300 元 ${'本地文字索引测试 '.repeat(100)}`, 'screenshot');
    const searches = [];
    let page;
    for (let run = 0; run < 20; run += 1) {
      const began = performance.now();
      page = await db.getPhotoPage({ search: buildSearchPlan('最近3天截图订单号', now) });
      searches.push(performance.now() - began);
    }
    searches.sort((a, b) => a - b);
    const candidatesAt = performance.now();
    const candidates = await db.getSimilarityCandidates();
    const candidatesMs = performance.now() - candidatesAt;
    const groupsAt = performance.now();
    const groups = findSimilarGroups(candidates);
    const round = (value) => Math.round(value * 100) / 100;
    results.push({
      count, insertMs: round(insertMs), searchP50Ms: round(searches[9]), searchP95Ms: round(searches[18]),
      pageCount: page.items.length, candidateCount: candidates.length, candidatesMs: round(candidatesMs),
      groupCount: groups.length, groupingMs: round(performance.now() - groupsAt),
      peakProcessRssMb: round(process.resourceUsage().maxRSS / 1024)
    });
  } finally { close(); }
  global.gc?.();
}
console.log(JSON.stringify({ environment: `Node ${process.version} / ${process.platform} / in-memory SQLite`, results }, null, 2));
