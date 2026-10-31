import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import * as review from '../../src/services/reviewPolicy.ts';
import * as search from '../../src/services/searchService.ts';
import * as ai from '../../src/services/aiService.ts';

const source = readFileSync(new URL('../../src/db/database.ts', import.meta.url), 'utf8');
const exports = [...source.matchAll(/^export (?:async )?function (\w+)\(/gm)].map((match) => match[1]);
const script = stripTypeScriptTypes(source)
  .replace(/^import[\s\S]*?from '[^']+';\s*/gm, '')
  .replace(/^export /gm, '');

export async function createTestDatabase({ fts = true } = {}) {
  const raw = new DatabaseSync(':memory:');
  const adapter = {
    execAsync: async (sql) => raw.exec(sql),
    getFirstAsync: async (sql, ...params) => raw.prepare(sql).get(...params),
    getAllAsync: async (sql, ...params) => raw.prepare(sql).all(...params),
    runAsync: async (sql, ...params) => raw.prepare(sql).run(...params),
    withTransactionAsync: async (work) => {
      raw.exec('BEGIN');
      try {
        await work();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    }
  };
  const dependencies = {
    SQLite: { openDatabaseAsync: async () => adapter },
    Platform: { OS: fts ? 'android' : 'web' },
    ...review, ...search, ...ai
  };
  const db = new Function(...Object.keys(dependencies), `${script}\nreturn { ${exports.join(', ')} };`)(...Object.values(dependencies));
  await db.getDatabase();
  return { raw, db, close: () => raw.close() };
}

export function makePhoto(overrides = {}) {
  return {
    id: 'one', assetId: 'one', uri: 'file:///one.jpg', filename: 'IMG_0001.jpg',
    width: 3000, height: 4000, createdAt: Date.now(), modifiedAt: 1,
    category: 'other', status: 'active', favorite: false, aiScore: 80,
    visualHash: null, averageColor: null, exactHash: null, actualBytes: null,
    analysisVersion: 0, estimatedBytes: 1000, searchText: 'IMG_0001.jpg other',
    aiDescription: null, ...overrides
  };
}
