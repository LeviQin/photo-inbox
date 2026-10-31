import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import type {
  DashboardStats,
  PhotoCategory,
  PhotoCursor,
  PhotoPage,
  PhotoRecord,
  PhotoStatus,
  ReviewPreferences,
  ReviewSession,
  ReviewSource,
  ReviewSourceSummary,
  ReviewTarget,
  SimilarityLevel
} from '@/types/photo';
import { applyReviewDecision, buildReviewSourceQuery, canDecideReviewTarget, nextDailyReviewProgress, reviewDayKey, undoLatestReviewDecision, type ReviewDecisionItem } from '@/services/reviewPolicy';
import { explainSearchHit, type SearchPlan } from '@/services/searchService';
import { buildSearchText, classifyPhoto } from '@/services/aiService';

export type AppSettingKey = 'localAI' | 'autoClassify' | 'searchIndex' | 'localOcrPaused';
export type AppSettings = Record<AppSettingKey, boolean>;
export type AppearanceMode = 'system' | 'light' | 'dark';

const appearanceModes: AppearanceMode[] = ['system', 'light', 'dark'];
const supportsSearchFts = Platform.OS !== 'web';

const defaultSettings: AppSettings = {
  localAI: true,
  autoClassify: true,
  searchIndex: true,
  localOcrPaused: false
};

let databasePromise: ReturnType<typeof SQLite.openDatabaseAsync> | null = null;
let schemaPromise: Promise<void> | null = null;
let transactionQueue: Promise<void> = Promise.resolve();

function withDatabaseTransaction(db: Awaited<ReturnType<typeof SQLite.openDatabaseAsync>>, work: () => Promise<void>) {
  const result = transactionQueue.then(() => db.withTransactionAsync(work));
  transactionQueue = result.catch(() => undefined);
  return result;
}

async function migrateDatabase(db: Awaited<ReturnType<typeof SQLite.openDatabaseAsync>>) {
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const previousVersion = Number(versionRow?.user_version ?? 0);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY NOT NULL,
      asset_id TEXT UNIQUE NOT NULL,
      uri TEXT NOT NULL,
      filename TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      modified_at INTEGER NOT NULL,
      category TEXT NOT NULL,
      category_source TEXT NOT NULL DEFAULT 'auto',
      status TEXT NOT NULL DEFAULT 'active',
      trashed_from_status TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      ai_score INTEGER NOT NULL DEFAULT 50,
      visual_hash TEXT,
      average_color TEXT,
      exact_hash TEXT,
      actual_bytes INTEGER,
      analysis_version INTEGER NOT NULL DEFAULT 0,
      estimated_bytes INTEGER NOT NULL DEFAULT 0,
      search_text TEXT NOT NULL DEFAULT '',
      ocr_text TEXT,
      ocr_version INTEGER NOT NULL DEFAULT 0,
      ai_description TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_photos_status ON photos(status);
    CREATE INDEX IF NOT EXISTS idx_photos_category ON photos(category);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(photos)');
  const columnNames = new Set(columns.map((column) => column.name));
  if (!columnNames.has('visual_hash')) await db.execAsync('ALTER TABLE photos ADD COLUMN visual_hash TEXT;');
  if (!columnNames.has('average_color')) await db.execAsync('ALTER TABLE photos ADD COLUMN average_color TEXT;');
  if (!columnNames.has('exact_hash')) await db.execAsync('ALTER TABLE photos ADD COLUMN exact_hash TEXT;');
  if (!columnNames.has('actual_bytes')) await db.execAsync('ALTER TABLE photos ADD COLUMN actual_bytes INTEGER;');
  if (!columnNames.has('analysis_version')) await db.execAsync('ALTER TABLE photos ADD COLUMN analysis_version INTEGER NOT NULL DEFAULT 0;');
  if (!columnNames.has('trashed_from_status')) await db.execAsync('ALTER TABLE photos ADD COLUMN trashed_from_status TEXT;');
  if (!columnNames.has('ocr_text')) await db.execAsync('ALTER TABLE photos ADD COLUMN ocr_text TEXT;');
  if (!columnNames.has('category_source')) await db.execAsync("ALTER TABLE photos ADD COLUMN category_source TEXT NOT NULL DEFAULT 'auto';");
  if (!columnNames.has('ocr_version')) await db.execAsync('ALTER TABLE photos ADD COLUMN ocr_version INTEGER NOT NULL DEFAULT 0;');
  if (!columnNames.has('ai_description')) await db.execAsync('ALTER TABLE photos ADD COLUMN ai_description TEXT;');
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_photos_visual_hash ON photos(visual_hash);
    CREATE INDEX IF NOT EXISTS idx_photos_exact_hash ON photos(exact_hash);
    CREATE INDEX IF NOT EXISTS idx_photos_actual_bytes ON photos(actual_bytes DESC);
    CREATE INDEX IF NOT EXISTS idx_photos_status_created ON photos(status, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_photos_category_created ON photos(category, created_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS scan_state (
      id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
      after_cursor TEXT,
      indexed_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scan_assets (
      asset_id TEXT PRIMARY KEY NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analysis_queue (
      asset_id TEXT PRIMARY KEY NOT NULL,
      state TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(asset_id) REFERENCES photos(asset_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_analysis_queue_state ON analysis_queue(state, updated_at);
    CREATE TABLE IF NOT EXISTS exact_hash_queue (
      asset_id TEXT PRIMARY KEY NOT NULL,
      state TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(asset_id) REFERENCES photos(asset_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_exact_hash_queue_state ON exact_hash_queue(state, updated_at);
    CREATE TABLE IF NOT EXISTS review_sessions (
      id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
      source TEXT NOT NULL,
      source_value TEXT,
      target_count INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      started_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS review_session_items (
      session_id INTEGER NOT NULL,
      photo_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      decision TEXT,
      decided_at INTEGER,
      PRIMARY KEY(session_id, photo_id),
      FOREIGN KEY(session_id) REFERENCES review_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY(photo_id) REFERENCES photos(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_review_items_position ON review_session_items(session_id, position);
    CREATE TABLE IF NOT EXISTS ocr_queue (
      asset_id TEXT PRIMARY KEY NOT NULL,
      state TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      error TEXT,
      FOREIGN KEY(asset_id) REFERENCES photos(asset_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ocr_queue_state ON ocr_queue(state, updated_at);
  `);
  if (supportsSearchFts) await db.execAsync(`
    CREATE VIRTUAL TABLE IF NOT EXISTS photo_search_fts USING fts5(body, tokenize='trigram');
    CREATE TRIGGER IF NOT EXISTS photos_search_insert AFTER INSERT ON photos BEGIN
      INSERT INTO photo_search_fts(rowid, body)
      VALUES (new.rowid, COALESCE(new.search_text, '') || ' ' || new.category || ' ' || COALESCE(new.ocr_text, '') || ' ' || COALESCE(new.ai_description, ''));
    END;
    CREATE TRIGGER IF NOT EXISTS photos_search_update AFTER UPDATE OF search_text, category, ocr_text, ai_description ON photos
    WHEN old.search_text IS NOT new.search_text OR old.category IS NOT new.category
      OR old.ocr_text IS NOT new.ocr_text OR old.ai_description IS NOT new.ai_description
    BEGIN
      DELETE FROM photo_search_fts WHERE rowid = old.rowid;
      INSERT INTO photo_search_fts(rowid, body)
      VALUES (new.rowid, COALESCE(new.search_text, '') || ' ' || new.category || ' ' || COALESCE(new.ocr_text, '') || ' ' || COALESCE(new.ai_description, ''));
    END;
    CREATE TRIGGER IF NOT EXISTS photos_search_delete AFTER DELETE ON photos BEGIN
      DELETE FROM photo_search_fts WHERE rowid = old.rowid;
    END;
  `);
  if (previousVersion < 7) {
    await db.execAsync('UPDATE photos SET ocr_version = 1 WHERE ocr_text IS NOT NULL AND ocr_version = 0;');
    if (supportsSearchFts) await db.execAsync(`
      INSERT OR REPLACE INTO photo_search_fts(rowid, body)
      SELECT rowid, COALESCE(search_text, '') || ' ' || category || ' ' || COALESCE(ocr_text, '') || ' ' || COALESCE(ai_description, '')
      FROM photos;
    `);
    const described = await db.getAllAsync<{ id: string; filename: string; width: number; height: number; category: PhotoCategory }>(
      'SELECT id, filename, width, height, category FROM photos WHERE ai_description IS NOT NULL'
    );
    for (const photo of described) {
      if (photo.category !== classifyPhoto(photo.filename, photo.width, photo.height)) {
        await db.runAsync("UPDATE photos SET category_source = 'manual' WHERE id = ?", photo.id);
      }
    }
    await db.runAsync(`
      INSERT OR IGNORE INTO ocr_queue (asset_id, state, attempts, updated_at)
      SELECT asset_id, 'queued', 0, ? FROM photos
      WHERE asset_id NOT LIKE 'demo-asset-%' AND status != 'trashed'
        AND category IN ('screenshot', 'document') AND ocr_version = 0
    `, Date.now());
  }
  if (previousVersion < 3) {
    await db.runAsync(`
      INSERT OR IGNORE INTO analysis_queue (asset_id, state, attempts, updated_at)
      SELECT asset_id, 'queued', 0, ? FROM photos
      WHERE asset_id NOT LIKE 'demo-asset-%' AND analysis_version < 2
    `, Date.now());
  }
  await db.execAsync('PRAGMA user_version = 7;');
}

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('photo-inbox.db');
  }
  const db = await databasePromise;
  if (!schemaPromise) {
    schemaPromise = migrateDatabase(db).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
  return db;
}

function rowToPhoto(row: any): PhotoRecord {
  return {
    id: String(row.id),
    assetId: String(row.asset_id),
    uri: String(row.uri),
    filename: String(row.filename),
    width: Number(row.width),
    height: Number(row.height),
    createdAt: Number(row.created_at),
    modifiedAt: Number(row.modified_at),
    category: row.category,
    status: row.status,
    favorite: Boolean(row.favorite),
    aiScore: Number(row.ai_score),
    visualHash: row.visual_hash ? String(row.visual_hash) : null,
    averageColor: row.average_color ? String(row.average_color) : null,
    exactHash: row.exact_hash ? String(row.exact_hash) : null,
    actualBytes: row.actual_bytes === null || row.actual_bytes === undefined ? null : Number(row.actual_bytes),
    analysisVersion: Number(row.analysis_version ?? 0),
    estimatedBytes: Number(row.estimated_bytes),
    searchText: String(row.search_text),
    aiDescription: row.ai_description === null || row.ai_description === undefined ? null : String(row.ai_description)
  };
}

export async function upsertPhotos(photos: PhotoRecord[]) {
  const db = await getDatabase();
  await withDatabaseTransaction(db, async () => {
    for (const photo of photos) {
      await db.runAsync(
        `INSERT INTO photos (
          id, asset_id, uri, filename, width, height, created_at, modified_at,
          category, status, favorite, ai_score, visual_hash, average_color, exact_hash,
          actual_bytes, analysis_version, estimated_bytes, search_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(asset_id) DO UPDATE SET
          uri=excluded.uri,
          filename=excluded.filename,
          width=excluded.width,
          height=excluded.height,
          created_at=excluded.created_at,
          modified_at=excluded.modified_at,
          category=CASE
            WHEN photos.category_source = 'manual' AND excluded.modified_at = photos.modified_at THEN photos.category
            ELSE excluded.category
          END,
          category_source=CASE
            WHEN excluded.modified_at != photos.modified_at THEN 'auto'
            ELSE photos.category_source
          END,
          ai_score=excluded.ai_score,
          visual_hash=CASE
            WHEN excluded.modified_at != photos.modified_at THEN excluded.visual_hash
            ELSE COALESCE(excluded.visual_hash, photos.visual_hash)
          END,
          average_color=CASE
            WHEN excluded.modified_at != photos.modified_at THEN excluded.average_color
            ELSE COALESCE(excluded.average_color, photos.average_color)
          END,
          exact_hash=CASE
            WHEN excluded.modified_at != photos.modified_at THEN excluded.exact_hash
            ELSE COALESCE(excluded.exact_hash, photos.exact_hash)
          END,
          actual_bytes=CASE
            WHEN excluded.modified_at != photos.modified_at THEN excluded.actual_bytes
            ELSE COALESCE(excluded.actual_bytes, photos.actual_bytes)
          END,
          analysis_version=CASE
            WHEN excluded.modified_at != photos.modified_at THEN excluded.analysis_version
            ELSE MAX(excluded.analysis_version, photos.analysis_version)
          END,
          estimated_bytes=excluded.estimated_bytes,
          search_text=excluded.search_text,
          ocr_text=CASE WHEN excluded.modified_at != photos.modified_at THEN NULL ELSE photos.ocr_text END,
          ocr_version=CASE WHEN excluded.modified_at != photos.modified_at THEN 0 ELSE photos.ocr_version END,
          ai_description=CASE WHEN excluded.modified_at != photos.modified_at THEN NULL ELSE photos.ai_description END`,
        photo.id,
        photo.assetId,
        photo.uri,
        photo.filename,
        photo.width,
        photo.height,
        photo.createdAt,
        photo.modifiedAt,
        photo.category,
        photo.status,
        photo.favorite ? 1 : 0,
        photo.aiScore,
        photo.visualHash,
        photo.averageColor,
        photo.exactHash,
        photo.actualBytes,
        photo.analysisVersion,
        photo.estimatedBytes,
        photo.searchText
      );
    }
  });
}

type PhotoPageOptions = {
  status?: PhotoStatus | 'available' | 'all';
  category?: PhotoCategory;
  before?: number;
  search?: SearchPlan;
  cursor?: PhotoCursor | null;
  limit?: number;
};

export async function getPhotoPage(options: PhotoPageOptions = {}): Promise<PhotoPage> {
  const db = await getDatabase();
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (options.status === 'available') clauses.push("status != 'trashed'");
  else if (options.status && options.status !== 'all') {
    clauses.push('status = ?');
    params.push(options.status);
  }
  if (options.category) {
    clauses.push('category = ?');
    params.push(options.category);
  }
  if (options.before !== undefined) {
    clauses.push('created_at > 0');
    clauses.push('created_at < ?');
    params.push(options.before);
  }
  const searchTokens = options.search?.tokens ?? [];
  if (searchTokens.length) {
    const groups = options.search?.tokenGroups ?? (options.search?.tokenMatch === 'any' ? [searchTokens] : searchTokens.map((token) => [token]));
    const groupClauses = groups.map((group) => `(${group.map((token) => {
      const escaped = /[%_\\]/.test(token);
      const value = `%${token.replace(/[%_\\]/g, '\\$&')}%`;
      if (supportsSearchFts && Array.from(token).length >= 3 && !escaped) {
        params.push(value);
        return 'rowid IN (SELECT rowid FROM photo_search_fts WHERE body LIKE ?)';
      }
      params.push(value, value, value, value);
      const suffix = escaped ? " ESCAPE '\\'" : '';
      return `(search_text LIKE ?${suffix} OR category LIKE ?${suffix} OR ocr_text LIKE ?${suffix} OR ai_description LIKE ?${suffix})`;
    }).join(' OR ')})`);
    clauses.push(`(${groupClauses.join(' AND ')})`);
  }
  if (options.search?.startAt !== null && options.search?.startAt !== undefined) {
    clauses.push('created_at >= ?');
    params.push(options.search.startAt);
  }
  if (options.search?.endAt !== null && options.search?.endAt !== undefined) {
    clauses.push('created_at < ?');
    params.push(options.search.endAt);
  }
  if (options.search?.minBytes !== null && options.search?.minBytes !== undefined) {
    clauses.push('COALESCE(actual_bytes, estimated_bytes) >= ?');
    params.push(options.search.minBytes);
  }
  if (options.cursor) {
    clauses.push('(created_at < ? OR (created_at = ? AND id < ?))');
    params.push(options.cursor.createdAt, options.cursor.createdAt, options.cursor.id);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(Math.floor(options.limit ?? 120), 250));
  const rows = await db.getAllAsync(
    `SELECT * FROM photos ${where} ORDER BY created_at DESC, id DESC LIMIT ?`,
    ...params,
    limit + 1
  );
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row: any) => {
    const photo = rowToPhoto(row);
    return options.search ? {
      ...photo,
      searchHit: explainSearchHit({ ...photo, ocrText: row.ocr_text ?? null }, options.search)
    } : photo;
  });
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null
  };
}

export async function getPhotoIdsForDay(createdAt: number, options?: { category?: PhotoCategory; before?: number }) {
  if (!Number.isFinite(createdAt) || createdAt <= 0) return [];
  const db = await getDatabase();
  const start = new Date(createdAt);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const clauses = ["status != 'trashed'", 'created_at >= ?', 'created_at < ?'];
  const params: Array<string | number> = [start.getTime(), end.getTime()];
  if (options?.category) { clauses.push('category = ?'); params.push(options.category); }
  if (options?.before !== undefined) { clauses.push('created_at < ?'); params.push(options.before); }
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM photos WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, id DESC`, ...params
  );
  return rows.map((row) => row.id);
}

export async function getPhotoSelectionSummary(ids: string[]) {
  if (!ids.length) return { count: 0, bytes: 0, measured: 0, allFavorite: false };
  const db = await getDatabase();
  let count = 0;
  let bytes = 0;
  let measured = 0;
  let favorite = 0;
  for (let offset = 0; offset < ids.length; offset += 500) {
    const chunk = ids.slice(offset, offset + 500);
    const row = await db.getFirstAsync<{ count: number; bytes: number; measured: number; favorite: number }>(
      `SELECT COUNT(*) AS count, SUM(COALESCE(actual_bytes, estimated_bytes)) AS bytes,
        SUM(CASE WHEN actual_bytes IS NOT NULL THEN 1 ELSE 0 END) AS measured,
        SUM(favorite) AS favorite FROM photos
       WHERE status != 'trashed' AND id IN (${chunk.map(() => '?').join(',')})`, ...chunk
    );
    count += Number(row?.count ?? 0);
    bytes += Number(row?.bytes ?? 0);
    measured += Number(row?.measured ?? 0);
    favorite += Number(row?.favorite ?? 0);
  }
  return { count, bytes, measured, allFavorite: count > 0 && count === favorite };
}

export async function getCleanupTaskCounts(now = Date.now()) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ old_screenshots: number; large_files: number; large_measured: number }>(`
    SELECT
      SUM(CASE WHEN category = 'screenshot' AND created_at > 0 AND created_at < ? THEN 1 ELSE 0 END) AS old_screenshots,
      SUM(CASE WHEN COALESCE(actual_bytes, estimated_bytes) >= 10485760 THEN 1 ELSE 0 END) AS large_files,
      SUM(CASE WHEN COALESCE(actual_bytes, estimated_bytes) >= 10485760 AND actual_bytes IS NOT NULL THEN 1 ELSE 0 END) AS large_measured
    FROM photos WHERE status != 'trashed'
  `, now - 90 * 86_400_000);
  return {
    oldScreenshots: Number(row?.old_screenshots ?? 0),
    largeFiles: Number(row?.large_files ?? 0),
    largeMeasured: Number(row?.large_measured ?? 0)
  };
}

export async function getPhoto(id: string): Promise<PhotoRecord | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync('SELECT * FROM photos WHERE id = ? LIMIT 1', id);
  return row ? rowToPhoto(row) : null;
}

export async function getPhotoOcrText(id: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ ocr_text: string | null }>('SELECT ocr_text FROM photos WHERE id = ?', id);
  return row?.ocr_text ?? null;
}

export async function savePhotoOcrText(id: string, text: string) {
  const db = await getDatabase();
  await db.runAsync('UPDATE photos SET ocr_text = ?, ocr_version = 1 WHERE id = ?', text.trim(), id);
  await db.runAsync('DELETE FROM ocr_queue WHERE asset_id = (SELECT asset_id FROM photos WHERE id = ?)', id);
}

export async function clearPhotoOcrText(id: string) {
  const db = await getDatabase();
  await db.runAsync('UPDATE photos SET ocr_text = NULL, ocr_version = -1 WHERE id = ?', id);
  await db.runAsync('DELETE FROM ocr_queue WHERE asset_id = (SELECT asset_id FROM photos WHERE id = ?)', id);
}

export async function getPhotoAiDescription(id: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ ai_description: string | null }>('SELECT ai_description FROM photos WHERE id = ?', id);
  return row?.ai_description ?? null;
}

export async function savePhotoAiDescription(id: string, text: string) {
  const db = await getDatabase();
  await db.runAsync('UPDATE photos SET ai_description = ? WHERE id = ?', text.trim(), id);
}

export async function setPhotoCategory(id: string, category: PhotoCategory) {
  const db = await getDatabase();
  const photo = await db.getFirstAsync<{ filename: string; asset_id: string }>('SELECT filename, asset_id FROM photos WHERE id = ?', id);
  if (!photo) throw new Error('照片索引已不存在，请重新扫描相册。');
  const settings = await getAppSettings();
  const searchText = settings.searchIndex ? buildSearchText(photo.filename, category) : '';
  await db.runAsync("UPDATE photos SET category = ?, category_source = 'manual', search_text = ? WHERE id = ?", category, searchText, id);
  await enqueuePhotoOcr([photo.asset_id]);
}

export async function setPhotoStatus(id: string, status: PhotoStatus) {
  const db = await getDatabase();
  await db.runAsync(`UPDATE photos SET
    trashed_from_status = CASE WHEN ? = 'trashed' THEN CASE WHEN status = 'trashed' THEN trashed_from_status ELSE status END ELSE NULL END,
    status = ? WHERE id = ?`, status, status, id);
}

export async function setManyPhotoStatus(ids: string[], status: PhotoStatus) {
  if (!ids.length) return;
  const db = await getDatabase();
  await withDatabaseTransaction(db, async () => {
    for (const id of ids) await db.runAsync(`UPDATE photos SET
      trashed_from_status = CASE WHEN ? = 'trashed' THEN CASE WHEN status = 'trashed' THEN trashed_from_status ELSE status END ELSE NULL END,
      status = ? WHERE id = ?`, status, status, id);
  });
}

export async function restorePhotoStatuses(ids: string[]) {
  if (!ids.length) return;
  const db = await getDatabase();
  await withDatabaseTransaction(db, async () => {
    for (const id of ids) await db.runAsync(`UPDATE photos SET
      status = CASE WHEN trashed_from_status = 'kept' THEN 'kept' ELSE 'active' END,
      trashed_from_status = NULL WHERE id = ? AND status = 'trashed'`, id);
  });
}

export async function restoreAllPhotoStatuses() {
  const db = await getDatabase();
  await db.runAsync(`UPDATE photos SET
    status = CASE WHEN trashed_from_status = 'kept' THEN 'kept' ELSE 'active' END,
    trashed_from_status = NULL WHERE status = 'trashed'`);
}

export async function toggleFavorite(id: string) {
  const db = await getDatabase();
  await db.runAsync('UPDATE photos SET favorite = CASE favorite WHEN 1 THEN 0 ELSE 1 END WHERE id = ?', id);
}

export async function setManyFavorites(ids: string[], favorite: boolean) {
  if (!ids.length) return;
  const db = await getDatabase();
  await withDatabaseTransaction(db, async () => {
    for (const id of ids) await db.runAsync('UPDATE photos SET favorite = ? WHERE id = ?', favorite ? 1 : 0, id);
  });
}

export async function removePhotoRowsByAssetIds(assetIds: string[]) {
  if (!assetIds.length) return;
  const db = await getDatabase();
  await withDatabaseTransaction(db, async () => {
    for (const assetId of assetIds) await db.runAsync('DELETE FROM photos WHERE asset_id = ?', assetId);
  });
}

export async function getPhotoRefs(status: PhotoStatus): Promise<Array<Pick<PhotoRecord, 'id' | 'assetId' | 'uri' | 'estimatedBytes' | 'actualBytes'>>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; asset_id: string; uri: string; estimated_bytes: number; actual_bytes: number | null }>(
    'SELECT id, asset_id, uri, estimated_bytes, actual_bytes FROM photos WHERE status = ? ORDER BY created_at DESC',
    status
  );
  return rows.map((row) => ({
    id: row.id,
    assetId: row.asset_id,
    uri: row.uri,
    estimatedBytes: Number(row.estimated_bytes),
    actualBytes: row.actual_bytes === null ? null : Number(row.actual_bytes)
  }));
}

export async function getPhotoIdsByStatus(status: PhotoStatus): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM photos WHERE status = ? ORDER BY created_at DESC, id DESC', status);
  return rows.map((row) => String(row.id));
}

export async function getTrashedPhotoRefsByIds(ids: string[]) {
  if (!ids.length) return [];
  const db = await getDatabase();
  const rows: Array<{ id: string; asset_id: string; uri: string; estimated_bytes: number; actual_bytes: number | null }> = [];
  for (let index = 0; index < ids.length; index += 400) {
    const chunk = ids.slice(index, index + 400);
    rows.push(...await db.getAllAsync<{ id: string; asset_id: string; uri: string; estimated_bytes: number; actual_bytes: number | null }>(
      `SELECT id, asset_id, uri, estimated_bytes, actual_bytes FROM photos WHERE status = 'trashed' AND id IN (${chunk.map(() => '?').join(',')})`,
      ...chunk
    ));
  }
  return rows.map((row) => ({ id: row.id, assetId: row.asset_id, uri: row.uri, estimatedBytes: Number(row.estimated_bytes), actualBytes: row.actual_bytes === null ? null : Number(row.actual_bytes) }));
}

export async function removeDemoPhotos() {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM photos WHERE asset_id LIKE 'demo-asset-%'");
}

export async function getAppSettings(): Promise<AppSettings> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const settings = { ...defaultSettings };
  for (const row of rows) {
    if (row.key in settings) settings[row.key as AppSettingKey] = row.value === '1';
  }
  return settings;
}

export async function setAppSetting(key: AppSettingKey, value: boolean) {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    key,
    value ? '1' : '0'
  );
}

export async function getAppearanceMode(): Promise<AppearanceMode> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'appearance_mode'"
  );
  const value = row?.value as AppearanceMode | undefined;
  return value && appearanceModes.includes(value) ? value : 'system';
}

export async function setAppearanceMode(value: AppearanceMode) {
  if (!appearanceModes.includes(value)) throw new Error('invalid_appearance_mode');
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES ('appearance_mode', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    value
  );
}

const reviewTargets: ReviewTarget[] = [10, 20, 30, 50];
const similarityLevels: SimilarityLevel[] = ['strict', 'balanced', 'loose'];

export async function getReviewPreferences(): Promise<ReviewPreferences> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE key IN ('daily_review_target', 'similarity_level', 'gallery_columns')"
  );
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const target = Number(values.get('daily_review_target') ?? 50) as ReviewTarget;
  const level = values.get('similarity_level') as SimilarityLevel | undefined;
  const columns = Number(values.get('gallery_columns') ?? 3) as 3 | 4 | 5;
  return {
    dailyTarget: reviewTargets.includes(target) ? target : 50,
    similarityLevel: level && similarityLevels.includes(level) ? level : 'balanced',
    galleryColumns: [3, 4, 5].includes(columns) ? columns : 3
  };
}

export async function setDailyReviewTarget(value: ReviewTarget) {
  if (!reviewTargets.includes(value)) throw new Error('invalid_daily_target');
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES ('daily_review_target', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    String(value)
  );
}

export async function setSimilarityLevel(value: SimilarityLevel) {
  if (!similarityLevels.includes(value)) throw new Error('invalid_similarity_level');
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES ('similarity_level', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    value
  );
}

export async function setGalleryColumns(value: 3 | 4 | 5) {
  if (![3, 4, 5].includes(value)) throw new Error('invalid_gallery_columns');
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES ('gallery_columns', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    String(value)
  );
}

async function changeDailyReviewProgressInTransaction(
  db: Awaited<ReturnType<typeof SQLite.openDatabaseAsync>>,
  delta: number,
  timestamp: number
) {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE key IN ('daily_review_date', 'daily_review_count')"
  );
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const next = nextDailyReviewProgress(
    values.get('daily_review_date'),
    Number(values.get('daily_review_count') ?? 0) || 0,
    delta,
    timestamp
  );
  await db.runAsync("INSERT INTO settings (key, value) VALUES ('daily_review_date', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", next.date);
  await db.runAsync("INSERT INTO settings (key, value) VALUES ('daily_review_count', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", String(next.count));
  return next.count;
}

export async function getDailyReviewProgress(timestamp = Date.now()) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE key IN ('daily_review_date', 'daily_review_count')"
  );
  const values = new Map(rows.map((row) => [row.key, row.value]));
  if (values.get('daily_review_date') !== reviewDayKey(timestamp)) return 0;
  return Math.max(0, Number(values.get('daily_review_count') ?? 0) || 0);
}

export async function changeDailyReviewProgress(delta: number, timestamp = Date.now()) {
  const db = await getDatabase();
  let nextCount = 0;
  await withDatabaseTransaction(db, async () => {
    nextCount = await changeDailyReviewProgressInTransaction(db, delta, timestamp);
  });
  return nextCount;
}

export async function getReviewSourceSummary(now = Date.now()): Promise<ReviewSourceSummary> {
  const db = await getDatabase();
  const recentStart = now - 30 * 24 * 60 * 60 * 1000;
  const row = await db.getFirstAsync<any>(`
    SELECT
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS all_count,
      SUM(CASE WHEN status = 'active' AND category = 'screenshot' THEN 1 ELSE 0 END) AS screenshot_count,
      SUM(CASE WHEN status = 'active' AND COALESCE(actual_bytes, estimated_bytes) >= ${10 * 1024 * 1024} THEN 1 ELSE 0 END) AS large_count,
      SUM(CASE WHEN status = 'active' AND created_at >= ? THEN 1 ELSE 0 END) AS recent_count
    FROM photos
  `, recentStart);
  const years = await db.getAllAsync<{ year: string; count: number }>(`
    SELECT strftime('%Y', created_at / 1000, 'unixepoch', 'localtime') AS year, COUNT(*) AS count
    FROM photos WHERE status = 'active' AND created_at > 0
    GROUP BY year ORDER BY year DESC
  `);
  const all = Number(row?.all_count ?? 0);
  return {
    counts: {
      all,
      screenshot: Number(row?.screenshot_count ?? 0),
      large: Number(row?.large_count ?? 0),
      recent: Number(row?.recent_count ?? 0)
    },
    years: years
      .map((item) => ({ year: Number(item.year), count: Number(item.count) }))
      .filter((item) => Number.isInteger(item.year))
  };
}

export async function createReviewSession(input: {
  source: ReviewSource;
  sourceValue?: string | null;
  targetCount: number;
  now?: number;
}): Promise<ReviewSession | null> {
  const db = await getDatabase();
  const now = input.now ?? Date.now();
  const targetCount = Math.max(1, Math.min(50, Math.floor(input.targetCount) || 50));
  const sourceValue = input.sourceValue ?? null;
  const query = buildReviewSourceQuery(input.source, sourceValue, now);
  const candidates = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM photos WHERE ${query.where} ORDER BY ${query.orderBy} LIMIT ?`,
    ...query.params,
    targetCount
  );
  if (!candidates.length) return null;
  await withDatabaseTransaction(db, async () => {
    await db.execAsync('DELETE FROM review_session_items; DELETE FROM review_sessions;');
    await db.runAsync(
      `INSERT INTO review_sessions (id, source, source_value, target_count, status, started_at, updated_at)
       VALUES (1, ?, ?, ?, 'active', ?, ?)`,
      input.source,
      sourceValue,
      targetCount,
      now,
      now
    );
    for (let index = 0; index < candidates.length; index += 1) {
      await db.runAsync(
        'INSERT INTO review_session_items (session_id, photo_id, position) VALUES (1, ?, ?)',
        candidates[index]!.id,
        index
      );
    }
  });
  return getReviewSession();
}

export async function getReviewSession(includeCompleted = false): Promise<ReviewSession | null> {
  const db = await getDatabase();
  const session = await db.getFirstAsync<any>(
    `SELECT * FROM review_sessions WHERE id = 1 ${includeCompleted ? '' : "AND status = 'active'"} LIMIT 1`
  );
  if (!session) return null;
  const items = await db.getAllAsync<any>(`
    SELECT photos.* FROM review_session_items
    JOIN photos ON photos.id = review_session_items.photo_id
    WHERE review_session_items.session_id = 1
      AND review_session_items.decision IS NULL
      AND photos.status = 'active'
    ORDER BY review_session_items.position ASC
  `);
  const counts = await db.getFirstAsync<any>(`
    SELECT
      SUM(CASE WHEN decision = 'kept' THEN 1 ELSE 0 END) AS kept_count,
      SUM(CASE WHEN decision = 'trashed' THEN 1 ELSE 0 END) AS trashed_count,
      SUM(CASE WHEN decision IS NOT NULL THEN 1 ELSE 0 END) AS decided_count
    FROM review_session_items WHERE session_id = 1
  `);
  return {
    id: 1,
    source: session.source as ReviewSource,
    sourceValue: session.source_value === null ? null : String(session.source_value),
    targetCount: Number(session.target_count),
    startedAt: Number(session.started_at),
    completed: session.status === 'completed',
    items: items.map(rowToPhoto),
    keptCount: Number(counts?.kept_count ?? 0),
    trashedCount: Number(counts?.trashed_count ?? 0),
    canUndo: Number(counts?.decided_count ?? 0) > 0
  };
}

export async function decideReviewPhoto(photoId: string, status: Extract<PhotoStatus, 'kept' | 'trashed'>, timestamp = Date.now()) {
  const db = await getDatabase();
  let dailyReviewed = 0;
  let completed = false;
  let unavailable = false;
  await withDatabaseTransaction(db, async () => {
    const active = await db.getFirstAsync<{ id: number }>("SELECT id FROM review_sessions WHERE id = 1 AND status = 'active'");
    if (!active) { unavailable = true; return; }
    const target = await db.getFirstAsync<{ decision: string | null; status: string }>(`
      SELECT review_session_items.decision, photos.status
      FROM review_session_items
      JOIN photos ON photos.id = review_session_items.photo_id
      WHERE review_session_items.session_id = 1 AND review_session_items.photo_id = ?
      LIMIT 1
    `, photoId);
    if (!canDecideReviewTarget(Boolean(active), target ?? null)) { unavailable = true; return; }
    const rows = await db.getAllAsync<{ photo_id: string; position: number; decision: 'kept' | 'trashed' | null; decided_at: number | null }>(
      'SELECT photo_id, position, decision, decided_at FROM review_session_items WHERE session_id = 1 ORDER BY position'
    );
    let policy: ReturnType<typeof applyReviewDecision>;
    try {
      policy = applyReviewDecision(rows.map((item) => ({ photoId: item.photo_id, position: Number(item.position), decision: item.decision, decidedAt: item.decided_at === null ? null : Number(item.decided_at) })), photoId, status, timestamp);
    } catch (error) {
      if (error instanceof Error && error.message === 'review_item_unavailable') { unavailable = true; return; }
      throw error;
    }
    await db.runAsync('UPDATE photos SET status = ? WHERE id = ?', status, photoId);
    await db.runAsync(
      'UPDATE review_session_items SET decision = ?, decided_at = ? WHERE session_id = 1 AND photo_id = ?',
      status,
      timestamp,
      photoId
    );
    dailyReviewed = await changeDailyReviewProgressInTransaction(db, 1, timestamp);
    completed = policy.completed;
    await db.runAsync(
      "UPDATE review_sessions SET status = ?, updated_at = ? WHERE id = 1",
      completed ? 'completed' : 'active',
      timestamp
    );
  });
  return { dailyReviewed, completed, unavailable };
}

export async function undoLastReviewDecision(timestamp = Date.now()) {
  const db = await getDatabase();
  let restoredId: string | null = null;
  let dailyReviewed = 0;
  await withDatabaseTransaction(db, async () => {
    const rows = await db.getAllAsync<{ photo_id: string; position: number; decision: 'kept' | 'trashed' | null; decided_at: number | null }>(
      'SELECT photo_id, position, decision, decided_at FROM review_session_items WHERE session_id = 1 ORDER BY position'
    );
    const policy = undoLatestReviewDecision(rows.map((item): ReviewDecisionItem => ({ photoId: item.photo_id, position: Number(item.position), decision: item.decision, decidedAt: item.decided_at === null ? null : Number(item.decided_at) })));
    if (!policy.restoredId) return;
    restoredId = policy.restoredId;
    await db.runAsync("UPDATE photos SET status = 'active' WHERE id = ?", policy.restoredId);
    await db.runAsync(
      'UPDATE review_session_items SET decision = NULL, decided_at = NULL WHERE session_id = 1 AND photo_id = ?',
      policy.restoredId
    );
    await db.runAsync("UPDATE review_sessions SET status = 'active', updated_at = ? WHERE id = 1", timestamp);
    dailyReviewed = await changeDailyReviewProgressInTransaction(db, -1, timestamp);
  });
  return { restoredId, dailyReviewed };
}

export async function abandonReviewSession() {
  const db = await getDatabase();
  await db.execAsync('DELETE FROM review_session_items; DELETE FROM review_sessions;');
}

export async function getScanCheckpoint() {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ after_cursor: string | null; indexed_count: number }>(
    'SELECT after_cursor, indexed_count FROM scan_state WHERE id = 1'
  );
  return row ? { after: row.after_cursor ?? undefined, indexed: Number(row.indexed_count) } : null;
}

export async function beginFreshScan() {
  const db = await getDatabase();
  await withDatabaseTransaction(db, async () => {
    await db.execAsync('DELETE FROM scan_assets; DELETE FROM scan_state;');
    await db.runAsync('INSERT INTO scan_state (id, after_cursor, indexed_count, updated_at) VALUES (1, NULL, 0, ?)', Date.now());
  });
}

export async function recordScanPage(assetIds: string[], after: string | undefined, indexed: number) {
  const db = await getDatabase();
  await withDatabaseTransaction(db, async () => {
    for (const assetId of assetIds) {
      await db.runAsync('INSERT OR IGNORE INTO scan_assets (asset_id) VALUES (?)', assetId);
    }
    await db.runAsync(
      'UPDATE scan_state SET after_cursor = ?, indexed_count = ?, updated_at = ? WHERE id = 1',
      after ?? null,
      indexed,
      Date.now()
    );
  });
}

export async function completeScan() {
  const db = await getDatabase();
  await withDatabaseTransaction(db, async () => {
    await db.runAsync("DELETE FROM photos WHERE asset_id NOT LIKE 'demo-asset-%' AND asset_id NOT IN (SELECT asset_id FROM scan_assets)");
    await db.runAsync(
      "INSERT INTO settings (key, value) VALUES ('last_scan_at', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      String(Date.now())
    );
    await db.execAsync('DELETE FROM scan_assets; DELETE FROM scan_state;');
  });
}

export async function getPhotoAnalysisStates(assetIds: string[]) {
  const db = await getDatabase();
  const result = new Map<string, {
    modifiedAt: number;
    category: PhotoCategory;
    categorySource: 'auto' | 'manual';
    visualHash: string | null;
    averageColor: string | null;
    exactHash: string | null;
    actualBytes: number | null;
    analysisVersion: number;
  }>();
  if (!assetIds.length) return result;
  const placeholders = assetIds.map(() => '?').join(',');
  const rows = await db.getAllAsync<{
    asset_id: string;
    modified_at: number;
    category: PhotoCategory;
    category_source: 'auto' | 'manual';
    visual_hash: string | null;
    average_color: string | null;
    exact_hash: string | null;
    actual_bytes: number | null;
    analysis_version: number;
  }>(
    `SELECT asset_id, modified_at, category, category_source, visual_hash, average_color, exact_hash, actual_bytes, analysis_version
     FROM photos WHERE asset_id IN (${placeholders})`,
    ...assetIds
  );
  for (const row of rows) {
    result.set(row.asset_id, {
      modifiedAt: Number(row.modified_at),
      category: row.category,
      categorySource: row.category_source,
      visualHash: row.visual_hash,
      averageColor: row.average_color,
      exactHash: row.exact_hash,
      actualBytes: row.actual_bytes === null ? null : Number(row.actual_bytes),
      analysisVersion: Number(row.analysis_version ?? 0)
    });
  }
  return result;
}

export async function enqueuePhotoAnalysis(assetIds: string[]) {
  if (!assetIds.length) return;
  const db = await getDatabase();
  await withDatabaseTransaction(db, async () => {
    for (const assetId of assetIds) {
      await db.runAsync(
        `INSERT INTO analysis_queue (asset_id, state, attempts, updated_at) VALUES (?, 'queued', 0, ?)
         ON CONFLICT(asset_id) DO UPDATE SET state='queued', attempts=0, updated_at=excluded.updated_at`,
        assetId,
        Date.now()
      );
    }
  });
}

export async function claimPhotoAnalysisBatch(limit = 8): Promise<PhotoRecord[]> {
  const db = await getDatabase();
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 20));
  await db.runAsync("UPDATE analysis_queue SET state='queued' WHERE state='processing' AND updated_at < ?", Date.now() - 10 * 60 * 1000);
  const rows = await db.getAllAsync<any>(
    `SELECT photos.* FROM analysis_queue JOIN photos USING(asset_id)
     WHERE analysis_queue.state IN ('queued', 'error') AND analysis_queue.attempts < 3
     ORDER BY analysis_queue.updated_at ASC LIMIT ?`,
    safeLimit
  );
  const photos = rows.map(rowToPhoto);
  if (photos.length) {
    await withDatabaseTransaction(db, async () => {
      for (const photo of photos) {
        await db.runAsync("UPDATE analysis_queue SET state='processing', updated_at=? WHERE asset_id=?", Date.now(), photo.assetId);
      }
    });
  }
  return photos;
}

async function isCurrentPhotoAnalysis(
  db: Awaited<ReturnType<typeof SQLite.openDatabaseAsync>>,
  photo: Pick<PhotoRecord, 'assetId' | 'modifiedAt'>,
  queue: 'analysis_queue' | 'exact_hash_queue' | 'ocr_queue'
) {
  const current = await db.getFirstAsync<{ modified_at: number }>('SELECT modified_at FROM photos WHERE asset_id = ?', photo.assetId);
  if (current && Number(current.modified_at) === photo.modifiedAt) return true;
  if (current) await db.runAsync(`UPDATE ${queue} SET state = 'queued', updated_at = ? WHERE asset_id = ?`, Date.now(), photo.assetId);
  return false;
}

export async function finishPhotoAnalysis(photo: Pick<PhotoRecord, 'assetId' | 'modifiedAt'>, result: {
  visualHash: string | null;
  averageColor: string | null;
  actualBytes: number | null;
} | null, error?: string) {
  const db = await getDatabase();
  await withDatabaseTransaction(db, async () => {
    if (!(await isCurrentPhotoAnalysis(db, photo, 'analysis_queue'))) return;
    const { assetId } = photo;
    if (!error && result) {
      await db.runAsync(
        `UPDATE photos SET visual_hash = COALESCE(?, visual_hash), average_color = COALESCE(?, average_color), actual_bytes = COALESCE(?, actual_bytes), analysis_version = 2
         WHERE asset_id = ?`,
        result.visualHash,
        result.averageColor,
        result.actualBytes,
        assetId
      );
      await db.runAsync('DELETE FROM analysis_queue WHERE asset_id = ?', assetId);
    } else {
      await db.runAsync("UPDATE analysis_queue SET state='error', attempts=attempts+1, updated_at=? WHERE asset_id=?", Date.now(), assetId);
    }
  });
}

export async function enqueueExactHashCandidates() {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(`
    INSERT OR IGNORE INTO exact_hash_queue (asset_id, state, attempts, updated_at)
    SELECT p.asset_id, 'queued', 0, ? FROM photos p
    WHERE p.status != 'trashed' AND p.exact_hash IS NULL AND p.visual_hash IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM photos q
        WHERE q.id != p.id AND q.status != 'trashed'
          AND q.visual_hash = p.visual_hash
          AND q.width = p.width AND q.height = p.height
      )
  `, now);
}

export async function claimExactHashBatch(limit = 2): Promise<PhotoRecord[]> {
  const db = await getDatabase();
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 4));
  await db.runAsync("UPDATE exact_hash_queue SET state='queued' WHERE state='processing' AND updated_at < ?", Date.now() - 10 * 60 * 1000);
  const rows = await db.getAllAsync<any>(`
    SELECT photos.* FROM exact_hash_queue JOIN photos USING(asset_id)
    WHERE exact_hash_queue.state IN ('queued', 'error') AND exact_hash_queue.attempts < 3
    ORDER BY exact_hash_queue.updated_at ASC LIMIT ?
  `, safeLimit);
  const photos = rows.map(rowToPhoto);
  if (photos.length) {
    await withDatabaseTransaction(db, async () => {
      for (const photo of photos) {
        await db.runAsync("UPDATE exact_hash_queue SET state='processing', updated_at=? WHERE asset_id=?", Date.now(), photo.assetId);
      }
    });
  }
  return photos;
}

export async function finishExactHash(photo: Pick<PhotoRecord, 'assetId' | 'modifiedAt'>, exactHash: string | null, actualBytes: number | null, error?: string) {
  const db = await getDatabase();
  await withDatabaseTransaction(db, async () => {
    if (!(await isCurrentPhotoAnalysis(db, photo, 'exact_hash_queue'))) return;
    const { assetId } = photo;
    if (!error && exactHash) {
      await db.runAsync(
        'UPDATE photos SET exact_hash = ?, actual_bytes = COALESCE(?, actual_bytes) WHERE asset_id = ?',
        exactHash,
        actualBytes,
        assetId
      );
      await db.runAsync('DELETE FROM exact_hash_queue WHERE asset_id = ?', assetId);
    } else {
      await db.runAsync("UPDATE exact_hash_queue SET state='error', attempts=attempts+1, updated_at=? WHERE asset_id=?", Date.now(), assetId);
    }
  });
}

export async function getAnalysisQueueCount() {
  const db = await getDatabase();
  const [analysis, exact] = await Promise.all([
    db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM analysis_queue WHERE state != 'done' AND attempts < 3"),
    db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM exact_hash_queue WHERE state != 'done' AND attempts < 3")
  ]);
  return Number(analysis?.count ?? 0) + Number(exact?.count ?? 0);
}

export async function enqueuePhotoOcr(assetIds: string[], changedIds: string[] = []) {
  if (!assetIds.length) return;
  const db = await getDatabase();
  const placeholders = assetIds.map(() => '?').join(',');
  await db.runAsync(
    `DELETE FROM ocr_queue WHERE asset_id IN (${placeholders}) AND NOT EXISTS (
       SELECT 1 FROM photos WHERE photos.asset_id = ocr_queue.asset_id
         AND category IN ('screenshot', 'document') AND ocr_version = 0 AND status != 'trashed'
     )`,
    ...assetIds
  );
  if (changedIds.length) {
    await db.runAsync(
      `UPDATE ocr_queue SET state = 'queued', attempts = 0, error = NULL, updated_at = ?
       WHERE asset_id IN (${changedIds.map(() => '?').join(',')})`,
      Date.now(), ...changedIds
    );
  }
  await db.runAsync(
    `INSERT OR IGNORE INTO ocr_queue (asset_id, state, attempts, updated_at)
     SELECT asset_id, 'queued', 0, ? FROM photos
     WHERE asset_id IN (${placeholders}) AND asset_id NOT LIKE 'demo-asset-%'
       AND category IN ('screenshot', 'document') AND ocr_version = 0 AND status != 'trashed'`,
    Date.now(),
    ...assetIds
  );
}

export async function claimPhotoOcrBatch(limit = 1): Promise<PhotoRecord[]> {
  const db = await getDatabase();
  await db.runAsync("UPDATE ocr_queue SET state = 'queued' WHERE state = 'processing' AND updated_at < ?", Date.now() - 10 * 60_000);
  const rows = await db.getAllAsync(
    `SELECT photos.* FROM ocr_queue JOIN photos USING(asset_id)
     WHERE ocr_queue.state = 'queued' AND photos.ocr_version = 0
       AND photos.category IN ('screenshot', 'document') AND photos.status != 'trashed'
     ORDER BY photos.created_at DESC LIMIT ?`,
    Math.max(1, Math.min(limit, 8))
  );
  const photos = rows.map(rowToPhoto);
  await withDatabaseTransaction(db, async () => {
    for (const photo of photos) {
      await db.runAsync("UPDATE ocr_queue SET state = 'processing', updated_at = ? WHERE asset_id = ?", Date.now(), photo.assetId);
    }
  });
  return photos;
}

export async function finishPhotoOcr(photo: Pick<PhotoRecord, 'assetId' | 'modifiedAt'>, text: string | null, error?: string) {
  const db = await getDatabase();
  await withDatabaseTransaction(db, async () => {
    if (!(await isCurrentPhotoAnalysis(db, photo, 'ocr_queue'))) return;
    if (error) {
      await db.runAsync(
        "UPDATE ocr_queue SET state = 'error', attempts = attempts + 1, updated_at = ?, error = ? WHERE asset_id = ?",
        Date.now(), error.slice(0, 120), photo.assetId
      );
      return;
    }
    const result = await db.runAsync(
      'UPDATE photos SET ocr_text = ?, ocr_version = 1 WHERE asset_id = ? AND modified_at = ? AND ocr_version = 0',
      text?.trim() || null, photo.assetId, photo.modifiedAt
    );
    if (result.changes) await db.runAsync('DELETE FROM ocr_queue WHERE asset_id = ?', photo.assetId);
    else await db.runAsync("UPDATE ocr_queue SET state = 'queued', updated_at = ? WHERE asset_id = ?", Date.now(), photo.assetId);
  });
}

export async function retryFailedPhotoOcr() {
  const db = await getDatabase();
  await db.runAsync("UPDATE ocr_queue SET state = 'queued', attempts = 0, error = NULL, updated_at = ? WHERE state = 'error'", Date.now());
}

export async function getOcrQueueCount() {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM ocr_queue JOIN photos USING(asset_id) WHERE ocr_queue.state IN ('queued', 'processing') AND photos.status != 'trashed'"
  );
  return Number(row?.count ?? 0);
}

export async function getOcrStats() {
  const db = await getDatabase();
  const coverage = await db.getFirstAsync<{ total: number; done: number; skipped: number }>(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN ocr_version = 1 THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN ocr_version = -1 THEN 1 ELSE 0 END) AS skipped
    FROM photos WHERE category IN ('screenshot', 'document') AND status != 'trashed'
  `);
  const queue = await db.getFirstAsync<{ pending: number; failed: number }>(`
    SELECT SUM(CASE WHEN state IN ('queued', 'processing') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN state = 'error' THEN 1 ELSE 0 END) AS failed
    FROM ocr_queue JOIN photos USING(asset_id) WHERE photos.status != 'trashed'
  `);
  return {
    total: Number(coverage?.total ?? 0),
    done: Number(coverage?.done ?? 0),
    skipped: Number(coverage?.skipped ?? 0),
    pending: Number(queue?.pending ?? 0),
    failed: Number(queue?.failed ?? 0)
  };
}

export async function getLastScanAt() {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'last_scan_at'");
  return row ? Number(row.value) : null;
}

export async function getSimilarityCandidates(options?: { timeWindowMs?: number; ratioTolerance?: number }): Promise<PhotoRecord[]> {
  const db = await getDatabase();
  const timeWindowMs = Math.max(5_000, Math.min(options?.timeWindowMs ?? 30_000, 120_000));
  const ratioTolerance = Math.max(0.01, Math.min(options?.ratioTolerance ?? 0.04, 0.1));
  const rows = await db.getAllAsync(`
    SELECT p.id, p.asset_id, p.uri, p.filename, p.width, p.height,
      p.created_at, p.modified_at, p.category, p.status, p.favorite, p.ai_score,
      p.visual_hash, p.average_color, p.exact_hash, p.actual_bytes,
      p.analysis_version, p.estimated_bytes, '' AS search_text, NULL AS ai_description
    FROM photos p
    WHERE p.status = 'active' AND (
      p.exact_hash IN (
        SELECT exact_hash FROM photos
        WHERE status = 'active' AND exact_hash IS NOT NULL
        GROUP BY exact_hash HAVING COUNT(*) > 1
      )
      OR p.visual_hash IN (
        SELECT visual_hash FROM photos
        WHERE status = 'active' AND visual_hash IS NOT NULL
        GROUP BY visual_hash HAVING COUNT(*) > 1
      )
      OR EXISTS (
        SELECT 1 FROM photos q
        WHERE q.status = 'active' AND p.visual_hash IS NOT NULL AND q.visual_hash IS NOT NULL AND q.id != p.id
          AND q.created_at BETWEEN p.created_at - ? AND p.created_at + ?
          AND ABS((CAST(q.width AS REAL) / MAX(q.height, 1)) - (CAST(p.width AS REAL) / MAX(p.height, 1))) <= ?
      )
      OR (p.visual_hash IS NULL AND EXISTS (
        SELECT 1 FROM photos q
        WHERE q.status = 'active' AND q.visual_hash IS NULL AND q.id != p.id
          AND q.created_at BETWEEN p.created_at - 5000 AND p.created_at + 5000
          AND ABS(q.width - p.width) <= 20 AND ABS(q.height - p.height) <= 20
      ))
    )
    ORDER BY p.created_at ASC, p.id ASC
  `, timeWindowMs, timeWindowMs, ratioTolerance);
  return rows.map(rowToPhoto);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const db = await getDatabase();
  const row = (await db.getFirstAsync(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status != 'trashed' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'kept' THEN 1 ELSE 0 END) AS kept,
      SUM(CASE WHEN status = 'trashed' THEN 1 ELSE 0 END) AS trashed,
      SUM(CASE WHEN category = 'screenshot' AND status != 'trashed' THEN 1 ELSE 0 END) AS screenshots,
      SUM(CASE WHEN category = 'document' AND status != 'trashed' THEN 1 ELSE 0 END) AS documents,
      SUM(CASE WHEN category = 'travel' AND status != 'trashed' THEN 1 ELSE 0 END) AS travel,
      SUM(CASE WHEN category = 'food' AND status != 'trashed' THEN 1 ELSE 0 END) AS food,
      SUM(CASE WHEN category = 'pet' AND status != 'trashed' THEN 1 ELSE 0 END) AS pet,
      SUM(CASE WHEN category = 'portrait' AND status != 'trashed' THEN 1 ELSE 0 END) AS portraits,
      SUM(CASE WHEN category = 'other' AND status != 'trashed' THEN 1 ELSE 0 END) AS other_count,
      SUM(estimated_bytes) AS estimated_bytes,
      SUM(COALESCE(actual_bytes, estimated_bytes)) AS storage_bytes,
      SUM(CASE WHEN actual_bytes IS NOT NULL THEN actual_bytes ELSE 0 END) AS measured_bytes,
      SUM(CASE WHEN actual_bytes IS NOT NULL THEN 1 ELSE 0 END) AS measured_count,
      SUM(CASE WHEN status = 'trashed' AND actual_bytes IS NOT NULL THEN 1 ELSE 0 END) AS measured_trashed_count,
      SUM(CASE WHEN status = 'trashed' THEN COALESCE(actual_bytes, estimated_bytes) ELSE 0 END) AS reclaimable_bytes
    FROM photos
  `)) as any;

  const analysisPending = await getAnalysisQueueCount();

  const categoryCounts: Record<PhotoCategory, number> = {
    screenshot: Number(row?.screenshots ?? 0),
    document: Number(row?.documents ?? 0),
    travel: Number(row?.travel ?? 0),
    food: Number(row?.food ?? 0),
    pet: Number(row?.pet ?? 0),
    portrait: Number(row?.portraits ?? 0),
    other: Number(row?.other_count ?? 0)
  };

  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    pending: Number(row?.pending ?? 0),
    kept: Number(row?.kept ?? 0),
    trashed: Number(row?.trashed ?? 0),
    screenshots: Number(row?.screenshots ?? 0),
    categoryCounts,
    analysisPending,
    estimatedBytes: Number(row?.estimated_bytes ?? 0),
    storageBytes: Number(row?.storage_bytes ?? 0),
    measuredBytes: Number(row?.measured_bytes ?? 0),
    measuredCount: Number(row?.measured_count ?? 0),
    measuredTrashedCount: Number(row?.measured_trashed_count ?? 0),
    sizeCoverage: Number(row?.total ?? 0) ? Math.round((Number(row?.measured_count ?? 0) / Number(row.total)) * 100) : 0,
    reclaimableBytes: Number(row?.reclaimable_bytes ?? 0)
  };
}

export async function clearDatabase() {
  const db = await getDatabase();
  await db.execAsync("DELETE FROM review_session_items; DELETE FROM review_sessions; DELETE FROM exact_hash_queue; DELETE FROM analysis_queue; DELETE FROM scan_assets; DELETE FROM scan_state; DELETE FROM photos; DELETE FROM settings WHERE key IN ('daily_review_date', 'daily_review_count');");
}

export async function clearAllData() {
  const db = await getDatabase();
  await db.execAsync('DELETE FROM review_session_items; DELETE FROM review_sessions; DELETE FROM exact_hash_queue; DELETE FROM analysis_queue; DELETE FROM scan_assets; DELETE FROM scan_state; DELETE FROM photos; DELETE FROM settings;');
}
