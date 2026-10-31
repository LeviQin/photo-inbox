import { buildSearchText } from '@/services/aiService';
import type { PhotoRecord } from '@/types/photo';

export function createDemoPhotos(count = 36): PhotoRecord[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => {
    const category = 'other';
    const filename = `demo-${String(index + 1).padStart(3, '0')}.jpg`;
    const width = index % 4 === 0 ? 1170 : 3024;
    const height = index % 4 === 0 ? 2532 : 4032;
    return {
      id: `demo-${index + 1}`,
      assetId: `demo-asset-${index + 1}`,
      uri: `https://picsum.photos/seed/photo-inbox-${index + 1}/900/1200`,
      filename,
      width,
      height,
      createdAt: now - index * 1000 * 60 * 60 * 12,
      modifiedAt: now - index * 1000 * 60 * 60 * 12,
      category,
      status: 'active',
      favorite: index % 9 === 0,
      aiScore: 70 + ((index * 7) % 27),
      visualHash: null,
      averageColor: null,
      exactHash: null,
      actualBytes: null,
      analysisVersion: 0,
      estimatedBytes: Math.round(width * height * 0.18),
      searchText: buildSearchText(filename, category),
      aiDescription: null
    };
  });
}
