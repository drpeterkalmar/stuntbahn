// Kulissen (n20): Landschafts-Themen und Streckenrand prüfen – ohne Grafik.
//  1) Jede Kulisse in JEDEM Thema hält ihren Mindestabstand zu JEDEM Punkt der Fahrlinie (auch Hochstraßen, Spiralen,
//     Loopings – also nie auf/unter einer Fahrbahn, nie in Pfeilern oder Durchfahrten), steht nicht im Wasser, nicht in
//     Sprunglücken (Korridor Absprung … Landung) und nicht in Schluchten/Gruben; Streckenrand-Objekte nahe der Fahrbahn
//     stehen auf Fahrbahnhöhe (nicht auf Böschungen/Dämmen); Tribünen nie über abfallendem Gelände.
//  2) Die Fahrbahn bleibt unverändert: Linie/Gelände/Kollision einer Strecke sind vor und nach der Deko-Planung aller
//     Themen bitgleich, Layout und Bestzeit-Schlüssel hängen nicht am Thema, ?thema= ist kein A/B-Zusatz (wertet).
//  3) Thema passend: deterministisch, alle Themen kommen vor, .TRK-Horizonte → Thema; Fernkulisse ändert nichts im
//     Physik-Raster (farLift bis ext + 30 m exakt).
// Aufruf: node tests/node/test_kulissen.mjs [Anzahl Seeds je Art, Standard 4]
import crypto from 'crypto';
import { generate, galleryLayout } from '../../src/track/generator.js';
import { prepare } from '../../src/track/verify.js';
import { planDeco, roadClearance, MIN_CLEAR } from '../../src/track/deco.js';
import { THEMES, THEME_IDS, themeAuto, themeFor, farLift } from '../../src/track/themes.js';
import { parseTrk } from '../../src/track/trk.js';
import { trkToLayout } from '../../src/track/trkimport.js';
import { showcaseBytes, SHOWCASE } from '../../src/track/showcase.js';
import { modeKey } from '../../src/game/store.js';
import { WORLD_HALF } from '../../src/track/defs.js';

const N = +(process.argv[2] || 4);
let bad = 0, checks = 0;
const byKind = {};
const fail = (m) => { bad++; const k = m.split(': ')[1]?.split(' ')[0]; byKind[k] = (byKind[k] || 0) + 1; if (bad < 15) console.log('FAIL', m); };
const ok = (c, m) => { checks++; if (!c) fail(m); };

function trackHash(t) {
  const H = crypto.createHash('sha1'), L = t.line;
  for (const k of ['px', 'py', 'pz', 'tx', 'tz', 'bx', 'bz', 'hw', 'air', 'loop']) H.update(Buffer.from(L[k].buffer));
  for (const b of t.batches) { H.update(Buffer.from(b.pos.buffer)); H.update(Buffer.from(b.idx.buffer)); }
  H.update(Buffer.from(t.col.pos.buffer)); H.update(Buffer.from(t.terrain.H.buffer));
  return H.digest('hex').slice(0, 16);
}

const NEAR = new Set(['stand', 'crowd', 'flag', 'cam', 'portal', 'hut', 'board']);
function check(name, env) {
  const { track } = env, L = track.line, T = track.terrain, n = L.n;
  const h0 = trackHash(track);
  const dist = roadClearance(track);
  // nächster Linienpunkt (für die Höhe der Fahrbahn neben dem Objekt)
  // nächster ebenerdiger Linienpunkt (unter Hochstraßen zählt die untere Fahrbahn)
  const level = []; for (let i = 0; i < n; i++) if (Math.abs(L.py[i] - T.height(L.px[i], L.pz[i])) < 1.5) level.push(i);
  const nearest = (x, z) => { let b = 1600, bi = -1; for (const i of level) { const d = (L.px[i] - x) ** 2 + (L.pz[i] - z) ** 2; if (d < b) { b = d; bi = i; } } return bi; };
  const gaps = [];
  for (const j of track.jumps || []) for (let i = Math.max(0, j.lipIdx - 6); i <= Math.min(n - 1, j.landIdx + 6); i += 2) gaps.push(i);
  const inGap = (x, z) => gaps.some((i) => Math.hypot(x - L.px[i], z - L.pz[i]) < L.hw[i] + 29.5);
  const shapes = (track.shapes || []).filter((s) => s.type === 'gorge' || s.type === 'pit');
  const inShape = (x, z) => shapes.some((s) => { const dx = x - s.E[0], dz = z - s.E[2], f = dx * s.F[0] + dz * s.F[2], r = dx * s.R[0] + dz * s.R[2]; return f > s.f0 && f < s.f1 && Math.abs(r) < (s.type === 'gorge' ? 110 : s.hw || 8); });
  const counts = {};
  for (const th of THEME_IDS) {
    const plan = planDeco(track, { ideal: env.ideal, prof: env.prof, tier: 2, seed: 7, veg: THEMES[th].veg, themeId: th });
    for (const [k, list] of Object.entries(plan.inst)) {
      counts[k] = (counts[k] || 0) + list.length;
      const need = (MIN_CLEAR[k] ?? 0) - 0.01;
      ok(MIN_CLEAR[k] != null, `${name}/${th}: ${k} ohne Mindestabstand (MIN_CLEAR)`);
      for (const it of list) {
        checks++;
        const d = dist(it.x, it.z, need + 5);
        if (d < need) fail(`${name}/${th}: ${k} zu nah an der Fahrbahn (${d.toFixed(2)} < ${MIN_CLEAR[k]} m)`);
        if (!isFinite(it.x) || !isFinite(it.z)) fail(`${name}/${th}: ${k} ungültige Koordinaten`);
        if (T.wet ? T.wet(it.x, it.z) : T.height(it.x, it.z) < -0.3) fail(`${name}/${th}: ${k} im Wasser`);
        if (['stand', 'crowd', 'flag', 'cam', 'portal', 'tower', 'block', 'crane', 'turbine'].includes(k)) {
          if (inGap(it.x, it.z)) fail(`${name}/${th}: ${k} in einer Sprunglücke`);
          if (inShape(it.x, it.z)) fail(`${name}/${th}: ${k} in Schlucht/Grube`);
        }
        if (NEAR.has(k) && d < 40 && ['stand', 'crowd', 'flag', 'cam'].includes(k)) {
          const i = nearest(it.x, it.z);
          const dy = i < 0 ? 0 : T.height(it.x, it.z) - L.py[i];
          if (Math.abs(dy) > 2.6) fail(`${name}/${th}: ${k} auf Böschung/Hang (${dy.toFixed(1)} m neben der Fahrbahn)`);
        }
        if (k === 'stand' && it.cx != null) {
          const g = T.height(it.cx, it.cz), i = it.i;
          if (g < L.py[i] - 0.7) fail(`${name}/${th}: stand über abfallendem Gelände (${(g - L.py[i]).toFixed(1)} m)`);
        }
      }
    }
    // Portal: Stützen neben der Fahrbahn, Träger hoch über ihr
    if (plan.portal) ok(plan.portal.hw > track.line.hw[track.start ? track.start.idx : 0] + 2.9, `${name}/${th}: portal Stützen zu nah`);
    // Ballons/Zeppelin hoch über allem
    for (const b of (plan.sky && plan.sky.balloons) || []) ok(b.y > 90, `${name}/${th}: balloon zu tief`);
  }
  ok(trackHash(track) === h0, `${name}: fahrbahn Strecke durch die Deko-Planung verändert`);
  return counts;
}

// ---- Strecken: generiert flach / Hochstraße (3D) / Gelände, Galerie, Beispiel-.TRK ----
const envs = [];
for (let s = 1; s <= N; s++) for (const [d, o] of [[2, {}], [3, { d3: true }], [s % 3 + 1, { gel: true }], [3, { gel: true }]]) {
  const lay = generate(s * 131 + 25, d, o);
  envs.push([lay.meta.key, lay]);
}
envs.push(['25-2-g', generate(25, 2, { gel: true })], ['galerie', galleryLayout()]);
for (const sc of SHOWCASE) envs.push([sc.id, trkToLayout(parseTrk(showcaseBytes(sc.id), sc.id + '.trk')).layout]);
const tot = {};
for (const [name, lay] of envs) {
  const before = JSON.stringify({ k: lay.meta.key, p: lay.pieces.length });
  // Thema darf das Layout nicht anfassen
  for (const th of ['auto', ...THEME_IDS]) themeFor(lay, th);
  ok(JSON.stringify({ k: lay.meta.key, p: lay.pieces.length }) === before, `${name}: layout durch Thema verändert`);
  const c = check(name, prepare(lay));
  for (const [k, v] of Object.entries(c)) tot[k] = (tot[k] || 0) + v;
}
console.log('Strecken', envs.length, '× Themen', THEME_IDS.length, '· Kulissen je Art (Summe):', JSON.stringify(tot));

// ---- Bestzeit-Schlüssel: Strecken-Schlüssel + Wertung hängen nicht am Thema; ?thema= ist kein A/B-Zusatz ----
{
  for (const [s, d, o, want] of [[4711, 3, {}, '4711-3'], [4711, 3, { d3: true }, '4711-3-3d'], [4711, 3, { gel: true }, '4711-3-g'], [20261004, 2, { gel: true }, '20261004-2-g']]) {
    const k1 = generate(s, d, o).meta.key;
    ok(k1 === want, `bestzeit: Schlüssel ${k1} statt ${want}`);
  }
  ok(modeKey('medium', false, true) === 'medium+reset@x', 'bestzeit: modeKey verändert');
  globalThis.location = { search: '?thema=wueste' };
  const { AB } = await import('../../src/game/store.js?thema');
  ok(AB === false, 'bestzeit: ?thema= gilt als A/B (wertet nicht)');
  delete globalThis.location;
}

// ---- Zwischenspeicher geprüfter Strecken behält alle Merkmale der Stücke (Gelände: g, tilt0/tilt1; 3D: h1) ----
{
  const mem = {}; globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  const { Store } = await import('../../src/game/store.js?cache');
  const st = new Store();
  for (const [s, d, o] of [[1038, 1, { gel: true }], [25, 2, { gel: true }], [4711, 3, { d3: true }], [4711, 3, {}]]) {
    const lay = generate(s, d, o);
    st.setVerified('k', 'b', lay.pieces, 10, 0);
    const back = new Store().getVerified('k', 'b').pieces;
    const norm = (a) => JSON.stringify(a.map((p) => Object.fromEntries(Object.entries({ ...p, m: p.m || 1, lvl: p.lvl || 0 }).sort())));
    ok(norm(back) === norm(lay.pieces), `zwischenspeicher: ${lay.meta.key} verliert Merkmale der Stücke`);
  }
  delete globalThis.localStorage;
}

// ---- Thema passend: deterministisch, Verteilung, .TRK-Horizonte ----
{
  const seen = {};
  for (let s = 1; s <= 600; s++) for (const o of [{ gel: true }, { d3: true }, {}]) {
    const lay = { meta: { seed: s, diff: 1 + (s % 3), gel: !!o.gel, d3: !!o.d3 } };
    const a = themeAuto(lay), b = themeAuto(lay);
    ok(a === b && THEMES[a], `passend: nicht deterministisch (${s})`);
    seen[a] = (seen[a] || 0) + 1;
  }
  for (const id of THEME_IDS) ok((seen[id] || 0) > 30, `passend: Thema ${id} kommt kaum vor (${seen[id] || 0}/1800)`);
  console.log('Themen passend (1800 Strecken):', JSON.stringify(seen));
  const H = ['wueste', 'kueste', 'alpen', 'stadt', 'land'];
  H.forEach((t, h) => ok(themeAuto({ trk: { horizon: h }, seed: 5 }) === t, `passend: Horizont ${h} → ${t}`));
  ok(['herbst', 'winter'].includes(themeAuto({ trk: { horizon: 5 }, seed: 5 })), 'passend: Chaos → Herbst/Winter');
  ok(themeFor({ meta: { seed: 1, diff: 2 } }, 'alpen') === 'alpen' && themeFor({ meta: { seed: 1, diff: 2 } }, 'auto', 'stadt') === 'stadt', 'passend: Einstellung/URL');
}

// ---- Fernkulisse: im Physik-Raster (+30 m) exakt die Landschaft ----
{
  const ext = WORLD_HALF + 120;
  for (const th of THEME_IDS) {
    const f = farLift(th, 4711, ext);
    if (!f) continue;
    for (let k = 0; k < 4000; k++) {
      const x = (Math.random() * 2 - 1) * (ext + 30), z = (Math.random() * 2 - 1) * (ext + 30), h = Math.random() * 50;
      if (f(x, z, h) !== h) { fail(`fernkulisse: ${th} verändert das Gelände im Physik-Raster (${x.toFixed(0)},${z.toFixed(0)})`); break; }
      checks++;
    }
    for (let k = 0; k < 200; k++) { const a = k * 0.1, r = 900 + k * 9; ok(isFinite(f(Math.cos(a) * r, Math.sin(a) * r, 10)), `fernkulisse: ${th} ungültig`); }
  }
}

if (bad) console.log('Fehler je Art', JSON.stringify(byKind));
console.log(bad ? `${bad} Fehler bei ${checks} Prüfungen` : `Kulissen: ${checks} Prüfungen ok (${envs.length} Strecken × ${THEME_IDS.length} Themen)`);
process.exit(bad ? 1 : 0);
