# 构建与发布

## Development Build

```bash
npm install
npx expo install --fix
npx expo prebuild
npm run android
```

## EAS

安装：

```bash
npm install -g eas-cli
```

登录：

```bash
eas login
```

配置：

```bash
eas build:configure
```

Android Preview：

```bash
eas build --platform android --profile preview
```

iOS Preview：

```bash
eas build --platform ios --profile preview
```

Production：

```bash
eas build --platform all --profile production
```

## 正式包前修改

`app.json`：

```text
ios.bundleIdentifier
android.package
```

当前示例：

```text
com.example.photoinbox
```

必须换成你自己的 Bundle ID。

## 图标 / Splash

当前工程故意没有附带品牌资源，避免锁死产品名称。

正式版建议准备：

- icon.png：1024×1024
- adaptive-icon.png
- splash.png
- monochrome icon

## Android

重点检查：

- READ_MEDIA_IMAGES
- Google Play Photo and Video Permissions policy
- targetSdkVersion
- 64-bit

## iOS

重点：

- NSPhotoLibraryUsageDescription
- Limited Photos
- App Privacy Details

## 版本策略

```text
1.0.0  产品闭环
1.1.0  pHash
1.2.0  OCR
1.3.0  Embedding Search
1.5.0  Memories
2.0.0  完整端侧 AI
```
