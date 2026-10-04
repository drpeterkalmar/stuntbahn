// Schanzen-Markierung (n24, Peter 03.10.2026: „Textur der Sprungschanze sieht ungustiös aus“): gelb-schwarze Warnstreifen
// als Absprung-Markierung auf den letzten LIP m vor der Lippe und als Lande-Markierung auf den ersten LAND m der
// Landerampe – je ein dünner Streifen knapp über dem Belag, der der Fahrbahn folgt (Linienpunkte, Normale). Reine Optik:
// keine Kollision, Fahrbahn-Geometrie und Strecke bleiben bitgleich. Textur aus einem kleinen Canvas (keine Datei).
import * as THREE from 'three';

export const DECK_MARK = { lip: 1.6, land: 1.2, lift: 0.02, stripe: 0.5 };
let texCache = null;
function stripeTexture() {
  if (texCache) return texCache;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#f2b705'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#16171a';
  // diagonale Streifen (45°), nahtlos kachelnd
  for (let x = -128; x < 256; x += 64) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 32, 64); g.lineTo(x + 96, 0); g.lineTo(x + 64, 0); g.closePath(); g.fill(); }
  // leichte Abnutzung (Reifenabrieb, abgeplatzte Farbe)
  let s = 77; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '40,38,36' : '200,200,196'},${0.05 + R() * 0.12})`; g.fillRect(R() * 128, R() * 64, 1 + R() * 4, 1 + R() * 2); }
  texCache = new THREE.CanvasTexture(c);
  texCache.colorSpace = THREE.SRGBColorSpace;
  texCache.wrapS = texCache.wrapT = THREE.RepeatWrapping;
  texCache.anisotropy = 4;
  return texCache;
}

// Punkt auf der Linie bei Bogenlänge s (lineare Mitte zwischen den Nachbarpunkten)
function lineAt(L, i0, s) {
  let i = i0;
  while (i > 0 && L.s[i] > s) i--;
  while (i < L.n - 2 && L.s[i + 1] < s) i++;
  const a = Math.max(0, Math.min(1, (s - L.s[i]) / Math.max(1e-6, L.s[i + 1] - L.s[i]))), j = i + 1;
  const m = (A) => A[i] + (A[j] - A[i]) * a;
  return { p: [m(L.px), m(L.py), m(L.pz)], n: [m(L.nx), m(L.ny), m(L.nz)], b: [m(L.bx), m(L.by), m(L.bz)], hw: m(L.hw) };
}

// Streifen von s0 bis s1 (Bogenlänge) über die ganze Fahrbahnbreite
function strip(L, i0, s0, s1, out) {
  const n = 6, D = DECK_MARK;
  const base = out.pos.length / 3;
  for (let k = 0; k <= n; k++) {
    const s = s0 + (s1 - s0) * k / n, q = lineAt(L, i0, s);
    const bl = Math.hypot(...q.b) || 1, nl = Math.hypot(...q.n) || 1, hw = q.hw;
    for (const sg of [-1, 1]) {
      out.pos.push(q.p[0] + q.b[0] / bl * sg * hw + q.n[0] / nl * D.lift, q.p[1] + q.b[1] / bl * sg * hw + q.n[1] / nl * D.lift, q.p[2] + q.b[2] / bl * sg * hw + q.n[2] / nl * D.lift);
      out.nrm.push(q.n[0] / nl, q.n[1] / nl, q.n[2] / nl);
      out.uv.push((sg * hw) / (D.stripe * 2), (s - s0) / (D.stripe * 2));
    }
  }
  for (let k = 0; k < n; k++) { const a = base + k * 2; out.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
}

// Gruppe mit allen Markierungen einer Strecke (oder null ohne Schanzen)
export function buildJumpMarks(track) {
  const L = track.line, out = { pos: [], nrm: [], uv: [], idx: [] };
  for (const j of track.jumps || []) {
    if (j.gen || j.lipIdx == null) continue;
    const sl = L.s[j.lipIdx];
    strip(L, j.lipIdx, sl - DECK_MARK.lip, sl - 0.05, out);
    if (j.landLen && j.landIdx != null) { const sa = L.s[j.landIdx]; strip(L, j.landIdx, sa + 0.1, sa + DECK_MARK.land, out); }
  }
  if (!out.idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  g.setIndex(out.idx);
  g.computeBoundingSphere();
  const m = new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.6, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'jump-marks';
  return mesh;
}
