import * as MediaLibrary from 'expo-media-library/legacy';
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import type { PhotoRecord } from '@/types/photo';

export async function createCompressedPhotoInput(photo: PhotoRecord, maxEdge = 1600, quality = 0.78) {
  if (photo.assetId.startsWith('demo-asset-')) throw new Error('演示照片不可发送给 AI，请使用真实照片。');
  // On Android, getAssetInfoAsync also reads EXIF location metadata and can fail
  // without ACCESS_MEDIA_LOCATION. The indexed content URI is enough to decode
  // and resize the image, so do not request location access for visual analysis.
  let resolvedUri = photo.uri;
  if (Platform.OS !== 'android') {
    const asset = await MediaLibrary.getAssetInfoAsync(photo.assetId, { shouldDownloadFromNetwork: false });
    resolvedUri = asset.localUri ?? asset.uri;
  }
  if (!resolvedUri || (!resolvedUri.startsWith('file:') && !resolvedUri.startsWith('content:'))) {
    throw new Error('这张照片当前没有可读取的本地文件，请先在系统相册中下载原图。');
  }
  const longEdge = Math.max(photo.width, photo.height);
  const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
  const result = await manipulateAsync(resolvedUri, [{ resize: { width: Math.max(1, Math.round(photo.width * scale)) } }], { compress: quality, format: SaveFormat.JPEG });
  const file = new File(result.uri);
  try {
    return await file.base64();
  } finally {
    try { if (file.exists) file.delete(); } catch { /* 清理失败不覆盖识别结果。 */ }
  }
}
