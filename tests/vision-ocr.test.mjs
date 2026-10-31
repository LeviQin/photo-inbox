import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVisionOcrResponse, requestVisionOcr, visionOcrEndpoint } from '../src/services/visionOcrApi.ts';

test('AI 接口只接受 HTTPS 或本机 HTTP，并兼容自定义 /v1 路径', () => {
  assert.equal(visionOcrEndpoint('https://api.deepseek.com'), 'https://api.deepseek.com/chat/completions');
  assert.equal(visionOcrEndpoint('https://example.com/v1'), 'https://example.com/v1/chat/completions');
  assert.throws(() => visionOcrEndpoint('http://example.com'), /HTTPS/);
  assert.throws(() => visionOcrEndpoint('https://user:pass@example.com'), /不能包含/);
});

test('单张识字发送压缩图数据并解析文字，不发送文件路径', async () => {
  let request;
  const fakeFetch = async (url, init) => {
    request = { url, init };
    return { ok: true, json: async () => ({ choices: [{ message: { content: '发票号码 12345' } }] }) };
  };
  const result = await requestVisionOcr({ endpoint: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'test-key' }, 'YQ==', fakeFetch);
  assert.equal(result, '发票号码 12345');
  assert.equal(request.url, 'https://api.deepseek.com/chat/completions');
  const body = JSON.parse(request.init.body);
  assert.equal(body.messages[0].content[2].image_url.url, 'data:image/jpeg;base64,YQ==');
  assert.equal(body.model, 'deepseek-flash');
  assert.equal(parseVisionOcrResponse({ choices: [{ message: { content: '' } }] }), '');
  assert.equal(parseVisionOcrResponse({ choices: [{ message: { content: '__NO_TEXT__' } }] }), '');
});

test('AI 服务失败时返回可读错误，不泄露服务端响应内容', async () => {
  const fakeFetch = async () => ({ ok: false, status: 401 });
  await assert.rejects(() => requestVisionOcr({ endpoint: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'test-key' }, 'YQ==', fakeFetch), /HTTP 401/);
});
