import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const source = readFileSync(new URL('../src/db/database.ts', import.meta.url), 'utf8');

test('整日选择覆盖未加载的照片，汇总按真实大小优先', async () => {
  const raw = new DatabaseSync(':memory:');
  raw.exec('CREATE TABLE photos (id TEXT PRIMARY KEY, status TEXT, created_at INTEGER, category TEXT, actual_bytes INTEGER, estimated_bytes INTEGER, favorite INTEGER);');
  const insert = raw.prepare('INSERT INTO photos VALUES (?, ?, ?, ?, ?, ?, ?)');
  const createdAt = new Date(2026, 8, 27, 10).getTime();
  for (let index = 0; index < 620; index += 1) {
    insert.run(`photo-${index}`, 'active', createdAt + index * 1000, 'screenshot', index < 310 ? 100 : null, 200, index === 0 ? 0 : 1);
  }
  insert.run('document', 'active', createdAt, 'document', null, 200, 0);
  insert.run('trashed', 'trashed', createdAt, 'screenshot', null, 200, 0);
  const adapter = {
    getAllAsync: async (sql, ...params) => raw.prepare(sql).all(...params),
    getFirstAsync: async (sql, ...params) => raw.prepare(sql).get(...params)
  };
  const getDatabase = async () => adapter;
  const load = (name, nextName) => {
    const start = source.indexOf(`export async function ${name}(`);
    const end = source.indexOf(`export async function ${nextName}(`, start);
    assert.ok(start > 0 && end > start);
    return eval(`(${stripTypeScriptTypes(source.slice(start, end).replace(/^export /, '')).trim()})`);
  };
  const getPhotoIdsForDay = load('getPhotoIdsForDay', 'getPhotoSelectionSummary');
  const getPhotoSelectionSummary = load('getPhotoSelectionSummary', 'getCleanupTaskCounts');
  const ids = await getPhotoIdsForDay(createdAt, { category: 'screenshot' });
  assert.equal(ids.length, 620);
  assert.equal((await getPhotoIdsForDay(createdAt, { category: 'screenshot', before: createdAt + 300_000 })).length, 300);
  const summary = await getPhotoSelectionSummary(ids);
  assert.equal(summary.count, 620);
  assert.equal(summary.bytes, 93_000);
  assert.equal(summary.measured, 310);
  assert.equal(summary.allFavorite, false);
  insert.run('old-shot', 'active', createdAt - 100 * 86_400_000, 'screenshot', null, 11 * 1024 * 1024, 0);
  insert.run('unknown-shot', 'active', 0, 'screenshot', null, 200, 0);
  insert.run('large-document', 'active', createdAt, 'document', 12 * 1024 * 1024, 200, 0);
  assert.equal((await getPhotoIdsForDay(0, { category: 'screenshot' })).length, 0);
  const getCleanupTaskCounts = load('getCleanupTaskCounts', 'getPhoto');
  const tasks = await getCleanupTaskCounts(createdAt);
  assert.equal(tasks.oldScreenshots, 1);
  assert.equal(tasks.largeFiles, 2);
  assert.equal(tasks.largeMeasured, 1);
  raw.close();
});
