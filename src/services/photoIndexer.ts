import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform } from 'react-native';
import { buildSearchText, classifyPhoto, getQualityScore } from '@/services/aiService';
import { createDemoPhotos } from '@/services/demoData';
import { estimatePhotoBytes } from '@/utils/format';
import { isVisualHashAvailable, processPendingPhotoAnalysis } from '@/services/visualHashService';
import type { PhotoRecord } from '@/types/photo';
import {
  beginFreshScan,
  completeScan,
  enqueuePhotoAnalysis,
  enqueuePhotoOcr,
  getAppSettings,
  getPhotoAnalysisStates,
  getScanCheckpoint,
  recordScanPage,
  removeDemoPhotos,
  removePhotoRowsByAssetIds,
  upsertPhotos
} from '@/db/database';
import { ensurePhotoPermission, getPhotoPermissionState } from '@/services/photoPermissionService';
import { resolvePhotoCreatedAt, shouldQueuePhotoAnalysis } from '@/services/indexingPolicy';
import { isDeletedAssetError, isDeletionCancelled, partitionDeletionResult } from '@/services/deletionPolicy';

export type IndexResult = {
  granted: boolean;
  indexed: number;
  demo: boolean;
};

let libraryRevision = 0;

export function invalidatePhotoLibraryScan() {
  libraryRevision += 1;
}

function assetToPhoto(asset: MediaLibrary.Asset, settings: Awaited<ReturnType<typeof getAppSettings>>): PhotoRecord {
  const category = settings.autoClassify ? classifyPhoto(asset.filename ?? '', asset.width, asset.height) : 'other';
  const base = {
    width: asset.width,
    height: asset.height,
    filename: asset.filename ?? `photo-${asset.id}`
  };
  return {
    id: asset.id,
    assetId: asset.id,
    uri: asset.uri,
    filename: base.filename,
    width: asset.width,
    height: asset.height,
    createdAt: resolvePhotoCreatedAt(asset.creationTime, asset.modificationTime),
    modifiedAt: asset.modificationTime,
    category,
    status: 'active',
    favorite: false,
    aiScore: settings.localAI ? getQualityScore(base) : 0,
    visualHash: null,
    averageColor: null,
    exactHash: null,
    actualBytes: null,
    analysisVersion: 0,
    estimatedBytes: estimatePhotoBytes(asset.width, asset.height),
    searchText: settings.searchIndex ? buildSearchText(base.filename, category) : '',
    aiDescription: null
  };
}

async function indexAssetPage(assets: MediaLibrary.Asset[], settings: Awaited<ReturnType<typeof getAppSettings>>) {
  const assetIds = assets.map((asset) => asset.id);
  const existing = await getPhotoAnalysisStates(assetIds);
  const photos = assets.map((asset) => {
    const photo = assetToPhoto(asset, settings);
    const state = existing.get(asset.id);
    if (!state || state.modifiedAt !== asset.modificationTime) return photo;
    const category = state.categorySource === 'manual' ? state.category : photo.category;
    return {
      ...photo,
      category,
      searchText: settings.searchIndex ? buildSearchText(photo.filename, category) : '',
      visualHash: state.visualHash,
      averageColor: state.averageColor,
      exactHash: state.exactHash,
      actualBytes: state.actualBytes,
      analysisVersion: state.analysisVersion
    };
  });
  await upsertPhotos(photos);
  await enqueuePhotoOcr(
    assetIds,
    assets.filter((asset) => {
      const state = existing.get(asset.id);
      return Boolean(state && state.modifiedAt !== asset.modificationTime);
    }).map((asset) => asset.id)
  );
  if (isVisualHashAvailable()) {
    const changedIds = photos
      .filter((photo) => {
        const state = existing.get(photo.assetId);
        return shouldQueuePhotoAnalysis(state, photo.modifiedAt);
      })
      .map((photo) => photo.assetId);
    await enqueuePhotoAnalysis(changedIds);
  }
}

export async function indexPhotoLibrary(options?: {
  onProgress?: (indexed: number) => void;
  requestPermission?: boolean;
  restart?: boolean;
  changes?: MediaLibrary.MediaLibraryAssetsChangeEvent;
}): Promise<IndexResult> {
  const permission = options?.requestPermission === false ? await getPhotoPermissionState() : await ensurePhotoPermission();
  if (!permission.granted) return { granted: false, indexed: 0, demo: false };

  const batchSize = 150;
  const settings = await getAppSettings();
  await removeDemoPhotos();
  let checkpoint = await getScanCheckpoint();
  const changes = options?.changes;
  if (changes?.hasIncrementalChanges && !checkpoint) {
    const deletedIds = new Set((changes.deletedAssets ?? []).map((asset) => asset.id));
    const assets = [...new Map([...(changes.insertedAssets ?? []), ...(changes.updatedAssets ?? [])]
      .filter((asset) => asset.mediaType === MediaLibrary.MediaType.photo && !deletedIds.has(asset.id))
      .map((asset) => [asset.id, asset])).values()];
    for (let offset = 0; offset < assets.length; offset += batchSize) {
      await indexAssetPage(assets.slice(offset, offset + batchSize), settings);
    }
    await removePhotoRowsByAssetIds([...deletedIds]);
    return { granted: true, indexed: assets.length, demo: false };
  }
  if (!checkpoint || options?.restart || changes) {
    await beginFreshScan();
    checkpoint = { after: undefined, indexed: 0 };
  }
  let after = checkpoint.after;
  let indexed = checkpoint.indexed;
  let restarted = false;
  let scanRevision = libraryRevision;
  while (true) {
    if (scanRevision !== libraryRevision) {
      await beginFreshScan();
      after = undefined;
      indexed = 0;
      scanRevision = libraryRevision;
    }
    let page: MediaLibrary.PagedInfo<MediaLibrary.Asset>;
    try {
      page = await MediaLibrary.getAssetsAsync({
        first: batchSize,
        after,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]]
      });
    } catch (error) {
      if (!after || restarted) throw error;
      await beginFreshScan();
      after = undefined;
      indexed = 0;
      restarted = true;
      continue;
    }
    const assetIds = page.assets.map((asset) => asset.id);
    if (assetIds.length) await indexAssetPage(page.assets, settings);
    indexed += page.assets.length;
    after = page.hasNextPage ? page.endCursor : undefined;
    await recordScanPage(assetIds, after, indexed);
    options?.onProgress?.(indexed);
    if (!page.assets.length || !page.hasNextPage || !page.endCursor) {
      if (scanRevision !== libraryRevision) continue;
      await completeScan();
      break;
    }
  }
  void processPendingPhotoAnalysis({ maxItems: 80 }).catch(() => 0);
  return { granted: true, indexed, demo: false };
}

export async function seedDemoLibrary() {
  const photos = createDemoPhotos();
  await upsertPhotos(photos);
  return photos.length;
}

export type DeleteAssetsResult = {
  deletedAssetIds: string[];
  failedAssetIds: string[];
  cancelled: boolean;
};

type DeleteAssetRef = Pick<PhotoRecord, 'assetId'>;

async function assetStillExists(assetId: string) {
  try {
    if (Platform.OS === 'android') {
      await MediaLibrary.getAssetContentUriAsync(assetId);
      return true;
    }
    return Boolean(await MediaLibrary.getAssetInfoAsync(assetId, { shouldDownloadFromNetwork: false }));
  } catch (error) {
    if (isDeletedAssetError(error)) return false;
    // A permission or transient read failure must never be treated as proof of deletion.
    return true;
  }
}

export async function permanentlyDeleteAssets(assetRefs: DeleteAssetRef[]): Promise<DeleteAssetsResult> {
  const demoIds = assetRefs.filter((item) => item.assetId.startsWith('demo-asset-')).map((item) => item.assetId);
  const realRefs = assetRefs.filter((item) => !item.assetId.startsWith('demo-asset-'));
  const realIds = realRefs.map((item) => item.assetId);
  if (!realRefs.length) return { deletedAssetIds: demoIds, failedAssetIds: [], cancelled: false };

  // Keep deletion on the same legacy API used for indexing. It accepts the
  // MediaLibrary asset IDs and obtains the correct MediaStore URI internally,
  // including Android scoped-storage confirmation.
  try {
    const deleted = await MediaLibrary.deleteAssetsAsync(realIds);
    if (!deleted) throw new Error('系统未完成照片删除');
  } catch (error) {
    if (isDeletionCancelled(error)) {
      return { deletedAssetIds: [], failedAssetIds: [...demoIds, ...realIds], cancelled: true };
    }
    throw error;
  }

  const existing = new Set<string>();
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(4, realIds.length) }, async () => {
    while (nextIndex < realIds.length) {
      const index = nextIndex;
      nextIndex += 1;
      if (await assetStillExists(realIds[index]!)) existing.add(realIds[index]!);
    }
  });
  await Promise.all(workers);
  return { ...partitionDeletionResult(realIds, demoIds, existing), cancelled: false };
}
