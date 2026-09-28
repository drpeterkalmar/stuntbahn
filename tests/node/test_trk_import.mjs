// .TRK-Import: jedes Element baubar + Anschlüsse konsistent, Wegverfolgung (Abzweig, Sprung, Kreuzung),
// Gelände (Hügel/Wasser), Beispielstrecke fährt der Autopilot streng und auf „Leicht“. Nur eigene Daten.
import { CODES, KINDS, placeElement } from '../../src/track/trkelems.js';
import { parseTrk, writeTrk } from '../../src/track/trk.js';
import { trkToLayout, IMPORT_LH } from '../../src/track/trkimport.js';
import { TrackDesigner } from '../../src/track/trkdesign.js';
import { SHOWCASE, showcaseBytes } from '../../src/track/showcase.js';
import { pieceCells, PIECES } from '../../src/track/pieces.js';
import { buildTrack } from '../../src/track/build.js';
import { prepare } from '../../src/track/verify.js';
import { Race } from '../../src/game/race.js';
import { fmtTime } from '../../src/core/util.js';
import { BANK } from '../../src/track/pieces_trk.js';
import { ROAD_HW, tileX } from '../../src/track/defs.js';

// Rechteck-Rundkurs ab Start (5,5) nach Osten: oben `top` Stücke (inkl. Start), rechts 3, unten, links 3
const rect = (t, fillTop, bottom) => { fillTop(t); t.put('large', { turn: 'R' }).road(3).put('large', { turn: 'R' }).road(bottom).put('large', { turn: 'R' }).road(3).put('large', { turn: 'R' }); return t; };

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FEHLER', msg); } };

// 1) Jeder Strecken-Code: jeder Weg bleibt im Fußabdruck, Ausfahrt liegt außerhalb, Baustein baut Geometrie
let built = 0;
for (const e of CODES.values()) {
  const K = KINDS[e.kind];
  if (!K.routes) continue;
  const pe = placeElement(e.code, 10, 10);
  const foot = new Set(pe.cells.map((c) => c.join(',')));
  for (const r of pe.routes) {
    const pc = pieceCells(r.t, r.i, r.j, r.d, r.m);
    ok(pc.cells.every((c) => foot.has(c.join(','))), `0x${e.code.toString(16)} Weg ${r.k}: Felder im Fußabdruck`);
    ok(!foot.has(pc.next[0] + ',' + pc.next[1]), `0x${e.code.toString(16)} Weg ${r.k}: Ausfahrt außerhalb`);
    // Einzelstück bauen (Gelände eben)
    const layout = { pieces: [{ type: r.t, i: r.i, j: r.j, d: r.d, m: r.m, lvl: r.h0, h1: r.h1, surf: r.surf, kind: e.kind, sup: r.sup, deco: r.deco, into: r.into, obst: r.obst, side: r.side, b0: r.b0, b1: r.b1, over: r.over }], decor: [], scenery: [], trk: { terr: new Uint8Array(900), horizon: 4 }, levelH: IMPORT_LH, seed: 1, meta: {} };
    try {
      const t = buildTrack(layout, { treeCount: 0 });
      ok(t.line.n > 3 && t.batches.length > 0 && t.col.mat.length > 0, `0x${e.code.toString(16)} Weg ${r.k}: Linie + Geometrie`);
      const L = t.line, dy = L.py[L.n - 1] - L.py[0];
      // Überhöhung hebt die Mittellinie an (Innenkante bleibt am Boden)
      const bank = r.t === 'tr_bank' ? (ROAD_HW + 0.5) * (Math.sin(BANK * (r.b1 ?? 1)) - Math.sin(BANK * (r.b0 ?? 1))) : 0;
      ok(Math.abs(dy - (r.h1 - r.h0) * IMPORT_LH - bank) < 0.05, `0x${e.code.toString(16)} Weg ${r.k}: Höhenwechsel ${dy.toFixed(2)}`);
      built++;
    } catch (err) { ok(false, `0x${e.code.toString(16)} Weg ${r.k}: ${err.message}`); }
  }
}
ok(built > 330, `alle Wege gebaut (${built})`);

// 2) Wegverfolgung: Abzweig mit Sackgasse → der Weg, der ins Ziel führt
{
  const t = rect(new TrackDesigner(5, 5, 0), (q) => q.put('sf').road(2).put('ssplit', { lane: 'a' }).road(4), 8);
  // Sackgasse am Abzweig (Kurve nach rechts, dann Ende)
  t.elem[6 * 30 + 8] = 0x04; t.elem[7 * 30 + 8] = 0x04;
  const { layout, report } = trkToLayout(parseTrk(t.bytes(), 'abzweig.trk'));
  ok(report.closed, 'Abzweig: Rundkurs gefunden');
  ok(layout.pieces.some((p) => p.kind === 'ssplit' && p.type === 'tr_road'), 'Abzweig: gerade Spur gewählt (Kurve führt in die Sackgasse)');
  ok(layout.decor.some((p) => p.kind === 'ssplit' && p.type === 'tr_sharp' && p.sub), 'Abzweig: Kurve als abgesenkte Deko');
}
// 3) Sprung: Rampe hoch → Lücke → Rampe runter
{
  const t = rect(new TrackDesigner(5, 5, 0), (q) => q.put('sf').road(3).put('bramp', { up: true }).gap(1).put('bramp', { up: false }).road(3), 10);
  const { layout, report } = trkToLayout(parseTrk(t.bytes(), 'sprung.trk'));
  ok(report.closed && report.gaps === 1, 'Sprung erkannt und Rundkurs geschlossen');
  ok(layout.pieces.some((p) => p.kind === 'bramp' && p.kick) && layout.pieces.some((p) => p.kind === 'bramp' && p.land), 'Schanze + Landung markiert');
  const env = prepare(layout, { treeCount: 0 });
  const w = env.prof.windows[0];
  ok(w && w.vmin > 10 && w.vmax < 45 && w.vbest >= w.vmin, 'Sprung-Fenster berechnet ' + JSON.stringify(w));
}
// 4) Kreuzung: befahrene Spur + Querspur als abgesenkte Deko, Querstraßen als Deko
{
  const t = rect(new TrackDesigner(5, 5, 0), (q) => q.put('sf').road(2).put('cross').road(4), 8);
  t.elem[4 * 30 + 8] = 0x04; t.elem[6 * 30 + 8] = 0x04;
  const { layout, report } = trkToLayout(parseTrk(t.bytes(), 'kreuz.trk'));
  ok(report.closed && layout.pieces.some((p) => p.kind === 'cross'), 'Kreuzung befahren');
  ok(layout.decor.some((p) => p.kind === 'cross' && p.sub) && layout.decor.filter((p) => p.kind === 'road').length === 2, 'Querspur + Querstraßen als Deko');
  const env = prepare(layout, { treeCount: 0 });
  ok(env.track.line.closed, 'Kreuzungs-Kurs: Linie geschlossen');
}
// 5) Gelände: Hügel = eine Hochstraßen-Ebene, Hang glatt, Wasser tiefer
{
  const t = rect(new TrackDesigner(5, 5, 0), (q) => q.put('sf').road(7), 8);
  t.terrain(8, 5, 8, 5, 0x0A).terrain(9, 5, 11, 5, 0x06).terrain(12, 5, 12, 5, 0x08).terrain(15, 12, 18, 14, 0x01);
  const { layout } = trkToLayout(parseTrk(t.bytes(), 'huegel.trk'));
  const tr = buildTrack(layout, { treeCount: 0 });
  const h = tr.terrain.height;
  const x = tileX;   // Feldmitte (Feldgröße folgt dem Weltmaßstab)
  ok(Math.abs(h(x(10), x(5)) - IMPORT_LH) < 0.01, 'Hügel auf Ebenenhöhe');
  ok(Math.abs(h(x(8), x(5)) - IMPORT_LH / 2) < 0.05, 'Hangmitte auf halber Höhe');
  ok(h(x(16), x(13)) < -2, 'Seebett unter Wasser');
  ok(tr.terrain.waters.length === 1, 'Wasserfläche vorhanden');
  // Straße auf dem Hang folgt dem Gelände (Linie ~ Gelände + Fahrbahnhöhe)
  const L = tr.line;
  let maxErr = 0;
  for (let k = 0; k < L.n; k++) if (L.px[k] > x(8) - 10 && L.px[k] < x(8) + 10 && Math.abs(L.pz[k] - x(5)) < 3) maxErr = Math.max(maxErr, Math.abs(L.py[k] - 0.06 - h(L.px[k], L.pz[k])));
  ok(maxErr < 0.03, 'Straße liegt auf dem Hang (max. Abweichung ' + maxErr.toFixed(3) + ' m)');
}
// 6) Beispielstrecken: vollständig befahren, Autopilot streng + Leicht im Ziel
for (const s of SHOWCASE) {
  const { layout, report } = trkToLayout(parseTrk(showcaseBytes(s.id), s.id + '.trk'));
  ok(report.closed && report.unusedElements === 0, `${s.id}: Rundkurs über alle Elemente`);
  const env = prepare(layout, { treeCount: 0 });
  for (const assist of ['strict', 'easy']) {
    const race = new Race(env, assist === 'strict' ? { assist: 'original', autopilot: true, countdown: 0.05 } : { assist: 'easy', countdown: 0.05 });
    let t = 0;
    while (t < 200 && race.state !== 'finished') {
      race.step(1 / 120, { steer: 0, throttle: 0, brake: 0 });
      t += 1 / 120;
      if (assist === 'strict' && race.car.crash) break;
    }
    ok(race.state === 'finished' && race.crashes === 0, `${s.id} ${assist}: im Ziel ohne Crash (${race.state === 'finished' ? fmtTime(race.finalTime) : race.car.crash && race.car.crash.reason})`);
  }
}
console.log(`${checks - fails}/${checks} Prüfungen ok`);
process.exit(fails ? 1 : 0);
