import type { PhotoCategory, PhotoRecord, SimilarGroup, SimilarityLevel } from '@/types/photo';

export type AIPhotoInsight = { category: PhotoCategory; summary: string; observation: string };

export function parseAIPhotoInsight(answer: string): AIPhotoInsight {
  const json = answer.match(/\{[\s\S]*\}/)?.[0];
  const categories: PhotoCategory[] = ['screenshot', 'document', 'travel', 'food', 'pet', 'portrait', 'other'];
  try {
    const result = json ? JSON.parse(json) as Partial<AIPhotoInsight> : null;
    if (!result || !categories.includes(result.category as PhotoCategory) || typeof result.summary !== 'string' || typeof result.observation !== 'string') throw new Error();
    return { category: result.category as PhotoCategory, summary: result.summary.slice(0, 240), observation: result.observation.slice(0, 120) };
  } catch {
    throw new Error('AI 没有返回有效的照片分析结果，请重试。');
  }
}

export const similarityProfiles: Record<SimilarityLevel, {
  hashDistance: number;
  colorDistance: number;
  timeWindowMs: number;
  ratioTolerance: number;
}> = {
  strict: { hashDistance: 4, colorDistance: 24, timeWindowMs: 15_000, ratioTolerance: 0.03 },
  balanced: { hashDistance: 8, colorDistance: 48, timeWindowMs: 30_000, ratioTolerance: 0.04 },
  loose: { hashDistance: 12, colorDistance: 72, timeWindowMs: 60_000, ratioTolerance: 0.06 }
};

function textIncludes(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

export function classifyPhoto(filename: string, width: number, height: number): PhotoCategory {
  const name = filename.toLowerCase();
  if (textIncludes(name, ['screenshot', '截屏', '截图', 'screen_shot'])) return 'screenshot';
  if (textIncludes(name, ['invoice', 'receipt', 'scan', 'document', 'pdf'])) return 'document';
  if (textIncludes(name, ['travel', 'trip', 'vacation', 'holiday', 'journey', 'tour', 'flight', 'hotel', 'beach', 'tokyo', 'kyoto', '旅行', '旅游', '旅拍', '景区', '海边', '东京', '京都'])) return 'travel';
  if (textIncludes(name, ['food', 'meal', 'restaurant'])) return 'food';
  if (textIncludes(name, ['cat', 'dog', 'pet'])) return 'pet';
  if (textIncludes(name, ['selfie', 'portrait'])) return 'portrait';

  const ratio = width > 0 && height > 0 ? height / width : 1;
  // 手机截图通常非常接近屏幕比例，作为无模型版本的保守启发式。
  if (ratio > 1.9 && ratio < 2.4) return 'screenshot';
  return 'other';
}

export function getQualityScore(photo: Pick<PhotoRecord, 'width' | 'height' | 'filename'>): number {
  const megapixels = (photo.width * photo.height) / 1_000_000;
  const resolution = Math.min(25, megapixels * 2.2);
  const screenshotPenalty = /screenshot|截屏|截图/i.test(photo.filename) ? 18 : 0;
  return Math.max(45, Math.min(98, Math.round(68 + resolution - screenshotPenalty)));
}

export function buildSearchText(filename: string, category: PhotoCategory): string {
  const categoryText: Record<PhotoCategory, string> = {
    screenshot: '截图 截屏 screenshot',
    document: '文档 文件 单据 document',
    travel: '旅行 旅游 travel',
    food: '美食 餐厅 food',
    pet: '宠物 猫 狗 pet',
    portrait: '人物 自拍 portrait',
    other: '照片 photo'
  };
  return `${filename} ${categoryText[category]}`.toLowerCase();
}

export function effectivePhotoBytes(photo: Pick<PhotoRecord, 'actualBytes' | 'estimatedBytes'>) {
  return photo.actualBytes ?? photo.estimatedBytes;
}

export function rankBestPhoto(items: PhotoRecord[]) {
  return [...items].sort((first, second) => {
    const resolution = second.width * second.height - first.width * first.height;
    if (resolution) return resolution;
    const bytes = effectivePhotoBytes(second) - effectivePhotoBytes(first);
    if (bytes) return bytes;
    const score = second.aiScore - first.aiScore;
    if (score) return score;
    return first.createdAt - second.createdAt;
  })[0] ?? null;
}

export function parseAISimilarityRecommendation(answer: string, count: number) {
  const json = answer.match(/\{[\s\S]*\}/)?.[0];
  try {
    const result = json ? JSON.parse(json) as { keep?: unknown; reason?: unknown } : null;
    if (!result || !Number.isInteger(result.keep) || Number(result.keep) < 1 || Number(result.keep) > count) throw new Error();
    return { keepIndex: Number(result.keep) - 1, reason: typeof result.reason === 'string' ? result.reason.slice(0, 120) : '' };
  } catch {
    throw new Error('AI 没有返回有效的保留建议，请重试。');
  }
}

export function averageColorDistance(first: string | null, second: string | null) {
  if (!first || !second || !/^#[0-9a-f]{6}$/i.test(first) || !/^#[0-9a-f]{6}$/i.test(second)) return null;
  const channels = (value: string) => [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
  const a = channels(first);
  const b = channels(second);
  return Math.sqrt(
    (a[0]! - b[0]!) ** 2 +
    (a[1]! - b[1]!) ** 2 +
    (a[2]! - b[2]!) ** 2
  );
}

export function findSimilarGroups(photos: PhotoRecord[], level: SimilarityLevel = 'balanced'): SimilarGroup[] {
  const profile = similarityProfiles[level];
  const sorted = [...photos]
    .filter((item) => item.status === 'active')
    .sort((a, b) => a.createdAt - b.createdAt);
  const groups: SimilarGroup[] = [];
  const used = new Set<string>();

  const appendGroup = (items: PhotoRecord[], kind: SimilarGroup['kind']) => {
    if (items.length < 2) return;
    items.forEach((item) => used.add(item.id));
    const best = rankBestPhoto(items)!;
    groups.push({ id: `${kind}-${items[0]!.id}`, kind, items, bestId: best.id });
  };

  // 只有原文件摘要一致才能标记为精确重复，视觉指纹一致仍属于相似照片。
  const exactHashes = new Map<string, PhotoRecord[]>();
  for (const photo of sorted) {
    if (!photo.exactHash) continue;
    const items = exactHashes.get(photo.exactHash) ?? [];
    items.push(photo);
    exactHashes.set(photo.exactHash, items);
  }
  for (const items of exactHashes.values()) appendGroup(items, 'exact');

  // 对同一段连拍使用 dHash 汉明距离识别近似构图。
  for (let index = 0; index < sorted.length; index += 1) {
    const photo = sorted[index]!;
    if (!photo.visualHash || used.has(photo.id)) continue;
    const bucket = [photo];
    for (let candidateIndex = index + 1; candidateIndex < sorted.length; candidateIndex += 1) {
      const candidate = sorted[candidateIndex]!;
      if (candidate.createdAt - photo.createdAt > profile.timeWindowMs) break;
      if (!candidate.visualHash || used.has(candidate.id)) continue;
      const firstRatio = photo.height ? photo.width / photo.height : 1;
      const secondRatio = candidate.height ? candidate.width / candidate.height : 1;
      const colorDistance = averageColorDistance(photo.averageColor, candidate.averageColor);
      const colorsMatch = colorDistance !== null && colorDistance <= profile.colorDistance;
      if (
        Math.abs(firstRatio - secondRatio) <= profile.ratioTolerance &&
        hammingDistance(photo.visualHash, candidate.visualHash) <= profile.hashDistance &&
        colorsMatch
      ) bucket.push(candidate);
    }
    appendGroup(bucket, 'similar');
  }

  // Expo Go / Web 没有本地原生模块时，保留原来的保守连拍规则。
  let fallbackBucket: PhotoRecord[] = [];
  const flushFallback = () => {
    appendGroup(fallbackBucket.filter((item) => !used.has(item.id)), 'similar');
    fallbackBucket = [];
  };
  for (const photo of sorted.filter((item) => !item.visualHash && !used.has(item.id))) {
    const previous = fallbackBucket[fallbackBucket.length - 1];
    if (!previous) {
      fallbackBucket = [photo];
      continue;
    }
    const closeInTime = photo.createdAt - previous.createdAt <= 5_000;
    const closeDimensions = Math.abs(photo.width - previous.width) <= 20 && Math.abs(photo.height - previous.height) <= 20;
    if (closeInTime && closeDimensions) fallbackBucket.push(photo);
    else {
      flushFallback();
      fallbackBucket = [photo];
    }
  }
  flushFallback();
  return groups;
}

export function hammingDistance(first: string, second: string): number {
  if (!/^[0-9a-f]{16}$/i.test(first) || !/^[0-9a-f]{16}$/i.test(second)) return Number.POSITIVE_INFINITY;
  let bits = BigInt(`0x${first}`) ^ BigInt(`0x${second}`);
  let distance = 0;
  while (bits) {
    bits &= bits - 1n;
    distance += 1;
  }
  return distance;
}

export const AI_IMPLEMENTATION_NOTE =
  '当前版本使用本地规则分类、基础质量估分和原生 dHash 视觉指纹。src/services/aiService.ts 保持为统一接口层，后续可替换为 ONNX Runtime、ML Kit 或 Apple Vision。';
