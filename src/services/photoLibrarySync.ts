import * as MediaLibrary from 'expo-media-library/legacy';
import { AppState, Platform } from 'react-native';
import { invalidatePhotoLibraryScan } from '@/services/photoIndexer';

export function watchPhotoLibrary(sync: (changes?: MediaLibrary.MediaLibraryAssetsChangeEvent) => Promise<void>) {
  if (Platform.OS === 'web') return () => undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let running = false;
  let pending = false;
  let fullScan = false;
  const upserts = new Map<string, MediaLibrary.Asset>();
  const deleted = new Map<string, MediaLibrary.Asset>();

  const flush = async () => {
    timer = null;
    if (disposed || running || AppState.currentState !== 'active') return;
    const changes = fullScan ? undefined : {
      hasIncrementalChanges: true,
      insertedAssets: [...upserts.values()],
      updatedAssets: [],
      deletedAssets: [...deleted.values()]
    };
    pending = false;
    fullScan = false;
    upserts.clear();
    deleted.clear();
    running = true;
    try {
      await sync(changes);
    } catch {
      // Store 显示同步错误；下次回到前台会重新校验。
    } finally {
      running = false;
      if (pending && !disposed) timer = setTimeout(() => void flush(), 750);
    }
  };

  const schedule = (changes?: MediaLibrary.MediaLibraryAssetsChangeEvent) => {
    if (disposed) return;
    pending = true;
    if (!changes?.hasIncrementalChanges) {
      fullScan = true;
      upserts.clear();
      deleted.clear();
    } else if (!fullScan) {
      for (const asset of [...(changes.insertedAssets ?? []), ...(changes.updatedAssets ?? [])]) {
        upserts.set(asset.id, asset);
        deleted.delete(asset.id);
      }
      for (const asset of changes.deletedAssets ?? []) {
        deleted.set(asset.id, asset);
        upserts.delete(asset.id);
      }
    }
    if (timer) clearTimeout(timer);
    if (!running) timer = setTimeout(() => void flush(), 750);
  };

  const librarySubscription = MediaLibrary.addListener((changes) => {
    invalidatePhotoLibraryScan();
    schedule(changes);
  });
  const appSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') schedule();
  });
  schedule();

  return () => {
    if (disposed) return;
    disposed = true;
    if (timer) clearTimeout(timer);
    librarySubscription.remove();
    appSubscription.remove();
  };
}
