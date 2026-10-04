// Show-Tacho (n24 Etappe 1, Peter 04.10.2026: „die langsamen Geschwindigkeiten mit mehr km/h angeben, 40 in der Kurve
// klingt langweilig“). Reine ANZEIGE – Physik, KI, Warnungen, Highlight-Schwellen und alle Messungen rechnen weiter mit
// echten km/h. Eine Funktion für alle km/h-Anzeigen (HUD, Cockpit-Zeiger, Replay, Highlight-Texte, Hilfetexte):
//   show = v + k · v · max(0, 1 − v/250)²       (v in echten km/h, k = 1,5)
// 10 → 24, 20 → 45, 30 → 65, 40 → 82, 60 → 112, 100 → 154, 150 → 186, 200 → 212, ab 250 identisch (Vmax ~586 und
// Nitro ~700 bleiben glaubwürdig). Steigung 1 + k·(1 − u)(1 − 3u) mit u = v/250, kleinster Wert 1 − k/3 bei u = 2/3
// → streng monoton für k < 3 (k = 1,5: Steigung überall ≥ 0,5), stetig, 0 → 0.
// URL: ?tacho=echt = Anzeige wie bis n23 (A/B), ?tacho=<k> = anderer Faktor (0 … 2,9). In Node: STUNT_TACHO=echt|<k>.
export const TACHO_SHOW = { k: 1.5, vEq: 250 };

function tachoParam() {
  const q = globalThis.location && globalThis.location.search ? new URLSearchParams(globalThis.location.search).get('tacho') : null;
  return q ?? (globalThis.process && globalThis.process.env ? globalThis.process.env.STUNT_TACHO : null) ?? null;
}
const P = tachoParam();
// wirksamer Faktor (0 = echte km/h)
export const TACHO_K = P === 'echt' ? 0 : P != null && P !== '' && Number.isFinite(+P) ? Math.max(0, Math.min(2.9, +P)) : TACHO_SHOW.k;

// echte km/h → angezeigte km/h (Vorzeichen bleibt, z. B. rückwärts)
export function showKmh(kmh, k = TACHO_K) {
  const v = Math.abs(kmh), u = v / TACHO_SHOW.vEq;
  const s = u < 1 ? v + k * v * (1 - u) * (1 - u) : v;
  return kmh < 0 ? -s : s;
}
// echte m/s → angezeigte km/h
export const showKmhMs = (ms, k = TACHO_K) => showKmh(ms * 3.6, k);
// Umkehrung (Hilfetexte: welche echte Geschwindigkeit zeigt der Tacho als x?) – Bisektion, monoton
export function realKmh(show, k = TACHO_K) {
  let a = 0, b = Math.max(show, 1);
  for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (showKmh(m, k) < show) a = m; else b = m; }
  return (a + b) / 2;
}
