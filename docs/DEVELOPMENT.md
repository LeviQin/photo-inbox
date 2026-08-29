# 开发指南

## 安装

```bash
npm install
npx expo install --fix
npm run doctor
```

为什么建议执行 `expo install --fix`：

Expo SDK 与 React Native 原生模块有严格版本匹配。该命令会按照当前 SDK 修正依赖版本。

## 启动 Metro

```bash
npm start
```

## 真机开发

本项目读取完整系统相册，建议尽早使用 Development Build，而不是长期依赖 Expo Go。

```bash
npx expo prebuild
npm run android
```

macOS：

```bash
npm run ios
```

## 页面开发规范

- 页面放 `app/`
- 通用组件放 `src/components/`
- SQL 只能放 `src/db/`
- 相册 API 放 `src/services/photoIndexer.ts`
- AI 不允许散落在页面
- Design Token 统一放 `src/constants/theme.ts`

## 新增分类

1. 修改 `PhotoCategory`。
2. 修改 `classifyPhoto()`。
3. 修改 `buildSearchText()`。
4. 相册 Filter 增加入口。
5. Discover 增加入口。

## 新增 SQLite 字段

正式产品禁止直接改 CREATE TABLE 就结束。

建议从 V1.1 引入 migration：

```text
schema_version = 2
ALTER TABLE photos ADD COLUMN ocr_text TEXT;
```

## 调试数据库

开发阶段可以临时：

```ts
const db = await getDatabase();
console.log(await db.getAllAsync('SELECT * FROM photos LIMIT 10'));
```

不要在生产大量打印 URI。

## 图片性能

禁止：

```text
一次性 getAssetInfoAsync 5000 张
一次性加载原始分辨率
ScrollView 直接渲染几千张 Image
```

推荐：

- FlashList
- Expo Image Cache
- 分页查询
- 缩略图
- 后台队列

## Android 权限

Photo Inbox 属于核心功能需要广泛访问媒体库的照片管理类 APP，但正式上架仍需按 Google Play 当前政策填写照片和视频权限声明。

## iOS 权限

需要处理：

- Full Access
- Limited Access
- Denied

V1.0.0 基础授权路径已经实现，正式版应增加 Limited Access 管理入口。
