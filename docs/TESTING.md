# V1.0.0 测试方案

## 1. 基础 Smoke Test

### 启动

- 首次启动无崩溃
- SQLite 自动创建
- 首页无数据时展示授权卡片

### 权限

- 允许相册权限
- 拒绝权限
- 再次扫描
- iOS Limited Access

### 扫描

- 0 张照片
- 50 张照片
- 1000 张照片
- 5000 张照片
- 扫描期间切后台

### 相册

- 三列网格正常
- 分类切换
- 图片详情
- 收藏

### 整理

- 左滑
- 右滑
- 按钮整理
- 撤销上一张决定（整理中与完成页）
- 连续 50 张不跳项
- 中途退出

### 相似照片

- 相似照片入口只显示相似分组
- 推荐保留项与重复项展示正确
- 整理重复项后进入回收站，取消不会改变状态

### 回收站

- 单张恢复
- 全部恢复
- 永久删除
- 系统取消删除授权

### 搜索

- 截图
- 去年 截图
- 人物
- 不存在关键词

## 2. 性能测试

Android 至少覆盖：

- 4 GB RAM 中端机
- 6 GB RAM 主流机
- 12 GB RAM 高端机

重点：

- 首次索引耗时
- 峰值内存
- 网格 FPS
- 详情页大图内存
- 连续滑动 100 次

## 3. 数据一致性

场景：

1. 扫描照片 A。
2. 系统相册删除 A。
3. APP 再次扫描。

V1.0.0 当前 UPSERT 不会自动清除系统已不存在的旧 Row。

正式版需要 reconciliation：

```text
本轮扫描 asset_id 集合
  vs
SQLite asset_id
  ↓
标记 missing / 删除旧索引
```

## 4. 自动化建议

推荐补：

- Vitest：AI / Search Utils
- React Native Testing Library：UI
- Maestro：E2E
- Detox：深度 E2E（可选）

## 5. 上架前 Gate

必须全部通过：

- `npm run typecheck`
- `npm run doctor`
- Android Release Build
- iOS Release Build
- 权限文案审核
- 隐私政策
- 删除流程真机验证
