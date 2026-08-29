import { create } from 'zustand';
import {
  clearAllData,
  clearDatabase,
  getDashboardStats,
  getPhotos,
  setManyPhotoStatus,
  setPhotoStatus
} from '@/db/database';
import { indexPhotoLibrary, seedDemoLibrary } from '@/services/photoIndexer';
import type { DashboardStats, PhotoRecord, PhotoStatus } from '@/types/photo';

const emptyStats: DashboardStats = {
  total: 0,
  active: 0,
  kept: 0,
  trashed: 0,
  screenshots: 0,
  estimatedBytes: 0,
  reclaimableBytes: 0
};

type Store = {
  photos: PhotoRecord[];
  stats: DashboardStats;
  loading: boolean;
  indexing: boolean;
  progress: number;
  error: string | null;
  initialized: boolean;
  demoMode: boolean;
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  scan: () => Promise<void>;
  useDemo: () => Promise<void>;
  changeStatus: (id: string, status: PhotoStatus) => Promise<void>;
  changeManyStatus: (ids: string[], status: PhotoStatus) => Promise<void>;
  reset: () => Promise<void>;
};

export const useAppStore = create<Store>((set, get) => ({
  photos: [],
  stats: emptyStats,
  loading: false,
  indexing: false,
  progress: 0,
  error: null,
  initialized: false,
  demoMode: false,

  initialize: async () => {
    if (get().initialized) return;
    set({ loading: true, error: null });
    try {
      const photos = await getPhotos({ status: 'all', limit: 5000 });
      const stats = await getDashboardStats();
      set({ photos, stats, initialized: true, demoMode: photos.some((p) => p.id.startsWith('demo-')) });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '初始化失败' });
    } finally {
      set({ loading: false });
    }
  },

  refresh: async () => {
    const photos = await getPhotos({ status: 'all', limit: 5000 });
    const stats = await getDashboardStats();
    set({ photos, stats, demoMode: photos.some((p) => p.id.startsWith('demo-')) });
  },

  scan: async () => {
    set({ indexing: true, progress: 0, error: null });
    try {
      const result = await indexPhotoLibrary({
        maxAssets: 5000,
        onProgress: (progress) => set({ progress })
      });
      if (!result.granted) {
        set({ error: '没有获得系统相册权限。你可以使用演示数据预览全部功能。' });
      }
      await get().refresh();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '扫描相册失败' });
    } finally {
      set({ indexing: false });
    }
  },

  useDemo: async () => {
    set({ loading: true, error: null });
    try {
      await clearDatabase();
      await seedDemoLibrary();
      await get().refresh();
      set({ initialized: true, demoMode: true });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '生成演示数据失败' });
    } finally {
      set({ loading: false });
    }
  },

  changeStatus: async (id, status) => {
    await setPhotoStatus(id, status);
    await get().refresh();
  },

  changeManyStatus: async (ids, status) => {
    await setManyPhotoStatus(ids, status);
    await get().refresh();
  },

  reset: async () => {
    await clearAllData();
    set({ photos: [], stats: emptyStats, initialized: true, demoMode: false, error: null });
  }
}));
