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
// Deko sparsam: nach der Unschärfe, vor Auflösung/Stufe
{
  const q = new Quality({}, null); q.post = { active: false, autoOff: true }; const t0 = q.tier;
  for (let i = 0; i < 48 * 4; i++) q.sample(1 / 48, () => {});
  ok(q.decoLite && q.tier === t0 && q.scale === 1, `48 fps ohne Unschärfe: zuerst Gras/Wolken aus, Stufe/Auflösung bleiben (${q.decoLite}, ${q.tier}, ${q.scale})`);
  for (let i = 0; i < 38 * 12; i++) q.sample(1 / 38, () => {});
  ok(q.scale < 1, `danach 38 fps: Auflösung sinkt (${q.scale})`);
}
// Kino-Look (n17): bei Ruckeln zuerst die Renderskala (dynamische Auflösung im Render-Target), Bildschirm-Auflösung bleibt;
// erst am Minimum der Renderskala eine Stufe tiefer; bei Luft wieder hoch
{
  const kino = { pipeline: true, stages: { scale: true }, renderScale: 0.84, scaleRange: [0.84, 0.62, 0.92],
    adapt(fps) { const s0 = this.renderScale; if (fps < 52) this.renderScale = Math.max(0.62, this.renderScale - 0.08); else if (fps > 58.5) this.renderScale = Math.min(0.92, this.renderScale + 0.04); return s0 !== this.renderScale; } };
  const q = new Quality({}, null); q.post = { active: false, autoOff: true }; q.kino = kino; const t0 = q.tier;
  kino.level = q.tier;
  const step = (fps) => { q.sample(1 / fps, () => {}); if (kino.level !== q.tier) { kino.level = q.tier; kino.renderScale = 0.84; } };   // wie main.js: setLevel bei Stufenwechsel
  for (let i = 0; i < 48 * 4; i++) q.sample(1 / 48, () => {});
  ok(kino.renderScale < 0.84 && q.scale === 1 && q.tier === t0 && !q.decoLite, `Kino 48 fps: zuerst Renderskala runter (${kino.renderScale.toFixed(2)}), Bildschirm/Stufe/Deko bleiben`);
  for (let i = 0; i < 48 * 12; i++) q.sample(1 / 48, () => {});
  ok(kino.renderScale <= 0.62 + 1e-9 && q.decoLite, `weiter 48 fps: Renderskala am Minimum (${kino.renderScale.toFixed(2)}), dann Deko sparsam`);
  for (let i = 0; i < 40 * 4; i++) step(40);
  ok(q.tier === t0 - 1 && q.scale === 1, `40 fps am Minimum: eine Stufe tiefer (${t0} → ${q.tier}), Bildschirm-Auflösung bleibt 1`);
  ok(kino.renderScale === 0.84, `neue Stufe startet mit ihrer Renderskala (${kino.renderScale})`);
  kino.renderScale = 0.7;
  for (let i = 0; i < 60 * 12; i++) q.sample(1 / 60, () => {});
  ok(kino.renderScale > 0.7, `60 fps: Renderskala steigt wieder (${kino.renderScale.toFixed(2)})`);
}
console.log(bad ? `${bad} FEHLER` : 'alle Qualitäts-Prüfungen OK');
process.exit(bad ? 1 : 0);
