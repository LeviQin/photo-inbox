# 图序（Photo Inbox）

图序是一款基于 **React Native、Expo 与 TypeScript** 构建的本地优先照片整理应用，提供照片索引、分类、搜索、相似照片分析和可回退的清理流程。

它面向照片数量较多、截图集中、重复照片难以筛选等日常场景，帮助用户在保留最终确认权的前提下，逐步整理自己的相册。

## 主要功能

- 系统相册完整/部分授权、权限恢复与可恢复分页扫描
- 合并相册变化事件；iOS 按变化明细增量更新，Android 与前台恢复分页校验，扫描中变化会重新校验
- SQLite 本地照片索引
- 数据库游标分页，网格与搜索按需加载
- 首页照片概览
- 全部照片网格
- 本地智能分类：截图 / 文档 / 旅行 / 美食 / 宠物 / 人物 / 其他
- 全部待整理、截图、大文件、最近 30 天和按年份的整理来源
- 10 / 20 / 30 / 50 张每日目标，整理会话和决定事务化持久化，可跨重启继续与撤销
- 应用内回收站
- 永久删除时调用系统照片删除接口，并逐项核对删除结果
- Android / iOS 端侧 dHash、平均色与真实文件大小分析；仅候选重复项读取原文件 SHA-256
- 严格 / 均衡 / 宽松三档相似分组，区分精确重复与视觉相似，所有处理都需二次确认
- 持久化后台分析队列，应用重启或系统后台任务可继续处理
- SQLite 写事务串行提交；照片编辑后丢弃旧分析结果并保留新任务
- 基础质量估分（明确标注为规则结果）
- 本地关键词 / 今年 / 去年 / 最近 N 天 / 大文件搜索
- 分类同义词组内匹配，分类、文字、日期和大小组合筛选；文件名通配符按字面检索
- Android ML Kit / iOS Vision 本机识别截图与文档文字，持久队列可暂停和重试
- SQLite FTS5 文字索引，搜索结果显示命中来源和片段
- 基于实际候选的清理任务、90 天前截图筛选和图库整日批量选择
- 扫描、真实大小覆盖率和文字识别进度页
- 3 / 4 / 5 列日期分组图库与双指缩放密度切换
- 图片主体与可拖动信息面板详情页
- 收藏
- 清理中心
- 演示数据模式
- 设置与隐私页面
- 完整扩展接口，便于后续接视觉语义模型

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

### Android Release APK

```bash
npm run build:android:apk
```

Windows 本地打包会复用 JDK 17 与短路径构建流程，产物位置以构建脚本输出为准。

### iOS 真机 / 模拟器

```bash
npm run ios
```

> Windows 无法本地编译 iOS，可以使用 EAS Build 或在 macOS 上构建。

## 首次运行

1. 进入首页。
2. 点击“允许访问并扫描”。
3. 授予照片权限。
4. APP 分页扫描授权范围内的照片并写入 SQLite；中断后会从检查点继续。
5. 如果在模拟器中没有照片，可以点击“先用演示数据体验”。

## 数据处理方式

照片整理默认在本机进行：

- 索引、规则分类和相似分组不上传照片。
- 截图和文档的本机识字不上传照片；云端识字、单张照片理解和相似组比较仅在用户逐次确认后发送压缩图。AI 搜索扩展只发送搜索文字。
- AI API Key 保存在设备安全存储中；识别文字保存在本地 SQLite，可搜索和逐张清除。
- 没有内置第三方 AI Key。
- 分类和搜索索引均保存在设备 SQLite。
- “移入回收站”只修改 APP 内状态。
- 只有点击“永久删除”才调用系统相册删除接口。

## 可选 AI 能力

Android ML Kit 和 iOS Vision 用于本机识别截图与文档文字；项目没有内置视觉语义模型或 AI Key。Expo Go 和 Web 不包含本机识字模块，需要安装原生构建。

当前 AI 服务层实现：

- 文件名 + 图片比例分类
- 分辨率启发式质量评分
- Android / iOS 原生缩略图 dHash、平均色、文件大小与候选项 SHA-256
- 本地关键词和时间范围映射
- 本机自动识别截图与文档文字；用户确认后可选云端识字与单张照片理解，并可手动采用 AI 分类建议
- 用户确认后的相似组图像比较；结果只设置当前保留建议，不触发回收站操作
- 自然语言搜索扩展到本地分类、文件名和已识别文字；只向 AI 发送查询文字
- 可配置的 OpenAI Chat Completions 兼容接口，并可在设置中测试文字连接

接口集中在：

```text
src/services/aiApi.ts
src/services/aiFeatures.ts
src/services/aiService.ts
src/services/searchService.ts
```

后续可替换为：

- ONNX Runtime React Native
- CLIP / MobileCLIP Embedding
- Core ML 视觉理解
- 人脸聚类
- 图像质量模型

## 目录

```text
photo-inbox/
├─ app/                    Expo Router 页面
│  ├─ (tabs)/              今日 / 图库 / 设置
│  ├─ photo/[id].tsx       照片详情
│  ├─ review/              滑动整理
│  ├─ similar.tsx          相似照片分组
│  ├─ cleanup.tsx          清理中心
│  ├─ analysis.tsx         分析状态
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
├─ scripts/                工程脚本
├─ app.json
├─ eas.json
├─ package.json
└─ README.md
```

## 当前边界

- 本机文字识别已经接入，但启发式分类不能当作生产级视觉语义 AI。
- Android / iOS 真机、大图库性能、后台任务和系统权限场景仍需完成最终回归测试。
- 正式发布前需要配置自己的 applicationId、生产签名和商店资料。

## License

MIT，可作为个人项目、学习项目或商业项目基础继续开发。
