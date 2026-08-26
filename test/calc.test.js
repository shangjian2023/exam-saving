'use strict';

const test = require('node:test');
const assert = require('node:assert');
const FirstAid = require('../js/calc.js');

/* ---------- computeNeeded ---------- */

test('基础:平时80/权重40/目标60 → 需要47', () => {
  const r = FirstAid.computeNeeded({ usual: 80, usualWeight: 40, goal: 60 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.needed, 47);
  assert.strictEqual(r.status, 'mild');
  assert.strictEqual(r.finalWeight, 60);
});

test('浮点防护:平时84/权重40/目标60 → 44 而非 45', () => {
  // (60 - 84*0.4) / 0.6 = 44,但浮点会算出 44.00000000000001
  const r = FirstAid.computeNeeded({ usual: 84, usualWeight: 40, goal: 60 });
  assert.strictEqual(r.needed, 44);
});

test('非整除向上取整:平时31.6/权重40/目标70 → 96', () => {
  // (70 − 31.6×0.4) / 0.6 = 95.6…"至少需要"必须进位
  const r = FirstAid.computeNeeded({ usual: 31.6, usualWeight: 40, goal: 70 });
  assert.strictEqual(r.needed, 96);
});

test('小数平时分:85.5/30%/60 → 50', () => {
  const r = FirstAid.computeNeeded({ usual: 85.5, usualWeight: 30, goal: 60 });
  assert.strictEqual(r.needed, 50);
});

test('已稳过:负需求钳位为 0,等级 discharged', () => {
  const r = FirstAid.computeNeeded({ usual: 95, usualWeight: 80, goal: 60 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.needed, 0);
  assert.strictEqual(r.rawNeeded < 0, true);
  assert.strictEqual(r.status, 'discharged');
});

test('临界值:恰好需要 0 分 → discharged', () => {
  const r = FirstAid.computeNeeded({ usual: 100, usualWeight: 60, goal: 60 });
  assert.strictEqual(r.needed, 0);
  assert.strictEqual(r.status, 'discharged');
});

test('恰好 60/90/100 分边界归属', () => {
  assert.strictEqual(FirstAid.classify(60), 'mild');
  assert.strictEqual(FirstAid.classify(61), 'severe');
  assert.strictEqual(FirstAid.classify(90), 'severe');
  assert.strictEqual(FirstAid.classify(91), 'critical');
  assert.strictEqual(FirstAid.classify(100), 'critical');
  assert.strictEqual(FirstAid.classify(101), 'beyond');
});

test('权重 0:期末全占比,需要多少考多少', () => {
  const r = FirstAid.computeNeeded({ usual: 55, usualWeight: 0, goal: 60 });
  assert.strictEqual(r.needed, 60);
});

test('权重 100:期末占比为 0 → 明确报错而非除零', () => {
  const r = FirstAid.computeNeeded({ usual: 80, usualWeight: 100, goal: 60 });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /期末占比为 0/);
});

test('无力回天:保留真实所需分供展示差距', () => {
  const r = FirstAid.computeNeeded({ usual: 0, usualWeight: 50, goal: 100 });
  assert.strictEqual(r.status, 'beyond');
  assert.strictEqual(r.needed, 200);
});

test('非法输入一律 ok:false', () => {
  for (const bad of [
    { usual: '', usualWeight: 40, goal: 60 },
    { usual: 101, usualWeight: 40, goal: 60 },
    { usual: -1, usualWeight: 40, goal: 60 },
    { usual: 80, usualWeight: 101, goal: 60 },
    { usual: 80, usualWeight: 'abc', goal: 60 },
    { usual: 80, usualWeight: 40, goal: 101 },
    null,
    {}
  ]) {
    const r = FirstAid.computeNeeded(bad);
    assert.strictEqual(r.ok, false, JSON.stringify(bad));
    assert.strictEqual(typeof r.error, 'string');
  }
});

/* ---------- predictTotal ---------- */

test('摸底:平时80/权重40/期末70 → 总评74', () => {
  const r = FirstAid.predictTotal({ usual: 80, usualWeight: 40, finalScore: 70 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.total, 74);
});

test('摸底:小数与浮点四舍五入到 0.1', () => {
  const r = FirstAid.predictTotal({ usual: 85.5, usualWeight: 30, finalScore: 92 });
  assert.strictEqual(r.total, 90.1);
});

test('摸底:权重 100 时总评就是平时分', () => {
  const r = FirstAid.predictTotal({ usual: 82, usualWeight: 100, finalScore: 0 });
  assert.strictEqual(r.total, 82);
});

test('摸底:非法输入报错', () => {
  assert.strictEqual(FirstAid.predictTotal({ usual: 80, usualWeight: 40, finalScore: 101 }).ok, false);
  assert.strictEqual(FirstAid.predictTotal({ usual: 80, usualWeight: 40, finalScore: '' }).ok, false);
});

/* ---------- triage ---------- */

test('分诊排序:beyond > critical > severe > mild > discharged > pending', () => {
  const { entries, summary } = FirstAid.triage([
    { name: '稳过课', usual: 95, usualWeight: 80, goal: 60 },   // discharged,需求 -80
    { name: '躺赢课', usual: 100, usualWeight: 60, goal: 60 },  // discharged,需求 0
    { name: '普通课', usual: 80, usualWeight: 40, goal: 60 },   // 47 mild
    { name: '硬课', usual: 50, usualWeight: 50, goal: 90 },     // (90-25)/.5=130 beyond
    { name: '危险课', usual: 60, usualWeight: 30, goal: 90 },   // (90-18)/.7=103 beyond
    { name: '没填完', usual: '', usualWeight: 40, goal: 60 }    // pending
  ]);
  assert.deepStrictEqual(
    entries.map(e => e.name),
    ['硬课', '危险课', '普通课', '躺赢课', '稳过课', '没填完']
  );
  assert.deepStrictEqual(summary, {
    discharged: 2, mild: 1, severe: 0, critical: 0, beyond: 2, pending: 1, total: 6
  });
});

test('同等级内按所需分数降序', () => {
  const { entries } = FirstAid.triage([
    { name: 'A', usual: 70, usualWeight: 40, goal: 60 },  // (60-28)/.6=54
    { name: 'B', usual: 80, usualWeight: 40, goal: 60 }   // 47
  ]);
  assert.deepStrictEqual(entries.map(e => e.name), ['A', 'B']);
});

test('空列表与 null 容错', () => {
  assert.deepStrictEqual(FirstAid.triage([]).entries, []);
  assert.deepStrictEqual(FirstAid.triage(null).summary.total, 0);
});

/* ---------- encodeState / decodeState ---------- */

test('URL 状态编解码回环:中文名 + 小数', () => {
  const courses = [
    { name: '高等数学(下)', usual: 85.5, usualWeight: 40, goal: 60 },
    { name: '大学英语', usual: 92, usualWeight: 30, goal: 80 }
  ];
  const decoded = FirstAid.decodeState(FirstAid.encodeState(courses));
  assert.deepStrictEqual(decoded, courses);
});

test('编解码:URL 安全(无 + / =)', () => {
  const s = FirstAid.encodeState([{ name: '数据结构与??算法', usual: 1, usualWeight: 2, goal: 3 }]);
  assert.match(s, /^[A-Za-z0-9_-]+$/);
});

test('解码:垃圾输入返回 null 而非抛错', () => {
  assert.strictEqual(FirstAid.decodeState('!!!not-base64!!!'), null);
  assert.strictEqual(FirstAid.decodeState(FirstAid.encodeState([{ name: 'x', usual: 1, usualWeight: 1, goal: 1 }]).slice(0, 5) + '###'), null);
  assert.strictEqual(FirstAid.decodeState('e30'), null); // "{}" 非 {c:[...]}
  assert.strictEqual(FirstAid.decodeState(''), null);
  assert.strictEqual(FirstAid.decodeState('A'.repeat(9000)), null);
});

test('解码:超长课程名截断、超量课程截断', () => {
  const long = { name: 'x'.repeat(50), usual: 1, usualWeight: 1, goal: 1 };
  const many = Array.from({ length: 30 }, () => ({ ...long }));
  const decoded = FirstAid.decodeState(FirstAid.encodeState(many));
  assert.strictEqual(decoded.length, 20);
  assert.strictEqual(decoded[0].name.length, 30);
});
