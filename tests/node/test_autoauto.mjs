// Auto-Auto-Kollision (n34, src/physics/autoauto.js): zwei echte Autos (physics/car.js) auf einer ebenen Platte.
// Auffahren, Seitenkontakt, Gegenverkehr nach Dreher, sehr schnell (kein Durchrutschen), T-Stoß, weich vs. hart,
// Crash nur auf hart, Impulserhaltung im Stoß, deterministisch, nie NaN, nie tiefer als 0,35 m ineinander.
import { Car } from '../../src/physics/car.js';
import { MAT } from '../../src/track/defs.js';
import { stoss, ueberlapp, quader, HAERTE, HAERTE_ALT, BOX } from '../../src/physics/autoauto.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };

// ebene Platte y = 0 (Asphalt), so groß wie nötig
const ebene = {
  ray(ox, oy, oz, dx, dy, dz, maxT) {
    if (dy > -1e-9) return null;
    const t = -oy / dy;
    if (t < 0 || t > maxT) return null;
    return { t, x: ox + dx * t, y: 0, z: oz + dz * t, nx: 0, ny: 1, nz: 0, mat: MAT.ROAD, tri: 0, terrain: false };
  },
};
const DT = 1 / 120;
const auto = (x, z, fw, v) => { const c = new Car(); c.place([x, 0, z], fw, [0, 1, 0], v); return c; };
const finite = (c) => [c.pos.x, c.pos.y, c.pos.z, c.v.x, c.v.y, c.v.z, c.w.x, c.w.y, c.w.z, c.q.w].every(Number.isFinite);
// Eindringtiefe jetzt (0 = getrennt)
const tiefe = (A, B) => { const c = ueberlapp(quader(A), quader(B, { c: [0, 0, 0], a: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], h: BOX.h })); return c ? c.pen : 0; };

// Fahrt: beide Autos mit fester Eingabe, nach jedem Schritt Stoß. Liefert Kennzahlen.
function fahrt(A, B, haerte, sek, eingabe = {}) {
  let maxPen = 0, stoesse = 0, maxVn = 0, nan = false, swept = 0;
  let pa = { ...A.pos }, pb = { ...B.pos };
  for (let t = 0; t < sek; t += DT) {
    Object.assign(A.input, { steer: 0, throttle: 0, brake: 0, ...eingabe.A });
    Object.assign(B.input, { steer: 0, throttle: 0, brake: 0, ...eingabe.B });
    A.step(DT, ebene); B.step(DT, ebene);
    const r = stoss(A, B, haerte, pa, pb);
    if (r) { stoesse++; maxVn = Math.max(maxVn, r.vn); if (r.swept) swept++; }
    maxPen = Math.max(maxPen, tiefe(A, B));
    if (!finite(A) || !finite(B)) { nan = true; break; }
    pa = { ...A.pos }; pb = { ...B.pos };
  }
  return { maxPen, stoesse, maxVn, nan, swept };
}

// 1. Auffahren: A (hinten, 40 m/s) auf B (vorn, 20 m/s), beide geradeaus in −z
{
  const A = auto(0, 0, [0, 0, -1], 40), B = auto(0, -8, [0, 0, -1], 20);
  const r = fahrt(A, B, HAERTE.hart, 1.5);
  ok(!r.nan && r.stoesse > 0, `Auffahren: Stoß erkannt (${r.stoesse} Schritte mit Kontakt, Stoß-Tempo ${r.maxVn.toFixed(1)} m/s), kein NaN`);
  ok(r.maxPen < 0.35, `Auffahren: nie tiefer als 0,35 m ineinander (${r.maxPen.toFixed(3)} m)`);
  ok(B.pos.z < A.pos.z - 2 * BOX.h[2] + 0.4, `Auffahren: B bleibt vorn (Abstand Mitte ${(A.pos.z - B.pos.z).toFixed(2)} m)`);
  ok(-B.v.z > -A.v.z - 0.5, `Auffahren: danach ist B mindestens so schnell wie A (A ${(-A.v.z).toFixed(1)}, B ${(-B.v.z).toFixed(1)} m/s)`);
  ok(A.crash && B.crash && A.crash.reason === 'Zusammenstoß', `Auffahren mit 20 m/s Unterschied auf hart: beide crashen (${A.crash && A.crash.reason})`);
}
// 1b. dasselbe weich (Leicht): kein Crash, Tempo-Änderung gedeckelt
{
  const A = auto(0, 0, [0, 0, -1], 40), B = auto(0, -8, [0, 0, -1], 20);
  const r = fahrt(A, B, HAERTE.weich, 1.5);
  ok(!r.nan && !A.crash && !B.crash, `Auffahren weich: kein Crash`);
  ok(r.maxPen < 0.35, `Auffahren weich: nie tiefer als 0,35 m (${r.maxPen.toFixed(3)} m)`);
  ok(B.pos.z < A.pos.z - 2, `Auffahren weich: kein Durchrutschen (Abstand ${(A.pos.z - B.pos.z).toFixed(2)} m)`);
}
// 2. Impulserhaltung im einzelnen Stoß (ohne Reifen: Autos in der Luft, ohne Schwerkraft-Schritt)
{
  const A = auto(0, 10, [0, 0, -1], 30), B = auto(0.4, 10 - 4.5, [0, 0, -1], 10);
  const m0 = [A.v.x + B.v.x, A.v.y + B.v.y, A.v.z + B.v.z];
  const r = stoss(A, B, HAERTE.hart);
  const m1 = [A.v.x + B.v.x, A.v.y + B.v.y, A.v.z + B.v.z];
  ok(r && Math.hypot(m1[0] - m0[0], m1[1] - m0[1], m1[2] - m0[2]) < 1e-9, `Stoß erhält den Impuls (gleiche Massen, Abweichung ${r ? Math.hypot(m1[0] - m0[0], m1[2] - m0[2]).toExponential(1) : '–'})`);
  ok(r && r.vn > 0 && (B.v.z - A.v.z) * Math.sign(r.n[2]) >= -1e-6, `Stoß trennt (Relativ-Tempo entlang n danach ≥ 0)`);
}
// 3. Seitenkontakt: nebeneinander, 30 m/s, A lenkt nach rechts in B
{
  const A = auto(-1.2, 0, [0, 0, -1], 30), B = auto(1.2, 0, [0, 0, -1], 30);
  const yaw0 = 0;
  const r = fahrt(A, B, HAERTE.mittel, 1.0, { A: { steer: 0.4, throttle: 0.3 }, B: { throttle: 0.3 } });
  ok(!r.nan && r.stoesse > 0, `Seitenkontakt: Stoß erkannt (${r.stoesse}), kein NaN`);
  ok(r.maxPen < 0.35, `Seitenkontakt: nie tiefer als 0,35 m (${r.maxPen.toFixed(3)} m)`);
  ok(B.pos.x > A.pos.x + 1.0, `Seitenkontakt: B bleibt rechts von A (Abstand ${(B.pos.x - A.pos.x).toFixed(2)} m)`);
  ok(!A.crash && !B.crash, `Seitenkontakt auf mittel: kein Crash (Stoß ${r.maxVn.toFixed(1)} m/s)`);
  void yaw0;
}
// 4. Gegenverkehr nach Dreher: frontal, je 50 m/s
{
  const A = auto(0, 0, [0, 0, -1], 50), B = auto(0.3, -30, [0, 0, 1], 50);
  const r = fahrt(A, B, HAERTE.hart, 0.8);
  ok(!r.nan && r.stoesse > 0, `Gegenverkehr 2 × 50 m/s: Stoß erkannt, kein NaN (Stoß ${r.maxVn.toFixed(1)} m/s)`);
  ok(r.maxPen < 0.35, `Gegenverkehr: nie tiefer als 0,35 m (${r.maxPen.toFixed(3)} m)`);
  ok(B.pos.z < A.pos.z, `Gegenverkehr: kein Durchrutschen (B bleibt vor A: ${B.pos.z.toFixed(2)} < ${A.pos.z.toFixed(2)})`);
}
// 5. Sehr schnell: frontal je 150 m/s (2,5 m relativ je Schritt) – Swept-Test fängt es
{
  const A = auto(0, 0, [0, 0, -1], 150), B = auto(0, -40, [0, 0, 1], 150);
  const r = fahrt(A, B, HAERTE.hart, 0.4);
  ok(!r.nan && B.pos.z < A.pos.z, `frontal 2 × 150 m/s: kein Durchrutschen (B ${B.pos.z.toFixed(2)} vor A ${A.pos.z.toFixed(2)}), Swept-Schritte ${r.swept}`);
  ok(r.maxPen < 0.35, `frontal 2 × 150 m/s: nie tiefer als 0,35 m (${r.maxPen.toFixed(3)} m)`);
}
// 6. T-Stoß: A fährt mit 80 m/s quer in die Seite von B
{
  const A = auto(-20, 0, [1, 0, 0], 80), B = auto(0, 0, [0, 0, -1], 5);
  const r = fahrt(A, B, HAERTE.hart, 0.6);
  ok(!r.nan && r.stoesse > 0 && r.maxPen < 0.35, `T-Stoß 80 m/s: Stoß, kein NaN, Tiefe ${r.maxPen.toFixed(3)} m`);
  ok(A.pos.x < B.pos.x, `T-Stoß: A nicht durch B hindurch (A ${A.pos.x.toFixed(2)}, B ${B.pos.x.toFixed(2)})`);
}
// n45 Rempler (Peter 04.11.2026: „ein bisschen kontakt darf schon sein“): Auffahren mit 12 m/s Unterschied crasht auf mittel und hart
// nicht mehr (bis 0.19.3 auf hart schon), 25 m/s auf hart weiter; ?rempel=alt-Werte unverändert
{
  const lauf = (h, dv) => { const A = auto(0, 0, [0, 0, -1], 20 + dv), B = auto(0, -8, [0, 0, -1], 20); const r = fahrt(A, B, h, 1.5); return { A, B, r }; };
  const m = lauf(HAERTE.mittel, 12), h = lauf(HAERTE.hart, 12), ha = lauf(HAERTE_ALT.hart, 12), h2 = lauf(HAERTE.hart, 25);
  ok(!m.A.crash && !m.B.crash, `Rempler mittel 12 m/s: kein Crash (Stoß ${m.r.maxVn.toFixed(1)} m/s)`);
  ok(!h.A.crash && !h.B.crash, `Rempler hart 12 m/s: kein Crash (Stoß ${h.r.maxVn.toFixed(1)} m/s)`);
  ok(ha.A.crash && ha.B.crash, `?rempel=alt hart 12 m/s: Crash wie bis 0.19.3`);
  ok(h2.A.crash && h2.B.crash, `harter Einschlag hart 25 m/s: weiter Crash (Stoß ${h2.r.maxVn.toFixed(1)} m/s)`);
  ok(HAERTE.mittel.crash >= 2 * HAERTE_ALT.mittel.crash * 0.9 && HAERTE.hart.crash >= 2 * HAERTE_ALT.hart.crash * 0.9, `Crash-Schwellen etwa doppelt (mittel ${HAERTE.mittel.crash}, hart ${HAERTE.hart.crash} m/s)`);
  ok(h.r.maxPen < 0.35 && h.B.pos.z < h.A.pos.z - 2, `Rempler hart: kein Durchrutschen (Tiefe ${h.r.maxPen.toFixed(3)} m)`);
}
// 7. weich dreht weniger als hart (Stoß an der Ecke)
{
  const run = (h) => { const A = auto(0, 0, [0, 0, -1], 35), B = auto(1.4, -6, [0, 0, -1], 25); fahrt(A, B, h, 0.5); return Math.abs(B.w.y) + Math.abs(A.w.y); };
  // (n45: mit der Crash-Schwelle bis 0.19.3 – crashen beide, steht die Gierrate des Stoßes; ohne Crash fängt die Reifenhaftung sie ab)
  const w = run(HAERTE.weich), hh = run(HAERTE_ALT.hart);
  ok(w < hh, `Eckstoß: weich dreht weniger als hart (Gierrate ${w.toFixed(2)} < ${hh.toFixed(2)} rad/s)`);
}
// 8. deterministisch
{
  const run = () => { const A = auto(0, 0, [0, 0, -1], 45), B = auto(0.8, -10, [0, 0, -1], 15); fahrt(A, B, HAERTE.mittel, 1.2, { A: { steer: 0.1 } }); return [A.pos.x, A.pos.z, B.pos.x, B.pos.z, A.w.y].join(','); };
  ok(run() === run(), 'deterministisch (zweimal gleich)');
}
// 9. fest (Gegner auf der Schiene / im Countdown): das feste Auto bewegt sich nicht
{
  const A = auto(0, 0, [0, 0, -1], 20), B = auto(0, -4.4, [0, 0, -1], 0);
  const vb = { ...B.v }, pb = { ...B.pos };
  const r = stoss(A, B, HAERTE.hart, null, null, { festB: true });
  ok(r && B.v.z === vb.z && B.pos.z === pb.z && A.v.z > -20, `fest: B unverändert, A prallt ab (A ${A.v.z.toFixed(1)} m/s)`);
}
// 10. getrennt: weit auseinander → null, ohne Arbeit
{
  const A = auto(0, 0, [0, 0, -1], 20), B = auto(30, 0, [0, 0, -1], 20);
  ok(stoss(A, B, HAERTE.hart, { ...A.pos }, { ...B.pos }) === null, 'weit auseinander: kein Stoß');
}
console.log(bad ? `Auto-Auto-Kollision: ${bad} FEHLER` : 'Auto-Auto-Kollision: alle Prüfungen grün');
process.exit(bad ? 1 : 0);
