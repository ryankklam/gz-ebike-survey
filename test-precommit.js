#!/usr/bin/env node
/**
 * pre-commit hook: 在每次 commit 前自动运行
 * 检查 questions.json 中的标题承诺与字段是否一致
 *
 * 触发方式（二选一）：
 *   npm run test            — 手动运行
 *   git commit              — 自动触发（需配置 .git/hooks/pre-commit）
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log('  ✓ ' + msg);
    passed++;
  } else {
    console.log('  ✗ FAIL: ' + msg);
    failed++;
  }
}

function run() {
  console.log('\n=== Survey Pre-Commit Checks ===\n');

  // 1. questions.json 存在性 & 合法 JSON
  const qPath = path.join(__dirname, 'questions.json');
  assert(fs.existsSync(qPath), 'questions.json exists');

  let data;
  try {
    data = JSON.parse(fs.readFileSync(qPath, 'utf8'));
  } catch (e) {
    console.log('  ✗ FAIL: questions.json is not valid JSON: ' + e.message);
    process.exit(1);
  }
  assert(Array.isArray(data.questions), 'questions.json has "questions" array');
  assert(data.questions.length > 0, 'questions array is non-empty');

  // 2. 逐题检查
  const seenIds = new Set();
  data.questions.forEach((q, i) => {
    const label = `Q${i + 1} (${q.id || 'NO_ID'})`;

    // 2a. id 唯一
    assert(q.id, label + ' has "id" field');
    assert(!seenIds.has(q.id), label + ' id is unique');
    seenIds.add(q.id);

    // 2b. 必填字段
    assert(q.type, label + ' has "type"');
    assert(q.title, label + ' has "title"');

    // likert/text 类型没有 options（前端硬编码）
    if (q.type === 'likert' || q.type === 'text') {
      assert(!q.options || q.options.length === 0, label + ` ${q.type} type should not have options`);
      return; // 跳过后续 options 相关检查
    }

    assert(Array.isArray(q.options), label + ' has "options" array');
    assert(q.options.length > 0, label + ' has non-empty options');

    // 2c. maxSelect 一致性：标题写了"限选X项"则必须有 maxSelect
    const limitMatch = q.title.match(/限选(\d+)项/);
    if (limitMatch) {
      const expected = parseInt(limitMatch[1]);
      assert(
        q.maxSelect === expected,
        label + ` title says "限选${expected}项", maxSelect=${q.maxSelect || 'MISSING'}`
      );
    }

    // 2d. mutuallyExclusive 索引合法性
    if (q.mutuallyExclusive) {
      assert(Array.isArray(q.mutuallyExclusive), label + ' mutuallyExclusive is array');
      q.mutuallyExclusive.forEach(idx => {
        assert(
          idx >= 0 && idx < q.options.length,
          label + ` mutuallyExclusive index ${idx} is within options[0..${q.options.length - 1}]`
        );
      });
    }

    // 2e. radio 不应该有 maxSelect
    if (q.type === 'radio') {
      assert(!q.maxSelect, label + ' radio type should not have maxSelect');
    }

    // 2f. checkbox 有 maxSelect 时值应合理
    if (q.type === 'checkbox' && q.maxSelect) {
      assert(
        q.maxSelect >= 1 && q.maxSelect <= q.options.length,
        label + ` maxSelect=${q.maxSelect} is within 1..${q.options.length}`
      );
    }
  });

  // 3. survey.html JS 语法检查
  const htmlPath = path.join(__dirname, 'survey.html');
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const m = html.match(/<script>([\s\S]*?)<\/script>/);
    if (m) {
      try {
        new Function(m[1]);
        assert(true, 'survey.html inline JS syntax valid');
      } catch (e) {
        assert(false, 'survey.html JS syntax error: ' + e.message);
      }
    }
  }

  // 4. index.html 与 survey.html 一致性
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath) && fs.existsSync(htmlPath)) {
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    assert(
      htmlContent === indexContent,
      'index.html === survey.html (in sync)'
    );
  }

  // 结果
  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  if (failed > 0) {
    console.log('❌ Pre-commit checks FAILED. Commit blocked.\n');
    process.exit(1);
  } else {
    console.log('✅ All checks passed.\n');
    process.exit(0);
  }
}

run();
