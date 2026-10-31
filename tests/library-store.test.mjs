import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { create } from 'zustand';
import { createTestDatabase, makePhoto } from './helpers/database.mjs';

const script = stripTypeScriptTypes(readFileSync(new URL('../src/store/useAppStore.ts', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from '[^']+';\s*/gm, '').replace(/^export /gm, '');

async function store(t, indexPhotoLibrary, permission = async () => ({ granted: true, accessPrivileges: 'all', canAskAgain: true })) {
  const { db, close } = await createTestDatabase();
  t.after(close);
  const dependencies = {
    ...db, create, indexPhotoLibrary,
    Appearance: { setColorScheme: () => undefined }, Platform: { OS: 'android' },
    getPhotoPermissionState: permission,
    processPendingPhotoAnalysis: async () => 0, processPendingPhotoOcr: async () => 0,
    registerAnalysisBackgroundTask: async () => false
  };
  const app = new Function(...Object.keys(dependencies), `${script}\nreturn useAppStore;`)(...Object.values(dependencies));
  return { app, db };
}

test('手动扫描锁定重复点击，被动同步按队列执行而不丢失变化', async (t) => {
  let resolve;
  const calls = [];
  const { app, db } = await store(t, (options) => {
    calls.push(options);
    return calls.length === 1 ? new Promise((done) => { resolve = done; }) : Promise.resolve({ granted: true });
  });
  await db.upsertPhotos([makePhoto()]);
  await app.getState().initialize();
  const first = app.getState().scan();
  assert.equal(app.getState().scan(), first);
  await setImmediate();
  const changes = { hasIncrementalChanges: true, insertedAssets: [] };
  const second = app.getState().scan({ passive: true, changes });
  assert.equal(calls.length, 1);
  resolve({ granted: true });
  await Promise.all([first, second]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].changes, changes);
  assert.equal(calls[1].requestPermission, false);
  assert.equal(app.getState().indexing, false);
});

test('曾经扫描的空图库可自动同步新照片，首次使用仍由用户启动扫描', async (t) => {
  let calls = 0;
  const { app, db } = await store(t, async () => {
    calls += 1;
    await db.upsertPhotos([makePhoto()]);
    return { granted: true };
  });
  await app.getState().initialize();
  await app.getState().scan({ passive: true });
  assert.equal(calls, 0);
  await db.beginFreshScan(); await db.completeScan();
  await app.getState().scan({ passive: true });
  assert.equal(calls, 1);
  assert.equal(app.getState().stats.total, 1);
});

test('自动同步的权限读取失败可反馈并恢复，队列不会被拒绝的 Promise 卡住', async (t) => {
  let failed = false;
  let calls = 0;
  const { app, db } = await store(t, async () => { calls += 1; return { granted: true }; }, async () => {
    if (failed) throw new Error('权限读取失败');
    return { granted: true, accessPrivileges: 'limited', canAskAgain: true };
  });
  await db.upsertPhotos([makePhoto()]);
  await app.getState().initialize();
  failed = true;
  await app.getState().scan({ passive: true });
  assert.equal(app.getState().error, '权限读取失败');
  assert.equal(app.getState().indexing, false);
  failed = false;
  await app.getState().scan({ passive: true });
  assert.equal(calls, 1);
  assert.equal(app.getState().error, null);
});

test('清空索引等待正在进行的同步结束，避免被旧扫描重新填充', async (t) => {
  let resolve;
  let db;
  const setup = await store(t, async () => {
    await new Promise((done) => { resolve = done; });
    await db.upsertPhotos([makePhoto()]);
    return { granted: true };
  });
  db = setup.db;
  await setup.app.getState().initialize();
  const scan = setup.app.getState().scan();
  await setImmediate();
  const reset = setup.app.getState().reset();
  const pendingSync = setup.app.getState().scan({ passive: true });
  await setImmediate();
  resolve();
  await Promise.all([scan, reset, pendingSync]);
  assert.equal((await db.getDashboardStats()).total, 0);
  assert.equal(setup.app.getState().photos.length, 0);
  await setup.app.getState().scan({ passive: true });
  assert.equal((await db.getDashboardStats()).total, 0);
});
