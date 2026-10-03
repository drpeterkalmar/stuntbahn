// Brems-Rechnung (n23) – eine Rechnung für den Hinweis „Bremsen!“ (Mittel) und die dynamische Ideallinie (lineviz.js):
// Wie stark muss man ab einer Stelle bremsen, um mit dem JETZIGEN Tempo v die nächsten Kurven zu schaffen?
//   r = nötige Verzögerung / Plan-Verzögerung (Bremsplan des Tempo-Profils auf der Geraden, ~2 g bei Tempo).
//   r ≤ lift: grün (Gas), bis brake: gelb (Gas weg), darüber orange → rot (bremsen; r ≥ 1 = so hart wie der Plan).
// Gerechnet gegen das Ziel-Tempo (prof.vt) aller Punkte voraus (Kurven samt Einfahrt, Engstellen, Stunt-Einfahrten,
// Schanzen-Anlauf); das Fenster der Linie endet an der nächsten Kurve (ausgeprägter Tiefpunkt, mins). Fährt man
// langsamer als die Kurve verlangt, bleibt r = 0 (grün) – wie bei Forza.
// Hinweis „Bremsen!“: r an der Stelle react s vor dem Auto (Reaktionszeit) ≥ hint, aus erst unter hint − hyst.
// Damit kommt der Hinweis tempoabhängig früher als bis n22 (0,7 s vor der Plan-Bremsung): bei 200 km/h vor einer
// 90-km/h-Kurve ~1,3 s vor dem Plan-Bremspunkt (gemessen in MITTEL2_BERICHT.md).
import { CAR_DEF, aeroLoad } from '../physics/car.js';
import { G } from '../physics/air.js';
import { PROF } from '../ai/profile.js';

export const BRAKE_WARN = { react: 0.6, lift: 0.3, brake: 0.5, hint: 0.55, hyst: 0.12, over: 0.03, horizon: 7, hMin: 60, prom: 3, promLen: 150, flat: 30 };

// Plan-Verzögerung auf gerader, ebener Fahrbahn bei Tempo v (m/s²) – wie profile.js speedPasses/planBrake ohne Kurve
export function planDecel(def, v) {
  const x = v * v, muF = 1.25 * def.mu, dAero = PROF.aero * def.downK / def.mass;
  const lon = Math.min(muF * (G + x * dAero), def.brake * aeroLoad(def, v) / def.mass);
  return Math.max(0.5, (PROF.brakeCircle || 0.6) * lon + def.dragK * x / def.mass + 0.015 * G);
}

export class BrakeWarn {
  // L: Linie, auf der prof gerechnet ist (env.ideal), prof: Tempo-Profil
  constructor(L, prof, def = CAR_DEF) {
    this.L = L; this.vt = prof.vt; this.def = def;
    const n = L.n, vt = prof.vt, W = BRAKE_WARN, mins = [];
    const sd = (a, b) => { let d = L.s[b] - L.s[a]; if (L.closed && d < 0) d += L.total; return d; };
    for (let i = 0; i < n; i++) {
      if (L.air[i]) continue;
      const p = i > 0 ? i - 1 : L.closed ? n - 2 : i, q = i < n - 1 ? i + 1 : L.closed ? 1 : i;
      if (!(vt[i] < vt[p] - 1e-4 || (p === i)) || vt[i] > vt[q] + 1e-4) continue;   // erster Punkt eines Tiefs
      // ausgeprägt: tiefster Wert ± flat m und mindestens prom m/s unter dem Höchstwert der promLen m davor
      let ok = true, hi = vt[i];
      for (let j = i, c = 0; c < n; c++) {
        const k = j > 0 ? j - 1 : L.closed ? n - 2 : -1; if (k < 0) break;
        const d = sd(k, i); if (d > W.promLen) break;
        if (d <= W.flat && vt[k] < vt[i] - 1e-4) { ok = false; break; }
        hi = Math.max(hi, vt[k]); j = k;
      }
      for (let j = i, c = 0; ok && c < n; c++) {
        const k = j < n - 1 ? j + 1 : L.closed ? 1 : -1; if (k < 0) break;
        if (sd(i, k) > W.flat) break;
        if (vt[k] < vt[i] - 1e-4) ok = false; j = k;
      }
      if (ok && hi - vt[i] >= W.prom) mins.push(i);
    }
    this.mins = Int32Array.from(mins);
    this.minS = Float64Array.from(mins.map((i) => L.s[i]));
  }
  // Abstand (m) längs der Linie von Index a nach b (b voraus)
  dist(a, b) { const L = this.L; let d = L.s[b] - L.s[a]; if (L.closed && d < -1e-6) d += L.total; return d; }
  // Kurven voraus: Indizes in this.mins ab Linienpunkt idx (Startposition für die Suche, sortiert nach s)
  firstMin(idx) {
    const S = this.minS, s = this.L.s[idx];
    let lo = 0, hi = S.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (S[m] < s - 1e-6) lo = m + 1; else hi = m; }
    return lo;   // kann S.length sein (dann auf Rundkursen von vorn)
  }
  // r an der Stelle d0 m vor dem Linienpunkt idx (Auto bei idx mit Tempo v); kTo: Index der Kurve, bis zu der gerechnet
  // wird (nur Kurven bis horizon s bzw. hMin m voraus)
  ratio(idx, v, d0 = 0) {
    // alle Punkte voraus mit Ziel-Tempo unter v (nicht nur die Tiefpunkte: in der Kurven-Einfahrt fällt vt schon, weil
    // die Kurve Haftung braucht – bis zum Scheitel gerechnet käme der Hinweis zu spät), ab 60 m jeden 2. Punkt
    const L = this.L, n = L.n, vt = this.vt;
    if (v < 1) return 0;
    const H = Math.max(BRAKE_WARN.hMin, v * BRAKE_WARN.horizon), a = planDecel(this.def, v), v2 = v * v;
    let r = 0;
    for (let q = idx, c = 0; c < n; c++) {
      const D = this.dist(idx, q);
      if (D > H) break;
      const vk = vt[q];
      if (vk < v && D >= d0 - 0.5 && !L.air[q]) {
        const aEff = (planDecel(this.def, vk) + a) / 2;
        const x = (v2 - vk * vk) / (2 * Math.max(1, D - d0)) / aEff;
        if (x > r) r = x;
      }
      let nq = q + (D > 60 ? 2 : 1);
      if (nq >= n) { if (!L.closed) break; nq = nq - n + 1; }
      q = nq;
    }
    return r;
  }
  // Hinweis „Bremsen!“: Brems-Bedarf react s voraus; on = bisheriger Zustand (Hysterese). Auch schneller als das Ziel-
  // Tempo an der eigenen Stelle (in der Kurve) zählt.
  need(idx, v, on) {
    const W = BRAKE_WARN, r = this.ratio(idx, v, v * W.react);
    const over = v > this.vt[idx] * (1 + W.over) + 1;
    return { r, on: over || r >= (on ? W.hint - W.hyst : W.hint) };
  }
}

// Linienfarbe aus r (0 Gas, 1 Gas weg, 2 bremsen) und Bremsstärke 0 … 1 wie pedalPlan (lineviz.js lineColor)
export function warnClass(r) {
  const W = BRAKE_WARN;
  if (r <= W.lift) return [0, 0];
  if (r <= W.brake) return [1, 0];
  return [2, Math.min(1, (r - W.brake) / (1 - W.brake) * 0.6)];
}
