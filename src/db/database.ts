import * as SQLite from 'expo-sqlite';
import type { DashboardStats, PhotoRecord, PhotoStatus } from '@/types/photo';

export type AppSettingKey = 'localAI' | 'autoClassify' | 'searchIndex';
export type AppSettings = Record<AppSettingKey, boolean>;

const defaultSettings: AppSettings = {
  localAI: true,
  autoClassify: true,
  searchIndex: true
};

let databasePromise: ReturnType<typeof SQLite.openDatabaseAsync> | null = null;
let schemaPromise: Promise<void> | null = null;

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('photo-inbox.db');
  }
  const db = await databasePromise;
  if (!schemaPromise) {
    schemaPromise = db.execAsync(`
      PRAGMA journal_mode = WAL;
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
        status TEXT NOT NULL DEFAULT 'active',
        favorite INTEGER NOT NULL DEFAULT 0,
        ai_score INTEGER NOT NULL DEFAULT 50,
        estimated_bytes INTEGER NOT NULL DEFAULT 0,
        search_text TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_photos_status ON photos(status);
      CREATE INDEX IF NOT EXISTS idx_photos_category ON photos(category);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `).catch((error) => {
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
    estimatedBytes: Number(row.estimated_bytes),
    searchText: String(row.search_text)
  };
}

export async function upsertPhotos(photos: PhotoRecord[]) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const photo of photos) {
      await db.runAsync(
        `INSERT INTO photos (
          id, asset_id, uri, filename, width, height, created_at, modified_at,
          category, status, favorite, ai_score, estimated_bytes, search_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(asset_id) DO UPDATE SET
          uri=excluded.uri,
          filename=excluded.filename,
          width=excluded.width,
          height=excluded.height,
          created_at=excluded.created_at,
          modified_at=excluded.modified_at,
          category=excluded.category,
          ai_score=excluded.ai_score,
          estimated_bytes=excluded.estimated_bytes,
          search_text=excluded.search_text`,
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
        photo.estimatedBytes,
        photo.searchText
      );
    }
  });
}

export async function getPhotos(options?: {
  status?: PhotoStatus | 'all';
  category?: string;
  limit?: number;
  offset?: number;
  query?: string;
}): Promise<PhotoRecord[]> {
  const db = await getDatabase();
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (options?.status && options.status !== 'all') {
    clauses.push('status = ?');
    params.push(options.status);
  }
  if (options?.category) {
    clauses.push('category = ?');
    params.push(options.category);
  }
  if (options?.query?.trim()) {
    clauses.push('search_text LIKE ?');
    params.push(`%${options.query.trim().toLowerCase()}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(Math.floor(options?.limit ?? 300), 5000));
  const offset = Math.max(0, Math.floor(options?.offset ?? 0));
  const rows = await db.getAllAsync(
    `SELECT * FROM photos ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset
  );
  return rows.map(rowToPhoto);
}

export async function getPhoto(id: string): Promise<PhotoRecord | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync('SELECT * FROM photos WHERE id = ? LIMIT 1', id);
  return row ? rowToPhoto(row) : null;
}

export async function setPhotoStatus(id: string, status: PhotoStatus) {
  const db = await getDatabase();
  await db.runAsync('UPDATE photos SET status = ? WHERE id = ?', status, id);
}

export async function setManyPhotoStatus(ids: string[], status: PhotoStatus) {
  if (!ids.length) return;
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const id of ids) await db.runAsync('UPDATE photos SET status = ? WHERE id = ?', status, id);
  });
}

export async function toggleFavorite(id: string) {
  const db = await getDatabase();
  await db.runAsync('UPDATE photos SET favorite = CASE favorite WHEN 1 THEN 0 ELSE 1 END WHERE id = ?', id);
}

export async function removePhotoRows(ids: string[]) {
  if (!ids.length) return;
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const id of ids) await db.runAsync('DELETE FROM photos WHERE id = ?', id);
  });
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

export async function reconcilePhotos(assetIds: string[]) {
  const db = await getDatabase();
  await db.execAsync('CREATE TEMP TABLE IF NOT EXISTS scanned_assets (asset_id TEXT PRIMARY KEY NOT NULL)');
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM scanned_assets');
    for (const assetId of assetIds) {
      await db.runAsync('INSERT OR IGNORE INTO scanned_assets (asset_id) VALUES (?)', assetId);
    }
    await db.runAsync('DELETE FROM photos WHERE asset_id NOT IN (SELECT asset_id FROM scanned_assets)');
    await db.execAsync('DELETE FROM scanned_assets');
  });
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const db = await getDatabase();
  const row = (await db.getFirstAsync(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status != 'trashed' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status = 'kept' THEN 1 ELSE 0 END) AS kept,
      SUM(CASE WHEN status = 'trashed' THEN 1 ELSE 0 END) AS trashed,
      SUM(CASE WHEN category = 'screenshot' AND status != 'trashed' THEN 1 ELSE 0 END) AS screenshots,
      SUM(estimated_bytes) AS estimated_bytes,
      SUM(CASE WHEN status = 'trashed' THEN estimated_bytes ELSE 0 END) AS reclaimable_bytes
    FROM photos
  `)) as any;

  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    kept: Number(row?.kept ?? 0),
    trashed: Number(row?.trashed ?? 0),
    screenshots: Number(row?.screenshots ?? 0),
    estimatedBytes: Number(row?.estimated_bytes ?? 0),
    reclaimableBytes: Number(row?.reclaimable_bytes ?? 0)
  };
}

export async function clearDatabase() {
  const db = await getDatabase();
  await db.execAsync('DELETE FROM photos');
}

export async function clearAllData() {
  const db = await getDatabase();
  await db.execAsync('DELETE FROM photos; DELETE FROM settings;');
}
