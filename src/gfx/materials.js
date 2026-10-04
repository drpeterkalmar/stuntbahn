// PBR-Materialien der Strecke (Poly-Haven-Texturen, CC0) + Shader-Erweiterungen:
//  - statischer Schatten (einmal gerenderte Sonnen-Tiefenkarte, "vorberechnetes Licht")
//  - Fahrbahnmarkierungen (Randlinien, Mittelstreifen, Start/Ziel-Karo, Checkpoint-Linie)
//  - Randsteine rot/weiß, Gras mit Kachel-Brechung
import * as THREE from 'three';
import { MAT, WORLD_HALF, WORLD_SCALE } from '../track/defs.js';

const loader = new THREE.TextureLoader();
const cache = new Map();
// KTX2 (n17): kachelnde PBR-Texturen GPU-komprimiert (Basis ETC1S → ETC2/ASTC/BC je Gerät, ~¼ Grafikspeicher). Vorab
// geladen (preloadKtx2), damit Materialien gleich mit Textur kompiliert werden. Scheitert etwas (kein WASM, Fehler) oder
// ?ktx=0: WebP wie bisher.
const ktx2 = new Map();
export const KTX2_SETS = ['asphalt', 'concrete', 'grass', 'pad', 'metal'];
export async function preloadKtx2(renderer) {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('ktx') === '0') return 0;
  try {
    const L = await ktxShared(renderer);   // n20: ein gemeinsamer Lader (auch für die Themen-Texturen)
    const names = KTX2_SETS.flatMap((s) => ['diff', 'nor', 'arm'].map((k) => `${s}_${k}`));
    const res = await Promise.all(names.map((n) => L.loadAsync(`assets/tex/${n}.ktx2`).then((t) => [n, t])));
    for (const [n, t] of res) ktx2.set(n, t);
    return ktx2.size;
  } catch (e) {
    console.warn('KTX2 nicht verfügbar, WebP', e && e.message);
    ktx2.clear();
    return 0;
  }
}
export function ktx2Count() { return ktx2.size; }
// Kulissen (n20): weitere KTX2-Texturen bei Bedarf (Boden/Fels der Landschafts-Themen); der Lader bleibt bestehen
let ktxLoader = null;
function ktxShared(renderer) {
  if (!ktxLoader) ktxLoader = import('three/addons/loaders/KTX2Loader.js').then(({ KTX2Loader }) => new KTX2Loader().detectSupport(renderer));
  return ktxLoader;
}
export async function loadKtx2(renderer, url) {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('ktx') === '0') throw new Error('KTX2 aus');
  return (await ktxShared(renderer)).loadAsync(url);
}
// 1×1-Tiefentextur mit Vergleichsmodus als Platzhalter (sampler2DShadow braucht Depth-Format)
const dummyDepth = new THREE.DepthTexture(1, 1);
dummyDepth.type = THREE.UnsignedIntType;
dummyDepth.compareFunction = THREE.LessEqualCompare;
export const dummyShadowRT = new THREE.WebGLRenderTarget(1, 1, { depthTexture: dummyDepth, depthBuffer: true });
export const shadowUniforms = {
  sbShadowMap: { value: dummyDepth },
  sbShadowMat: { value: new THREE.Matrix4() },
  sbShadowOn: { value: 0 },
  sbTexel: { value: 1 / 2048 },
  sbBias: { value: 0.0009 },   // Tiefen-Versatz (Anteil der Bake-Tiefe; env.js hält ihn bei 1,26 m)
  // Wolkenschatten (28.09.2026): wandernde Rauschtextur dämpft das Sonnenlicht; Stufe 0 aus
  sbCloudTex: { value: cloudTexture() },
  sbCloudOn: { value: 1 },
  sbTime: { value: 0 },
  // Kino-Look (n17): 0 = wie bis n22, ≥ 1 Fahrbahn-Details (Flicken, Risse) und Fels, 2 = dazu weiche Schattenkanten
  sbKino: { value: 0 },
};

// Kachelbares Wertrauschen (fbm, 256²) für die Wolkenschatten – einmal erzeugt, keine Datei
function cloudTexture() {
  const N = 256, out = new Uint8Array(N * N * 4);
  let seed = 991; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const oct = [[8, 0.5], [16, 0.28], [32, 0.14], [64, 0.08]].map(([g, a]) => { const v = new Float32Array(g * g); for (let i = 0; i < v.length; i++) v[i] = R(); return { g, a, v }; });
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0;
    for (const { g, a, v } of oct) {
      const fx = x / N * g, fy = y / N * g, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
      const V = (i, j) => v[((j % g + g) % g) * g + ((i % g + g) % g)];
      s += a * ((V(x0, y0) * (1 - tx) + V(x0 + 1, y0) * tx) * (1 - ty) + (V(x0, y0 + 1) * (1 - tx) + V(x0 + 1, y0 + 1) * tx) * ty);
    }
    const k = (y * N + x) * 4; out[k] = out[k + 1] = out[k + 2] = Math.round(s / 1.0 * 255); out[k + 3] = 255;
  }
  const t = new THREE.DataTexture(out, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

function tex(url, srgb, repeat, aniso) {
  const key = url + '|' + repeat;
  if (cache.has(key)) return cache.get(key);
  const kn = /assets\/tex\/(\w+)\.webp$/.exec(url), k = kn && ktx2.get(kn[1]);
  const t = k ? k.clone() : loader.load(url);   // clone teilt die GPU-Daten (gleiche Quelle), eigene Wiederholung
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  cache.set(key, t);
  return t;
}

// onBeforeCompile-Verkettung
function addPatch(mat, fn) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); fn(sh, r); };
  const pk = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  const tag = fn.tag || 'p';
  mat.customProgramCacheKey = () => pk() + '|' + tag;
}

// Statischer Sonnenschatten für alle Welt- und Auto-Materialien
export function patchStaticShadow(mat) {
  const fn = (sh) => {
    Object.assign(sh.uniforms, shadowUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSbWorld;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      {
        vec4 sbw = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          sbw = instanceMatrix * sbw;
        #endif
        vSbWorld = ( modelMatrix * sbw ).xyz;
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
      varying vec3 vSbWorld;
      uniform sampler2DShadow sbShadowMap;
      uniform mat4 sbShadowMat;
      uniform float sbShadowOn;
      uniform float sbTexel;
      uniform float sbBias;
      uniform sampler2D sbCloudTex;
      uniform float sbCloudOn, sbTime, sbKino;
      // Wolkenschatten: driften langsam mit dem Wind (≈ 9 m/s), dämpfen die Sonne um bis zu 55 %
      float sbCloud() {
        if ( sbCloudOn < 0.5 ) return 1.0;
        vec2 p = vSbWorld.xz / 1500.0 + vec2( 0.006, 0.0025 ) * sbTime;
        float n = texture2D( sbCloudTex, p ).r;   // ein Zugriff (4 Oktaven stecken in der Textur)
        return 1.0 - 0.55 * smoothstep( 0.5, 0.64, n );
      }
      float sbStatic() {
        float cl = sbCloud();
        if ( sbShadowOn < 0.5 ) return cl;
        vec4 sc = sbShadowMat * vec4( vSbWorld, 1.0 );
        vec3 c = sc.xyz / sc.w;
        if ( c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0 || c.z >= 1.0 ) return cl;
        float z = c.z - sbBias;
        float d = sbTexel * 1.25;
        float s = texture( sbShadowMap, vec3( c.xy + vec2( -d, -d ), z ) )
                + texture( sbShadowMap, vec3( c.xy + vec2(  d, -d ), z ) )
                + texture( sbShadowMap, vec3( c.xy + vec2( -d,  d ), z ) )
                + texture( sbShadowMap, vec3( c.xy + vec2(  d,  d ), z ) );
        if ( sbKino > 1.5 ) {
          // Kino (n17): 4 weitere, gedrehte Abtastungen (Poisson, Drehung je Pixel) → weiche Halbschatten statt Treppen
          float a = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) * 6.2831853;
          mat2 R = mat2( cos( a ), sin( a ), -sin( a ), cos( a ) ) * sbTexel * 2.2;
          s += texture( sbShadowMap, vec3( c.xy + R * vec2( 0.94, 0.34 ), z ) ) + texture( sbShadowMap, vec3( c.xy + R * vec2( -0.4, 0.92 ), z ) )
             + texture( sbShadowMap, vec3( c.xy + R * vec2( -0.92, -0.38 ), z ) ) + texture( sbShadowMap, vec3( c.xy + R * vec2( 0.36, -0.93 ), z ) );
          return s * 0.125 * cl;
        }
        return s * 0.25 * cl;
      }`)
      // Chunk selbst einsetzen: #include wird erst NACH onBeforeCompile aufgelöst
      .replace('#include <lights_fragment_begin>', 'float sbShadowF = sbStatic();\n' + THREE.ShaderChunk.lights_fragment_begin
        .replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= ( UNROLLED_LOOP_INDEX == 0 ) ? sbShadowF : 1.0;'));
  };
  fn.tag = 'sb';
  addPatch(mat, fn);
  return mat;
}

function patchRoad(mat, detail = true) {
  const fn = (sh) => {
    sh.uniforms.sbKino = shadowUniforms.sbKino;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRoad;\nvarying vec4 vRoad;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = aRoad;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
      varying vec4 vRoad;
      float rRough = 0.0;   // sbKino: Uniform aus patchStaticShadow
      float rHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      float rNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( rHash( i ), rHash( i + vec2( 1, 0 ) ), f.x ), mix( rHash( i + vec2( 0, 1 ) ), rHash( i + vec2( 1, 1 ) ), f.x ), f.y ); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp( roughnessFactor + rRough, 0.04, 1.0 );')
      .replace('#include <map_fragment>', `#include <map_fragment>
      ${detail ? `
      // Kino (n17): Asphalt wie auf echten Strecken – Flicken (frischer, dunkler, eigene Kante), mit Bitumen versiegelte
      // Risse (dunkel, glänzend); prozedural in Streckenkoordinaten
      // (s entlang, x quer), damit nichts kachelt. Großflächige Helligkeitsflecken brechen die Textur-Wiederholung.
      if ( sbKino > 0.5 ) {
        float x = vRoad.x, s = vRoad.z, hw = vRoad.y - floor( vRoad.y / 100.0 + 0.001 ) * 100.0;
        float fw = max( fwidth( s ), 0.002 );
        float big = rNoise( vec2( x * 0.12, s * 0.05 ) ) * 0.6 + rNoise( vec2( x * 0.4, s * 0.17 ) ) * 0.4;
        diffuseColor.rgb *= mix( 0.86, 1.1, big );
        float cell = floor( s / 31.0 ), h = rHash( vec2( cell, 7.7 ) );
        if ( h < 0.45 ) {
          float len = 3.0 + 9.0 * fract( h * 17.3 ), w = 0.9 + 1.4 * fract( h * 29.1 );
          float s0 = cell * 31.0 + fract( h * 5.3 ) * ( 31.0 - len ), x0 = ( fract( h * 11.7 ) * 2.0 - 1.0 ) * max( 0.0, hw - w - 0.6 );
          vec2 q = vec2( abs( x - x0 ) - w, abs( s - s0 - len * 0.5 ) - len * 0.5 );
          float inside = 1.0 - smoothstep( -fw, fw, max( q.x, q.y ) );
          float seam = 1.0 - smoothstep( 0.0, 0.06 + fw, abs( max( q.x, q.y ) ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.66, 0.66, 0.68 ), inside );
          diffuseColor.rgb *= 1.0 - 0.45 * seam;
          rRough += 0.06 * inside - 0.25 * seam;
        }
        // versiegelte Querrisse (Temperaturrisse, mit Bitumen vergossen): je ~13 m Zelle höchstens einer, leicht gewellt,
        // nicht immer über die ganze Breite
        float cc = floor( s / 13.0 ), hc = rHash( vec2( cc, 1.3 ) );
        float sc = cc * 13.0 + 2.0 + 9.0 * fract( hc * 7.1 ) + ( rNoise( vec2( x * 0.9, cc ) ) - 0.5 ) * 0.9 + x * ( fract( hc * 3.7 ) - 0.5 ) * 0.25;
        float span = step( abs( x - ( fract( hc * 13.1 ) - 0.5 ) * hw ), hw * ( 0.45 + 0.6 * fract( hc * 5.9 ) ) );
        float crack = ( 1.0 - smoothstep( 0.025, 0.025 + fw * 1.5, abs( s - sc ) ) ) * step( hc, 0.5 ) * span;
        diffuseColor.rgb *= 1.0 - 0.5 * crack;
        rRough -= 0.35 * crack;
      }` : ''}
      {
        float x = vRoad.x, typ = floor( vRoad.y / 100.0 + 0.001 ), hw = vRoad.y - typ * 100.0;
        float s = vRoad.z, md = vRoad.w;
        float narrow = step( 9.5, typ ); float t = typ - narrow * 10.0;
        float ax = abs( x );
        float fw = max( fwidth( ax ), 0.002 );
        float edge = smoothstep( hw - 0.52 - fw, hw - 0.52 + fw, ax ) * ( 1.0 - smoothstep( hw - 0.36 - fw, hw - 0.36 + fw, ax ) );
        // Mittelstreifen 6 m Strich / 12 m Lücke wie auf der Autobahn (bis n22 4/5 m: bei Tempo flimmerte er doppelt so oft
        // vorbei – die Strecke wirkte schneller, als der Tacho sagt)
        float dash = ( 1.0 - narrow ) * ( 1.0 - smoothstep( 0.07 - fw, 0.07 + fw, ax ) ) * step( mod( s, 18.0 ), 6.0 );
        vec3 paint = vec3( 0.86, 0.86, 0.84 );
        float amt = max( edge, dash ) * 0.92;
        if ( t > 0.5 && t < 1.5 && abs( md ) < 1.35 ) {
          float cx = floor( ( x + 20.0 ) / 0.9 ) + floor( ( md + 20.0 ) / 0.9 );
          float chk = mod( cx, 2.0 );
          diffuseColor.rgb = mix( vec3( 0.02 ), vec3( 0.9 ), chk );
          amt = 0.0;
        }
        if ( t > 1.5 && abs( md ) < 0.35 ) { paint = vec3( 0.95, 0.72, 0.08 ); amt = 0.95; }
        diffuseColor.rgb = mix( diffuseColor.rgb, paint, amt );
      }`);
  };
  fn.tag = detail ? 'road2' : 'road';
  addPatch(mat, fn);
}

// Kulissen (n20): Boden-Palette des Landschafts-Themas (Werte von „Land“ = bisher fest im Shader). gfx/themes.js setzt sie.
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
export const themeUniforms = {
  tG0: { value: v3([0.035, 0.085, 0.02]) }, tG1: { value: v3([0.2, 0.34, 0.08]) }, tDry: { value: v3([0.26, 0.27, 0.12]) }, tDryK: { value: 0.55 },
  tTint: { value: v3([0.7, 0.85, 0.5]) }, tTintK: { value: 0.25 }, tFields: { value: 1 }, tForest: { value: v3([0.03, 0.06, 0.022]) }, tForestK: { value: 1 },
  tDirt0: { value: v3([0.055, 0.038, 0.022]) }, tDirt1: { value: v3([0.11, 0.08, 0.05]) }, tRock0: { value: v3([0.06, 0.055, 0.05]) }, tRock1: { value: v3([0.16, 0.145, 0.125]) },
  tSlope: { value: new THREE.Vector4(0.93, 0.86, 0.83, 0.72) }, tStrata: { value: 0 }, tStrataCol: { value: v3([0.3, 0.12, 0.06]) },
  tSnowH: { value: 1e5 }, tBeach: { value: -1e5 }, tCity: { value: 0 }, tRockTex: { value: 0 }, tRockMap: { value: null }, tSnowAll: { value: 0 },
  tTreeSnow: { value: 0 }, tTreeTint: { value: v3([1, 1, 1]) },
};
export function setGround(g) {
  const U = themeUniforms;
  for (const k of ['g0', 'g1', 'dry', 'tint', 'forest', 'dirt0', 'dirt1', 'rock0', 'rock1', 'strataCol']) U['t' + k[0].toUpperCase() + k.slice(1)].value.set(...g[k]);
  U.tDryK.value = g.dryK; U.tTintK.value = g.tintK; U.tFields.value = g.fields; U.tForestK.value = g.forestK; U.tSlope.value.set(...g.slope);
  U.tStrata.value = g.strata; U.tSnowH.value = g.snowH; U.tBeach.value = g.beach; U.tCity.value = g.city; U.tRockTex.value = g.rockTex && U.tRockMap.value ? 1 : 0;
  U.tSnowAll.value = g.snowAll || 0;
}
// Platzhalter für den Fels-Sampler (Themen ohne eigene Fels-Textur)
themeUniforms.tRockMap.value = (() => { const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); t.needsUpdate = true; return t; })();

// Gelände nach Neigung (n22): an; URL ?gelfarbe=0 = Gras überall wie bis n21 (Vergleich)
export const rockUniform = { value: globalThis.location && new URLSearchParams(globalThis.location.search).get('gelfarbe') === '0' ? 0 : 1 };
function patchGrass(mat) {
  // zweite Abtastung in anderem Maßstab + Farbvariation gegen sichtbare Kacheln
  const fn = (sh) => {
    sh.uniforms.sbRock = rockUniform;
    sh.uniforms.sbKino = shadowUniforms.sbKino;
    Object.assign(sh.uniforms, themeUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGw;\nvarying vec3 vGn;\nvarying float vGy;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGw = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;\nvGy = ( modelMatrix * vec4( transformed, 1.0 ) ).y;\nvGn = normalize( mat3( modelMatrix ) * objectNormal );');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
      varying vec2 vGw;
      varying vec3 vGn;
      varying float vGy;
      uniform float sbRock;
      uniform vec3 tG0, tG1, tDry, tTint, tForest, tDirt0, tDirt1, tRock0, tRock1, tStrataCol;
      uniform float tDryK, tTintK, tFields, tForestK, tStrata, tSnowH, tBeach, tCity, tRockTex, tSnowAll;
      uniform vec4 tSlope;
      uniform sampler2D tRockMap;
      float gHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      float gNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( gHash( i ), gHash( i + vec2( 1, 0 ) ), f.x ), mix( gHash( i + vec2( 0, 1 ) ), gHash( i + vec2( 1, 1 ) ), f.x ), f.y ); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 c2 = texture2D( map, vGw * 0.071 + vec2( 0.37, 0.11 ) ).rgb;
        float n = gNoise( vGw * 0.018 ) * 0.6 + gNoise( vGw * 0.07 ) * 0.4;
        vec3 base = mix( diffuseColor.rgb, c2, 0.45 );
        float lum = dot( base, vec3( 0.3, 0.55, 0.15 ) );
        // Kulissen (n20): Palette des Themas (Land = Werte bis n23)
        vec3 green = mix( tG0, tG1, clamp( lum * 2.4, 0.0, 1.0 ) );
        vec3 dry = tDry * clamp( lum * 2.0, 0.3, 1.2 );
        green = mix( green, dry, smoothstep( 0.55, 0.95, n ) * tDryK );
        diffuseColor.rgb = mix( green, base * tTint, tTintK ) * mix( 0.85, 1.12, n );
        // Optik (28.09.2026): außerhalb des Streckenrasters Felder mit Hecken (Getreide, Acker, Raps, Wiese),
        // an den Hängen des Bergkranzes Wald – die Ferne wirkt bewirtschaftet statt einheitlich grün
        float farD = max( abs( vGw.x ), abs( vGw.y ) ) - ${(WORLD_HALF + 70 * WORLD_SCALE).toFixed(1)};
        float rr = length( vGw );
        if ( farD > 0.0 && tFields > 0.5 ) {
          float detail = clamp( lum / 0.16, 0.65, 1.35 );
          float fk = smoothstep( 0.0, 90.0, farD ) * ( 1.0 - smoothstep( ${(1050 * WORLD_SCALE).toFixed(1)}, ${(1350 * WORLD_SCALE).toFixed(1)}, rr ) );
          vec2 q = mat2( 0.955, -0.296, 0.296, 0.955 ) * vGw;
          vec2 cs = vec2( 150.0, 95.0 ) * ${WORLD_SCALE.toFixed(2)};
          vec2 cid = floor( q / cs ), f = fract( q / cs );
          float h = gHash( cid ), rows = 0.5 + 0.5 * sin( ( h > 0.5 ? q.x : q.y ) * 1.4 );
          vec3 crop = diffuseColor.rgb;
          if ( h < 0.2 ) crop = vec3( 0.46, 0.39, 0.16 ) * ( 0.85 + 0.25 * rows ) * detail;
          else if ( h < 0.33 ) crop = vec3( 0.19, 0.13, 0.08 ) * ( 0.75 + 0.4 * rows ) * detail;
          else if ( h < 0.44 ) crop = vec3( 0.2, 0.33, 0.07 ) * ( 0.9 + 0.2 * rows ) * detail;
          else if ( h < 0.5 ) crop = vec3( 0.52, 0.5, 0.1 ) * detail;
          float edge = min( min( f.x, 1.0 - f.x ) * cs.x, min( f.y, 1.0 - f.y ) * cs.y );
          float hedge = ( 1.0 - smoothstep( 1.5, 4.5, edge ) ) * step( 0.35, gHash( cid + 7.0 ) );
          crop = mix( crop, vec3( 0.03, 0.065, 0.02 ) * detail, hedge );
          diffuseColor.rgb = mix( diffuseColor.rgb, crop, fk );
        }
        // Kulissen (n20): Stadt – außerhalb des Streckenrasters Häuserblocks mit Straßen, Dächern, Parks
        if ( farD > 0.0 && tCity > 0.5 ) {
          float fk = smoothstep( 0.0, 60.0, farD );
          vec2 q = vGw / 92.0, cid = floor( q ), f = fract( q );
          float h = gHash( cid );
          float street = 1.0 - smoothstep( 0.075, 0.095, min( min( f.x, 1.0 - f.x ), min( f.y, 1.0 - f.y ) ) );
          vec3 roof = mix( vec3( 0.13, 0.13, 0.135 ), vec3( 0.3, 0.2, 0.15 ), step( 0.6, gHash( floor( q * 4.0 ) ) ) ) * ( 0.75 + 0.5 * gHash( floor( q * 8.0 ) ) );
          vec3 lot = h < 0.18 ? diffuseColor.rgb : roof;
          vec3 c = mix( lot, vec3( 0.06, 0.06, 0.065 ), street );
          diffuseColor.rgb = mix( diffuseColor.rgb, c, fk );
        }
        // Gelände nach Neigung (n22, Gelände-Strecken: „nicht wie grüne Knetmasse“): flach Gras, ab ~22° Erde/Schotter
        // (Böschungen), ab ~35° Fels mit Schichten; flache Wiesen bleiben unverändert (alte Strecken haben kaum so steile Hänge)
        // Fels-Textur-Koordinaten und Ableitungen außerhalb der Verzweigung (sonst flimmern die Mipmaps an Hangkanten)
        vec2 prT = ( abs( vGn.x ) > abs( vGn.z ) ? vec2( vGw.y, vGy ) : vec2( vGw.x, vGy ) ) * 0.045, prDx = dFdx( prT ), prDy = dFdy( prT );
        if ( sbRock > 0.5 ) {
          float ny = normalize( vGn ).y;
          float dirt = smoothstep( tSlope.x, tSlope.y, ny ), rock = smoothstep( tSlope.z, tSlope.w, ny );
          if ( dirt > 0.0 ) {
            float gn = gNoise( vGw * 0.35 ) * 0.5 + gNoise( vGw * 1.7 ) * 0.5;
            vec3 dcol = mix( tDirt0, tDirt1, gn ) * clamp( lum * 4.0, 0.6, 1.3 );
            vec2 pr = abs( vGn.x ) > abs( vGn.z ) ? vec2( vGw.y, vGy ) : vec2( vGw.x, vGy );
            float st = 0.5 + 0.5 * sin( vGy * 1.9 + gNoise( pr * 0.12 ) * 5.0 );
            float rn = gNoise( pr * 0.45 ) * 0.6 + gNoise( pr * 2.1 ) * 0.4;
            vec3 rcol = mix( tRock0, tRock1, rn ) * ( 0.75 + 0.4 * st );
            if ( tRockTex > 0.5 ) { vec3 rt = textureGrad( tRockMap, prT, prDx, prDy ).rgb; rcol = mix( rcol, rt * ( 0.8 + 0.35 * st ), 0.65 ); }
            // Canyon (n20): waagrechte Schichtbänder im Fels
            if ( tStrata > 0.5 ) { float b = 0.5 + 0.5 * sin( vGy * 0.55 + gNoise( pr * 0.05 ) * 3.0 ); float b2 = smoothstep( 0.55, 0.9, 0.5 + 0.5 * sin( vGy * 0.17 + 1.3 ) ); rcol = mix( rcol, tStrataCol * ( 0.8 + 0.4 * rn ), 0.35 * b + 0.35 * b2 ); }
            if ( sbKino > 0.5 ) {
              // Kino (n17): Fels mit Klüften (dunkle, fast senkrechte Spalten), feiner Körnung und Flechten-Flecken
              float fine = gNoise( pr * 7.0 ) * 0.5 + gNoise( pr * 19.0 ) * 0.5;
              float kluft = smoothstep( 0.035, 0.0, abs( gNoise( vec2( pr.x * 0.35, vGy * 0.06 ) ) - 0.5 ) - 0.002 );
              float flechte = smoothstep( 0.62, 0.75, gNoise( pr * 0.9 + 7.0 ) );
              rcol *= ( 0.78 + 0.44 * fine ) * ( 1.0 - 0.6 * kluft );
              rcol = mix( rcol, vec3( 0.13, 0.135, 0.08 ), flechte * 0.45 );
            }
            diffuseColor.rgb = mix( diffuseColor.rgb, dcol, dirt * 0.85 );
            diffuseColor.rgb = mix( diffuseColor.rgb, rcol, rock );
          }
        }
        if ( rr > ${(820 * WORLD_SCALE).toFixed(1)} ) {   // nur in der Ferne rechnen (nahe der Strecke kostet es nichts)
          float fo = smoothstep( ${(820 * WORLD_SCALE).toFixed(1)}, ${(1150 * WORLD_SCALE).toFixed(1)}, rr ) * smoothstep( 0.42, 0.6, gNoise( vGw * 0.0035 ) * 0.75 + gNoise( vGw * 0.02 ) * 0.25 );
          diffuseColor.rgb = mix( diffuseColor.rgb, tForest * ( 0.7 + 0.6 * gNoise( vGw * 0.09 ) ), clamp( fo * tForestK, 0.0, 1.0 ) );
        }
        // Kulissen (n20): Schnee über der Schneegrenze (Alpen; flache Stellen zuerst), Sandstrand am Meer (Küste)
        if ( vGy > tSnowH - 60.0 ) {
          float ny2 = normalize( vGn ).y;
          float sn = smoothstep( tSnowH - 25.0, tSnowH + 30.0, vGy + ( gNoise( vGw * 0.01 ) - 0.5 ) * 90.0 ) * smoothstep( 0.45, 0.75, ny2 );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.82, 0.85, 0.9 ) * ( 0.9 + 0.15 * gNoise( vGw * 0.2 ) ), sn );
        }
        if ( vGy < tBeach && rr > ${(Math.SQRT2 * (WORLD_HALF + 60 * WORLD_SCALE) + 20).toFixed(1)} ) {   // nur am Meer, außerhalb des Streckenrasters
          float sb = smoothstep( tBeach, tBeach - 2.5, vGy + ( gNoise( vGw * 0.03 ) - 0.5 ) * 2.0 );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.62, 0.53, 0.38 ) * ( 0.85 + 0.25 * gNoise( vGw * 0.4 ) ), sb );
        }
      }`);
  };
  fn.tag = 'grass2';
  addPatch(mat, fn);
}

// Wasser: bewegte Wellen (Normalen aus überlagerten Sinuswellen in Weltkoordinaten) → der Himmel spiegelt sich
// unruhig; zum Rand hin mehr Spiegelung (Fresnel über die Umgebungskarte)
function patchWater(mat) {
  const fn = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      {
        vec2 p = vSbWorld.xz; float t = sbTime;
        float gx = 0.07 * cos( p.x * 0.9 + t * 1.3 ) + 0.05 * cos( p.x * 0.53 + p.y * 0.61 + t * 0.9 ) + 0.03 * cos( p.x * 2.1 - p.y * 1.3 + t * 2.1 );
        float gz = 0.07 * cos( p.y * 0.8 - t * 1.1 ) + 0.05 * cos( p.y * 0.47 - p.x * 0.7 + t * 1.2 ) + 0.03 * cos( p.y * 1.9 + p.x * 1.1 - t * 1.7 );
        normal = normalize( normal + ( viewMatrix * vec4( -gx, 0.0, -gz, 0.0 ) ).xyz );
      }`);
  };
  fn.tag = 'water';
  addPatch(mat, fn);
}

// Randsteine (n17): rot/weiß wie bisher, dazu abgefahrene Farbe, Gummiabrieb und Schmutz an der Kante (Canvas,
// keine Datei). Querrillen kommen aus der Beton-Normalenkarte.
function kerbTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c21d14'; g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#f2f2ee'; g.fillRect(0, 128, 64, 128);
  let seed = 4242; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // abgeplatzte Farbe (Beton schaut durch), feine Sprenkel
  for (let i = 0; i < 520; i++) {
    const x = R() * 64, y = R() * 256, r = 0.4 + R() * (R() < 0.08 ? 3.2 : 1.1);
    g.fillStyle = R() < 0.5 ? `rgba(120,116,108,${0.25 + R() * 0.45})` : `rgba(0,0,0,${0.05 + R() * 0.12})`;
    g.beginPath(); g.ellipse(x, y, r * (1 + R()), r, R() * 3, 0, 7); g.fill();
  }
  // Gummiabrieb (dunkle Schlieren quer zur Fahrtrichtung, zur Innenkante dichter)
  for (let i = 0; i < 26; i++) {
    const x = R() * 64, y = R() * 256;
    const gr = g.createLinearGradient(x - 18, 0, x + 18, 0);
    gr.addColorStop(0, 'rgba(20,18,16,0)'); gr.addColorStop(0.5, `rgba(20,18,16,${0.12 + R() * 0.18})`); gr.addColorStop(1, 'rgba(20,18,16,0)');
    g.fillStyle = gr; g.fillRect(x - 18, y, 36, 2 + R() * 6);
  }
  // Schmutz am äußeren Rand
  const dg = g.createLinearGradient(0, 0, 64, 0);
  dg.addColorStop(0, 'rgba(70,58,40,0.35)'); dg.addColorStop(0.18, 'rgba(70,58,40,0)'); dg.addColorStop(0.85, 'rgba(70,58,40,0)'); dg.addColorStop(1, 'rgba(70,58,40,0.3)');
  g.fillStyle = dg; g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(1, 0.5);
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  return t;
}

// Kulissen (n20): Tannen je Thema – Farbe (tTreeTint) und Schnee auf den Zweigen (tTreeSnow, Winter): helle Flecken auf den
// oberen, nach außen zeigenden Teilen der Karte
export function patchTreeTheme(m) {
  const fn = (sh) => {
    sh.uniforms.tTreeSnow = themeUniforms.tTreeSnow; sh.uniforms.tTreeTint = themeUniforms.tTreeTint;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float tTreeSnow;\nuniform vec3 tTreeTint;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb *= tTreeTint;
      if ( tTreeSnow > 0.0 ) {
        // weiche Schneeflecken (Wertrauschen, bilinear) statt harter Zellen
        vec2 q = vMapUv * vec2( 24.0, 36.0 ), qi = floor( q ), qf = fract( q ); qf = qf * qf * ( 3.0 - 2.0 * qf );
        float h00 = fract( sin( dot( qi, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ), h10 = fract( sin( dot( qi + vec2( 1, 0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
        float h01 = fract( sin( dot( qi + vec2( 0, 1 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 ), h11 = fract( sin( dot( qi + vec2( 1, 1 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
        float h = mix( mix( h00, h10, qf.x ), mix( h01, h11, qf.x ), qf.y );
        float s = smoothstep( 0.4, 0.75, h ) * 0.75 * smoothstep( 0.02, 0.12, dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86, 0.88, 0.92 ), s * tTreeSnow );
      }`);
  };
  fn.tag = 'treeTheme';
  addPatch(m, fn);
  return m;
}

export function makeMaterials(renderer, q = {}) {
  // Platzhalter-Tiefentextur auf der GPU anlegen (sonst bindet three.js eine RGBA-Leertextur)
  renderer.setRenderTarget(dummyShadowRT); renderer.clear(); renderer.setRenderTarget(null);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const set = (name, rep) => ({
    map: tex(`assets/tex/${name}_diff.webp`, true, rep, aniso),
    normalMap: tex(`assets/tex/${name}_nor.webp`, false, rep, aniso),
    roughnessMap: tex(`assets/tex/${name}_arm.webp`, false, rep, aniso),
    aoMap: tex(`assets/tex/${name}_arm.webp`, false, rep, aniso),
  });
  const M = {};
  M[MAT.ROAD] = new THREE.MeshStandardMaterial({ ...set('asphalt', 1 / 5), roughness: 1, metalness: 0, color: 0xb4b4b4, normalScale: new THREE.Vector2(0.8, 0.8), aoMapIntensity: 0.6 });
  patchRoad(M[MAT.ROAD]);
  const kt = kerbTexture();
  M[MAT.KERB] = new THREE.MeshStandardMaterial({ map: kt, normalMap: tex('assets/tex/concrete_nor.webp', false, 1 / 3, aniso), roughness: 0.62, metalness: 0 });
  // Albedo-Faktoren: Poly-Haven-Beton hat ~10 % Albedo → auf realistische ~28 % (Beton) anheben
  const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
  M[MAT.CONCRETE] = new THREE.MeshStandardMaterial({ ...set('concrete', 1 / 3.5), roughness: 1, metalness: 0, color: lin(2.7, 2.65, 2.55), aoMapIntensity: 0.5 });
  M[MAT.WALL] = new THREE.MeshStandardMaterial({ ...set('concrete', 1 / 2.5), roughness: 1, metalness: 0, color: lin(3.4, 3.35, 3.25), aoMapIntensity: 0.5 });
  M[MAT.PAD] = new THREE.MeshStandardMaterial({ ...set('pad', 1 / 4), roughness: 1, metalness: 0, color: lin(1.15, 1.15, 1.12), aoMapIntensity: 0.6 });
  // Schanzen-Belag (n24): sauberes, helles Stahl-Riffelblech (tools/build_deck.mjs: neutral grau, ohne Rost/Grün),
  // Albedo-Faktor neutral (bis n23 lin(4,2, 5,4, 7,2) auf olivgrün-rostiger Vorlage → Grün/Lila-Flecken), gröberes Muster
  // (1/3 statt 1/2,2 Kacheln je m) und schwächere Normalen gegen Moiré
  M[MAT.METAL] = new THREE.MeshStandardMaterial({ ...set('metal', 1 / 3), roughness: 1.35, metalness: 0.08, color: lin(0.58, 0.56, 0.52), normalScale: new THREE.Vector2(0.6, 0.6), aoMapIntensity: 0.5, envMapIntensity: 0.7 });
  M[MAT.STEEL] = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.35, metalness: 0.9 });
  // Import-Beläge: Schotter (heller, rauer, braun) und Eis (bläulich, glatter) – gleiche Markierungen
  M[MAT.DIRT] = new THREE.MeshStandardMaterial({ ...set('pad', 1 / 3), roughness: 1, metalness: 0, color: lin(1.55, 1.12, 0.72), aoMapIntensity: 0.6 });
  patchRoad(M[MAT.DIRT], false);
  M[MAT.ICE] = new THREE.MeshStandardMaterial({ ...set('asphalt', 1 / 5), roughness: 0.22, metalness: 0.05, color: lin(1.9, 2.25, 2.7), normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.3 });
  patchRoad(M[MAT.ICE], false);
  // Szenerie: Vertexfarben (Häuser, Palmen, Schiff …) + Glas
  M[MAT.PAINT] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02, color: 0xffffff });
  M[MAT.GLASS] = new THREE.MeshStandardMaterial({ color: 0x1b2a38, roughness: 0.06, metalness: 0.7, envMapIntensity: 1.6 });
  M[MAT.BANNER] = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  // polygonOffset: Gelände minimal nach hinten – die Fahrbahn liegt nur 6 cm darüber, in der großen Welt
  // (Straßen bis ~1 km entfernt) reicht die Tiefengenauigkeit dort sonst nicht (Flimmern)
  M.grass = new THREE.MeshStandardMaterial({ ...set('grass', 1 / 3.2), roughness: 1, metalness: 0, color: 0xffffff, vertexColors: true, aoMapIntensity: 0.7, normalScale: new THREE.Vector2(0.9, 0.9), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  patchGrass(M.grass);
  // gleicher Polygon-Offset wie das Gelände: sonst schiebt der Offset das Gelände bei flachem Blick hinter die
  // (0,9 m tiefere) Wasserebene der .TRK-Strecken und das Raster erscheint von weitem als See
  M.water = new THREE.MeshStandardMaterial({ color: 0x1d3a3a, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.88, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  patchWater(M.water);
  M.tree = [0, 1].map((v) => {
    const m = new THREE.MeshStandardMaterial({ map: tex(`assets/tex/fir_card_${v}.webp`, true, 1, aniso), alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.95, metalness: 0, color: 0xd8f0c8, emissive: 0x0b1406 });
    m.map.wrapS = m.map.wrapT = THREE.ClampToEdgeWrapping;
    m.map.repeat.set(1, 1);
    patchTreeTheme(m);
    return m;
  });
  for (const k of Object.keys(M)) {
    const m = M[k];
    if (Array.isArray(m)) m.forEach(patchStaticShadow); else patchStaticShadow(m);
  }
  return M;
}
