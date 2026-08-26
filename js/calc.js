/*
 * 期末急救分诊台 — 纯计算模块
 * 无 DOM 依赖:浏览器里挂到 window.FirstAid,Node 里 require() 供测试使用。
 *
 * 核心公式(总评 = 平时 × w% + 期末 × (100−w)%):
 *   期末至少需要 = ⌈ (目标总分 − 平时 × w%) ÷ (100% − w%) ⌉
 *
 * 分诊等级(按期末所需分数):
 *   discharged  ≤ 0    已出院——躺着都能过
 *   mild        ≤ 60   轻症——正常复习即可
 *   severe      ≤ 90   重症——需要爆肝抢救
 *   critical    ≤ 100  病危——一分都不能丢
 *   beyond      > 100  无力回天——诚实告知差距
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api; // Node(测试环境)
  }
  root.FirstAid = api; // 浏览器经典脚本
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX = 100;
  // 浮点防护:31.6/0.4 可能算出 79.00000000000001,直接 ceil 会虚高 1 分
  var EPS = 1e-9;

  function isNum(v) {
    if (v === '' || v == null) return false;
    var n = Number(v);
    return isFinite(n);
  }

  function inRange(v, lo, hi) {
    var n = Number(v);
    return n >= lo - EPS && n <= hi + EPS;
  }

  /**
   * 反推期末所需最低分。
   * @param {object} input {usual, usualWeight, goal} 均为 0-100
   * @returns {{ok:true, needed:number, rawNeeded:number, status:string, finalWeight:number}}
   *          或 {ok:false, error:string}
   */
  function computeNeeded(input) {
    input = input || {};
    if (!isNum(input.usual) || !inRange(input.usual, 0, MAX)) {
      return { ok: false, error: '平时分需要在 0-100 之间' };
    }
    if (!isNum(input.usualWeight) || !inRange(input.usualWeight, 0, MAX)) {
      return { ok: false, error: '平时分占比需要在 0-100 之间' };
    }
    if (!isNum(input.goal) || !inRange(input.goal, 0, MAX)) {
      return { ok: false, error: '目标分数需要在 0-100 之间' };
    }

    var usual = Number(input.usual);
    var w = Number(input.usualWeight);
    var goal = Number(input.goal);
    var finalWeight = MAX - w;

    if (finalWeight <= EPS) {
      return {
        ok: false,
        error: '期末占比为 0(平时占比 ' + w + '%)——总评已定,期末考多少都不影响'
      };
    }

    var rawNeeded = Math.ceil((goal - usual * w / MAX) / (finalWeight / MAX) - EPS);
    var status = classify(rawNeeded);

    return {
      ok: true,
      needed: Math.max(0, rawNeeded),
      rawNeeded: rawNeeded,
      status: status,
      finalWeight: finalWeight
    };
  }

  /** 按期末所需分数划分分诊等级 */
  function classify(needed) {
    if (needed <= 0) return 'discharged';
    if (needed <= 60) return 'mild';
    if (needed <= 90) return 'severe';
    if (needed <= MAX) return 'critical';
    return 'beyond';
  }

  /**
   * 摸底模式:考完对答案,已知期末估分,反推总评。
   * @param {object} input {usual, usualWeight, finalScore}
   * @returns {{ok:true, total:number}} 或 {ok:false, error:string}
   */
  function predictTotal(input) {
    input = input || {};
    if (!isNum(input.usual) || !inRange(input.usual, 0, MAX)) {
      return { ok: false, error: '平时分需要在 0-100 之间' };
    }
    if (!isNum(input.usualWeight) || !inRange(input.usualWeight, 0, MAX)) {
      return { ok: false, error: '平时分占比需要在 0-100 之间' };
    }
    if (!isNum(input.finalScore) || !inRange(input.finalScore, 0, MAX)) {
      return { ok: false, error: '期末估分需要在 0-100 之间' };
    }

    var usual = Number(input.usual);
    var w = Number(input.usualWeight);
    var finalScore = Number(input.finalScore);
    var total = usual * w / MAX + finalScore * (MAX - w) / MAX;

    return { ok: true, total: Math.round((total + EPS) * 10) / 10 };
  }

  /**
   * 分诊:对一批课程逐门计算,按病情从重到轻排序,汇总体检报告。
   * @param {Array} courses [{id?, name, usual, usualWeight, goal}]
   * @returns {{entries:Array, summary:object}} entries 按危险程度降序;
   *          数据不全的课程 status='pending' 排最后。
   */
  function triage(courses) {
    var entries = (courses || []).map(function (c, i) {
      var res = computeNeeded(c);
      return {
        id: c.id != null ? c.id : i,
        name: c.name || ('课程 ' + (i + 1)),
        usual: c.usual,
        usualWeight: c.usualWeight,
        goal: c.goal,
        result: res
      };
    });

    var order = { beyond: 0, critical: 1, severe: 2, mild: 3, discharged: 4, pending: 5 };
    entries.sort(function (a, b) {
      var oa = order[a.result.ok ? a.result.status : 'pending'];
      var ob = order[b.result.ok ? b.result.status : 'pending'];
      if (oa !== ob) return oa - ob;
      // 同等级内按所需分数降序,更急的排前面
      var na = a.result.ok ? a.result.rawNeeded : -Infinity;
      var nb = b.result.ok ? b.result.rawNeeded : -Infinity;
      return nb - na;
    });

    var summary = { discharged: 0, mild: 0, severe: 0, critical: 0, beyond: 0, pending: 0, total: entries.length };
    entries.forEach(function (e) {
      summary[e.result.ok ? e.result.status : 'pending']++;
    });

    return { entries: entries, summary: summary };
  }

  /* ---------- 考试倒计时 ---------- */

  /**
   * 距考试还有几天(按本地日历日计算,当天为 0,已考过为负)。
   * @param {string} dateStr 'YYYY-MM-DD'
   * @param {Date} [now] 可注入的"当前时间",测试用
   * @returns {number|null} 非法/未填返回 null
   */
  function daysUntil(dateStr, now) {
    if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    var today = now ? new Date(now) : new Date();
    var target = new Date(dateStr + 'T00:00:00');
    if (isNaN(target.getTime())) return null;
    var start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((target - start) / 86400000);
  }

  /* ---------- URL 状态编解码(分享链接用) ---------- */

  function utf8ToBase64Url(str) {
    var b64;
    if (typeof btoa === 'function') {
      b64 = btoa(unescape(encodeURIComponent(str)));
    } else {
      b64 = Buffer.from(str, 'utf8').toString('base64');
    }
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlToUtf8(str) {
    var b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    try {
      if (typeof atob === 'function') {
        return decodeURIComponent(escape(atob(b64)));
      }
      return Buffer.from(b64, 'base64').toString('utf8');
    } catch (e) {
      return null;
    }
  }

  /**
   * 课程列表 → 紧凑 base64url(短键名,链接尽量短)。
   * @param {Array} courses [{name, usual, usualWeight, goal}]
   * @returns {string}
   */
  function encodeState(courses) {
    var compact = (courses || []).map(function (c) {
      var row = {
        n: c.name || '',
        u: Number(c.usual) || 0,
        w: Number(c.usualWeight) || 0,
        g: Number(c.goal) != null ? Number(c.goal) : 60
      };
      if (c.examDate) row.d = c.examDate;
      return row;
    });
    return utf8ToBase64Url(JSON.stringify({ v: 1, c: compact }));
  }

  /**
   * base64url → 课程列表;解析失败返回 null。
   * @param {string} str
   * @returns {Array|null}
   */
  function decodeState(str) {
    if (!str || typeof str !== 'string' || str.length > 8000) return null;
    var json = base64UrlToUtf8(str);
    if (!json) return null;
    var data;
    try {
      data = JSON.parse(json);
    } catch (e) {
      return null;
    }
    if (!data || !Array.isArray(data.c)) return null;
    var courses = data.c.map(function (r) {
      return {
        name: typeof r.n === 'string' ? r.n.slice(0, 30) : '',
        usual: Number(r.u) || 0,
        usualWeight: Number(r.w) || 0,
        goal: isNum(r.g) ? Number(r.g) : 60,
        examDate: /^\d{4}-\d{2}-\d{2}$/.test(r.d) ? r.d : ''
      };
    });
    return courses.slice(0, 20);
  }

  return {
    computeNeeded: computeNeeded,
    classify: classify,
    predictTotal: predictTotal,
    triage: triage,
    daysUntil: daysUntil,
    encodeState: encodeState,
    decodeState: decodeState
  };
});
