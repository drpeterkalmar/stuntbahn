// Kulissen n32: Zeichnen der Planung aus track/kulisse2.js (aufgerufen aus buildDeco, gfx/deco.js).
//  - 3D-Zuschauer: EIN instanziertes Mesh aus prozeduralen Low-Poly-Figuren (eigene Arbeit, 0 KB Download, ~110 Dreiecke),
//    Haltung/Jubel/Fahne/Sitzen als Vertex-Animation im Shader (keine Skelett-CPU-Arbeit), Farbe/Größe je Instanz,
//    Kamerablitze beim Jubel an Stunts (Bloom), Blob-Schatten (1 Draw-Call). LOD: nah 3D, ab FAN_FADE die bisherigen
//    Atlas-Karten (crowdNear blendet die Gruppen-Karten in der Nähe aus). Grafik „Einfach“: nur Karten (wie bis n31).
//  - Bauten in EINEM Mesh (Vertexfarben, Schnee auf Dächern über das Paint-Material): Banden-Rahmen, Boxenmauer,
//    Fangzaun-Pfosten, Rennleitungsturm, Leinwand-Gestell, Startampel, Event-Gelände (Zelte, Foodtrucks, Schirme, Autos,
//    Riesenrad, Hüpfburg, Strandbar, Après-Ski-Hütte), Picknick (Decke, Klappstühle, Kühlbox), Pyro-Abschussrohre.
//  - Fangzaun-Netz (Maschendraht wie der Zaun, 3,8 m), Banden-Werbung (Werbe-Atlas, schärfer: deco.js signAtlas),
//    Startaufstellung (Farbe auf der Fahrbahn), Leinwand-Bild, Ampel-Lichter (Uniform kulisse2Uniforms.uAmpel).
// TODO n32-Heavy: Proportionen, Farben, Jubel-Stärke, LOD-Entfernungen am Bild abstimmen (Startwerte unten).
import * as THREE from 'three';
import { GB, instanced, decoUniforms, canvasTex, quadGeometry, once, fenceMaterial, signMaterial, AD_CELL, crowdNear } from './deco.js';
import { patchStaticShadow } from './materials.js';
import { MAT } from '../track/defs.js';

// Entfernung (m), ab der 3D-Zuschauer ausgeblendet werden [Beginn, Ende] je Grafikstufe (0 = keine 3D-Figuren)
export const FAN_FADE = [null, [36, 48], [58, 74]];
// Ampel: x = Lichter an (0 … 5), y = grün (0/1) – main.js setzt es aus dem Countdown
export const kulisse2Uniforms = { uAmpel: { value: new THREE.Vector2(0, 0) } };
// Ampel aus dem Rennzustand: Countdown (3 … 0 s) → 1 … 5 rote Lichter, danach 1,5 s grün; sonst aus
export function ampelAus(state, countdown, sinceGo) {
  if (state === 'countdown' && countdown <= 3) return [Math.min(5, Math.floor((3 - countdown) / 0.6) + 1), 0];
  if (state === 'running' && sinceGo < 1.5) return [0, 1];
  return [0, 0];
}

// ---------- 3D-Zuschauer ----------
// Teile (aPart): 0 Rumpf/Kopf, 1/2 Bein links/rechts, 3/4 Arm links/rechts, 5 Fahnenstange, 6 Fahnentuch (am rechten Arm)
// Farbklassen (aCls): 0 Hose, 1 Shirt, 2 Haut, 3 Haar/Mütze, 4 Fahne, 5 Stange, 6 Schuhe
export function fanGeometry() {
  const P = [], N = [], A = [], C = [], I = [];
  // bottom = false: Unterseite weglassen (unsichtbar; nur Arme/Fahne brauchen sie, wenn sie hochgerissen werden)
  const box = (cx, cy, cz, sx, sy, sz, part, cls, bottom = false) => {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const F = [[[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]], [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
      [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]], [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
      [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]], [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]]];
    for (const [n, q] of F) {
      if (n[1] < 0 && !bottom) continue;
      const b0 = P.length / 3;
      for (const [a, b, c] of q) { P.push(cx + a * hx, cy + b * hy, cz + c * hz); N.push(...n); A.push(part); C.push(cls); }
      I.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
    }
  };
  box(-0.1, 0.45, 0.01, 0.14, 0.9, 0.17, 1, 0); box(0.1, 0.45, 0.01, 0.14, 0.9, 0.17, 2, 0);          // Beine (bis zum Boden)
  box(0, 1.19, 0, 0.4, 0.64, 0.23, 0, 1);                                                             // Rumpf
  box(0, 1.645, 0.005, 0.19, 0.26, 0.21, 0, 2);                                                       // Kopf mit Hals
  box(0, 1.79, -0.01, 0.205, 0.06, 0.225, 0, 3);                                                      // Haar/Mütze
  for (const [s, part] of [[-1, 3], [1, 4]]) {
    box(s * 0.26, 1.17, 0, 0.1, 0.56, 0.11, part, 1, true);                                           // Arm (Ärmel)
    box(s * 0.26, 0.85, 0.01, 0.085, 0.1, 0.095, part, 2, true);                                      // Hand
  }
  box(0.26, 1.35, 0.06, 0.025, 1.1, 0.025, 5, 5);                                               // Fahnenstange in der rechten Hand
  box(0.56, 1.72, 0.06, 0.58, 0.38, 0.012, 6, 4);                                               // Fahnentuch
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
  g.setAttribute('aCls', new THREE.Float32BufferAttribute(C, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(P.length).fill(1), 3));
  g.setIndex(I);
  return g;
}

// Haltung und Jubel im Vertex-Shader (für Position und Normale dieselbe Drehung)
const FAN_POSE_GLSL = `
  attribute float aPart, aCls; attribute vec4 iA; attribute vec2 iB;   // iA: Haltung, Farbe, Phase, Fahne; iB: Blitz, Größe
  uniform float uTime; uniform vec4 uCheer; uniform vec2 uFanFade;
  varying float vFlash;
  vec3 fJo; mat3 fJm; float fJl, fJk;   // Ergebnis von fanJoint (in beginnormal_vertex gerechnet, in begin_vertex benutzt)
  mat3 fRotX( float a ) { float c = cos( a ), s = sin( a ); return mat3( 1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c ); }
  mat3 fRotZ( float a ) { float c = cos( a ), s = sin( a ); return mat3( c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0 ); }
  // Drehung des Teils um sein Gelenk; liefert Gelenk (o) und Matrix (m)
  void fanJoint( out vec3 o, out mat3 m, out float lift, out float k ) {
    vec4 ip = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
    float t = uTime, ph = iA.z * 6.2831, pose = iA.x;
    float ch = uCheer.w * ( 1.0 - smoothstep( uCheer.z * 0.6, uCheer.z, distance( ip.xz, uCheer.xy ) ) );
    bool sit = pose > 3.5;
    float cheer = sit ? 0.0 : ch * step( 0.15, fract( iA.z * 3.7 ) );   // 85 % springen auf
    float aL = 0.06 + 0.04 * sin( t * 0.7 + ph ), aR = 0.06 + 0.04 * sin( t * 0.8 + ph * 1.3 ), sL = 0.1, sR = 0.1;
    if ( pose > 0.5 && pose < 1.5 ) { aL = 2.75 + 0.15 * sin( t * 3.0 + ph ); aR = 2.75 + 0.15 * sin( t * 3.0 + ph + 1.5 ); sL = sR = 0.35; }
    else if ( pose > 1.5 && pose < 2.5 ) { aR = 1.3 + 0.08 * sin( t * 1.7 + ph ); aL = 0.9 + 0.5 * max( 0.0, sin( t * 6.0 + ph ) ); sL = -0.15; sR = -0.1; }
    else if ( pose > 2.5 && pose < 3.5 ) { aR = 2.55 + 0.35 * sin( t * 2.2 + ph ); sR = 0.2; }
    if ( cheer > 0.01 ) {
      float pump = 0.3 * sin( t * ( 7.0 + iA.z * 4.0 ) + ph );
      aL = mix( aL, 2.8 + pump, cheer ); aR = mix( aR, pose > 2.5 && pose < 3.5 ? 2.6 + 0.6 * sin( t * 5.0 + ph ) : 2.8 - pump, cheer );
      sL = mix( sL, 0.42, cheer ); sR = mix( sR, 0.42, cheer );
    }
    lift = sit ? -0.8 : cheer * abs( sin( t * ( 6.0 + iA.z * 3.0 ) + ph ) ) * 0.24;
    k = cheer;
    o = vec3( 0.0 ); m = mat3( 1.0 );
    if ( aPart > 2.5 && aPart < 3.5 ) { o = vec3( -0.26, 1.45, 0.0 ); m = fRotZ( -sL ) * fRotX( -aL ); }
    else if ( aPart > 3.5 ) { o = vec3( 0.26, 1.45, 0.0 ); m = fRotZ( sR ) * fRotX( -aR ); }
    else if ( sit && aPart > 0.5 ) { o = vec3( 0.0, 0.88, 0.0 ); m = fRotX( -1.5 ); }
  }`;

export function fanMaterial() {
  return once('fan3d', () => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
    m.userData.uFanFade = { value: new THREE.Vector2(58, 74) };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = decoUniforms.uTime; sh.uniforms.uCheer = decoUniforms.uCheer; sh.uniforms.uFanFade = m.userData.uFanFade;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + FAN_POSE_GLSL)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        fanJoint( fJo, fJm, fJl, fJk ); objectNormal = fJm * objectNormal;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 fo = fJo; mat3 fm = fJm; float fl = fJl, fk = fJk;
          vec3 p = transformed;
          if ( aPart > 5.5 ) p.z += sin( uTime * 8.0 + p.x * 7.0 + iA.z * 20.0 ) * 0.09 * ( p.x - 0.26 );   // Tuch weht
          if ( aPart > 4.5 && iA.w < 0.5 ) p = vec3( 0.26, 1.45, 0.0 );                                      // keine Fahne
          p = fo + fm * ( p - fo );
          p.y += fl;
          vec4 ip = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
          float f = 1.0 - smoothstep( uFanFade.x, uFanFade.y, distance( ip.xyz, cameraPosition ) );
          transformed = p * f;
          // Kamerablitz (Handy hoch beim Jubel an Stunts): kurz, zufällig, nur die Hand
          float fr = fract( sin( floor( uTime * 9.0 + iA.z * 50.0 ) * 12.9898 + iA.y ) * 43758.5453 );
          vFlash = iB.x * fk * step( 0.9, fr ) * step( 3.5, aPart ) * step( aPart, 4.5 ) * step( aCls, 2.5 ) * step( 1.5, aCls );
        }`)
        .replace('#include <color_vertex>', `#include <color_vertex>
        {
          float c16 = iA.y;
          vec3 shirt = 0.5 + 0.42 * cos( 6.2831 * ( c16 / 16.0 + vec3( 0.0, 0.33, 0.67 ) ) );
          shirt = mix( shirt, vec3( dot( shirt, vec3( 0.33 ) ) ) * vec3( 1.25, 1.25, 1.2 ), step( 0.7, fract( c16 * 0.37 ) ) * 0.85 );
          float h2 = fract( sin( c16 * 12.9898 + iA.z * 78.233 ) * 43758.5453 );
          vec3 pants = h2 < 0.55 ? vec3( 0.05, 0.07, 0.14 ) : h2 < 0.8 ? vec3( 0.22, 0.2, 0.17 ) : vec3( 0.36, 0.3, 0.2 );
          vec3 skin = mix( vec3( 0.86, 0.6, 0.45 ), vec3( 0.25, 0.14, 0.08 ), fract( iA.z * 7.3 ) * fract( iA.z * 7.3 ) );
          vec3 hair = fract( iA.z * 5.7 ) < 0.3 ? shirt.yzx : mix( vec3( 0.03, 0.025, 0.02 ), vec3( 0.45, 0.3, 0.12 ), step( 0.72, fract( iA.z * 3.1 ) ) );
          vec3 flag = fract( iA.z * 9.1 ) < 0.5 ? vec3( 0.95, 0.8, 0.05 ) : vec3( 0.8, 0.05, 0.05 );
          vec3 cc = aCls < 0.5 ? pants : aCls < 1.5 ? shirt : aCls < 2.5 ? skin : aCls < 3.5 ? hair : aCls < 4.5 ? flag : aCls < 5.5 ? vec3( 0.55 ) : vec3( 0.03 );
          vColor = cc * ( 0.72 + 0.28 * smoothstep( 0.0, 1.6, position.y ) );   // unten dunkler (Umgebungsverdeckung angedeutet)
        }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFlash;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3( 9.0, 9.0, 8.5 ) * vFlash;');
    };
    m.customProgramCacheKey = () => 'fan3d';
    return patchStaticShadow(m);
  });
}

// Blob-Schatten: weicher, dunkler Fleck unter jeder Figur (flache Karte, durchsichtig)
function blobTexture() {
  return once('blobTex', () => {
    const N = 64, d = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r = Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / (N / 2), k = (y * N + x) * 4; d[k + 3] = Math.round(255 * Math.max(0, 1 - r) ** 1.6); }
    const t = new THREE.DataTexture(d, N, N); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    return t;
  });
}
function blobMaterial() {
  return once('fanBlob', () => {
    const m = new THREE.MeshBasicMaterial({ color: 0x000000, map: blobTexture(), transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    m.userData.uFanFade = fanMaterial().userData.uFanFade;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFanFade = m.userData.uFanFade;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uFanFade;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 ip = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ); transformed *= 1.0 - smoothstep( uFanFade.x, uFanFade.y, distance( ip.xyz, cameraPosition ) ); }`);
    };
    m.customProgramCacheKey = () => 'fanBlob';
    return m;
  });
}

// ---------- Bauten (GB, Vertexfarben) ----------
const loc = (cx, cz, rot) => { const cs = Math.cos(rot), sn = Math.sin(rot); return (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs]; };
// Teile eines Objekts im lokalen System (lokal +z = zur Straße), y relativ zum Boden y0
function obj(b, cx, y0, cz, rot) {
  const P = loc(cx, cz, rot);
  return {
    box: (lx, ly, lz, sx, sy, sz, col, dr = 0) => { const [x, z] = P(lx, lz); b.box(x, y0 + ly, z, sx, sy, sz, col, rot + dr); },
    cyl: (lx, ly, lz, r0, r1, h, seg, col) => { const [x, z] = P(lx, lz); b.cyl(x, y0 + ly, z, r0, r1, h, seg, col); },
    gable: (lx, ly, lz, sx, sz, h, col, over = 0.3) => { const [x, z] = P(lx, lz); b.gable(x, y0 + ly, z, sx, sz, h, col, rot, over); },
  };
}
const CAR_COLS = [[0.7, 0.05, 0.04], [0.05, 0.12, 0.35], [0.85, 0.85, 0.85], [0.06, 0.06, 0.07], [0.45, 0.47, 0.5], [0.12, 0.3, 0.14], [0.8, 0.55, 0.05], [0.25, 0.08, 0.3], [0.6, 0.62, 0.65], [0.1, 0.35, 0.6], [0.5, 0.25, 0.1], [0.92, 0.9, 0.8]];
const TENT_COLS = [[0.85, 0.1, 0.08], [0.95, 0.95, 0.95], [0.1, 0.3, 0.7], [0.95, 0.7, 0.05]];
const TRUCK_COLS = [[0.9, 0.35, 0.05], [0.15, 0.55, 0.75], [0.85, 0.82, 0.75], [0.6, 0.1, 0.12]];
const STEEL = [0.5, 0.52, 0.55], DARK = [0.08, 0.08, 0.09], WOOD = [0.42, 0.28, 0.15], CONC = [0.62, 0.61, 0.58];

function car(o, v) {
  const c = CAR_COLS[v % CAR_COLS.length];
  o.box(0, 0.55, 0, 1.8, 0.62, 4.3, c);
  o.box(0, 1.08, -0.25, 1.55, 0.5, 2.2, [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6]);
  o.box(0, 1.08, -0.25, 1.58, 0.36, 2.0, [0.06, 0.08, 0.1]);   // Scheiben
  for (const [x, z] of [[-0.8, 1.35], [0.8, 1.35], [-0.8, -1.35], [0.8, -1.35]]) o.box(x, 0.32, z, 0.26, 0.64, 0.64, DARK);
}
const BUILD = {
  zelt(o, v) {   // Pavillon 5 × 5 m, Dach als Satteldach mit Volant
    const c = TENT_COLS[v % TENT_COLS.length];
    for (const [x, z] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) o.box(x, 1.2, z, 0.08, 2.4, 0.08, STEEL);
    o.box(0, 2.35, 0, 5.0, 0.3, 5.0, c);
    o.gable(0, 2.5, 0, 5.0, 5.0, 1.3, c, 0.05);
    o.box(0, 0.45, 1.2, 3.6, 0.9, 0.7, [0.92, 0.92, 0.9]);   // Theke
  },
  foodtruck(o, v) {
    const c = TRUCK_COLS[v % TRUCK_COLS.length];
    o.box(0, 1.55, -0.5, 2.3, 2.5, 5.0, c);
    o.box(0, 1.2, 2.6, 2.2, 1.8, 1.3, c);                       // Führerhaus
    o.box(0, 1.6, 2.6, 2.22, 0.6, 1.2, [0.06, 0.08, 0.1]);
    o.box(1.16, 1.7, -0.5, 0.04, 1.0, 3.0, [0.1, 0.1, 0.12]);   // Ausgabefenster (zur Seite)
    o.box(1.55, 2.45, -0.5, 0.9, 0.06, 3.2, [0.95, 0.95, 0.9], 0);   // Markise
    for (const [x, z] of [[-1, 2.4], [1, 2.4], [-1, -2], [1, -2]]) o.box(x, 0.38, z, 0.28, 0.76, 0.76, DARK);
  },
  schirm(o, v) {   // Sonnenschirm mit Biertisch-Garnitur
    const c = TENT_COLS[(v + 1) % TENT_COLS.length];
    o.cyl(0, 0, 0, 0.04, 0.04, 2.4, 6, STEEL); o.cyl(0, 2.1, 0, 1.6, 0.05, 0.55, 8, c);
    o.box(0, 0.72, 0, 0.7, 0.05, 2.2, WOOD); for (const x of [-0.65, 0.65]) o.box(x, 0.45, 0, 0.3, 0.05, 2.2, WOOD);
  },
  parkauto(o, v) { car(o, v); },
  riesenrad(o, v) {   // Riesenrad (~19 m): Rad in der Ebene quer zum Blick von der Strecke (lokal x–y), Felge und Speichen
    // als Perlenketten (GB kann nur um y drehen), 16 Gondeln, Stützen, Sockel
    const R = 8.5, h = R + 1.6, col = [[0.9, 0.9, 0.92], [0.85, 0.15, 0.1], [0.15, 0.4, 0.8]][v % 3];
    for (const x of [-0.7, 0.7]) for (const z of [-0.9, 0.9]) o.box(x, h / 2, z, 0.3, h, 0.3, STEEL);
    o.box(0, h, 0, 1.8, 0.5, 2.0, STEEL);   // Nabe
    for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; for (const z of [-0.45, 0.45]) o.box(Math.cos(a) * R, h + Math.sin(a) * R, z, 0.32, 0.32, 0.18, col); }
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; for (let q = 1; q < 8; q++) o.box(Math.cos(a) * R * q / 8, h + Math.sin(a) * R * q / 8, 0, 0.16, 0.16, 0.16, col); }
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; o.box(Math.cos(a) * R, h + Math.sin(a) * R - 1.1, 0, 1.2, 1.3, 1.2, [0.95, 0.85 - 0.5 * (k % 2), 0.2 + 0.6 * (k % 3 === 0)]); }
    o.box(0, 0.3, 0, 6, 0.6, 5, CONC);
  },
  huepfburg(o, v) {   // Hüpfburg: aufblasbare Burg, bunt
    const c1 = [0.9, 0.15, 0.1], c2 = [0.1, 0.35, 0.85], c3 = [0.98, 0.8, 0.05];
    o.box(0, 0.4, 0, 6, 0.8, 6, c2); for (const [x, z] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) { o.cyl(x, 0.8, z, 0.6, 0.55, 2.6, 8, c1); o.cyl(x, 3.4, z, 0.6, 0.05, 0.9, 8, c3); }
    o.box(0, 1.6, -2.7, 5, 1.6, 0.6, c3); o.box(-2.7, 1.6, 0, 0.6, 1.6, 5, c1); o.box(2.7, 1.6, 0, 0.6, 1.6, 5, c1);
  },
  strandbar(o) {   // Strandbar: Holzhütte mit Strohdach, Theke, Hocker
    o.box(0, 1.3, -1, 5, 2.6, 3, WOOD); o.gable(0, 2.6, -1, 5.5, 3.5, 1.5, [0.75, 0.62, 0.35], 0.5);
    o.box(0, 0.55, 1.2, 5, 1.1, 0.6, [0.55, 0.38, 0.2]);
    for (let k = -2; k <= 2; k++) o.cyl(k * 1.1, 0, 2.1, 0.18, 0.18, 0.75, 6, [0.85, 0.85, 0.8]);
    for (const x of [-4.5, 4.5]) { o.cyl(x, 0, 2.5, 0.05, 0.05, 2.5, 6, WOOD); o.cyl(x, 2.2, 2.5, 1.5, 0.05, 0.6, 8, [0.75, 0.62, 0.35]); }
  },
  apres(o) {   // Après-Ski-Hütte: Holzhaus, Satteldach, Bänke, Schild
    o.box(0, 1.6, -1.5, 7, 3.2, 5, [0.38, 0.24, 0.13]); o.gable(0, 3.2, -1.5, 7, 5, 2.4, [0.25, 0.22, 0.22], 0.8);
    o.box(0, 2.6, 1.05, 3.4, 0.7, 0.08, [0.85, 0.1, 0.1]);
    for (const x of [-2.5, 0, 2.5]) { o.box(x, 0.72, 3, 0.8, 0.05, 2.2, WOOD); for (const dx of [-0.65, 0.65]) o.box(x + dx, 0.45, 3, 0.3, 0.05, 2.2, WOOD); }
  },
  picnic(o, v) {   // Decke (zweifarbig gestreift), Klappstühle, Kühlbox
    const c = [[0.8, 0.1, 0.1], [0.1, 0.3, 0.7], [0.9, 0.7, 0.1], [0.2, 0.55, 0.25]][v % 4];
    for (let k = 0; k < 4; k++) o.box(-0.75 + k * 0.5, 0.02, 0, 0.5, 0.03, 1.6, k % 2 ? [0.92, 0.9, 0.85] : c);
    for (const x of [-1.6, 1.6]) { o.box(x, 0.42, -0.2, 0.5, 0.05, 0.45, c); o.box(x, 0.7, -0.45, 0.5, 0.55, 0.05, c); for (const dx of [-0.22, 0.22]) o.box(x + dx, 0.21, -0.2, 0.03, 0.42, 0.5, STEEL); }
    o.box(0.9, 0.2, -0.9, 0.55, 0.4, 0.35, [0.1, 0.45, 0.75]);
  },
  pyro(o) { o.box(0, 0.25, 0, 0.7, 0.5, 0.7, [0.12, 0.12, 0.13]); o.box(0, 0.51, 0, 0.72, 0.04, 0.72, [0.95, 0.75, 0.05]); for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) o.cyl(x, 0.5, z, 0.08, 0.08, 0.22, 6, DARK); },
  leitturm(o) {   // Rennleitungsturm: Sockel, Treppe, verglaste Kanzel, Dach, Antenne
    o.box(0, 4, 0, 4.5, 8, 4.5, [0.85, 0.85, 0.83]);
    o.box(0, 9.6, 0.3, 6, 3.2, 5.6, [0.06, 0.09, 0.12]);   // Glas
    for (const [x, z] of [[-3, -2.5], [3, -2.5], [-3, 3.1], [3, 3.1]]) o.box(x, 9.6, z, 0.2, 3.2, 0.2, [0.9, 0.9, 0.9]);
    o.box(0, 11.4, 0.3, 6.8, 0.4, 6.4, [0.9, 0.9, 0.9]); o.box(0, 8.1, 0.3, 6.6, 0.25, 6.2, [0.9, 0.9, 0.9]);
    o.box(0, 12.4, 0.8, 4, 1.4, 0.15, [0.75, 0.05, 0.05]);   // Schild
    o.cyl(-2, 11.6, -2, 0.05, 0.03, 4, 5, STEEL);
    for (let k = 0; k < 8; k++) o.box(2.6, 0.5 + k, -1.4 + k * 0.35, 1.2, 0.12, 0.4, STEEL);   // Außentreppe
  },
  leinwand(o) {   // Großbildleinwand 12 × 6,75 m auf zwei Stützen (Bild: eigenes Mesh)
    for (const x of [-4.5, 4.5]) o.box(x, 4, -0.6, 0.6, 8, 0.6, STEEL);
    o.box(0, 9.2, -0.45, 12.8, 7.5, 0.5, DARK);
    o.box(0, 0.3, -0.6, 12, 0.6, 2, CONC);
  },
  ampel(o, v, it) {   // Mast neben der Strecke mit Ausleger über den Fahrbahnrand
    o.box(0, 3, 0, 0.25, 6, 0.25, STEEL);
    o.box(0, 5.9, (it.arm || 3.2) / 2, 0.18, 0.18, it.arm || 3.2, STEEL);
  },
};

// ---------- Tribünen-Bauformen (n32) ----------
// Gleiche Maße wie die klassische Tribüne in deco.js (18 m lang, 7 Stufen à 1,5 m tief / 0,75 m hoch, Vorderkante z = 0,
// Blick zur Straße +z), damit die Zuschauer-Streifen auf den Stufen weiter passen. form 1: Stahltribüne mit Treppen,
// Geländern, offenem Unterbau und auskragendem Dach (0,45 m stark, Fachwerkträger); form 2: offene Alu-Tribüne ohne Dach.
export function standGeometry(form) {
  const b = new GB(), L = 18, steps = 7, D = 1.5, Hs = 0.75;
  const seat = form === 2 ? [0.72, 0.74, 0.76] : [0.55, 0.12, 0.1], seat2 = form === 2 ? [0.62, 0.64, 0.66] : [0.75, 0.75, 0.73];
  const stairC = [0.82, 0.82, 0.8], steel = form === 2 ? [0.6, 0.62, 0.64] : [0.32, 0.34, 0.38];
  const top = (k) => 1.2 + k * Hs;
  for (let k = 0; k < steps; k++) {
    const z = -1 - k * D, h = top(k);
    b.box(0, h - 0.06, z, L, 0.12, D, k % 2 ? seat2 : seat);                       // Sitzstufe
    if (form === 1) b.box(0, h - Hs / 2 - 0.06, z + D / 2 - 0.04, L, Hs, 0.08, [0.6, 0.6, 0.58]);   // Setzstufe
    for (const x of [-L / 2 + 0.6, 0, L / 2 - 0.6]) {                            // Treppen (Gänge) mit Zwischenstufe
      b.box(x, h - 0.04, z, 1.0, 0.13, D, stairC);
      b.box(x, h - Hs / 2 - 0.04, z + D / 4, 1.0, 0.13, D / 2, stairC);
    }
    for (const x of [-L / 2 + 0.2, -4.5, 4.5, L / 2 - 0.2]) b.box(x, (h - 0.12) / 2 - 0.5, z - D / 2 + 0.1, 0.16, h + 0.9, 0.16, steel);   // Unterbau
  }
  for (const y of [0.4, 1.6, 3.0]) for (const x of [-L / 2 + 0.2, -4.5, 4.5, L / 2 - 0.2]) b.box(x, y, -1 - (steps - 1) * D / 2, 0.1, 0.1, steps * D, steel);   // Längsträger
  // Geländer: vorn (Brüstung), seitlich entlang der Stufen, hinten
  for (let x = -L / 2; x <= L / 2 + 0.01; x += 1.5) b.box(x, 1.75, 0.2, 0.05, 1.1, 0.05, steel);
  b.box(0, 2.3, 0.2, L, 0.06, 0.06, steel); b.box(0, 1.35, 0.2, L, 0.5, 0.04, form === 2 ? [0.85, 0.85, 0.83] : [0.9, 0.9, 0.88]);
  for (const sx of [-1, 1]) for (let k = 0; k < steps; k++) { const z = -1 - k * D; b.box(sx * (L / 2 + 0.05), top(k) + 0.5, z, 0.05, 1.0, 0.05, steel); b.box(sx * (L / 2 + 0.05), top(k) + 1.0, z, 0.05, 0.05, D, steel); }
  const zb = -1 - (steps - 1) * D - D / 2, hb = top(steps - 1);
  b.box(0, hb + 0.55, zb - 0.05, L, 1.1, 0.06, form === 2 ? steel : [0.62, 0.61, 0.58]);
  if (form === 1) {
    // auskragendes Dach: Stützen hinten, Fachwerkträger (Ober-/Untergurt, Pfosten) nach vorn, Dachplatte 0,45 m, Blende
    const H = hb + 4.2, zf = 0.6, depth = zf - zb;
    for (const x of [-L / 2 + 0.3, -4.5, 4.5, L / 2 - 0.3]) {
      b.box(x, H / 2 - 0.5, zb - 0.3, 0.35, H + 1, 0.35, steel);
      b.box(x, H + 0.7, (zf + zb) / 2, 0.22, 0.18, depth + 0.6, steel);           // Obergurt
      b.box(x, H - 0.25, (zf + zb) / 2 - 1, 0.18, 0.15, depth - 1.5, steel);      // Untergurt
      for (let q = 0; q <= 4; q++) b.box(x, H + 0.22, zb + q * (depth - 1.5) / 4, 0.1, 0.95, 0.1, steel);   // Pfosten
    }
    b.box(0, H + 0.95, (zf + zb) / 2, L + 1, 0.45, depth + 0.8, [0.86, 0.87, 0.88]);   // Dachplatte
    b.box(0, H + 0.85, zf + 0.42, L + 1, 0.7, 0.12, [0.75, 0.08, 0.06]);              // Blende (Sponsorfarbe)
  }
  return b.geo();
}

// Ampel-Lichter: 5 Paare in einem Gehäuse, Shader-Licht aus kulisse2Uniforms.uAmpel (1 Draw-Call)
function ampelLights(cx, cy, cz, yaw) {
  const b = new GB(), P = loc(cx, cz, yaw);
  b.box(cx, cy, cz, 3.0, 0.9, 0.35, DARK, yaw);
  const nHousing = b.p.length / 3;
  for (let k = 0; k < 5; k++) for (const r of [0, 1]) {
    for (const s of [1, -1]) {   // beide Seiten (zur Startaufstellung und zurück), flache Leuchtfelder
      const [x, z] = P(-1.2 + k * 0.6, s * 0.185);
      b.box(x, cy + 0.19 - r * 0.38, z, 0.28, 0.28, 0.03, [1, 1, 1], yaw);
    }
  }
  const g = b.geo();
  const n = g.getAttribute('position').count, aI = new Float32Array(n).fill(-1);
  // Lichtnummer je Ecke (Reihenfolge wie beim Bau: 5 Lichter × 2 Reihen × 2 Seiten, je Feld gleich viele Ecken)
  const per = (n - nHousing) / 20;
  for (let q = 0; q < 20; q++) for (let v = 0; v < per; v++) aI[nHousing + q * per + v] = Math.floor(q / 4);
  g.setAttribute('aI', new THREE.Float32BufferAttribute(aI, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uAmpel: kulisse2Uniforms.uAmpel },
    vertexShader: 'attribute float aI; attribute vec3 color; varying float vI; varying vec3 vC; void main() { vI = aI; vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: `uniform vec2 uAmpel; varying float vI; varying vec3 vC;
      void main() {
        vec3 c = vec3( 0.03 );
        if ( vI > -0.5 ) c = uAmpel.y > 0.5 ? vec3( 0.2, 4.0, 0.6 ) : vI < uAmpel.x - 0.5 ? vec3( 5.0, 0.15, 0.05 ) : vec3( 0.12, 0.01, 0.01 );
        gl_FragColor = vec4( c, 1.0 );
      }`,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(g, m); mesh.name = 'kulisse2-ampel';
  return mesh;
}

function screenTexture() {
  return once('leinwandTex', () => canvasTex(512, 288, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 288); gr.addColorStop(0, '#0d47a1'); gr.addColorStop(1, '#01142f'); g.fillStyle = gr; g.fillRect(0, 0, 512, 288);
    g.fillStyle = '#ffcc00'; g.font = 'bold 64px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STUNTBAHN', 256, 110);
    g.fillStyle = '#ffffff'; g.font = 'bold 40px Arial, Helvetica, sans-serif'; g.fillText('● LIVE', 256, 190);
  }));
}

// Maschendraht-Band entlang einer Punktreihe (wie der Zaun in deco.js, Höhe h)
function fenceBand(fences, gy) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (const f of fences) {
    const b0 = pos.length / 3; let s = 0;
    f.pts.forEach((p, k) => {
      if (k) s += Math.hypot(p.x - f.pts[k - 1].x, p.z - f.pts[k - 1].z);
      const y = gy(p.x, p.z);
      pos.push(p.x, y - 0.1, p.z, p.x, y + f.h, p.z); nrm.push(0, 0.3, 1, 0, 0.3, 1); uv.push(s / 0.5, 0, s / 0.5, (f.h + 0.1) / 0.48);
      if (k) { const b = b0 + (k - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}

// Hauptfunktion: ctx = { M, gy, add, tier, theme }; Rückgabe { tris, calls, fans }
export function buildKulisse2(plan, ctx) {
  const { M, gy, add, tier } = ctx;
  const P = plan.inst, paint = M[MAT.PAINT];
  const st = { tris: 0, calls: 0, fans: 0 };
  crowdNear.value.set(0, 0);
  if (!plan.fans) return st;   // ?kulisse=alt
  const put = (mesh, caster, tris) => { add(mesh, caster); st.tris += tris; st.calls++; };
  // ----- 3D-Zuschauer -----
  const FF = FAN_FADE[tier];
  if (FF && plan.fans.length) {
    const g = fanGeometry(), list = [], iA = [], iB = [];
    const blockFoot = (f) => { let m = gy(f.bx, f.bz); const r = Math.max(f.bw || 0, f.bd || 0) / 2; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [1, 0], [0, -1], [-1, 0]]) m = Math.min(m, gy(f.bx + a * r, f.bz + b * r)); return m; };
    for (const f of plan.fans) {
      const y = f.roof != null ? blockFoot(f) + f.roof : gy(f.x, f.z) - 0.03;
      list.push({ x: f.x, y, z: f.z, rot: f.rot, sx: f.s, sy: f.s, sz: f.s });
      iA.push(f.pose, f.col, f.ph, f.flag); iB.push(f.blitz, f.s);
    }
    g.setAttribute('iA', new THREE.InstancedBufferAttribute(new Float32Array(iA), 4));
    g.setAttribute('iB', new THREE.InstancedBufferAttribute(new Float32Array(iB), 2));
    const m = fanMaterial(); m.userData.uFanFade.value.set(FF[0], FF[1]);
    const im = instanced(g, m, list, 'kulisse2-zuschauer');
    put(im, false, list.length * g.index.count / 3);
    st.fans = list.length;
    // Blob-Schatten
    const bg = new THREE.PlaneGeometry(1, 1); bg.rotateX(-Math.PI / 2); bg.translate(0, 0.04, 0);
    const bl = plan.fans.map((f, k) => ({ x: f.x, y: list[k].y, z: f.z, rot: f.rot, sx: f.pose === 4 ? 1.4 : 0.95, sy: 1, sz: f.pose === 4 ? 1.6 : 0.95 }));
    put(instanced(bg, blobMaterial(), bl, 'kulisse2-zuschauer-schatten'), false, bl.length * 2);
    crowdNear.value.set(FF[0] - 6, FF[0] + 2);   // Gruppen-Karten erst dort, wo die 3D-Figuren ausblenden
  }
  // ----- Bauten (ein Mesh) -----
  const b = new GB();
  for (const kind of ['zelt', 'foodtruck', 'schirm', 'parkauto', 'riesenrad', 'huepfburg', 'strandbar', 'apres', 'picnic', 'pyro', 'leitturm', 'leinwand', 'ampel']) {
    for (const it of P[kind] || []) BUILD[kind](obj(b, it.x, gy(it.x, it.z) - 0.02, it.z, it.rot), it.v || 0, it);
  }
  // Banden-Rahmen (Füße + Kante), Boxenmauer (Beton mit roten/weißen Feldern), Fangzaun-Pfosten (alle ~3 m)
  const signs = [];
  for (const run of plan.banden) {
    for (let k = 0; k + 2 < run.pts.length; k += 2) {
      const a = run.pts[k], c = run.pts[k + 2], x = (a.x + c.x) / 2, z = (a.z + c.z) / 2, len = Math.hypot(c.x - a.x, c.z - a.z) * 0.98, y = gy(x, z);
      const rot = Math.atan2(c.x - a.x, c.z - a.z) + Math.PI / 2, face = a.rot;   // Bande quer zur Punktreihe, Werbung zur Straße
      b.box(x, y + 0.5, z, len, 1.0, 0.12, [0.15, 0.15, 0.16], rot);
      signs.push({ x: x + Math.sin(face) * 0.07, y: y + 0.06, z: z + Math.cos(face) * 0.07, rot: face, sx: len, sy: 0.88, cell: AD_CELL((run.v + (k >> 1)) % 8) });
    }
  }
  for (const run of plan.boxenmauer) {
    for (let k = 0; k + 1 < run.length; k++) {
      const a = run[k], c = run[k + 1], x = (a.x + c.x) / 2, z = (a.z + c.z) / 2, len = Math.hypot(c.x - a.x, c.z - a.z) + 0.05, y = gy(x, z);
      const rot = Math.atan2(c.x - a.x, c.z - a.z) + Math.PI / 2;
      b.box(x, y + 0.55, z, len, 1.1, 0.45, CONC, rot);
      b.box(x, y + 0.85, z, len, 0.22, 0.47, k % 2 ? [0.85, 0.08, 0.06] : [0.95, 0.95, 0.93], rot);
    }
  }
  for (const f of plan.catchFences) {
    let last = -1e9, s = 0;
    f.pts.forEach((p, k) => {
      if (k) s += Math.hypot(p.x - f.pts[k - 1].x, p.z - f.pts[k - 1].z);
      if (s - last < 3 && k !== f.pts.length - 1) return;
      last = s; b.cyl(p.x, gy(p.x, p.z) - 0.1, p.z, 0.05, 0.05, f.h + 0.15, 6, STEEL, true);
    });
  }
  if (b.i.length) { const g = b.geo(); g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, paint); mesh.name = 'kulisse2-bauten'; put(mesh, true, g.index.count / 3); }
  // ----- Fangzaun-Netz -----
  if (plan.catchFences.length) { const g = fenceBand(plan.catchFences, gy); const mesh = new THREE.Mesh(g, fenceMaterial()); mesh.name = 'kulisse2-fangzaun'; put(mesh, false, g.index.count / 3); }
  // ----- Banden-Werbung (schärferer Werbe-Atlas) -----
  if (signs.length) put(instanced(quadGeometry(), signMaterial(), signs, 'kulisse2-banden', true), false, signs.length * 2);
  // ----- Startaufstellung: weiße Winkel auf der Fahrbahn -----
  if (plan.startGrid.length) {
    const gb = new GB(), W = [0.95, 0.95, 0.93];
    for (const sp of plan.startGrid) {
      const o = obj(gb, sp.x, sp.y + 0.025, sp.z, sp.rot);
      o.box(0, 0, 0.6, 2.2, 0.01, 0.16, W); o.box(-1.02, 0, -0.2, 0.16, 0.01, 1.6, W); o.box(1.02, 0, -0.2, 0.16, 0.01, 1.6, W);
    }
    const g = gb.geo();
    const m = once('gridPaint', () => patchStaticShadow(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })));
    const mesh = new THREE.Mesh(g, m); mesh.name = 'kulisse2-startaufstellung'; put(mesh, false, g.index.count / 3);
  }
  // ----- Startampel: am Portal (unter der Brücke) bzw. am Mast -----
  const amp = plan.ampel && plan.portal ? { x: plan.portal.x, y: plan.portal.y + 9.2, z: plan.portal.z, yaw: Math.atan2(plan.portal.tx, plan.portal.tz) + Math.PI / 2 } : null;
  const mast = (P.ampel || [])[0];
  const A = amp || (mast ? (() => { const [x, z] = loc(mast.x, mast.z, mast.rot)(0, mast.arm || 3.2); return { x, y: gy(mast.x, mast.z) + 5.3, z, yaw: mast.rot + Math.PI / 2 }; })() : null);
  if (A) { const mesh = ampelLights(A.x, A.y, A.z, A.yaw); put(mesh, false, mesh.geometry.index.count / 3); }
  // ----- Leinwand-Bild -----
  for (const lw of P.leinwand || []) {
    const m = once('leinwandMat', () => new THREE.MeshStandardMaterial({ map: screenTexture(), emissive: 0xffffff, emissiveMap: screenTexture(), emissiveIntensity: 0.9, roughness: 0.4, metalness: 0 }));
    const g = new THREE.PlaneGeometry(12, 6.75), mesh = new THREE.Mesh(g, m), [x, z] = loc(lw.x, lw.z, lw.rot)(0, -0.18);
    mesh.position.set(x, gy(lw.x, lw.z) + 9.2, z); mesh.rotation.set(0, lw.rot, 0); mesh.name = 'kulisse2-leinwand';
    put(mesh, false, 2);
  }
  return st;
}
