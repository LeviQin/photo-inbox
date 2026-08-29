# SQLite 数据模型

数据库：`photo-inbox.db`

## photos

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | APP 内 ID，目前与 Asset ID 一致 |
| asset_id | TEXT UNIQUE | 系统相册 Asset ID |
| uri | TEXT | 相册 URI |
| filename | TEXT | 文件名 |
| width | INTEGER | 宽度 |
| height | INTEGER | 高度 |
| created_at | INTEGER | 创建时间 ms |
| modified_at | INTEGER | 修改时间 ms |
| category | TEXT | 本地分类 |
| status | TEXT | active / kept / trashed |
| favorite | INTEGER | 0 / 1 |
| ai_score | INTEGER | 当前启发式质量分 |
| estimated_bytes | INTEGER | 估算空间 |
| search_text | TEXT | 本地搜索文本 |

## settings

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
```

AI 开关保存在 settings 表，并在下次扫描时读取。

## 索引

```sql
CREATE INDEX idx_photos_created_at ON photos(created_at DESC);
CREATE INDEX idx_photos_status ON photos(status);
CREATE INDEX idx_photos_category ON photos(category);
```

## 建议升级

V1.2 可加入：

```sql
ocr_text TEXT
caption TEXT
phash TEXT
blur_score REAL
quality_score REAL
latitude REAL
longitude REAL
album_id TEXT
```

V1.3 可增加 embedding 表，避免直接把大向量塞进 photos：

```sql
CREATE TABLE photo_embeddings (
  photo_id TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  vector BLOB NOT NULL
);
```

正式做向量检索时建议评估 sqlite-vec。
