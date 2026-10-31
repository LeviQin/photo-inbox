import { create } from 'zustand';
import { Appearance, Platform } from 'react-native';
import type { MediaLibraryAssetsChangeEvent } from 'expo-media-library/legacy';
import {
  clearAllData,
  clearDatabase,
  changeDailyReviewProgress,
  getDailyReviewProgress,
  getDashboardStats,
  getAnalysisQueueCount,
  getOcrQueueCount,
  getLastScanAt,
  getAppearanceMode,
  getPhotoPage,
  getReviewPreferences,
  getReviewSession,
  restoreAllPhotoStatuses,
  restorePhotoStatuses,
  setDailyReviewTarget,
  setAppearanceMode as saveAppearanceMode,
  setGalleryColumns,
  setManyFavorites,
  setManyPhotoStatus,
  setPhotoStatus,
  setSimilarityLevel
} from '@/db/database';
import type { AppearanceMode } from '@/db/database';
import { indexPhotoLibrary, seedDemoLibrary } from '@/services/photoIndexer';
import { getPhotoPermissionState } from '@/services/photoPermissionService';
import { processPendingPhotoAnalysis } from '@/services/visualHashService';
import { processPendingPhotoOcr } from '@/services/localOcrService';
import { registerAnalysisBackgroundTask } from '@/services/backgroundAnalysisService';
import type {
  DashboardStats,
  PhotoPermissionState,
  PhotoRecord,
  PhotoStatus,
  ReviewPreferences,
  ReviewSession,
  ReviewTarget,
  SimilarityLevel
} from '@/types/photo';

const emptyStats: DashboardStats = {
  total: 0,
  active: 0,
  pending: 0,
  kept: 0,
  trashed: 0,
  screenshots: 0,
  categoryCounts: { screenshot: 0, document: 0, travel: 0, food: 0, pet: 0, portrait: 0, other: 0 },
  analysisPending: 0,
  estimatedBytes: 0,
  storageBytes: 0,
  measuredBytes: 0,
  measuredCount: 0,
  measuredTrashedCount: 0,
  sizeCoverage: 0,
  reclaimableBytes: 0
};

const defaultReviewPreferences: ReviewPreferences = {
  dailyTarget: 50,
  similarityLevel: 'balanced',
  galleryColumns: 3
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
  dailyReviewed: number;
  reviewPreferences: ReviewPreferences;
  activeReviewSession: ReviewSession | null;
  dataRevision: number;
  permission: PhotoPermissionState;
  appearanceMode: AppearanceMode;
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  scan: (options?: { passive?: boolean; changes?: MediaLibraryAssetsChangeEvent }) => Promise<void>;
  useDemo: () => Promise<void>;
  changeStatus: (id: string, status: PhotoStatus) => Promise<void>;
  changeManyStatus: (ids: string[], status: PhotoStatus) => Promise<void>;
  restorePhotos: (ids: string[]) => Promise<void>;
  restoreAllPhotos: () => Promise<void>;
  setFavorites: (ids: string[], favorite: boolean) => Promise<void>;
  recordDailyReview: (delta: number) => Promise<void>;
  refreshReviewState: () => Promise<void>;
  setDailyTarget: (target: ReviewTarget) => Promise<void>;
  setSimilarity: (level: SimilarityLevel) => Promise<void>;
  setAppearanceMode: (mode: AppearanceMode) => Promise<void>;
  setGalleryDensity: (columns: 3 | 4 | 5) => Promise<void>;
  reset: () => Promise<void>;
  refreshPermission: () => Promise<void>;
  resumeAnalysis: () => Promise<void>;
};

const noPermission: PhotoPermissionState = { granted: false, canAskAgain: true, accessPrivileges: 'none' };
let analysisTimer: ReturnType<typeof setTimeout> | null = null;
let scanQueue: Promise<void> = Promise.resolve();

function enqueueLibraryWork(work: () => Promise<void>) {
  scanQueue = scanQueue.then(work, work);
  return scanQueue;
}

export const useAppStore = create<Store>((set, get) => ({
  photos: [],
  stats: emptyStats,
  loading: false,
  indexing: false,
  progress: 0,
  error: null,
  initialized: false,
  demoMode: false,
  dailyReviewed: 0,
  reviewPreferences: defaultReviewPreferences,
  activeReviewSession: null,
  dataRevision: 0,
  permission: noPermission,
  appearanceMode: 'system',

  initialize: async () => {
    if (get().initialized) return;
    set({ loading: true, error: null });
    try {
      const [{ items: photos }, stats, dailyReviewed, permission, reviewPreferences, activeReviewSession, appearanceMode] = await Promise.all([
        getPhotoPage({ status: 'all', limit: 120 }),
        getDashboardStats(),
        getDailyReviewProgress(),
        getPhotoPermissionState(),
        getReviewPreferences(),
        getReviewSession(),
        getAppearanceMode()
      ]);
      Appearance.setColorScheme?.(appearanceMode === 'system' ? 'unspecified' : appearanceMode);
      set({
        photos,
        stats,
        dailyReviewed,
        permission,
        reviewPreferences,
        activeReviewSession,
        appearanceMode,
        initialized: true,
        demoMode: photos.some((p) => p.id.startsWith('demo-'))
      });
      void registerAnalysisBackgroundTask().catch(() => false);
      void get().resumeAnalysis().catch(() => undefined);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '初始化失败' });
    } finally {
      set({ loading: false });
    }
  },

  refresh: async () => {
    const [{ items: photos }, stats, dailyReviewed, reviewPreferences, activeReviewSession] = await Promise.all([
      getPhotoPage({ status: 'all', limit: 120 }),
      getDashboardStats(),
      getDailyReviewProgress(),
      getReviewPreferences(),
      getReviewSession()
    ]);
    set((state) => ({
      photos,
      stats,
      dailyReviewed,
      reviewPreferences,
      activeReviewSession,
      demoMode: photos.some((p) => p.id.startsWith('demo-')),
      dataRevision: state.dataRevision + 1
    }));
  },

  scan: (options) => {
    if (!options?.passive && get().indexing) return scanQueue;
    if (!options?.passive) set({ indexing: true });
    const work = async () => {
      try {
        if (options?.passive) {
          if (Platform.OS === 'web' || !get().initialized || get().demoMode) return;
          await get().refreshPermission();
          if (!get().permission.granted || (!get().stats.total && !(await getLastScanAt()))) return;
        }
        set({ indexing: true, progress: 0, error: null });
        const result = await indexPhotoLibrary({
          onProgress: (progress) => set({ progress }),
          requestPermission: !options?.passive,
          restart: options?.passive,
          changes: options?.changes
        });
        if (!result.granted && !options?.passive) {
          set({ error: '没有获得系统相册权限。请在设置中允许访问后重试。' });
        }
        await get().refreshPermission();
        await get().refresh();
        void get().resumeAnalysis().catch(() => undefined);
      } catch (error) {
        set({ error: error instanceof Error ? error.message : '扫描相册失败' });
      } finally {
        set({ indexing: false });
      }
    };
    return enqueueLibraryWork(work);
  },

  useDemo: async () => {
    set({ loading: true, error: null });
    return enqueueLibraryWork(async () => {
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
    });
  },

  changeStatus: async (id, status) => {
    await setPhotoStatus(id, status);
    const stats = await getDashboardStats();
    set((state) => ({
      photos: state.photos.map((photo) => photo.id === id ? { ...photo, status } : photo),
      stats,
      dataRevision: state.dataRevision + 1
    }));
  },

  changeManyStatus: async (ids, status) => {
    await setManyPhotoStatus(ids, status);
    const changed = new Set(ids);
    const stats = await getDashboardStats();
    set((state) => ({
      photos: state.photos.map((photo) => changed.has(photo.id) ? { ...photo, status } : photo),
      stats,
      dataRevision: state.dataRevision + 1
    }));
  },

  restorePhotos: async (ids) => {
    await restorePhotoStatuses(ids);
    await get().refresh();
  },

  restoreAllPhotos: async () => {
    await restoreAllPhotoStatuses();
    await get().refresh();
  },

  setFavorites: async (ids, favorite) => {
    await setManyFavorites(ids, favorite);
    await get().refresh();
  },

  recordDailyReview: async (delta) => {
    const dailyReviewed = await changeDailyReviewProgress(delta);
    set({ dailyReviewed });
  },

  refreshReviewState: async () => {
    const [dailyReviewed, reviewPreferences, activeReviewSession] = await Promise.all([
      getDailyReviewProgress(),
      getReviewPreferences(),
      getReviewSession()
    ]);
    set({ dailyReviewed, reviewPreferences, activeReviewSession });
  },

  setDailyTarget: async (target) => {
    await setDailyReviewTarget(target);
    set((state) => ({ reviewPreferences: { ...state.reviewPreferences, dailyTarget: target } }));
  },

  setSimilarity: async (level) => {
    await setSimilarityLevel(level);
    set((state) => ({ reviewPreferences: { ...state.reviewPreferences, similarityLevel: level } }));
  },

  setAppearanceMode: async (mode) => {
    await saveAppearanceMode(mode);
    Appearance.setColorScheme?.(mode === 'system' ? 'unspecified' : mode);
    set({ appearanceMode: mode });
  },

  setGalleryDensity: async (columns) => {
    await setGalleryColumns(columns);
    set((state) => ({ reviewPreferences: { ...state.reviewPreferences, galleryColumns: columns } }));
  },

  reset: () => enqueueLibraryWork(async () => {
    await clearAllData();
    Appearance.setColorScheme?.('unspecified');
    set((state) => ({
      photos: [],
      stats: emptyStats,
      dailyReviewed: 0,
      reviewPreferences: defaultReviewPreferences,
      appearanceMode: 'system',
      activeReviewSession: null,
      initialized: true,
      demoMode: false,
      error: null,
      dataRevision: state.dataRevision + 1
    }));
  }),

  refreshPermission: async () => {
    const permission = await getPhotoPermissionState();
    set({ permission });
  },

  resumeAnalysis: async () => {
    try {
      const [visualProcessed, ocrProcessed] = await Promise.all([
        processPendingPhotoAnalysis({ maxItems: 40 }),
        processPendingPhotoOcr(8)
      ]);
      const processed = visualProcessed + ocrProcessed;
      if (processed > 0) {
        await get().refresh();
        if ((await getAnalysisQueueCount()) + (await getOcrQueueCount()) > 0 && !analysisTimer) {
          analysisTimer = setTimeout(() => {
            analysisTimer = null;
            void get().resumeAnalysis();
          }, 300);
        }
      }
    } catch {
      // 队列持久化保留，下一次前台唤醒或系统后台任务会继续。
    }
  }
}));
