// Kulissen n32 (track/kulisse2.js): ohne Grafik geprüft.
//  1) ?kulisse=alt (planDeco kulisse2: false) = Planung exakt wie bis n31 (Prüfsummen von main: tests/node/data/deco_plan_n31.json,
//     erzeugt mit tools/kulisse_plan_hash.mjs auf einer git-archive-Kopie von main vor n32).
//  2) Mit n32 bleibt alles bis n31 Geplante gleich (Tribünen, Gruppen, Fahnen, Portal, Bauten …; Tribünen nur + Bauform);
//     neu Geplantes hält die Regeln: Mindestabstand zu JEDEM Linienpunkt, kein Wasser, nicht in Sprunglücken/Schluchten/
//     Gruben, nahe der Fahrbahn auf Fahrbahnhöhe; Fangzäune liegen zwischen Fahrbahn und Zuschauern; Startaufstellung auf
//     der Fahrbahn hinter der Startlinie; Event-Gelände flach und vollständig; Picknick am ansteigenden Hang.
//  3) Deterministisch, Fahrbahn unverändert, Mengen je Stufe begrenzt.
// Aufruf: node tests/node/test_kulissen2.mjs [Anzahl Seeds je Art, Standard 3]
import crypto from 'crypto';
import fs from 'fs';
import { generate, galleryLayout } from '../../src/track/generator.js';
import { prepare } from '../../src/track/verify.js';
import { planDeco, roadClearance, MIN_CLEAR } from '../../src/track/deco.js';
import { THEMES, THEME_IDS } from '../../src/track/themes.js';
import { MIN_CLEAR2, FAN_MAX, EVENT, STAND_FORMS } from '../../src/track/kulisse2.js';
import { parseTrk } from '../../src/track/trk.js';
import { trkToLayout } from '../../src/track/trkimport.js';
import { showcaseBytes, SHOWCASE } from '../../src/track/showcase.js';
import { planHashes } from '../../tools/kulisse_plan_hash.mjs';

const N = +(process.argv[2] || 3);
let bad = 0, checks = 0;
const byKind = {};
const fail = (m) => { bad++; const k = (m.split(': ')[1] || '').replace(/\(.*$/, '').trim(); byKind[k] = (byKind[k] || 0) + 1; if (bad < 25) console.log('FAIL', m); };
const ok = (c, m) => { checks++; if (!c) fail(m); };

// ---- 1) ?kulisse=alt = n31 ----
{
  const want = JSON.parse(fs.readFileSync(new URL('./data/deco_plan_n31.json', import.meta.url), 'utf8'));
  const root = new URL('../../', import.meta.url).pathname;
  const alt = await planHashes(root, { kulisse2: false });
  let same = 0; for (const k of Object.keys(want)) if (alt[k] === want[k]) same++; else fail(`alt: ${k} weicht von n31 ab`);
  checks += Object.keys(want).length;
  console.log(`?kulisse=alt: ${same}/${Object.keys(want).length} Planungen exakt wie n31`);
  const neu = await planHashes(root, {});
  ok(Object.keys(want).every((k) => neu[k] !== want[k]), 'n32 plant tatsächlich zusätzlich (Prüfsummen anders)');
}

ok(Object.keys(MIN_CLEAR2).every((k) => MIN_CLEAR[k] === MIN_CLEAR2[k]), 'MIN_CLEAR enthält die neuen Arten');

function trackHash(t) {
  const H = crypto.createHash('sha1'), L = t.line;
  for (const k of ['px', 'py', 'pz', 'tx', 'tz', 'bx', 'bz', 'hw', 'air', 'loop']) H.update(Buffer.from(L[k].buffer));
  for (const b of t.batches) { H.update(Buffer.from(b.pos.buffer)); H.update(Buffer.from(b.idx.buffer)); }
  H.update(Buffer.from(t.col.pos.buffer)); H.update(Buffer.from(t.terrain.H.buffer));
  return H.digest('hex');
}
const strip = (o) => JSON.stringify(o, (k, v) => (k === 'form' ? undefined : v));
const OLD = ['stand', 'crowd', 'flag', 'cam', 'portal', 'turbine', 'tower', 'block', 'crane', 'light', 'tyre', 'banner', 'hut', 'board', 'mast'];
const NEW_INST = ['ampel', 'leitturm', 'leinwand', 'pyro', 'zelt', 'foodtruck', 'schirm', 'parkauto', 'riesenrad', 'huepfburg', 'strandbar', 'apres', 'picnic'];
const tot = {};

function check(name, env) {
  const { track } = env, L = track.line, T = track.terrain, n = L.n;
  const h0 = trackHash(track), dist = roadClearance(track);
  const level = []; for (let i = 0; i < n; i++) if (Math.abs(L.py[i] - T.height(L.px[i], L.pz[i])) < 1.5) level.push(i);
  const nearestLevel = (x, z) => { let b = 1600, bi = -1; for (const i of level) { const d = (L.px[i] - x) ** 2 + (L.pz[i] - z) ** 2; if (d < b) { b = d; bi = i; } } return bi; };
  const nearest = (x, z) => { let b = Infinity, bi = 0; for (let i = 0; i < n; i++) { const d = (L.px[i] - x) ** 2 + (L.pz[i] - z) ** 2; if (d < b) { b = d; bi = i; } } return bi; };
  const gaps = []; for (const j of track.jumps || []) for (let i = Math.max(0, j.lipIdx - 6); i <= Math.min(n - 1, j.landIdx + 6); i += 2) gaps.push(i);
  const inGap = (x, z) => gaps.some((i) => Math.hypot(x - L.px[i], z - L.pz[i]) < L.hw[i] + 29.5);
  const shapes = (track.shapes || []).filter((s) => s.type === 'gorge' || s.type === 'pit');
  const inShape = (x, z) => shapes.some((s) => { const dx = x - s.E[0], dz = z - s.E[2], f = dx * s.F[0] + dz * s.F[2], r = dx * s.R[0] + dz * s.R[2]; return f > s.f0 && f < s.f1 && Math.abs(r) < (s.type === 'gorge' ? 110 : s.hw || 8); });
  const wet = (x, z) => (T.wet ? T.wet(x, z) : T.height(x, z) < -0.3);
  const rule = (what, x, z, clear, { gap = true, near = false, tol = 2.6 } = {}) => {
    checks++;
    if (!isFinite(x) || !isFinite(z)) return fail(`${what} ungültige Koordinaten`);
    const d = dist(x, z, clear + 5);
    if (d < clear - 0.01) fail(`${what} zu nah an der Fahrbahn (${d.toFixed(2)} < ${clear} m)`);
    if (wet(x, z)) fail(`${what} im Wasser`);
    if (gap && inGap(x, z)) fail(`${what} in einer Sprunglücke`);
    if (gap && inShape(x, z)) fail(`${what} in Schlucht/Grube`);
    if (near && d < 40) { const i = nearestLevel(x, z); if (i >= 0 && Math.abs(T.height(x, z) - L.py[i]) > tol) fail(`${what} auf Böschung/Hang (${(T.height(x, z) - L.py[i]).toFixed(1)} m)`); }
  };
  for (const th of THEME_IDS) for (const tier of [0, 2]) {
    const o = { ideal: env.ideal, prof: env.prof, tier, seed: 7, veg: THEMES[th].veg, themeId: th };
    const A = planDeco(track, { ...o, kulisse2: false }), B = planDeco(track, o), B2 = planDeco(track, o);
    const tag = `${name}/${th}/${tier}`;
    ok(JSON.stringify(B) === JSON.stringify(B2), `${tag}: nicht deterministisch`);
    // alles bis n31 Geplante unverändert (Tribünen: nur + Bauform)
    for (const k of OLD) ok(strip(A.inst[k] || []) === strip(B.inst[k] || []), `${tag}: ${k} durch n32 verändert`);
    ok(JSON.stringify(A.portal) === JSON.stringify(B.portal) && JSON.stringify(A.sky) === JSON.stringify(B.sky) && JSON.stringify(A.fences) === JSON.stringify(B.fences) && JSON.stringify(A.rails) === JSON.stringify(B.rails), `${tag}: Portal/Himmel/Zäune/Leitplanken verändert`);
    for (const st of B.inst.stand || []) ok((STAND_FORMS[th] || [0]).includes(st.form), `${tag}: Tribünen-Bauform`);
    // neue Arten
    for (const k of NEW_INST) for (const it of B.inst[k] || []) {
      rule(`${tag}: ${k}`, it.x, it.z, MIN_CLEAR[k], { near: ['ampel', 'pyro'].includes(k), tol: 1.6 });
      (tot[k] = (tot[k] || 0) + 1);
    }
    // Zuschauer
    ok(B.fans.length <= FAN_MAX[tier], `${tag}: zu viele Zuschauer (${B.fans.length} > ${FAN_MAX[tier]})`);
    tot.fan = (tot.fan || 0) + B.fans.length;
    for (const f of B.fans) {
      rule(`${tag}: fan`, f.x, f.z, MIN_CLEAR.fan, { near: f.roof == null && f.pic == null, tol: 2.6 });
      ok(f.pose >= 0 && f.pose < 5 && f.s > 0.85 && f.s < 1.15 && f.col >= 0 && f.col < 16 && (f.flag === 1) === (f.pose === 3), `${tag}: fan Werte`);
    }
    // Fangzäune: Mindestabstand, auf Fahrbahnhöhe, VOR den Zuschauern (jeder Zuschauer der Gruppe weiter weg als der Zaun)
    for (const cf of B.catchFences) {
      ok(cf.pts.length >= 3 && cf.h > 3, `${tag}: Fangzaun zu kurz/niedrig`);
      for (const p of cf.pts) rule(`${tag}: catchfence`, p.x, p.z, MIN_CLEAR.catchfence, { near: true, tol: 1.7 });
    }
    for (const f of B.fans) {
      if (f.roof != null || f.pic != null || !f.st) continue;
      for (const cf of B.catchFences) for (const p of cf.pts) {
        if (Math.hypot(p.x - f.x, p.z - f.z) > 2.5) continue;
        const i = p.i;   // gegenüber dem Streckenteil, den der Zaun schützt
        const df = Math.abs((f.x - L.px[i]) * L.bx[i] + (f.z - L.pz[i]) * L.bz[i]), dp = Math.abs((p.x - L.px[i]) * L.bx[i] + (p.z - L.pz[i]) * L.bz[i]);
        ok(dp < df + 0.3, `${tag}: Fangzaun steht hinter den Zuschauern (${dp.toFixed(1)} ≥ ${df.toFixed(1)} m)`);
      }
    }
    for (const b of B.banden) { ok(b.pts.length >= 4, `${tag}: Bandenreihe zu kurz`); for (const p of b.pts) rule(`${tag}: bande`, p.x, p.z, MIN_CLEAR.bande, { near: true, tol: 1.1 }); }
    for (const w of B.boxenmauer) for (const p of w) rule(`${tag}: boxmauer`, p.x, p.z, MIN_CLEAR.boxmauer, { near: true, tol: 0.9 });
    // Startaufstellung: auf der Fahrbahn, hinter der Startlinie, abwechselnd links/rechts
    const si = track.start ? track.start.idx : 0;
    B.startGrid.forEach((g, k) => {
      const i = g.i, off = (g.x - L.px[i]) * L.bx[i] + (g.z - L.pz[i]) * L.bz[i];
      let back = L.s[si] - L.s[i]; if (back < 0 && L.closed) back += L.s[n - 1];
      ok(Math.abs(off) < L.hw[i] - 1 && back > 7 && back < 60 && Math.abs(back - (10 + k * 8)) <= 3 && Math.sign(off) === (k % 2 ? 1 : -1), `${tag}: Startaufstellung ${k + 1} nicht auf der Fahrbahn hinter dem Start (${back.toFixed(1)} m)`);
    });
    ok(!B.portal || (B.ampel && B.ampel.on === 'portal'), `${tag}: Startampel am Portal`);
    ok(B.konfetti && isFinite(B.konfetti.x), `${tag}: Konfetti-Ort`);
    // Event-Gelände: vollständig, flach, Sonderbau passend zum Thema
    for (const ev of B.events) {
      ok(ev.items >= 3, `${tag}: Event-Gelände zu klein`);
      rule(`${tag}: event`, ev.x, ev.z, MIN_CLEAR.zelt);
    }
    for (const k of ['riesenrad', 'huepfburg', 'strandbar', 'apres']) for (const it of B.inst[k] || []) ok(EVENT[th].special.includes(k), `${tag}: ${k} passt nicht zum Thema`);
    ok(tier > 0 || B.events.length <= 1, `${tag}: Einfach höchstens ein Event-Gelände`);
    for (const s of B.strips.filter((q) => q.kind === 'weg')) for (const p of s.pts) rule(`${tag}: weg`, (p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2, MIN_CLEAR.fan - 1.3, { gap: false });
    // Picknick: am ansteigenden Hang
    for (const p of B.inst.picnic || []) ok(T.height(p.x, p.z) - L.py[p.i] > 1.4 && Math.abs(p.rise - (T.height(p.x, p.z) - L.py[p.i])) < 0.01, `${tag}: Picknick nicht am ansteigenden Hang`);
  }
  ok(trackHash(track) === h0, `${name}: Fahrbahn durch die Planung verändert`);
}

const envs = [];
for (let s = 1; s <= N; s++) for (const [d, o] of [[2, {}], [3, { d3: true }], [s % 3 + 1, { gel: true }], [3, { gel: true }]]) envs.push([generate(s * 131 + 25, d, o).meta.key, generate(s * 131 + 25, d, o)]);
envs.push(['25-2-g', generate(25, 2, { gel: true })], ['4711-3', generate(4711, 3, {})], ['galerie', galleryLayout()]);
for (const sc of SHOWCASE.slice(0, 3)) envs.push([sc.id, trkToLayout(parseTrk(showcaseBytes(sc.id), sc.id + '.trk')).layout]);
for (const [name, lay] of envs) check(name, prepare(lay));
console.log('Strecken', envs.length, '× Themen', THEME_IDS.length, '× Stufen 0/2 · neu je Art (Summe):', JSON.stringify(tot));
if (bad) console.log('Fehler je Art', JSON.stringify(byKind));
console.log(bad ? `${bad} Fehler bei ${checks} Prüfungen` : `Kulissen n32: ${checks} Prüfungen ok`);
process.exit(bad ? 1 : 0);
