// Schadensmodell (n34-Nachtrag, physics/schaden.js): Modus/URL, Treffer → Dellen (Tiefe/Radius gedeckelt, Zusammenlegen),
// Deckel über alle echten Goblin-Punkte (Karosserie, Lack, Glas: nie in den Innenraum, nie mehr als summeMax, kein NaN) nach
// 40 harten Treffern, Normalen nachgezogen (gegen Differenzen), Teile-Ablösung deterministisch (Spiegel, Stoßstange, Haube),
// Fahrfolgen, kompakter Zustand (packen/entpacken), Rückspul-Verlauf, Trümmer-Flug, Welt → Auto.
import { schadenModus, neuerSchaden, treffer, verschiebung, normale, fahrFolgen, packen, entpacken, reparieren, kopie,
  SchadenVerlauf, Truemmer, inAuto, teilVon, TEILE, DELLE, INNEN, FOLGEN, TRUEMMER, SchadenAuto } from '../../src/physics/schaden.js';
import { ladeGoblin } from '../../tools/schaden_teile.mjs';
import { Car } from '../../src/physics/car.js';
import { MAT } from '../../src/track/defs.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const drin = (x, y, z) => x > INNEN.min[0] && x < INNEN.max[0] && y > INNEN.min[1] && y < INNEN.max[1] && z > INNEN.min[2] && z < INNEN.max[2];

// 1. Modus
ok(schadenModus('', {}) === 'aus' && schadenModus('?schaden=optik', {}) === 'optik' && schadenModus('', { schaden: 'fahrt' }) === 'fahrt' && schadenModus('?schaden=quatsch', {}) === 'aus', 'Modus: Standard aus, ?schaden=optik, Einstellung, Unsinn → aus');

// 2. Treffer
{
  const S = neuerSchaden();
  const r0 = treffer(S, [0, 0, -2.4], [0, 0, -1], 2.5, 1);
  ok(!r0.delle && S.gesamt === 0, `unter ${DELLE.v0} m/s keine Delle`);
  const r1 = treffer(S, [0.3, 0, -2.4], [0, 0, -1], 20, 2);
  ok(r1.delle && r1.delle.t <= DELLE.tiefMax && r1.delle.r <= DELLE.radMax && S.gesamt > 0.2 && S.gesamt < 0.35, `Frontaufprall 20 m/s: Delle ${(r1.delle.t * 100).toFixed(1)} cm tief, Radius ${r1.delle.r.toFixed(2)} m, Gesamt ${(S.gesamt * 100).toFixed(0)} %`);
  const r2 = treffer(S, [0.35, 0.02, -2.4], [0, 0, -1], 20, 3);
  ok(S.dellen.length === 1 && r2.delle === r1.delle, 'zweiter Treffer daneben: Dellen zusammengelegt');
  ok(r2.abgefallen.includes(3), `zweimal 20 m/s vorn: Stoßstange vorn ab (Teile ${S.teile.toString(2)})`);
  const r3 = treffer(S, [-0.95, 0.3, -0.75], [-1, 0, 0], 10, 4);
  ok(r3.abgefallen.includes(0) && !(S.teile & 2), 'Seitentreffer 10 m/s am linken Spiegel: Spiegel links ab, rechts dran');
  ok(teilVon(0, 0.25, -1.5) === 5 && teilVon(0, 0.3, 0) === -1 && teilVon(0.9, 0.3, -0.75) === 1, 'Bereiche: Haube, Dach (Rumpf), Spiegel rechts');
}
// 3. Deckel über alle Goblin-Punkte nach 40 harten Treffern
{
  const G = await ladeGoblin();
  const body = G.meshes.filter((m) => !/wheel|brake/.test(m.name));
  const P = body.flatMap((m) => m.C);
  const S = neuerSchaden();
  let h = 12345; const r = () => { h = (Math.imul(h, 1103515245) + 12345) >>> 0; return h / 4294967296; };
  for (let k = 0; k < 40; k++) {
    // Treffer auf einen Karosserie-Punkt, Richtung = von der Mitte nach außen (grob die Flächen-Normale)
    const q = P[Math.floor(r() * P.length)], l = Math.hypot(q[0], q[1] - 0.1, q[2] * 0.5) || 1;
    treffer(S, q, [q[0] / l, (q[1] - 0.1) / l, q[2] * 0.5 / l], 8 + r() * 40, k);
  }
  let maxV = 0, rein = 0, nan = 0, bewegt = 0;
  const o = [0, 0, 0];
  for (const q of P) {
    verschiebung(S, q[0], q[1], q[2], o);
    const l = Math.hypot(o[0], o[1], o[2]);
    if (!Number.isFinite(l)) nan++;
    if (l > 1e-4) bewegt++;
    maxV = Math.max(maxV, l);
    if (!drin(q[0], q[1], q[2]) && drin(q[0] + o[0], q[1] + o[1], q[2] + o[2])) rein++;
  }
  ok(nan === 0 && rein === 0, `40 Treffer, ${P.length} Goblin-Punkte (Karosserie, Lack, Glas): keiner in den Innenraum gedrückt, kein NaN (${bewegt} verschoben)`);
  ok(maxV <= DELLE.summeMax + 1e-9 && maxV > 0.05, `größte Verschiebung ${(maxV * 100).toFixed(1)} cm ≤ ${DELLE.summeMax * 100} cm`);
  ok(S.dellen.length <= DELLE.dellenMax && S.gesamt === 1, `höchstens ${DELLE.dellenMax} Dellen (${S.dellen.length}), Gesamtschaden 100 %`);
  // Teile im Goblin: jedes Teil hat Dreiecke
  const n = new Array(TEILE.length).fill(0);
  for (const m of body) { const I = m.idx; for (let t = 0; t < I.length; t += 3) { const A = m.C[I[t]], B = m.C[I[t + 1]], C = m.C[I[t + 2]]; const k = teilVon((A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3); if (k >= 0) n[k]++; } }
  ok(n.every((x) => x > 100), `jedes Teil hat Dreiecke im Goblin (${TEILE.map((t, k) => t.name + ' ' + n[k]).join(', ')})`);
  // Zeitbedarf (Dellen auf alle Punkte einmal: so oft wie Treffer, nicht je Bild)
  const t0 = performance.now(); for (const q of P) verschiebung(S, q[0], q[1], q[2], o); const ms = performance.now() - t0;
  ok(ms < 60, `alle ${P.length} Punkte neu verschieben: ${ms.toFixed(1)} ms (Desktop; Handy ×4)`);
}
// 4. Normalen gegen Differenzen (ebene Front z = −2,4, Normale −z, eine Delle)
{
  const S = neuerSchaden();
  treffer(S, [0, 0, -2.4], [0, 0, -1], 25, 7);
  const d = S.dellen[0]; d.s = 0;   // Rauschen bleibt, Prüfung mit kleinem Schritt
  let maxW = 0;
  const pos = (x, y) => { const o = verschiebung(S, x, y, -2.4); return [x + o[0], y + o[1], -2.4 + o[2]]; };
  for (const [x, y] of [[0.1, 0.05], [0.2, -0.1], [-0.15, 0.2], [0.3, 0.0], [0.05, 0.3]]) {
    const e = 1e-3, a = pos(x - e, y), b = pos(x + e, y), c = pos(x, y - e), dd = pos(x, y + e);
    const tx = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ty = [dd[0] - c[0], dd[1] - c[1], dd[2] - c[2]];
    let nx = ty[1] * tx[2] - ty[2] * tx[1], ny = ty[2] * tx[0] - ty[0] * tx[2], nz = ty[0] * tx[1] - ty[1] * tx[0];
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    if (nz > 0) { nx = -nx; ny = -ny; nz = -nz; }
    const n = normale(S, x, y, -2.4, 0, 0, -1);
    maxW = Math.max(maxW, Math.acos(Math.min(1, nx * n[0] + ny * n[1] + nz * n[2])) * 180 / Math.PI);
  }
  ok(maxW < 6, `nachgezogene Normalen: höchstens ${maxW.toFixed(1)}° neben der gemessenen Flächen-Normale (Rauschen ±${DELLE.rauschen * 100} %)`);
}
// 5. deterministisch, packen/entpacken, Verlauf
{
  const run = () => { const S = neuerSchaden(); for (let k = 0; k < 9; k++) treffer(S, [Math.sin(k) * 0.9, 0.2, Math.cos(k) * 2.2], [Math.sin(k), 0, Math.cos(k)], 12 + k * 3, k); return S; };
  const A = run(), B = run();
  ok(JSON.stringify(packen(A)) === JSON.stringify(packen(B)) && A.teile === B.teile, `deterministisch (Teile ${A.teile.toString(2)}, ${A.dellen.length} Dellen)`);
  const P = packen(A), C = entpacken(P);
  ok(P.length === 3 + A.dellen.length * 8 && P.length <= 3 + DELLE.dellenMax * 8, `gepackt ${P.length} Byte (höchstens ${3 + DELLE.dellenMax * 8})`);
  let dmax = 0; const o1 = [0, 0, 0], o2 = [0, 0, 0];
  for (let k = 0; k < 400; k++) { const x = Math.sin(k * 1.3) * 1.1, y = Math.cos(k * 0.7) * 0.5, z = Math.sin(k * 0.37) * 2.4; verschiebung(A, x, y, z, o1); verschiebung(C, x, y, z, o2); dmax = Math.max(dmax, Math.hypot(o1[0] - o2[0], o1[1] - o2[1], o1[2] - o2[2])); }
  ok(C.teile === A.teile && Math.abs(C.gesamt - A.gesamt) < 0.005 && dmax < 0.012, `entpackt: Teile gleich, Gesamt ± 0,5 %, Verschiebung ± ${(dmax * 1000).toFixed(1)} mm`);
  const V = new SchadenVerlauf(), S = neuerSchaden();
  V.merke(1.0, S); treffer(S, [0, 0, -2.4], [0, 0, -1], 30, 1); V.merke(5.0, S); treffer(S, [0, 0, 2.2], [0, 0, 1], 30, 2); V.merke(9.0, S);
  ok(V.bei(6).dellen.length === 1 && V.bei(9.5).dellen.length === 2 && V.bei(0.5).dellen.length === 0, 'Verlauf: Rückspulen spult den Schaden mit');
  V.merke(6.0, V.bei(6));
  ok(V.bei(9.5).dellen.length === 1, 'Verlauf: nach dem Rückspulen gelten spätere Stände nicht mehr');
  // Rückspulen mit weiterlaufender Uhr: Stand von t = 6 gilt ab t = 12
  const SA = new SchadenAuto(new Car()); SA.verlauf = V; SA.S = V.bei(9.5);
  SA.zurueckAuf(6, 12);
  ok(SA.S.dellen.length === 1 && SA.verlauf.bei(13).dellen.length === 1 && SA.verlauf.bei(5.5).dellen.length === 1, 'Rückspulen (Uhr läuft weiter): Stand von damals gilt ab jetzt');
  const K = kopie(S); reparieren(S);
  ok(S.dellen.length === 0 && S.teile === 0 && S.gesamt === 0 && K.dellen.length === 2, 'Reparieren setzt zurück (Kopie bleibt)');
}
// 6. Fahrfolgen
{
  const S = neuerSchaden();
  S.gesamt = 0.5; ok(fahrFolgen(S).zug === 0 && fahrFolgen(S).leistung === 1, `unter ${FOLGEN.ab * 100} %: keine Fahrfolgen`);
  S.gesamt = 0.8; S.dellen.push({ p: [0.8, 0, -2], d: [1, 0, 0], t: 0.1, r: 0.5, s: 1 });
  const F = fahrFolgen(S);
  ok(F.zug > 0 && F.leistung < 1 && F.leistung > FOLGEN.leistung && !F.wrack, `80 %: Ziehen ${F.zug.toFixed(3)} rad zur beschädigten Seite, Leistung × ${F.leistung.toFixed(2)}`);
  S.gesamt = 1; ok(fahrFolgen(S).wrack && Math.abs(fahrFolgen(S).leistung - FOLGEN.leistung) < 1e-9, '100 %: Wrack');
}
// 7. Trümmer auf einer Platte
{
  const ebene = { ray(ox, oy, oz, dx, dy, dz, maxT) { if (dy > -1e-9) return null; const t = -oy / dy; if (t < 0 || t > maxT) return null; return { t, x: ox + dx * t, y: 0, z: oz + dz * t, nx: 0, ny: 1, nz: 0, mat: MAT.ROAD }; } };
  const T = new Truemmer(0, [1, 0.8, 0], [30, 0, 0], 5), T2 = new Truemmer(0, [1, 0.8, 0], [30, 0, 0], 5);
  let lebt = true, minY = 9, n = 0;
  while (lebt && n < 2000) { lebt = T.schritt(1 / 60, ebene); T2.schritt(1 / 60, ebene); minY = Math.min(minY, T.p[1]); n++; }
  ok(!lebt && Math.abs(n / 60 - TRUEMMER.leben) < 0.05 && minY > -0.01 && T.liegt, `Trümmer: fliegt, prallt ab, liegt nach ${T.p[0].toFixed(1)} m, verschwindet nach ${TRUEMMER.leben} s, nie unter der Fahrbahn`);
  ok(T.p.join() === T2.p.join(), 'Trümmer deterministisch');
}
// 8. Welt → Auto
{
  const c = new Car(); c.place([5, 0, 3], [1, 0, 0], [0, 1, 0], 0);   // Auto schaut nach +x
  const front = inAuto(c, c.pos.x + 2, c.pos.y, c.pos.z), seite = inAuto(c, 0, 0, 1, false);
  ok(Math.abs(front[2] + 2) < 1e-9 && Math.abs(front[0]) < 1e-9, `Welt → Auto: 2 m vor dem Auto = z −2 (${front.map((v) => v.toFixed(2)).join(', ')})`);
  ok(Math.abs(seite[0] - 1) < 1e-9, 'Welt-Richtung +z = Auto rechts (x +1), wenn das Auto nach +x schaut');
}
// 9. Auto fährt gegen eine Wand (Platte + Wand z = −20): Treffer vorn, Delle vorn, Stoßstange ab; Physik unverändert
{
  const welt = (wand) => ({ ray(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null;
    if (dy < -1e-9) { const t = -oy / dy; if (t >= 0 && t <= maxT) best = { t, x: ox + dx * t, y: 0, z: oz + dz * t, nx: 0, ny: 1, nz: 0, mat: MAT.ROAD }; }
    if (wand && dz < -1e-9) { const t = (-20 - oz) / dz; if (t >= 0 && t <= maxT && (!best || t < best.t)) best = { t, x: ox + dx * t, y: oy + dy * t, z: -20, nx: 0, ny: 0, nz: 1, mat: MAT.WALL ?? 3 }; }
    return best;
  } });
  const fahrt = (mitSchaden) => {
    const c = new Car(); c.place([0, 0, 0], [0, 0, -1], [0, 1, 0], 22);
    const SA = mitSchaden ? new SchadenAuto(c) : null;
    for (let t = 0; t < 2; t += 1 / 120) { c.input.throttle = 0.2; c.step(1 / 120, welt(true)); if (SA) SA.schritt(t); }
    return { c, SA };
  };
  const a = fahrt(false), b = fahrt(true);
  ok(a.c.pos.z === b.c.pos.z && a.c.v.z === b.c.v.z && (a.c.crash || {}).reason === (b.c.crash || {}).reason, `Treffer-Haken ändert die Physik nicht (Crash „${(b.c.crash || {}).reason}“, Lage gleich)`);
  const S = b.SA.S;
  ok(S.dellen.length >= 1 && S.dellen.every((d) => d.p[2] < -1.8) && S.gesamt > 0.2, `Wand frontal 22 m/s: ${S.dellen.length} Delle(n) vorn (z ${S.dellen.map((d) => d.p[2].toFixed(2)).join(', ')}), Gesamt ${(S.gesamt * 100).toFixed(0)} %`);
  ok(b.SA.verlauf.st.length >= 2 && b.SA.version >= 1, 'Treffer im Verlauf (Rückspulen) und Version erhöht');
  const SA2 = new SchadenAuto(new Car()); SA2.S.gesamt = 1; const c2 = SA2.car; c2.input.steer = 0; c2.input.throttle = 1;
  SA2.folgen(c2);
  ok(c2.crash && c2.crash.reason === 'Totalschaden' && c2.input.throttle < 1, 'Fahrfolgen bei 100 %: Wrack „Totalschaden“, weniger Gas');
}
// Schrammen an der Wand (n34-Heavy): Kratzer als ganz flache Treffer, gedrosselt
{
  const { SchadenAuto, KRATZER } = await import('../../src/physics/schaden.js');
  const c3 = new Car(); c3.place([0, 0.5, 0], [0, 0, -1], [0, 1, 0], 20);
  const SA3 = new SchadenAuto(c3);
  for (let k = 0; k < 120; k++) { c3.scrape = 12; c3.scrapeK = 2; c3.scrapeP[0] = c3.pos.x - 1; c3.scrapeP[1] = c3.pos.y + 0.1; c3.scrapeP[2] = c3.pos.z - 0.3 * (k % 4); c3.scrapeN[0] = 1; c3.scrapeN[1] = 0; c3.scrapeN[2] = 0; SA3.schritt(k / 120); }
  const D = SA3.S.dellen;
  ok(D.length >= 1 && D.every((d) => d.t < 0.03 && d.p[0] < 0) && SA3.S.gesamt < 0.1, `1 s Schrammen links: ${D.length} Kratzer-Stellen, Tiefe ≤ ${D.length ? Math.max(...D.map((d) => d.t)).toFixed(3) : '–'} m, Gesamt ${SA3.S.gesamt.toFixed(3)} (je ${KRATZER.alle} s einer)`);
  c3.scrape = 3; const n0 = SA3.nTreffer; for (let k = 0; k < 120; k++) SA3.schritt(1 + k / 120);
  ok(SA3.nTreffer === n0, 'langsames Schleifen (3 m/s): keine Kratzer');
}
console.log(bad ? `Schaden: ${bad} FEHLER` : 'Schaden: alle Prüfungen grün');
process.exit(bad ? 1 : 0);
