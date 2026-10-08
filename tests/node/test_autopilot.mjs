// Qualitäts-Autopilot (n30, src/gfx/kern/autopilot.js): künstliche Last rauf/runter an einem simulierten Gerät.
// Prüft: Reaktion ≤ 3 s, Wiederaufstieg mit Hysterese, keine Pendelei, Reihenfolge (Renderskala → Deko → Auto-Schatten →
// Stufe), CPU-Engpass überspringt die Renderskala, Schonzeit, Einzelhänger, GPU-Zeit-Abfrage, Anschluss in quality.js,
// Start-Kurzmessung und Gerätespeicher.
import { GrafikAutopilot, GpuZeit, gestutztesMittel } from '../../src/gfx/kern/autopilot.js';
import { skalaAusProbe, kennzahlen, ladeGeraet, merkeGeraet, geraeteSchluessel, messeBilder } from '../../src/gfx/kern/startprobe.js';
import { Quality } from '../../src/gfx/quality.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
globalThis.window = globalThis.window || { devicePixelRatio: 2.6 };
const TAKT = 1000 / 60;

// ---------- simuliertes Gerät ----------
// GPU-Zeit = (fest + Pixel × Skala²) × Stufenfaktor × Last(t) + Deko + Schatten; CPU-Zeit = fest + Deko-Draw-Calls.
// Bildabstand: Vsync 60 Hz; reicht die Zeit nicht, dreifach gepuffert (keine harte Halbierung) oder hart quantisiert.
function geraet(o = {}) {
  return { gpuFix: 2, gpuPix: 10, cpu: 4, deko: 1.6, dekoCpu: 1.2, schatten: 1.2, stufeK: [0.45, 0.7, 1], gpuTimer: true, quant: false, verzug: 2, ...o };
}
function lauf(G, sek, last = () => 1, opts = {}) {
  const st = { skala: opts.skala0 ?? 1, deko: 1, schatten: 1, stufe: 2 };
  const ranges = opts.ranges || [[0.6, 1, 1], [0.62, 0.92, 0.84], [0.7, 1, 1]];
  const [lo, hi] = ranges[2];
  const ap = new GrafikAutopilot({ skala: { min: lo, max: hi, start: st.skala, setzen: (s) => { st.skala = s; } }, einstellungen: opts.einst });
  ap.register('deko', 0.08, (s) => { st.deko = s; });
  ap.register('autoschatten', 0.06, (s) => { st.schatten = s; });
  ap.register('stufe', 0.3, (s, r) => { st.stufe = s; const [a, b, c] = ranges[s]; return { skala: [a, b, r < 0 ? c : a] }; }, { stufen: 2, start: 2, raufBeiSkalaMax: true });
  const gq = [];
  let t = 0;
  const spur = [];
  while (t < sek) {
    const L = last(t);
    const gpu = ((G.gpuFix + G.gpuPix * st.skala * st.skala) * G.stufeK[st.stufe] * L) + (st.deko ? G.deko : 0) + (st.schatten ? G.schatten : 0);
    const cpu = G.cpu * (opts.cpuLast ? opts.cpuLast(t) : 1) + (st.deko ? G.dekoCpu : 0);
    let w = Math.max(gpu, cpu);
    if (opts.spike && opts.spike(t)) w += 80;
    const iv = w <= TAKT ? TAKT : G.quant ? Math.ceil(w / TAKT) * TAKT : w;
    gq.push(gpu);
    const gpuSeen = G.gpuTimer && gq.length > G.verzug ? gq[gq.length - 1 - G.verzug] : null;
    const dt = iv / 1000;
    ap.bild(dt, cpu, gpuSeen);
    t += dt;
    spur.push({ t, fps: 1000 / iv, ...st });
  }
  return { ap, st, spur };
}
const firstChangeAfter = (ap, t0) => { const e = ap.log.find((x) => x.t >= t0); return e ? e.t - t0 : Infinity; };
const changesBetween = (ap, a, b) => ap.log.filter((x) => x.t >= a && x.t < b).length;
// Bildrate im Zeitraum = Bilder / Zeit (nicht Mittel der Einzel-fps)
const meanFps = (spur, a, b) => { const s = spur.filter((x) => x.t >= a && x.t < b); return s.length ? s.length / (s[s.length - 1].t - s[0].t + 1000 / s[0].fps / 1000) : 0; };

// 1. Hilfsfunktion
ok(Math.abs(gestutztesMittel([10, 10, 10, 10, 10, 10, 10, 10, 10, 200], 0.1) - 10) < 1e-9, 'gestutztes Mittel verwirft den Einzelhänger');

// 2. Leichte Szene: nichts ändern (Kino, Skala 1)
{
  const { ap, st } = lauf(geraet(), 30);
  ok(ap.aenderungen === 0 && st.skala === 1 && st.stufe === 2, `leichte Szene (GPU ≈ ${(2 + 10 + 1.6 + 1.2).toFixed(1)} ms): keine Änderung (${ap.aenderungen})`);
}

// 3. Last springt bei t = 10 s auf das 1,8-Fache (Looping), bei t = 40 s zurück → runter ≤ 3 s, wieder rauf
for (const gpuTimer of [true, false]) {
  const name = gpuTimer ? 'mit GPU-Zeit' : 'ohne GPU-Zeit';
  const { ap, spur } = lauf(geraet({ gpuTimer }), 90, (t) => (t >= 10 && t < 40 ? 1.8 : 1));
  const re = firstChangeAfter(ap, 10);
  ok(re <= 3, `${name}: Last ×1,8 bei 10 s → erster Schritt nach ${re.toFixed(2)} s (≤ 3 s)`);
  const fpsLast = meanFps(spur, 20, 40);
  ok(fpsLast >= 52, `${name}: unter Last nach 10 s wieder flüssig (${fpsLast.toFixed(1)} fps)`);
  const s25 = spur.find((x) => x.t >= 30);
  ok(s25.stufe === 2, `${name}: Stufe Kino bleibt (Renderskala reicht, Skala ${s25.skala})`);
  const up = firstChangeAfter(ap, 40);
  ok(up <= (gpuTimer ? 3.5 : 4.5), `${name}: Last weg bei 40 s → erster Schritt rauf nach ${up.toFixed(2)} s`);
  const end = spur[spur.length - 1];
  ok(end.skala >= 0.98 && end.deko === 1 && end.schatten === 1 && end.stufe === 2, `${name}: am Ende wieder volle Qualität (Skala ${end.skala}, Deko ${end.deko}, Schatten ${end.schatten}, Stufe ${end.stufe})`);
  ok(changesBetween(ap, 20, 40) <= (gpuTimer ? 0 : 3), `${name}: unter gleichbleibender Last ruhig (${changesBetween(ap, 20, 40)} Änderungen in 20 s)`);
}

// 4. Pendel-Test: Last genau an der Kante (ohne GPU-Zeit muss er nach oben tasten) → Sperre verhindert Pendeln
{
  // Last so, dass Skala ~0,86 gerade 60 fps schafft, 0,9 nicht mehr
  const G = geraet({ gpuTimer: false, gpuPix: 13.5, gpuFix: 1.5 });
  const { ap, spur } = lauf(G, 180);
  const n1 = changesBetween(ap, 0, 60), n2 = changesBetween(ap, 60, 180);
  ok(n2 <= 4, `ohne GPU-Zeit an der Kante: ${n1} Änderungen in der 1. Minute, ${n2} in den 2 Minuten danach (≤ 4, Sperre ${ap.sperreDauer} s)`);
  const fps = meanFps(spur, 60, 180);
  ok(fps >= 55, `… und dabei im Mittel flüssig (${fps.toFixed(1)} fps)`);
  const G2 = geraet({ gpuTimer: true, gpuPix: 13.5, gpuFix: 1.5 });
  const r2 = lauf(G2, 180);
  ok(changesBetween(r2.ap, 30, 180) <= 1, `mit GPU-Zeit an der Kante: ${changesBetween(r2.ap, 30, 180)} Änderungen nach 30 s (≤ 1)`);
}
// harte Vsync-Halbierung (30/60 springt) – auch da kein Dauerpendeln
{
  const { ap } = lauf(geraet({ gpuTimer: false, quant: true, gpuPix: 13.5, gpuFix: 1.5 }), 180);
  ok(changesBetween(ap, 60, 180) <= 4, `Vsync hart quantisiert, an der Kante: ${changesBetween(ap, 60, 180)} Änderungen in 2 Minuten (≤ 4)`);
}

// 5. Reihenfolge: Renderskala → Deko → Auto-Schatten → Stufe; hoch dann rückwärts
{
  const { ap, spur } = lauf(geraet(), 120, (t) => (t < 60 ? 3.2 : 1));
  const seq = ap.log.filter((e) => e.richtung < 0).map((e) => e.was);
  const firstDeko = seq.indexOf('deko'), lastSkala = seq.lastIndexOf('skala', firstDeko < 0 ? seq.length : firstDeko);
  ok(seq[0] === 'skala' && firstDeko > lastSkala && seq.indexOf('autoschatten') > firstDeko, `sehr schwere Last: Reihenfolge runter ${seq.join(' → ')}`);
  const s59 = spur.find((x) => x.t >= 59);
  ok(s59.stufe < 2, `Last ×3,2: Stufe sinkt am Ende (Stufe ${s59.stufe}, Skala ${s59.skala})`);
  const ups = ap.log.filter((e) => e.richtung > 0).map((e) => e.was);
  const end = spur[spur.length - 1];
  ok(end.stufe === 2 && end.deko === 1 && end.schatten === 1, `Last wieder normal: Stufe/Deko/Schatten zurück (${ups.join(' → ')})`);
  const iStufe = ups.indexOf('stufe'), iSch = ups.indexOf('autoschatten'), iDeko = ups.indexOf('deko');
  ok(iStufe >= 0 && iStufe < iSch && iSch < iDeko, 'rauf in umgekehrter Reihenfolge (Stufe vor Schatten vor Deko)');
}

// 6. CPU-Engpass: GPU hat Luft, CPU nicht → Renderskala bleibt, Deko geht
{
  const { ap, st } = lauf(geraet({ cpu: 16.5, dekoCpu: 1.5, gpuPix: 4 }), 20);
  const first = ap.log[0];
  ok(first && first.was === 'deko' && st.skala === 1, `CPU-gebunden: erster Schritt ${first && first.was}, Skala bleibt ${st.skala}`);
}

// 7. Schonzeit + Einzelhänger
{
  const { ap } = lauf(geraet(), 20, () => 1, { spike: (t) => t < 1.2 });
  ok(ap.aenderungen === 0, `Hänger in der Schonzeit (Shader-Übersetzen) ändern nichts (${ap.aenderungen})`);
  let k = 0;
  const r = lauf(geraet(), 30, () => 1, { spike: () => (++k % 60 === 0) });
  ok(r.ap.aenderungen === 0, `ein 80-ms-Hänger je Sekunde (Müllabfuhr) ändert nichts (${r.ap.aenderungen})`);
}

// 8. Startwert aus der Kurzmessung: kein Ruckeln in den ersten 10 s
{
  const G = geraet({ gpuPix: 18, gpuFix: 2 });
  const kalt = lauf(G, 12, () => 1, { skala0: 1 });
  const probeMs = (G.gpuFix + G.gpuPix) + G.deko + G.schatten;   // Messung bei Skala 1
  const s0 = skalaAusProbe(probeMs, { min: 0.7, max: 1, aktuell: 1 });
  const warm = lauf(G, 12, () => 1, { skala0: s0 });
  const fk = meanFps(kalt.spur, 0, 10), fw = meanFps(warm.spur, 0, 10);
  ok(fw >= 58 && fw > fk, `Start mit Probe-Skala ${s0}: erste 10 s ${fw.toFixed(1)} fps (ohne Probe ${fk.toFixed(1)})`);
  ok(changesBetween(warm.ap, 0, 10) <= 1, `… höchstens 1 Änderung in den ersten 10 s (${changesBetween(warm.ap, 0, 10)})`);
}

// 9. Stufe ohne GPU-Zeit erst unter 45 fps (wie bisher)
{
  const { spur } = lauf(geraet({ gpuTimer: false }), 60, () => 2.0);
  const end = spur[spur.length - 1];
  const fps = meanFps(spur, 40, 60);
  ok(end.stufe === 2 || fps >= 45, `ohne GPU-Zeit, mäßig schwer: Kino bleibt, solange ≥ 45 fps (Stufe ${end.stufe}, ${fps.toFixed(1)} fps)`);
}

// 10. GpuZeit mit nachgebautem WebGL2-Kontext
{
  const E = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
  let disjoint = false, ready = new Set(), id = 0;
  const gl = { QUERY_RESULT_AVAILABLE: 10, QUERY_RESULT: 11,
    getExtension: (n) => (n === 'EXT_disjoint_timer_query_webgl2' ? E : null),
    createQuery: () => ({ id: ++id }), deleteQuery() {}, beginQuery() {}, endQuery() {},
    getParameter: (p) => (p === 2 ? disjoint : null),
    getQueryParameter: (q, p) => (p === 10 ? ready.has(q) : 7.5e6) };
  const g = new GpuZeit(gl);
  g.anfang(); g.ende();
  ok(g.ok && g.ms === null, 'GPU-Zeit: Ergebnis kommt verzögert (erst null)');
  ready.add(g.offen[0]); g.anfang(); g.ende();
  ok(g.ms === 7.5, `GPU-Zeit: nach Verfügbarkeit 7,5 ms (${g.ms})`);
  disjoint = true; ready.add(g.offen[0]); g.ms = null; g.anfang(); g.ende();
  ok(g.ms === null && g.verworfen >= 1, 'GPU-Zeit: „disjoint“ wird verworfen');
  for (let i = 0; i < 20; i++) { g.anfang(); g.ende(); }
  ok(g.offen.length <= 6, `GPU-Zeit: hängende Abfragen begrenzt (${g.offen.length})`);
  const g0 = new GpuZeit({ getExtension: () => null });
  g0.anfang(); g0.ende();
  ok(!g0.ok && g0.ms === null, 'ohne Erweiterung: ok = false, keine Fehler');
}

// 11. Start-Kurzmessung + Gerätespeicher
{
  ok(skalaAusProbe(6, { min: 0.7, max: 1 }) === 1, 'Probe 6 ms → Skala 1');
  ok(skalaAusProbe(30, { min: 0.7, max: 1 }) === 0.7, 'Probe 30 ms → Minimum 0,7');
  const s = skalaAusProbe(18, { min: 0.6, max: 1 });
  ok(s > 0.8 && s < 0.9, `Probe 18 ms → ${s}`);
  ok(skalaAusProbe(NaN, { min: 0.7, max: 1 }) === 1, 'keine Messung → Maximum (Autopilot regelt nach)');
  const k = kennzahlen([5, 6, 7, 8, 100, 6, 6, 7]);
  ok(k.median === 6 || k.median === 7, `Median robust (${k.median})`);
  const mem = new Map(); const st = { getItem: (x) => mem.get(x) ?? null, setItem: (x, v) => mem.set(x, v) };
  const key = geraeteSchluessel({ RENDERER: 1, getExtension: () => null, getParameter: () => 'Adreno 640' }, { w: 412, h: 915, dpr: 2.625 });
  const key2 = geraeteSchluessel({ RENDERER: 1, getExtension: () => null, getParameter: () => 'Adreno 640' }, { w: 915, h: 412, dpr: 2.625 });
  ok(key === key2, `Geräteschlüssel unabhängig vom Drehen (${key})`);
  ok(ladeGeraet(st, key) === null, 'nichts gespeichert → null');
  merkeGeraet(st, key, { skala: 0.82, stufe: 2 }, { jetzt: 1000 });
  ok(ladeGeraet(st, key, { jetzt: 2000 }).skala === 0.82, 'gespeicherte Skala wird geladen');
  ok(ladeGeraet(st, key, { jetzt: 1000 + 30 * 864e5 }) === null, 'nach 30 Tagen neu messen');
  mem.set('grafikKern.' + key, '{kaputt'); ok(ladeGeraet(st, key) === null, 'kaputter Eintrag → null');
  ok(merkeGeraet({ setItem: () => { throw new Error('voll'); } }, key, { skala: 1 }) === false, 'Speicher voll → kein Absturz');
  let n = 0;
  const fake = { readPixels: () => {}, RGBA: 1, UNSIGNED_BYTE: 2 };
  let clock = 0;
  const r = await messeBilder(() => { n++; clock += n <= 4 ? 50 : 9; }, fake, { raf: (f) => f(), jetzt: () => clock, bilder: 20, vorlauf: 4 });
  ok(n === 24 && r.n === 20 && r.median === 9, `messeBilder: 4 Vorlauf + 20 Messbilder, Median ${r.median} ms (Vorlauf mit Shader-Übersetzen zählt nicht)`);
}

// 12. Anschluss in quality.js (Autopilot-Weg): Unschärfe zuerst, dann Renderskala im Kino-Look, Deko, Auto-Schatten, Stufe
{
  const ranges = { 0: [1, 0.6, 1], 1: [0.84, 0.62, 0.92], 2: [1, 0.7, 1] };
  const kino = { pipeline: true, stages: { scale: true }, level: 2, renderScale: 1, scaleRange: ranges[2],
    setLevel(l) { if (l === this.level) return; this.level = l; this.scaleRange = ranges[l]; this.renderScale = ranges[l][0]; this.pipeline = l > 0; },
    scaleRangeOf: (l) => ranges[l] };
  const q = new Quality({}, null, { autopilot: true });
  q.post = { active: false, autoOff: false }; q.kino = kino;
  let resizes = 0;
  q.startAutopilot({ skala: 1 });
  ok(q.ap && q.ap.skala === 1 && q.tier === 2, 'Autopilot startet auf Kino mit Skala 1');
  // Kosten-Modell: GPU-Zeit nach Zustand
  const gpuOf = (L) => ((2 + 10 * kino.renderScale ** 2) * [0.45, 0.7, 1][q.tier] * L) + (q.decoLite ? 0 : 1.6) + (q.carShadowSize() ? 1.2 : 0);
  const step = (L, sek, blur = false) => {
    let t = 0;
    while (t < sek) {
      const g = gpuOf(L); const iv = Math.max(TAKT, g);
      q.post.active = blur && !q.post.autoOff;
      q.gpu = { ms: g };
      q.sample(iv / 1000, () => resizes++, 4);
      t += iv / 1000;
    }
  };
  step(1, 3, true);
  ok(!q.post.autoOff, 'leicht mit Unschärfe: Unschärfe bleibt');
  step(1.7, 6, true);
  ok(q.post.autoOff && (!q.ap.log.length || q.ap.log[0].was === 'vorab'), `Ruckeln mit Unschärfe: zuerst die Unschärfe aus (Schritte: ${q.ap.log.map((e) => e.was).join(',') || '–'})`);
  step(1.7, 10);
  ok(kino.renderScale < 1 && q.tier === 2 && !q.decoLite, `danach Renderskala im Kino-Look (${kino.renderScale}), Kino und Deko bleiben`);
  step(4, 40);
  ok(q.decoLite && q.carShadowSize() === 0, `sehr schwer: Deko sparsam und Auto-Schatten aus (Stufe ${q.tier})`);
  ok(q.tier < 2 && kino.level === q.tier, `… und Stufe tiefer, Kino-Look folgt sofort (Stufe ${q.tier}, Look ${kino.level}, Skala ${kino.renderScale})`);
  step(0.6, 90);
  ok(q.tier === 2 && !q.decoLite && q.carShadowSize() > 0, `Last weg: wieder Kino, Deko und Auto-Schatten an (Skala ${kino.renderScale}, Log ${q.ap.log.filter((e) => e.richtung > 0).map((e) => e.was).join('→')})`);
  ok(resizes > 0, `Änderungen lösen resize() aus (${resizes})`);
  // feste Nutzerwahl → kein Autopilot
  // Startwert der Kurzmessung kommt sofort beim Kino-Look an
  {
    const q5 = new Quality({}, null, { autopilot: true }); q5.post = { active: false, autoOff: true }; q5.kino = kino; kino.setLevel(2); kino.renderScale = 1;
    q5.startAutopilot({ skala: 0.8 });
    ok(Math.abs(kino.renderScale - 0.8) < 1e-9 && q5.ap.skala === 0.8, `Start-Skala 0,8 aus der Kurzmessung → Kino-Look rendert mit ${kino.renderScale}`);
    q5.startAutopilot({ skala: 0.3 });
    ok(kino.renderScale === 0.7, `Start-Skala unter dem Minimum der Stufe → geklemmt (${kino.renderScale})`);
  }
  // Nutzerwahl mitten im Betrieb: vom Autopiloten Abgeschaltetes (auch Spiel-Dinge wie die Lack-Spiegelung) wieder an
  {
    let reflexOff = false;
    const q4 = new Quality({}, null, { autopilot: true }); q4.post = { active: false, autoOff: true }; q4.kino = kino; kino.setLevel(2);
    q4.startAutopilot({ skala: 1, extra: [['reflex', 0.06, (s) => { reflexOff = s === 0; }]] });
    for (let i = 0; i < 30 * 40; i++) { q4.gpu = { ms: 40 }; q4.sample(1 / 25, () => {}, 4); }
    const vorher = reflexOff && q4.decoLite;
    q4.forced = '2'; q4.tier = 2; q4.sample(1 / 60, () => {}, 4);
    ok(vorher && !reflexOff && !q4.decoLite && q4.carShadowSize() > 0, `feste Wahl nach Autopilot-Abschaltungen: Spiegelung, Deko, Auto-Schatten wieder an (vorher aus: ${vorher})`);
  }
  const q2 = new Quality({}, '1', { autopilot: true }); q2.post = { active: false, autoOff: true }; q2.kino = kino; kino.setLevel(1);
  q2.startAutopilot({ skala: 1 });
  for (let i = 0; i < 25 * 20; i++) { q2.gpu = { ms: 40 }; q2.sample(1 / 25, () => {}, 4); }
  ok(q2.ap.aenderungen === 0 && q2.tier === 1 && !q2.decoLite, `feste Grafikstufe (Nutzerwahl): Autopilot greift nicht (Stufe ${q2.tier})`);
  q2.forced = null;   // Einstellung zurück auf „Automatisch“
  for (let i = 0; i < 25 * 10; i++) { q2.gpu = { ms: 40 }; q2.sample(1 / 25, () => {}, 4); }
  ok(q2.ap.aenderungen > 0 && q2.ap.ding('stufe').stufe === q2.tier, `zurück auf Automatisch: Autopilot setzt auf Stufe ${q2.tier} neu auf (${q2.ap.aenderungen} Schritte)`);
  // ?autopilot=0: alter Weg unverändert
  const q3 = new Quality({}, null); q3.post = { active: false, autoOff: true };
  q3.startAutopilot && q3.startAutopilot({ skala: 1 });
  ok(!q3.ap, 'ohne Option (?autopilot=0): alte Automatik');
}

// 13. Enge Schattenkamera fürs Auto (E1): 1024 auf Kino, ±3,6 m, Versatz in Metern wie bisher; ?schattenkam=0 = alt
{
  const mk = (o) => {
    const q = new Quality({}, null, o);
    const cam = { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 140, updateProjectionMatrix() {} };
    const sun = { castShadow: true, shadow: { mapSize: { x: 1024, set(a) { this.x = a; } }, camera: cam, bias: -0.0004 } };
    q.apply(sun);
    return { size: q.carShadowSize(), r: cam.right, tiefe: cam.far - cam.near, biasM: -sun.shadow.bias * (cam.far - cam.near), texel: (2 * cam.right) / q.carShadowSize() };
  };
  const e = mk({}), a = mk({ tightShadow: false });
  ok(e.size === 1024 && a.size === 2048, `Kino: Auto-Schattenkarte 1024 statt 2048 (alt ${a.size})`);
  ok(e.texel <= a.texel * 1.06, `Texel ${(e.texel * 1000).toFixed(1)} mm (bisher ${(a.texel * 1000).toFixed(1)} mm) – nicht gröber`);
  ok(Math.abs(e.biasM - a.biasM) < 0.002, `Schatten-Versatz in Metern gleich (${(e.biasM * 100).toFixed(1)} cm / ${(a.biasM * 100).toFixed(1)} cm)`);
  ok(e.r >= 3.4, `Box ±${e.r} m deckt die Auto-Silhouette (halbe Diagonale ~2,6 m) mit Rand`);
}

// n30-Heavy: Bildrate von außen auf 30 Hz gedeckelt (Energiesparmodus), Arbeit nur 5 ms → nicht herunterregeln;
// ohne GPU-Zeit bleibt die alte Regel (Bildrate)
{
  const ap = new GrafikAutopilot({ skala: { min: 0.7, max: 1, start: 1 } });
  ap.register('deko', 0.08, () => {});
  for (let k = 0; k < 30 * 20; k++) ap.bild(1 / 30, 3, 5);
  ok(ap.aenderungen === 0 && ap.zustand().gedeckelt, `30 Hz gedeckelt, Arbeit 5 ms: 20 s ohne Änderung (${ap.aenderungen}), gedeckelt erkannt`);
  const ap2 = new GrafikAutopilot({ skala: { min: 0.7, max: 1, start: 1 } });
  for (let k = 0; k < 30 * 5; k++) ap2.bild(1 / 30, 3, 31);
  ok(ap2.aenderungen > 0, `30 Hz, Arbeit 31 ms (echt zu langsam): regelt herunter (${ap2.aenderungen})`);
}
console.log(bad ? `${bad} FEHLER` : 'alle Autopilot-Prüfungen OK');
process.exit(bad ? 1 : 0);
