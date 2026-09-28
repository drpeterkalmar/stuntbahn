// Optik (28.09.2026): Grafik der Deko aus track/deco.js – alles instanziert bzw. zusammengefasst (~20 Draw-Calls):
//  Randstreifen + Kiesbetten (ein Band-Mesh, Kies-Textur, weiche Kanten), Reifenabrieb auf der Ideallinie,
//  Reifenstapel, Leitplanken (Band + Pfosten), Werbebanner/Bremstafeln/Zuschauer (Atlas-Karten), Zaun, Tribünen,
//  Streckenposten, Flutlichtmasten, Gras/Blumen/Büsche/Laubbäume (Karten aus Poly-Haven-Modellen, Atlas),
//  Felsen (Poly Haven, vereinfacht), entfernte Bauernhöfe. Keine Kollision.
//  Karten blenden mit der Entfernung aus (Gras/Blumen ab ~55 m), Gras wiegt sich leicht im Wind.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { patchStaticShadow } from './materials.js';
import { planDeco } from '../track/deco.js';
import { MAT } from '../track/defs.js';

export const decoUniforms = { uTime: { value: 0 } };
let assets = null;
// Einmal beim Start laden: Pflanzen-Atlas (+ Maße) und Felsen
export async function loadDecoAssets() {
  if (assets) return assets;
  const tl = new THREE.TextureLoader();
  const [meta, veg, rocks, gd, gn] = await Promise.all([
    fetch('assets/tex/veg_atlas.json').then((r) => r.json()),
    tl.loadAsync('assets/tex/veg_atlas.webp'),
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('assets/deco/rocks.glb'),
    tl.loadAsync('assets/tex/gravel_diff.webp'),
    tl.loadAsync('assets/tex/gravel_nor.webp'),
  ]);
  veg.colorSpace = THREE.SRGBColorSpace; veg.anisotropy = 4;
  gd.colorSpace = THREE.SRGBColorSpace;
  for (const t of [gd, gn]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  const rockGeo = [];
  let rockMat = null;
  rocks.scene.traverse((o) => { if (o.isMesh) { rockGeo.push(o.geometry); rockMat = rockMat || o.material; } });
  assets = { meta, veg, rockGeo, rockMat, gd, gn };
  return assets;
}

// ---------- kleine Geometrie-Werkstatt (Vertexfarben) ----------
class GB {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.i = []; }
  v(p, n, c, u = 0, w = 0) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.c.push(c[0], c[1], c[2]); this.uv.push(u, w); return this.p.length / 3 - 1; }
  quad(a, b, c, d, n, col) { const i = [this.v(a, n, col, 0, 0), this.v(b, n, col, 1, 0), this.v(c, n, col, 1, 1), this.v(d, n, col, 0, 1)]; this.i.push(i[0], i[1], i[2], i[0], i[2], i[3]); }
  // Quader: Mitte (x, y, z), Maße, Drehung um y
  box(x, y, z, sx, sy, sz, col, yaw = 0, skipBottom = true) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (a, b, c) => [x + a * cs + c * sn, y + b, z - a * sn + c * cs];
    const N = (a, b, c) => [a * cs + c * sn, b, -a * sn + c * cs];
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    this.quad(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), N(0, 0, 1), col);
    this.quad(P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), N(0, 0, -1), col);
    this.quad(P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), N(1, 0, 0), col);
    this.quad(P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), N(-1, 0, 0), col);
    this.quad(P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), N(0, 1, 0), col);
    if (!skipBottom) this.quad(P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), N(0, -1, 0), col);
  }
  // senkrechter Zylinder/Kegelstumpf ab Höhe y
  cyl(x, y, z, r0, r1, h, seg, col, cap = true, colTop = null) {
    for (let k = 0; k < seg; k++) {
      const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
      const c0 = [Math.cos(a0), Math.sin(a0)], c1 = [Math.cos(a1), Math.sin(a1)];
      const sl = (r0 - r1) / h;
      const n0 = new THREE.Vector3(c0[0], sl, c0[1]).normalize(), n1 = new THREE.Vector3(c1[0], sl, c1[1]).normalize();
      const i0 = this.v([x + c0[0] * r0, y, z + c0[1] * r0], n0.toArray(), col), i1 = this.v([x + c1[0] * r0, y, z + c1[1] * r0], n1.toArray(), col);
      const i2 = this.v([x + c1[0] * r1, y + h, z + c1[1] * r1], n1.toArray(), col), i3 = this.v([x + c0[0] * r1, y + h, z + c0[1] * r1], n0.toArray(), col);
      this.i.push(i0, i2, i1, i0, i3, i2);
      if (cap && r1 > 0.01) { const ct = colTop || col; const a = this.v([x, y + h, z], [0, 1, 0], ct), b = this.v([x + c0[0] * r1, y + h, z + c0[1] * r1], [0, 1, 0], ct), c = this.v([x + c1[0] * r1, y + h, z + c1[1] * r1], [0, 1, 0], ct); this.i.push(a, c, b); }
    }
  }
  // Satteldach: Grundfläche sx × sz ab Höhe y, First entlang x, Firsthöhe h
  gable(x, y, z, sx, sz, h, col, yaw = 0, over = 0.4) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (a, b, c) => [x + a * cs + c * sn, y + b, z - a * sn + c * cs];
    const N = (a, b, c) => { const v = new THREE.Vector3(a * cs + c * sn, b, -a * sn + c * cs).normalize(); return v.toArray(); };
    const hx = sx / 2 + over, hz = sz / 2 + over;
    this.quad(P(-hx, 0, hz), P(hx, 0, hz), P(hx, h, 0), P(-hx, h, 0), N(0, hz, h), col);
    this.quad(P(hx, 0, -hz), P(-hx, 0, -hz), P(-hx, h, 0), P(hx, h, 0), N(0, hz, -h), col);
    for (const s of [-1, 1]) {
      const a = this.v(P(s * sx / 2, 0, -sz / 2), N(s, 0, 0), col), b = this.v(P(s * sx / 2, 0, sz / 2), N(s, 0, 0), col), c = this.v(P(s * sx / 2, h * (sz / 2) / hz, 0), N(s, 0, 0), col);
      if (s > 0) this.i.push(a, c, b); else this.i.push(a, b, c);
    }
  }
  geo(alpha = null) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (alpha) { const c4 = []; for (let k = 0; k < this.c.length / 3; k++) c4.push(this.c[k * 3], this.c[k * 3 + 1], this.c[k * 3 + 2], alpha[k]); g.setAttribute('color', new THREE.Float32BufferAttribute(c4, 4)); }
    else g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

// ---------- Canvas-Texturen (eigene Arbeit, fiktive Marken) ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// 8 Werbebanner (je 512 × 96) in einem 1024 × 512-Atlas + 3 Bremstafeln (150/100/50) unten rechts
const ADS = [
  ['KALMAR REIFEN', '#101820', '#ffcc00'], ['BLITZ COLA', '#c8102e', '#ffffff'], ['ALPENSTROM', '#ffffff', '#0a5ca8'], ['TURBO-ÖL', '#111111', '#ff6a00'],
  ['STUNTBAHN', '#0e1116', '#e8e8e8'], ['WIESENMILCH', '#2e7d32', '#ffffff'], ['RAPID TV', '#1a237e', '#ffd54f'], ['DONAU VERSICHERT', '#f5f5f0', '#b71c1c'],
];
function signAtlas() {
  return canvasTex(1024, 512, (g) => {
    g.fillStyle = '#777'; g.fillRect(0, 0, 1024, 512);
    ADS.forEach(([t, bg, fg], k) => {
      const x = (k % 2) * 512, y = Math.floor(k / 2) * 96;
      g.fillStyle = bg; g.fillRect(x, y, 512, 96);
      g.fillStyle = fg; g.font = `bold ${t.length > 13 ? 50 : 60}px Arial, Helvetica, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t, x + 256, y + 50);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, y + 88, 512, 8);
    });
    // Bremstafeln: weiß, rote Umrandung, schwarze Zahl (je 160 × 128 ab y = 384)
    ['150', '100', '50'].forEach((t, k) => {
      const x = k * 170, y = 384;
      g.fillStyle = '#c62828'; g.fillRect(x, y, 160, 128);
      g.fillStyle = '#f7f7f2'; g.fillRect(x + 10, y + 10, 140, 108);
      g.fillStyle = '#111'; g.font = 'bold 76px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t, x + 80, y + 68);
    });
  });
}
const AD_CELL = (k) => [(k % 2) * 0.5, 1 - (Math.floor(k / 2) * 96 + 96) / 512, 0.5, 96 / 512];
const BOARD_CELL = (k) => [k * 170 / 1024, 0, 160 / 1024, 128 / 512];
// Zuschauer: 4 Streifen (je 1024 × 128) – sitzend (Tribüne, dunkle Sitzreihe dahinter) und stehend (transparent)
function crowdAtlas() {
  return canvasTex(1024, 512, (g) => {
    let seed = 12345; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const shirts = ['#c62828', '#1565c0', '#f9a825', '#2e7d32', '#eeeeee', '#212121', '#6a1b9a', '#ef6c00', '#00838f', '#ad1457', '#8d6e63', '#90a4ae'];
    const skins = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
    for (let row = 0; row < 4; row++) {
      const y0 = row * 128, seated = row < 2;
      const people = seated ? 60 : 44;
      for (let k = 0; k < people; k++) {
        const x = (k + R() * 0.6) * 1024 / people, s = seated ? 1 : 1.15 + R() * 0.25;
        const top = seated ? y0 + 34 + R() * 8 : y0 + 18 + R() * 14;
        g.fillStyle = shirts[Math.floor(R() * shirts.length)];
        g.beginPath(); g.ellipse(x, top + 42 * s, 8.5 * s, 25 * s, 0, 0, Math.PI * 2); g.fill();
        if (!seated) { g.fillStyle = R() < 0.5 ? '#263238' : '#3e2723'; g.fillRect(x - 6 * s, top + 60 * s, 5 * s, 44 * s); g.fillRect(x + 1 * s, top + 60 * s, 5 * s, 44 * s); }
        g.fillStyle = skins[Math.floor(R() * skins.length)];
        g.beginPath(); g.arc(x, top + 11 * s, 7.5 * s, 0, Math.PI * 2); g.fill();
        if (R() < 0.35) { g.fillStyle = shirts[Math.floor(R() * shirts.length)]; g.fillRect(x - 8 * s, top + 1 * s, 16 * s, 5 * s); }   // Mütze
        if (R() < 0.12) { g.fillStyle = R() < 0.5 ? '#ffeb3b' : '#e53935'; g.fillRect(x + 6 * s, top - 10 * s, 14 * s, 10 * s); }   // Fähnchen
      }
    }
  });
}
function chainTex() {
  const t = canvasTex(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(190,196,200,1)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.moveTo(-32, 32); g.lineTo(32, 96); g.moveTo(32, -32); g.lineTo(96, 32); g.moveTo(96, 32); g.lineTo(32, 96); g.moveTo(32, -32); g.lineTo(-32, 32); g.stroke();
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Material mit Atlas-Zelle je Instanz (Attribut iCell = u0, v0, du, dv), optional Ausblenden mit der Entfernung
// (uFade: Beginn/Ende in m) und Wind (Stärke uWind, wirkt nach oben zunehmend)
function cellMaterial(opts, fade = [1e6, 1e6], wind = 0) {
  const m = new THREE.MeshStandardMaterial(opts);
  const uFade = { value: new THREE.Vector2(fade[0], fade[1]) }, uWind = { value: wind };
  m.userData.uFade = uFade;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFade = uFade; sh.uniforms.uWind = uWind; sh.uniforms.uTime = decoUniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 iCell;\nuniform vec2 uFade;\nuniform float uWind, uTime;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = iCell.xy + uv * iCell.zw;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec4 ip = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
        float f = 1.0 - smoothstep( uFade.x, uFade.y, distance( ip.xyz, cameraPosition ) );
        transformed *= f;
        transformed.x += uWind * position.y * sin( uTime * 1.9 + ip.x * 0.37 + ip.z * 0.23 );
      }`);
  };
  m.customProgramCacheKey = () => 'decoCell';
  patchStaticShadow(m);
  return m;
}
// Kreuzkarten: k senkrechte Karten (Breite 1, Höhe 1, Fuß bei y = 0); Normalen nach oben/außen (weiches Licht)
function cardGeometry(k, up = 0.6) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (let c = 0; c < k; c++) {
    const a = c * Math.PI / k, cx = Math.cos(a), cz = Math.sin(a), b = pos.length / 3;
    for (const [x, y, u, v] of [[-0.5, 0, 0, 0], [0.5, 0, 1, 0], [0.5, 1, 1, 1], [-0.5, 1, 0, 1]]) {
      pos.push(cx * x, y, cz * x); uv.push(u, v);
      const n = new THREE.Vector3(cx * x * 0.6, up + y * 0.4, cz * x * 0.6).normalize(); nrm.push(n.x, n.y, n.z);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
function quadGeometry() {   // senkrechte Fläche 1 × 1, Normale +z, Fuß y = 0
  const g = new THREE.PlaneGeometry(1, 1); g.translate(0, 0.5, 0);
  return g;
}

// Instanzen setzen: list [{x, y, z, rot, sx, sy, sz, cell?, color?}]
function instanced(geo, mat, list, name, cells = null, colors = null) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const cellArr = cells ? new Float32Array(list.length * 4) : null;
  list.forEach((it, k) => {
    q.setFromAxisAngle(up, it.rot || 0);
    s.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? it.sx ?? 1);
    p.set(it.x, it.y, it.z);
    m4.compose(p, q, s);
    im.setMatrixAt(k, m4);
    if (cellArr) cellArr.set(it.cell, k * 4);
    if (colors) im.setColorAt(k, it.color);
  });
  if (cellArr) geo.setAttribute('iCell', new THREE.InstancedBufferAttribute(cellArr, 4));
  im.computeBoundingSphere();
  im.name = name;
  return im;
}

// Texturen/Materialien einmal anlegen (Streckenwechsel baut nur Geometrie neu)
const memo = new Map();
const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
const once = (key, make) => { if (!memo.has(key)) memo.set(key, make()); return memo.get(key); };

// Hauptfunktion: Deko planen und als Meshes an root hängen. add(mesh, caster) aus world.js; surfaceY = gezeichnete
// Geländehöhe. Rückgabe: Statistik (Instanzen, Dreiecke)
export function buildDeco(track, M, surfaceY, add, opts = {}) {
  const A = assets;
  const stats = { inst: 0, tris: 0, meshes: 0 };
  if (!A) return stats;
  const tier = opts.tier ?? 1;
  const plan = planDeco(track, { ideal: opts.ideal, prof: opts.prof, tier, seed: track.layout?.seed || 1 });
  stats.plan = Object.fromEntries(Object.entries(plan.inst).map(([k, v]) => [k, v.length]));
  const count = (mesh, n, triPer) => { stats.inst += n; stats.tris += n * triPer; stats.meshes++; };
  const P = plan.inst;
  const gy = (x, z) => surfaceY(x, z);

  // ----- Randstreifen + Kiesbetten: ein Band-Mesh, Kies-Textur in Weltkoordinaten, weiche Außenkante -----
  {
    const pos = [], col = [], uv = [], nrm = [], idx = [];
    for (const st of plan.strips) {
      const gravel = st.kind === 'gravel';
      const tint = gravel ? [1.0, 0.97, 0.9] : [0.55, 0.49, 0.4];
      const nP = st.pts.length;
      st.pts.forEach((p, k) => {
        const endA = Math.min(1, Math.min(k, nP - 1 - k) / 2);
        // innen, Mitte, außen (außen weich auslaufend)
        const pts = [[p.x0, p.z0, 1], [p.x0 + (p.x1 - p.x0) * 0.7, p.z0 + (p.z1 - p.z0) * 0.7, 0.95], [p.x1, p.z1, 0]];
        for (const [x, z, a] of pts) {
          pos.push(x, gy(x, z) + (gravel ? 0.035 : 0.025), z);
          nrm.push(0, 1, 0); uv.push(x / 3.2, z / 3.2);
          col.push(tint[0], tint[1], tint[2], a * endA * (gravel ? 1 : 0.9));
        }
        if (k > 0) { const b = pos.length / 3 - 6; for (const [a0, a1] of [[0, 1], [1, 2]]) idx.push(b + a0, b + 3 + a0, b + a1, b + a1, b + 3 + a0, b + 3 + a1); }
      });
    }
    if (idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = once('strip', () => patchStaticShadow(new THREE.MeshStandardMaterial({ map: A.gd, normalMap: A.gn, vertexColors: true, transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })));
      const mesh = new THREE.Mesh(g, m); mesh.name = 'deco-strips'; mesh.renderOrder = 1;
      add(mesh, false); count(mesh, 1, idx.length / 3); stats.inst--;
    }
  }
  // ----- Reifenabrieb (zwei dunkle Spuren im Radabstand, fleckig) -----
  if (plan.marks.length) {
    const pos = [], col = [], idx = [];
    let seed = 7; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const run of plan.marks) for (const off of [-0.82, 0.82]) {
      const b0 = pos.length / 3;
      run.forEach((p, k) => {
        const e = Math.min(1, Math.min(k, run.length - 1 - k) / 4);
        const a = p.a * e * (0.45 + 0.55 * R());
        for (const w of [-0.17, 0.17]) { pos.push(p.x + p.bx * (off + w), p.y + 0.012, p.z + p.bz * (off + w)); col.push(0, 0, 0, a); }
        if (k > 0) { const b = b0 + (k - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = once('marks', () => new THREE.MeshBasicMaterial({ color: 0x0a0a0a, vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    const mesh = new THREE.Mesh(g, m); mesh.name = 'deco-marks'; mesh.renderOrder = 1;
    add(mesh, false); count(mesh, 1, idx.length / 3); stats.inst--;
  }

  const paint = M[MAT.PAINT];
  // ----- Reifenstapel: 3 Stapel à 3 Reifen, oberer Reifen per Instanzfarbe rot/weiß -----
  if (P.tyre && P.tyre.length) {
    const b = new GB(), dark = [0.05, 0.05, 0.055], top = [0.95, 0.95, 0.95];
    // je Stapel: unten zwei Reifen als ein Zylinder, oben der bemalte Reifen mit Deckel (8 Segmente, 40 Dreiecke)
    for (const x of [-0.7, 0, 0.7]) { b.cyl(x, 0, 0, 0.34, 0.34, 0.51, 8, dark, false); b.cyl(x, 0.52, 0, 0.34, 0.34, 0.25, 8, top, true, [0.04, 0.04, 0.04]); }
    const g = b.geo();
    const red = new THREE.Color(0.75, 0.08, 0.06), white = new THREE.Color(0.93, 0.93, 0.9);
    const list = P.tyre.map((t) => ({ x: t.x, y: gy(t.x, t.z) - 0.02, z: t.z, rot: t.rot, color: t.v ? red : white }));
    const im = instanced(g, paint, list, 'deco-tyres', null, true);
    add(im, true); count(im, list.length, g.index.count / 3);
  }
  // ----- Leitplanken: Band (Doppelwelle angedeutet) + Pfosten -----
  if (plan.rails.length) {
    const pos = [], nrm = [], idx = [];
    const posts = [];
    for (const run of plan.rails) {
      const b0 = pos.length / 3;
      run.forEach((p, k) => {
        const y = gy(p.x, p.z);
        const nx = Math.sin(p.rot), nz = Math.cos(p.rot);   // zur Straße
        // Profil: unten schräg nach unten, Mitte, oben schräg nach oben (Normalen) → Welle im Licht
        for (const [h, ny] of [[0.52, -0.5], [0.63, 0.1], [0.71, -0.1], [0.82, 0.5]]) { pos.push(p.x, y + h, p.z); const l = Math.hypot(nx, ny, nz); nrm.push(nx / l, ny / l, nz / l); }
        if (k > 0) { const b = b0 + (k - 1) * 4; for (let r = 0; r < 3; r++) idx.push(b + r, b + 4 + r, b + r + 1, b + r + 1, b + 4 + r, b + 5 + r); }
        posts.push({ x: p.x - nx * 0.12, y: y, z: p.z - nz * 0.12, rot: p.rot });   // Pfosten alle 4 m
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = once('rail', () => patchStaticShadow(new THREE.MeshStandardMaterial({ color: 0xb9c0c6, roughness: 0.42, metalness: 0.75, side: THREE.DoubleSide, envMapIntensity: 1.1 })));
    const mesh = new THREE.Mesh(g, m); mesh.name = 'deco-rails';
    add(mesh, true); count(mesh, 1, idx.length / 3); stats.inst--;
    const pb = new GB(); pb.box(0, 0.42, -0.06, 0.1, 0.84, 0.14, [0.55, 0.57, 0.6]);
    pb.i.length = 24;   // nur die vier Seiten (8 Dreiecke), Deckel sieht man unter der Planke nicht
    const pg = pb.geo();
    const im = instanced(pg, paint, posts, 'deco-railposts');
    add(im, false); count(im, posts.length, pg.index.count / 3);
  }
  // ----- Atlas-Karten: Banner, Bremstafeln -----
  const signMat = once('signs', () => cellMaterial({ map: signAtlas(), roughness: 0.6, metalness: 0 }));
  {
    const list = [];
    // Bandenwerbung steht auf dem Boden vor der Leitplanke (1,1 m hoch, Seitenverhältnis wie im Atlas)
    for (const b of P.banner || []) { const y = gy(b.x, b.z); list.push({ x: b.x, y: y - 0.06, z: b.z, rot: b.rot, sx: 1.12 * 512 / 96, sy: 1.12, cell: AD_CELL(b.v) }); }
    for (const b of P.board || []) {
      const y = gy(b.x, b.z);
      list.push({ x: b.x + Math.sin(b.rot) * 0.03, y: y + 0.85, z: b.z + Math.cos(b.rot) * 0.03, rot: b.rot, sx: 1.25, sy: 1.0, cell: BOARD_CELL(b.v) });
    }
    if (list.length) { const g = quadGeometry(); const im = instanced(g, signMat, list, 'deco-signs', true); add(im, false); count(im, list.length, 2); }
    if (P.board && P.board.length) {
      const b = new GB(); b.box(0, 1.35, -0.02, 1.3, 1.05, 0.06, [0.92, 0.92, 0.9]);
      for (const x of [-0.45, 0.45]) b.box(x, 0.42, -0.06, 0.08, 0.84, 0.06, [0.5, 0.5, 0.52]);
      const g = b.geo();
      const im = instanced(g, paint, P.board.map((t) => ({ x: t.x, y: gy(t.x, t.z), z: t.z, rot: t.rot })), 'deco-boardposts');
      add(im, true); count(im, P.board.length, g.index.count / 3);
    }
  }
  // ----- Zaun (Maschendraht) -----
  if (plan.fences.length) {
    const pos = [], nrm = [], uv = [], idx = [];
    for (const f of plan.fences) {
      const b0 = pos.length / 3;
      let s = 0;
      f.forEach((p, k) => {
        if (k) s += Math.hypot(p.x - f[k - 1].x, p.z - f[k - 1].z);
        const y = gy(p.x, p.z);
        pos.push(p.x, y - 0.1, p.z, p.x, y + 2.4, p.z); nrm.push(0, 0.3, 1, 0, 0.3, 1); uv.push(s / 0.5, 0, s / 0.5, 5);
        if (k) { const b = b0 + (k - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = once('fence', () => patchStaticShadow(new THREE.MeshStandardMaterial({ map: chainTex(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6, color: 0xc8ccd0 })));
    const mesh = new THREE.Mesh(g, m); mesh.name = 'deco-fence';
    add(mesh, false); count(mesh, 1, idx.length / 3); stats.inst--;
  }
  // ----- Tribünen (Stufen, Dach) + Zuschauer (Karten) -----
  const crowdList = [];
  if (P.stand && P.stand.length) {
    const b = new GB(), conc = [0.62, 0.61, 0.58], seat = [0.2, 0.33, 0.55], roof = [0.82, 0.83, 0.85], steel = [0.45, 0.47, 0.5];
    const L = 18, steps = 7, D = 1.5, Hs = 0.75;
    for (let k = 0; k < steps; k++) { const z = -1 - k * D, h = 1.2 + k * Hs; b.box(0, h / 2 - 0.5, z, L, h + 1, D, k % 2 ? conc : seat); }
    b.box(0, (1.2 + steps * Hs) / 2 + 0.6, -1 - steps * D + 0.4, L, 1.2 + steps * Hs + 2, 0.4, conc);          // Rückwand
    b.box(0, 1.2 + steps * Hs + 3.3, -1 - (steps - 1) * D / 2 - 0.7, L + 1, 0.25, steps * D + 3, roof);        // Dach
    for (const x of [-L / 2 + 0.5, 0, L / 2 - 0.5]) b.box(x, (1.2 + steps * Hs + 3.3) / 2, -0.6, 0.3, 1.2 + steps * Hs + 3.3, 0.3, steel);
    b.box(0, 0.55, 0.2, L, 1.1, 0.25, [0.9, 0.9, 0.88]);                                                         // Brüstung vorn
    const g = b.geo();
    const list = P.stand.map((t) => ({ x: t.x, y: gy(t.x, t.z) - 0.1, z: t.z, rot: t.rot }));
    const im = instanced(g, paint, list, 'deco-stands');
    add(im, true); count(im, list.length, g.index.count / 3);
    for (const t of list) for (let k = 0; k < steps; k++) {
      const zl = -1 - k * D + 0.2, h = 1.2 + k * Hs - 0.5;
      const cs = Math.cos(t.rot), sn = Math.sin(t.rot);
      crowdList.push({ x: t.x + zl * sn, y: t.y + h + 0.45, z: t.z + zl * cs, rot: t.rot, sx: L - 0.6, sy: (L - 0.6) * 128 / 1024, cell: [0, 1 - ((k % 2) * 128 + 128) / 512, 1, 128 / 512] });
    }
  }
  // Gruppen: 3,4 m breite Ausschnitte (Maßstab wie die 7,4-m-Streifen: 128 px = 1,85 m), je Karte ein anderer Ausschnitt
  (P.crowd || []).forEach((c, k) => crowdList.push({ x: c.x, y: gy(c.x, c.z) - 0.05, z: c.z, rot: c.rot, sx: 3.4, sy: 1.85, cell: [((k * 0.29 + c.v * 0.13) % 0.77), 1 - ((2 + c.v % 2) * 128 + 128) / 512, 0.23, 128 / 512] }));
  if (crowdList.length) {
    const m = once('crowd', () => cellMaterial({ map: crowdAtlas(), alphaTest: 0.5, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }));
    const g = quadGeometry();
    const im = instanced(g, m, crowdList, 'deco-crowd', true);
    add(im, false); count(im, crowdList.length, 2);
  }
  // ----- Streckenposten -----
  if (P.hut && P.hut.length) {
    const b = new GB();
    b.box(0, 1.1, 0, 2.4, 2.2, 2.2, [0.92, 0.92, 0.9]);
    b.box(0, 2.3, 0, 2.8, 0.2, 2.6, [0.95, 0.45, 0.05]);
    b.box(0, 1.45, 1.11, 2.0, 0.7, 0.02, [0.08, 0.1, 0.13]);
    b.box(1.35, 1.9, 1.0, 0.06, 3.8, 0.06, [0.6, 0.6, 0.6]); b.box(1.7, 3.5, 1.0, 0.7, 0.45, 0.02, [0.95, 0.8, 0.05]);   // Flagge
    const g = b.geo();
    const im = instanced(g, paint, P.hut.map((t) => ({ x: t.x, y: gy(t.x, t.z) - 0.05, z: t.z, rot: t.rot })), 'deco-huts');
    add(im, true); count(im, P.hut.length, g.index.count / 3);
  }
  // ----- Flutlichtmasten -----
  if (P.mast && P.mast.length) {
    const b = new GB(), st = [0.62, 0.64, 0.67];
    b.cyl(0, -0.5, 0, 0.32, 0.16, 25.5, 8, st, false);
    b.box(0, 24.6, 0.25, 3.4, 1.6, 0.35, [0.3, 0.32, 0.35]);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) b.box(-1.2 + c * 0.8, 24.2 + r * 0.8, 0.45, 0.6, 0.55, 0.06, [1.0, 0.98, 0.9]);
    const g = b.geo();
    const im = instanced(g, paint, P.mast.map((t) => ({ x: t.x, y: gy(t.x, t.z), z: t.z, rot: t.rot })), 'deco-masts');
    add(im, true); count(im, P.mast.length, g.index.count / 3);
  }
  // ----- Pflanzen (Atlas aus Poly-Haven-Modellen): Gras/Blumen, Büsche, Laubbäume -----
  const Mt = A.meta, cell = (n) => Mt[n].uv;
  const vegOpts = { map: A.veg, alphaTest: 0.45, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.92, metalness: 0 };
  const fadeG = tier >= 2 ? [55, 85] : [35, 55];
  if (tier > 0 && ((P.grass && P.grass.length) || (P.flower && P.flower.length))) {
    const list = [];
    const GR = ['gras1', 'gras2'], FL = ['blume1', 'blume2', 'blume3', 'blume4'];
    for (const t of P.grass || []) { const n = GR[t.v % 2], w = Mt[n].w * t.s, h = Mt[n].h * t.s; list.push({ x: t.x, y: gy(t.x, t.z) - 0.04, z: t.z, rot: t.rot, sx: w, sy: h, cell: cell(n) }); }
    for (const t of P.flower || []) { const n = FL[t.v % 4], w = Mt[n].w * t.s, h = Mt[n].h * t.s; list.push({ x: t.x, y: gy(t.x, t.z) - 0.03, z: t.z, rot: t.rot, sx: w, sy: h, cell: cell(n) }); }
    const m = once('grass' + tier, () => cellMaterial({ ...vegOpts, color: lin(1.9, 2.5, 1.35) }, fadeG, 0.06));
    const im = instanced(cardGeometry(2, 0.9), m, list, 'deco-grass', true);
    add(im, false); count(im, list.length, 4);
  }
  if (P.bush && P.bush.length) {
    const BU = ['busch3', 'busch4'];
    const list = P.bush.map((t) => { const n = BU[t.v % 2]; return { x: t.x, y: gy(t.x, t.z) - 0.15, z: t.z, rot: t.rot, sx: Mt[n].w * t.s, sy: Mt[n].h * t.s, cell: cell(n) }; });
    const m = once('bush', () => cellMaterial({ ...vegOpts, color: lin(1.6, 1.7, 1.35) }, [260, 340], 0.02));
    const im = instanced(cardGeometry(3, 0.6), m, list, 'deco-bushes', true);
    add(im, true); count(im, list.length, 6);
  }
  if (P.laub && P.laub.length) {
    const LB = ['laub1', 'laub2'], H = { laub1: 11.5, laub2: 10 };
    const list = P.laub.map((t) => { const n = LB[t.v % 2], k = H[n] / Mt[n].h * t.s; return { x: t.x, y: gy(t.x, t.z) - 0.25, z: t.z, rot: t.rot, sx: Mt[n].w * k, sy: Mt[n].h * k, cell: cell(n) }; });
    const m = once('laub', () => cellMaterial({ ...vegOpts, color: lin(1.4, 1.5, 1.25), emissive: 0x0a1206 }));
    const im = instanced(cardGeometry(tier >= 2 ? 3 : 2, 0.5), m, list, 'deco-laub', true);   // Stufe 0/1: 2 Karten (weniger Überzeichnen)
    add(im, true); count(im, list.length, 6);
  }
  // ----- Felsen (drei Formen, je ein instanziertes Mesh) -----
  if (P.rock && P.rock.length && A.rockGeo.length) {
    const rm = once('rock', () => { const r = A.rockMat.clone(); r.roughness = 0.95; r.color.setRGB(1.7, 1.7, 1.6); return patchStaticShadow(r); });
    for (let v = 0; v < A.rockGeo.length; v++) {
      const g = A.rockGeo[v];
      if (!g.boundingBox) g.computeBoundingBox();
      const list = P.rock.filter((t) => t.v % A.rockGeo.length === v).map((t) => ({ x: t.x, y: gy(t.x, t.z) - g.boundingBox.min.y * t.s - 0.25 * t.s, z: t.z, rot: t.rot, sx: t.s * 1.3, sy: t.s * 1.1, sz: t.s * 1.3 }));
      if (!list.length) continue;
      const im = instanced(g, rm, list, 'deco-rocks' + v);
      add(im, true); count(im, list.length, (g.index ? g.index.count : g.attributes.position.count) / 3);
    }
  }
  // ----- Bauernhöfe: Wohnhaus, Scheune, Silo, Schuppen (zusammengefasst, ein Draw-Call) -----
  if (P.farm && P.farm.length) {
    const b = new GB();
    for (const f of P.farm) {
      const y = gy(f.x, f.z) - 0.4, r = f.rot, cs = Math.cos(r), sn = Math.sin(r);
      const at = (lx, lz) => [f.x + lx * cs + lz * sn, f.z - lx * sn + lz * cs];
      const wall = [[0.9, 0.88, 0.82], [0.88, 0.82, 0.68], [0.85, 0.85, 0.83]][f.v % 3];
      let [x, z] = at(0, 0); b.box(x, y + 3, z, 11, 6, 8, wall, r); b.gable(x, y + 6, z, 11, 8, 3.6, [0.5, 0.17, 0.1], r);
      [x, z] = at(18, 4); b.box(x, y + 3.5, z, 20, 7, 12, [0.45, 0.2, 0.12], r); b.gable(x, y + 7, z, 20, 12, 4.5, [0.3, 0.3, 0.32], r);
      [x, z] = at(-10, 12); b.cyl(x, y, z, 2.4, 2.4, 11, 10, [0.75, 0.76, 0.78]); b.cyl(x, y + 11, z, 2.4, 0.2, 1.8, 10, [0.6, 0.62, 0.64], false);
      [x, z] = at(4, -14); b.box(x, y + 2, z, 9, 4, 6, [0.35, 0.25, 0.15], r); b.gable(x, y + 4, z, 9, 6, 1.6, [0.35, 0.35, 0.35], r);
    }
    const g = b.geo();
    const mesh = new THREE.Mesh(g, paint); mesh.name = 'deco-farms';
    add(mesh, true); count(mesh, 1, g.index.count / 3); stats.inst += P.farm.length - 1;
  }
  return stats;
}
