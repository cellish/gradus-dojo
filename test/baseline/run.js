// 判定・解答探索・出題の結果を、乱数の種と時計を固定して取り出す(書法コアへの置き換えの前後で比べるため)。
// 記録は test/baseline/record.json。作り直すのは判定を意図して変えたときだけ: node test/baseline/generate.js
// Math.random と performance.now を一時的に差し替え、終わったら戻す。
'use strict';
const G = require('../../js/engine.js');
const GD = require('../../js/drills.js');
const L = require('../../js/lessons.js');

// 種を固定した乱数(mulberry32)
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const noteStr = (n) => (n ? G.noteStr(n) : null);
const cpStr = (cp) => Object.keys(cp).sort().map((k) => k + '=' + noteStr(cp[k])).join(' ');
// 文言は同じものが何度も出るので、表(texts)の番号で持つ
let texts, textIdx;
const T = (str) => { if (!textIdx.has(str)) { textIdx.set(str, texts.length); texts.push(str); } return textIdx.get(str); };
const iss = (x) => [x.id, x.lv, x.cols, T(x.t), T(x.x)];
const summary = (r) => ({ issues: r.issues.map(iss), dis: r.dis, mo: r.mo, missing: r.missing, complete: r.complete, la: r.la, stats: r.stats });
const gradeOf = (g) => ({ total: g.total, items: g.items.map((x) => [x.id, T(x.t), x.pts, x.cols]), global: g.global, pass: g.pass, complete: g.complete });

function ctxOf(sp, cf, above, cp, rhythm = [], ties = []) {
  const S = G.buildSlots(sp, cf.length, rhythm, ties);
  return { sp, cf, above, slots: S, vals: G.valsOf(S, cp), rhythm, ties };
}

function record() {
  const saveRandom = Math.random, saveNow = performance.now;
  // 時計: 呼ぶたびに 0.05ms 進む(時間の上限で打ち切る処理も、毎回同じ所で止まる)
  const fix = (seed) => { Math.random = rng(seed); let t = 0; performance.now = () => (t += 0.05); };
  try {
    texts = []; textIdx = new Map();
    const out = { texts, analyze: [], lessons: [], solve: [], questions: [], cf: [], drills: [] };
    // 1) 乱数の対旋律(全定旋律 × 第1〜5類 × 上下 × 3)。既定と lenient の判定、採点
    const rand = rng(20261128);
    for (const [mode] of G.FUX) {
      const cf = G.FUX_NOTES[mode];
      for (const sp of [1, 2, 3, 4, 5]) for (const above of [true, false]) for (let k = 0; k < 3; k++) {
        const rhythm = sp === 5 ? G.defaultRhythm(cf.length) : [];
        if (sp === 5 && rand() < 0.5) for (let m = 1; m < cf.length - 1; m++) rhythm[m] = G.PAT_MID[Math.floor(rand() * G.PAT_MID.length)];
        const ties = sp === 4 ? cf.map(() => rand() < 0.8) : [];
        const S = G.buildSlots(sp, cf.length, rhythm, ties), cp = {};
        let prev = cf[0].s + (above ? 4 : -4);
        for (const s of S.filter(G.editable)) {
          if (rand() < 0.08) continue;
          let st = prev + Math.round((rand() * 2 - 1) * (rand() < 0.3 ? 10 : 3));
          const home = cf[s.m].s + (above ? 5 : -5);
          if (Math.abs(st - home) > 11) st = home + Math.round((rand() * 2 - 1) * 6);
          cp[G.skey(s)] = { s: st, a: rand() < 0.12 ? (rand() < 0.5 ? 1 : -1) : 0 };
          prev = st;
        }
        const c = { sp, cf, above, slots: S, vals: G.valsOf(S, cp), rhythm, ties };
        const r = G.analyze(c);
        out.analyze.push({ mode, sp, above, k, cp: cpStr(cp), rhythm, ties, result: summary(r), grade: gradeOf(G.grade(r, c)),
          lenient: G.analyze(Object.assign({}, c, { levels: G.PRESETS.lenient.levels })).issues.map((x) => [x.id, x.lv, x.cols]) });
      }
    }
    // 2) 「学ぶ」の模範例と悪い例
    for (const sp of [1, 2, 3, 4, 5]) {
      const les = L.LESSONS[sp];
      les.examples.forEach((ex, i) => out.lessons.push({ sp, ex: i, result: summary(L.analyzeBuilt(L.build(sp, ex))) }));
      les.bad.forEach((bd, i) => out.lessons.push({ sp, bad: i, result: summary(L.analyzeBuilt(L.build(sp, les.examples[bd.ex], bd.change))) }));
    }
    // 3) 解答探索(全定旋律 × 第1〜5類 × 上下)
    let seed = 1;
    for (const [mode] of G.FUX) for (const sp of [1, 2, 3, 4, 5]) for (const above of [true, false]) {
      fix(seed++);
      const cf = G.FUX_NOTES[mode], rh = sp === 5 ? G.defaultRhythm(cf.length) : [];
      const sol = G.solveFor(sp, cf, above, rh, [], 300);
      out.solve.push({ mode, sp, above, sol: sol ? cpStr(sol) : null, ids: sol ? G.analyze(ctxOf(sp, cf, above, sol, rh)).issues.map((x) => x.id + ':' + x.lv) : null });
    }
    // 4) 復習の出題(INJECT の全規則)
    for (const rule of Object.keys(G.INJECT)) {
      fix(seed++);
      const q = G.makeQuestion(rule);
      out.questions.push(q ? { rule, sp: q.sp, above: q.above, cf: q.cf.map(noteStr).join(' '), cp: cpStr(q.cp), answer: cpStr(q.answer), target: q.target, lv: q.lv } : { rule, q: null });
    }
    // 5) 定旋律の生成
    for (const mode of Object.keys(G.MODES)) { fix(seed++); const c = G.genCF(mode, 10); out.cf.push({ mode, cf: c ? c.map(noteStr).join(' ') : null }); }
    // 6) ドリル
    for (const d of GD.DRILLS) for (let k = 0; k < 3; k++) {
      fix(seed++);
      const q = GD.make(d.id);
      out.drills.push({ id: d.id, k, prompt: q.prompt, choices: q.choices, explain: q.explain });
    }
    return out;
  } finally {
    Math.random = saveRandom; performance.now = saveNow;
  }
}

module.exports = { record };
