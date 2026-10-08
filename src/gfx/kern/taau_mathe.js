// Grafik-Kern (n31): TAAU – reine Mathematik, ohne three.js, ohne DOM. In Node testbar (tests/node/test_taau.mjs).
// Der Shader in kern/taau.js rechnet dasselbe; die CPU-Fassung hier (taauReferenz) ist die Vorlage dafür und belegt im Test,
// dass Jitter + Rekonstruktion + Clip das Bild über die Zeit auf das Zielraster bringen (Hochskalieren, nicht nur Glätten).
//
// Begriffe:
//   Renderskala s: Szene wird in sw × sh = s · (w × h) gezeichnet, das Endbild (History) hat w × h.
//   Jitter j: Versatz der Projektion in RENDER-Pixeln, j ∈ [−0,5; 0,5)². Der Render-Pixel k (ganzzahlig) zeigt dann den
//   Szenenpunkt an der (unverschobenen) Render-Pixel-Koordinate k + 0,5 − j. In Endbild-Pixeln ist der Jitter j / s groß
//   („Jitter-Betrag skaliert mit der Renderskala“), so landen die Abtastungen über die Zeit auf allen Zielpixeln.

// ---------- Jitter ----------
// Halton-Folge (Radikal-Inverse) zur Basis b, Index i ≥ 1
export function halton(i, b) {
  let f = 1, r = 0;
  while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); }
  return r;
}
// n Versätze aus Halton(2, 3), zentriert auf [−0,5; 0,5). Index ab 1 (Index 0 wäre (0,0) – genau der Pixelmittelpunkt)
export function jitterFolge(n) {
  const a = [];
  for (let i = 1; i <= n; i++) a.push([halton(i, 2) - 0.5, halton(i, 3) - 0.5]);
  return a;
}
// Länge der Folge: genug Phasen, dass bei Renderskala s jedes Zielpixel getroffen wird (Faustregel ≈ 8 / s²)
// muster: 'auto' | '8' | '16' | '32' | '0' (aus, zum Vergleich) – URL ?jit=
export function jitterAnzahl(skala, muster = 'auto') {
  const m = String(muster ?? 'auto');
  if (m === '0') return 0;
  if (/^\d+$/.test(m)) return Math.max(1, Math.min(64, +m));
  const s = Math.max(0.3, Math.min(1, +skala || 1));
  return 8 / (s * s) <= 8.5 ? 8 : 8 / (s * s) <= 16.5 ? 16 : 32;
}
// Versatz für Bild nr (läuft endlos), in Render-Pixeln
export function jitterVersatz(nr, anzahl, folge = null) {
  if (!anzahl) return [0, 0];
  const f = folge && folge.length === anzahl ? folge : jitterFolge(anzahl);
  return f[((nr % anzahl) + anzahl) % anzahl];
}

// ---------- Matrizen (spaltenweise wie three.js: e[spalte * 4 + zeile]) ----------
// Projektion um (jx, jy) Render-Pixel verschieben: Zeile 0/1 += δ · Zeile 3 mit δ = 2 j / Größe (NDC). Gilt für
// perspektivische (Zeile 3 = (0,0,−1,0)) und orthografische (Zeile 3 = (0,0,0,1)) Matrizen, auch mit setViewOffset.
export function jitterProjektion(e, jx, jy, sw, sh) {
  const dx = 2 * jx / sw, dy = 2 * jy / sh;
  for (let c = 0; c < 4; c++) { e[c * 4] += dx * e[c * 4 + 3]; e[c * 4 + 1] += dy * e[c * 4 + 3]; }
  return e;
}
export function mat4Mul(a, b, out = new Array(16)) {
  const r = new Array(16);
  for (let c = 0; c < 4; c++) for (let z = 0; z < 4; z++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + z] * b[c * 4 + k];
    r[c * 4 + z] = s;
  }
  for (let i = 0; i < 16; i++) out[i] = r[i];
  return out;
}
export function mat4Vec(m, v) {
  const o = [0, 0, 0, 0];
  for (let z = 0; z < 4; z++) o[z] = m[z] * v[0] + m[4 + z] * v[1] + m[8 + z] * v[2] + m[12 + z] * v[3];
  return o;
}
// Inverse (allgemein, Gauß-Jordan) – nur für Tests/Werkzeuge; im Spiel rechnet three.js
export function mat4Inv(m) {
  const a = [];
  for (let z = 0; z < 4; z++) { a.push([]); for (let c = 0; c < 4; c++) a[z].push(m[c * 4 + z]); for (let c = 0; c < 4; c++) a[z].push(z === c ? 1 : 0); }
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let z = c + 1; z < 4; z++) if (Math.abs(a[z][c]) > Math.abs(a[p][c])) p = z;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    const d = a[c][c];
    for (let k = 0; k < 8; k++) a[c][k] /= d;
    for (let z = 0; z < 4; z++) if (z !== c) { const f = a[z][c]; for (let k = 0; k < 8; k++) a[z][k] -= f * a[c][k]; }
  }
  const o = new Array(16);
  for (let z = 0; z < 4; z++) for (let c = 0; c < 4; c++) o[c * 4 + z] = a[z][4 + c];
  return o;
}
// Perspektive wie THREE.PerspectiveCamera.updateProjectionMatrix (ohne Zoom/Film-Versatz)
export function perspektive(fovGrad, aspekt, near, far) {
  const top = near * Math.tan(Math.PI / 180 * 0.5 * fovGrad), h = 2 * top, w = aspekt * h, left = -0.5 * w;
  const x = 2 * near / w, y = 2 * near / h, a = (2 * left + w) / w, b = 0, c = -(far + near) / (far - near), d = -2 * far * near / (far - near);
  return [x, 0, 0, 0, 0, y, 0, 0, a, b, c, -1, 0, 0, d, 0];
}
// Reprojektion eines Bildpunkts: uv (unverschoben, 0…1) + Tiefe d (0…1) mit invVP (aktuell) → Welt → prevVP → uv im Vorbild
// und erwartete lineare Tiefe dort (clip.w). koerper = optional Matrix „vorige Welt · aktuelle Inverse“ (bewegtes Objekt)
export function reprojiziere(uv, d, invVP, prevVP, koerper = null) {
  let w = mat4Vec(invVP, [uv[0] * 2 - 1, uv[1] * 2 - 1, d * 2 - 1, 1]);
  w = [w[0] / w[3], w[1] / w[3], w[2] / w[3], 1];
  if (koerper) w = mat4Vec(koerper, w);
  const p = mat4Vec(prevVP, w);
  return { uv: [p[0] / p[3] * 0.5 + 0.5, p[1] / p[3] * 0.5 + 0.5], z: p[3], welt: w.slice(0, 3) };
}
// lineare Tiefe (Abstand entlang der Blickachse) aus dem Tiefenpuffer-Wert, perspektivisch
export function linZ(d, near, far) { return near * far / (far - d * (far - near)); }

// ---------- Farbe ----------
export function rgb2ycocg(c) { return [0.25 * c[0] + 0.5 * c[1] + 0.25 * c[2], 0.5 * c[0] - 0.5 * c[2], -0.25 * c[0] + 0.5 * c[1] - 0.25 * c[2]]; }
export function ycocg2rgb(c) { const t = c[0] - c[2]; return [t + c[1], c[0] + c[2], t - c[1]]; }
// History in die Box [mn, mx] CLIPPEN (Richtung Boxmitte, nicht komponentenweise klemmen – sonst Farbstich), Playdead/INSIDE
export function clipAabb(h, mn, mx) {
  const c = [0, 0, 0], e = [0, 0, 0], v = [0, 0, 0];
  let m = 0;
  for (let i = 0; i < 3; i++) {
    c[i] = 0.5 * (mx[i] + mn[i]); e[i] = 0.5 * (mx[i] - mn[i]) + 1e-5; v[i] = h[i] - c[i];
    m = Math.max(m, Math.abs(v[i] / e[i]));
  }
  return m > 1 ? [c[0] + v[0] / m, c[1] + v[1] / m, c[2] + v[2] / m] : h.slice();
}
// Varianz-Box aus Momenten (Mittel μ, Streuung σ) mit Faktor gamma, geschnitten mit Min/Max der Nachbarschaft
export function varianzBox(werte, gamma = 1.0) {
  const n = werte.length, mu = [0, 0, 0], m2 = [0, 0, 0], lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const w of werte) for (let i = 0; i < 3; i++) { mu[i] += w[i]; m2[i] += w[i] * w[i]; lo[i] = Math.min(lo[i], w[i]); hi[i] = Math.max(hi[i], w[i]); }
  const mn = [0, 0, 0], mx = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    mu[i] /= n;
    const sg = Math.sqrt(Math.max(0, m2[i] / n - mu[i] * mu[i]));
    mn[i] = Math.max(lo[i], mu[i] - gamma * sg); mx[i] = Math.min(hi[i], mu[i] + gamma * sg);
  }
  return { mn, mx, mu };
}

// ---------- Gewichte ----------
export const TAAU_STANDARD = {
  // Startwerte aus dem Parameter-Raster der CPU-Simulation (tests/node/test_taau.mjs, Zaun bei 0,65): Fehler gegen
  // Supersampling-Bezug 0,020 (1,0 + MSAA 4: 0,016; 0,65 bilinear: 0,049). Am echten Bild nachstimmen (TODO Heavy-Job)
  gewicht: 0.9,      // Anteil der History bei voller Bestätigung (Auftrag 0,9–0,95; 0,92+ glättet mehr, wird aber weicher); ?taaw=
  gamma: 1.25,       // Varianz-Clip: Boxbreite in Standardabweichungen (enger = weniger Ghosting, mehr Flimmern); ?taagamma=
  // Rekonstruktion des aktuellen Bilds, wo die History fehlt: Lanczos-2 über 3×3 (n31 Abnahme; vorher Gauß σ 0,55 – zu weich)
  sigmaTreffer: 0.35,// Beitrag zur History: Gauß-Breite in ZIEL-Pixeln (eine Abtastung genau im Zielpixel zählt voll)
  dis: 0.06,         // Disocclusion: relative Tiefenabweichung, ab der die History verworfen wird (weich bis 2×); ?taadis=
  alphaMin: 0.01,    // nie ganz einfrieren
  reaktiv: 0.5,      // Mindestanteil des neuen Bilds hinter durchsichtigen bewegten Dingen (Geist)
  // n31 Abnahme im Browser (deterministische Fahrt gegen 2×-Supersampling-Bezug, siehe TAAU_BERICHT.md):
  cub: -0.75,        // History-Kern: Keys-Kubik a (−0,5 = Catmull-Rom; schärfer gegen aufsummierte Weichheit in Bewegung); ?taacub=
  bewegung: 0.4,     // Mindestanteil des neuen Bilds bei halbzahliger Verschiebung (Bewegung), aus der Lanczos-Rekonstruktion; ?taamot=
};
export function gauss(d2, sigma) { return Math.exp(-d2 / (2 * sigma * sigma)); }
// Lanczos-2 als Näherung über x² (wie FSR 2, ohne sin), |x| < 2 – gleiche Formel wie kL2 im Shader
export function lanczos2(x2) { x2 = Math.min(x2, 4); const b = 0.4 * x2 - 1, wi = 0.25 * x2 - 1; return (1.5625 * b * b - 0.5625) * wi * wi; }
// Anteil des neuen Bilds je Zielpixel. treffer = Gauß-Gewicht der Abtastung, die dem Zielpixel am nächsten liegt (0…1),
// ablehnung = 0 (History gut) … 1 (verworfen: Disocclusion, außerhalb, Schnitt), reaktiv = Mindestanteil (0…1)
export function mischAnteil(treffer, ablehnung, reaktiv = 0, o = TAAU_STANDARD) {
  const a = Math.max(o.alphaMin, (1 - o.gewicht) * treffer);
  return Math.min(1, Math.max(a, ablehnung, reaktiv));
}
// Disocclusion: History-Tiefe zHist (gespeichert im Vorbild) gegen erwartete Tiefe zErw (aus der Reprojektion)
// 0 = passt … 1 = verworfen, weich zwischen dis und 2·dis. Vorzeichen = Körper-Maske (negativ = bewegtes Objekt):
// Wechsel zwischen Welt und Körper ist immer eine Ablehnung (Auto fährt weg → dahinter ist Neues)
export function disocclusion(zHist, zErw, dis = TAAU_STANDARD.dis) {
  if (!(Math.abs(zHist) > 0)) return 1;
  if (Math.sign(zHist) !== Math.sign(zErw)) return 1;
  const r = Math.abs(Math.abs(zHist) - Math.abs(zErw)) / Math.max(1e-4, Math.abs(zErw));
  return r <= dis ? 0 : r >= 2 * dis ? 1 : (r - dis) / dis;
}

// n31 Abnahme (Browser): Bereichstest statt Punkttest. Die History speichert die Tiefe der Abtastung nächst der Zielpixelmitte;
// verglichen wird mit dem Tiefenbereich [zLo, zHi] der aktuellen 3×3-Nachbarschaft (in die Vorbild-Kamera verschoben).
// Der Punkttest (vorderste Abtastung gegen vorderste) verwarf im Standbild an jeder Tiefenkante (Masten, Horizont, Zaun)
// immer wieder die History, weil das 3×3-Fenster mit dem Jitter um ein Render-Pixel springt – genau dort, wo geglättet
// werden soll. sgnA/sgnB = Körper-Vorzeichen der vordersten und der mittleren Abtastung: Welt↔Körper-Wechsel ist nur dann
// eine Ablehnung, wenn keine der beiden das Vorzeichen der History hat (Auto fährt weg → Fahrbahn wird frei).
export function disoBereich(zHist, zLo, zHi, sgnA = 1, sgnB = 1, dis = TAAU_STANDARD.dis) {
  if (!(Math.abs(zHist) > 0)) return 1;
  const sg = Math.sign(zHist);
  if (sg !== sgnA && sg !== sgnB) return 1;
  const z = Math.abs(zHist), r = Math.max(zLo - z, z - zHi, 0) / Math.max(1e-4, z);
  return r <= dis ? 0 : r >= 2 * dis ? 1 : (r - dis) / dis;
}

// ---------- Einsatz-Entscheidung (Autopilot, Rückfall) ----------
// Liefert 'taa' (Jitter + Resolve, kein MSAA, kein FXAA), 'fxaa' (Rückfall aus Leistungsgründen: FXAA-Art im Endbild,
// MSAA 0) oder 'aus' (Stufe nicht gewünscht oder Technik fehlt → Preset wie bisher, Kino mit MSAA 4 – auf einem Gerät ohne
// HalfFloat-Ziel ist der bisherige Weg besser als FXAA).
//   gewuenscht: ?taa=1 bzw. kl=+taa; technik: WebGL2 + HalfFloat-Ziel möglich; pipeline: Kino-Look-Stufe ≥ 1;
//   rueckfall: vom Autopilot abgeschaltet; skala: aktuelle Renderskala, min: tiefste Skala für TAAU (Standard 0,6)
export function taaModus({ gewuenscht, technik = true, pipeline = true, rueckfall = false, skala = 1, min = 0.6 }) {
  if (!gewuenscht || !pipeline || !technik) return 'aus';
  if (rueckfall || skala < min - 1e-6) return 'fxaa';
  return 'taa';
}

// ---------- CPU-Referenz (Vorlage für den Shader, für Tests) ----------
// Ein Resolve-Schritt auf Graustufen- oder RGB-Bildern (Arrays [r,g,b] je Pixel), ohne Körper.
//   src: { w, h, px(i, j) → [r,g,b], d(i, j) → Tiefe 0…1 }, j = Jitter dieses Bilds (Render-Pixel)
//   hist: null (erstes Bild) oder { w, h, farbe: Float32Array(w·h·3), z: Float32Array(w·h) }
//   kam: { invVP, prevVP, near, far } oder null (statisch, kein Versatz)
// Rückgabe: neue History gleicher Größe (w × h = Ziel)
export function taauReferenz(src, jit, W, H, hist, kam = null, o = TAAU_STANDARD) {
  const out = { w: W, h: H, farbe: new Float32Array(W * H * 3), z: new Float32Array(W * H) };
  const sx = src.w / W, sy = src.h / H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W, v = (y + 0.5) / H;
    const px = u * src.w, py = v * src.h;           // Zielmitte in Render-Pixel-Koordinaten
    const kx = Math.floor(px + jit[0]), ky = Math.floor(py + jit[1]);
    let acc = [0, 0, 0], ws = 0, scharf = [0, 0, 0], wt = 0, treffer = 0, dMin = 2, sMin = null, dMax = -1, dC = 0.5, oC = 1e9;
    const nb = [], nbRgb = [];
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const i = Math.min(src.w - 1, Math.max(0, kx + a)), j = Math.min(src.h - 1, Math.max(0, ky + b));
      const c = src.px(i, j), d = src.d ? src.d(i, j) : 0.5;
      const ox = i + 0.5 - jit[0] - px, oy = j + 0.5 - jit[1] - py;   // Abstand in Render-Pixeln
      const g = lanczos2(ox * ox) * lanczos2(oy * oy);
      for (let k = 0; k < 3; k++) acc[k] += c[k] * g;
      ws += g;
      const gt = gauss((ox / sx) ** 2 + (oy / sy) ** 2, o.sigmaTreffer);   // enger Kern in ZIEL-Pixeln
      for (let k = 0; k < 3; k++) scharf[k] += c[k] * gt;
      wt += gt; treffer = Math.max(treffer, gt);
      nb.push(rgb2ycocg(c)); nbRgb.push(c);
      if (d < dMin) { dMin = d; sMin = [(i + 0.5 - jit[0]) / src.w, (j + 0.5 - jit[1]) / src.h]; }
      if (d > dMax) dMax = d;
      if (ox * ox + oy * oy < oC) { oC = ox * ox + oy * oy; dC = d; }   // Abtastung nächst der Zielmitte (Tiefe für die History)
    }
    // gegen Überschwinger (negative Lanczos-Keulen) auf Min/Max der Nachbarschaft geklemmt
    const cLo = [0, 1, 2].map((k) => Math.min(...nbRgb.map((c) => c[k]))), cHi = [0, 1, 2].map((k) => Math.max(...nbRgb.map((c) => c[k])));
    const weit = acc.map((s, k) => Math.min(cHi[k], Math.max(cLo[k], s / ws)));
    // Beitrag zur History: Abtastungen nahe der Zielpixelmitte (enger Kern) – sonst mittelt die History die breite, unscharfe
    // Rekonstruktion; die breite nur, wo die History verworfen wird (oder ganz fehlt)
    const eng = wt > 1e-4 ? scharf.map((s) => s / wt) : weit;
    let farbe = weit, cur = weit, zNeu = kam ? linZ(dC, kam.near, kam.far) : 1;
    if (hist) {
      let hu = u, hv = v, ablehnung = 0, zErw = zNeu;
      if (kam) {
        const r = reprojiziere(sMin, dMin, kam.invVP, kam.prevVP);
        hu = u + r.uv[0] - sMin[0]; hv = v + r.uv[1] - sMin[1]; zErw = r.z;
      }
      if (hu < 0 || hu > 1 || hv < 0 || hv > 1) ablehnung = 1;
      const hx = Math.min(W - 1, Math.max(0, Math.round(hu * W - 0.5))), hy = Math.min(H - 1, Math.max(0, Math.round(hv * H - 0.5)));
      const hi = hy * W + hx;
      // Tiefenbereich der Nachbarschaft, um die Tiefenänderung der vordersten Abtastung verschoben (Kamerafahrt)
      if (kam) { const zv = linZ(dMin, kam.near, kam.far); ablehnung = Math.max(ablehnung, disoBereich(hist.z[hi], zErw, linZ(dMax, kam.near, kam.far) + zErw - zv, 1, 1, o.dis)); }
      // nächster Nachbar statt Catmull-Rom: reicht für die Tests (Bewegung in ganzen Zielpixeln)
      const hc = [hist.farbe[hi * 3], hist.farbe[hi * 3 + 1], hist.farbe[hi * 3 + 2]];
      const box = varianzBox(nb, o.gamma);
      const hk = ycocg2rgb(clipAabb(rgb2ycocg(hc), box.mn, box.mx));
      cur = eng.map((e, k) => e + (weit[k] - e) * ablehnung);
      const al = mischAnteil(treffer, ablehnung, 0, o);
      // Luma-Gewichtung (Karis): helle Einzelpixel flackern weniger
      const lh = 1 / (1 + rgb2ycocg(hk)[0]), lc = 1 / (1 + rgb2ycocg(cur)[0]);
      const wc = al * lc, wh = (1 - al) * lh;
      farbe = [0, 1, 2].map((k) => (cur[k] * wc + hk[k] * wh) / (wc + wh));
    }
    const i3 = (y * W + x) * 3;
    out.farbe[i3] = farbe[0]; out.farbe[i3 + 1] = farbe[1]; out.farbe[i3 + 2] = farbe[2];
    out.z[y * W + x] = zNeu;
  }
  return out;
}
