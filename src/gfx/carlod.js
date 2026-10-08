// n30: Heldenauto-LOD – reine Rechnung (ohne three.js, Node-testbar: tests/node/test_lod.mjs). Modelle: carmesh.js.
// Umschalt-Entfernungen (m) für Mittel/Fern bei 62° Bildwinkel; enger Bildwinkel (Tele im Replay) rückt sie weiter weg.
// Hysterese ±10 %, damit es an der Grenze nicht flackert. TODO n30-Heavy: am Bild prüfen (Verfolger weit, Replay-Totale)
export const LOD_DIST = [25, 60];
export function lodFor(dist, fovDeg, cur = 0, dists = LOD_DIST) {
  const k = Math.tan((fovDeg * Math.PI) / 360) / Math.tan((62 * Math.PI) / 360);
  const d = dist * k;
  let l = 0;
  for (let i = 0; i < dists.length; i++) {
    const lim = dists[i] * (cur > i ? 0.9 : 1.1);   // schon gröber → erst deutlich näher wieder fein (und umgekehrt)
    if (d > lim) l = i + 1;
  }
  return l;
}
