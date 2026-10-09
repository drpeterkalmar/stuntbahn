// Kulissen (n20): Grafik der Landschafts-Themen und des Streckenrands, die nicht schon gfx/deco.js zeichnet:
//  - Bäume je Thema (Tannen wie bisher, Köcherbäume, Palmen, Straßenbäume, Herbstlaub) aus den Karten-Atlanten
//  - Fernkulisse: Silhouetten-Ring am Horizont (Berge, Tafelberge, Hügel, Skyline, offenes Meer), Meer an der Küste
//  - Bauten der Themen (Hochhäuser, Kräne, Hochstraße, Leuchtturm, Hütten …) und der Streckenrand (gfx: buildRand)
// Alles ohne Kollision, instanziert bzw. zusammengefasst; Positionen plant track/kulisse.js (Node-testbar).
import * as THREE from 'three';
import { zeitUniforms } from './zeit.js';
import { GB, cellMaterial, cardGeometry, instanced, decoAssets, decoUniforms, canvasTex, lumTint } from './deco.js';
import { patchStaticShadow, themeUniforms } from './materials.js';
import { impostorMesh } from './kern/impostor.js';
import { MAT, WORLD_SCALE } from '../track/defs.js';
import { THEMES, seaDir, SEA_Y } from '../track/themes.js';
import { makeNoise2 } from '../core/util.js';
import { patchSnowCover } from './wetter.js';

const WS = WORLD_SCALE;
const hashI = (i, k = 0) => { let h = Math.imul((i + 1) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 7, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2d); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

// Karten-Material je Atlas-Textur (Thema-Pakete werden beim Wechsel freigegeben → Material an die Textur gebunden)
const cardMats = new WeakMap();
export function atlasMaterial(tex, key = 'b', opts = {}, fade = [1e6, 1e6], wind = 0.0) {
  let m = cardMats.get(tex);
  if (!m) cardMats.set(tex, m = {});
  if (!m[key]) m[key] = cellMaterial({ map: tex, alphaTest: 0.45, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.92, metalness: 0, ...opts }, fade, wind);
  return m[key];
}
const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
// Herbstfarben (Instanzfarbe auf Laub-Karten): gelb, orange, rot, braun, noch grün
const AUTUMN = [[2.2, 1.45, 0.35], [2.4, 1.0, 0.25], [2.1, 0.55, 0.18], [1.5, 0.9, 0.4], [1.3, 1.5, 0.6]];

// n30: Oktaeder-Impostors statt Karten (Standard/Kino), wenn der Atlas der Art geladen ist (gfx/kern/impostor.js,
// gebacken mit tools/build_impostor.py). Welche Arten braucht ein Thema? (main.js lädt sie vor dem Streckenbau vor)
export function impostorArten(def) {
  const Tt = def.trees;
  if (Tt.kind === 'fir') return ['tanne0', 'tanne1', ...(Tt.autumn ? ['laub1', 'laub2'] : [])];
  return (Tt.cells || []).map((c) => c[0]);
}
const impArt = (opts, name) => (opts.impostor && opts.tier >= 1 ? opts.impostor.art(name) : null);
// Standard: nur die nächste Ansicht (1 statt 3 Atlas-Zugriffe je Pixel; n30-Messung: Standard sonst knapp über dem Budget)
let impEinfach = false;
const impOpts = (color, emissive) => ({ color, emissive, einfach: impEinfach, tint: themeUniforms.tTreeTint, snow: themeUniforms.tTreeSnow, patch: patchStaticShadow });

// ---------- Bäume (track.trees aus build.js: Positionen bleiben, das Thema bestimmt die Art) ----------
export function buildTrees(track, M, opts, surfaceY, add, treeGeometry) {
  impEinfach = (opts.tier ?? 2) < 2;
  const th = opts.theme ? opts.theme.def : THEMES.land, Tt = th.trees;
  let tris = 0;
  if (!track.trees || !track.trees.length) return tris;
  const thin = opts.tier === 0 && WORLD_SCALE > 1 ? 2 : 1;
  const all = track.trees.filter((t, i) => t.keep || i % thin === 0);
  const keepK = Tt.keep ?? 1;
  // Herbst: ein Teil der Tannen wird zu bunten Laubbäumen (Land-Atlas), der Rest bleibt Tanne
  const A = decoAssets();
  const autumn = Tt.autumn && A ? all.filter((t, i) => !t.keep && hashI(i, 3) < Tt.autumn) : [];
  const autumnSet = new Set(autumn);
  if (Tt.kind === 'fir') {
    for (const v of [0, 1]) {
      const list = all.filter((t) => t.v === v && !autumnSet.has(t) && (t.keep || keepK >= 1 || hashI(t.x * 7 + t.z, 1) < keepK));
      if (!list.length) continue;
      const art = impArt(opts, 'tanne' + v);
      if (art) {
        // Höhe wie die Karte (treeGeometry: 13 m bei Maßstab 1), gleiche Streuung der Höhe
        const L = list.map((t, i) => ({ x: t.x, y: surfaceY(t.x, t.z) - 0.3, z: t.z, rot: t.rot, s: 13 * t.s, sy: 0.9 + 0.2 * ((i * 37) % 10) / 10 }));
        const im = impostorMesh(art, L, 'trees' + v, impOpts(M.tree[v].color, M.tree[v].emissive));
        add(im, true);
        tris += 2 * L.length;
        continue;
      }
      const g = treeGeometry();
      const im = new THREE.InstancedMesh(g, M.tree[v], list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      list.forEach((t, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
        s.set(t.s, t.s * (0.9 + 0.2 * ((i * 37) % 10) / 10), t.s);
        p.set(t.x, surfaceY(t.x, t.z) - 0.3, t.z);
        m4.compose(p, q, s);
        im.setMatrixAt(i, m4);
      });
      im.computeBoundingSphere();
      im.name = 'trees' + v;
      add(im, true);
      tris += (g.index.count / 3) * list.length;
    }
    if (autumn.length) {
      const Mt = A.meta, LB = ['laub1', 'laub2'], H = { laub1: 11.5, laub2: 10 };
      const list = autumn.map((t, i) => { const n = LB[i % 2], k = H[n] / Mt[n].h * t.s * 1.1; const c = AUTUMN[Math.floor(hashI(i, 9) * AUTUMN.length)]; return { x: t.x, y: surfaceY(t.x, t.z) - 0.25, z: t.z, rot: t.rot, sx: Mt[n].w * k, sy: Mt[n].h * k, cell: Mt[n].uv, color: lin(c[0] / 2.2, c[1] / 2.2, c[2] / 2.2) }; });
      const imp = LB.map((n) => impArt(opts, n));
      if (imp[0] && imp[1]) {
        // Impostors je Laubart, Herbstfarbe als Instanzfarbe (three.js multipliziert sie nach der Atlas-Farbe)
        LB.forEach((n, k) => {
          const L = []; autumn.forEach((t, i) => { if (i % 2 === k) L.push({ x: t.x, y: surfaceY(t.x, t.z) - 0.25, z: t.z, rot: t.rot, s: H[n] * t.s * 1.1, color: list[i].color }); });
          if (!L.length) return;
          const im = impostorMesh(imp[k], L, 'trees-herbst-' + n, impOpts(lin(1.25, 1.25, 1.25)));
          L.forEach((it, i) => im.setColorAt(i, it.color));
          add(im, true); tris += 2 * L.length;
        });
      } else {
        const m = atlasMaterial(A.veg, 'herbst', { color: lin(1.25, 1.25, 1.25) }); if (!m.userData.lum) { lumTint(m); m.userData.lum = 1; }
        const im = instanced(cardGeometry(opts.tier >= 2 ? 3 : 2, 0.5), m, list, 'trees-herbst', true, true);
        add(im, true); tris += list.length * 6;
      }
    }
    return tris;
  }
  // Karten aus dem Thema-Atlas (Köcherbäume, Palmen, Straßenbäume)
  const veg = opts.theme.veg;
  if (!veg) return tris;
  const cells = Tt.cells, wsum = cells.reduce((s, c) => s + c[2], 0);
  const list = [];
  all.forEach((t, i) => {
    if (!t.keep && hashI(i, 1) >= keepK) return;
    let x = hashI(i, 2) * wsum, c = cells[0];
    for (const cc of cells) { if ((x -= cc[2]) < 0) { c = cc; break; } }
    const mt = veg.meta[c[0]], k = c[1] / mt.h * t.s;
    list.push({ x: t.x, y: surfaceY(t.x, t.z) - 0.2, z: t.z, rot: t.rot, sx: mt.w * k, sy: mt.h * k, cell: mt.uv, art: c[0], s: c[1] * t.s });
  });
  if (!list.length) return tris;
  // n30: Arten mit Impostor-Atlas herausnehmen (je Art ein Draw-Call), der Rest (z. B. Palmen ohne Modell) bleibt Karte
  const nachArt = new Map();
  for (const it of list) if (impArt(opts, it.art)) { if (!nachArt.has(it.art)) nachArt.set(it.art, []); nachArt.get(it.art).push(it); }
  for (const [n, L] of nachArt) {
    // nur Lage, Drehung, Höhe (s) – sx/sy der Karten sind absolute Maße, impostorMesh liest sy als Faktor
    const im = impostorMesh(impArt(opts, n), L.map((it) => ({ x: it.x, y: it.y, z: it.z, rot: it.rot, s: it.s })), 'trees-thema-' + n, impOpts(lin(1.5, 1.5, 1.4), 0x0a0c06));
    add(im, true); tris += 2 * L.length;
  }
  if (nachArt.size) { const rest = list.filter((it) => !nachArt.has(it.art)); list.length = 0; list.push(...rest); }
  if (!list.length) return tris;
  const m = atlasMaterial(veg.tex, 'baum', { color: lin(1.5, 1.5, 1.4), emissive: 0x0a0c06 });
  const im = instanced(cardGeometry(opts.tier >= 2 ? 3 : 2, 0.5), m, list, 'trees-thema', true);
  add(im, true);
  return tris + list.length * 6;
}

// ---------- Fernkulisse: Silhouetten-Ring ----------
// Profil je Art: Höhe (m) über dem Horizont je Winkel; mehrere Lagen (hinten heller/dunstiger). Eigener Shader ohne Nebel:
// unten Horizontfarbe, oben Grundfarbe mit Dunst, Schnee (Alpen), Fensterraster (Skyline).
const BD_R = 4700;
function profile(kind, seed) {
  const n = makeNoise2(((seed >>> 0) * 3 + 101) >>> 0), n2 = makeNoise2(((seed >>> 0) * 5 + 33) >>> 0);
  const N = 720, layers = [];
  const ang = (i) => i / N * Math.PI * 2;
  const fb = (nn, a, f, o = 3) => nn.fbm(Math.cos(a) * f + 11, Math.sin(a) * f - 7, o);
  if (kind === 'alpen') {
    layers.push({ r: BD_R + 600, col: [0.13, 0.16, 0.22], haze: 0.4, snow: 1, h: Array.from({ length: N + 1 }, (_, i) => 520 + 520 * Math.pow(Math.max(0, 1 - Math.abs(fb(n, ang(i), 3.2, 4))), 2.4) + 140 * fb(n2, ang(i), 9, 2)) });
    layers.push({ r: BD_R, col: [0.07, 0.09, 0.1], haze: 0.28, snow: 1, h: Array.from({ length: N + 1 }, (_, i) => 260 + 420 * Math.pow(Math.max(0, 1 - Math.abs(fb(n2, ang(i), 4.5, 4))), 2.2)) });
  } else if (kind === 'mesa') {
    const terr = (v) => (v > 0.25 ? 230 : v > 0.0 ? 140 : v > -0.25 ? 50 : 15);
    layers.push({ r: BD_R + 500, col: [0.42, 0.22, 0.12], haze: 0.38, strata: 1, h: Array.from({ length: N + 1 }, (_, i) => terr(fb(n, ang(i), 3.0, 2)) + 10 * fb(n2, ang(i), 30, 2)) });
    layers.push({ r: BD_R, col: [0.3, 0.13, 0.06], haze: 0.26, strata: 1, h: Array.from({ length: N + 1 }, (_, i) => terr(fb(n2, ang(i), 4.0, 2) - 0.1) * 0.8 + 6 * fb(n, ang(i), 40, 2)) });
  } else if (kind === 'skyline') {
    layers.push({ r: BD_R + 400, col: [0.16, 0.18, 0.22], haze: 0.45, h: Array.from({ length: N + 1 }, (_, i) => 50 + 70 * (fb(n, ang(i), 2.5, 3) * 0.5 + 0.5)) });
    // Hochhäuser: Blöcke mit senkrechten Kanten (Profil stufig), Dichte schwankt um den Ring (Stadtzentrum)
    const h = new Array(N + 1).fill(0);
    let i = 0, k = 0;
    while (i <= N) {
      const w = 1 + Math.floor(hashI(k, seed) * 4), dense = Math.max(0, fb(n2, ang(i), 1.8, 2) * 0.5 + 0.55);
      const hh = hashI(k, seed + 1) < dense ? 30 + Math.pow(hashI(k, seed + 2), 1.8) * 330 * dense : 12 + hashI(k, 4) * 20;
      for (let q = 0; q < w && i <= N; q++, i++) h[i] = hh;
      k++;
    }
    layers.push({ r: BD_R, col: [0.1, 0.11, 0.13], haze: 0.3, windows: 1, step: 1, h });
  } else if (kind === 'meer') {
    const [sx, sz] = seaDir(seed), a0 = Math.atan2(sz, sx);
    layers.push({ r: BD_R, col: [0.07, 0.11, 0.08], haze: 0.4, h: Array.from({ length: N + 1 }, (_, i) => {
      let d = ang(i) - a0; d = Math.atan2(Math.sin(d), Math.cos(d));
      const land = THREE.MathUtils.smoothstep(Math.abs(d), 1.0, 1.5);
      const isle = Math.max(0, fb(n, ang(i), 14, 2) - 0.35) * 160;
      return land * (40 + 140 * (fb(n, ang(i), 3, 3) * 0.5 + 0.5)) + (1 - land) * isle - (1 - land) * 4;
    }) });
  } else {   // huegel (Land, Herbst)
    layers.push({ r: BD_R + 500, col: [0.12, 0.16, 0.19], haze: 0.48, h: Array.from({ length: N + 1 }, (_, i) => 110 + 170 * (fb(n, ang(i), 2.8, 4) * 0.5 + 0.5)) });
    layers.push({ r: BD_R, col: [0.05, 0.09, 0.05], haze: 0.36, h: Array.from({ length: N + 1 }, (_, i) => 40 + 120 * (fb(n2, ang(i), 4.2, 4) * 0.5 + 0.5)) });
  }
  return { N, layers };
}
export function buildBackdrop(theme, add, opts = {}) {
  const kind = theme.def.backdrop, { N, layers } = profile(kind, theme.seed);
  const pos = [], col = [], at = [], idx = [];
  const tint = theme.id === 'herbst' ? [1.4, 0.95, 0.55] : theme.id === 'winter' ? [2.6, 2.6, 2.7] : [1, 1, 1];
  for (const L of layers) {
    const b0 = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const h = Math.max(L.h[i], -6), r = L.r;
      // Stufen der Skyline: senkrechte Kanten (gleicher Winkel, zwei Höhen) – über Nachbar-Höhe in einem eigenen Quad
      pos.push(c * r, -60, s * r, c * r, h, s * r);
      for (let k = 0; k < 2; k++) { col.push(L.col[0] * tint[0], L.col[1] * tint[1], L.col[2] * tint[2]); at.push(k, h, L.haze, (L.snow ? 1 : 0) + (L.windows ? 2 : 0) + (L.strata ? 4 : 0)); }
      if (i < N) { const v = b0 + i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
    }
    if (L.step) {
      // Skyline: senkrechte Seitenwände an jeder Stufe (sonst schräge Dächer)
      for (let i = 0; i < N; i++) {
        if (Math.abs(L.h[i] - L.h[i + 1]) < 0.5) continue;
        const a = (i + 1) / N * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), r = L.r, lo = Math.min(L.h[i], L.h[i + 1]), hi = Math.max(L.h[i], L.h[i + 1]);
        const v = pos.length / 3, d = 0.6;
        pos.push(c * r, lo, s * r, c * r, hi, s * r, c * (r - d), hi, s * (r - d), c * (r - d), lo, s * (r - d));
        for (const [k, hh] of [[1, lo], [1, hi], [1, hi], [1, lo]]) { col.push(L.col[0] * 0.8, L.col[1] * 0.8, L.col[2] * 0.8); at.push(k, hh, L.haze, 2); }
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      }
      // waagrechte Dächer an den Stufen: die Ringpunkte liegen 0,5° auseinander → Höhe zwischen zwei Punkten springt;
      // das Profil h[i] gilt für das Stück i…i+1 (Rechteck): obere Kante parallel
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(at, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const hz = theme.horizon || new THREE.Color(0.75, 0.76, 0.8);
  const m = new THREE.ShaderMaterial({
    uniforms: { uHz: { value: new THREE.Vector3(hz.r, hz.g, hz.b) }, uSun: { value: new THREE.Vector3(0.3, 0.8, 0.5) }, uTime: decoUniforms.uTime, zHell: zeitUniforms.zHell, zNacht: zeitUniforms.zNacht },
    vertexShader: `attribute vec4 aT; attribute vec3 color; varying vec4 vT; varying vec3 vC; varying vec3 vW;
      void main(){ vT = aT; vC = color; vec4 w = modelMatrix * vec4( position, 1.0 ); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uHz; uniform float zHell, zNacht; varying vec4 vT; varying vec3 vC; varying vec3 vW;
      float hh( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      void main(){ float zWin = 0.0;
        float y = vW.y, top = vT.y, flags = vT.w;
        vec3 c = vC;
        // Grate: Helligkeit wechselt mit dem Winkel (Licht-/Schattenseiten der Flanken), unten dunkler
        float ang = atan( vW.z, vW.x );
        float a1 = ang * 90.0, n1 = mix( hh( vec2( floor( a1 ), 3.0 ) ), hh( vec2( floor( a1 ) + 1.0, 3.0 ) ), smoothstep( 0.0, 1.0, fract( a1 ) ) );
        c *= ( 0.7 + 0.6 * n1 ) * ( 0.75 + 0.35 * smoothstep( 0.0, max( 40.0, top ), y ) );
        // Schnee: obere Teile der Gipfel, zackige Grenze, Schattenseiten bläulich
        if ( mod( flags, 2.0 ) > 0.5 ) { float line = top * 0.7 - 30.0 + 70.0 * hh( vec2( floor( ang * 240.0 ), 1.0 ) ); c = mix( c, vec3( 0.78, 0.82, 0.9 ) * ( 0.75 + 0.35 * n1 ), smoothstep( line, line + 20.0, y ) ); }
        // Schichtstufen (Tafelberge)
        if ( mod( floor( flags / 4.0 ), 2.0 ) > 0.5 ) c *= 0.85 + 0.25 * smoothstep( 0.3, 0.7, fract( y / 38.0 ) );
        // Fenster (Skyline): Raster, einzelne leuchten warm
        if ( mod( floor( flags / 2.0 ), 2.0 ) > 0.5 && y < top - 4.0 && y > 6.0 ) {
          float ang = atan( vW.z, vW.x ) * 4700.0;
          vec2 q = vec2( ang / 5.0, y / 4.2 ), id = floor( q ), f = fract( q );
          float win = step( 0.25, f.x ) * step( f.x, 0.8 ) * step( 0.3, f.y ) * step( f.y, 0.85 );
          c = mix( c, mix( vec3( 0.42, 0.5, 0.58 ), vec3( 1.4, 1.05, 0.6 ), step( 0.86, hh( id ) ) ), win * 0.55 );
          zWin = win * step( 0.55, hh( id + 7.3 ) );   // n32 Nacht: gut die Hälfte der Fenster leuchtet
        }
        // Dunst: unten fast Horizontfarbe, oben je Lage
        float k = mix( 0.92, vT.z, smoothstep( 0.0, max( 40.0, top ), y + 60.0 ) );
        c = mix( c, uHz, k );
        c = c * zHell + vec3( 1.0, 0.7, 0.36 ) * zWin * zNacht * ( 1.0 - k * 0.7 );   // n32 Abend/Nacht: dunkler, Fenster leuchten
        gl_FragColor = vec4( c, 1.0 );
        #include <colorspace_fragment>
      }`,
    fog: false, depthWrite: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'kulisse-horizont';
  mesh.frustumCulled = false;
  add(mesh, false);
  return idx.length / 3;
}

// ---------- Meer (Küste): Ring-Fläche außerhalb des Physik-Rasters, nur dort sichtbar, wo das Gelände darunter liegt ----------
export function buildSea(theme, M, add, ext) {
  const r0 = Math.SQRT2 * ext + 30, r1 = 7000, seg = 96;
  const g = new THREE.RingGeometry(r0, r1, seg, 3);
  g.rotateX(-Math.PI / 2);
  const m = M.sea || (M.sea = (() => {
    const s = M.water.clone();
    s.color = new THREE.Color(0x0f3a4a); s.opacity = 1; s.transparent = false; s.roughness = 0.06; s.envMapIntensity = 1.1;
    s.onBeforeCompile = M.water.onBeforeCompile; s.customProgramCacheKey = M.water.customProgramCacheKey;
    return s;
  })());
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = SEA_Y;
  mesh.name = 'kulisse-meer';
  mesh.updateMatrix();
  add(mesh, false);
  return seg * 6;
}

// ---------- Streckenrand und Bauten (Plan aus track/kulisse.js über planDeco) ----------
// Fiktive Marken (keine echten): Fahnen, Portal, Zeppelin
const BRANDS = [['KALMAR REIFEN', '#101820', '#ffcc00'], ['BLITZ COLA', '#c8102e', '#ffffff'], ['ALPENSTROM', '#ffffff', '#0a5ca8'], ['TURBO-ÖL', '#111111', '#ff6a00'],
  ['STUNTBAHN', '#0e1116', '#e8e8e8'], ['WIESENMILCH', '#2e7d32', '#ffffff'], ['RAPID TV', '#1a237e', '#ffd54f'], ['FUNKEN FUNK', '#f5f5f0', '#b71c1c']];
let flagTex = null, boardTex = null, zepTex = null;
function flagAtlas() {
  // 8 Fahnen à 256 × 128 (2 Spalten × 4 Zeilen) in 512 × 512: Grund, Streifen, Marke
  return flagTex || (flagTex = canvasTex(512, 512, (g) => {
    BRANDS.forEach(([t, bg, fg], k) => {
      const x = (k % 2) * 256, y = Math.floor(k / 2) * 128;
      g.fillStyle = bg; g.fillRect(x, y, 256, 128);
      g.fillStyle = fg; g.fillRect(x, y + 104, 256, 10);
      g.font = `bold ${t.length > 11 ? 30 : 36}px Arial, Helvetica, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t, x + 128, y + 60);
    });
  }));
}
function boardTexture() {
  return boardTex || (boardTex = canvasTex(1024, 256, (g) => {
    g.fillStyle = '#0b0f14'; g.fillRect(0, 0, 1024, 256);
    const gr = g.createLinearGradient(0, 0, 1024, 0); gr.addColorStop(0, '#c8102e'); gr.addColorStop(0.5, '#ff6a00'); gr.addColorStop(1, '#c8102e');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 18); g.fillRect(0, 238, 1024, 18);
    g.fillStyle = '#ffffff'; g.font = 'bold 118px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('START · ZIEL', 512, 112);
    g.fillStyle = '#ffcc00'; g.font = 'bold 40px Arial, Helvetica, sans-serif'; g.fillText('KALMAR REIFEN  ·  STUNTBAHN  ·  BLITZ COLA', 512, 200);
  }));
}
function zeppelinTexture() {
  return zepTex || (zepTex = canvasTex(1024, 256, (g) => {
    g.fillStyle = '#e9ecef'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#1565c0'; g.font = 'bold 150px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('RAPID TV', 512, 132);
  }));
}
// Fahnen-Material: Atlas-Zelle je Instanz, Tuch weht (Welle entlang der Fahne, außen stärker)
function flagMaterial() {
  const m = cellMaterial({ map: flagAtlas(), roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.vertexShader = sh.vertexShader.replace('transformed *= f;', `transformed *= f;
      { float u = uv.x; float w = sin( uTime * 7.0 - u * 6.0 + ip.x * 0.3 ) * 0.09 + sin( uTime * 11.0 - u * 9.0 + ip.z ) * 0.03;
        transformed.z += w * u * 1.6; transformed.y -= u * u * 0.06; }`);
  };
  const pkF = m.customProgramCacheKey; m.customProgramCacheKey = () => 'decoFlag' + pkF();   // n32: Nacht-Stand im Schlüssel
  return m;
}
let flagMat = null;
// Gitter-Quad für die Fahne (Breite 1, Höhe 1, Mast-Seite bei x = 0), 8 × 2 Felder
function flagGeometry() {
  const g = new THREE.PlaneGeometry(1, 1, 8, 2); g.translate(0.5, 0.5, 0);
  return g;
}

// Szene-weite Animation (Zeppelin kreist); main.js ruft kulisseTick je Bild
let zeppelin = null;
export function kulisseTick(t) {
  if (zeppelin && zeppelin.parent) {
    const z = zeppelin.userData, a = z.ph + z.dir * t * 0.012;
    zeppelin.position.set(Math.cos(a) * z.r, z.y + Math.sin(t * 0.05) * 6, Math.sin(a) * z.r);
    zeppelin.rotation.y = -a + (z.dir > 0 ? Math.PI : 0);
    zeppelin.updateMatrix();
  }
}

// Drehendes Bauteil (Rotor): Vertex-Shader dreht um die lokale z-Achse (uTime · Tempo + Phase je Instanz über die Position)
function spinPatch(m, speed) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = decoUniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec4 ipS = instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
        float aS = uTime * ${speed.toFixed(3)} + fract( sin( dot( ipS.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 6.283;
        mat2 rS = mat2( cos( aS ), sin( aS ), -sin( aS ), cos( aS ) );
        objectNormal.xy = rS * objectNormal.xy;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.xy = rS * transformed.xy;');
  };
  m.customProgramCacheKey = () => 'spin' + speed;
  return m;
}
// Treiben (Ballons, Boote): Vertex-Shader verschiebt je Instanz langsam hin und her (+ Wippen)
function driftPatch(m, amp, bob) {
  const prevKey = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uTime = decoUniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <project_vertex>', `{
          vec4 ipD = instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
          float ph = fract( sin( dot( ipD.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 100.0;
          transformed += ( inverse( mat3( instanceMatrix ) ) * vec3( sin( uTime * 0.013 + ph ) * ${amp.toFixed(1)}, sin( uTime * 0.4 + ph ) * ${bob.toFixed(2)}, cos( uTime * 0.011 + ph * 1.3 ) * ${amp.toFixed(1)} ) );
        }
        #include <project_vertex>`);
  };
  m.customProgramCacheKey = () => prevKey() + '|drift' + amp;
  return m;
}

export function buildRand(plan, ctx) {
  const { M, gy, add, tier, theme } = ctx;
  const P = plan.inst, paint = M[MAT.PAINT];
  let tris = 0;
  const near = new GB(), far = new GB();
  // ----- Start/Ziel-Portal: zwei Fachwerk-Türme, Brücke darüber, Anzeigetafel beidseitig -----
  if (plan.portal) {
    const p = plan.portal, y0 = gy(p.x, p.z), yaw = Math.atan2(p.bx, p.bz) + Math.PI / 2;
    const steel = [0.82, 0.82, 0.84], red = [0.7, 0.06, 0.05], H = 10.5;
    for (const sg of [-1, 1]) {
      const x = p.x + p.bx * sg * p.hw, z = p.z + p.bz * sg * p.hw, y = gy(x, z);
      for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) near.box(x + dx * Math.cos(yaw) + dz * Math.sin(yaw), y + H / 2, z - dx * Math.sin(yaw) + dz * Math.cos(yaw), 0.16, H, 0.16, steel, yaw);
      for (let h = 1; h < H; h += 1.6) near.box(x, y + h, z, 1.25, 0.1, 1.25, steel, yaw);
      near.box(x, y + 0.25, z, 1.8, 0.5, 1.8, [0.3, 0.3, 0.32], yaw);
    }
    // Brücke (Fachwerkträger) über die Fahrbahn, quer zur Fahrtrichtung
    const span = 2 * p.hw + 1.2, qy = Math.atan2(p.bx, p.bz);
    for (const dy of [H - 0.1, H + 1.5]) for (const df of [-0.55, 0.55]) near.box(p.x + p.tx * df, y0 + dy, p.z + p.tz * df, 0.18, 0.18, span, steel, qy);
    near.box(p.x, y0 + H + 0.7, p.z, 1.3, 1.7, span, red, qy);
    // Anzeigetafeln (beidseitig)
    const bm = new THREE.MeshStandardMaterial({ map: boardTexture(), emissive: 0xffffff, emissiveMap: boardTexture(), emissiveIntensity: 0.35, roughness: 0.5, metalness: 0 });
    patchStaticShadow(bm);
    const bw = Math.min(16, span - 2), g = new THREE.PlaneGeometry(bw, bw / 4);
    for (const sd of [-1, 1]) {
      const mesh = new THREE.Mesh(g, bm);
      mesh.position.set(p.x - p.tx * sd * 0.68, y0 + H + 0.7 + 1.0, p.z - p.tz * sd * 0.68);
      mesh.rotation.set(0, Math.atan2(-p.tx * sd, -p.tz * sd), 0);
      mesh.name = 'kulisse-portal-tafel';
      add(mesh, false); tris += 2;
    }
  }
  // ----- Fahnen (Mast + wehendes Tuch mit fiktiver Marke) -----
  if (P.flag && P.flag.length) {
    const pole = new GB(); pole.cyl(0, 0, 0, 0.06, 0.045, 7.2, 6, [0.85, 0.86, 0.88], true);
    const pg = pole.geo();
    const list = P.flag.map((f) => ({ x: f.x, y: gy(f.x, f.z) - 0.05, z: f.z, rot: f.rot }));
    const im = instanced(pg, paint, list, 'kulisse-fahnenmasten'); add(im, false); tris += list.length * pg.index.count / 3;
    if (!flagMat) flagMat = flagMaterial();
    const cl = P.flag.map((f) => ({ x: f.x, y: gy(f.x, f.z) + 5.0, z: f.z, rot: f.rot, sx: 2.6, sy: 1.3, cell: [(f.v % 2) * 0.5, 1 - (Math.floor(f.v / 2) * 128 + 128) / 512, 0.5, 128 / 512] }));
    const fm = instanced(flagGeometry(), flagMat, cl, 'kulisse-fahnen', true); add(fm, false); tris += cl.length * 32;
  }
  // ----- Kamerakräne: Fuß, Säule, Ausleger zur Strecke, Kamera -----
  if (P.cam && P.cam.length) {
    const b = new GB(), dark = [0.14, 0.15, 0.17], yel = [0.9, 0.7, 0.08];
    b.box(0, 0.3, 0, 2.2, 0.6, 2.2, dark); b.box(0, 2.4, 0, 0.35, 3.6, 0.35, dark);
    // Ausleger 9 m schräg nach oben zur Strecke (+z), Gegengewicht hinten
    for (let k = 0; k < 9; k++) b.box(0, 4.2 + k * 0.32, 0.6 + k * 0.95, 0.28, 0.28, 1.0, k % 2 ? yel : dark);
    b.box(0, 3.9, -1.6, 0.8, 0.8, 0.9, [0.4, 0.4, 0.42]);
    b.box(0, 6.8, 9.3, 0.55, 0.55, 0.85, [0.08, 0.08, 0.09]); b.box(0, 6.85, 9.8, 0.38, 0.38, 0.2, [0.25, 0.3, 0.4]);
    const g = b.geo();
    const im = instanced(g, paint, P.cam.map((c) => ({ x: c.x, y: gy(c.x, c.z), z: c.z, rot: c.rot })), 'kulisse-kamerakraene');
    add(im, true); tris += P.cam.length * g.index.count / 3;
  }
  // ----- Windräder: Turm + Gondel (instanziert), Rotor dreht im Shader -----
  if (P.turbine && P.turbine.length) {
    const b = new GB(), wh = [0.9, 0.9, 0.9];
    b.cyl(0, 0, 0, 2.2, 1.3, 80, 10, wh, false); b.box(0, 81, -1.5, 3.2, 3.2, 9, wh);
    const g = b.geo();
    const list = P.turbine.map((t) => ({ x: t.x, y: gy(t.x, t.z) - 1, z: t.z, rot: t.rot, sx: t.s, sy: t.s, sz: t.s }));
    const im = instanced(g, paint, list, 'kulisse-windraeder'); add(im, false); tris += list.length * g.index.count / 3;
    const rb = new GB();
    rb.box(0, 0, -0.6, 2.2, 2.2, 2.4, wh);   // Nabe
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3 + 0.3, d = [Math.cos(a), Math.sin(a)], q = [-Math.sin(a), Math.cos(a)];
      const P = (r, w, zz) => [d[0] * r + q[0] * w, d[1] * r + q[1] * w, zz];
      for (const [zz, nz] of [[0.15, 1], [-0.15, -1]]) {
        const pts = [P(1.2, -1.3, zz), P(1.2, 1.1, zz), P(38, 0.25, zz), P(38, -0.35, zz)];
        if (nz > 0) rb.quad(pts[0], pts[1], pts[2], pts[3], [0, 0, 1], wh); else rb.quad(pts[3], pts[2], pts[1], pts[0], [0, 0, -1], wh);
      }
    }
    const rg = rb.geo();
    const rm = spinPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 }), 1.1);
    const rl = P.turbine.map((t) => { const c = Math.cos(t.rot), s = Math.sin(t.rot); return { x: t.x + s * 4.2 * t.s, y: gy(t.x, t.z) - 1 + 81 * t.s, z: t.z + c * 4.2 * t.s, rot: t.rot, sx: t.s, sy: t.s, sz: t.s }; });
    const ri = instanced(rg, rm, rl, 'kulisse-rotoren'); add(ri, false); tris += rl.length * rg.index.count / 3;
  }
  // ----- Heißluftballons (treiben langsam) -----
  const SKY = plan.sky || {};
  if (SKY.balloons && SKY.balloons.length) {
    const b = new GB(), pal = [[[0.85, 0.1, 0.08], [0.98, 0.8, 0.1]], [[0.1, 0.35, 0.75], [0.95, 0.95, 0.92]], [[0.15, 0.55, 0.25], [0.95, 0.6, 0.1]], [[0.55, 0.12, 0.55], [0.95, 0.95, 0.92]]];
    // Hülle als Drehkörper mit senkrechten Bahnen (zweifarbig), Korb, Seile – 4 Farbvarianten nebeneinander im Mesh nicht nötig:
    // je Variante eigene Geometrie, alle Ballons einer Variante instanziert
    const prof = []; for (let k = 0; k <= 10; k++) { const t = k / 10, a = t * Math.PI; prof.push([Math.max(0.6, Math.sin(a) * 9 * (t < 0.55 ? 1 : 1 - (t - 0.55) * 0.9)), 22 - Math.cos(a) * 11 + 4]); }
    for (let v = 0; v < 4; v++) {
      const gb = new GB(), seg = 16;
      for (let s = 0; s < seg; s++) {
        const c = pal[v][s % 2], a0 = s / seg * Math.PI * 2, a1 = (s + 1) / seg * Math.PI * 2;
        for (let k = 0; k < prof.length - 1; k++) {
          const [r0, y0] = prof[k], [r1, y1] = prof[k + 1];
          const P0 = [Math.cos(a0) * r0, y0, Math.sin(a0) * r0], P1 = [Math.cos(a1) * r0, y0, Math.sin(a1) * r0], P2 = [Math.cos(a1) * r1, y1, Math.sin(a1) * r1], P3 = [Math.cos(a0) * r1, y1, Math.sin(a0) * r1];
          const nm = [Math.cos((a0 + a1) / 2), (r0 - r1) / Math.max(0.1, y1 - y0) * 0.5 + 0.1, Math.sin((a0 + a1) / 2)], l = Math.hypot(...nm);
          gb.quad(P0, P3, P2, P1, nm.map((q) => q / l), c);
        }
      }
      gb.box(0, 1.0, 0, 1.6, 1.2, 1.6, [0.45, 0.32, 0.18]);
      for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) gb.box(dx * 1.6, 3.4, dz * 1.6, 0.05, 4.4, 0.05, [0.2, 0.18, 0.15]);
      const list = SKY.balloons.filter((q) => q.v === v).map((q) => ({ x: q.x, y: q.y, z: q.z, rot: q.ph, sx: q.s, sy: q.s, sz: q.s }));
      if (!list.length) continue;
      const g = gb.geo();
      const m = driftPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, side: THREE.DoubleSide }), 60, 2.5);
      const im = instanced(g, m, list, 'kulisse-ballons'); add(im, false); tris += list.length * g.index.count / 3;
    }
  }
  // ----- Zeppelin (kreist langsam um das Streckenfeld) -----
  zeppelin = null;
  if (SKY.zeppelin) {
    const grp = new THREE.Group();
    const lat = [];
    for (let k = 0; k <= 16; k++) { const t = k / 16; lat.push(new THREE.Vector2(Math.max(0.01, Math.sin(t * Math.PI) * 9 * (t < 0.3 ? Math.sqrt(t / 0.3) * 0.9 + 0.1 : 1)), (t - 0.5) * 70)); }
    const body = new THREE.LatheGeometry(lat, 24); body.rotateZ(Math.PI / 2);
    const bm = patchStaticShadow(new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.55, metalness: 0.15 }));
    grp.add(new THREE.Mesh(body, bm));
    const fb = new GB(), fc = [0.75, 0.1, 0.08];
    fb.box(-31, 0, 0, 8, 0.4, 16, fc); fb.box(-31, 0, 0, 8, 16, 0.4, fc); fb.box(2, -10, 0, 12, 2.6, 3.2, [0.25, 0.27, 0.3]);
    grp.add(new THREE.Mesh(fb.geo(), paint));
    const tm = new THREE.MeshStandardMaterial({ map: zeppelinTexture(), roughness: 0.6, transparent: false });
    for (const sd of [-1, 1]) { const q = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), tm); q.position.set(0, 0.5, sd * 8.95); q.rotation.y = sd > 0 ? 0 : Math.PI; grp.add(q); }
    grp.userData = SKY.zeppelin;
    grp.name = 'kulisse-zeppelin';
    grp.matrixAutoUpdate = false;
    add(grp, false);
    zeppelin = grp; kulisseTick(0);
    tris += 24 * 16 * 2 + 40;
  }
  // ----- Stadt: Hochhäuser (Fenster im Shader), Wohnblöcke, Baukräne, Hochstraße -----
  const boxes = [...(P.tower || []).map((t) => ({ ...t, far: 1 })), ...(P.block || [])];
  if (boxes.length) {
    const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0);
    const cols = [[0.42, 0.42, 0.41], [0.5, 0.45, 0.38], [0.22, 0.28, 0.36], [0.44, 0.27, 0.2], [0.58, 0.55, 0.5]];
    const foot = (t) => { let m = gy(t.x, t.z); const r = Math.max(t.w, t.d) / 2; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [1, 0], [0, -1], [-1, 0]]) m = Math.min(m, gy(t.x + a * r, t.z + b * r)); return m; };
    const list = boxes.map((t) => ({ x: t.x, y: foot(t) - 1, z: t.z, rot: t.rot, sx: t.w, sy: t.h + 1, sz: t.d, color: new THREE.Color(...cols[(t.v + Math.floor(t.h)) % 5]) }));
    const m = buildingMaterial();
    const im = instanced(g, m, list, 'kulisse-hochhaeuser', null, true);
    add(im, false); tris += list.length * 12;
  }
  for (const c of P.crane || []) {
    const y = gy(c.x, c.z), yel = [0.92, 0.66, 0.08], cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) far.box(c.x + dx, y + c.h / 2, c.z + dz, 0.3, c.h, 0.3, yel);
    for (let h = 3; h < c.h; h += 3.2) far.box(c.x, y + h, c.z, 2.0, 0.2, 2.0, yel);
    far.box(c.x + sn * 18, y + c.h + 1, c.z + cs * 18, 1.4, 1.6, 50, yel, c.rot);
    far.box(c.x - sn * 9, y + c.h + 0.6, c.z - cs * 9, 4, 2.4, 4, [0.45, 0.45, 0.47], c.rot);
    far.box(c.x, y + c.h + 5, c.z, 0.4, 8, 0.4, yel);
  }
  for (const h of plan.hwy || []) {
    const pts = h.pts;
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, y = Math.max(gy(x0, z0), gy(x1, z1)) + h.y;
      far.box(mx, y, mz, 15, 1.4, len + 0.3, [0.55, 0.55, 0.56], yaw);
      far.box(mx, y + 0.72, mz, 13, 0.06, len + 0.3, [0.14, 0.14, 0.15], yaw);
      for (const s of [-1, 1]) far.box(mx + Math.cos(yaw) * s * 7.2, y + 1.2, mz - Math.sin(yaw) * s * 7.2, 0.5, 1.0, len + 0.3, [0.62, 0.62, 0.6], yaw);
      if (k % 1 === 0) { const gy0 = gy(x0, z0); far.box(x0, (gy0 + y) / 2, z0, 2.2, y - gy0, 2.2, [0.5, 0.5, 0.5], yaw); }
    }
  }
  // ----- Küste: Leuchtturm (rot-weiß, Laterne leuchtet), Segelboote -----
  for (const l of P.light || []) {
    const y = gy(l.x, l.z) - 0.5;
    far.cyl(l.x, y, l.z, 6, 6, 3, 12, [0.6, 0.58, 0.55]);
    for (let k = 0; k < 6; k++) far.cyl(l.x, y + 3 + k * 4.6, l.z, 3.2 - k * 0.22, 3.2 - (k + 1) * 0.22, 4.6, 12, k % 2 ? [0.93, 0.93, 0.9] : [0.78, 0.1, 0.08], false);
    far.cyl(l.x, y + 30.6, l.z, 2.6, 2.6, 0.5, 12, [0.2, 0.2, 0.22]);
    far.cyl(l.x, y + 31.1, l.z, 1.4, 1.4, 2.6, 10, [1.6, 1.5, 1.1]);
    far.cyl(l.x, y + 33.7, l.z, 1.8, 0.2, 2.0, 10, [0.75, 0.1, 0.08], false);
  }
  if (plan.sea && plan.sea.boats.length) {
    const b = new GB(); b.box(0, 0.6, 0, 3, 1.4, 11, [0.92, 0.92, 0.9]); b.box(0, 1.6, -1, 2.2, 0.8, 4, [0.85, 0.85, 0.82]); b.box(0, 8, 1, 0.2, 14, 0.2, [0.7, 0.7, 0.7]);
    b.quad([0, 2.2, 1.2], [0, 2.2, 6.5], [0, 14.5, 1.2], [0, 14.5, 1.2], [1, 0, 0], [0.97, 0.97, 0.94]);
    b.quad([0, 2.2, 1.2], [0, 14.5, 1.2], [0, 14.5, 1.2], [0, 2.2, 6.5], [-1, 0, 0], [0.97, 0.97, 0.94]);
    const g = b.geo();
    const m = driftPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, side: THREE.DoubleSide }), 40, 0.25);
    const list = plan.sea.boats.map((q) => ({ x: q.x, y: SEA_Y - 0.3, z: q.z, rot: q.rot, sx: q.s, sy: q.s, sz: q.s }));
    const im = instanced(g, m, list, 'kulisse-boote'); add(im, false); tris += list.length * g.index.count / 3;
  }
  if (near.i.length) { const g = near.geo(); const mesh = new THREE.Mesh(g, paint); mesh.name = 'kulisse-nah'; add(mesh, true); tris += g.index.count / 3; }
  if (far.i.length) { const g = far.geo(); const mesh = new THREE.Mesh(g, paint); mesh.name = 'kulisse-fern'; add(mesh, false); tris += g.index.count / 3; }
  return tris;
}

// Hochhaus-Material: Instanzfarbe für die Fassade, Fensterraster aus Weltposition und Normale (3,6 m Geschosse, 3 m Achsen),
// einzelne Fenster spiegeln den Himmel bzw. leuchten warm; Dach dunkel
let bMat = null;
function buildingMaterial() {
  if (bMat) return bMat;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.05 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBw; varying vec3 vBn;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n{ vec4 w4 = vec4( transformed, 1.0 ); w4 = instanceMatrix * w4; vBw = ( modelMatrix * w4 ).xyz; vBn = normalize( mat3( modelMatrix ) * mat3( instanceMatrix ) * normal ); }');
    sh.uniforms.zNacht = zeitUniforms.zNacht;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBw; varying vec3 vBn; uniform float zNacht; float bLit = 0.0;\nfloat bH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.32, bWin );')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3( 1.0, 0.72, 0.4 ) * bLit * zNacht * 1.8;')   // n32 Nacht: Fensterlicht
      .replace('#include <map_fragment>', `#include <map_fragment>
      float bWin = 0.0; bLit = 0.0;
      if ( vBn.y > 0.7 ) diffuseColor.rgb *= 0.35;
      else {
        vec2 q = vec2( abs( vBn.x ) > abs( vBn.z ) ? vBw.z : vBw.x, vBw.y );
        vec2 c = q / vec2( 3.0, 3.6 ), id = floor( c ), f = fract( c );
        float win = step( 0.18, f.x ) * step( f.x, 0.82 ) * step( 0.25, f.y ) * step( f.y, 0.85 ) * step( 1.2, vBw.y - floor( vBw.y / 4000.0 ) );
        bWin = win; bLit = win * step( 0.62, bH( id + 3.1 ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.05, 0.07, 0.1 ) + vec3( 0.45, 0.32, 0.14 ) * step( 0.92, bH( id ) ), win * 0.9 );
      }`);
  };
  m.customProgramCacheKey = () => 'building';
  bMat = patchSnowCover(patchStaticShadow(m));   // n32: Schnee auf den Dächern
  return bMat;
}
