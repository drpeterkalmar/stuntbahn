// Halb-Oktaeder für Impostors (n30, src/gfx/kern/oktaeder.js): Kodieren/Dekodieren umkehrbar, Ansichten decken die obere
// Halbkugel gleichmäßig, Auswahl der 3 Ansichten stetig mit Gewichtssumme 1, Bildebenen-Basis orthonormal und
// rechtshändig wie eine three.js-Kamera (x = up × z), Projektion der Mitte = Zellmitte.
import { hemiOktKodieren, hemiOktDekodieren, rahmenRichtung, rahmenBasis, waehleRahmen, rahmenUv, OKT_GLSL } from '../../src/gfx/kern/oktaeder.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
let rnd = 7; const R = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);

let maxErr = 0;
for (let k = 0; k < 2000; k++) {
  const d = norm([R() * 2 - 1, R(), R() * 2 - 1]);
  const [u, v] = hemiOktKodieren(...d);
  const e = hemiOktDekodieren(u, v);
  maxErr = Math.max(maxErr, Math.hypot(e[0] - d[0], e[1] - d[1], e[2] - d[2]));
  if (u < -1e-9 || u > 1 + 1e-9 || v < -1e-9 || v > 1 + 1e-9) { maxErr = 9; break; }
}
ok(maxErr < 1e-9, `Kodieren → Dekodieren umkehrbar, UV in [0,1]² (max. Fehler ${maxErr.toExponential(1)})`);
const oben = hemiOktKodieren(0, 1, 0);
ok(Math.abs(oben[0] - 0.5) < 1e-12 && Math.abs(oben[1] - 0.5) < 1e-12, 'senkrecht von oben = Atlas-Mitte');
// Abdeckung: größter Winkel einer Zufallsrichtung zur nächsten Ansicht (N = 8)
const N = 8, frames = [];
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) frames.push(rahmenRichtung(i, j, N));
ok(frames.every((f) => f[1] >= 0 && Math.abs(Math.hypot(...f) - 1) < 1e-9), '64 Ansichten, alle obere Halbkugel, Einheitslänge');
let worst = 0;
for (let k = 0; k < 3000; k++) {
  const d = norm([R() * 2 - 1, R() * 0.9 + 0.02, R() * 2 - 1]);
  let best = -1; for (const f of frames) best = Math.max(best, dot(d, f));
  worst = Math.max(worst, Math.acos(Math.min(1, best)));
}
ok(worst * 180 / Math.PI < 22, `8×8: jede Blickrichtung ≤ ${(worst * 180 / Math.PI).toFixed(1)}° von der nächsten Ansicht (< 22°)`);
// Auswahl: Gewichte ≥ 0, Summe 1; die gewichtete Mitte der 3 Ansichten liegt nahe der Blickrichtung
let wErr = 0, sprung = 0, prev = null;
for (let k = 0; k <= 400; k++) {
  const a = k / 400 * Math.PI * 2, d = norm([Math.cos(a), 0.35, Math.sin(a)]);
  const F = waehleRahmen(...d, N);
  const s = F.reduce((q, f) => q + f[2], 0);
  wErr = Math.max(wErr, Math.abs(s - 1), ...F.map((f) => Math.max(0, -f[2])));
  // Mischrichtung
  const m = norm(F.reduce((q, [i, j, w]) => { const f = rahmenRichtung(i, j, N); return [q[0] + f[0] * w, q[1] + f[1] * w, q[2] + f[2] * w]; }, [0, 0, 0]));
  if (prev) sprung = Math.max(sprung, Math.acos(Math.min(1, dot(m, prev))));
  prev = m;
}
ok(wErr < 1e-9, 'Gewichte der 3 Ansichten ≥ 0 und Summe 1');
ok(sprung * 180 / Math.PI < 3, `Rundflug um den Baum: Mischrichtung springt nie (größter Schritt ${(sprung * 180 / Math.PI).toFixed(2)}° bei 0,9° Kameraschritt)`);
// Basis
let bErr = 0, hand = 0;
for (const f of [...frames, [0, 1, 0], norm([0.001, 1, 0])]) {
  const { r, u } = rahmenBasis(...f);
  bErr = Math.max(bErr, Math.abs(dot(r, u)), Math.abs(dot(r, f)), Math.abs(dot(u, f)), Math.abs(Math.hypot(...r) - 1), Math.abs(Math.hypot(...u) - 1));
  const z = cross(r, u); hand = Math.max(hand, Math.hypot(z[0] - f[0], z[1] - f[1], z[2] - f[2]));   // x × y = z (rechtshändig)
}
ok(bErr < 1e-9 && hand < 1e-9, 'Bildebene: r, u, n orthonormal und rechtshändig (r × u = n, wie Kamera x × y = z)');
const side = rahmenBasis(1, 0, 0);
ok(side.u[1] > 0.999, 'Seitenansicht: „oben“ im Bild = Welt-oben');
const uv = rahmenUv(0, 0, 0, frames[20], 5);
ok(Math.abs(uv[0] - 0.5) < 1e-12 && Math.abs(uv[1] - 0.5) < 1e-12, 'Objektmitte → Zellmitte');
const uv2 = rahmenUv(0, 5, 0, [1, 0, 0], 5);
ok(Math.abs(uv2[1] - 1) < 1e-12, 'Spitze (Höhe = Radius) von der Seite → oberer Zellrand');
// Laufzeit-Rechnung (JS-Nachbau von impUv in kern/impostor.js): Kamera genau in Ansichtsrichtung → ein Billboard-Punkt
// landet auf derselben Atlas-UV wie beim Backen (Projektion entlang der Ansicht); leicht daneben → UV verschiebt sich stetig
{
  const impUv = (n, P, E, C, R0) => { const { r, u } = rahmenBasis(...n); const v = [P[0] - E[0], P[1] - E[1], P[2] - E[2]]; const t = dot([C[0] - E[0], C[1] - E[1], C[2] - E[2]], n) / dot(v, n); const q = [E[0] + v[0] * t - C[0], E[1] + v[1] * t - C[1], E[2] + v[2] * t - C[2]]; return [dot(q, r) / (2 * R0) + 0.5, dot(q, u) / (2 * R0) + 0.5]; };
  const C = [0, 0.5, 0], R0 = 0.6, n = frames[1 * N + 2];   // flache Ansicht (Bäume sieht man fast nur von der Seite)
  const E = [C[0] + n[0] * 50, C[1] + n[1] * 50, C[2] + n[2] * 50];
  const { r, u } = rahmenBasis(...n);
  const P = [C[0] + r[0] * 0.3 + u[0] * -0.2, C[1] + r[1] * 0.3 + u[1] * -0.2, C[2] + r[2] * 0.3 + u[2] * -0.2];
  const a1 = impUv(n, P, E, C, R0), a2 = rahmenUv(P[0] - C[0], P[1] - C[1], P[2] - C[2], n, R0);
  ok(Math.hypot(a1[0] - a2[0], a1[1] - a2[1]) < 1e-9, `Laufzeit-UV = Back-UV, wenn die Kamera in Ansichtsrichtung steht (${a1.map((x) => x.toFixed(3))})`);
  const n2 = frames[1 * N + 3]; const b1 = impUv(n2, P, E, C, R0);
  ok(Math.hypot(b1[0] - a1[0], b1[1] - a1[1]) < 0.25, `Nachbar-Ansicht: UV nur leicht verschoben (${b1.map((x) => x.toFixed(3))})`);
}
ok(/oktKod/.test(OKT_GLSL) && /oktDek/.test(OKT_GLSL) && /oktBasis/.test(OKT_GLSL), 'GLSL-Gegenstück vorhanden');
console.log(bad ? `${bad} FEHLER` : 'alle Oktaeder-Prüfungen OK');
process.exit(bad ? 1 : 0);
