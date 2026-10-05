// Schanze n21 (Peter 30.09.2026: „Sprungschanze ist derzeit eher eine orbitale Startrampe“ – „mach die Sprünge länger
// und stell flache Hindernisse oder Wassergräben mit Schiffen usw. rein“): Fenster auf das echte Tempo, Scheitel/Flug/
// Weite im Ziel, jede Hindernis-Variante bei vmin/vbest/vmax überflogen, zu kurz = Crash; ?schanze=alt = bis n19.
import { JUMP, jumpWindow, setSchanze } from '../../src/track/pieces.js';
import { OBSTACLES } from '../../src/track/obstacles.js';
import { STUNT_SCALE } from '../../src/track/defs.js';
import { sprung } from '../../tools/sprung_hindernis.mjs';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const kmh = (v) => (v * 3.6).toFixed(0);

const w = jumpWindow();
// n26 (Stunt-Maßstab > 1): höhere Schanze (15°-Lippe, 2,1 m; Landerampe 4 m) → Fenster tiefer (~122–144 km/h), Scheitel
// höher, Flug länger; mit ?stunt=1 (STUNT_STUNT=1) die n21-Werte
const N26 = STUNT_SCALE > 1.3;
const [v0, v1] = N26 ? [120, 150] : [150, 220];
check(w.vbest * 3.6 >= v0 && w.vbest * 3.6 <= v1 && JUMP.lipDeg <= 15, `Fenster ${kmh(w.vmin)}–${kmh(w.vmax)} km/h, vbest ${kmh(w.vbest)} (${v0}–${v1}), Lippe ${JUMP.lipDeg}°, ${JUMP.lipH.toFixed(2)} m`);
check(w.apex >= (N26 ? 5 : 3.8) && w.apex <= 7 && w.air >= (N26 ? 2.5 : 2) && w.air <= 3.5, `Rechnung bei vbest: Scheitel ${w.apex.toFixed(1)} m (${N26 ? 5 : 4}–7), Flug ${w.air.toFixed(2)} s (${N26 ? '2,5' : 2}–3,5)`);
if (N26) check(JUMP.lipH >= 2 && JUMP.landH >= 3.9 && w.apex + JUMP.lipH >= 7, `n26 höher: Lippe ${JUMP.lipH.toFixed(2)} m (≥ 2; n21 1,44), Landerampe ${JUMP.landH} m (≥ 3,9; n21 2,5), Scheitel über Grund ${(w.apex + JUMP.lipH).toFixed(1)} m (≥ 7; n21 5,5)`);
const seen = new Set();
for (const kind of OBSTACLES) {
  const res = [['zu kurz', 0.9 * w.vmin], ['vmin', w.vmin + 0.4], ['vbest', w.vbest], ['vmax', w.vmax - 0.3]].map(([nm, v]) => ({ nm, ...sprung(kind, v) }));
  const ok = res.every((r) => (r.nm === 'zu kurz' ? !!r.crash : !r.crash));
  const b = res.find((r) => r.nm === 'vbest'), top = res.find((r) => r.nm === 'vmax');
  if (b.tris > 0) seen.add(kind);
  check(ok && b.weite > (N26 ? 88 : 90) && top.apex <= 10 && top.air <= 4 && b.tris > 100 && b.tris < 4000,
    `${kind.padEnd(9)}: ${res.map((r) => `${r.nm} ${r.crash ? '„' + r.crash + '“' : 'ok'}`).join(', ')}; vbest Weite ${b.weite && b.weite.toFixed(0)} m, Scheitel ${b.apex.toFixed(1)} m; vmax Scheitel ${top.apex.toFixed(1)} m, Flug ${top.air.toFixed(1)} s; ${b.tris} Dreiecke`);
}
// kurzer Anlauf (Bodenwellen davor): eigenes Fenster, im Fenster ohne Crash, zu kurz = Crash
{
  const r0 = sprung('busse', 'ap', true), wk = r0.win;
  const res = [['zu kurz', 0.85 * wk.vmin], ['Profil', 'ap']].map(([nm, v]) => ({ nm, ...sprung('busse', v, true) }));
  check(wk && wk.vmin * 3.6 > 95 && res.every((r) => (r.nm === 'zu kurz' ? !!r.crash : !r.crash)), `kurzer Anlauf (Bodenwellen davor): Fenster ${kmh(wk.vmin)}–${kmh(wk.vmax)} km/h, ${res.map((r) => `${r.nm}${r.vLip ? ' ' + kmh(r.vLip) + ' km/h' : ''} ${r.crash ? '„' + r.crash + '“' : 'ok'}`).join(', ')}, Hindernis ${res[1].obst || 'Wassergraben'}`);
}
check(seen.size >= 5, `${seen.size} Hindernis-Varianten gebaut (≥ 5)`);
setSchanze(true);
const a = jumpWindow();
check(Math.abs(a.vbest * 3.6 - 61) < 3 && JUMP.lipDeg === 28 && !JUMP.obstacles, `?schanze=alt: Schanze bis n19 (vbest ${kmh(a.vbest)} km/h, Lippe 28°, ohne Hindernisse)`);
setSchanze(false);
console.log(fails ? `${fails} Fehlschläge` : `Schanze ${N26 ? 'n26' : 'n21'}: alle Prüfungen grün`);
process.exit(fails ? 1 : 0);
