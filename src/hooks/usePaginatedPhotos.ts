import { useCallback, useEffect, useRef, useState } from 'react';
import { getPhotoPage } from '@/db/database';
import { buildSearchPlan, expandSearchPlan } from '@/services/searchService';
import { useAppStore } from '@/store/useAppStore';
import type { PhotoCategory, PhotoCursor, PhotoRecord, PhotoStatus } from '@/types/photo';

type Options = {
  status?: PhotoStatus | 'available' | 'all';
  category?: PhotoCategory;
  before?: number;
  query?: string;
  queryTerms?: string[] | null;
  pageSize?: number;
};

export function usePaginatedPhotos({ status = 'all', category, before, query = '', queryTerms = null, pageSize = 120 }: Options) {
  const revision = useAppStore((state) => state.dataRevision);
  const [items, setItems] = useState<PhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<PhotoCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (nextCursor: PhotoCursor | null, append: boolean) => {
    const currentGeneration = generation.current;
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const page = await getPhotoPage({
        status,
        category,
        before,
        search: query.trim() ? (queryTerms
          ? expandSearchPlan(buildSearchPlan(query), queryTerms)
          : buildSearchPlan(query)) : undefined,
        cursor: nextCursor,
        limit: pageSize
      });
      if (currentGeneration !== generation.current) return;
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setCursor(page.nextCursor);
      setHasMore(page.nextCursor !== null);
    } catch (cause) {
      if (currentGeneration === generation.current) setError(cause instanceof Error ? cause.message : '读取照片失败');
    } finally {
      if (currentGeneration === generation.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [before, category, pageSize, query, queryTerms, status]);

  const refresh = useCallback(async () => {
    generation.current += 1;
    setCursor(null);
    await load(null, false);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!cursor || loading || loadingMore) return;
    void load(cursor, true);
  }, [cursor, load, loading, loadingMore]);

  useEffect(() => { void refresh(); }, [refresh, revision]);

  return { items, loading, loadingMore, hasMore, error, refresh, loadMore };
}
