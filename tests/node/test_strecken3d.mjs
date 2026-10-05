// n19 Etappe A: neue Streckenteile – je Baustein Geometrie (baut, keine Lücken/NaN), Kollision (Auto fährt darauf),
// Ideallinie/Autopilot + Tempo-Profil (Autopilot fährt ohne Crash durch) und bausteinspezifische Prüfungen:
// Spirale (Umlauf, Ebenen, Querneigung, Durchfahrtshöhe), Überführung (Pfeiler nie auf der unteren Fahrbahn),
// Wellen (Luftphase je Kuppe), Steilrampen (Höhe, Tempo-Gewinn bergab), Klippensprung (Fenster aus derselben Lippe/
// Luft-Physik wie die Schanze, weiche Landung über das Fenster), Steilwand (60–75°, zu langsam = rutscht sicher ab),
// TRK-Teile im Generator-Kontext, ganze Galerie.
import { pieceCells, PIECES, JUMP, jumpWindow } from '../../src/track/pieces.js';
import { cliffDesign, WALL, WAVE, SPIRAL, CLIFF_KICK } from '../../src/track/pieces_3d.js';
import '../../src/track/pieces_trk.js';
import { galleryLayout } from '../../src/track/generator.js';
import { LEVEL_H, ROAD_HW } from '../../src/track/defs.js';
import { setup, drive } from './common.mjs';

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('FEHLER', msg); } };
function chain(list, i = 3, j = 15, d = 0, lvl = 0) {
  const pieces = [];
  for (const it of list) {
    const o = typeof it === 'string' ? { type: it } : it;
    const pc = { type: o.type, i, j, d, m: o.m || 1, lvl };
    if (o.h1 != null) pc.h1 = o.h1;
    pieces.push(pc);
    [i, j, d] = pieceCells(pc.type, i, j, d, pc.m).next;
    if (o.h1 != null) lvl = o.h1;
  }
  return { pieces, seed: 1, diff: 3, meta: { key: 'test' } };
}
const S3 = ['straight', 'straight', 'straight'];
function run(name, lay, opt = {}) {
  const env = setup(lay);
  const L = env.track.line;
  let gap = 0, nan = 0;
  for (let i = 1; i < L.n; i++) {
    if (!Number.isFinite(L.px[i] + L.py[i] + L.pz[i])) nan++;
    if (!L.air[i] && !L.air[i - 1]) gap = Math.max(gap, Math.hypot(L.px[i] - L.px[i - 1], L.py[i] - L.py[i - 1], L.pz[i] - L.pz[i - 1]));
  }
  ok(!nan, `${name}: ${nan} ungültige Linienpunkte`);
  ok(gap < 4.5, `${name}: Lücke in der Fahrlinie ${gap.toFixed(2)} m`);
  const res = drive(env, { maxTime: 90, v0: opt.v0 ?? 25, trace: 0.05, ...opt.drive });
  ok(!res.crash, `${name}: Crash ${res.crash && res.crash.reason} ${JSON.stringify(res.crash && res.crash.info)}`);
  ok(res.idx >= L.n - 4, `${name}: nicht durchgekommen (${res.idx}/${L.n})`);
  const vmax = Math.max(...res.log.map((x) => x.v));
  console.log(`${res.crash ? 'FAIL' : 'OK  '} ${name.padEnd(16)} ${L.total.toFixed(0).padStart(4)} m  ${res.t.toFixed(1).padStart(5)} s  Spitze ${(vmax * 3.6).toFixed(0)} km/h  max ${res.maxG.toFixed(1)} g  Dreiecke ${env.track.col.mat.length}`);
  return { env, res, L };
}
const inPiece = (L, k) => { const a = []; for (let i = 0; i < L.n; i++) if (L.piece[i] === k) a.push(i); return a; };

// ---------- 1) Spirale ----------
for (const [nm, lay, dl] of [
  ['Spirale +1', chain([...S3, { type: 'spiral', h1: 1 }, ...S3]), 1],
  ['Spirale +2 links', chain([...S3, { type: 'spiral', h1: 2, m: -1 }, ...S3]), 2],
  ['Spirale −1', chain([...S3, { type: 'spiral', h1: 0 }, ...S3], 3, 15, 0, 1), -1],
  ['Spirale −2', chain([...S3, { type: 'spiral', h1: 0, m: -1 }, ...S3], 3, 15, 0, 2), -2],
]) {
  const { L } = run(nm, lay);
  const ids = inPiece(L, 3);
  const dy = L.py[ids[ids.length - 1]] - L.py[ids[0]];
  ok(Math.abs(dy - dl * LEVEL_H) < 0.05, `${nm}: Höhenunterschied ${dy.toFixed(2)} statt ${dl * LEVEL_H}`);
  // Umlauf: Kurswinkel dreht sich einmal ganz (Summe der Richtungsänderung ≈ 2π)
  let turn = 0;
  for (let q = 1; q < ids.length; q++) { const a = ids[q - 1], b = ids[q]; turn += Math.atan2(L.tx[a] * L.tz[b] - L.tz[a] * L.tx[b], L.tx[a] * L.tx[b] + L.tz[a] * L.tz[b]); }
  ok(Math.abs(Math.abs(turn) - 2 * Math.PI) < 0.2, `${nm}: Umlauf ${(turn / 2 / Math.PI).toFixed(2)}`);
  const bank = Math.max(...ids.map((i) => Math.asin(Math.min(1, Math.abs(L.by[i])))));
  ok(bank > SPIRAL.bank * 0.9 && bank < 0.4, `${nm}: Querneigung ${(bank * 180 / Math.PI).toFixed(1)}°`);
  // Durchfahrtshöhe: wo zwei Durchgänge übereinander liegen (Draufsicht < 5 m), mindestens 4,5 m Höhenunterschied
  let clear = 1e9;
  for (const a of ids) for (const b of ids) if (b > a + 40 && Math.hypot(L.px[a] - L.px[b], L.pz[a] - L.pz[b]) < 5) clear = Math.min(clear, Math.abs(L.py[a] - L.py[b]));
  ok(clear >= LEVEL_H - 0.4, `${nm}: Durchfahrtshöhe ${clear.toFixed(2)} m`);
}

// ---------- 2) Überführung: Hochstraße kreuzt tiefere Fahrbahn rechtwinklig ----------
{
  // Anfahrt Ebene 0 nach Osten über (6,15), Steilauffahrt, drei Linkskurven, nach Süden über (6,15) auf Ebene 2
  const lay = chain(['straight', 'straight', 'straight', 'straight', 'straight', 'straight', { type: 'slope3', h1: 2 }, { type: 'turnS', m: -1 }, 'straight', { type: 'turnS', m: -1 },
    'straight', 'straight', 'straight', 'straight', 'straight', { type: 'turnS', m: -1 }, 'straight', 'straight', 'straight', 'straight'], 3, 15);
  const byCell = new Map();
  for (const p of lay.pieces) { const k = p.i + ',' + p.j; byCell.set(k, [...(byCell.get(k) || []), p]); }
  const cross = [...byCell.values()].find((a) => a.length === 2) || [];
  ok(cross.length === 2 && cross[0].d % 2 !== cross[1].d % 2, `Überführung: Kreuzung nicht wie geplant (${cross.length})`);
  const { env } = run('Überführung', lay);
  // Pfeiler (Kollisionsquader aus Beton) nie auf der unteren Fahrbahn: kein Kollisionsdreieck über der unteren
  // Fahrbahn zwischen 0,3 m und 4,5 m Höhe (Auto-Durchfahrt)
  const C = env.track.col, lowK = lay.pieces.indexOf(cross.find((p) => !p.lvl));
  const Lb = env.track.line, idsLow = inPiece(Lb, lowK);
  let hits = 0;
  for (let t = 0; t < C.mat.length; t++) {
    for (let v = 0; v < 3; v++) {
      const x = C.pos[t * 9 + v * 3], y = C.pos[t * 9 + v * 3 + 1], z = C.pos[t * 9 + v * 3 + 2];
      if (y < 0.4 || y > 4.5) continue;
      for (const i of idsLow) if (Math.abs((x - Lb.px[i]) * Lb.bx[i] + (z - Lb.pz[i]) * Lb.bz[i]) < ROAD_HW - 0.1 && Math.abs((x - Lb.px[i]) * Lb.tx[i] + (z - Lb.pz[i]) * Lb.tz[i]) < 1) { hits++; break; }
    }
  }
  ok(hits === 0, `Überführung: ${hits} Bauteil-Ecken im Lichtraum der unteren Fahrbahn`);
  const hiK = lay.pieces.indexOf(cross.find((p) => p.lvl)), hiI = inPiece(Lb, hiK)[10];
  ok(Lb.py[hiI] - Lb.py[idsLow[5]] >= LEVEL_H * 2 - 0.1, 'Überführung: Höhenunterschied');
}

// ---------- 3) Achterbahn-Wellen ----------
{
  const { res, L } = run('Wellen', chain([...S3, 'waves', ...S3]));
  // Luftphasen über den Kuppen: Folgen von Samples ohne Bodenkontakt im Wellen-Abschnitt
  let flights = 0, cur = 0, longest = 0;
  for (const x of res.log) {
    if (!L.wave[x.idx]) continue;
    if (!x.gnd) cur += 0.05; else { if (cur >= 0.15) flights++; longest = Math.max(longest, cur); cur = 0; }
  }
  ok(flights >= WAVE.n - 1, `Wellen: nur ${flights} Luftphasen (Kuppen ${WAVE.n})`);
  ok(longest < 1.5, `Wellen: Luftphase zu lang ${longest.toFixed(2)} s`);
  console.log(`     Wellen: ${flights} Luftphasen, längste ${longest.toFixed(2)} s`);
}

// ---------- 4) Steil-Auffahrt/-Abfahrt ----------
{
  const up = run('Steilauffahrt +2', chain([...S3, { type: 'slope3', h1: 2 }, 'straight', 'straight']));
  const dn = run('Steilabfahrt −3', chain([...S3, { type: 'slope4', h1: 0 }, 'straight', 'straight'], 3, 15, 0, 3), { v0: 20 });
  const ids = inPiece(dn.L, 3);
  ok(Math.abs(dn.L.py[ids[0]] - dn.L.py[ids[ids.length - 1]] - 3 * LEVEL_H) < 0.1, 'Steilabfahrt: 3 Ebenen');
  const vIn = dn.res.log.find((x) => x.idx >= ids[0]).v, vOut = dn.res.log.find((x) => x.idx >= ids[ids.length - 1]).v;
  ok(vOut > vIn + 5, `Steilabfahrt: kein Tempo-Gewinn (${vIn} → ${vOut} m/s)`);
  console.log(`     Steilabfahrt: ${(vIn * 3.6).toFixed(0)} → ${(vOut * 3.6).toFixed(0)} km/h`);
  void up;
}

// ---------- 5) Klippensprung ----------
{
  const jw = jumpWindow();
  for (const [nm, type, lvl, h1] of [['Klippe 1→0', 'cliff', 1, 0], ['Klippe 2→1', 'cliff', 2, 1], ['Klippe 2→0', 'cliff2', 2, 0]]) {
    const D = (lvl - h1) * LEVEL_H, C = cliffDesign(D);
    ok(C.win.vmax - C.win.vmin >= 3.5, `${nm}: Tempo-Fenster zu schmal ${C.win.vmin.toFixed(1)}–${C.win.vmax.toFixed(1)}`);
    // n21: gleiche Lippe wie die Standard-Schanze (11°), aber als Fall-Sprung langsamer (Hang direkt hinter der Lippe;
    // die Standard-Schanze fliegt ~100 m und passt so nicht in 3 Felder) – bis n19 lagen beide Fenster gleich
    // n26: die Klippe behält die Schanze bis n25 (CLIFF_KICK), die Standard-Schanze wird mit dem Stunt-Maßstab höher
    ok(C.win.vmin >= 12 && C.win.vmin < jw.vmin && C.lipY === CLIFF_KICK.lipH && (JUMP.span === 60 || CLIFF_KICK.lipDeg === 11), `${nm}: Fenster ${C.win.vmin.toFixed(1)}–${C.win.vmax.toFixed(1)} m/s (Schanze ${jw.vmin.toFixed(1)}–${jw.vmax.toFixed(1)}), Lippe ${C.lipY.toFixed(2)} m`);
    const lay = chain([...S3, { type, h1 }, 'straight', 'straight'], 3, 15, 0, lvl);
    const { env, res } = run(nm, lay);
    const j = env.track.jumps[0];
    ok(j && j.lipDeg === CLIFF_KICK.lipDeg && j.win === C.win, `${nm}: Lippe/Fenster nicht aus der Schanzen-Konstante`);
    // Landebahn lang genug: nach dem Aufsetzen noch ≥ 20 m bis zum Stückende
    const L = env.track.line, ids = inPiece(L, 3);
    const land = res.log.find((x) => x.idx > j.lipIdx + 5 && x.gnd && L.s[x.idx] > L.s[j.landIdx] - 2);
    ok(land && L.s[ids[ids.length - 1]] - L.s[land.idx] >= 20, `${nm}: Landebahn zu kurz`);
    // Tempo-Fenster in der Physik: Autopilot mit verändertem Absprungtempo landet ohne Crash
    for (const k of [-1.2, 1.0]) {
      const env2 = setup(lay);
      const p = env2.prof;
      for (let i = Math.max(0, j.lipIdx - 30); i <= j.lipIdx; i++) { p.vt[i] = Math.max(1, p.vt[i] + k); }
      const r2 = drive(env2, { maxTime: 90, v0: 25 });
      ok(!r2.crash && r2.idx >= L.n - 4, `${nm}: Absprung ${k > 0 ? '+' : ''}${k} m/s → ${r2.crash ? r2.crash.reason : 'hängt'}`);
    }
  }
}

// ---------- 6) Steilwand ----------
{
  const { env, res } = run('Steilwand rechts', chain([...S3, { type: 'wall', m: 1 }, ...S3], 3, 10));
  run('Steilwand links', chain([...S3, { type: 'wall', m: -1 }, ...S3], 3, 20));
  const L = env.track.line, ids = inPiece(L, 3);
  const bank = Math.max(...ids.map((i) => Math.acos(Math.min(1, L.ny[i]))));
  ok(bank >= 60 * Math.PI / 180 && bank <= 75 * Math.PI / 180, `Steilwand: Neigung ${(bank * 180 / Math.PI).toFixed(1)}°`);
  ok(WALL.bank >= 60 * Math.PI / 180, 'Steilwand: WALL.bank');
  const onWall = res.log.filter((x) => L.piece[x.idx] === 3 && x.upy < 0.5).length * 0.05;
  ok(onWall > 0.5, `Steilwand: Auto nur ${onWall.toFixed(2)} s an der Wand`);
  // zu langsam: Autopilot mit 35 % Tempo → rutscht auf den Auslauf, kein Crash, kommt durch
  const env2 = setup(chain([...S3, { type: 'wall', m: 1 }, ...S3], 3, 10));
  for (let i = 0; i < env2.prof.vt.length; i++) env2.prof.vt[i] = Math.min(env2.prof.vt[i], 6);
  const r2 = drive(env2, { maxTime: 120, v0: 6, trace: 0.1 });
  const minY = Math.min(...r2.log.filter((x) => env2.track.line.piece[x.idx] === 3).map((x) => x.upy));
  ok(!r2.crash && r2.idx >= env2.track.line.n - 4, `Steilwand langsam: ${r2.crash ? r2.crash.reason : 'hängt'} (${r2.idx}/${env2.track.line.n})`);
  console.log(`     Steilwand: ${onWall.toFixed(1)} s an der Wand (> 60°), langsam (22 km/h): ${r2.crash ? 'Crash' : 'sicher durch'}, steilste Lage ${(Math.acos(minY) * 180 / Math.PI).toFixed(0)}°`);
}

// ---------- 7) TRK-Teile im Generator-Kontext ----------
run('Steilkurve (TRK)', chain([...S3, { type: 'tr_bankC', m: 1 }, ...S3], 3, 10));
run('Korkenzieher (TRK)', chain([...S3, 'tr_corklr', 'straight', 'straight']));
run('Wendel hinauf', chain([...S3, { type: 'tr_corkud', h1: 1 }, ...S3]));
run('Wendel hinunter', chain([...S3, { type: 'tr_corkud', h1: 0, m: -1 }, ...S3], 3, 15, 0, 1));
run('Hochstraße Kurven', chain(['straight', 'straight', { type: 'turnS', m: 1 }, 'straight', { type: 'turnL', m: -1 }, 'straight', 'straight'], 3, 15, 0, 1));

// ---------- Galerie: alle Teile hintereinander ----------
{
  const lay = galleryLayout();
  const types = new Set(lay.pieces.map((p) => p.type));
  for (const t of ['spiral', 'waves', 'slope3', 'slope4', 'cliff', 'cliff2', 'wall', 'tr_bankC', 'tr_corklr', 'tr_corkud']) ok(types.has(t), 'Galerie ohne ' + t);
  const { res, L } = run('Galerie', lay, { v0: 0, drive: { maxTime: 400, trace: 0.5 } });
  void res; void L;
}
for (const t of ['spiral', 'waves', 'slope2', 'slope3', 'slope4', 'cliff', 'cliff2', 'wall']) ok(PIECES[t] && PIECES[t].d3, 'nicht registriert: ' + t);
console.log(fails ? `${fails}/${checks} Prüfungen fehlgeschlagen` : `Streckenteile 3D: ${checks} Prüfungen ok`);
process.exit(fails ? 1 : 0);
