import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAIPhotoInsight, parseAISimilarityRecommendation } from '../src/services/aiService.ts';
import { parseAISearchTerms } from '../src/services/searchService.ts';

test('AI 搜索关键词只保留有限、安全、去重的本地索引词', () => {
  assert.deepEqual(parseAISearchTerms('["旅行", "travel", "旅行", "100%", ""]'), ['旅行', 'travel', '100']);
  assert.deepEqual(parseAISearchTerms('截图，文档'), ['截图', '文档']);
  assert.throws(() => parseAISearchTerms('[]'), /没有找到/);
});

test('AI 相似比较建议校验候选序号并限制理由长度', () => {
  assert.deepEqual(parseAISimilarityRecommendation('{"keep":2,"reason":"更清晰"}', 3), { keepIndex: 1, reason: '更清晰' });
  assert.throws(() => parseAISimilarityRecommendation('{"keep":4}', 3), /有效的保留建议/);
  assert.throws(() => parseAISimilarityRecommendation('not json', 3), /有效的保留建议/);
});

test('AI 照片分类建议只接受已知分类和结构化描述', () => {
  assert.deepEqual(parseAIPhotoInsight('{"summary":"海边的日落","category":"travel","observation":"主体清晰"}'), {
    summary: '海边的日落', category: 'travel', observation: '主体清晰'
  });
  assert.throws(() => parseAIPhotoInsight('{"summary":"照片","category":"unknown","observation":"清晰"}'), /有效的照片分析/);
});
