import { requireOptionalNativeModule } from 'expo-modules-core';
import type { PhotoRecord } from '@/types/photo';
import {
  claimExactHashBatch,
  claimPhotoAnalysisBatch,
  enqueueExactHashCandidates,
  finishExactHash,
  finishPhotoAnalysis,
  getAppSettings
} from '@/db/database';

type NativeAnalysisResult = {
  visualHash: string | null;
  averageColor: string | null;
  actualBytes: number | null;
};

type NativeExactHashResult = {
  exactHash: string | null;
  actualBytes: number | null;
};

type PhotoHashModule = {
  computeDHashAsync?(assetId: string, uri: string): Promise<string | null>;
  analyzePhotoAsync(assetId: string, uri: string, includeVisual: boolean): Promise<NativeAnalysisResult>;
  computeExactHashAsync(assetId: string, uri: string): Promise<NativeExactHashResult>;
};

const nativePhotoHash = requireOptionalNativeModule<PhotoHashModule>('ExpoPhotoHash');

export function isVisualHashAvailable() {
  return nativePhotoHash !== null;
}

export async function computeVisualHash(photo: Pick<PhotoRecord, 'assetId' | 'uri'>) {
  if (!nativePhotoHash) return null;
  if (nativePhotoHash.computeDHashAsync) return nativePhotoHash.computeDHashAsync(photo.assetId, photo.uri);
  return (await nativePhotoHash.analyzePhotoAsync(photo.assetId, photo.uri, true)).visualHash;
}

let analysisPromise: Promise<number> | null = null;

export function processPendingPhotoAnalysis(options?: { maxItems?: number; onProgress?: (processed: number) => void }) {
  if (analysisPromise) return analysisPromise;
  analysisPromise = (async () => {
    if (!nativePhotoHash) return 0;
    const maxItems = Math.max(1, options?.maxItems ?? 80);
    const settings = await getAppSettings();
    let processed = 0;
    while (processed < maxItems) {
      const batch = await claimPhotoAnalysisBatch(Math.min(6, maxItems - processed));
      if (!batch.length) break;
      await Promise.all(batch.map(async (photo) => {
        try {
          const result = await nativePhotoHash.analyzePhotoAsync(photo.assetId, photo.uri, settings.localAI);
          await finishPhotoAnalysis(photo, result);
        } catch (error) {
          await finishPhotoAnalysis(photo, null, error instanceof Error ? error.message : 'analysis_failed');
        } finally {
          processed += 1;
          options?.onProgress?.(processed);
        }
      }));
    }

    if (settings.localAI) {
      await enqueueExactHashCandidates();
      while (processed < maxItems) {
        const batch = await claimExactHashBatch(Math.min(2, maxItems - processed));
        if (!batch.length) break;
        await Promise.all(batch.map(async (photo) => {
          try {
            const result = await nativePhotoHash.computeExactHashAsync(photo.assetId, photo.uri);
            await finishExactHash(photo, result.exactHash, result.actualBytes);
          } catch (error) {
            await finishExactHash(photo, null, null, error instanceof Error ? error.message : 'exact_hash_failed');
          } finally {
            processed += 1;
            options?.onProgress?.(processed);
          }
        }));
      }
    }
    return processed;
  })().finally(() => { analysisPromise = null; });
  return analysisPromise;
}

export async function attachVisualHashes(photos: PhotoRecord[], enabled: boolean): Promise<PhotoRecord[]> {
  if (!enabled || !nativePhotoHash || !photos.length) return photos;

  const results = [...photos];
  let nextIndex = 0;
  const workerCount = Math.min(4, photos.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < photos.length) {
      const index = nextIndex;
      nextIndex += 1;
      const photo = photos[index]!;
      try {
        const result = await nativePhotoHash.analyzePhotoAsync(photo.assetId, photo.uri, true);
        results[index] = {
          ...photo,
          visualHash: result.visualHash,
          averageColor: result.averageColor,
          actualBytes: result.actualBytes
        };
      } catch {
        results[index] = photo;
      }
    }
  });

  await Promise.all(workers);
  return results;
}
