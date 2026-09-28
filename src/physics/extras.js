// Extras (Peter 28.09.2026: „Cool wäre pro Runde einmal springen und einmal Nitro-Boost“) – Arcade, bewusst
// übertrieben. Eine Quelle für Physik (car.js), Rennlogik (race.js), Anzeige und Messungen.
// Hüpfer: Absprung senkrecht zur Fahrbahn, ~3,5 m hoch (Auto-Maßstab, wächst NICHT mit der Welt), Vorwärtstempo
//   bleibt, das Auto hält die Lage vom Absprung (kein Überschlag durch den Hüpfer). Im Flug dieselbe
//   Luft-Schwerkraft wie bei den Schanzen (air.js).
// Nitro: NITRO.dur s lang zusätzlicher Schub = NITRO.k × Motor-Antriebskraft (× Gas), danach in NITRO.fade s
//   weich zurück. Der Schub greift am Schwerpunkt (nicht über die Reifen – sonst verpufft er am Haftungslimit)
//   und nur mit Radkontakt (in der Luft kein Weitenschub: Schanzen-Tempofenster bleiben gültig).
//   Mit k = 0,7: Beschleunigung +70–85 % im Fahrbereich, Vmax ×1,7^(1/3) ≈ +19 % (Leistung ∝ v³ bei Vmax).
import { G, AIR, gravStep } from './air.js';

export const HOP = {
  h: 3.5,         // m: Scheitel der Fahrzeugmitte über der Absprunghöhe (gemessen, tools/extras_measure.mjs)
  lift: 0,        // m/s: Absprung-Tempo senkrecht zur Fahrbahn (unten aus h berechnet, inkl. Federn)
  minGround: 2,   // Räder mit Bodenkontakt, damit der Hüpfer auslöst (in der Luft keine Rettung)
  maxTilt: 0.8,   // Fahrbahn-Normale.y mindestens (Steilkurven-Flanken, Wände: gesperrt)
};
export const NITRO = {
  dur: 3.0,       // s volle Wirkung (auf die längeren Geraden der großen Welt abgestimmt, siehe EXTRAS_BERICHT.md)
  fade: 0.7,      // s weich zurück
  k: 0.7,         // Zusatzschub = k × Antriebskraft des Motors
};

// Hüllkurve des Nitro (0 … 1) nach t Sekunden seit dem Zünden; t < 0 = aus
export function nitroLevel(t) {
  if (!(t >= 0)) return 0;
  if (t < NITRO.dur) return 1;
  const u = (t - NITRO.dur) / NITRO.fade;
  return u >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * u);
}
export const NITRO_TOTAL = NITRO.dur + NITRO.fade;

// Senkrechter Flug des Hüpfers ab Absprung-Tempo v0 (m/s), integriert wie die Physik (120 Hz, Luft-Schwerkraft
// mit Verzögerung/Einblendung, ohne Luftwiderstand senkrecht): { t: [], y: [] } bis zur Rückkehr auf y = 0.
export function hopFlight(v0, dt = 1 / 120) {
  const T = [0], Y = [0];
  let y = 0, vy = v0, s = 1, t = 0;
  for (let k = 0; k < 2400; k++) {
    vy -= G * s * dt; y += vy * dt; t += dt;
    s = gravStep(s, true, dt, t);
    T.push(t); Y.push(y);
    if (y < 0) break;
  }
  return { t: T, y: Y, apex: Math.max(...Y), time: t };
}
// Absprung-Tempo für Scheitelhöhe h (Bisektion über hopFlight)
export function hopSpeedFor(h) {
  let lo = 1, hi = 20;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (hopFlight(m).apex < h) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// Federn: beim Absprung entspannen sich die eingefederten Federbeine und schieben etwas nach (gemessen:
// +0,05 m Scheitel im Stand) – daher ein kleiner Abschlag auf die Wunschhöhe.
const SPRING_BONUS = 0.05;
let cache = null;
// Absprung-Tempo und senkrechte Flugbahn passend zum aktuellen Luft-Faktor (?air=… ändert ihn), je Faktor
// einmal gerechnet: { lift, flight }
export function hopModel() {
  const key = AIR.factor + '|' + HOP.h;
  if (!cache || cache.key !== key) {
    const lift = hopSpeedFor(HOP.h - SPRING_BONUS);
    cache = { key, lift, flight: hopFlight(lift) };
    HOP.lift = lift;
  }
  return cache;
}
// Flugbahn des Hüpfers in Metern über der Absprungstelle nach x Metern bei Tempo v (für Hindernis-Prüfungen):
// liefert Höhe (m) – nach der Landung 0
export function hopHeightAt(flight, v, x) {
  const t = x / Math.max(1, v), T = flight.t;
  if (t >= T[T.length - 1]) return 0;
  const i = Math.min(T.length - 2, Math.floor(t * 120));
  return Math.max(0, flight.y[i]);
}
