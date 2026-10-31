import test from 'node:test';
import assert from 'node:assert/strict';
import { aiEndpoint, parseAIResponse, requestAIImages, requestAIText, testAIConnection } from '../src/services/aiApi.ts';

const config = { endpoint: 'https://api.example.com/v1', model: 'vision-model', apiKey: 'test-key' };

test('通用 AI 接口支持文本与连接测试，并复用安全地址校验', async () => {
  let request;
  const fakeFetch = async (url, init) => {
    request = { url, init };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) };
  };

  assert.equal(aiEndpoint(config.endpoint), 'https://api.example.com/v1/chat/completions');
  assert.equal(await requestAIText(config, 'hello', fakeFetch), 'OK');
  assert.equal(request.url, 'https://api.example.com/v1/chat/completions');
  assert.equal(request.init.headers.Authorization, 'Bearer test-key');
  assert.deepEqual(JSON.parse(request.init.body).messages, [{ role: 'user', content: 'hello' }]);
  await testAIConnection(config, fakeFetch);
  assert.match(JSON.parse(request.init.body).messages[0].content, /只回复 OK/);
  assert.throws(() => aiEndpoint('http://example.com'), /HTTPS/);
});

test('图片请求只包含压缩 JPEG 数据，不发送本地文件路径', async () => {
  let request;
  const fakeFetch = async (url, init) => {
    request = { url, init };
    return { ok: true, json: async () => ({ choices: [{ message: { content: '画面清晰' } }] }) };
  };

  const result = await requestAIImages(config, '比较照片', [
    { label: '候选照片 1', base64: 'YQ==' },
    { label: '候选照片 2', base64: 'Yg==' }
  ], fakeFetch);
  const body = JSON.parse(request.init.body);
  const content = body.messages[0].content;

  assert.equal(result, '画面清晰');
  assert.equal(content.filter((part) => part.type === 'image_url').length, 2);
  assert.equal(content[2].image_url.url, 'data:image/jpeg;base64,YQ==');
  assert.equal(content[4].image_url.url, 'data:image/jpeg;base64,Yg==');
  assert.equal(JSON.stringify(body).includes('file://'), false);
});

test('通用响应解析兼容字符串、分段内容和代码围栏', () => {
  assert.equal(parseAIResponse({ choices: [{ message: { content: '```json\n["截图"]\n```' } }] }), '["截图"]');
  assert.equal(parseAIResponse({ choices: [{ message: { content: [{ text: '可见主体' }, { text: '树木' }] } }] }), '可见主体\n树木');
  assert.equal(parseAIResponse({ choices: [{ message: { content: '' } }] }), '');
});

test('AI 请求失败时不把服务端响应正文暴露给界面', async () => {
  const fakeFetch = async () => ({ ok: false, status: 429 });
  await assert.rejects(() => requestAIText(config, 'hello', fakeFetch), /HTTP 429/);
});
