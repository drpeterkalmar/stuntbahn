// Tier-Zuschauer (n40, Peter 20.10.2026: „niedlichere zuschauer (herzige tiere)“, 20.10. ~22:00: „menü tiere reicht völlig“).
// Rein rechnend (kein three.js, in Node prüfbar: tests/node/test_tiere.mjs): Arten und Farben, die prozedurale Low-Poly-Figur
// als Zahlenlisten (gfx/tiere.js macht daraus EIN instanziertes Mesh wie bei den Menschen), Mischung je Strecke (Seed, keine
// zwei gleichen nebeneinander), Plan für die Atlas-Karten (ferne Gruppen, Tribünen-Streifen), Einstellung/Regler.
// Cartoon-Stil: großer runder Kopf, große Augen mit Glanzpunkt, Bäckchen, kurze Beinchen, Ärmchen zum Jubeln. Eigene Arbeit,
// 0 KB Download. Alle Arten stecken in einer Figur; Teile anderer Arten fallen im Shader auf einen Punkt zusammen (Maske je Ecke).
import { rng } from '../core/util.js';

// Arten (Index = Bit in der Maske, Art im Shader = floor(iA.y / 16))
export const TIERE = ['baer', 'hase', 'fuchs', 'pinguin', 'katze', 'kuh'];
export const TIER_NAMEN = { baer: 'Bärchen', hase: 'Häschen', fuchs: 'Fuchs', pinguin: 'Pinguin', katze: 'Kätzchen', kuh: 'Kuh' };
const B = Object.fromEntries(TIERE.map((k, i) => [k, 1 << i]));
const ALLE = (1 << TIERE.length) - 1;

// Farbklassen (aCls): 0 Fell, 1 hell (Bauch, Schnauze), 2 Augenweiß, 3 dunkel (Pupille, Kuh-Flecken), 4 Fahne, 5 Stange,
// 6 Nase, 7 Glanzpunkt, 8 rosa (Innenohr, Bäckchen), 9 Extra (Pinguin-Schnabel/-Füße, Kuh-Hörner), 10 Pfote (hell; Kamerablitz)
export const KL = { fell: 0, hell: 1, weiss: 2, dunkel: 3, fahne: 4, stange: 5, nase: 6, glanz: 7, rosa: 8, extra: 9, pfote: 10 };
// Farben je Art (sRGB 0 … 1; der Shader rechnet linear). fell2: zweite Fellfarbe (je Figur zufällig, z. B. brauner Hase, rote Katze)
// TODO n40-Heavy: Farben am Bild abstimmen (Tag/Nacht, Kino-Look)
export const TIER_FARBEN = {
  baer: { fell: [0.56, 0.37, 0.21], fell2: [0.38, 0.25, 0.15], hell: [0.88, 0.74, 0.55], nase: [0.16, 0.11, 0.09], rosa: [0.93, 0.62, 0.6], extra: [0.2, 0.2, 0.2] },
  hase: { fell: [0.93, 0.91, 0.89], fell2: [0.72, 0.58, 0.44], hell: [1.0, 0.99, 0.97], nase: [0.96, 0.52, 0.62], rosa: [0.98, 0.66, 0.74], extra: [0.2, 0.2, 0.2] },
  fuchs: { fell: [0.95, 0.5, 0.14], fell2: [0.85, 0.38, 0.1], hell: [0.99, 0.96, 0.91], nase: [0.1, 0.08, 0.08], rosa: [0.98, 0.64, 0.6], extra: [0.12, 0.09, 0.08] },
  pinguin: { fell: [0.13, 0.16, 0.24], fell2: [0.1, 0.11, 0.14], hell: [0.98, 0.98, 0.98], nase: [1.0, 0.62, 0.12], rosa: [0.98, 0.6, 0.66], extra: [1.0, 0.6, 0.1] },
  katze: { fell: [0.62, 0.63, 0.66], fell2: [0.93, 0.6, 0.27], hell: [0.98, 0.97, 0.95], nase: [0.96, 0.55, 0.62], rosa: [0.98, 0.68, 0.74], extra: [0.2, 0.2, 0.2] },
  kuh: { fell: [0.97, 0.96, 0.93], fell2: [0.93, 0.88, 0.8], hell: [0.98, 0.72, 0.74], nase: [0.55, 0.32, 0.34], rosa: [0.98, 0.7, 0.72], extra: [0.95, 0.9, 0.74] },
};

// Gelenke für den Haltungs-Shader (gfx/kulisse2.js fanPoseGlsl): Schultern, Hüfte (Sitzen), Hüpfen, Absenken im Sitzen
export const TIER_J = { lift: '0.2', sitLift: '-0.15', armL: '-0.24, 0.68, 0.0', armR: '0.24, 0.68, 0.0', hip: '0.0, 0.24, 0.0' };
// Fahnenstange (Teil 5) und Tuch (6) hängen an der rechten Pfote: im Ruhezustand nach UNTEN (Fahne gibt es nur in Haltung 3,
// dort ist der Arm ~125–165° hochgerissen → Stange zeigt nach oben, Tuch über dem Kopf). Stange bei x = POLE_X
export const POLE_X = 0.3;

// ---------- Geometrie ----------
// Teile (aPart wie bei den Menschen): 0 Rumpf/Kopf, 1/2 Bein links/rechts, 3/4 Arm links/rechts, 5 Fahnenstange, 6 Fahnentuch
// Liefert { P, N, A (Teil), C (Klasse), M (Maske: Bits der Arten, die das Teil haben), I } – Fuß auf y = 0, Blick nach +z.
// grob = true: weniger Unterteilung (Grafik Standard/Handy: ~15 % weniger Ecken, ~20 % weniger Dreiecke; Kopf und Augen bleiben fein), gleiche Teile und Maße
export function tierForm(grob = false) {
  const P = [], N = [], A = [], C = [], M = [], I = [];
  const v = (p, n, part, cls, mask) => { P.push(...p); N.push(...n); A.push(part); C.push(cls); M.push(mask); return P.length / 3 - 1; };
  // Ellipsoid (glatte Normalen): Mitte c, Halbachsen r, seg × rings; cls(n) → Klasse je Ecke (Bauch hell usw.); rot: Kippen um x
  // fest: auch grob voll unterteilt (Kopf, Augen – darauf schaut man)
  const ell = (c, r, seg, rings, part, cls, mask, rot = 0, fest = false) => {
    if (grob && !fest) { seg = Math.max(4, seg - 2); rings = Math.max(3, rings - 1); }
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const put = (x, y, z) => { // lokal (Einheitskugel) → Welt mit Kippen um x
      const lx = x * r[0], ly = y * r[1], lz = z * r[2];
      const p = [c[0] + lx, c[1] + ly * cs - lz * sn, c[2] + ly * sn + lz * cs];
      let nx = x / r[0], ny = y / r[1], nz = z / r[2]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const n = [nx, ny * cs - nz * sn, ny * sn + nz * cs];
      return v(p, n, part, typeof cls === 'function' ? cls(x, y, z) : cls, mask);
    };
    const top = put(0, 1, 0), ring = [];
    for (let j = 1; j < rings; j++) {
      const th = j / rings * Math.PI, row = [];
      for (let i = 0; i < seg; i++) { const ph = i / seg * Math.PI * 2; row.push(put(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph))); }
      ring.push(row);
    }
    const bot = put(0, -1, 0);
    for (let i = 0; i < seg; i++) {
      const i2 = (i + 1) % seg;
      I.push(top, ring[0][i], ring[0][i2]);
      for (let j = 0; j < ring.length - 1; j++) { const a = ring[j][i], b = ring[j][i2], c2 = ring[j + 1][i], d = ring[j + 1][i2]; I.push(a, c2, b, b, c2, d); }
      I.push(bot, ring[ring.length - 1][i2], ring[ring.length - 1][i]);
    }
  };
  // Scheibe (n-Eck) mit Blick nach n0, Halbachsen rx/ry in der Ebene (x seitlich, y oben) – Pupillen, Glanzpunkte, Bäckchen
  const disc = (c, rx, ry, segs, n0, part, cls, mask) => {
    if (grob) segs = Math.max(4, segs - 1);
    let [nx, ny, nz] = n0; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    // Achsen in der Scheibe: u = oben × n (waagrecht), w = n × u
    let ux = nz, uz = -nx; const lu = Math.hypot(ux, uz) || 1; ux /= lu; uz /= lu;
    const wx = ny * uz, wy = nz * ux - nx * uz, wz = -ny * ux;
    const m = v(c, [nx, ny, nz], part, cls, mask), rim = [];
    for (let i = 0; i < segs; i++) { const a = i / segs * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry; rim.push(v([c[0] + ux * x + wx * y, c[1] + wy * y, c[2] + uz * x + wz * y], [nx, ny, nz], part, cls, mask)); }
    for (let i = 0; i < segs; i++) I.push(m, rim[i], rim[(i + 1) % segs]);
  };
  // Spitzohr/Horn/Schnabel: vierseitige Pyramide (flache Normalen), Grundfläche Mitte c (Breite w, Tiefe d), Spitze tip;
  // Flächen mit Blick nach vorn (+z) bekommen clsFront (Innenohr rosa)
  const pyr = (c, w, d, tip, part, cls, clsFront, mask) => {
    const q = [[c[0] - w, c[1], c[2] + d], [c[0] + w, c[1], c[2] + d], [c[0] + w, c[1], c[2] - d], [c[0] - w, c[1], c[2] - d]];
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [tip[0] - a[0], tip[1] - a[1], tip[2] - a[2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
      const k = n[2] > 0.5 ? clsFront : cls;
      I.push(v(a, n, part, k, mask), v(b, n, part, k, mask), v(tip, n, part, k, mask));
    }
  };
  // Kasten (Fahnenstange/-tuch)
  const box = (c, s, part, cls, mask) => {
    const h = s.map((x) => x / 2), F = [[[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]], [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
      [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]], [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
      [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]], [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]]];
    for (const [n, q] of F) { const b0 = q.map(([a, b, d]) => v([c[0] + a * h[0], c[1] + b * h[1], c[2] + d * h[2]], n, part, cls, mask)); I.push(b0[0], b0[1], b0[2], b0[0], b0[2], b0[3]); }
  };
  const OHNE_P = ALLE & ~B.pinguin;
  // Rumpf: rundlich, Bauch (vorn/unten) hell
  ell([0, 0.5, 0], [0.27, 0.32, 0.23], 8, 4, 0, (x, y, z) => (z > 0.3 && y < 0.75 ? KL.hell : KL.fell), ALLE);
  // Kuh-Flecken (flach auf den Seiten), Hasen-Bommelschwanz, Fuchs-Lunte mit heller Spitze, Katzen-Schwanz (steil nach oben)
  ell([0.2, 0.56, -0.05], [0.09, 0.12, 0.11], 5, 3, 0, KL.dunkel, B.kuh);
  ell([-0.19, 0.42, 0.06], [0.1, 0.08, 0.1], 5, 3, 0, KL.dunkel, B.kuh);
  ell([0, 0.3, -0.24], [0.08, 0.08, 0.07], 5, 3, 0, KL.hell, B.hase);
  ell([0.06, 0.28, -0.36], [0.1, 0.1, 0.22], 6, 3, 0, (x, y, z) => (z < -0.45 ? KL.hell : KL.fell), B.fuchs, -0.6);
  ell([0.08, 0.6, -0.27], [0.045, 0.24, 0.045], 4, 3, 0, KL.fell, B.katze, -0.35);
  // Kopf: groß und rund, leicht vorn; Gesicht unten-vorn beim Pinguin weiß (Herzform angedeutet)
  ell([0, 0.98, 0.0], [0.31, 0.28, 0.27], 8, 5, 0, KL.fell, ALLE, 0, true);
  ell([0, 0.93, 0.16], [0.21, 0.17, 0.12], 6, 3, 0, KL.hell, B.pinguin);
  // Schnauze (nicht Pinguin), Fuchs spitzer, Kuh breit und rosa
  ell([0, 0.9, 0.2], [0.13, 0.09, 0.1], 6, 3, 0, KL.hell, OHNE_P & ~B.fuchs & ~B.kuh);
  ell([0, 0.9, 0.22], [0.1, 0.075, 0.13], 6, 3, 0, KL.hell, B.fuchs);
  ell([0, 0.88, 0.2], [0.18, 0.11, 0.1], 6, 3, 0, KL.hell, B.kuh);
  // Nase (Pinguin: Schnabel), Kuh: Nasenlöcher statt Knubbel, Fuchs: Nase an der spitzen Schnauze
  ell([0, 0.94, 0.29], [0.045, 0.032, 0.03], 5, 3, 0, KL.nase, OHNE_P & ~B.kuh & ~B.fuchs);
  ell([0, 0.93, 0.345], [0.04, 0.03, 0.03], 5, 3, 0, KL.nase, B.fuchs);
  for (const s of [-1, 1]) disc([s * 0.06, 0.9, 0.296], 0.022, 0.016, 6, [s * 0.2, 0, 1], 0, KL.nase, B.kuh);
  ell([0, 0.91, 0.31], [0.065, 0.04, 0.085], 5, 3, 0, KL.extra, B.pinguin);
  // Augen: groß, weiß, schwarze Pupille, Glanzpunkt oben außen – das Niedliche
  for (const s of [-1, 1]) {
    ell([s * 0.105, 1.04, 0.225], [0.085, 0.1, 0.055], 6, 4, 0, KL.weiss, ALLE, 0, true);
    disc([s * 0.1, 1.03, 0.282], 0.056, 0.07, 6, [s * 0.15, 0, 1], 0, KL.dunkel, ALLE);
    disc([s * 0.085, 1.065, 0.29], 0.02, 0.02, 4, [s * 0.15, 0.1, 1], 0, KL.glanz, ALLE);
    // Bäckchen
    disc([s * 0.205, 0.92, 0.212], 0.05, 0.035, 6, [s * 0.7, -0.1, 0.7], 0, KL.rosa, ALLE);
  }
  // Ohren je Art
  for (const s of [-1, 1]) {
    // Bär: runde Ohren mit rosa Innenseite
    ell([s * 0.21, 1.21, -0.02], [0.095, 0.095, 0.06], 6, 3, 0, KL.fell, B.baer);
    disc([s * 0.21, 1.21, 0.042], 0.055, 0.055, 6, [s * 0.2, 0.1, 1], 0, KL.rosa, B.baer);
    // Hase: lange Ohren, leicht nach außen
    ell([s * 0.11, 1.42, -0.03], [0.065, 0.24, 0.045], 5, 4, 0, KL.fell, B.hase);
    disc([s * 0.11, 1.42, 0.018], 0.035, 0.18, 6, [s * 0.1, 0, 1], 0, KL.rosa, B.hase);
    // Fuchs: große Spitzohren; Katze: kleinere Spitzohren (Innenseite rosa)
    pyr([s * 0.17, 1.15, -0.01], 0.09, 0.045, [s * 0.22, 1.42, -0.02], 0, KL.fell, KL.dunkel, B.fuchs);
    pyr([s * 0.17, 1.15, -0.01], 0.075, 0.04, [s * 0.21, 1.34, -0.01], 0, KL.fell, KL.rosa, B.katze);
    // Kuh: Ohren seitlich, Hörnchen
    ell([s * 0.34, 1.06, -0.02], [0.11, 0.05, 0.06], 5, 3, 0, KL.fell, B.kuh);
    pyr([s * 0.15, 1.2, -0.02], 0.04, 0.04, [s * 0.2, 1.36, -0.03], 0, KL.extra, KL.extra, B.kuh);
  }
  // Beine (kurz, Pinguin: orange Füße statt Beinen)
  for (const [s, part] of [[-1, 1], [1, 2]]) {
    ell([s * 0.12, 0.13, 0.03], [0.1, 0.13, 0.12], 6, 3, part, KL.fell, OHNE_P);
    ell([s * 0.1, 0.03, 0.09], [0.08, 0.03, 0.12], 5, 3, part, KL.extra, B.pinguin);
  }
  // Ärmchen (Gelenk TIER_J.armL/R) mit heller Pfote
  for (const [s, part] of [[-1, 3], [1, 4]]) {
    ell([s * 0.29, 0.51, 0.02], [0.075, 0.17, 0.075], 5, 3, part, KL.fell, ALLE);
    ell([s * 0.3, 0.37, 0.04], [0.07, 0.065, 0.07], 5, 3, part, KL.pfote, ALLE);
  }
  // Fahne an der rechten Pfote: Stange nach unten, Tuch am unteren Ende (s. POLE_X)
  box([POLE_X, -0.1, 0.06], [0.025, 0.96, 0.025], 5, KL.stange, ALLE);
  box([POLE_X + 0.27, -0.42, 0.06], [0.5, 0.32, 0.012], 6, KL.fahne, ALLE);
  return { P, N, A, C, M, I };
}

// ---------- Mischung ----------
// Art je Zuschauer (Index in TIERE) aus dem Seed: zufällig, aber nie gleich wie einer der nah (5 nächsten schon vergebenen
// im Umkreis r m – an Stunts stehen bis zu 10 Zuschauer so dicht, mehr als es Arten gibt) und möglichst keine Art, die im
// weiteren Umkreis rWeit m schon steht (Gitter-Suche); fans = [{ x, z }]. Deterministisch (gleiche Strecke → gleiche Tiere)
export function tierMischung(fans, seed = 1, r = 1.25, rWeit = 2.6) {
  const R = rng(((seed >>> 0) * 2246822519 + 0x7e1e) >>> 0), out = new Int8Array(fans.length), cell = rWeit, grid = new Map();
  const key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  fans.forEach((f, i) => {
    const nahL = [], weit = new Set();
    const cx = Math.floor(f.x / cell), cz = Math.floor(f.z / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of grid.get(`${cx + a},${cz + b}`) || []) {
      const d2 = (fans[j].x - f.x) ** 2 + (fans[j].z - f.z) ** 2;
      if (d2 < r * r) nahL.push([d2, out[j]]); else if (d2 < rWeit * rWeit) weit.add(out[j]);
    }
    nahL.sort((p, q) => p[0] - q[0]);
    const nah = new Set(nahL.slice(0, TIERE.length - 1).map((p) => p[1]));
    for (const p of nahL.slice(TIERE.length - 1)) weit.add(p[1]);
    const alle = TIERE.map((_, k) => k), frei = alle.filter((k) => !nah.has(k)), ganzFrei = frei.filter((k) => !weit.has(k));
    const pool = ganzFrei.length ? ganzFrei : frei.length ? frei : alle;
    out[i] = pool[Math.floor(R() * pool.length) % pool.length];
    const k = key(f.x, f.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
  });
  return out;
}
// Instanz-Wert iA.y für den Tier-Shader: Art · 16 + Farbe (0 … 15, Fahne/Fellvariante) – Menschen nutzen nur 0 … 15
export const tierCol = (art, col) => art * 16 + (col & 15);

// ---------- Atlas-Karten (ferne Gruppen, Tribünen) ----------
// Gleiche Aufteilung wie der Menschen-Atlas (gfx/deco.js crowdAtlas): 4 Streifen à 128 px (2 sitzend mit 60, 2 stehend mit 44
// Figuren), darunter dieselben jubelnd. Je Figur Art (nie gleich wie die linke Nachbarin, auch nicht wie die vorletzte), Ort,
// Größe, Fellvariante, Fahne
export function tierAtlasPlan(seed = 54321) {
  const R = rng(seed >>> 0), rows = [];
  for (let row = 0; row < 4; row++) {
    const seated = row < 2, n = seated ? 60 : 44, ps = [];
    for (let k = 0; k < n; k++) {
      const prev = ps.slice(-2).map((p) => p.art);
      const pool = TIERE.map((_, i) => i).filter((i) => !prev.includes(i));
      ps.push({ x: (k + R() * 0.6) * 1024 / n, s: seated ? 1 : 1.12 + R() * 0.22, top: seated ? 36 + R() * 6 : 22 + R() * 12, art: pool[Math.floor(R() * pool.length) % pool.length], v2: R() < 0.35, flag: R() < 0.12 ? (R() < 0.5 ? '#ffeb3b' : '#e53935') : null });
    }
    rows.push({ seated, ps });
  }
  return rows;
}

// ---------- Einstellung ----------
// 'tiere' (Standard) oder 'mensch'; URL ?zuschauer=mensch|tiere hat Vorrang vor der Option „Zuschauer“
export function zuschauerModus(search, settings = {}) {
  const u = new URLSearchParams(search || '').get('zuschauer');
  if (u === 'mensch' || u === 'menschen') return 'mensch';
  if (u === 'tiere' || u === 'tier') return 'tiere';
  return settings.zuschauer === 'mensch' ? 'mensch' : 'tiere';
}
// Zustand für die Welt (gfx/kulisse2.js, gfx/deco.js lesen ihn beim Bauen): main.js setzt ihn aus Option/URL. Ohne main.js
// (Node-Tests der Kulissen) Menschen wie bis n39
export const ZUSCHAUER = { tiere: false };
