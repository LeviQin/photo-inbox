# Photo Inbox V1.0.0 架构文档

## 1. 目标

架构遵循三个原则：

1. Local First：照片数据默认不出设备。
2. Progressive Native：80% TypeScript，性能瓶颈再下沉 Swift / Kotlin。
3. AI Replaceable：页面不直接依赖某个模型 SDK，统一经过 Service 层。

## 2. 总体架构

```text
┌──────────────────────────────────┐
│             UI / Router          │
│ Expo Router + React Native       │
└────────────────┬─────────────────┘
                 │
┌────────────────▼─────────────────┐
│             Zustand             │
│ 页面状态 / 扫描进度 / 数据刷新    │
└────────────────┬─────────────────┘
                 │
        ┌────────┴─────────┐
        │                  │
┌───────▼────────┐  ┌──────▼─────────┐
│ SQLite          │  │ Service Layer  │
│ 照片索引         │  │ AI / Search    │
│ 状态 / 标签      │  │ MediaLibrary   │
└───────┬────────┘  └──────┬─────────┘
        │                  │
        └────────┬─────────┘
                 ▼
       iOS Photos / Android MediaStore
```

## 3. 页面层

页面不直接写 SQL。

推荐数据流：

```text
Screen
  ↓
Zustand Action
  ↓
DB / Service
  ↓
Zustand refresh()
  ↓
Screen re-render
```

## 4. 相册索引

`src/services/photoIndexer.ts`

首次扫描：

```text
申请权限
  ↓
MediaLibrary.getAssetsAsync
  ↓ 每批 150
转换 PhotoRecord
  ↓
AI 启发式分类
  ↓
SQLite UPSERT
  ↓
更新进度
```

最大默认扫描：5000 张。

正式产品建议增加：

- lastIndexedCreationTime
- 增量监听
- 后台队列
- 断点续扫
- 分批获取真实文件大小

## 5. 今日整理队列

`app/review/index.tsx`

整理页进入时创建固定快照：

```text
queue = 当前 status=active 的前 50 张
```

为什么不每次从 Store 动态过滤？

因为滑动一张后状态变化会让数组长度改变，如果同时 `index + 1`，会导致跳过下一张。

所以一次整理会话必须使用固定 Queue。

## 6. 删除模型

Photo Inbox V1 使用双阶段删除：

```text
active
  ↓ 用户左滑
trashed（只改 SQLite）
  ↓ 用户在回收站点击永久删除
MediaLibrary.deleteAssetsAsync
  ↓ 成功
删除 SQLite Row
```

避免 AI 或误操作直接删除系统照片。

## 7. AI 抽象

UI 禁止直接调用 ONNX / ML Kit。

所有 AI 能力放到：

```text
src/services/aiService.ts
```

未来建议拆分：

```text
src/ai/
├─ classifier.ts
├─ similarity.ts
├─ quality.ts
├─ ocr.ts
├─ embeddings.ts
└─ nativeBridge.ts
```

## 8. 性能策略

当前：

- SQLite WAL
- 索引：created_at / status / category
- 相册分页扫描
- Expo Image 缓存
- FlashList 图片网格
- 最多将 5000 条记录加载进 Zustand；照片网格与回收站使用 FlashList 虚拟化

大图库正式版建议：

- Zustand 不保存全部照片
- 页面使用 SQL Cursor Pagination
- 缩略图本地缓存
- Worker / Native Queue
- pHash 运算下沉 Kotlin / Swift / C++
- Embedding 批处理

## 9. Native Module 边界

优先保持 TS：

- UI
- 数据库
- 搜索编排
- 业务状态
- 页面交互

建议 Native：

- 高性能图片解码
- pHash / perceptual hash
- HEIC 特殊处理
- Core ML / ML Kit
- 后台任务
- 大批量 EXIF

## 10. 推荐演进

### V1.1

pHash + 更准确相似照片。

### V1.2

OCR + 截图语义索引。

### V1.3

CLIP / MobileCLIP Embedding。

### V1.5

人物聚类 + 地点回忆。

### V2.0

端侧 AI Photo Inbox 完整生命周期管理。
