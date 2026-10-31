import type { PhotoRecord } from '@/types/photo';
import { getAIConfig } from '@/services/aiConfig';
import { createCompressedPhotoInput } from '@/services/aiPhotoInput';
import { requestVisionOcr } from '@/services/visionOcrApi';

export async function recognizePhotoText(photo: PhotoRecord) {
  const config = await getAIConfig();
  if (!config.apiKey.trim()) throw new Error('请先在设置中配置 AI API Key。');
  const base64 = await createCompressedPhotoInput(photo, 1600, 0.78);
  return requestVisionOcr(config, base64);
}
