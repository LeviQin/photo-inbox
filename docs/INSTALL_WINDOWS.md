# Windows 开发环境安装

适用于 Android 开发。

iOS 编译仍需要 macOS 或 EAS Build。

## 1. Node.js

安装 Node.js 22 LTS 或满足 Expo SDK 57 最低要求的版本。

验证：

```powershell
node -v
npm -v
```

## 2. Android Studio

安装：

- Android Studio
- Android SDK
- Android SDK Platform 36
- Android SDK Build-Tools
- Android Emulator

配置环境变量示例：

```text
ANDROID_HOME=C:\Users\你的用户名\AppData\Local\Android\Sdk
```

Path：

```text
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
```

验证：

```powershell
adb version
```

## 3. 安装项目

```powershell
cd photo-inbox-v1.0.0
npm install
npx expo install --fix
npm run validate
npm run doctor
```

## 4. Expo 模式

先快速预览：

```powershell
npm start
```

相册功能建议直接使用 Android 真机。

## 5. Development Build

```powershell
npx expo prebuild
npm run android
```

## 6. 手机连接

打开 Android：

```text
开发者选项
USB 调试
```

验证：

```powershell
adb devices
```

## 7. 常见问题

### SDK 版本不匹配

```powershell
npx expo install --fix
```

### Metro 缓存

```powershell
npx expo start -c
```

### Android 构建缓存

```powershell
cd android
.\gradlew clean
cd ..
```

### 相册为空

在真机授权系统照片权限，或者首页选择“先用演示数据体验”。
