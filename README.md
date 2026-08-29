# Photo Inbox V1.0.0

一个基于 **React Native + Expo + TypeScript** 的本地优先图片管理 APP 示例工程。

目标不是再做一个普通系统相册，而是解决：照片太多、不敢删、截图堆积、难搜索、难整理。

## V1.0.0 已实现

- 系统相册授权与分页扫描
- SQLite 本地照片索引
- 首页照片概览
- 全部照片网格
- 本地智能分类：截图 / 文档 / 旅行 / 美食 / 宠物 / 人物 / 其他
- 今日整理：左右滑动“保留 / 移入回收站”
- 今日整理支持撤销上一张决定
- 应用内回收站
- 永久删除时调用系统照片删除接口
- 相似照片启发式分组
- AI 质量分启发式实现
- 本地关键词 / 时间词搜索
- 照片详情
- 收藏
- 清理中心
- 演示数据模式
- 设置与隐私页面
- 完整扩展接口，便于后续接 ONNX / ML Kit / Apple Vision

## 技术栈

- Expo SDK 57
- React Native 0.86
- React 19.2
- TypeScript
- Expo Router
- Expo Media Library
- Expo Image
- Expo SQLite
- Zustand
- FlashList
- React Native Animated / PanResponder

## 环境要求

推荐：

```bash
Node.js >= 22.13
npm >= 10
Android Studio 2025+
Xcode 26+（仅 macOS / iOS）
```

## 运行

```bash
npm install
npx expo install --fix
npm run doctor
npm start
```

### Android 真机

```bash
npm run android
```

### iOS 真机 / 模拟器

```bash
npm run ios
```

> Windows 无法本地编译 iOS，可以使用 EAS Build 或在 macOS 上构建。

## 首次运行

1. 进入首页。
2. 点击“允许访问并扫描”。
3. 授予照片权限。
4. APP 最多扫描 5000 张照片并写入 SQLite。
5. 如果在模拟器中没有照片，可以点击“先用演示数据体验”。

## 隐私设计

V1.0.0 没有任何照片上传服务：

- 原图不上传服务器。
- 没有内置第三方 AI Key。
- 分类和搜索索引均保存在设备 SQLite。
- “移入回收站”只修改 APP 内状态。
- 只有点击“永久删除”才调用系统相册删除接口。

## AI 能力说明

为了保证源码下载后可以直接运行，V1.0.0 默认没有携带大体积模型文件。

当前 AI 服务层实现：

- 文件名 + 图片比例分类
- 分辨率启发式质量评分
- 时间 + 尺寸相近的连拍 / 相似照片分组
- 本地关键词语义映射

接口集中在：

```text
src/services/aiService.ts
src/services/searchService.ts
```

后续可替换为：

- ONNX Runtime React Native
- CLIP / MobileCLIP Embedding
- Google ML Kit
- Apple Vision / Core ML
- OCR
- 人脸聚类
- 图像质量模型

详见 `docs/AI_INTEGRATION.md`。

## 目录

```text
photo-inbox/
├─ app/                    Expo Router 页面
│  ├─ (tabs)/              首页 / 相册 / 发现 / 我的
│  ├─ photo/[id].tsx       照片详情
│  ├─ review/              滑动整理
│  ├─ similar.tsx          相似照片分组
│  ├─ cleanup.tsx          清理中心
│  ├─ search.tsx           本地搜索
│  ├─ trash.tsx            回收站
│  └─ settings/            设置
├─ src/
│  ├─ components/          通用 UI 组件
│  ├─ constants/           Design Token
│  ├─ db/                  SQLite
│  ├─ services/            AI / 搜索 / 相册索引
│  ├─ store/               Zustand
│  ├─ types/               TypeScript 类型
│  └─ utils/               工具函数
├─ docs/                   完整开发文档
├─ scripts/                工程脚本
├─ app.json
├─ eas.json
├─ package.json
└─ README.md
```

## 重要限制

这是一份完整、可继续开发的 V1.0.0 工程源码，但不应把启发式分类误认为生产级视觉 AI。

如果要正式上架，建议在 V1.1~V1.3 完成：

1. 真正的 pHash / dHash 相似图片算法。
2. 缩略图后台任务队列。
3. ONNX / Core ML 图片 Embedding。
4. OCR。
5. 真实文件大小读取。
6. 数据库分页改为游标策略。
7. Android 大图库专项性能测试。
8. iOS Limited Photos 权限场景。
9. 崩溃监控与隐私政策。

## 文档索引

- `docs/PRODUCT_AND_UI.md`：产品与 UI
- `docs/ARCHITECTURE.md`：工程架构
- `docs/DATABASE.md`：数据模型
- `docs/AI_INTEGRATION.md`：AI 接入
- `docs/DEVELOPMENT.md`：开发指南
- `docs/TESTING.md`：测试方案
- `docs/BUILD_RELEASE.md`：构建发布
- `docs/KNOWN_LIMITATIONS.md`：已知限制
- `AGENTS.md`：给 Codex / Claude Code / Agent 的工程说明

## License

MIT，可作为个人项目、学习项目或商业项目基础继续开发。
