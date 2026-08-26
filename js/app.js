/*
 * 期末急救分诊台 — 界面逻辑
 * 依赖 js/calc.js(window.FirstAid),无其他依赖。
 *
 * 状态模型:
 *   courses: [{id, name, usual, usualWeight, goal}]
 *   stats:   {date: 'YYYY-MM-DD', count: N}  今日分诊次数(本地)
 *
 * 数据流:URL ?t= 参数 > localStorage;输入即时更新单卡结果与总览,
 * 不整树重渲染(避免输入焦点丢失);「开始分诊」才重排卡片顺序。
 */
(function () {
  'use strict';

  var STORE_KEY = 'firstAidTriage.v1';
  var STATS_KEY = 'firstAidTriage.stats.v1';

  var SEV_LABEL = {
    discharged: '已出院',
    mild: '轻症',
    severe: '重症',
    critical: '病危',
    beyond: '无力回天',
    pending: '待接诊'
  };

  var state = {
    courses: [],
    stats: { date: today(), count: 0 }
  };

  var $ = function (sel) { return document.querySelector(sel); };
  var casesEl = $('#cases');
  var emptyHint = $('#emptyHint');
  var saveTimer = null;

  /* ---------- 初始化 ---------- */

  function init() {
    loadStats();

    var shared = new URLSearchParams(location.search).get('t');
    var decoded = shared ? FirstAid.decodeState(shared) : null;
    if (decoded && decoded.length) {
      state.courses = decoded.map(hydrate);
      toast('已载入分享的分诊场景(' + decoded.length + ' 门课)');
    } else {
      state.courses = loadStore();
    }

    if (!state.courses.length) {
      state.courses = [newCourse()];
    }

    renderAll();
    sortCourses();          // 分享链接进来先按危重排好
    renderAll();

    bindGlobal();
  }

  function hydrate(row) {
    return {
      id: uid(),
      name: row.name || '',
      usual: row.usual,
      usualWeight: row.usualWeight,
      goal: row.goal,
      examDate: row.examDate || ''
    };
  }

  function newCourse() {
    return { id: uid(), name: '', usual: '', usualWeight: 40, goal: 60, examDate: '' };
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  /* ---------- 存取 ---------- */

  function loadStore() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      return Array.isArray(raw) ? raw.map(function (c) {
        return {
          id: c.id || uid(),
          name: typeof c.name === 'string' ? c.name : '',
          usual: c.usual,
          usualWeight: c.usualWeight,
          goal: c.goal,
          examDate: typeof c.examDate === 'string' ? c.examDate : ''
        };
      }) : [];
    } catch (e) {
      return [];
    }
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state.courses));
      } catch (e) { /* 隐私模式等场景静默降级 */ }
    }, 300);
  }

  function loadStats() {
    try {
      var s = JSON.parse(localStorage.getItem(STATS_KEY) || 'null');
      if (s && s.date === today()) {
        state.stats = s;
      } else {
        state.stats = { date: today(), count: 0 };
      }
    } catch (e) { /* 保持默认 */ }
    $('#statsCount').textContent = state.stats.count;
  }

  function bumpStats() {
    state.stats = { date: today(), count: state.stats.count + 1 };
    try { localStorage.setItem(STATS_KEY, JSON.stringify(state.stats)); } catch (e) {}
    $('#statsCount').textContent = state.stats.count;
  }

  /* ---------- 渲染 ---------- */

  function renderAll() {
    casesEl.innerHTML = '';
    state.courses.forEach(function (course) {
      casesEl.appendChild(renderCase(course));
    });
    emptyHint.style.display = state.courses.length ? 'none' : '';
    updateSummary();
  }

  function renderCase(course) {
    var el = document.createElement('article');
    el.className = 'case';
    el.dataset.id = course.id;

    var top = document.createElement('div');
    top.className = 'case-top';

    var name = document.createElement('input');
    name.className = 'case-name';
    name.type = 'text';
    name.maxLength = 30;
    name.placeholder = '课程名(如:高等数学)';
    name.setAttribute('aria-label', '课程名');
    name.value = course.name;
    name.addEventListener('input', function () {
      course.name = name.value;
      save();
    });
    top.appendChild(name);

    var del = document.createElement('button');
    del.className = 'case-del';
    del.type = 'button';
    del.setAttribute('aria-label', '删除这门课');
    del.textContent = '✕';
    del.addEventListener('click', function () {
      state.courses = state.courses.filter(function (c) { return c.id !== course.id; });
      save();
      if (!state.courses.length) state.courses = [newCourse()];
      renderAll();
    });
    top.appendChild(del);
    el.appendChild(top);

    var fields = document.createElement('div');
    fields.className = 'case-fields';
    fields.appendChild(makeField(course, 'usual', '平时分', '85'));
    fields.appendChild(makeField(course, 'usualWeight', '平时占比 %', '40'));
    fields.appendChild(makeField(course, 'goal', '目标总分', '60'));
    fields.appendChild(makeDateField(course));
    el.appendChild(fields);

    var result = document.createElement('div');
    result.className = 'case-result';
    result.setAttribute('aria-live', 'polite');
    var badge = document.createElement('span');
    badge.className = 'sev-badge';
    var need = document.createElement('span');
    need.className = 'case-need';
    var dBadge = document.createElement('span');
    dBadge.className = 'd-badge';
    dBadge.hidden = true;
    result.appendChild(badge);
    result.appendChild(need);
    result.appendChild(dBadge);
    el.appendChild(result);

    el.appendChild(renderProbe(course));

    updateCase(el, course);
    updateCountdown(el, course);
    return el;
  }

  function makeField(course, key, label, placeholder) {
    var wrap = document.createElement('div');
    wrap.className = 'field';

    var lab = document.createElement('label');
    lab.textContent = label;
    lab.htmlFor = 'f-' + course.id + '-' + key;
    wrap.appendChild(lab);

    var input = document.createElement('input');
    input.type = 'number';
    input.id = 'f-' + course.id + '-' + key;
    input.min = '0';
    input.max = '100';
    input.step = key === 'usualWeight' ? '1' : '0.5';
    input.placeholder = placeholder;
    input.value = course[key];
    input.addEventListener('input', function () {
      course[key] = input.value;
      updateCase(wrap.closest('.case'), course);
      updateSummary();
      save();
    });
    wrap.appendChild(input);
    return wrap;
  }

  /* 考试日期字段 + 倒计时徽章 */
  function makeDateField(course) {
    var wrap = document.createElement('div');
    wrap.className = 'field fieldDate';

    var lab = document.createElement('label');
    lab.textContent = '考试日期(选填)';
    wrap.appendChild(lab);

    var input = document.createElement('input');
    input.type = 'date';
    input.setAttribute('aria-label', '考试日期');
    input.value = course.examDate || '';
    input.addEventListener('input', function () {
      course.examDate = input.value;
      var card = wrap.closest('.case');
      updateCountdown(card, course);
      save();
    });
    wrap.appendChild(input);
    return wrap;
  }

  function updateCountdown(cardEl, course) {
    if (!cardEl) return;
    var dBadge = cardEl.querySelector('.d-badge');
    var d = FirstAid.daysUntil(course.examDate || '');
    if (d === null) {
      dBadge.hidden = true;
      return;
    }
    dBadge.hidden = false;
    dBadge.className = 'd-badge';
    if (d < 0) {
      dBadge.textContent = '已考完';
    } else if (d === 0) {
      dBadge.textContent = '⚔️ 今日开考';
      dBadge.classList.add('d-today');
    } else {
      dBadge.textContent = 'D-' + d;
      if (d <= 3) dBadge.classList.add('d-soon');
    }
  }

  /* 摸底:考完对答案,估总评 */
  function renderProbe(course) {
    var details = document.createElement('details');
    details.className = 'case-probe';

    var summary = document.createElement('summary');
    summary.textContent = '考完对答案?摸底估总分';
    details.appendChild(summary);

    var row = document.createElement('div');
    row.className = 'probe-row';

    var field = document.createElement('div');
    field.className = 'field';
    field.dataset.probe = '';
    var lab = document.createElement('label');
    lab.textContent = '期末估分';
    var input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '100';
    input.step = '0.5';
    input.placeholder = '75';
    field.appendChild(lab);
    field.appendChild(input);

    var total = document.createElement('span');
    total.className = 'probe-total';
    total.textContent = '—';

    input.addEventListener('input', function () {
      var r = FirstAid.predictTotal({
        usual: course.usual,
        usualWeight: course.usualWeight,
        finalScore: input.value
      });
      if (r.ok) {
        total.textContent = '总评 ' + r.total;
        field.classList.toggle('invalid', false);
      } else {
        total.textContent = r.error;
        field.classList.toggle('invalid', input.value !== '');
      }
    });

    row.appendChild(field);
    row.appendChild(total);
    details.appendChild(row);
    return details;
  }

  /* 单卡结果更新(不重排 DOM,保住输入焦点) */
  function updateCase(cardEl, course) {
    if (!cardEl) return;
    var r = FirstAid.computeNeeded(course);
    var badge = cardEl.querySelector('.sev-badge');
    var need = cardEl.querySelector('.case-need');
    cardEl.querySelectorAll('.field:not([data-probe])').forEach(function (f) {
      var input = f.querySelector('input');
      var v = input.value;
      f.classList.toggle('invalid', v !== '' && !(isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100));
    });

    need.textContent = '';
    if (!r.ok) {
      var empty = course.usual === '' || course.usualWeight === '' || course.goal === '';
      cardEl.className = 'case';
      badge.textContent = SEV_LABEL.pending;
      need.textContent = empty ? '补全字段后自动诊断' : r.error;
      return;
    }

    cardEl.className = 'case sev-' + r.status;
    badge.textContent = SEV_LABEL[r.status];

    if (r.status === 'discharged') {
      need.textContent = '期末 0 分也稳,躺平保平安';
    } else if (r.status === 'beyond') {
      need.textContent = '需 ';
      var b1 = document.createElement('b');
      b1.textContent = r.needed;
      need.appendChild(b1);
      need.appendChild(document.createTextNode(' 分,超满分 ' + (r.needed - 100) + ' 分,考虑补考战略'));
    } else {
      need.appendChild(document.createTextNode('期末至少 '));
      var b = document.createElement('b');
      b.textContent = r.needed;
      need.appendChild(b);
      need.appendChild(document.createTextNode(' 分'));
    }
  }

  function updateSummary() {
    var t = FirstAid.triage(state.courses);
    $('#sumCritical').textContent = t.summary.critical + t.summary.beyond;
    $('#sumSevere').textContent = t.summary.severe;
    $('#sumMild').textContent = t.summary.mild;
    $('#sumDischarged').textContent = t.summary.discharged;

    var v = $('#verdict');
    document.body.classList.toggle('alert-mode',
      (t.summary.critical + t.summary.beyond) > 0 && t.summary.pending === 0);
    if (!t.entries.length) {
      v.textContent = '还没有病例,先添加一门课。';
      return;
    }
    var worst = t.entries[0];
    if (!worst.result.ok) {
      v.textContent = '还有课程数据不全,补全后给出诊断。';
      return;
    }
    var s = worst.result.status;
    var name = worst.name || '未命名课程';
    if (s === 'discharged') {
      v.textContent = '最稳的一门:' + name + '——全部已出院,期末快乐!';
    } else if (s === 'beyond') {
      v.textContent = '最急的一门:' + name + ',需 ' + worst.result.needed + ' 分(超满分),早做打算。';
    } else {
      v.textContent = '最急的一门:' + name + ',期末至少 ' + worst.result.needed + ' 分。';
    }
  }

  /* 排序:病情重的在前,数据不全的垫底 */
  function sortCourses() {
    var order = FirstAid.triage(state.courses).entries.map(function (e) { return e.id; });
    state.courses.sort(function (a, b) {
      return order.indexOf(a.id) - order.indexOf(b.id);
    });
  }

  /* ---------- 交互 ---------- */

  function bindGlobal() {
    $('#btnAdd').addEventListener('click', function () {
      state.courses.push(newCourse());
      renderAll();
      save();
      var cards = casesEl.querySelectorAll('.case');
      var last = cards[cards.length - 1];
      if (last) {
        last.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var nameInput = last.querySelector('.case-name');
        if (nameInput) nameInput.focus();
      }
    });

    $('#btnTriage').addEventListener('click', function () {
      sortCourses();
      renderAll();
      save();
      bumpStats();
      ping();
      var t = FirstAid.triage(state.courses);
      var parts = [];
      if (t.summary.beyond) parts.push('无力回天 ' + t.summary.beyond);
      if (t.summary.critical) parts.push('病危 ' + t.summary.critical);
      if (t.summary.severe) parts.push('重症 ' + t.summary.severe);
      if (t.summary.mild) parts.push('轻症 ' + t.summary.mild);
      if (t.summary.discharged) parts.push('已出院 ' + t.summary.discharged);
      toast(parts.length ? '分诊完成:' + parts.join(' · ') : '先补全病例数据');
      casesEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // 全员出院:撒花庆祝
      if (t.summary.total > 0 && t.summary.pending === 0 &&
          t.summary.discharged === t.summary.total) {
        celebrate();
        toast('🎉 全员出院!期末周请开始享受生活');
      }
    });

    $('#btnPick').addEventListener('click', openPick);

    $('#btnNotice').addEventListener('click', openNotice);
    $('#statsBadge').addEventListener('click', openLuck);

    // 弹层:点背景 / Esc / data-close 均可关
    document.querySelectorAll('.overlay').forEach(function (ov) {
      ov.addEventListener('click', function (e) {
        if (e.target === ov || e.target.closest('[data-close]')) closeOverlay(ov);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.overlay.show').forEach(closeOverlay);
      } else if (e.key === 'Enter' && !e.target.closest('.overlay')) {
        $('#btnTriage').click();
      }
    });
  }

  function closeOverlay(ov) {
    ov.classList.remove('show');
    var fill = ov.querySelector('.luck-fill');
    if (fill) fill.style.width = '0';
  }

  /* ---------- 病危通知书 ---------- */

  var noticeText = '';
  var noticeUrl = '';

  function openNotice() {
    var t = FirstAid.triage(state.courses);
    var list = $('#noticeList');
    list.innerHTML = '';

    var lines = [];
    t.entries.forEach(function (e) {
      var li = document.createElement('li');
      var left = document.createElement('span');
      left.textContent = (e.name || '未命名课程');
      var badge = document.createElement('span');
      badge.className = 'sev-badge';
      var right = document.createElement('b');

      if (e.result.ok) {
        badge.textContent = SEV_LABEL[e.result.status];
        right.textContent = e.result.status === 'discharged'
          ? '稳过'
          : '需 ' + e.result.needed + ' 分';
        lines.push('- ' + (e.name || '未命名课程') + ':' + SEV_LABEL[e.result.status] +
          (e.result.status === 'discharged' ? ',稳过' : ',期末至少 ' + e.result.needed + ' 分'));
        li.style.borderLeft = '3px solid var(--sev-' + (e.result.status === 'beyond' ? 'critical' : e.result.status) + ')';
      } else {
        badge.textContent = SEV_LABEL.pending;
        right.textContent = '数据不全';
        lines.push('- ' + (e.name || '未命名课程') + ':数据不全');
      }
      li.appendChild(left);
      li.appendChild(badge);
      li.appendChild(right);
      list.appendChild(li);
    });

    var now = new Date();
    $('#noticeDate').textContent = '诊断时间 ' + now.toLocaleString('zh-CN', { hour12: false });

    var advice;
    var s = t.summary;
    if (!t.entries.length) {
      advice = '空单一张,先把病例加上再来。';
    } else if (s.beyond) {
      advice = '医嘱:有 ' + s.beyond + ' 门神仙难救,调整目标或研究补考政策,别硬扛。';
    } else if (s.critical) {
      advice = '医嘱:病危课程一分都不能丢,优先抢救,其余顺其自然。';
    } else if (s.severe) {
      advice = '医嘱:重症课程进入爆肝模式,轻症的顺手带一带。';
    } else if (s.mild) {
      advice = '医嘱:整体可控,正常复习,该吃吃该喝喝。';
    } else {
      advice = '医嘱:全员已出院,期末周请开始享受生活。';
    }
    $('#noticeAdvice').textContent = advice;

    noticeUrl = location.origin + location.pathname + '?t=' + FirstAid.encodeState(state.courses);
    noticeText = '【期末病危通知书】\n' + lines.join('\n') + '\n' + advice +
      '\n—— 来自期末急救分诊台\n' + noticeUrl;

    $('#noticeOverlay').classList.add('show');
  }

  function bindNoticeActions() {
    $('#btnCopyText').addEventListener('click', function () {
      copyToClipboard(noticeText, '通知书文本已复制,去粘贴吧');
    });
    $('#btnPoster').addEventListener('click', drawPoster);
    $('#btnShareLink').addEventListener('click', function () {
      if (navigator.share) {
        navigator.share({
          title: '期末病危通知书',
          text: noticeText.split('\n—— ')[0],
          url: noticeUrl
        }).catch(function () {});
      } else {
        copyToClipboard(noticeUrl, '链接已复制,发给病友吧');
      }
    });
  }

  function copyToClipboard(text, okMsg) {
    var done = function () { toast(okMsg); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        legacyCopy(text) && done();
      });
    } else {
      legacyCopy(text) && done();
    }
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }

  /* ---------- 今日天选科目 ---------- */

  var PICK_ADVICE = [
    '天意如此,今晚就它了。放下手机,翻开课本。',
    '系统已替你做出选择:逃避可耻且没用。',
    '缘分到了。这门课正在等你,别让它等太久。',
    '命运的齿轮开始转动——从这门课开始复习。',
    '别问为什么是它,问就是玄学。快去看书!'
  ];

  function openPick() {
    var t = FirstAid.triage(state.courses);
    var pool = t.entries.filter(function (e) {
      return e.result.ok && e.result.status !== 'discharged';
    });
    if (!pool.length) {
      celebrate();
      toast('全员出院,天选轮空——直接开香槟吧 🍾');
      return;
    }
    // 病情越重权重越大:beyond×4 / critical×3 / severe×2 / mild×1
    var weightMap = { beyond: 4, critical: 3, severe: 2, mild: 1 };
    var bag = [];
    pool.forEach(function (e) {
      for (var i = 0; i < (weightMap[e.result.status] || 1); i++) bag.push(e);
    });
    var chosen = bag[Math.floor(Math.random() * bag.length)];

    var name = chosen.name || '未命名课程';
    var need = chosen.result.status === 'discharged' ? '' :
      '期末至少 ' + chosen.result.needed + ' 分,';
    $('#pickCourse').textContent = name;
    $('#pickAdvice').textContent = need + PICK_ADVICE[Math.floor(Math.random() * PICK_ADVICE.length)];

    // 重播入场动画
    var dice = document.querySelector('.pick-dice');
    var course = $('#pickCourse');
    [dice, course].forEach(function (el) {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    });

    $('#pickOverlay').classList.add('show');
    ping();

    // 高亮被选中的病历卡
    sortCourses();
    renderAll();
    var card = casesEl.querySelector('[data-id="' + chosen.id + '"]');
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('animate__animated', 'animate__heartBeat');
      card.addEventListener('animationend', function () {
        card.classList.remove('animate__animated', 'animate__heartBeat');
      }, { once: true });
    }
  }

  /* ---------- 撒花 ---------- */

  function celebrate() {
    if (typeof confetti !== 'function') return;
    try {
      var fire = function (x, angle) {
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { x: x, y: 0.7 },
          angle: angle,
          colors: ['#DC143C', '#B91C1C', '#FFD700', '#FFFFFF', '#4CAF50']
        });
      };
      fire(0.2, 60);
      fire(0.8, 120);
      setTimeout(function () { fire(0.5, 90); }, 250);
    } catch (e) { /* 某些环境 canvas 不可用时静默 */ }
  }

  /* ---------- 病危通知书海报(canvas 绘制,无依赖) ---------- */

  function drawPoster() {
    var t = FirstAid.triage(state.courses);
    var W = 640;
    var rowH = 74;
    var H = 430 + t.entries.length * rowH + 120;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');

    // 底色
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#7A0C0C');
    bg.addColorStop(1, '#4A0505');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 红十字水印
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#fff';
    ctx.translate(W - 90, 90);
    ctx.rotate(0.26);
    ctx.fillRect(-18, -70, 36, 140);
    ctx.fillRect(-70, -18, 140, 36);
    ctx.restore();

    // 标题章
    ctx.strokeStyle = '#FFD9D9';
    ctx.lineWidth = 3;
    ctx.strokeRect(140, 44, W - 280, 64);
    ctx.fillStyle = '#FFECEC';
    ctx.font = 'bold 38px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('病 危 通 知 书', W / 2, 90);

    ctx.font = '14px Consolas,monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('诊断时间 ' + new Date().toLocaleString('zh-CN', { hour12: false }), W / 2, 132);

    // 分隔线
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(48, 156);
    ctx.lineTo(W - 48, 156);
    ctx.stroke();
    ctx.setLineDash([]);

    // 病例行
    var SEV_COLOR = {
      discharged: '#7BD88F', mild: '#A3D977', severe: '#F6C453',
      critical: '#FF7B72', beyond: '#D64545', pending: '#B8B8B8'
    };
    var y = 196;
    t.entries.forEach(function (e) {
      var st = e.result.ok ? e.result.status : 'pending';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 24px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText((e.name || '未命名课程').slice(0, 12), 60, y);

      ctx.textAlign = 'right';
      ctx.font = 'bold 26px Consolas,monospace';
      ctx.fillStyle = SEV_COLOR[st];
      var need = !e.result.ok ? '数据不全'
        : st === 'discharged' ? '稳过'
        : '需 ' + e.result.needed + ' 分';
      ctx.fillText(need, W - 170, y);

      ctx.font = '18px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = SEV_COLOR[st];
      ctx.fillText(SEV_LABEL[st], W - 60, y);

      // 等级色条
      ctx.fillStyle = SEV_COLOR[st];
      ctx.fillRect(44, y - 26, 5, 36);

      // 摸底日期徽章
      var d = FirstAid.daysUntil(e.examDate || '');
      if (d !== null) {
        ctx.font = '15px Consolas,monospace';
        ctx.fillStyle = d <= 3 && d >= 0 ? '#FF7B72' : 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'left';
        ctx.fillText(d < 0 ? '已考完' : d === 0 ? '今日开考' : 'D-' + d, 60, y + 26);
      }
      y += rowH;
    });

    // 医嘱 + 落款
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'italic 17px "PingFang SC","Microsoft YaHei",sans-serif';
    wrapText(ctx, $('#noticeAdvice').textContent || '医嘱:先救最急的,然后睡觉。', W / 2, y + 16, W - 140, 26);
    ctx.font = '14px Consolas,monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('期末急救分诊台 · shangjian2023.github.io/exam-saving', W / 2, H - 40);

    var a = document.createElement('a');
    a.download = '病危通知书.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
    toast('海报已生成,长按/右键保存');
  }

  function wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
    var chars = String(text).split('');
    var line = '';
    var startY = y;
    for (var i = 0; i < chars.length; i++) {
      var test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, cx, startY);
        line = chars[i];
        startY += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, cx, startY);
  }

  /* ---------- 急救运势(彩蛋) ---------- */

  function openLuck() {
    $('#luckCount').textContent = state.stats.count;
    var luck = Math.min(100, 30 + Math.floor(Math.random() * 41) + (new Date().getHours() % 12) * 2);
    $('#luckValue').textContent = luck + '%';
    var ov = $('#luckOverlay');
    ov.classList.add('show');
    setTimeout(function () { $('#luckFill').style.width = luck + '%'; }, 80);
  }

  /* ---------- 杂项 ---------- */

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  var audioCtx = null;
  function ping() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch (e) { /* 无声环境下静默 */ }
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindNoticeActions();
    init();
  });
})();
