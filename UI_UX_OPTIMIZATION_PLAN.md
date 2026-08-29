# Photo Inbox UI / UX 完整优化方案

> 版本：V1.0（方案稿）  
> 日期：2026-08-29  
> 目标：修复真机 UI 高风险问题，并在不改变本地优先、人工确认删除等产品边界的前提下，重做为偏 Apple 的克制、简约、内容优先风格。

## 1. 结论先行

本轮不应只做“换颜色、加圆角”。现有 UI 的核心问题来自四层：

1. **布局基础不稳定**：底部安全区、底部导航、固定高度、绝对定位和容器宽度计算混在页面里，容易在不同真机上出现遮挡、留白和溢出。
2. **视觉层级过重且碎**：几乎所有内容都被做成卡片，圆角、重字重和蓝紫色块使用频率过高，信息显得拥挤，不像 Apple 风格的“内容优先”。
3. **动态字体与无障碍不足**：大量 8–12pt 文本、800/900 字重和小于 44pt 的操作目标，会在大字体、低视力和单手操作场景中产生可用性问题。
4. **平台外观不完整**：`userInterfaceStyle` 配置为 `automatic`，但当前颜色和状态栏仍固定为浅色模式，深色真机下会出现明显割裂甚至低对比问题。

建议采用“**先修 UI 基建，再逐页收敛视觉，最后做真机矩阵验收**”的方式。预计 7–10 个开发日可完成第一轮高质量落地；其中 P0 真机问题应先在 2–3 天内解决。

## 2. 本方案的依据与边界

### 2.1 已审计范围

- Expo Router 根导航与四个 Tab。
- 首页、图库、发现、我的、搜索、详情、今日整理、清理中心、相似照片、回收站、设置。
- `Screen`、`TopBar`、`PrimaryButton`、`PhotoGrid`、`PhotoTile`、`EmptyState` 等公共组件。
- 主题常量、`app.json`、Android Manifest 与原生主题配置。
- 当前项目文档中的产品、删除、隐私和性能约束。

### 2.2 结论可信度

- 下文“代码已确认”项可以直接从当前实现定位。
- 下文“真机高风险”项是基于代码结构推断，实施前仍需用用户已经发现问题的真机、截图或录屏逐一复现和编号。
- 当前基线已经通过 `npm run validate` 与 `npm run typecheck`；这只能证明工程结构与类型正常，不能代表 UI 真机验收通过。

### 2.3 不改变的产品边界

- 照片默认只在本地处理，不增加上传逻辑。
- AI 只做推荐，不替用户决定。
- “移入回收站”和“永久删除系统照片”继续保持两阶段流程。
- 永久删除必须由用户明确确认。
- 页面不直接调用原始 SQL，MediaLibrary 仍放在 service 层。
- 不在这轮 UI 优化中重写 AI、搜索或数据库架构。

## 3. 当前 UI 问题清单

优先级定义：

- **P0**：可能导致遮挡、无法操作、误操作或深浅色不可读，必须先修。
- **P1**：明显影响真机体验和风格一致性，应在本轮完成。
- **P2**：体验增强，可在核心页面稳定后落地。

| 优先级 | 问题 | 当前证据 | 风险与处理方向 |
|---|---|---|---|
| P0 | 底部安全区依赖固定数值 | `Screen.tsx`、`PhotoGrid.tsx`、`similar.tsx` 都写死 `paddingBottom: 120`；Tab 高度写死 82；回收站底栏绝对定位 | 在手势导航、三键导航、iPhone Home Indicator 和不同字体下产生遮挡或大片空白。统一改为 `insets.bottom + 组件实际高度` |
| P0 | 自动深色配置与固定浅色实现冲突 | `app.json` 为 `automatic`，`theme.ts` 只有浅色值，根状态栏固定 `dark`，多处直接写十六进制颜色 | 深色模式下背景、文字、状态栏和系统导航栏可能割裂。要么正式做完整双主题，要么临时锁定 light；本方案选择完整双主题 |
| P0 | 关键图标操作小于 44pt | `TopBar` 返回按钮 36×40；搜索、整理页和回收站多处 Pressable 只有图标尺寸；单张恢复仅 28×28 | 真机难点按，且大字体/单手场景更差。所有交互目标至少 44×44，视觉图标可保持 18–24 |
| P0 | 删除决策页面使用 `cover` 裁切照片 | `review/index.tsx` 的主图为 `contentFit="cover"` | 用户可能在看不到完整画面的情况下做保留/回收站决定。改为完整预览 `contain`，并支持轻触全屏查看 |
| P1 | 大量 8–12pt 字号和固定高度 | 相似照片、回收站、设置、首页等页面大量小字；列表行和筛选项使用固定高度 | 动态字体后易截断、重叠；默认字号也偏小。建立统一文字样式，正文以 15–17 为主，辅助文字不低于 12 |
| P1 | 过度使用 800/900 字重 | 绝大多数标题、数字和按钮使用 800/900 | 中文系统字体在部分 Android 机型上字重映射不稳定，整体过“硬”。主要使用 400/500/600/700，900 仅保留极少数数据展示 |
| P1 | 页面头部实现不统一 | Tab 页使用 `TopBar`，详情/搜索/整理/回收站分别手写 Header | 返回区、标题位置、左右按钮尺寸和状态栏间距不一致。统一 `AppHeader`，Tab 页支持大标题，二级页使用紧凑标题 |
| P1 | 响应式布局不足 | `PhotoGrid` 按窗口宽度而非真实容器宽度计算；发现页使用 `48.5% + gap`；没有内容最大宽度 | 小屏可能溢出，平板显得过度拉伸；未来横屏或分屏也不稳。改为 `onLayout` 容器测量与断点布局 |
| P1 | 回收站底栏可能盖住列表 | `trash.tsx` 使用绝对定位 footer，列表只用固定 120 底间距 | 大字体、系统底部栏和加载文案变化时可能遮挡。使用安全区感知 `BottomActionBar`，列表 padding 来源于真实底栏高度 |
| P1 | 整理页尺寸与动画高风险 | 卡片高度为舞台的 92%，头/底操作区固定；动画 `useNativeDriver: false` | 小屏可能拥挤，连续滑动可能掉帧。按可用高度计算卡片，transform/opacity 动画启用 native driver，并支持 Reduce Motion |
| P1 | 无障碍语义基本缺失 | 图片、图标按钮、Tab 内卡片缺少 `accessibilityRole`、label、hint 和状态 | VoiceOver/TalkBack 难以理解页面。为所有交互元素补语义，照片需描述其序号、日期、分类和状态 |
| P1 | 页面卡片过多、渐变与色块过密 | 首页、发现、我的、设置均用多层卡片和大圆角 | 降低信息扫描效率，也不符合 Apple 的克制感。改为少量重点卡片 + 分组列表 + 分隔线 |
| P1 | “我的”存在虚拟用户表达 | `profile.tsx` 固定显示“Photo Inbox 用户”和头像 | 本地工具没有账户体系，不应制造身份信息。Tab 改为“设置”，展示存储、权限、隐私和版本状态 |
| P2 | 图标体系不统一 | 当前完全使用 Ionicons，不同图标的视觉重量不一致 | 第一阶段先统一尺寸和线宽；iOS 后续可评估 `expo-symbols`，Android 保持兼容图标回退 |
| P2 | 加载、空态、错误态不完整 | 有文本加载和部分空态，但缺少骨架、重试、权限分支和有限照片权限提示 | 建立统一状态组件，禁止用演示数据掩盖真实空状态 |

## 4. 新设计方向：Apple-inspired，而不是照搬 iOS

### 4.1 视觉关键词

**安静、通透、内容优先、系统感、少装饰、强反馈。**

具体表现：

- 照片是页面里颜色最丰富的元素，UI 本身尽量使用中性色。
- 每屏只保留一个最强视觉焦点，不让所有卡片同时“抢眼”。
- 品牌蓝紫色只用于主要动作、选中态、进度和链接，不作为大面积背景。
- 优先使用留白、字号、分组和细分隔线建立层级，减少阴影和边框。
- 圆角统一且减少种类，不把每一行都做成独立胶囊。
- iOS 追求系统自然感，Android 保留系统返回、触觉和导航习惯，不做生硬的 iOS 皮肤。

### 4.2 信息架构调整

底部导航建议调整为：

```text
今日    图库    发现    设置
```

- **今日**：概览、今日整理、AI 清理建议和最近照片。
- **图库**：所有照片、分类筛选、收藏和搜索入口。
- **发现**：语义搜索、智能分类和未来回忆能力。
- **设置**：相册权限、扫描状态、回收站、隐私、本地 AI 与版本。

删除“我的”里的虚拟头像和虚拟用户，保留真正与本地工具有关的信息。

## 5. 设计系统规范

### 5.1 颜色：从具体色值转为语义色

不要让页面直接使用 `#FFFFFF`、`#111318` 等值。页面只使用语义 token，亮/暗模式由主题层映射。

| Token | 用途 | Light fallback | Dark fallback |
|---|---|---:|---:|
| `bg.canvas` | 页面背景 | `#F2F2F7` | `#000000` |
| `bg.surface` | 分组内容/卡片 | `#FFFFFF` | `#1C1C1E` |
| `bg.elevated` | Sheet、浮层、底栏 | `#FFFFFF` | `#2C2C2E` |
| `fill.secondary` | 图标底、轻选中态 | `#E9E9EF` | `#2C2C2E` |
| `text.primary` | 主文字 | `#111111` | `#F5F5F7` |
| `text.secondary` | 次级说明 | `#6E6E73` | `#AEAEB2` |
| `text.tertiary` | 辅助信息 | `#8E8E93` | `#8E8E93` |
| `separator` | 分隔线 | `rgba(60,60,67,.18)` | `rgba(84,84,88,.65)` |
| `accent` | 主要动作/选中 | `#5856D6` | `#5E5CE6` |
| `accent.soft` | 极少量强调背景 | `#EFEEFF` | `#2A2748` |
| `success` | 完成/安全 | `#248A3D` | `#30D158` |
| `warning` | 提醒 | `#B25000` | `#FF9F0A` |
| `danger` | 永久删除 | `#D70015` | `#FF453A` |
| `overlay` | 图片遮罩 | `rgba(0,0,0,.38)` | `rgba(0,0,0,.52)` |

实施建议：

- 第一阶段继续在 `src/constants/theme.ts` 内维护 light/dark tokens，避免为了主题拆出过多文件。
- 使用 `useColorScheme()` 选择主题；状态栏样式、系统导航栏背景、输入框 placeholder、Switch 和所有浮层同时切换。
- 可以在 iOS 验证 `PlatformColor` 的语义系统色，但跨平台 fallback 必须保留。
- 颜色不能单独传达状态：回收站、保留、推荐都必须同时有图标或文字。

### 5.2 字体层级

使用系统字体，不引入自定义字体。中文环境以可读性优先，减少极重字重。

| 样式 | fontSize / lineHeight | 字重 | 用途 |
|---|---|---|---|
| `largeTitle` | 34 / 41 | 700 | Tab 页大标题，手机上每屏最多一个 |
| `title1` | 28 / 34 | 700 | 重点完成页、核心数字 |
| `title2` | 22 / 28 | 700 | 章节主标题 |
| `headline` | 17 / 22 | 600 | 卡片/分组标题 |
| `body` | 17 / 24 | 400 | 主要说明与列表主文字 |
| `callout` | 16 / 21 | 400/600 | 按钮与强调信息 |
| `subheadline` | 15 / 20 | 400 | 次级说明 |
| `footnote` | 13 / 18 | 400/600 | 元数据、提示 |
| `caption` | 12 / 16 | 500 | 图片角标；不再使用 8–10pt |

规则：

- 不关闭 `allowFontScaling`。
- 所有固定高度的文字容器改为 `minHeight`，允许垂直扩展。
- 只在确实不能换行的文件名、数字区域使用 `numberOfLines`，并提供完整无障碍 label。
- 用大字体测试到系统 200%；布局不能重叠，必要时从横向排列切换为纵向。

### 5.3 间距、圆角与阴影

```text
Spacing: 4 / 8 / 12 / 16 / 20 / 24 / 32
Radius:  10（小控件）/ 14（列表与输入）/ 20（重点卡片）/ 999（胶囊）
```

- 页面手机横向边距统一 20；小屏可降为 16；平板内容区最大宽度 680–760 并居中。
- 普通分组不用阴影，用背景层级或 0.5–1px 分隔线。
- 只有悬浮底栏、模态层或整理照片卡可以使用极轻阴影。
- 当前 22、24、26、28 等相近圆角收敛为 14 和 20 两档。

### 5.4 控件规范

- 所有可点击区域最小 **44×44pt**；图标本身保持 18–24pt。
- 主按钮高度 50–52，圆角 14，文字 16/600。
- 次按钮使用透明或中性填充，不再普遍使用大面积紫底。
- 破坏性按钮只用于永久删除；“移入回收站”使用普通动作样式并明确可恢复。
- 筛选器视觉高度可为 34–36，但外层可点击区域保持 44。
- Press 状态统一为轻微降低透明度或缩放至 0.98；disabled、loading 必须有清楚状态。
- 操作成功使用轻触觉；永久删除前警告使用 warning 触觉；系统开启 Reduce Motion 时取消大幅位移动画。

### 5.5 图片规范

- 图库缩略图：无圆角或 2–4 圆角，3 列手机网格，平板按真实容器宽度增加列数。
- 整理决策：必须完整显示照片，默认 `contain`，中性深色背景承接留白，禁止因 `cover` 裁切影响判断。
- 详情页：图片区域优先占据首屏，可轻触进入全屏；信息内容放在下方 grouped section。
- 网格图片传入目标尺寸、`recyclingKey` 和稳定缓存策略，避免快速滚动闪图或重复解码大图。
- 图片加载失败显示中性占位与重试，不显示不相关默认图。

## 6. 公共 UI 基建改造

### 6.1 `Screen`：统一安全区和页面宽度

改造目标：

- 用 `useSafeAreaInsets()` 计算顶部、底部和浮层占位。
- Tab 页与 Stack 页区分底部策略，不再全局写死 `paddingBottom: 120`。
- ScrollView 开启适合平台的 content inset 调整；列表页由 FlashList 自己消费 inset。
- 增加 `maxContentWidth` 和 `contentAlign`，平板居中而不是铺满。
- 支持 `keyboardDismissMode`、`keyboardShouldPersistTaps` 与 refresh 状态。

### 6.2 `AppHeader`：替代分散的 Header 写法

提供两种模式即可，避免过度抽象：

- `large`：Tab 首页使用 34pt 大标题，随滚动自然收敛或保持简洁固定。
- `compact`：二级页面使用 17pt 居中标题，左右操作各占至少 44pt。

统一处理返回、关闭、搜索、帮助、收藏、删除的触控区和无障碍 label。

### 6.3 `AppPressable` 与 `PrimaryButton`

- `AppPressable` 只封装统一 pressed/disabled/haptic/最小触控目标，不封装业务。
- `PrimaryButton` 增加 `primary / secondary / destructive / text` 四种明确层级。
- loading 时保持按钮尺寸和 label 空间稳定，防止布局跳动。

### 6.4 `BottomActionBar`

用于回收站和未来的批量选择：

- 高度由内容 + `insets.bottom` 得出。
- 列表底部 padding 使用底栏实测高度。
- 浅/深模式使用 elevated surface，可选轻微透明，不把 Blur 作为首轮依赖。
- 大字体下允许按钮纵向排列或底栏增高。

### 6.5 `PhotoGrid`

- 通过外层 `onLayout` 获取真实容器宽度，不直接用 window width。
- 手机：3 列；宽度 ≥ 600：4–5 列；宽度 ≥ 900：6–7 列。
- 统一 gap 2–3，避免 `flex + margin` 导致最后一列计算误差。
- 保持 FlashList 虚拟化；滚动状态下减少缩略图 transition。

### 6.6 状态组件

统一四类状态：

1. `LoadingState`：初始化、扫描、搜索中。
2. `EmptyState`：确实无照片/无结果，不制造演示内容。
3. `PermissionState`：拒绝、有限访问、需要去设置页授权。
4. `ErrorState`：明确原因、重试按钮、不会丢数据的说明。

## 7. 逐页重构方案

### 7.1 今日页（原首页）

目标：一眼知道“还有多少待整理、今天可以做什么”，减少数据仪表盘感。

新结构：

```text
Photo Inbox                                      搜索
今天，整理一点就好

[主要行动：继续整理 32 张]                       →
进度：本周已整理 68 张

建议处理
相似照片  8 组                         估算 126 MB
截图      214 张                       按时间查看

最近照片
[photo] [photo] [photo]
```

调整：

- 移除大面积渐变 hero 与黑色卡片的竞争关系。
- “可用照片、估算空间、截图、待清理、已整理百分比”不全部挤在首屏；核心保留待整理数量，其他数据进入次级摘要。
- 没有权限或没有照片时，只显示真实权限状态和主操作；“演示数据”移入开发设置，不作为普通用户的默认次按钮。
- AI 建议改为分组列表，每行一个清楚动作；只有数据大于 0 时显示。
- 最近照片不显示极小文件名，改为图片 + 日期分组，文件名留在详情页。

### 7.2 图库页

目标：照片占满注意力，筛选不抢空间。

- Header 使用大标题“图库”，右侧为搜索和可选选择按钮。
- 分类筛选改为横向 segmented/chips；44pt 触控区，选中态只用轻填充和语义文字色。
- 网格贴近内容边缘，但安全区和 Tab inset 保持正确。
- 筛选结果为空时明确显示“该分类暂无照片”，不显示其他分类内容。
- 后续批量选择采用顶部“选择”进入模式，不让每张照片永久显示选中控件。

### 7.3 发现页

目标：从“功能卡片合集”改为搜索与内容发现页。

- 顶部直接使用系统感搜索框，而不是一张可点击的伪输入框。
- 智能分类使用带封面预览的横向内容单元；没有照片的分类隐藏或显示为 disabled，不伪造封面。
- “试试这样找”改成最近搜索 + 搜索建议，最多展示 4–6 条。
- “回忆将在 V1.x 增强”属于开发说明，不应放在主产品界面；移到版本说明或隐藏，避免未完成能力抢占首屏。

### 7.4 设置页（替代“我的”）

目标：真实呈现本地状态，不制造账号概念。

分组建议：

```text
照片访问
  相册权限                         完整访问 / 有限访问 / 未授权
  重新扫描                         上次扫描时间

照片管理
  回收站                           18 张
  本地索引                         3,240 张 · 估算空间

智能功能
  本地分析                         Switch
  自动分类                         Switch
  搜索索引                         Switch

隐私与关于
  隐私说明
  版本                             1.0.0
  清空应用索引                     红色文字
```

- 删除头像、“Photo Inbox 用户”和锁形 emoji。
- 使用 iOS grouped list 的分组方式，列表项之间用 separator，不把每行做成独立卡片。
- 开发用演示数据仅在 development build 或开发分组中显示。

### 7.5 搜索页

- 搜索输入高度至少 44，返回和清空按钮各自有 44pt 触控区。
- Android 键盘 `adjustResize` 与结果列表同时验证，键盘不能盖住结果或 Tab。
- 搜索为空时展示真实能力与建议词，不承诺当前启发式无法做到的“看懂图片内容”。
- 结果数与筛选状态保持在滚动区域上方；无结果提供清除条件和返回图库两个动作。
- 大字体下建议词自动换行，不能被固定高度截断。

### 7.6 照片详情

- 顶部操作悬浮在图片上时使用可读的 material/半透明中性底；浅色图片和深色图片都要可见。
- 主图 `contain`，支持双击/双指缩放可列为 P2；第一阶段至少支持轻触全屏。
- 信息区从多个独立卡片合并为一个 grouped section：日期、尺寸、估算大小、分类和状态。
- AI 说明只显示当前真实结果，删除“未来接模型后可显示……”的工程文案。
- 收藏成功使用轻触觉并立即更新图标；移入回收站后给可撤销反馈。

### 7.7 今日整理

这是本轮最需要真机重点验收的页面。

- 主图完整展示，底部信息使用从透明到黑色的渐变，而不是单一黑色遮罩。
- 左滑文案明确为“移至回收站”，右滑为“保留”；不要使用含糊的“整理”。
- 操作按钮同时显示图标和文字，避免只靠颜色区分。
- 卡片高度根据 `window height - safe area - header - actions` 计算；小屏不允许底部按钮被挤出。
- 拖动过程中只动画 transform/opacity；完成后再提交状态。
- 按钮点击和手势共用同一个状态机，busy 时禁用手势与按钮。
- Reduce Motion 下取消旋转和飞出动画，仅淡出切换。
- 关闭页面时，如果已经整理过照片，显示“已保存本次进度”，不制造丢失焦虑。
- 完成页保留“撤销上一张”和“回到今日”，统计用 17pt 以上文字。

### 7.8 清理中心

- 顶部只展示一个关键数字：回收站可释放空间；明确“估算”和“永久删除后释放”。
- 相似照片、截图、回收站使用 grouped list，每行包含数量、预计收益和右箭头。
- “不会自动删除”作为页面底部隐私说明，不用高饱和绿色卡片。
- 数量为 0 的项目显示“暂无建议”，不要制造可点击但无结果的入口。

### 7.9 相似照片

- 组标题与“整理重复项”在小屏/大字体时改为上下布局，避免横向挤压。
- 图片尺寸根据内容容器计算；推荐保留 badge 不小于 12pt。
- 默认只推荐，不预选删除；用户点整理后用 bottom sheet 展示“保留 1 张、移入回收站 N 张”。
- 支持点开每张完整查看，返回后保留当前组位置。
- 完成一组后使用轻量撤销提示，而不是页面突变。

### 7.10 回收站

- Header 明确显示照片数量与估算空间。
- 单张恢复按钮扩大到 44pt，视觉图标可保持 18pt。
- 底部使用安全区感知操作栏；“全部恢复”为普通动作，“永久删除”为红色破坏性动作。
- 永久删除确认信息至少包含张数、估算空间、不可通过 Photo Inbox 恢复；随后仍尊重系统相册确认流程。
- 删除中锁定重复提交，保留当前页面与进度；失败时显示具体可重试状态。
- 空状态简洁显示“回收站为空”，不再占用过多垂直空间。

### 7.11 设置与隐私

- 合并到新的“设置”Tab，二级设置页只在确实需要时使用。
- Switch 行使用系统感 grouped list，高度随字体自适应。
- 所有说明文案改为真实当前能力，开发/架构说明移出产品 UI。
- “清空应用索引”与“永久删除照片”保持视觉与语义区分，前者必须说明不会删除系统照片。

## 8. 导航、转场与触觉

- Tab 切换不做自定义动画。
- Stack push 使用系统默认横向转场；全屏整理页可用 modal/fullScreenModal 语义，关闭按钮而非返回箭头。
- 删除确认优先使用系统 Alert；内容复杂时再用 bottom sheet，不为追求视觉自行实现不稳定弹窗。
- 普通页面动画控制在 180–240ms；不同时动画多个大面积元素。
- 触觉反馈：选择/筛选为 selection，保留/恢复为 light/success，永久删除警告为 warning；避免每次滚动或轻触都震动。
- iOS 可在第二阶段评估原生 Tab 或 SF Symbols；Expo 原生 Tab API当前仍应视为需要专项验证的选项，不作为 P0 修复的前置条件。

## 9. 无障碍与可读性验收

必须完成：

- 所有 Pressable 设置合适的 `accessibilityRole`、`accessibilityLabel`、必要的 `accessibilityHint`。
- Switch、选中筛选、收藏和照片状态设置 `accessibilityState`。
- 装饰图标从无障碍树隐藏，避免重复朗读。
- 图片 tile label 示例：“2026 年 8 月 29 日的截图，第 3 张，已收藏”。
- 语义阅读顺序与视觉顺序一致；整理页左右操作不能只朗读“按钮”。
- 200% 字体下无文字覆盖、按钮出屏、导航栏错位。
- Light/Dark 下正文对比度至少 4.5:1；大号粗体至少 3:1。
- 不依赖颜色表达“保留、回收站、推荐、危险”。
- Reduce Motion、Bold Text、屏幕阅读器开启时分别走一次核心流程。

## 10. 实施计划

### Phase 0：真机问题建档（0.5 天）

1. 收集用户已发现问题的设备型号、系统版本、字体大小、导航方式、截图/录屏。
2. 为每个问题编号：`UI-001`、`UI-002`……
3. 固定 8 个基线截图：首次授权、今日页、图库、搜索键盘、整理、详情、回收站、深色模式。

验收：每个已知问题都能在文档中对应到页面、设备与复现步骤。

### Phase 1：P0 基建（1.5–2 天）

涉及文件：

- `src/constants/theme.ts`
- `src/components/Screen.tsx`
- `src/components/TopBar.tsx`
- `src/components/PrimaryButton.tsx`
- `app/_layout.tsx`
- `app/(tabs)/_layout.tsx`
- 新增一个最小化的安全区底栏组件

工作：

- 完成 light/dark 语义主题。
- 删除固定 120 底间距和固定 Tab 安全区假设。
- 统一 44pt 触控目标和 Header。
- 状态栏随主题变化。

验收：底部无覆盖、深浅色可读、核心按钮都可稳定点按。

### Phase 2：核心 Tab 收敛（2 天）

- 重构今日、图库、发现、设置四个 Tab。
- 去除虚拟用户和未完成功能宣传。
- 降低卡片密度，建立 grouped list 与统一文字层级。
- PhotoGrid 改为容器测量与响应式列数。

验收：四个 Tab 在小屏、大屏、深色和 200% 字体下结构稳定。

### Phase 3：决策与删除流程（2 天）

- 重构整理、相似照片、详情和回收站。
- 完整图预览、动作语义、底部安全区、撤销、加载与失败状态。
- 动画改为可降级且不阻塞业务提交。

验收：左右滑、按钮整理、撤销、恢复、永久删除在真机完整走通，无误触与遮挡。

### Phase 4：无障碍、动效与性能（1–1.5 天）

- VoiceOver/TalkBack 语义。
- Reduce Motion、Bold Text、200% 字体。
- 5000 张图库滚动、图片内存和连续整理 100 次专项验证。

验收：无明显滚动闪图、持续掉帧、不可朗读按钮或大字体布局破坏。

### Phase 5：回归与视觉验收（1–2 天）

- 逐设备截图对比和几何测量。
- 修复差异，重新跑类型、工程、Android Release 与真机流程检查。
- 更新 `docs/PRODUCT_AND_UI.md`，使文档与最终实现一致。

## 11. 真机测试矩阵

### 11.1 尺寸与平台

| 类别 | 建议覆盖 | 重点 |
|---|---|---|
| Android 小屏 | 360×800 左右，4 GB RAM | 字体换行、底部三键导航、整理卡片高度 |
| Android 主流 | 412×915 左右，手势导航 | 底部安全区、网格、键盘、连续滚动 |
| iPhone 小屏 | 375×667 左右 | Header、整理页、底部按钮是否出屏 |
| iPhone 主流 | 393×852 左右 | Dynamic Type、深色、Home Indicator |
| iPhone 大屏 | 430×932 左右 | 内容宽度和留白是否过散 |
| iPad/大屏 | 至少一个 8 英寸级别尺寸 | 因 `supportsTablet: true`，必须验证最大宽度、网格列数和弹窗 |

### 11.2 系统状态

- Light / Dark。
- 默认字体 / 最大标准字体 / 200% Accessibility 字体。
- 手势导航 / Android 三键导航。
- 竖屏、前后台切换；项目当前锁定 portrait，不在本轮开放横屏。
- 键盘打开/关闭、中文输入法候选栏。
- 相册完整授权、拒绝授权、iOS Limited Photos、Android 部分照片访问。
- 0、50、1000、5000 张照片。

### 11.3 页面状态

- 初始化、加载、成功、空、失败、重试。
- 扫描中、扫描完成、扫描中切后台。
- 无搜索词、有结果、无结果、搜索索引关闭。
- 整理中、busy、撤销、50 张完成、中途退出。
- 回收站为空、有数据、恢复中、永久删除中、系统取消、删除失败。

## 12. 可量化验收标准

### 布局

- 所有设备上没有内容进入状态栏、Home Indicator 或 Android 导航栏不可见区域。
- 所有关键操作的布局尺寸至少 44×44pt。
- 200% 字体下无重叠、裁切、按钮出屏和不可滚动区域。
- 平板内容不会无上限拉宽；图库列数按容器变化。

### 视觉

- 同类页面只使用一套 Header、文字层级、圆角和分组方式。
- 每屏最多一个强强调区域；品牌色只表达交互、选中或进度。
- Dark Mode 不出现固定白底、黑字、浅色 placeholder 或错误状态栏。
- 不显示虚拟用户、未完成能力或无关默认图片。

### 交互

- 每个操作都有 pressed/disabled/loading/失败反馈。
- 整理页左右滑含义明确，照片不因裁切影响判断。
- 永久删除始终有明确确认，重复点击不会重复提交。
- VoiceOver/TalkBack 能完整走通今日整理、照片详情与回收站流程。

### 性能

- 5000 张数据下网格保持虚拟化，无持续白屏和明显闪烁。
- 连续整理 100 张时动画不持续卡顿，状态提交不跳项。
- 页面切换不重复解码无关大图；列表缩略图按显示尺寸加载。

## 13. 建议的代码落点

以最小改动为原则，不建立大型 UI 框架：

```text
src/constants/theme.ts          light/dark 语义色、字体、间距、圆角
src/components/Screen.tsx       安全区、内容宽度、滚动策略
src/components/TopBar.tsx       改为统一 AppHeader，或保留文件名重写实现
src/components/PrimaryButton.tsx 按钮层级、状态、44pt 规则
src/components/PhotoGrid.tsx    容器测量、响应式列数、底部 inset
src/components/PhotoTile.tsx    图片状态、可访问性、回收复用
src/components/BottomActionBar.tsx 仅新增这一项底部公共组件
app/(tabs)/*                    四个主 Tab 视觉与信息架构
app/review/index.tsx            完整图预览、响应式高度、动效
app/trash.tsx                   安全区底栏与删除反馈
app/similar.tsx                 小屏/大字体响应式分组
app/photo/[id].tsx              图片优先详情页
app/search.tsx                  键盘、触控区、状态
```

暂不建议第一轮引入完整第三方 UI Kit。现有 React Native、Expo Router、Expo Image、Safe Area Context 和 Animated 足以完成 P0/P1。Blur、原生 Tab、SF Symbols 或 Reanimated 只有在真机证明确有必要时再增加。

## 14. 提交与验收顺序建议

为了让每批改动都可单独回滚和真机验证，建议拆为：

1. `fix(ui): make theme and safe areas device-aware`
2. `refactor(ui): unify headers buttons and typography`
3. `refactor(ui): simplify main tabs and photo grid`
4. `fix(review): show full photos and stabilize controls`
5. `fix(trash): make destructive actions safe-area aware`
6. `feat(a11y): add dynamic type and screen reader support`
7. `docs(ui): align product UI guide with implementation`

每个提交都运行：

```bash
npm run validate
npm run typecheck
npm run doctor
```

涉及整理、回收站和永久删除的提交，必须在 Android/iOS 真机走完整流程；构建通过不算 UI 验收完成。

## 15. 真机 BUG 记录模板

```text
编号：UI-001
设备：品牌/型号
系统：Android/iOS 版本
应用构建：版本号 + commit
显示设置：浅色/深色、字体倍率、手势/三键导航
页面：
前置数据：照片数量、权限状态、是否演示模式
复现步骤：1 / 2 / 3
实际结果：
预期结果：
截图/录屏：
发生频率：必现 / 偶现
严重度：P0 / P1 / P2
```

## 16. 官方设计参考

- [Apple Human Interface Guidelines — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Apple Human Interface Guidelines — Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- [Apple Human Interface Guidelines — Color](https://developer.apple.com/design/human-interface-guidelines/color)
- [Apple Human Interface Guidelines — Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)
- [Apple Human Interface Guidelines — Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- [React Native Accessibility](https://reactnative.dev/docs/accessibility)
- [Expo Router Native Tabs](https://docs.expo.dev/router/advanced/native-tabs/)

## 17. 最终 Definition of Done

本轮只有同时满足以下条件才算完成：

- 用户已发现的全部真机 UI BUG 都有编号、复现证据和关闭记录。
- P0/P1 清单全部完成，没有用固定 padding 或遮罩绕过安全区问题。
- 新视觉在 Light/Dark、小屏/大屏、默认/200% 字体下保持一致。
- 四个 Tab、搜索、详情、整理、相似照片、回收站和设置全部完成真机点击验收。
- 删除语义、隐私边界和真实空状态没有因视觉重构而退化。
- `npm run validate`、`npm run typecheck`、`npm run doctor` 通过；Android Release 通过，iOS 在可用环境完成构建与真机验证。
- 最终截图与 `docs/PRODUCT_AND_UI.md` 一致，项目中不残留一次性调试文件。
