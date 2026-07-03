# 数据库重构计划：从 JSON 迁移到关系型数据库

## 一、仓库调研结论

### 1.1 项目概述

这是一个**广州市电动自行车管理现状调研网站**，基于 Vercel Serverless 架构部署。

- **部署平台**：Vercel（Serverless Functions）
- **前端**：纯 HTML/CSS/JS（单文件应用）
- **后端**：Vercel API Routes（`/api/` 目录）
- **当前数据存储**：JSONBin（外部 JSON 存储服务）+ 本地 `questions.json`

### 1.2 现有功能模块

| 模块 | 文件 | 功能说明 |
|------|------|----------|
| 问卷填写前端 | [survey.html](file:///workspace/survey.html) | 18道题，5个部分，支持单选/多选/限选/李克特量表/文本题 |
| 落地页 | [index.html](file:///workspace/index.html) | 首页展示 |
| 提交接口 | [api/submit.js](file:///workspace/api/submit.js) | 提交问卷答案，带IP限流 |
| 统计接口 | [api/stats.js](file:///workspace/api/stats.js) | 获取所有答卷数据（管理员） |
| 导出接口 | [api/export.js](file:///workspace/api/export.js) | 导出JSON数据（管理员） |
| 认证接口 | [api/auth.js](file:///workspace/api/auth.js) | 管理员密码登录，生成Token |
| 工具函数 | [api/_utils.js](file:///workspace/api/_utils.js) | JSONBin读写、Token验证、CORS |
| 题目数据 | [questions.json](file:///workspace/questions.json) | 静态题目定义（版本v0.1） |

### 1.3 现有数据结构

**题目数据（questions.json）：**
```
{
  version: "v0.1",
  questions: [
    { id, part, type, title, required, options/labels, subtitle, hint, maxSelect, mutuallyExclusive, placeholder }
  ]
}
```

**答卷数据（JSONBin存储）：**
```
[
  { timestamp, version, submitter, userName, isTest, answers: { q1: "...", q2: ["..."] } }
]
```

### 1.4 当前痛点

1. **统计不便**：每次统计需拉取全部JSON数据，在前端JS中遍历计算，数据量大时性能差
2. **题目维护困难**：增删题目需手动编辑 `questions.json` 文件，无管理界面
3. **数据查询能力弱**：JSON存储无法做复杂筛选、分组、关联查询
4. **数据一致性差**：题目定义与答卷数据分离，版本变更时容易不一致
5. **无数据迁移能力**：JSONBin是整文件读写，无法增量更新

---

## 二、数据库选型

### 2.1 推荐方案：Vercel Postgres (Neon)

理由：
- 与Vercel部署无缝集成，配置简单
- Serverless架构，按需计费
- 原生支持PostgreSQL，功能强大
- 连接池优化，适合Serverless函数场景
- 支持数据分支（database branching），方便开发测试

### 2.2 备选方案

| 方案 | 优势 | 劣势 |
|------|------|------|
| Supabase (PostgreSQL) | 开源、有管理后台、免费额度高 | 需要额外账号配置 |
| PlanetScale (MySQL) | 无服务器、按查询计费 | MySQL语法与PostgreSQL略有差异 |
| SQLite | 简单、零配置 | 不适合Serverless、并发性能差 |

**最终选择：Vercel Postgres**，与现有Vercel部署栈最匹配。

---

## 三、数据库 Schema 设计

### 3.1 ER 图概览

```
surveys ──1:N── parts ──1:N── questions ──1:N── question_options
   │                                            │
   │ 1:N                                        │
   └── respondents                              │
        │ 1:N                                   │
        └── responses ──1:N── response_selected_options ──N:1──┘
```

### 3.2 详细表结构

#### 1. `surveys` - 问卷版本表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | SERIAL PRIMARY KEY | 主键 |
| `version` | VARCHAR(50) UNIQUE NOT NULL | 版本号（如 v0.1） |
| `title` | VARCHAR(200) | 问卷标题 |
| `created_at` | TIMESTAMP DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMP DEFAULT NOW() | 更新时间 |

#### 2. `parts` - 问卷部分/章节表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | SERIAL PRIMARY KEY | 主键 |
| `survey_id` | INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE | 所属问卷 |
| `name` | VARCHAR(200) NOT NULL | 部分名称（如"第一部分：基本信息"） |
| `sort_order` | INTEGER NOT NULL | 排序序号 |

#### 3. `questions` - 题目表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | SERIAL PRIMARY KEY | 主键 |
| `survey_id` | INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE | 所属问卷 |
| `part_id` | INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE | 所属部分 |
| `question_key` | VARCHAR(50) NOT NULL | 题目标识（如 q1, q13b） |
| `type` | VARCHAR(20) NOT NULL | 类型：radio/checkbox/checkbox_limit/likert/text |
| `title` | TEXT NOT NULL | 题目标题 |
| `subtitle` | TEXT | 题目副标题 |
| `hint` | TEXT | 提示文字 |
| `placeholder` | TEXT | 文本题占位符 |
| `required` | BOOLEAN DEFAULT true | 是否必填 |
| `max_select` | INTEGER | 最多选几项（checkbox_limit用） |
| `sort_order` | INTEGER NOT NULL | 排序序号 |
| `created_at` | TIMESTAMP DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMP DEFAULT NOW() | 更新时间 |

**唯一约束：** `(survey_id, question_key)`

#### 4. `question_options` - 题目选项表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | SERIAL PRIMARY KEY | 主键 |
| `question_id` | INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE | 所属题目 |
| `label` | TEXT NOT NULL | 选项文本 |
| `sort_order` | INTEGER NOT NULL | 排序序号 |
| `is_exclusive` | BOOLEAN DEFAULT false | 是否互斥选项（mutuallyExclusive） |

**唯一约束：** `(question_id, sort_order)`

#### 5. `respondents` - 受访者表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | SERIAL PRIMARY KEY | 主键 |
| `survey_id` | INTEGER NOT NULL REFERENCES surveys(id) | 所属问卷 |
| `submitter_id` | VARCHAR(100) | 提交者标识（URL参数u） |
| `user_name` | VARCHAR(50) | 用户称呼 |
| `is_test` | BOOLEAN DEFAULT false | 是否测试数据 |
| `ip_address` | VARCHAR(50) | IP地址 |
| `created_at` | TIMESTAMP DEFAULT NOW() | 提交时间 |

#### 6. `responses` - 答题记录表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | SERIAL PRIMARY KEY | 主键 |
| `respondent_id` | INTEGER NOT NULL REFERENCES respondents(id) ON DELETE CASCADE | 受访者ID |
| `question_id` | INTEGER NOT NULL REFERENCES questions(id) | 题目ID |
| `text_value` | TEXT | 文本题答案，或单选的选项值（冗余存储方便查询） |
| `created_at` | TIMESTAMP DEFAULT NOW() | 回答时间 |

**唯一约束：** `(respondent_id, question_id)`

#### 7. `response_selected_options` - 多选答案关联表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | SERIAL PRIMARY KEY | 主键 |
| `response_id` | INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE | 答题记录ID |
| `question_option_id` | INTEGER NOT NULL REFERENCES question_options(id) | 选中的选项ID |

**唯一约束：** `(response_id, question_option_id)`

### 3.3 索引设计

```sql
CREATE INDEX idx_questions_survey_sort ON questions(survey_id, sort_order);
CREATE INDEX idx_question_options_question ON question_options(question_id);
CREATE INDEX idx_respondents_survey ON respondents(survey_id);
CREATE INDEX idx_respondents_test ON respondents(is_test);
CREATE INDEX idx_responses_respondent ON responses(respondent_id);
CREATE INDEX idx_responses_question ON responses(question_id);
CREATE INDEX idx_rso_response ON response_selected_options(response_id);
CREATE INDEX idx_rso_option ON response_selected_options(question_option_id);
```

---

## 四、需要修改/新增的文件和模块

### 4.1 新增文件

| 文件路径 | 说明 |
|----------|------|
| `db/init.sql` | 数据库初始化DDL脚本 |
| `db/seed.js` | 从questions.json导入初始数据的脚本 |
| `db/migrate-data.js` | 从JSONBin迁移历史答卷数据的脚本 |
| `api/_db.js` | 数据库连接池和通用查询工具 |
| `api/questions.js` | 题目查询API（供前端加载题目） |
| `api/admin/questions.js` | 题目CRUD管理API（管理员） |
| `api/admin/questions/[id].js` | 单题目操作API |
| `app/admin/dashboard.html` 或 扩展survey.html | 题目管理后台页面 |

### 4.2 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| [api/_utils.js](file:///workspace/api/_utils.js) | 移除JSONBin相关函数，替换为数据库操作；保留Token验证和CORS |
| [api/submit.js](file:///workspace/api/submit.js) | 改为写入数据库（respondents + responses + response_selected_options） |
| [api/stats.js](file:///workspace/api/stats.js) | 改为SQL聚合查询，返回结构化统计数据 |
| [api/export.js](file:///workspace/api/export.js) | 改为从数据库导出，支持CSV和JSON格式 |
| [survey.html](file:///workspace/survey.html) | 前端加载题目从 `/api/questions` 替代 `questions.json`；新增题目管理UI |
| [questions.json](file:///workspace/questions.json) | 保留作为初始数据文件，不再作为运行时数据源 |
| `package.json` | 添加 `pg` (node-postgres) 依赖 |

### 4.3 环境变量变化

**移除：**
- `JSONBIN_BIN_ID`
- `JSONBIN_MASTER_KEY`
- `JSONBIN_ACCESS_KEY`

**新增：**
- `POSTGRES_URL` 或 `DATABASE_URL`（Vercel Postgres自动配置）

**保留：**
- `ADMIN_PASSWORD`
- `JWT_SECRET`

---

## 五、实施步骤

### 阶段一：基础设施与数据库初始化

1. **创建 `db-refactor` 分支**
   - 基于 `main` 分支创建 `db-refactor`

2. **添加项目依赖**
   - 安装 `pg` (node-postgres) 库
   - 更新 `package.json`

3. **编写数据库Schema**
   - 创建 `db/init.sql`，包含所有表和索引
   - 编写 `db/seed.js`：从 `questions.json` 导入题目数据到数据库

4. **创建数据库连接模块**
   - 创建 `api/_db.js`：连接池封装、通用查询函数
   - 处理Serverless环境下的连接管理

### 阶段二：题目管理 API 与前端

5. **题目查询API**
   - 创建 `api/questions.js`：GET请求，返回当前版本的题目结构（与原questions.json格式兼容，前端零改动）
   - 按 survey_version 查询，支持 ?version=v0.1

6. **题目CRUD管理API**
   - 创建 `api/admin/questions.js`：
     - GET: 题目列表（管理员）
     - POST: 新增题目
   - 创建 `api/admin/questions/[id].js`：
     - GET: 单题详情
     - PUT: 更新题目
     - DELETE: 删除题目
   - 均需管理员Token验证

7. **前端题目管理界面**
   - 在管理后台增加"题目管理"入口
   - 实现题目列表展示、新增、编辑、删除
   - 支持拖拽调整排序
   - 支持选项的增删和排序调整
   - 支持版本发布（创建新版本问卷）

### 阶段三：答卷提交与统计

8. **改造提交接口**
   - 重写 `api/submit.js`：
     - 插入 `respondents` 记录
     - 遍历answers，逐题插入 `responses`
     - 多选题插入 `response_selected_options`
     - 事务保证数据一致性
   - 保留IP限流逻辑

9. **改造统计接口**
   - 重写 `api/stats.js`：
     - 使用SQL聚合查询，直接返回各题统计结果
     - 支持按测试数据过滤
     - 支持按版本过滤
     - 返回格式与原格式兼容，前端无需大改
   - 性能对比：原先是拉全量JSON前端计算，现在是DB聚合后返回轻量数据

10. **改造导出接口**
    - 重写 `api/export.js`：
      - 支持导出为JSON（兼容原格式）
      - 新增支持导出为CSV
      - 支持筛选条件（测试数据、时间范围等）

### 阶段四：数据迁移与验证

11. **历史数据迁移脚本**
    - 编写 `db/migrate-data.js`：
      - 从JSONBin拉取历史数据
      - 按问卷版本匹配题目ID
      - 导入到新数据库
      - 数据一致性校验

12. **前端适配**
    - 修改 `survey.html` 中题目加载逻辑：
      - 从 `fetch('questions.json')` 改为 `fetch('/api/questions')`
      - 保持返回数据格式兼容，其余逻辑不变
    - 统计页面新增筛选条件（按版本、时间范围等）

13. **测试验证**
    - 功能测试：问卷填写、提交、统计、导出
    - 性能测试：统计接口响应时间对比
    - 数据一致性：迁移前后统计结果对比
    - 管理员功能：题目CRUD操作验证

### 阶段五：优化与文档

14. **高级统计功能（可选）**
    - 交叉分析：按群体（年龄/区域/车主身份）对比答案
    - 时间趋势：按日/周统计提交量
    - 直接用SQL实现，比JSON时代简单得多

15. **更新部署文档**
    - 更新 `doc/` 下的部署指南
    - 添加数据库配置说明

---

## 六、API 响应格式兼容策略

为了减少前端改动，后端API返回格式保持与原格式兼容：

### /api/questions 返回格式（兼容原 questions.json）

```json
{
  "version": "v0.1",
  "questions": [
    {
      "id": "q1",
      "part": "第一部分：基本信息",
      "type": "radio",
      "title": "...",
      "required": true,
      "options": ["是", "否"]
    }
  ]
}
```

### /api/stats 返回格式（兼容原格式）

```json
{
  "success": true,
  "data": [
    {
      "timestamp": "...",
      "version": "v0.1",
      "submitter": "...",
      "userName": "...",
      "isTest": false,
      "answers": {
        "q1": "是",
        "q4": ["日常通勤上下班", "购物办事"]
      }
    }
  ]
}
```

**注**：统计接口短期保持兼容以减少前端改动，后续可优化为返回预聚合的统计数据以提升性能。

---

## 七、潜在依赖与注意事项

### 7.1 技术依赖

- **PostgreSQL 14+**：需要支持的数据库版本
- **pg (node-postgres)**：Node.js PostgreSQL客户端
- **Vercel Postgres**：需在Vercel项目中启用Postgres服务

### 7.2 兼容性注意事项

1. **题目版本控制**：新增题目后不影响历史答卷，历史答卷按当时版本关联
2. **ID映射问题**：迁移历史数据时，需要按question_key匹配而非数据库自增ID
3. **多选答案迁移**：历史JSON中多选答案是字符串数组，需转换为选项ID关联
4. **连接池管理**：Serverless函数冷启动时的数据库连接管理，需设置合理的连接池大小

### 7.3 安全考虑

1. **SQL注入防护**：所有查询使用参数化查询（parameterized queries）
2. **管理员鉴权**：所有写入操作必须验证管理员Token
3. **数据脱敏**：导出和统计时注意个人信息保护
4. **IP地址存储**：考虑合规性，可选择哈希存储或不存储

---

## 八、风险与应对

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| Vercel Postgres 冷启动延迟 | 首次请求响应慢 | 中 | 使用连接池 + 预热函数 |
| 历史数据迁移丢失/错误 | 数据不一致 | 中 | 迁移前备份、迁移后全量校验 |
| 题目版本管理混乱 | 新旧数据无法对比 | 低 | 设计版本表，每次修改创建新版本 |
| 前端改动量超出预期 | 工期延长 | 低 | API响应格式兼容设计，前端最小改动 |
| 并发连接数超限 | 提交高峰失败 | 低 | 连接池配置 + 限流 + 队列 |

---

## 九、预期收益

### 9.1 统计更方便

- **性能提升**：SQL聚合查询比前端遍历JSON快10-100倍（数据量越大越明显）
- **交叉分析**：轻松实现"31-45岁车主对Q16的选择分布"这类复杂查询
- **时间趋势**：按天/周统计提交量和答案变化趋势
- **灵活筛选**：按区域、年龄、用户身份等维度自由筛选

### 9.2 题目管理更简单

- **可视化管理**：后台界面增删改题目，无需编辑JSON文件
- **版本管理**：支持创建问卷新版本，历史数据不丢失
- **即时生效**：修改题目后立即生效，无需重新部署
- **排序调整**：拖拽排序，直观便捷

### 9.3 其他收益

- **数据一致性**：外键约束保证数据完整性
- **扩展性强**：未来增加用户、问卷模板、答卷评论等功能很容易
- **备份恢复**：数据库自带备份恢复机制
- **权限控制**：未来可支持多管理员、不同权限级别
