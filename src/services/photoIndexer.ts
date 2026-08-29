import * as MediaLibrary from 'expo-media-library/legacy';
import { buildSearchText, classifyPhoto, getQualityScore } from '@/services/aiService';
import { createDemoPhotos } from '@/services/demoData';
import { estimatePhotoBytes } from '@/utils/format';
import type { PhotoRecord } from '@/types/photo';
import { getAppSettings, reconcilePhotos, removeDemoPhotos, upsertPhotos } from '@/db/database';

export type IndexResult = {
  granted: boolean;
  indexed: number;
  demo: boolean;
};

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
    createdAt: asset.creationTime,
    modifiedAt: asset.modificationTime,
    category,
    status: 'active',
    favorite: false,
    aiScore: settings.localAI ? getQualityScore(base) : 0,
    estimatedBytes: estimatePhotoBytes(asset.width, asset.height),
    searchText: settings.searchIndex ? buildSearchText(base.filename, category) : ''
  };
}

export async function ensurePhotoPermission() {
  const granularPermissions: MediaLibrary.GranularPermission[] = ['photo'];
  let permission = await MediaLibrary.getPermissionsAsync(false, granularPermissions);
  if (!permission.granted) permission = await MediaLibrary.requestPermissionsAsync(false, granularPermissions);
  return permission;
}

export async function indexPhotoLibrary(options?: {
  maxAssets?: number;
  onProgress?: (indexed: number) => void;
}): Promise<IndexResult> {
  const permission = await ensurePhotoPermission();
  if (!permission.granted) return { granted: false, indexed: 0, demo: false };

  const maxAssets = options?.maxAssets ?? 5000;
  const batchSize = 150;
  let after: string | undefined;
  let indexed = 0;
  const assetIds: string[] = [];
  let complete = false;

  const settings = await getAppSettings();
  await removeDemoPhotos();

  while (indexed < maxAssets) {
    const page = await MediaLibrary.getAssetsAsync({
      first: Math.min(batchSize, maxAssets - indexed),
      after,
      mediaType: MediaLibrary.MediaType.photo,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]]
    });

    if (!page.assets.length) {
      complete = true;
      break;
    }
    assetIds.push(...page.assets.map((asset) => asset.id));
    await upsertPhotos(page.assets.map((asset) => assetToPhoto(asset, settings)));
    indexed += page.assets.length;
    options?.onProgress?.(indexed);
    if (!page.hasNextPage || !page.endCursor) {
      complete = true;
      break;
    }
    after = page.endCursor;
  }

  if (complete) await reconcilePhotos(assetIds);

  return { granted: true, indexed, demo: false };
}

export async function seedDemoLibrary() {
  const photos = createDemoPhotos();
  await upsertPhotos(photos);
  return photos.length;
}

export async function permanentlyDeleteAssets(assetIds: string[]) {
  const realIds = assetIds.filter((id) => !id.startsWith('demo-asset-'));
  if (!realIds.length) return true;
  return MediaLibrary.deleteAssetsAsync(realIds);
}
