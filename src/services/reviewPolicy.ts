import type { ReviewSource } from '@/types/photo';

export type ReviewDecisionItem = {
  photoId: string;
  position: number;
  decision: 'kept' | 'trashed' | null;
  decidedAt: number | null;
};

export function canDecideReviewTarget(sessionActive: boolean, target: { decision: string | null; status: string } | null) {
  return sessionActive && target !== null && target.decision === null && target.status === 'active';
}

export function reviewDayKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function nextDailyReviewProgress(currentDate: string | undefined, currentCount: number, delta: number, timestamp: number) {
  const date = reviewDayKey(timestamp);
  const baseline = currentDate === date ? Math.max(0, currentCount || 0) : 0;
  return { date, count: Math.max(0, baseline + delta) };
}

export function buildReviewSourceQuery(source: ReviewSource, sourceValue: string | null, now: number) {
  const clauses = ["status = 'active'"];
  const params: Array<string | number> = [];
  let orderBy = 'created_at DESC, id DESC';
  if (source === 'screenshot') clauses.push("category = 'screenshot'");
  if (source === 'large') {
    clauses.push('COALESCE(actual_bytes, estimated_bytes) >= ?');
    params.push(10 * 1024 * 1024);
    orderBy = 'COALESCE(actual_bytes, estimated_bytes) DESC, created_at DESC, id DESC';
  }
  if (source === 'recent') {
    clauses.push('created_at >= ?');
    params.push(now - 30 * 24 * 60 * 60 * 1000);
  }
  if (source === 'year') {
    const year = Number(sourceValue);
    if (!Number.isInteger(year) || year < 1970 || year > 3000) throw new Error('invalid_review_year');
    clauses.push('created_at >= ?', 'created_at < ?');
    params.push(new Date(year, 0, 1).getTime(), new Date(year + 1, 0, 1).getTime());
  }
  return { where: clauses.join(' AND '), orderBy, params };
}

export function applyReviewDecision(items: ReviewDecisionItem[], photoId: string, decision: 'kept' | 'trashed', timestamp: number) {
  const target = items.find((item) => item.photoId === photoId);
  if (!target || target.decision !== null) throw new Error('review_item_unavailable');
  const nextItems = items.map((item) => item.photoId === photoId ? { ...item, decision, decidedAt: timestamp } : item);
  return { items: nextItems, completed: nextItems.every((item) => item.decision !== null) };
}

export function undoLatestReviewDecision(items: ReviewDecisionItem[]) {
  const target = [...items]
    .filter((item) => item.decision !== null)
    .sort((first, second) => (second.decidedAt ?? 0) - (first.decidedAt ?? 0) || second.position - first.position)[0];
  if (!target) return { items, restoredId: null };
  return {
    items: items.map((item) => item.photoId === target.photoId ? { ...item, decision: null, decidedAt: null } : item),
    restoredId: target.photoId
  };
}
