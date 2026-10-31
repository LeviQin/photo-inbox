import type { AIConfig } from './aiConfig';

type ImagePromptPart = { label: string; base64: string };
type MessageContent = string | Array<Record<string, unknown>>;

export function aiEndpoint(value: string) {
  let url: URL;
  try {
    url = new URL(value.includes('://') ? value.trim() : `https://${value.trim()}`);
  } catch {
    throw new Error('请填写有效的 AI 接口地址。');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('AI 接口必须使用 HTTPS；只有本机 localhost 可以使用 HTTP。');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('AI 接口地址不能包含账号、参数或片段。');
  const base = url.toString().replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

export function parseAIResponse(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('choices' in payload) || !Array.isArray(payload.choices)) return '';
  const content = payload.choices[0]?.message?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content)
    ? content.map((part) => typeof part?.text === 'string' ? part.text : '').join('\n') : '';
  return text.trim().replace(/^```(?:json|text)?\s*|\s*```$/gi, '').trim();
}

async function requestAI(config: AIConfig, content: MessageContent, fetcher: typeof fetch) {
  if (!config.apiKey.trim()) throw new Error('请先在设置中填写 AI API Key。');
  if (!config.model.trim()) throw new Error('请先填写模型名称。');
  const endpoint = aiEndpoint(config.endpoint);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey.trim()}` },
      body: JSON.stringify({
        model: config.model.trim(),
        temperature: 0.2,
        messages: [{ role: 'user', content }]
      })
    });
    if (!response.ok) throw new Error(`AI 服务请求失败（HTTP ${response.status}）。请检查接口、模型、密钥及余额。`);
    const text = parseAIResponse(await response.json().catch(() => null));
    if (!text) throw new Error('AI 服务没有返回可用内容，请检查模型是否支持当前请求。');
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('AI 请求超时，请检查网络后重试。');
    if (error instanceof TypeError) throw new Error('无法连接 AI 服务，请检查网络和接口地址。');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function requestAIText(config: AIConfig, prompt: string, fetcher: typeof fetch = fetch) {
  return requestAI(config, prompt, fetcher);
}

export function requestAIImages(config: AIConfig, prompt: string, images: ImagePromptPart[], fetcher: typeof fetch = fetch) {
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];
  for (const image of images) {
    content.push({ type: 'text', text: image.label });
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image.base64}`, detail: 'high' } });
  }
  return requestAI(config, content, fetcher);
}

export async function testAIConnection(config: AIConfig, fetcher: typeof fetch = fetch) {
  await requestAIText(config, '请只回复 OK，不要添加其他文字。', fetcher);
}
