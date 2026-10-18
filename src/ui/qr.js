// QR-Code (n35 Online: Teilen-Link als Bild), eigener kleiner Kodierer ohne Fremdbibliothek: Modell 2, Byte-Modus,
// Fehlerkorrektur L/M/Q/H, Versionen 1–6 (bis 106 Byte bei M – der Raum-Link hat ~55), beste Maske nach den
// Strafregeln der Norm. qrMatrix(text) → { n, m: Uint8Array n×n (1 = dunkel), version, maske }; qrSvg(text) → SVG-Text.
// Node-Test: tests/node/test_qr.mjs (Reed-Solomon-Prüfwerte, Format-Bits, Rücklesen mit zbarimg).

const EC_BITS = { L: 1, M: 0, Q: 3, H: 2 };
// je Version: [Gesamt-Codewörter, { Stufe: [EC je Block, [Anzahl, Daten-Codewörter], …] }]
const TAB = [null,
  [26, { L: [7, [1, 19]], M: [10, [1, 16]], Q: [13, [1, 13]], H: [17, [1, 9]] }],
  [44, { L: [10, [1, 34]], M: [16, [1, 28]], Q: [22, [1, 22]], H: [28, [1, 16]] }],
  [70, { L: [15, [1, 55]], M: [26, [1, 44]], Q: [18, [2, 17]], H: [22, [2, 13]] }],
  [100, { L: [20, [1, 80]], M: [18, [2, 32]], Q: [26, [2, 24]], H: [16, [4, 9]] }],
  [134, { L: [26, [1, 108]], M: [24, [2, 43]], Q: [18, [2, 15], [2, 16]], H: [22, [2, 11], [2, 12]] }],
  [172, { L: [18, [2, 68]], M: [16, [4, 27]], Q: [24, [4, 19]], H: [28, [4, 15]] }],
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

// ---------- GF(256), Reed-Solomon ----------
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function generator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const h = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { h[j] ^= g[j]; h[j + 1] ^= gmul(g[j], EXP[i]); }
    g = h;
  }
  return g;
}
// Prüf-Codewörter (Rest der Division data·x^n / g)
export function rsPruef(data, n) {
  const g = generator(n), r = new Array(n).fill(0);
  for (const d of data) {
    const f = d ^ r[0];
    r.shift(); r.push(0);
    for (let j = 0; j < n; j++) r[j] ^= gmul(g[j + 1], f);
  }
  return r;
}

// ---------- Format-Information (BCH 15,5) ----------
export function formatBits(stufe, maske) {
  const d = (EC_BITS[stufe] << 3) | maske;
  let r = d << 10;
  for (let i = 14; i >= 10; i--) if (r & (1 << i)) r ^= 0x537 << (i - 10);
  return ((d << 10) | r) ^ 0x5412;
}

const blockInfo = (v, s) => { const [ec, ...gr] = TAB[v][1][s]; return { ec, gr, daten: gr.reduce((a, [k, n]) => a + k * n, 0) }; };

// Daten-Codewörter (Byte-Modus) für Version v
function datenWoerter(bytes, v, s) {
  const { daten } = blockInfo(v, s);
  const bits = [];
  const put = (x, n) => { for (let i = n - 1; i >= 0; i--) bits.push((x >> i) & 1); };
  put(4, 4); put(bytes.length, 8); for (const b of bytes) put(b, 8);
  for (let i = 0; i < 4 && bits.length < daten * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let k = 0; out.length < daten; k++) out.push(k & 1 ? 0x11 : 0xec);
  return out;
}
// Blöcke + Prüfwörter, verschränkt
function codewoerter(bytes, v, s) {
  const { ec, gr } = blockInfo(v, s), D = datenWoerter(bytes, v, s);
  const blocks = []; let p = 0;
  for (const [k, n] of gr) for (let i = 0; i < k; i++) { const d = D.slice(p, p + n); p += n; blocks.push({ d, e: rsPruef(d, ec) }); }
  const out = [], maxD = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

const MASKEN = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

// Grundmuster (Finder, Trenner, Taktlinien, Ausrichtung, dunkles Modul); fest[] = nicht für Daten
function grundmuster(v) {
  const n = 17 + 4 * v, m = new Uint8Array(n * n), fest = new Uint8Array(n * n);
  const set = (r, c, x) => { if (r < 0 || c < 0 || r >= n || c >= n) return; m[r * n + c] = x; fest[r * n + c] = 1; };
  const finder = (r0, c0) => { for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) { const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3)); set(r0 + r, c0 + c, r < 0 || c < 0 || r > 6 || c > 6 ? 0 : ring === 2 ? 0 : 1); } };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0 ? 1 : 0); set(i, 6, i % 2 === 0 ? 1 : 0); }
  const A = ALIGN[v];
  for (const r of A) for (const c of A) {
    if ((r === 6 && c === 6) || (r === 6 && c === A[A.length - 1]) || (r === A[A.length - 1] && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0);
  }
  set(4 * v + 9, 8, 1);
  // Format-Bereiche reservieren
  for (let i = 0; i < 9; i++) { if (!fest[8 * n + i]) set(8, i, 0); if (!fest[i * n + 8]) set(i, 8, 0); }
  for (let i = 0; i < 8; i++) { set(8, n - 1 - i, 0); set(n - 1 - i, 8, 0); }
  set(4 * v + 9, 8, 1);
  return { n, m, fest };
}

// Datenbits im Zickzack setzen (rechts unten beginnend, Spaltenpaare, Spalte 6 ausgelassen)
function platziere(G, woerter) {
  const { n, m, fest } = G;
  const bits = [];
  for (const w of woerter) for (let i = 7; i >= 0; i--) bits.push((w >> i) & 1);
  let k = 0, hoch = true;
  for (let c = n - 1; c > 0; c -= 2) {
    if (c === 6) c = 5;
    for (let j = 0; j < n; j++) {
      const r = hoch ? n - 1 - j : j;
      for (const cc of [c, c - 1]) if (!fest[r * n + cc]) { m[r * n + cc] = k < bits.length ? bits[k] : 0; k++; }
    }
    hoch = !hoch;
  }
}
function formatSetzen(G, stufe, maske) {
  const { n, m } = G, f = formatBits(stufe, maske);
  const bit = (i) => (f >> i) & 1;
  // um den Finder oben links: Bits 0–7 senkrecht (Spalte 8, unten→oben ohne Zeile 6), 8–14 waagerecht
  const senk = [0, 1, 2, 3, 4, 5, 7, 8], waag = [8, 7, 5, 4, 3, 2, 1, 0];
  for (let i = 0; i < 8; i++) m[senk[i] * n + 8] = bit(i);
  for (let i = 0; i < 7; i++) m[8 * n + waag[i + 1]] = bit(8 + i);
  m[8 * n + 8] = bit(7);
  // zweite Kopie: Zeile 8 rechts (Bits 0–7 von rechts nach links), Spalte 8 unten (Bits 8–14 von oben nach unten)
  for (let i = 0; i < 8; i++) m[8 * n + (n - 1 - i)] = bit(i);
  for (let i = 8; i < 15; i++) m[(n - 15 + i) * n + 8] = bit(i);
}
function maskieren(G, k) {
  const { n, m, fest } = G, f = MASKEN[k];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!fest[r * n + c] && f(r, c)) m[r * n + c] ^= 1;
}
// Strafpunkte (Norm: Läufe, 2×2-Blöcke, Finder-ähnliche Muster, Dunkel-Anteil)
export function strafe(m, n) {
  let p = 0;
  const at = (r, c) => m[r * n + c];
  for (let pass = 0; pass < 2; pass++) for (let a = 0; a < n; a++) {
    let lauf = 1;
    for (let b = 1; b < n; b++) {
      const x = pass ? at(b, a) : at(a, b), y = pass ? at(b - 1, a) : at(a, b - 1);
      if (x === y) { lauf++; if (lauf === 5) p += 3; else if (lauf > 5) p++; } else lauf = 1;
    }
  }
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const x = at(r, c); if (x === at(r + 1, c) && x === at(r, c + 1) && x === at(r + 1, c + 1)) p += 3; }
  const muster = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], umg = muster.slice().reverse();
  for (let a = 0; a < n; a++) for (let b = 0; b + 11 <= n; b++) for (const P of [muster, umg]) {
    let z = true, s = true;
    for (let k = 0; k < 11; k++) { if (at(a, b + k) !== P[k]) z = false; if (at(b + k, a) !== P[k]) s = false; }
    if (z) p += 40; if (s) p += 40;
  }
  let dunkel = 0; for (let i = 0; i < n * n; i++) dunkel += m[i];
  p += Math.floor(Math.abs(dunkel * 100 / (n * n) - 50) / 5) * 10;
  return p;
}

export function qrMatrix(text, stufe = 'M', opt = {}) {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  let v = 1;
  while (v <= 6 && blockInfo(v, stufe).daten < bytes.length + 2) v++;
  if (v > 6) throw new Error('Text zu lang für QR-Version 6 (' + bytes.length + ' Byte)');
  const W = codewoerter(bytes, v, stufe);
  let best = null;
  for (let k = 0; k < 8; k++) {
    if (opt.maske != null && k !== opt.maske) continue;
    const G = grundmuster(v);
    platziere(G, W); maskieren(G, k); formatSetzen(G, stufe, k);
    const p = strafe(G.m, G.n);
    if (!best || p < best.p) best = { p, n: G.n, m: G.m, version: v, maske: k, woerter: W };
  }
  return best;
}

// SVG mit Ruhezone (4 Module), ein Pfad für alle dunklen Module
export function qrSvg(text, opt = {}) {
  const Q = qrMatrix(text, opt.stufe || 'M'), n = Q.n, z = 4, w = n + 2 * z;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (Q.m[r * n + c]) d += `M${c + z} ${r + z}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" shape-rendering="crispEdges"${opt.px ? ` width="${opt.px}" height="${opt.px}"` : ''}><rect width="${w}" height="${w}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
