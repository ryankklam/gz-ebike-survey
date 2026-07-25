# 调研报告样式全面优化方案

## 问题汇总

### 问题1：Bar 条为空 — 百分比数字可见但无填充条
**位置**：所有使用 `renderBarChart()` 的地方（第二章~第七章全部图表）
**根因**：`.bar-fill` 初始 `width:0%`，依赖 `setTimeout` 动画。`barPct` 计算用的是 `count/maxCount`（相对值），当只有一个 bar 时 barPct=100%，但当最大值远大于其他值时小 bar 几乎不可见。更关键的是动画可能因为页面未滚动到可视区域而未触发（IntersectionObserver 问题）。实际用户反馈说"bar 都是空的"——这说明 `setTimeout` 动画确实没正确执行。
**修复**：不依赖动画，直接设置初始 `width`（让 bar 立即可见），改为先设 0 再用 CSS transition 增长。

### 问题2：第五章"车主 vs 非车主"总结框与管理模式框贴在一起，无样式区分
**位置**：`renderChapter5` 的 5.5（featured 卡片）和 6.2（双栏）之间
**根因**：`.stats-card.featured` 没有 `margin-bottom`，与紧接的 `report-dual-col` 没有间距
**修复**：给 featured 卡片增加 margin，给双栏增加间距，给交叉分析增加 insight 高亮样式

### 问题3：报告章节结构与之前设计的新方案不一致
**位置**：`renderChapter3` ~ `renderChapter7` 全部
**根因**：preview 分支的渲染代码仍然是旧版结构（第三章引用了已删除的 Q7/Q8/Q9/Q10），不是之前提交的 7 章新结构
**修复**：需要确认当前代码状态

### 问题4：bar-count 列重复显示百分比
**位置**：`renderBarChart()` 生成的 HTML
**根因**：`.bar-count` 显示 `count (pct%)`，但 bar 本身没有百分比标注
**修复**：在 bar-fill 内嵌百分比标签，bar-count 只显示 count 数

### 问题5：featured 卡片与普通 stats-card 样式区分度不足
**位置**：`.stats-card.featured` CSS
**根因**：只有 `border: 2px solid var(--accent)` 和浅色渐变背景，视觉区分不够
**修复**：增强 featured 样式，增加标题和更大的内边距

### 问题6：双栏卡片（report-feq-card）缺少上间距
**位置**：`.report-feq-card`
**根因**：`report-dual-col` 有 `gap:16px`，但 dual-col 本身没有 `margin-top`，紧接在上一个 `subsection` 的 `h4` 下方
**修复**：给 `report-dual-col` 增加 `margin-top: 16px`

### 问题7：可行性指数的 dim-fill 动画同样可能不触发
**位置**：`.report-dim-item .dim-fill`
**修复**：同 bar-fill，确保动画可靠触发

## 修改范围

### 文件：`survey.html`

#### A. CSS 修改

**1. `.bar-fill` — 确保可见性**
```css
.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), var(--primary-light));
  border-radius: 6px;
  transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 2px;          /* 确保最小可见 */
  position: relative;
}
```

**2. 新增 `.bar-pct` — bar 内嵌百分比标签**
```css
.bar-fill .bar-pct {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
/* bar 太短时百分比放外部 */
.bar-fill .bar-pct.outside {
  right: auto;
  left: calc(100% + 6px);
  color: var(--gray-600);
  text-shadow: none;
}
```

**3. `.stats-card.featured` 增强**
```css
.stats-card.featured {
  border: 2px solid var(--accent);
  background: linear-gradient(135deg, #fffaf5, #ffffff);
  margin-bottom: 24px;           /* 新增：与后续内容间距 */
  padding: 24px;                 /* 新增：更大的内边距 */
}
```

**4. `.report-dual-col` 增加上间距**
```css
.report-dual-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 16px;             /* 新增 */
}
```

**5. 新增 `.report-insight-card` — 交叉分析高亮卡片**
```css
.report-insight-card {
  background: #f0f7ff;
  border-left: 4px solid var(--primary);
  border-radius: var(--radius);
  padding: 16px 20px;
  margin: 20px 0;
}
.report-insight-card h5 {
  font-size: 13px;
  font-weight: 600;
  color: var(--primary);
  margin-bottom: 8px;
}
.report-insight-card p {
  font-size: 13px;
  color: var(--gray-700);
  line-height: 1.6;
  margin-bottom: 4px;
}
```

**6. `.report-subsection` 间距统一**
```css
.report-subsection {
  margin-bottom: 24px;
  margin-top: 8px;              /* 新增：与上方内容的间距 */
}
```

**7. `.report-feq-card` 小标题样式增强**
```css
.report-feq-card {
  background: var(--white);
  border-radius: var(--radius);
  padding: 20px;
  box-shadow: var(--shadow);
  border-top: 3px solid var(--primary);  /* 新增：顶部颜色条区分 */
}
```

#### B. `renderBarChart()` 函数修改

在 bar-fill 内添加百分比标签：
```js
const pctLabel = parseFloat(barPct) >= 15
  ? `<span class="bar-pct">${pct}%</span>`
  : `<span class="bar-pct outside">${pct}%</span>`;
// bar-fill HTML:
<div class="bar-fill" data-width="${barPct}%" style="width:0%;${color}">${pctLabel}</div>
```

`bar-count` 改为只显示 count：
```js
<div class="bar-count">${item.count}</div>
```

#### C. `renderChapter5()` / `renderChapter6()` 间距修复

- 在 featured 卡片后添加 `margin-bottom`（CSS 层面已处理）
- 在双栏前后添加 insight 卡片

#### D. 动画触发可靠性

将 `setTimeout` 动画改为 `requestAnimationFrame` 双帧确保 DOM 已渲染：
```js
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.querySelectorAll('.report-page .bar-fill').forEach(bar => {
      bar.style.width = bar.getAttribute('data-width');
    });
    document.querySelectorAll('.report-page .dim-fill').forEach(bar => {
      bar.style.width = bar.getAttribute('data-width');
    });
  });
});
```

## 验证步骤

1. 运行 `node test-precommit.js` 确保无语法错误
2. 填写测试数据 → 进入报告页面
3. 检查所有 bar 图是否正确填充（不再是空条）
4. 检查 bar 内百分比标签是否可见（bar ≥15% 时白色标签在 bar 内）
5. 检查 featured 卡片（理想管理模式）与后续双栏的间距
6. 检查第五章 6.2"车主 vs 非车主"是否有独立视觉容器
7. 检查可行驶性指数 dim-fill 是否正确动画
8. 移动端响应式检查
