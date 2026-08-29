import type { PhotoRecord } from '@/types/photo';

function normalizedTokens(query: string) {
  const replacements: Array<[RegExp, string]> = [
    [/截屏|截图/gi, 'screenshot'],
    [/文档|票据|单据/gi, 'document'],
    [/旅行|旅游/gi, 'travel'],
    [/美食|吃饭|餐厅/gi, 'food'],
    [/猫|狗|宠物/gi, 'pet'],
    [/自拍|人物|人像/gi, 'portrait']
  ];
  let text = query.toLowerCase().trim().replace(/去年|今年|最近|我的?|图片|照片|的|在|拍摄|拍的|拍/gi, ' ');
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, ` ${replacement} `);
  return text.split(/\s+/).filter(Boolean);
}

export function localSemanticSearch(photos: PhotoRecord[], query: string) {
  const tokens = normalizedTokens(query);
  const now = new Date();
  const wantsLastYear = /去年/.test(query);
  const wantsThisYear = /今年/.test(query);

  if (!tokens.length && !wantsLastYear && !wantsThisYear) return photos;

  return photos
    .map((photo) => {
      const haystack = `${photo.searchText} ${photo.category}`.toLowerCase();
      const year = new Date(photo.createdAt).getFullYear();
      const matchesTokens = tokens.every((token) => haystack.includes(token));
      const matchesLastYear = !wantsLastYear || year === now.getFullYear() - 1;
      const matchesThisYear = !wantsThisYear || year === now.getFullYear();
      if (!matchesTokens || !matchesLastYear || !matchesThisYear) return null;

      let score = tokens.length * 5;
      if (wantsLastYear || wantsThisYear) score += 4;
      if (photo.favorite) score += 0.5;
      return { photo, score };
    })
    .filter((item): item is { photo: PhotoRecord; score: number } => item !== null)
    .sort((a, b) => b.score - a.score || b.photo.createdAt - a.photo.createdAt)
    .map((item) => item.photo);
}
