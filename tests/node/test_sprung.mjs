// Schanze n21 (Peter 30.09.2026: „Sprungschanze ist derzeit eher eine orbitale Startrampe“ – „mach die Sprünge länger
// und stell flache Hindernisse oder Wassergräben mit Schiffen usw. rein“): Fenster auf das echte Tempo, Scheitel/Flug/
// Weite im Ziel, jede Hindernis-Variante bei vmin/vbest/vmax überflogen, zu kurz = Crash; ?schanze=alt = bis n19.
import { JUMP, jumpWindow, setSchanze } from '../../src/track/pieces.js';
import { OBSTACLES } from '../../src/track/obstacles.js';
import { sprung } from '../../tools/sprung_hindernis.mjs';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const kmh = (v) => (v * 3.6).toFixed(0);

const w = jumpWindow();
check(w.vbest * 3.6 >= 150 && w.vbest * 3.6 <= 220 && JUMP.lipDeg <= 15, `Fenster ${kmh(w.vmin)}–${kmh(w.vmax)} km/h, vbest ${kmh(w.vbest)} (150–220), Lippe ${JUMP.lipDeg}°`);
check(w.apex >= 3.8 && w.apex <= 7 && w.air >= 2 && w.air <= 3.5, `Rechnung bei vbest: Scheitel ${w.apex.toFixed(1)} m (4–7), Flug ${w.air.toFixed(2)} s (2–3,5)`);
const seen = new Set();
for (const kind of OBSTACLES) {
  const res = [['zu kurz', 0.9 * w.vmin], ['vmin', w.vmin + 0.4], ['vbest', w.vbest], ['vmax', w.vmax - 0.3]].map(([nm, v]) => ({ nm, ...sprung(kind, v) }));
  const ok = res.every((r) => (r.nm === 'zu kurz' ? !!r.crash : !r.crash));
  const b = res.find((r) => r.nm === 'vbest'), top = res.find((r) => r.nm === 'vmax');
  if (b.tris > 0) seen.add(kind);
  check(ok && b.weite > 90 && top.apex <= 10 && top.air <= 4 && b.tris > 100 && b.tris < 4000,
    `${kind.padEnd(9)}: ${res.map((r) => `${r.nm} ${r.crash ? '„' + r.crash + '“' : 'ok'}`).join(', ')}; vbest Weite ${b.weite && b.weite.toFixed(0)} m, Scheitel ${b.apex.toFixed(1)} m; vmax Scheitel ${top.apex.toFixed(1)} m, Flug ${top.air.toFixed(1)} s; ${b.tris} Dreiecke`);
}
check(seen.size >= 5, `${seen.size} Hindernis-Varianten gebaut (≥ 5)`);
setSchanze(true);
const a = jumpWindow();
check(Math.abs(a.vbest * 3.6 - 61) < 3 && JUMP.lipDeg === 28 && !JUMP.obstacles, `?schanze=alt: Schanze bis n19 (vbest ${kmh(a.vbest)} km/h, Lippe 28°, ohne Hindernisse)`);
setSchanze(false);
console.log(fails ? `${fails} Fehlschläge` : 'Schanze n21: alle Prüfungen grün');
process.exit(fails ? 1 : 0);
