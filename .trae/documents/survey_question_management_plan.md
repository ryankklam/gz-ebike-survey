# survey.html 题目管理功能添加计划

## 任务概述
在 `/workspace/survey.html` 中添加题目管理功能，与 `/workspace/index.html` 中的实现保持一致。

## 修改内容

### 1. HTML 结构修改（pageStats div）
- **位置**：survey.html 第 1055-1058 行，`<!-- Page: Admin Stats -->` 部分
- **当前结构**：
  ```html
  <div class="page" id="pageStats">
    <div class="stats-panel" id="statsContent"></div>
  </div>
  ```
- **修改后**（参考 index.html 第 1082-1089 行）：
  ```html
  <div class="page" id="pageStats">
    <div class="stats-tabs">
      <button class="stats-tab active" data-tab="stats" onclick="switchAdminTab('stats')">📊 统计结果</button>
      <button class="stats-tab" data-tab="questions" onclick="switchAdminTab('questions')">📝 题目管理</button>
    </div>
    <div class="stats-panel" id="statsContent"></div>
    <div class="stats-panel" id="questionsContent" style="display:none;"></div>
  </div>
  ```

### 2. CSS 样式添加
- **位置**：survey.html 第 715 行，`.stats-total` 样式之前（即 `.stats-header h2` 之后）
- **添加内容**（参考 index.html 第 715-740 行）：
  ```css
  .stats-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 0;
  }
  .stats-tab {
    padding: 12px 20px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-size: 15px;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: -1px;
    transition: all 0.2s;
  }
  .stats-tab:hover {
    color: var(--primary);
  }
  .stats-tab.active {
    color: var(--primary);
    border-bottom-color: var(--primary);
  }
  ```

### 3. JavaScript 函数添加
- **位置**：survey.html 第 1595 行，`renderStatsWithData` 函数结束 `}` 之后、`// ====== TEST DATA FILTER ======` 注释之前
- **添加函数列表**（参考 index.html 第 1627-1896 行）：
  1. `switchAdminTab(tab)` - tab 切换函数
  2. `loadAdminQuestions()` - 加载题目列表
  3. `renderAdminQuestions()` - 渲染题目列表
  4. `showQuestionForm(question)` - 显示新增/编辑题目的弹窗
  5. `onQfTypeChange()` - 类型切换时显示/隐藏选项输入
  6. `closeQuestionModal()` - 关闭弹窗
  7. `collectFormData()` - 收集表单数据
  8. `createQuestion()` - 创建题目
  9. `updateQuestion(originalId)` - 更新题目
  10. `confirmDeleteQuestion(qId)` - 删除确认
- **变量声明**：还需添加 `let adminQuestions = [];` 变量

## 注意事项
- 不修改现有的其他函数
- 保持 API_BASE 等变量引用正确
- 确保与 index.html 的实现完全一致
