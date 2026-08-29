# Photo Inbox UI / UX 迭代记录

日期：2026-08-30  
依据：`UI_UX_OPTIMIZATION_PLAN.md` V1.0 方案稿

## 本轮目标

在不改变本地优先、AI 推荐、回收站两阶段删除和人工确认边界的前提下，完成 P0 / P1 UI 基建和核心页面收敛。

## 已完成

### P0 基建

- `src/constants/theme.ts` 增加 Light / Dark 语义色、统一字号和间距/圆角基础。
- `Screen` 使用 Safe Area Insets，删除全局固定 `paddingBottom: 120`，增加内容最大宽度和键盘策略。
- `TopBar` 返回按钮扩大到 44×44，并补充无障碍 label。
- `PrimaryButton` 统一 52 高度、层级和 loading 状态。
- `BottomActionBar` 使用实际底部安全区，供回收站操作栏使用。
- 根状态栏随系统主题切换，Tab 栏高度和底部 padding 使用安全区。
- 增加 `metro.config.js`，让 Expo Web 正确解析 `expo-sqlite` 的 wasm 资源。

### P1 页面

- 今日：移除渐变 Hero 和虚拟数据竞争关系，保留待整理核心数字；没有数据时只显示真实授权/扫描状态；建议项按数据量显示。
- 图库：改为“图库”Tab，筛选项保留 44px 外层触控区，空分类显示明确空状态；网格根据真实容器宽度和断点决定列数。
- 发现：改为搜索入口 + 有数据的分类列表 + 搜索建议，移除未完成功能“回忆”宣传。
- 设置：移除“Photo Inbox 用户”、头像和锁形 emoji，展示本地索引、回收站、本地功能开关、隐私和版本状态。
- 搜索：输入、返回、清空和建议词均满足 44px 触控目标，补充无结果清除动作和 Android 键盘高度策略。
- 详情：信息合并为 grouped section，主图 `contain`，支持轻触全屏，AI 文案只描述当前真实本地启发式能力。
- 今日整理：完整图 `contain`，动作改为“移至回收站 / 保留”，按钮同时有图标和文字；卡片高度按舞台实际高度计算，原生平台使用原生驱动动画，减少移动端掉帧风险。
- 相似照片：标题区允许换行，操作目标扩大，保留推荐 badge 和真实空状态。
- 回收站：移除绝对定位 footer，改为普通底部安全区感知操作栏；单张恢复为 44×44，永久删除确认包含数量、估算空间和不可恢复说明。
- 清理中心：只展示有数据的建议，没有建议时显示明确“暂无建议”。

### 文档

- 更新 `docs/PRODUCT_AND_UI.md`，同步新的四 Tab 信息架构、语义主题、空状态、删除和无障碍规则。

## 验证记录

通过：

- `npm run typecheck`
- `npm run validate`
- Expo Web 启动并完成 Metro 打包；`expo-sqlite` wasm 资源可解析。
- 浏览器检查首屏空状态、四个 Tab、发现页空分类、搜索输入/清空/无结果、设置、整理/相似/回收站/详情空状态。
- 375×667 小屏检查：首屏无底部遮挡，搜索/返回/建议词/主按钮均达到 44px 触控目标；1024px 宽度检查：内容按最大宽度居中。
- 浏览器运行时无 error；整理页 Web 调试环境不再错误声明原生动画驱动。

未完成或需实体设备：

- `npm run doctor` 受当前环境 npm cache `EPERM` / registry 访问影响，未能完成；不是源码诊断结果。
- 未在实体 Android/iOS 上验证真实相册权限、Limited Photos、系统导航栏、Dynamic Type 200%、VoiceOver/TalkBack、Reduce Motion、真实照片整理和系统永久删除。
- 未执行 Android Release / iOS Release 构建；这些项目规则要求在可用实体环境继续完成。
- 为了不清空本地应用索引，本轮没有点击“重新生成演示数据”，因此带真实照片的连续整理、相似照片操作和回收站非空操作仍需设备/fixture 验证。

## Review 结果与修复

本轮 review 发现并已修复：

1. `PhotoGrid` 初次布局后如果断点变化，FlashList 可能沿用旧列数；已用列数作为 key 稳定重建。
2. 整理页原实现使用固定 92% 高度和 `useNativeDriver: false`；已改为舞台实测高度，原生平台启用 native driver，Web 端按平台降级。
3. 整理完成后仍可能显示可点击的“继续整理 0 张”；已改为静态完成状态。
4. Web 缺少 `react-dom` / `react-native-web` 且 wasm 未纳入 Metro 资源解析；已补齐运行依赖和 Metro 配置。

## 后续验收顺序

1. 在 Android 小屏、Android 手势导航、iPhone 小屏和 iPhone Dark Mode 上走真实照片流程。
2. 开启 200% 字体、屏幕阅读器和 Reduce Motion，逐项核对今日整理、详情和回收站。
3. 执行 `npm run doctor`、Android Release、iOS Release，并补充实体设备结果。
4. 若发现真机问题，按 `UI-001` 起编号回填到本文件或独立问题记录。
