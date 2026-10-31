import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { estimatePhotoBytes } from '../src/utils/format.ts';
import { resolvePhotoCreatedAt, shouldQueuePhotoAnalysis } from '../src/services/indexingPolicy.ts';
import * as ai from '../src/services/aiService.ts';
import { createTestDatabase, makePhoto } from './helpers/database.mjs';

function loadService(path, dependencies, names) {
  const source = stripTypeScriptTypes(readFileSync(new URL(path, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from '[^']+';\s*/gm, '').replace(/^export /gm, '');
  return new Function(...Object.keys(dependencies), `${source}\nreturn { ${names.join(', ')} };`)(...Object.values(dependencies));
}

function asset(id, overrides = {}) {
  return { id, uri: `file:///${id}.jpg`, filename: `${id}.jpg`, width: 1000, height: 2000,
    creationTime: 1, modificationTime: 1, mediaType: 'photo', ...overrides };
}

function monitor(t, sync, platform = 'ios') {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let libraryListener, appListener;
  let removed = 0;
  const AppState = { currentState: 'active', addEventListener: (_, listener) => {
    appListener = listener; return { remove: () => { removed += 1; } };
  } };
  const { watchPhotoLibrary } = loadService('../src/services/photoLibrarySync.ts', {
    Platform: { OS: platform }, AppState,
    MediaLibrary: { addListener: (listener) => { libraryListener = listener; return { remove: () => { removed += 1; } }; } },
    invalidatePhotoLibraryScan: () => undefined
  }, ['watchPhotoLibrary']);
  const stop = watchPhotoLibrary(sync);
  t.after(stop);
  return {
    emit: (changes) => libraryListener(changes),
    state: (state) => { AppState.currentState = state; appListener(state); },
    tick: async () => { t.mock.timers.tick(750); await setImmediate(); },
    stop, removed: () => removed
  };
}

test('相册事件合并最新更新与删除，部分授权变化退回完整校验', async (t) => {
  const calls = [];
  const watcher = monitor(t, async (changes) => { calls.push(changes); });
  await watcher.tick();
  assert.deepEqual(calls, [undefined]);
  watcher.emit({ hasIncrementalChanges: true, insertedAssets: [asset('one'), asset('two')] });
  watcher.emit({ hasIncrementalChanges: true, updatedAssets: [asset('one', { modificationTime: 2 })], deletedAssets: [asset('two')] });
  await watcher.tick();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].insertedAssets.map((item) => [item.id, item.modificationTime]), [['one', 2]]);
  assert.deepEqual(calls[1].deletedAssets.map((item) => item.id), ['two']);
  watcher.emit({ hasIncrementalChanges: false });
  watcher.emit({ hasIncrementalChanges: true, insertedAssets: [asset('three')] });
  await watcher.tick();
  assert.equal(calls[2], undefined);
});

test('同步期间的新事件不会丢失，同步失败后仍可重试', async (t) => {
  const calls = [];
  let resolve;
  const watcher = monitor(t, (changes) => {
    calls.push(changes);
    if (calls.length === 1) return new Promise((done) => { resolve = done; });
    if (calls.length === 2) return Promise.reject(new Error('temporary'));
    return Promise.resolve();
  });
  await watcher.tick();
  watcher.emit({ hasIncrementalChanges: true, insertedAssets: [asset('one')] });
  await watcher.tick();
  assert.equal(calls.length, 1);
  resolve();
  await setImmediate();
  await watcher.tick();
  assert.equal(calls.length, 2);
  watcher.state('active');
  await watcher.tick();
  assert.equal(calls.length, 3);
  assert.equal(calls[2], undefined);
});

test('Android 空事件合并为分页校验，后台暂停，卸载监听后不再运行', async (t) => {
  const calls = [];
  const watcher = monitor(t, async (changes) => { calls.push(changes); }, 'android');
  await watcher.tick();
  watcher.state('background');
  watcher.emit({}); watcher.emit({});
  await watcher.tick();
  assert.equal(calls.length, 1);
  watcher.state('active');
  await watcher.tick();
  assert.deepEqual(calls, [undefined, undefined]);
  watcher.emit({});
  watcher.stop();
  await watcher.tick();
  assert.equal(calls.length, 2);
  assert.equal(watcher.removed(), 2);
});

async function indexer(t, getAssetsAsync, permission = { granted: true }) {
  const database = await createTestDatabase();
  t.after(database.close);
  let prompts = 0;
  const service = loadService('../src/services/photoIndexer.ts', {
    ...database.db, ...ai, estimatePhotoBytes, resolvePhotoCreatedAt, shouldQueuePhotoAnalysis,
    Platform: { OS: 'ios' },
    MediaLibrary: { getAssetsAsync, MediaType: { photo: 'photo' }, SortBy: { creationTime: 'creationTime' } },
    isVisualHashAvailable: () => false, processPendingPhotoAnalysis: async () => 0,
    getPhotoPermissionState: async () => permission,
    ensurePhotoPermission: async () => { prompts += 1; return permission; }
  }, ['indexPhotoLibrary', 'invalidatePhotoLibraryScan']);
  return { ...database, ...service, prompts: () => prompts };
}

test('iOS 增量更新保留用户状态，编辑后重建文字索引，只移除明确删除项', async (t) => {
  const service = await indexer(t, () => { throw new Error('不应完整扫描'); });
  const { db, raw } = service;
  await db.upsertPhotos([
    makePhoto({ id: 'kept', assetId: 'kept', status: 'kept', favorite: true }),
    makePhoto({ id: 'edited', assetId: 'edited', status: 'trashed' }),
    makePhoto({ id: 'deleted', assetId: 'deleted' }),
    makePhoto({ id: 'untouched', assetId: 'untouched' })
  ]);
  await db.setPhotoCategory('kept', 'food');
  await db.savePhotoOcrText('edited', '旧文字');
  await service.indexPhotoLibrary({ requestPermission: false, changes: {
    hasIncrementalChanges: true,
    insertedAssets: [asset('new'), asset('video', { mediaType: 'video' })],
    updatedAssets: [asset('kept'), asset('edited', { modificationTime: 2 })],
    deletedAssets: [asset('deleted')]
  } });
  assert.equal(service.prompts(), 0);
  assert.equal((await db.getPhoto('kept')).status, 'kept');
  assert.equal((await db.getPhoto('kept')).favorite, true);
  assert.equal((await db.getPhoto('kept')).category, 'food');
  assert.equal((await db.getPhoto('edited')).status, 'trashed');
  assert.equal(await db.getPhotoOcrText('edited'), null);
  assert.equal(await db.getPhoto('deleted'), null);
  assert.ok(await db.getPhoto('untouched'));
  assert.ok(await db.getPhoto('new'));
  assert.equal(await db.getPhoto('video'), null);
  assert.equal(raw.prepare('SELECT COUNT(*) AS count FROM scan_state').get().count, 0);
});

test('扫描失败不清理旧索引，断点恢复后才移除不存在的照片', async (t) => {
  let failed = true;
  const service = await indexer(t, async ({ after }) => {
    if (!after) return { assets: [asset('one')], hasNextPage: true, endCursor: 'next' };
    if (failed) throw new Error('temporary read failure');
    return { assets: [asset('two')], hasNextPage: false };
  });
  await service.db.upsertPhotos([makePhoto({ id: 'one', assetId: 'one', status: 'kept' }), makePhoto({ id: 'stale', assetId: 'stale' })]);
  // 首次游标失败会安全地重扫；重复失败才向调用方报告。
  await assert.rejects(service.indexPhotoLibrary(), /temporary/);
  assert.ok(await service.db.getPhoto('stale'));
  assert.equal((await service.db.getPhoto('one')).status, 'kept');
  assert.equal((await service.db.getScanCheckpoint()).after, 'next');
  failed = false;
  await service.indexPhotoLibrary();
  assert.equal(await service.db.getPhoto('stale'), null);
  assert.ok(await service.db.getPhoto('two'));
  assert.equal((await service.db.getPhoto('one')).status, 'kept');
});

test('扫描期间相册变化会重新校验后再清理，保护已有收藏和整理决定', async (t) => {
  let reads = 0;
  let service;
  service = await indexer(t, async () => {
    reads += 1;
    if (reads === 1) {
      service.invalidatePhotoLibraryScan();
      return { assets: [asset('one')], hasNextPage: false };
    }
    return { assets: [asset('one'), asset('two')], hasNextPage: false };
  });
  await service.db.upsertPhotos([makePhoto({ id: 'two', assetId: 'two', status: 'kept', favorite: true })]);
  await service.indexPhotoLibrary({ requestPermission: false, restart: true });
  assert.equal(reads, 2);
  assert.equal((await service.db.getPhoto('two')).status, 'kept');
  assert.equal((await service.db.getPhoto('two')).favorite, true);
});

test('被动同步不弹授权请求，拒绝权限时保留原有索引', async (t) => {
  const service = await indexer(t, () => { throw new Error('不应读取图库'); }, { granted: false });
  await service.db.upsertPhotos([makePhoto()]);
  const result = await service.indexPhotoLibrary({ requestPermission: false, restart: true });
  assert.equal(result.granted, false);
  assert.equal(service.prompts(), 0);
  assert.ok(await service.db.getPhoto('one'));
});
