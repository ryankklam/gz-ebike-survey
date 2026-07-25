# 管理员后端控制面板 (admin.html) 实施计划

## 概述

创建一个独立的 `admin.html` 管理员控制面板页面，包含密码认证和 4 个功能按钮：调研结果、导入题目、历史数据迁移、导出数据。页面采用卡片式布局，风格与主站一致。

## 现状分析

### 现有资源
- **认证机制**：`/api/auth`（POST 密码验证 → 返回 HMAC token），token 存 localStorage `gz_ebike_admin_token`
- **已有 API**：
  - `/api/admin/seed`（POST，导入题目）— 需 token
  - `/api/admin/migrate`（POST，迁移历史数据）— 需 token
  - `/api/export`（GET，导出数据）— 需 token
  - `/api/stats`（GET，获取统计）— 需 token
- **主站 index.html**：已有统计结果和报告页面，token 通过 localStorage 共享（同源）
- **样式变量**：主站使用 CSS 变量（`--primary`、`--accent`、`--radius` 等），admin.html 复用同一套变量

### 关键设计决策
- token 通过 localStorage 共享：admin.html 和 index.html 同源，localStorage 中的 `gz_ebike_admin_token` 可互通
- "调研结果"按钮：跳转到 `index.html`，通过 URL hash（如 `#report`）触发报告页面
- "导出数据"：支持 JSON 和 CSV 两种格式

## 改动文件清单

### 1. 新建 `admin.html`

完整的管理员控制面板页面，包含：

**页面结构：**
```
- 密码登录页（未登录时显示）
  - 密码输入框
  - 验证按钮
  - 错误提示
- 控制面板（登录后显示）
  - 顶部标题栏 + 退出登录按钮
  - 4 个功能卡片（2×2 网格布局）：
    1. 📊 调研结果 → 跳转 index.html#report
    2. 📥 导入题目 → 调用 /api/admin/seed
    3. 📦 历史数据迁移 → 调用 /api/admin/migrate（带确认提示）
    4. 📤 导出数据 → 调用 /api/export（下拉选 JSON/CSV）
  - 操作结果展示区（显示 API 返回信息）
```

**功能逻辑：**
- `checkAdminPassword()`：调用 `/api/auth`，成功后存 token 到 localStorage，显示控制面板
- `seedQuestions()`：调用 `/api/admin/seed`，显示导入结果（版本、题目数、部分数）
- `migrateData()`：先 `confirm()` 确认，再调用 `/api/admin/migrate`，显示迁移结果（总数、成功数、跳过数）
- `exportData(format)`：调用 `/api/export?format=json|csv`，下载文件
- `viewReport()`：跳转 `index.html#report`（index.html 需支持 hash 触发报告）

**样式：**
- 复用主站 CSS 变量（`--primary`、`--accent`、`--bg`、`--white`、`--radius`、`--shadow` 等）
- 卡片式布局，hover 效果，loading 状态
- 响应式适配移动端

### 2. 修改 `index.html`

在 `DOMContentLoaded` 初始化逻辑中增加 hash 路由支持：
- 检测 `window.location.hash === '#report'`
- 如果有该 hash 且已有 token（localStorage），直接显示报告页
- 如果有 hash 但无 token，跳转到管理员登录页

具体改动位置：[index.html](file:///workspace/index.html) 第 2330-2354 行的 `DOMContentLoaded` 回调中，在 `showPage('pageLanding')` 之前增加 hash 检测逻辑。

```javascript
// 在 showPage('pageLanding') 之前增加：
if (window.location.hash === '#report') {
  if (adminToken) {
    showReport();
  } else {
    showAdminLoginReport();
  }
}
```

## 验证步骤

1. 访问 `admin.html`，未登录时显示密码输入框
2. 输入正确密码，进入控制面板，显示 4 个功能卡片
3. 点击"调研结果"→ 跳转到 `index.html#report`，自动展示报告页
4. 点击"导入题目"→ 显示导入结果（版本、题目数）
5. 再次点击"导入题目"→ 显示"已存在，跳过"
6. 点击"历史数据迁移"→ 弹出确认框，确认后显示迁移结果
7. 点击"导出数据"→ 下载 JSON/CSV 文件
8. 在移动端访问，布局自适应
