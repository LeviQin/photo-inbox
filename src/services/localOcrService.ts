import { requireOptionalNativeModule } from 'expo-modules-core';
import { claimPhotoOcrBatch, finishPhotoOcr, getAppSettings } from '@/db/database';
import type { PhotoRecord } from '@/types/photo';

type PhotoOcrModule = {
  recognizeTextAsync(assetId: string, uri: string): Promise<string>;
};

const nativePhotoOcr = requireOptionalNativeModule<PhotoOcrModule>('ExpoPhotoOcr');
let processing: Promise<number> | null = null;

export function isLocalOcrAvailable() {
  return nativePhotoOcr !== null;
}

export async function recognizePhotoTextLocally(photo: Pick<PhotoRecord, 'assetId' | 'uri'>) {
  if (!nativePhotoOcr) throw new Error('当前构建未包含本机文字识别，请安装正式应用。');
  return nativePhotoOcr.recognizeTextAsync(photo.assetId, photo.uri);
}

export function processPendingPhotoOcr(maxItems = 8): Promise<number> {
  if (processing) return processing;
  processing = (async () => {
    if (!nativePhotoOcr) return 0;
    let processed = 0;
    while (processed < maxItems) {
      if ((await getAppSettings()).localOcrPaused) break;
      const [photo] = await claimPhotoOcrBatch();
      if (!photo) break;
      try {
        const text = await nativePhotoOcr.recognizeTextAsync(photo.assetId, photo.uri);
        await finishPhotoOcr(photo, text);
      } catch (error) {
        const code = error instanceof Error && error.message.includes('photo_unavailable')
          ? 'photo_unavailable' : 'ocr_failed';
        await finishPhotoOcr(photo, null, code);
      }
      processed += 1;
    }
    return processed;
  })().finally(() => { processing = null; });
  return processing;
}
