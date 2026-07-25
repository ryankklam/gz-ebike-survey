# 修复互斥选项通用验证模块

## 问题分析

### 当前状态
survey.html 中 Q17 的互斥选项（`mutuallyExclusive: [6, 7]`）存在以下问题：

1. **渲染时不处理互斥初始状态**：`renderQuestion` 第 1271 行只对 `maxSelect` 类型设置初始 `disabled-selected` class，完全忽略了 `mutuallyExclusive`。当用户返回已作答的题目时，互斥选项在 `setTimeout` 执行前有一个短暂的可点击窗口。
2. **selectCheckbox 的互斥逻辑只在"选中互斥选项"时触发清除**（1352-1358行），但没有在"选中非互斥选项"时主动阻止选中互斥选项——它依赖 `refreshDisabledState` 的 CSS `pointer-events: none` 来阻止，这不是一个可靠的验证层。
3. **没有提交验证**：`submitSurvey` 和 `nextQuestion` 都不检查互斥冲突。如果 CSS 禁用失效（移动端 touch 事件时序、快速点击等），无效数据会直接提交。

### 根因
互斥逻辑分散在三个地方（renderQuestion 初始渲染、selectCheckbox 点击处理、refreshDisabledState CSS 禁用），且**没有一个统一的验证函数**在数据变更和提交时进行校验。

### 涉及题目清单

| 题目 | mutuallyExclusive | 说明 |
|------|-------------------|------|
| **Q17** | `[6, 7]` | "以上都满足才支持"与"无论如何都不支持"互斥，且两者都与 A-F 非互斥选项互斥 |
| 其他题目 | 无 | 当前仅 Q17 配置了该字段 |

通用模块需确保：**未来任何题目只要在 questions.json 中配置了 `mutuallyExclusive`，就自动生效**，无需额外改前端代码。

## 修改方案

### 文件：`/workspace/survey.html`

#### 1. 新增两个通用函数（放在 `selectCheckbox` 之前）

**`resolveMutualExclusive(q, value, selectedValues)`** — 核心修正函数，处理互斥冲突：

- 传入题目定义 `q`、当前操作的值 `value`、当前已选数组 `selectedValues`
- 如果 `q.mutuallyExclusive` 为空或不存在，直接原样返回 `selectedValues`
- 如果 `value` 是互斥选项（index 在 mutuallyExclusive 数组中）→ 返回只包含 `value` 的数组（清除所有其他选项）
- 如果 `value` 是非互斥选项 → 返回过滤掉所有互斥选项的数组
- 如果 `value` 为 null（仅用于提交前清理）→ 如果同时存在互斥和非互斥选项，优先保留非互斥选项，移除互斥选项

**`getMutuallyExclusiveDisabledState(q, selectedArr, optionIndex)`** — UI 禁用判断函数：

- 返回 true 表示该选项应该被 disabled
- 判断逻辑：已有非互斥选项 → 禁用所有互斥选项；已有互斥选项 → 禁用所有非互斥选项
- 用于 renderQuestion 初始渲染和 refreshDisabledState

#### 2. 重构 `selectCheckbox` 函数

将 1333-1367 行的互斥逻辑统一替换为调用 `resolveMutualExclusive`：

```
点击选项 → 
  如果是取消选中（已在 arr 中）→ splice，正常流程
  如果是选中（不在 arr 中）→
    先 push 进 arr
    调用 answers[qid] = resolveMutualExclusive(q, value, arr) 
    重新渲染 selected 状态
    调用 refreshDisabledState
```

关键变化：**不再只在"选中互斥选项"时特殊处理，而是每次选中都经过统一的 resolveMutualExclusive 函数**，确保无论操作顺序如何（先选互斥再选非互斥、先选非互斥再选互斥、来回切换），数据始终一致。

#### 3. 增强 `renderQuestion` 初始渲染

修改第 1271 行，将 disabled 判断改为调用通用函数：

```javascript
// 原来（只处理 maxSelect）：
const disabled = q.maxSelect && selectedArr.length >= q.maxSelect && !sel ? ' disabled-selected' : '';

// 修改后（maxSelect + mutuallyExclusive 统一处理）：
const disabled = (q.maxSelect && selectedArr.length >= q.maxSelect && !sel)
  || getMutuallyExclusiveDisabledState(q, selectedArr, i)
  ? ' disabled-selected' : '';
```

渲染时就有正确的 disabled 状态，不再依赖 setTimeout 作为首次保障。

#### 4. 重构 `refreshDisabledState`

将 1369-1395 行的互斥判断逻辑替换为调用 `getMutuallyExclusiveDisabledState`，消除重复代码：

```javascript
function refreshDisabledState(q, selectedValues) {
  const items = document.querySelectorAll('.question-container .option-item');
  items.forEach((item, i) => {
    // maxSelect 判断
    if (q.maxSelect && !item.classList.contains('selected') && selectedValues.length >= q.maxSelect) {
      item.classList.add('disabled-selected');
    } else {
      item.classList.remove('disabled-selected');
    }
    // mutuallyExclusive 判断
    if (getMutuallyExclusiveDisabledState(q, selectedValues, i)) {
      item.classList.add('disabled-selected');
    } else if (q.mutuallyExclusive) {
      item.classList.remove('disabled-selected');
    }
  });
}
```

#### 5. 在 `nextQuestion` 和 `submitSurvey` 中增加兜底验证

在跳转下一题和提交前，对所有有 `mutuallyExclusive` 的题目自动清理冲突数据：

```javascript
function sanitizeMutualExclusive(q) {
  if (!q.mutuallyExclusive || !answers[q.id] || !Array.isArray(answers[q.id])) return;
  const resolved = resolveMutualExclusive(q, null, answers[q.id]);
  if (resolved.length !== answers[q.id].length) {
    answers[q.id] = resolved;
  }
}
```

在 `nextQuestion` 第 1416 行之后、`submitSurvey` 第 1446 行之后各调用一次。

#### 6. 保留 setTimeout（双重保险）

1310-1312 行的 `setTimeout(() => refreshDisabledState(...), 0)` 保留，作为 UI 层的额外保障。但初始渲染已经正确设置了 disabled 状态，setTimeout 只是锦上添花。

## 不改动的部分

- `questions.json` 不需要修改，`mutuallyExclusive` 字段格式不变
- 后端 API 不需要修改
- `refreshDisabledState` 函数保留，但内部逻辑改为调用通用函数

## 验证步骤

1. Q17 选中 G（互斥）→ 其他选项被禁用，只能有 1 个选项
2. Q17 取消 G → 所有选项恢复可选
3. Q17 选中 A（非互斥）→ G 和 H 被禁用
4. Q17 选中 A 后选中 B → G 和 H 仍然被禁用
5. 返回上一题再回到 Q17 → disabled 状态正确（不闪烁）
6. Q17 快速连续点击 G 然后点 A → 数据中只有 A
7. Q17 快速连续点击 A 然后点 G → 数据中只有 G
8. 提交问卷 → answers 中 Q17 不存在互斥冲突
9. JS 语法检查通过
10. 推送到 preview 分支（不动 main）
