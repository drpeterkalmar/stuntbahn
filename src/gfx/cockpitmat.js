// Cockpit-Materialien (n27, Peter 03.10.2026: „Cockpit detaillierter und schöner machen“): Leder, Alcantara, Carbon und
// gebürstetes Alu – alles prozedural auf Canvas erzeugt (keine Bilddateien, 0 KB Download, eigene Arbeit). Je Material
// eine Farb-/Rauheits-Textur und eine Normal-Map aus einer Höhenkarte (Sobel). Kachelbar (repeat), Größe 256² (Handy).
import * as THREE from 'three';

function rnd(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
// glattes Kachel-Rauschen (Werte-Rauschen, mehrere Oktaven), periodisch über N
function noiseField(N, seed, octs) {
  const R = rnd(seed), out = new Float32Array(N * N);
  for (const [g, a] of octs) {
    const v = new Float32Array(g * g); for (let i = 0; i < v.length; i++) v[i] = R();
    const V = (i, j) => v[((j % g) + g) % g * g + ((i % g) + g) % g];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / N * g, fy = y / N * g, x0 = Math.floor(fx), y0 = Math.floor(fy);
      let tx = fx - x0, ty = fy - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      out[y * N + x] += a * ((V(x0, y0) * (1 - tx) + V(x0 + 1, y0) * tx) * (1 - ty) + (V(x0, y0 + 1) * (1 - tx) + V(x0 + 1, y0 + 1) * tx) * ty);
    }
  }
  return out;
}
// Normal-Map aus Höhenkarte h (0 … 1), Stärke k
function normalFrom(N, h, k) {
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const H = (i, j) => h[((j + N) % N) * N + ((i + N) % N)];
    const dx = (H(x + 1, y) - H(x - 1, y)) * k, dy = (H(x, y + 1) - H(x, y - 1)) * k;
    const l = Math.hypot(dx, dy, 1), o = (y * N + x) * 4;
    d[o] = Math.round((-dx / l * 0.5 + 0.5) * 255); d[o + 1] = Math.round((dy / l * 0.5 + 0.5) * 255); d[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); d[o + 3] = 255;
  }
  return tex(d, N, false);
}
function tex(data, N, srgb) {
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
function colorTex(N, f) {
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = f(x, y), o = (y * N + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; }
  return tex(d, N, true);
}

// Leder: feine Narbung (Poren-Rauschen + Zellen), leicht fleckig, Rauheit schwankt (abgegriffen glänzender)
export function leather(N = 256) {
  const h = noiseField(N, 11, [[64, 0.55], [128, 0.3], [16, 0.15]]);
  const big = noiseField(N, 23, [[4, 1]]);
  const col = colorTex(N, (x, y) => { const v = 50 + 16 * h[y * N + x] + 8 * big[y * N + x]; return [v + 2, v, v - 2]; });
  const rough = colorTex(N, (x, y) => { const v = 150 + 80 * h[y * N + x] - 50 * big[y * N + x]; return [v, v, v]; });
  rough.colorSpace = THREE.NoColorSpace;
  return { map: col, normalMap: normalFrom(N, h, 2.2), roughnessMap: rough };
}
// Alcantara (Dachhimmel, A-Säulen): sehr fein, matt, weich (kaum Normalen), warmes Mittelgrau
export function alcantara(N = 256) {
  const h = noiseField(N, 37, [[128, 0.6], [64, 0.4]]);
  const col = colorTex(N, (x, y) => { const v = 92 + 16 * h[y * N + x]; return [v + 2, v, v - 3]; });
  return { map: col, normalMap: normalFrom(N, h, 0.9) };
}
// Carbon: Köper 2×2 (Faserbündel abwechselnd quer/längs, versetzt), je Bündel Glanz-Verlauf; Normale aus der Wölbung
export function carbon(N = 256) {
  const C = 16, cell = N / C, h = new Float32Array(N * N);
  const col = colorTex(N, (x, y) => {
    const i = Math.floor(x / cell), j = Math.floor(y / cell), fx = (x % cell) / cell, fy = (y % cell) / cell;
    const horiz = ((i + Math.floor(j / 2) * 2 + j) >> 1) % 2 === 0;   // Köper: Diagonal-Versatz
    const t = horiz ? fy : fx, s = horiz ? fx : fy;
    const bulge = Math.sin(Math.PI * t), fib = 0.85 + 0.15 * Math.sin(s * 40 + t * 3);
    h[y * N + x] = bulge * 0.8;
    const v = (horiz ? 38 : 62) * (0.5 + 0.5 * bulge) * fib;
    return [v, v, v + 3];
  });
  return { map: col, normalMap: normalFrom(N, h, 1.6) };
}
// gebürstetes Alu: feine Längsstreifen (Rauschen nur entlang y gestreckt)
export function brushed(N = 256) {
  const R = rnd(53), line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = R();
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = line[y] * 0.7 + 0.3 * line[(y * 7 + (x >> 5)) % N];
  const col = colorTex(N, (x, y) => { const v = 175 + 45 * h[y * N + x]; return [v, v + 2, v + 6]; });
  return { map: col, normalMap: normalFrom(N, h, 0.6) };
}

// Material-Satz des Cockpits; tier 0 (Einfach): ohne Normal-Maps
export function cockpitMaterials(tier = 2) {
  const L = leather(), A = alcantara(), C = carbon(), B = brushed();
  const nm = tier > 0;
  const rep = (t, r) => { if (t) t.repeat.set(r, r); return t; };
  return {
    leather: new THREE.MeshStandardMaterial({ map: L.map, normalMap: nm ? L.normalMap : null, roughnessMap: L.roughnessMap, roughness: 0.8, metalness: 0, normalScale: new THREE.Vector2(0.9, 0.9), side: THREE.DoubleSide }),
    alcantara: new THREE.MeshStandardMaterial({ map: A.map, normalMap: nm ? A.normalMap : null, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
    carbon: new THREE.MeshPhysicalMaterial({ map: C.map, normalMap: nm ? C.normalMap : null, roughness: 0.38, metalness: 0.15, clearcoat: nm ? 0.8 : 0, clearcoatRoughness: 0.12, normalScale: new THREE.Vector2(0.5, 0.5), side: THREE.DoubleSide }),
    brushed: new THREE.MeshStandardMaterial({ map: B.map, normalMap: nm ? B.normalMap : null, roughness: 0.32, metalness: 1, side: THREE.DoubleSide }),
    _tex: [L, A, C, B], rep,
  };
}
