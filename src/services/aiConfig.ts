import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type AIConfig = { endpoint: string; model: string; apiKey: string };

const storageKey = 'photo-inbox.vision-ocr.v1';
const defaults = { endpoint: 'https://api.deepseek.com', model: 'deepseek-flash' };

export async function getAIConfig(): Promise<AIConfig> {
  if (Platform.OS === 'web') return { ...defaults, apiKey: '' };
  const stored = await SecureStore.getItemAsync(storageKey);
  if (!stored) return { ...defaults, apiKey: '' };
  try {
    const value = JSON.parse(stored) as Partial<AIConfig>;
    return {
      endpoint: typeof value.endpoint === 'string' ? value.endpoint : defaults.endpoint,
      model: typeof value.model === 'string' ? value.model : defaults.model,
      apiKey: typeof value.apiKey === 'string' ? value.apiKey : ''
    };
  } catch {
    return { ...defaults, apiKey: '' };
  }
}

export async function saveAIConfig(config: AIConfig) {
  if (Platform.OS === 'web') throw new Error('AI 配置仅在 Android 和 iOS 应用中保存。');
  await SecureStore.setItemAsync(storageKey, JSON.stringify({
    endpoint: config.endpoint.trim(), model: config.model.trim(), apiKey: config.apiKey.trim()
  }), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

export async function clearAIConfig() {
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(storageKey);
}
