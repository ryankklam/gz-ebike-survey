# 题目元数据驱动 + 多版本数据映射方案

## Context

当前 `survey.html` 中大量硬编码了题目 ID（如 `q1`, `q16`）和选项值（如 `'否'`, `'拥有并经常使用'`），导致修改题目时需要同步修改前端代码。同时系统需要支持多版本题目数据的跨版本统计映射。

**目标**：
1. 将题目 ID 和选项值的硬编码引用替换为基于元数据（tags/flags）的动态查找
2. 支持多版本题目数据的自动映射统计
3. 保留现有 7 章报告结构，保留 q2 车主/非车主分段逻辑

---

## 一、硬编码清单与解耦策略

### 1.1 完整硬编码清单

| # | 文件:行 | 硬编码内容 | 类型 | 解耦方式 |
|---|---------|-----------|------|---------|
| 1 | survey.html:1402 | `q.id === 'q1' && answers['q1'] === '否'` | 流程跳转 | `early_end_value` 字段 |
| 2 | survey.html:1578 | `q.id === 'q16'` → featured 样式 | 展示样式 | `featured: true` 字段 |
| 3 | survey.html:1605 | `q.id === 'q13'` → 特殊图表 | 展示样式 | `stats_chart_type` 字段 |
| 4 | survey.html:2011 | `d.answers.q2 === '拥有并经常使用'` | 数据分段 | `segment_groups` 配置 |
| 5 | survey.html:2026-2223 | 所有 `questions.find(q => q.id === 'qX')` | 报告章节引用 | `tags` 标签查找 |
| 6 | survey.html:2136-2164 | 指数计算引用 q12/q16/q13b/q15/q9/q11 | 指数计算 | `index_config` 配置 |

### 1.2 新增题目元数据字段

在 `questions.json` / 数据库 / API 响应中为每道题新增以下可选字段：

```jsonc
{
  "id": "q1",
  "type": "radio",
  "title": "您目前是否在广州居住或工作？",
  // ... 现有字段 ...

  // === 新增元数据字段 ===
  "early_end_value": "否",          // 流程控制：选此值提前结束问卷
  "featured": false,                // 展示样式：是否为核心结论题（高亮卡片）
  "stats_chart_type": "bar",        // 统计图表类型: "bar"(默认) | "sort_bar"(降序) | "highlight"
  "tags": ["screening"],            // 语义标签（可多个），用于报告章节动态查找
  "note": "Q17中互斥选项的说明文字", // 统计页显示的注意事项文本
  "index_config": null              // 指数计算配置（仅特定题目需要）
}
```

### 1.3 各题目的元数据配置

| 题目 | early_end_value | featured | stats_chart_type | tags | index_config | 说明 |
|------|----------------|----------|-----------------|------|-------------|------|
| q1 | `"否"` | - | - | `["screening"]` | - | 筛选题，选"否"结束 |
| q2 | - | - | - | `["owner_status", "segment"]` | - | 车主身份，用于分段 |
| q3 | - | - | - | `["demographics", "age"]` | - | 年龄分布 |
| q4 | - | - | - | `["usage_purpose"]` | - | 使用用途 |
| q5 | - | - | - | `["demographics", "region"]` | - | 区域分布 |
| q6 | - | - | - | `["satisfaction", "management"]` | - | 管理满意度 |
| q7 | - | - | `"sort_bar"` | `["key_problem"]` | - | 突出问题（降序） |
| q8 | - | - | - | `["safety_threat"]` | - | 安全威胁感知 |
| q9 | - | - | - | `["satisfaction", "charging"]` | `{dim:"maturity", role:"saturation", weight:0.5}` | 充电满意度 |
| q10 | - | - | - | `["policy_aware"]` | `{dim:"maturity", role:"enforcement", weight:0.5}` | 新规知晓度 |
| q11 | - | - | - | `["enforcement"]` | - | 执法力度评价 |
| q12 | - | - | - | `["policy_perception"]` | `{dim:"urgency", match:"过于严格", weight:0.5}` | 政策松紧感知 |
| q13b | - | - | `"sort_bar"` | `["relax_wish"]` | `{dim:"willingness", weight:1.0}` | 希望放宽 |
| q13c | - | - | `"sort_bar"` | `["tighten_wish"]` | - | 希望加强管控 |
| q14 | - | - | - | `["transit_alt"]` | - | 公交替代性 |
| q15 | - | - | - | `["safety_risk"]` | `{dim:"safety", matchLast:2, weight:1.0}` | 安全风险 |
| q16 | - | `true` | - | `["core_conclusion"]` | `{dim:"urgency", match:["解禁","放宽"], weight:0.5}` | 核心结论题 |
| q17 | - | - | `"sort_bar"` | `["condition"]` | - | 解禁条件 |
| q18 | - | - | - | `["open_feedback"]` | - | 开放建议 |

### 1.4 segment_groups 配置（q2 专用）

```json
{
  "id": "q2",
  "segment_groups": {
    "field": "owner_status",
    "groups": [
      { "key": "owner", "label": "车主", "matchValues": ["拥有并经常使用", "拥有但不常用"] },
      { "key": "non_owner", "label": "非车主", "matchValues": "__rest__" }
    ]
  }
}
```

---

## 二、数据库 Schema 变更

**文件**: `db/init.sql`

在 `questions` 表 CREATE 语句中新增列：

```sql
early_end_value TEXT,
featured BOOLEAN DEFAULT false,
stats_chart_type VARCHAR(20) DEFAULT 'bar',
tags JSONB DEFAULT '[]',
note TEXT,
index_config JSONB,
segment_groups JSONB
```

---

## 三、API 层变更

### Task 1: 更新 `api/_db.js`

`getQuestionsWithOptions()` 的 SQL（L47-82）新增 SELECT 这些字段。

### Task 2: 更新 `api/questions.js`

`formatQuestionForFrontend()`（L4-35）将新字段传递到前端。

### Task 3: 更新 `db/seed.js`

INSERT questions 时写入新字段（L55-73）。

### Task 4: 更新 `api/admin/questions.js` + `[id].js`

管理后台 CRUD 支持新字段。

---

## 四、前端解耦改造

### Task 5: 流程跳转去硬编码

**survey.html:1402**

```js
// Before:
if (q.id === 'q1' && answers['q1'] === '否') {

// After:
if (q.early_end_value && answers[q.id] === q.early_end_value) {
```

### Task 6: 统计页展示样式去硬编码

**survey.html:1578-1610**

```js
// Before:
const isFeatured = q.id === 'q16';
if (isFeatured || q.id === 'q13') { ... }

// After:
const isFeatured = !!q.featured;
const chartType = q.stats_chart_type || 'bar';
```

### Task 7: 添加 tag 查找辅助函数

```js
function findByTag(tag) {
  return questions.find(q => q.tags && q.tags.includes(tag));
}
```

### Task 8: 报告章节函数改为 tag 查找

将所有 `questions.find(q => q.id === 'qX')` 替换为 `findByTag('tag_name')`，并对 null 结果添加安全检查。

**指数计算**改为通用引擎：
```js
function calcIndex(dimName, data) {
  const configs = questions
    .filter(q => q.index_config && q.index_config.dim === dimName)
    .map(q => { /* 根据 index_config 计算分数 */ });
  // 加权汇总
}
```

### Task 9: 开放题展示去硬编码

`d.answers.q18` → `d.answers[findByTag('open_feedback').id]`

### Task 10: 统计页 note 文本

每题统计卡片底部如有 `q.note` 则显示，替代硬编码注释。

---

## 五、多版本数据映射

### Task 11: 创建版本映射模块 `api/_version_mapping.js`

按 `question_key` + option label 自动映射。

### Task 12: 重构 `api/stats.js` 支持多版本合并

新增 `includeOld` 参数，合并旧版本数据。

### Task 13: 前端版本过滤开关

新增"包含旧版本数据"开关。

### Task 14: 同步 `api/export.js`

### Task 15: seed 映射诊断输出

---

## 六、实施顺序

```
Phase 1: Schema + 数据层
  db/init.sql → questions.json → db/seed.js → api/_db.js → api/questions.js → api/admin/*

Phase 2: 前端解耦
  Task 5 (跳转) → Task 6 (样式) → Task 7 (辅助函数) → Task 8 (报告章节) → Task 9 (开放题) → Task 10 (note)

Phase 3: 多版本映射
  Task 11 → Task 12 → Task 13 → Task 14 → Task 15
```

---

## 七、关键文件

| 文件 | 改动内容 |
|------|---------|
| `db/init.sql` | questions 表新增 7 个字段 |
| `questions.json` | 每道题新增元数据字段 |
| `db/seed.js` | 写入新字段 + 映射诊断 |
| `api/_db.js` | 查询包含新字段 |
| `api/questions.js` | 格式化输出新字段 |
| `api/admin/questions.js` + `[id].js` | CRUD 支持新字段 |
| `survey.html` | 全部硬编码替换为 tag/flag 查找 |
| `api/_version_mapping.js` | 新建，版本映射逻辑 |
| `api/stats.js` | 多版本合并 |
| `api/export.js` | 多版本合并 |

## 八、验证方式

1. 修改某题的 `id`，运行 seed，确认诊断报告提示且前端不报错
2. 将某题 `featured` 设为 true，确认统计页高亮
3. 设置 q1 的 `early_end_value`，确认提前结束逻辑正常
4. 创建 v0.2，确认旧数据正确映射
