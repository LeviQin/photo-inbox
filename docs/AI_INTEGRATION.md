# AI 集成指南

## 1. 为什么 V1.0.0 不直接附带模型

如果直接把 CLIP / OCR / 质量评分模型放入安装包：

- APK / IPA 体积显著增加
- 不同手机推理性能差异很大
- Expo Go 无法承载部分原生推理依赖
- 用户拿到源码后可能无法直接运行

所以 V1.0.0 先保证产品闭环，并把 AI 放到可替换 Service Layer。

## 2. 当前能力

`src/services/aiService.ts`

- classifyPhoto
- getQualityScore
- buildSearchText
- findSimilarGroups

这些函数都可以保持签名不变、替换内部实现。

## 3. 推荐 AI 路线

### 阶段 A：pHash

用途：

- 重复图
- 连拍
- 相似构图

推荐把 pHash 放 Native Module。

返回：

```ts
interface HashResult {
  assetId: string;
  hash: string;
}
```

SQLite 保存 hash。

### 阶段 B：OCR

截图是 Photo Inbox 最有价值的场景。

建议：

Android：ML Kit Text Recognition

iOS：Vision VNRecognizeTextRequest

输出：

```ts
interface OCRResult {
  text: string;
  blocks: Array<{ text: string; confidence: number }>;
}
```

写入 `ocr_text`。

### 阶段 C：图像 Embedding

模型可选：

- MobileCLIP
- SigLIP Mobile 变体
- 自己转换的 ONNX 图像编码器

流程：

```text
照片缩略图
  ↓
Image Encoder
  ↓
Embedding
  ↓
SQLite Vector Index
```

查询：

```text
“去年在日本吃拉面的照片”
  ↓
Text Encoder
  ↓
Query Embedding
  ↓
Vector Search
  ↓
时间过滤
```

## 4. ONNX Runtime 接入建议

不要直接在 Screen 中初始化模型。

推荐：

```text
src/ai/onnx/runtime.ts
src/ai/onnx/imageEncoder.ts
src/ai/onnx/qualityModel.ts
```

统一 Lifecycle：

```text
App 启动
  ↓
懒加载模型
  ↓
后台 Batch
  ↓
释放 Tensor
```

## 5. 图片预处理

模型输入建议始终使用缩略图，不要加载 12MP / 48MP 原图。

典型：

```text
224 × 224
256 × 256
384 × 384
```

避免 OOM。

## 6. 后台任务

不要在首次授权后同步分析 5000 张原图。

推荐：

```text
先写基础索引
  ↓
UI 可立即使用
  ↓
Background Queue
  ↓
OCR / Hash / Embedding
  ↓
逐步增强数据库
```

## 7. 隐私

端侧 AI 是产品核心卖点之一。

如果未来加入云端 AI：

- 必须明确标识
- 默认关闭原图上传
- 优先上传低清缩略图
- 提供“仅本地 AI”模式
- API Key 不允许写在 APP 源码
