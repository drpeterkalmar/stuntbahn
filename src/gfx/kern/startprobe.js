// Grafik-Kern, Baustein 2 (n30): Start-Kurzmessung + Gerätespeicher – reine Logik bis auf messeBilder() (braucht rAF).
// Idee: Im Ladebildschirm die fertige Szene ~20 Bilder lang zeichnen und jedes Bild mit einem 1-Pixel-readPixels
// abschließen (zwingt die GPU, fertig zu werden) → echte Arbeitszeit je Bild. Daraus die Renderskala für den Start, damit
// das Ruckeln der ersten 5–10 s wegfällt, bis die Automatik nachgeregelt hätte. Ergebnis je Gerät in localStorage: beim
// nächsten Start wird nicht neu gemessen, sondern der zuletzt gelernte Wert genommen (Autopilot speichert nach).
//
// Anschluss:
//   const key = geraeteSchluessel(renderer.getContext(), { w: screen.width, h: screen.height, dpr: devicePixelRatio });
//   let start = ladeGeraet(localStorage, key);                       // { skala, stufe, t } oder null
//   if (!start) { const ms = await messeBilder(() => render(1 / 60), gl, { bilder: 20 });
//                 start = { skala: skalaAusProbe(ms.median, { min: 0.7, max: 1, aktuell: 1 }) }; }
//   … später bei jeder Autopilot-Änderung: merkeGeraet(localStorage, key, { skala, stufe })

export const PROBE_STANDARD = { bilder: 20, vorlauf: 4, zielFps: 60, anteil: 0.82, raster: 0.05, szenenFaktor: 1.0, maxAlterTage: 21, version: 1 };

// Median und p90 einer Zahlenreihe
export function kennzahlen(ms) {
  const a = ms.filter((x) => Number.isFinite(x) && x >= 0).sort((x, y) => x - y);
  if (!a.length) return { n: 0, median: NaN, p90: NaN };
  const q = (p) => a[Math.min(a.length - 1, Math.floor(p * (a.length - 1) + 0.5))];
  return { n: a.length, median: q(0.5), p90: q(0.9), min: a[0], max: a[a.length - 1] };
}

// Renderskala aus der gemessenen Arbeitszeit (ms je Bild bei Skala `aktuell`). Pixelkosten ~ Skala²; ein fester Anteil
// (Geometrie, CPU) skaliert nicht mit → konservativ: ganze Zeit als pixelabhängig gerechnet, gerastert, geklemmt.
// szenenFaktor: Verhältnis „Rennen / Probe-Szene“ (Menü). TODO n30-Heavy: am Gerät/headless abstimmen (Startwert 1,0).
export function skalaAusProbe(arbeitMs, o = {}) {
  const P = { ...PROBE_STANDARD, min: 0.6, max: 1, aktuell: 1, ...o };
  if (!(arbeitMs > 0)) return P.max;
  const ziel = (1000 / P.zielFps) * P.anteil;
  const s = P.aktuell * Math.sqrt(ziel / (arbeitMs * P.szenenFaktor));
  const r = Math.floor(s / P.raster + 1e-9) * P.raster;   // abrunden: lieber etwas zu scharf vorsichtig als Ruckeln
  return +Math.max(P.min, Math.min(P.max, r)).toFixed(3);
}

// FNV-1a, 32 bit → kurzer Schlüssel
export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
// Geräteschlüssel aus GPU-Name, Bildschirm und Pixeldichte (anderes Gerät/Monitor → neu messen)
export function geraeteSchluessel(gl, o = {}) {
  let gpu = '';
  try {
    if (gl) {
      const dbg = gl.getExtension && gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    }
  } catch (e) { gpu = ''; }
  const w = Math.max(o.w || 0, o.h || 0), h = Math.min(o.w || 0, o.h || 0);   // Drehen ändert nichts
  return 'g' + PROBE_STANDARD.version + '_' + fnv(`${gpu}|${w}x${h}|${(+o.dpr || 1).toFixed(2)}`);
}

const SPEICHER_PREFIX = 'grafikKern.';
export function ladeGeraet(storage, schluessel, o = {}) {
  const maxAlter = (o.maxAlterTage ?? PROBE_STANDARD.maxAlterTage) * 864e5, jetzt = o.jetzt ?? Date.now();
  try {
    const raw = storage && storage.getItem(SPEICHER_PREFIX + schluessel);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d.skala !== 'number' || !(d.skala > 0 && d.skala <= 1.5)) return null;
    if (!(jetzt - (d.t || 0) < maxAlter)) return null;
    return d;
  } catch (e) { return null; }
}
export function merkeGeraet(storage, schluessel, daten, o = {}) {
  try {
    if (!storage) return false;
    storage.setItem(SPEICHER_PREFIX + schluessel, JSON.stringify({ ...daten, t: o.jetzt ?? Date.now() }));
    return true;
  } catch (e) { return false; }   // privater Modus, Speicher voll
}

// Probe: `zeichnen()` je Bild aufrufen, mit readPixels auf die GPU warten, Zeiten sammeln. Läuft über rAF (Ladebalken
// bleibt lebendig). Liefert kennzahlen() der Messbilder (Vorlauf-Bilder mit Shader-Übersetzen zählen nicht).
export async function messeBilder(zeichnen, gl, o = {}) {
  const P = { ...PROBE_STANDARD, ...o };
  const raf = o.raf || ((f) => requestAnimationFrame(f));
  const jetzt = o.jetzt || (() => performance.now());
  const px = new Uint8Array(4), ms = [];
  for (let i = 0; i < P.vorlauf + P.bilder; i++) {
    await new Promise((r) => raf(r));
    const t0 = jetzt();
    zeichnen(i);
    if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (i >= P.vorlauf) ms.push(jetzt() - t0);
  }
  return kennzahlen(ms);
}
