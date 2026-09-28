// Qualitäts-Automatik + Bewegungsunschärfe (28.09.2026): Die Unschärfe darf die Bildrate nicht spürbar senken.
// Simuliert Bildraten ohne/mit Unschärfe und prüft, wann die Automatik sie abschaltet (und dass sie es sonst nicht tut).
import { Quality } from '../../src/gfx/quality.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
globalThis.window = globalThis.window || { devicePixelRatio: 2.6 };

// fps-Folge: [fps, Sekunden, Unschärfe aktiv]
function run(seq, forced = null) {
  const q = new Quality({}, forced);
  q.post = { active: false, autoOff: false };
  const tier0 = q.tier;
  let changes = 0;
  for (const [fps, sec, blur] of seq) {
    const n = Math.round(fps * sec);
    for (let i = 0; i < n; i++) { q.post.active = blur && !q.post.autoOff; q.sample(1 / fps, () => changes++); }
  }
  return { off: q.post.autoOff, tierSame: q.tier === tier0, tier: q.tier, scale: q.scale, ref: q.fpsRef, changes };
}
let r = run([[60, 6, false], [59.5, 12, true]]);
ok(!r.off, `60 → 59,5 fps mit Unschärfe: bleibt an (${JSON.stringify(r)})`);
r = run([[60, 6, false], [52, 9, true]]);
ok(r.off && r.tierSame && r.scale === 1, `60 → 52 fps mit Unschärfe: aus, Stufe/Auflösung unverändert (${JSON.stringify(r)})`);
r = run([[90, 6, false], [80, 9, true]]);
ok(!r.off, `90-Hz-Handy, 80 fps mit Unschärfe: bleibt an (über 58) (${JSON.stringify(r)})`);
r = run([[50, 6, false], [48, 9, true]]);
ok(!r.off, `schon ohne Unschärfe 50 fps, mit 48: bleibt an (< 8 % Verlust) (${JSON.stringify(r)})`);
r = run([[50, 6, false], [42, 9, true]]);
ok(r.off, `50 → 42 fps mit Unschärfe: aus (${JSON.stringify(r)})`);
r = run([[40, 6, true]]);
ok(r.off && r.tierSame, `ohne Bezug, 40 fps mit Unschärfe: zuerst Unschärfe aus, Stufe bleibt (${JSON.stringify(r)})`);
r = run([[60, 6, false], [30, 9, true]], '1');
ok(!r.off, `feste Grafikstufe (Nutzerwahl): Automatik greift nicht (${JSON.stringify(r)})`);
console.log(bad ? `${bad} FEHLER` : 'alle Qualitäts-Prüfungen OK');
process.exit(bad ? 1 : 0);
