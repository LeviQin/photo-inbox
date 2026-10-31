import type { PhotoRecord } from '@/types/photo';

export type SearchPlan = {
  tokens: string[];
  tokenMatch?: 'all' | 'any';
  tokenGroups?: string[][];
  categoryTokens?: string[];
  startAt: number | null;
  endAt: number | null;
  minBytes: number | null;
};

export function explainSearchHit(photo: Pick<PhotoRecord, 'filename' | 'category' | 'searchText' | 'aiDescription'> & {
  ocrText: string | null;
}, plan: SearchPlan) {
  const token = (text: string | null) => plan.tokens.find((item) => text?.toLowerCase().includes(item.toLowerCase()));
  const snippet = (text: string, match: string) => {
    const position = text.toLowerCase().indexOf(match.toLowerCase());
    const start = Math.max(0, position - 18);
    const end = Math.min(text.length, position + match.length + 36);
    return `${start ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`;
  };
  const ocrToken = token(photo.ocrText);
  if (ocrToken && photo.ocrText) return { label: '图片文字', snippet: snippet(photo.ocrText, ocrToken) };
  const descriptionToken = token(photo.aiDescription);
  if (descriptionToken && photo.aiDescription) return { label: '已保存的 AI 描述', snippet: snippet(photo.aiDescription, descriptionToken) };
  const filenameToken = token(photo.filename);
  if (filenameToken) return { label: '文件名', snippet: photo.filename };
  if (token(photo.searchText) || token(photo.category)) return { label: '分类', snippet: null };
  if (plan.minBytes !== null) return { label: '大文件', snippet: null };
  return { label: '拍摄时间', snippet: null };
}

export function parseAISearchTerms(answer: string) {
  const json = answer.match(/\[[\s\S]*\]/)?.[0];
  let candidates: unknown;
  try { candidates = json ? JSON.parse(json) : answer.split(/[，,、\n]+/); }
  catch { candidates = answer.split(/[，,、\n]+/); }
  if (!Array.isArray(candidates)) throw new Error('AI 没有返回可用的搜索关键词，请重试。');
  const terms = [...new Set(candidates
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().replace(/[^\p{L}\p{N}_ -]/gu, '').trim())
    .filter((value) => value.length > 0 && value.length <= 32))].slice(0, 5);
  if (!terms.length) throw new Error('AI 没有找到可用于本地索引的关键词。');
  return terms;
}

function normalizedTokens(query: string) {
  const replacements: Array<[RegExp, string]> = [
    [/截图|截屏|屏幕截图|\bscreenshot\b|\bscreen\s*shot\b/gi, 'screenshot'],
    [/文档|票据|单据|发票|收据|\bdocument\b|\binvoice\b|\breceipt\b/gi, 'document'],
    [/旅行|旅游|旅拍|风景|\btravel\b|\btrip\b|\bvacation\b/gi, 'travel'],
    [/美食|吃饭|餐厅|食物|\bfood\b|\bmeal\b|\brestaurant\b/gi, 'food'],
    [/猫|狗|宠物|\bcat\b|\bdog\b|\bkitten\b|\bpuppy\b/gi, 'pet'],
    [/自拍|人物|人像|\bportrait\b|\bselfie\b/gi, 'portrait']
  ];
  const text = query.toLowerCase().trim()
    .replace(/去年|今年|最近\s*\d+\s*天|最近|近期|大文件|我的?|图片|照片|张|的|在|拍摄|拍的|拍/gi, ' ')
    .replace(/(?:^|[^\d])((?:19|20)\d{2})年?(?=$|[^\d])/g, ' ')
    .replace(/\bscreen\s*shot\b/gi, 'screenshot')
    .replace(/\bmy\b/gi, ' ')
    .replace(/(^|\s)(屏幕截图|截图|截屏|文档)(?=\S)/g, '$1$2 ');
  const categoryTokens = new Set<string>();
  const textGroups: string[][] = [];
  for (const token of new Set(text.split(/[\s,，、;；|+＋]+/).filter(Boolean))) {
    const alias = replacements.find(([pattern]) => new RegExp(`^(?:${pattern.source})$`, 'i').test(token));
    if (alias) {
      categoryTokens.add(token);
      categoryTokens.add(alias[1]);
    } else {
      textGroups.push([token]);
    }
  }
  const categories = [...categoryTokens];
  const tokenGroups = [...(categories.length ? [categories] : []), ...textGroups];
  return { tokens: tokenGroups.flat(), tokenGroups, categoryTokens: categories };
}

export function expandSearchPlan(plan: SearchPlan, terms: string[]): SearchPlan {
  const categoryTokens = plan.categoryTokens ?? [];
  const tokenGroups = [...(categoryTokens.length ? [categoryTokens] : []), terms];
  return { ...plan, tokens: tokenGroups.flat(), tokenGroups, tokenMatch: 'any' };
}

export function buildSearchPlan(query: string, nowTimestamp = Date.now()): SearchPlan {
  const now = new Date(nowTimestamp);
  const wantsLastYear = /去年/.test(query);
  const wantsThisYear = /今年/.test(query);
  const explicitYear = query.match(/(?:^|[^\d])((?:19|20)\d{2})年?(?=$|[^\d])/);
  const recentDaysMatch = query.match(/最近\s*(\d+)\s*天/);
  const recentDays = recentDaysMatch ? Math.max(1, Number(recentDaysMatch[1])) : /最近|近期/.test(query) ? 30 : null;
  const minBytes = /大文件/.test(query) ? 10 * 1024 * 1024 : null;
  const year = wantsLastYear ? now.getFullYear() - 1 : wantsThisYear ? now.getFullYear() : explicitYear ? Number(explicitYear[1]) : null;
  const tokenMatch = 'any';
  if (recentDays) return { ...normalizedTokens(query), tokenMatch, startAt: nowTimestamp - recentDays * 86_400_000, endAt: null, minBytes };
  if (year !== null) {
    return {
      ...normalizedTokens(query),
      tokenMatch,
      startAt: new Date(year, 0, 1).getTime(),
      endAt: new Date(year + 1, 0, 1).getTime(),
      minBytes
    };
  }
  return { ...normalizedTokens(query), tokenMatch, startAt: null, endAt: null, minBytes };
}

export function localSemanticSearch(photos: Array<PhotoRecord & { ocrText?: string | null }>, query: string, nowTimestamp = Date.now()) {
  const { tokens, tokenGroups, startAt, endAt, minBytes } = buildSearchPlan(query, nowTimestamp);

  if (!tokens.length && startAt === null && endAt === null && minBytes === null) return photos;

  return photos
    .map((photo) => {
      const haystack = `${photo.filename} ${photo.searchText} ${photo.category} ${photo.ocrText ?? ''} ${photo.aiDescription ?? ''}`.toLowerCase();
      const matchesTokens = tokenGroups!.every((group) => group.some((token) => haystack.includes(token)));
      const matchesStart = startAt === null || photo.createdAt >= startAt;
      const matchesEnd = endAt === null || photo.createdAt < endAt;
      const matchesSize = minBytes === null || (photo.actualBytes ?? photo.estimatedBytes) >= minBytes;
      if (!matchesTokens || !matchesStart || !matchesEnd || !matchesSize) return null;

      let score = tokens.filter((token) => haystack.includes(token)).length * 5;
      if (query.trim() && haystack.includes(query.trim().toLowerCase())) score += 8;
      if (startAt !== null || endAt !== null) score += 4;
      if (photo.favorite) score += 0.5;
      return { photo, score };
    })
    .filter((item): item is { photo: PhotoRecord; score: number } => item !== null)
    .sort((a, b) => b.score - a.score || b.photo.createdAt - a.photo.createdAt)
    .map((item) => item.photo);
}
