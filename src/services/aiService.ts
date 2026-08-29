import type { PhotoCategory, PhotoRecord, SimilarGroup } from '@/types/photo';

function textIncludes(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

export function classifyPhoto(filename: string, width: number, height: number): PhotoCategory {
  const name = filename.toLowerCase();
  if (textIncludes(name, ['screenshot', '截屏', '截图', 'screen_shot'])) return 'screenshot';
  if (textIncludes(name, ['invoice', 'receipt', 'scan', 'document', 'pdf'])) return 'document';
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

export function findSimilarGroups(photos: PhotoRecord[]): SimilarGroup[] {
  const sorted = [...photos]
    .filter((item) => item.status === 'active')
    .sort((a, b) => a.createdAt - b.createdAt);
  const groups: SimilarGroup[] = [];
  let bucket: PhotoRecord[] = [];

  const flush = () => {
    if (bucket.length >= 2) {
      const best = [...bucket].sort((a, b) => b.aiScore - a.aiScore)[0]!;
      groups.push({ id: `similar-${bucket[0]!.id}`, items: bucket, bestId: best.id });
    }
    bucket = [];
  };

  for (const photo of sorted) {
    const prev = bucket[bucket.length - 1];
    if (!prev) {
      bucket = [photo];
      continue;
    }
    const closeInTime = Math.abs(photo.createdAt - prev.createdAt) <= 5_000;
    const closeDimensions = Math.abs(photo.width - prev.width) <= 20 && Math.abs(photo.height - prev.height) <= 20;
    if (closeInTime && closeDimensions) bucket.push(photo);
    else {
      flush();
      bucket = [photo];
    }
  }
  flush();
  return groups;
}

export const AI_IMPLEMENTATION_NOTE =
  'V1.0.0 默认使用本地启发式分类与质量评分。src/services/aiService.ts 已作为统一接口层，后续可替换为 ONNX Runtime、ML Kit 或 Apple Vision。';
