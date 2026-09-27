// Luft-Physik (Arcade, bewusst unrealistisch – Peter 27.09.2026: „höher springen wie im Original“):
// Solange alle Räder in der Luft sind (und das Auto nicht in Looping/Röhre steckt), wirkt nur ein Teil
// der Schwerkraft → das Auto hängt lange und hoch in der Luft. Weich ein-/ausgeblendet (kein Ruck).
// Einzige Quelle für Physik (car.js), Tempo-Fenster/Autopilot (pieces.js jumpWindow, profile.js
// genericJumpWindow) und Anzeige-Flugbahn der Schanze – alle nutzen flightPath() mit denselben Werten.
// URL: ?air=1 = Original-Physik (volle Schwerkraft), ?air=0.6 usw.; ?lip=15 = alte Schanze (pieces.js).
export const G = 9.81;

const url = (k) => {
  const s = globalThis.location && globalThis.location.search;
  if (!s) return null;
  const v = new URLSearchParams(s).get(k);
  return v !== null && v !== '' && Number.isFinite(+v) ? +v : null;
};
const clampF = (f) => Math.max(0.3, Math.min(1, f));

export const AIR = {
  factor: clampF(url('air') ?? 0.7), // Schwerkraft-Anteil im Flug (bis 27.09.2026: 1 = volle Schwerkraft)
  delay: 0.2,                        // s: erst nach so langer Flugzeit (kurze Hüpfer über Wellen bleiben normal)
  blendIn: 0.2,                      // s: danach linear auf den Luft-Faktor
  blendOut: 0.06,                    // s: nach dem ersten Radkontakt zurück auf volle Schwerkraft
};
// Für Tests/Messungen (Node): Faktor setzen; Tempo-Fenster rechnen sich danach neu.
export function setAir(o) { if (o.factor != null) AIR.factor = clampF(o.factor); }

// Ein Zeitschritt des Schwerkraft-Anteils: frei = alle Räder in der Luft und kein Looping/Röhre,
// airT = Flugzeit bisher (s).
export function gravStep(scale, free, dt, airT) {
  const f = AIR.factor;
  if (f >= 1) return 1;
  if (free && airT < AIR.delay) return scale;
  if (free) return Math.max(f, scale - (1 - f) * dt / AIR.blendIn);
  return Math.min(1, scale + (1 - f) * dt / AIR.blendOut);
}

// Flugbahn ab der Lippe (x vorwärts ab Lippe, y absolut), integriert wie die Physik: 120 Hz,
// Schwerkraft mit Einblendung ab dem Abheben, Luftwiderstand k·|v|·v (k = dragK / Masse).
// Liefert Arrays { x, y, t, vx, vy } bis x ≥ xMax oder y < yMin.
export function flightPath(y0, th, v, { xMax = 120, yMin = -20, drag = 0, dt = 1 / 120 } = {}) {
  const X = [], Y = [], T = [], VX = [], VY = [];
  let x = 0, y = y0, vx = v * Math.cos(th), vy = v * Math.sin(th), s = 1, t = 0;
  for (let k = 0; k < 4000; k++) {
    X.push(x); Y.push(y); T.push(t); VX.push(vx); VY.push(vy);
    if (x >= xMax || y < yMin) break;
    const sp = Math.hypot(vx, vy);
    vx += -drag * sp * vx * dt;
    vy += (-G * s - drag * sp * vy) * dt;
    x += vx * dt; y += vy * dt; t += dt;
    s = gravStep(s, true, dt, t);
  }
  return { x: X, y: Y, t: T, vx: VX, vy: VY };
}

// Flugbahn an Stelle x (linear interpoliert); vor der Lippe (x < 0) geradlinig verlängert.
export function pathAt(P, x) {
  const X = P.x, n = X.length;
  if (x <= 0) return { y: P.y[0] + x * P.vy[0] / P.vx[0], vx: P.vx[0], vy: P.vy[0] };
  let lo = 0, hi = n - 1;
  if (x >= X[hi]) return { y: P.y[hi], vx: P.vx[hi], vy: P.vy[hi] };
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (X[m] <= x) lo = m; else hi = m; }
  const u = (x - X[lo]) / Math.max(1e-9, X[hi] - X[lo]);
  const l = (a) => a[lo] + (a[hi] - a[lo]) * u;
  return { y: l(P.y), vx: l(P.vx), vy: l(P.vy) };
}
