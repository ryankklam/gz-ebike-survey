// assets/charts.js
(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var success = style.getPropertyValue('--success').trim();
  var danger = style.getPropertyValue('--danger').trim();
  var warning = style.getPropertyValue('--warning').trim();
  var purple = style.getPropertyValue('--purple').trim();

  var palette = [accent, accent2, muted, accent + 'bb', accent2 + 'bb', warning, success, purple, danger];
  var allCharts = [];

  function makeBarH(id, data, opts) {
    var el = document.getElementById(id);
    if (!el) return;
    var c = echarts.init(el, null, { renderer: 'svg' });
    var def = {
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, appendToBody: true },
      grid: { left: '38%', right: '12%', top: 8, bottom: 24 },
      xAxis: { type: 'value', axisLabel: { fontSize: 11, color: muted }, splitLine: { lineStyle: { color: rule } } },
      yAxis: { type: 'category', data: data.map(function(d) { return d.name; }), axisLabel: { fontSize: 11, color: ink }, inverse: true },
      series: [{ type: 'bar', data: data.map(function(d) { return d.value; }), barMaxWidth: 20, itemStyle: { color: accent, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', fontSize: 11, color: ink, formatter: function(p) { return p.value + (opts && opts.pct ? '%' : ''); } } }]
    };
    if (opts) { for (var k in opts.config) def[k] = opts.config[k]; }
    c.setOption(def);
    allCharts.push(c);
    return c;
  }

  function makeBarV(id, labels, values, opts) {
    var el = document.getElementById(id);
    if (!el) return;
    var c = echarts.init(el, null, { renderer: 'svg' });
    var seriesColor = (opts && opts.colors) ? opts.colors : palette;
    var def = {
      animation: false,
      tooltip: { trigger: 'axis', appendToBody: true },
      grid: { left: 60, right: 20, top: 20, bottom: 50 },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10, color: ink, rotate: labels.length > 6 ? 25 : 0 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 11, color: muted }, splitLine: { lineStyle: { color: rule } } } },
      series: [{ type: 'bar', data: values, barMaxWidth: 36, itemStyle: { color: function(p) { return seriesColor[p.dataIndex % seriesColor.length]; }, borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', fontSize: 10, color: ink, formatter: function(p) { return p.value + '%'; } } }]
    };
    c.setOption(def);
    allCharts.push(c);
    return c;
  }

  function makeMultiBarV(id, labels, seriesData, seriesNames, colors) {
    var el = document.getElementById(id);
    if (!el) return;
    var c = echarts.init(el, null, { renderer: 'svg' });
    var series = seriesData.map(function(data, i) {
      return {
        type: 'bar', name: seriesNames[i], data: data, barMaxWidth: 24,
        itemStyle: { color: colors[i], borderRadius: [3, 3, 0, 0] }
      };
    });
    c.setOption({
      animation: false,
      tooltip: { trigger: 'axis', appendToBody: true },
      legend: { bottom: 0, textStyle: { fontSize: 11, color: muted } },
      grid: { left: 50, right: 20, top: 10, bottom: 56 },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10, color: ink } },
      yAxis: { type: 'value', axisLabel: { fontSize: 11, color: muted }, splitLine: { lineStyle: { color: rule } } } },
      series: series
    });
    allCharts.push(c);
    return c;
  }

  // --- Chapter 2 ---
  makeBarV('chart-age', ['18岁以下', '18-30岁', '31-45岁', '46-60岁', '60岁以上'], [4.2, 38.5, 32.7, 18.1, 6.5]);

  makeBarV('chart-area', ['中心城区', '外围城区', '郊区/远郊', '城中村', '流动居住'], [28.5, 22.3, 10.8, 25.6, 12.8]);

  makeBarV('chart-ownership', ['拥有并经常使用', '拥有但不常用', '不拥有但偶尔使用', '不使用'], [52.9, 17.9, 14.4, 14.8]);

  makeBarH('chart-purpose', [
    { name: '日常通勤上下班', value: 68.3 },
    { name: '购物办事', value: 45.2 },
    { name: '接送孩子上学放学', value: 28.7 },
    { name: '休闲娱乐', value: 22.1 },
    { name: '外卖快递配送', value: 18.5 },
    { name: '货运/拉货', value: 12.3 },
    { name: '其他职业用途', value: 8.4 },
    { name: '不适用', value: 14.8 }
  ], { pct: true });

  makeBarV('chart-transport', ['电动自行车', '地铁', '公交车', '小汽车', '自行车', '以上都没有'], [72.5, 55.8, 48.3, 32.1, 15.6, 3.8]);

  // --- Chapter 3 ---
  makeBarV('chart-satisfaction', ['非常满意', '比较满意', '一般', '不太满意', '非常不满意'], [3.5, 15.2, 19.0, 35.8, 26.5], { colors: [success, success + 'bb', muted, warning, danger] });

  makeBarV('chart-strictness', ['过于严格', '适度严格', '不够严格', '不了解'], [58.7, 22.1, 14.2, 5.0], { colors: [danger, warning, success, muted] });

  makeBarV('chart-reform-path', ['先试点再推广', '分步实施', '小步快跑', '一步到位', '不着急'], [45.2, 28.5, 12.3, 8.1, 5.9]);

  // --- Chapter 4 ---
  makeBarH('chart-relax', [
    { name: '允许更多路段通行', value: 72 },
    { name: '优化非机动车道，保障路权', value: 65 },
    { name: '简化上牌登记流程', value: 48 },
    { name: '适当提高限速标准', value: 42 },
    { name: '放宽载人限制', value: 38 },
    { name: '降低充电费用', value: 35 },
    { name: '减少停车限制', value: 32 },
    { name: '放宽载物限制', value: 22 },
    { name: '电摩合法化', value: 18 }
  ], { pct: true });

  makeBarH('chart-strengthen', [
    { name: '严厉打击非法改装', value: 68 },
    { name: '严格查处闯红灯/逆行', value: 65 },
    { name: '加强对不戴头盔执法', value: 52 },
    { name: '禁止电池上楼充电', value: 48 },
    { name: '严格管控违规载人', value: 42 },
    { name: '加大对违规停放处罚', value: 38 },
    { name: '推行电子号牌', value: 35 },
    { name: '强制购买保险', value: 28 },
    { name: '加强源头治理', value: 25 },
    { name: '推行考牌持证上路', value: 22 }
  ], { pct: true, config: { series: [{ color: accent2, borderRadius: [0, 4, 4, 0] }] } });

  makeBarV('chart-replace', ['完全可以', '基本可以', '部分可以', '不太可以', '完全无法'], [5.0, 12.5, 28.3, 35.8, 18.4]);

  // --- Chapter 5: Group Voices ---
  makeBarV('chart-owner-mode', ['多开路', '分类管', '放宽载物', '全面放开', '维持现状', '严打', '全面禁止', '不清楚'], [35.2, 28.5, 8.1, 12.3, 6.5, 4.2, 2.8, 2.4]);

  makeBarV('chart-nonowner-mode', ['多开路', '分类管', '放宽载物', '全面放开', '维持现状', '严打', '全面禁止', '不清楚'], [28.9, 22.1, 5.6, 8.2, 15.8, 10.5, 5.3, 3.6]);

  // 5.2 By Area - grouped bar
  makeMultiBarV('chart-area-mode',
    ['多开路', '分类管', '全面放开', '维持现状', '严打/禁止'],
    [
      [35.2, 22.1, 8.5, 10.2, 6.8],   // 中心城区
      [30.5, 28.8, 10.1, 8.5, 5.2],   // 外围城区
      [38.6, 18.2, 12.5, 5.8, 4.1],   // 城中村
      [25.3, 15.6, 5.2, 22.8, 18.5]    // 郊区
    ],
    ['中心城区', '外围城区', '城中村', '郊区'],
    [accent, accent2, warning, muted]
  );

  // 5.3 By Purpose - TOP3 relax preferences
  makeBarV('chart-commuter-relax', ['允许更多路段通行', '优化非机动车道', '适当提高限速'], [72, 58, 45], { colors: [warning, warning + 'bb', warning + '77'] });
  makeBarV('chart-delivery-relax', ['允许更多路段通行', '适当提高限速', '放宽载物限制'], [78, 62, 48], { colors: [danger, danger + 'bb', danger + '77'] });
  makeBarV('chart-cargo-relax', ['放宽载物限制', '允许更多路段通行', '放宽载人限制'], [68, 55, 42], { colors: [purple, purple + 'bb', purple + '77'] });
  makeBarV('chart-child-relax', ['放宽载人限制', '允许更多路段通行', '减少停车限制'], [75, 52, 48], { colors: [success, success + 'bb', success + '77'] });

  // 5.4 By Age - risk perception stacked
  var ageRiskEl = document.getElementById('chart-age-risk');
  if (ageRiskEl) {
    var ac = echarts.init(ageRiskEl, null, { renderer: 'svg' });
    ac.setOption({
      animation: false,
      tooltip: { trigger: 'axis', appendToBody: true },
      legend: { bottom: 0, textStyle: { fontSize: 11, color: muted } },
      grid: { left: 50, right: 20, top: 10, bottom: 56 },
      xAxis: { type: 'category', data: ['≤30岁', '31-45岁', '≥46岁'], axisLabel: { fontSize: 12, color: ink } },
      yAxis: { type: 'value', max: 100, axisLabel: { fontSize: 11, color: muted, formatter: '{value}%' }, splitLine: { lineStyle: { color: rule } } },
      series: [
        { name: '一定/可能会增加风险', type: 'bar', stack: 'risk', data: [35.2, 42.5, 65.1], itemStyle: { color: danger }, label: { show: true, position: 'inside', fontSize: 10, color: '#fff', formatter: '{c}%' } },
        { name: '不一定', type: 'bar', stack: 'risk', data: [26.1, 27.3, 16.0], itemStyle: { color: warning } },
        { name: '可能不会/一定不会', type: 'bar', stack: 'risk', data: [38.7, 30.2, 18.9], itemStyle: { color: success } }
      ]
    });
    allCharts.push(ac);
  }

  // --- Chapter 6 ---
  makeBarV('chart-risk', ['一定会', '可能会', '不一定', '可能不会', '一定不会'], [8.5, 32.1, 22.3, 25.8, 11.3], { colors: [danger, danger + 'bb', warning, success + 'bb', success] });

  makeBarV('chart-conditions', ['加强非机动车道', '严格执法', '电子号牌', '规范停车点', '交通法规考试', '限制时速', '以上都满足', '无论如何不支持'], [62, 55, 48, 42, 38, 25, 18, 8.5]);

  makeBarH('chart-mode', [
    { name: '多开路+共享车道', value: 32.5 },
    { name: '分类管理', value: 22.1 },
    { name: '放宽载物+载人', value: 14.2 },
    { name: '全面放开', value: 9.8 },
    { name: '维持现状', value: 12.1 },
    { name: '严打整治', value: 5.8 },
    { name: '全面禁止', value: 1.9 },
    { name: '不清楚', value: 1.6 }
  ], { pct: true });

  // --- Dimension Bars Animation ---
  setTimeout(function() {
    document.querySelectorAll('.dim-fill').forEach(function(el) {
      el.style.width = el.getAttribute('data-width');
    });
  }, 200);

  // --- Resize ---
  window.addEventListener('resize', function() {
    allCharts.forEach(function(c) { c.resize(); });
  });
})();
