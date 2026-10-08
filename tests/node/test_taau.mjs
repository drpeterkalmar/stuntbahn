// TAAU (n31, src/gfx/kern/taau_mathe.js): Jitter-Folge, Projektions-Jitter, Reprojektion, Clip, Disocclusion, Einsatz-
// Entscheidung – und eine CPU-Simulation des Resolves (Vorlage des Shaders): feines Zaun-/Gittermuster bei Renderskala 0,65
// gegen Bezug (Supersampling), Ruhe über die Zeit, Spur eines bewegten Objekts ohne Maske, Parallaxe mit Disocclusion.
import {
  halton, jitterFolge, jitterAnzahl, jitterVersatz, jitterProjektion, mat4Mul, mat4Vec, mat4Inv, perspektive, reprojiziere, linZ,
  rgb2ycocg, ycocg2rgb, clipAabb, varianzBox, disocclusion, mischAnteil, taaModus, taauReferenz, TAAU_STANDARD, gauss,
} from '../../src/gfx/kern/taau_mathe.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const nah = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---------- 1. Halton / Jitter-Folge ----------
ok(nah(halton(1, 2), 0.5) && nah(halton(2, 2), 0.25) && nah(halton(3, 2), 0.75) && nah(halton(1, 3), 1 / 3) && nah(halton(2, 3), 2 / 3) && nah(halton(4, 3), 4 / 9), 'Halton(2,3) Werte');
for (const n of [8, 16, 32]) {
  const f = jitterFolge(n);
  const inB = f.every(([x, y]) => x >= -0.5 && x < 0.5 && y >= -0.5 && y < 0.5);
  const mx = f.reduce((s, p) => s + p[0], 0) / n, my = f.reduce((s, p) => s + p[1], 0) / n;
  const binsX = new Set(f.map(([x]) => Math.floor((x + 0.5) * n)));
  const binsY = new Set(f.map(([, y]) => Math.floor((y + 0.5) * 4)));
  ok(inB && Math.abs(mx) < 0.07 && Math.abs(my) < 0.07 && binsX.size === n && binsY.size === 4,
    `Folge ${n}: in [−½,½), Mittel (${mx.toFixed(3)}, ${my.toFixed(3)}) ≈ 0, x geschichtet (${binsX.size}/${n} Fächer), y in allen Vierteln`);
}
ok(jitterAnzahl(1) === 8 && jitterAnzahl(0.85) === 16 && jitterAnzahl(0.7) === 16 && jitterAnzahl(0.6) === 32 && jitterAnzahl(0.7, '8') === 8 && jitterAnzahl(1, '0') === 0,
  `Länge nach Renderskala: 1→${jitterAnzahl(1)}, 0,85→${jitterAnzahl(0.85)}, 0,7→${jitterAnzahl(0.7)}, 0,6→${jitterAnzahl(0.6)}; ?jit=8/0 übersteuert`);
ok(jitterVersatz(0, 0)[0] === 0 && jitterVersatz(9, 8)[0] === jitterFolge(8)[1][0] && jitterVersatz(-1, 8)[1] === jitterFolge(8)[7][1], 'Versatz läuft zyklisch (auch negativ), 0 Phasen = kein Versatz');

// ---------- 2. Projektions-Jitter verschiebt jeden Punkt um genau j Render-Pixel ----------
{
  const sw = 832, sh = 390;
  const fall = (P, name) => {
    const J = jitterProjektion(P.slice(), 0.37, -0.21, sw, sh);
    let maxF = 0;
    for (const p of [[0.3, 0.2, -1], [-4, 2, -30], [12, -5, -400], [0, 0, -2000]]) {
      const a = mat4Vec(P, [...p, 1]), b = mat4Vec(J, [...p, 1]);
      const dx = (b[0] / b[3] - a[0] / a[3]) * 0.5 * sw, dy = (b[1] / b[3] - a[1] / a[3]) * 0.5 * sh;
      const dz = b[2] / b[3] - a[2] / a[3];
      maxF = Math.max(maxF, Math.abs(dx - 0.37), Math.abs(dy + 0.21), Math.abs(dz));
    }
    ok(maxF < 1e-6, `${name}: Versatz exakt (0,37; −0,21) px in jeder Tiefe, Tiefe unverändert (Fehler ${maxF.toExponential(1)})`);
  };
  fall(perspektive(62, sw / sh, 0.25, 4000), 'Perspektive');
  const off = perspektive(62, sw / sh, 0.25, 4000); off[9] = 0.18;   // setViewOffset (Cockpit-Objektiv nach unten) = asymmetrisch
  fall(off, 'Perspektive mit Objektiv-Versatz (Cockpit)');
  fall([2 / 40, 0, 0, 0, 0, 2 / 20, 0, 0, 0, 0, -2 / 100, 0, 0, 0, -1.02, 1], 'Orthografisch');
}

// ---------- 3. Reprojektion ----------
const view = (x, y, z, yaw = 0) => { // Kamera an (x,y,z), um y gedreht → View-Matrix (Welt → Kamera)
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const welt = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1];
  return mat4Inv(welt);
};
{
  const P = perspektive(62, 16 / 9, 0.25, 4000);
  const vp0 = mat4Mul(P, view(0, 2, 0)), vp1 = mat4Mul(P, view(0.8, 2.1, -1.5, 0.05));
  const inv1 = mat4Inv(vp1);
  let maxF = 0, maxZ = 0;
  for (const w of [[1, 1, -20], [-3, 0, -8], [40, 5, -300]]) {
    const c1 = mat4Vec(vp1, [...w, 1]), c0 = mat4Vec(vp0, [...w, 1]);
    const uv = [c1[0] / c1[3] * 0.5 + 0.5, c1[1] / c1[3] * 0.5 + 0.5], d = c1[2] / c1[3] * 0.5 + 0.5;
    const r = reprojiziere(uv, d, inv1, vp0);
    maxF = Math.max(maxF, Math.abs(r.uv[0] - (c0[0] / c0[3] * 0.5 + 0.5)), Math.abs(r.uv[1] - (c0[1] / c0[3] * 0.5 + 0.5)));
    maxZ = Math.max(maxZ, Math.abs(r.z - c0[3]) / c0[3]);
    maxZ = Math.max(maxZ, Math.abs(linZ(d, 0.25, 4000) - c1[3]) / c1[3]);
  }
  ok(maxF < 1e-4 && maxZ < 1e-3, `Reprojektion Kamera-Fahrt+Drehung: uv-Fehler ${maxF.toExponential(1)}, Tiefe (clip.w, linZ) rel. ${maxZ.toExponential(1)}`);
  // bewegter Körper: Punkt auf dem Auto, Auto fährt 1,2 m vor → mit Körper-Matrix landet er auf der vorigen Auto-Stelle
  const autoAlt = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -10, 1], autoNeu = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -11.2, 1];
  const K = mat4Mul(autoAlt, mat4Inv(autoNeu));
  const pw = mat4Vec(autoNeu, [0.5, 0.6, 1.0, 1]), c1 = mat4Vec(vp0, pw);
  const r = reprojiziere([c1[0] / c1[3] * 0.5 + 0.5, c1[1] / c1[3] * 0.5 + 0.5], c1[2] / c1[3] * 0.5 + 0.5, mat4Inv(vp0), vp0, K);
  const pa = mat4Vec(vp0, mat4Vec(autoAlt, [0.5, 0.6, 1.0, 1]));
  ok(Math.abs(r.uv[0] - (pa[0] / pa[3] * 0.5 + 0.5)) < 1e-4 && Math.abs(r.uv[1] - (pa[1] / pa[3] * 0.5 + 0.5)) < 1e-4, 'Körper-Reprojektion (vorige Welt · aktuelle Inverse) trifft die vorige Lage des Autopunkts');
}

// ---------- 4. Farbe, Clip, Disocclusion, Mischung ----------
{
  const c = [0.8, 0.3, 0.1], y = ycocg2rgb(rgb2ycocg(c));
  ok(nah(y[0], c[0]) && nah(y[1], c[1]) && nah(y[2], c[2]), 'YCoCg hin und zurück verlustfrei');
  const mn = [0, -0.1, -0.1], mx = [0.5, 0.1, 0.1];
  const innen = clipAabb([0.2, 0, 0.05], mn, mx), aussen = clipAabb([1.25, 0, 0], mn, mx);
  ok(nah(innen[0], 0.2) && nah(innen[2], 0.05), 'Clip: Wert in der Box bleibt');
  ok(Math.abs(aussen[0] - 0.5) < 1e-4 && nah(aussen[1], 0) && nah(aussen[2], 0), `Clip: Wert außerhalb landet auf dem Rand Richtung Mitte (${aussen.map((v) => v.toFixed(3)).join(', ')})`);
  const b = varianzBox([[0.1, 0, 0], [0.1, 0, 0], [0.1, 0, 0], [0.9, 0, 0]], 1);
  ok(b.mx[0] < 0.9 && b.mn[0] >= 0.1 && b.mu[0] > 0.29 && b.mu[0] < 0.31, `Varianz-Box enger als Min/Max bei Ausreißer (${b.mn[0].toFixed(2)}…${b.mx[0].toFixed(2)})`);
  ok(disocclusion(20, 20) === 0 && disocclusion(20.8, 20) === 0 && nah(disocclusion(21.8, 20), 0.5, 1e-6) && disocclusion(30, 20) === 1 && disocclusion(-20, 20) === 1 && disocclusion(0, 20) === 1,
    'Disocclusion: gleiche Tiefe 0, 4 % 0, 9 % halb, 50 % ganz, Körper↔Welt immer, leere History immer');
  ok(nah(mischAnteil(1, 0), 1 - TAAU_STANDARD.gewicht) && mischAnteil(0, 0) === TAAU_STANDARD.alphaMin && mischAnteil(1, 1) === 1 && mischAnteil(0.1, 0, 0.5) === 0.5,
    'Mischanteil: voller Treffer = 1 − Gewicht, kein Treffer = Minimum, Ablehnung = neues Bild, reaktiv = Mindestanteil');
  ok(taaModus({ gewuenscht: false }) === 'aus' && taaModus({ gewuenscht: true }) === 'taa' && taaModus({ gewuenscht: true, technik: false }) === 'fxaa'
    && taaModus({ gewuenscht: true, rueckfall: true }) === 'fxaa' && taaModus({ gewuenscht: true, skala: 0.55 }) === 'fxaa' && taaModus({ gewuenscht: true, pipeline: false }) === 'aus',
    'Einsatz: aus ohne Wunsch/Pipeline, Rückfall FXAA bei fehlender Technik, Autopilot-Rückfall oder Renderskala < 0,6');
}

// ---------- 5. Simulation statisch: Zaun bei Renderskala 0,65 ----------
// Szene in Bild-Koordinaten (0…1): dünne schräge Latten (Zaun/Leitplanke) + harte Kante; Bezug = 8×8-Supersampling je Zielpixel
const W = 96, H = 64;
const szene = (u, v) => {
  const latte = Math.abs(((u * 7.3 + v * 1.9) % 1 + 1) % 1 - 0.5) < 0.06 ? 1 : 0;           // dünne Latten (< 1 Render-Pixel breit)
  const kante = v > 0.62 + 0.18 * u ? 0.25 : 0;                                              // schräge Horizontkante
  return Math.min(1, latte * 0.9 + kante + 0.05);
};
const bezug = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let s = 0;
  for (let b = 0; b < 8; b++) for (let a = 0; a < 8; a++) s += szene((x + (a + 0.5) / 8) / W, (y + (b + 0.5) / 8) / H);
  bezug[y * W + x] = s / 64;
}
const fehler = (f) => { let e = 0; for (let i = 0; i < W * H; i++) e += Math.abs(f(i) - bezug[i]); return e / (W * H); };
const renderLow = (sw, sh, jit) => ({ w: sw, h: sh, px: (i, j) => { const g = szene((i + 0.5 - jit[0]) / sw, (j + 0.5 - jit[1]) / sh); return [g, g, g]; } });
{
  const s = 0.65, sw = Math.round(W * s), sh = Math.round(H * s);
  // a) heute ohne TAA: Renderskala 0,65 bilinear hochskaliert (FXAA ändert an Lattenlücken nichts)
  const lo = renderLow(sw, sh, [0, 0]);
  const bil = (x, y) => {
    const px = (x + 0.5) / W * sw - 0.5, py = (y + 0.5) / H * sh - 0.5, i = Math.floor(px), j = Math.floor(py), fx = px - i, fy = py - j;
    const g = (a, b) => lo.px(Math.min(sw - 1, Math.max(0, a)), Math.min(sh - 1, Math.max(0, b)))[0];
    return (g(i, j) * (1 - fx) + g(i + 1, j) * fx) * (1 - fy) + (g(i, j + 1) * (1 - fx) + g(i + 1, j + 1) * fx) * fy;
  };
  const eBil = fehler((i) => bil(i % W, Math.floor(i / W)));
  // b) Vollauflösung 1,0 mit MSAA 4 (gedrehtes Raster) = heutiges Kino
  const ms = [[0.375, 0.125], [0.875, 0.375], [0.125, 0.625], [0.625, 0.875]];
  const eMsaa = fehler((i) => { const x = i % W, y = Math.floor(i / W); return ms.reduce((t, [a, b]) => t + szene((x + a) / W, (y + b) / H), 0) / 4; });
  const eNat = fehler((i) => szene(((i % W) + 0.5) / W, (Math.floor(i / W) + 0.5) / H));
  // c) TAAU 0,65 über 48 Bilder
  const N = jitterAnzahl(s), F = jitterFolge(N);
  let hist = null; const verlauf = [];
  for (let n = 0; n < 48; n++) {
    const j = F[n % N];
    const neu = taauReferenz(renderLow(sw, sh, j), j, W, H, hist);
    if (hist) { let d = 0; for (let i = 0; i < W * H; i++) d += Math.abs(neu.farbe[i * 3] - hist.farbe[i * 3]); verlauf.push(d / (W * H)); }
    hist = neu;
  }
  const eTaau = fehler((i) => hist.farbe[i * 3]);
  const ruhe = verlauf.slice(-16).reduce((a, b) => a + b, 0) / 16;
  // Flimmern ohne History: jedes Bild nur die Rekonstruktion des aktuellen Jitters (zum Vergleich)
  let flimmer = 0, vor = null;
  for (let n = 0; n < 17; n++) { const j = F[n % N]; const r = taauReferenz(renderLow(sw, sh, j), j, W, H, null); if (vor) { let d = 0; for (let i = 0; i < W * H; i++) d += Math.abs(r.farbe[i * 3] - vor.farbe[i * 3]); flimmer += d / (W * H) / 16; } vor = r; }
  console.log(`     Fehler gegen Bezug: 0,65 bilinear ${eBil.toFixed(4)} · 1,0 ohne AA ${eNat.toFixed(4)} · 1,0 MSAA4 ${eMsaa.toFixed(4)} · 0,65 TAAU ${eTaau.toFixed(4)}`);
  console.log(`     Änderung je Bild (Flimmern): Jitter ohne History ${flimmer.toFixed(4)} · TAAU eingeschwungen ${ruhe.toFixed(4)}`);
  ok(eTaau < eBil * 0.7, `TAAU 0,65 deutlich näher am Bezug als 0,65 hochskaliert (${eTaau.toFixed(4)} < 0,7 × ${eBil.toFixed(4)})`);
  ok(eTaau < eNat, `TAAU 0,65 näher am Bezug als 1,0 ohne Kantenglättung (${eTaau.toFixed(4)} < ${eNat.toFixed(4)})`);
  ok(eTaau < eMsaa * 1.5, `TAAU 0,65 in der Nähe von 1,0 + MSAA 4 (${eTaau.toFixed(4)} < 1,5 × ${eMsaa.toFixed(4)})`);
  ok(ruhe < flimmer * 0.25, `ruhig über die Zeit: Änderung je Bild ${ruhe.toFixed(4)} < ¼ des Jitter-Flimmerns ${flimmer.toFixed(4)}`);
}

// ---------- 6. Bewegtes helles Objekt OHNE Maske (Partikel, Zuschauer-Karten): Spur muss schnell vergehen ----------
{
  const s = 0.65, sw = Math.round(W * s), sh = Math.round(H * s), N = jitterAnzahl(s), F = jitterFolge(N);
  const objekt = (x0) => (u, v) => (u * W >= x0 && u * W < x0 + 10 && v * H >= 26 && v * H < 38 ? 1 : 0.1);
  let hist = null, x0 = 10;
  for (let n = 0; n < 24; n++) {   // erst stillstehen und einschwingen
    const j = F[n % N], f = objekt(x0);
    hist = taauReferenz({ w: sw, h: sh, px: (i, k) => { const g = f((i + 0.5 - j[0]) / sw, (k + 0.5 - j[1]) / sh); return [g, g, g]; } }, j, W, H, hist);
  }
  const rest = [], rand = [];
  for (let n = 24; n < 30; n++) {  // dann 6 px je Bild nach rechts
    x0 += 6;
    const j = F[n % N], f = objekt(x0);
    hist = taauReferenz({ w: sw, h: sh, px: (i, k) => { const g = f((i + 0.5 - j[0]) / sw, (k + 0.5 - j[1]) / sh); return [g, g, g]; } }, j, W, H, hist);
    // hellster Rest an der Startstelle (dort ist jetzt Hintergrund 0,1): innen = mehr als 3 Zielpixel (2 Render-Pixel) von
    // der neuen Objektkante weg, Rand = die 2–3 Pixel direkt daneben (dort enthält die 3×3-Nachbarschaft noch das Objekt)
    let m = 0, r = 0;
    for (let y = 28; y < 36; y++) for (let x = 11; x < 16; x++) {
      const v = hist.farbe[(y * W + x) * 3] - 0.1;
      if (x < x0 - 3) m = Math.max(m, v); else r = Math.max(r, v);
    }
    rest.push(m); rand.push(r);
  }
  console.log(`     Spur an der alten Stelle je Bild – innen: ${rest.map((v) => v.toFixed(3)).join(' ')} · Rand an der neuen Kante: ${rand.map((v) => v.toFixed(3)).join(' ')}`);
  ok(rest[0] < 0.05 && rest[1] < 0.05 && rand[1] < 0.05, `ohne Maske keine Spur im Inneren (nach 1 Bild ${rest[0].toFixed(3)}), Randsaum nur im ersten Bild (nach 2: ${rand[1].toFixed(3)}) – bekannte 2–3-px-Grenze jeder TAA`);
}

// ---------- 7. Kamerafahrt mit Parallaxe: Disocclusion hinter einem nahen Pfeiler ----------
{
  const P = perspektive(50, W / H, 0.25, 4000), near = 0.25, far = 4000;
  // Welt: Wand bei z = −40 (Streifen), Pfeiler bei z = −8 (x ∈ [−0,6; 0,6], hell); Kamera fährt seitwärts
  const strahl = (cx, u, v) => {
    const inv = mat4Inv(mat4Mul(P, view(cx, 0, 0)));
    const a = mat4Vec(inv, [u * 2 - 1, v * 2 - 1, -1, 1]), b = mat4Vec(inv, [u * 2 - 1, v * 2 - 1, 1, 1]);
    const o = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], e = [b[0] / b[3], b[1] / b[3], b[2] / b[3]], dir = [e[0] - o[0], e[1] - o[1], e[2] - o[2]];
    const tP = (-8 - o[2]) / dir[2], xp = o[0] + dir[0] * tP;
    const hit = Math.abs(xp) < 0.6 ? { z: 8, c: 0.95 } : { z: 40, c: Math.abs(Math.sin((o[0] + dir[0] * (-40 - o[2]) / dir[2]) * 3)) * 0.3 + 0.05 };
    const d = (far + near) / (far - near) * 0.5 - far * near / ((far - near) * hit.z) + 0.5;   // Tiefe 0…1 aus linearer Tiefe
    return { c: hit.c, d };
  };
  const s = 0.65, sw = Math.round(W * s), sh = Math.round(H * s), N = jitterAnzahl(s), F = jitterFolge(N);
  let hist = null, cx = 0, prevVP = null, vorPfeiler = 0;
  for (let n = 0; n < 20; n++) {
    if (n >= 12) cx += 0.12;   // nach dem Einschwingen fährt die Kamera nach rechts
    const j = F[n % N], vp = mat4Mul(P, view(cx, 0, 0));
    const src = { w: sw, h: sh, px: (i, k) => { const r = strahl(cx, (i + 0.5 - j[0]) / sw, (k + 0.5 - j[1]) / sh); return [r.c, r.c, r.c]; }, d: (i, k) => strahl(cx, (i + 0.5 - j[0]) / sw, (k + 0.5 - j[1]) / sh).d };
    hist = taauReferenz(src, j, W, H, hist, prevVP ? { invVP: mat4Inv(vp), prevVP, near, far } : null);
    prevVP = vp;
    if (n === 11) { for (let x = 0; x < W; x++) if (strahl(cx, (x + 0.5) / W, 0.5).c > 0.9) vorPfeiler = Math.max(vorPfeiler, x); }
  }
  // freigelegte Wand rechts vom Pfeiler (dort stand er vorher): darf nicht mehr pfeilerhell sein
  let maxFrei = 0, n = 0;
  for (let x = 0; x < W; x++) {
    const jetzt = strahl(cx, (x + 0.5) / W, 0.5);
    if (jetzt.c < 0.9 && x <= vorPfeiler + 2 && x >= vorPfeiler - 12) { maxFrei = Math.max(maxFrei, hist.farbe[(32 * W + x) * 3] - jetzt.c); n++; }
  }
  ok(n > 0 && maxFrei < 0.3, `Parallaxe: freigelegte Wand übernimmt nicht die Pfeilerfarbe (größter Rest ${maxFrei.toFixed(3)} über ${n} Pixel)`);
}

// ---------- 8. Gauß-Hilfen ----------
ok(nah(gauss(0, 0.5), 1) && gauss(1, 0.5) < 0.14 && gauss(1, 0.5) > 0.13, 'Gauß-Gewicht');

console.log(bad ? `${bad} Fehler` : 'alle TAAU-Mathe-Tests grün');
process.exit(bad ? 1 : 0);
