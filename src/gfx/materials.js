// PBR-Materialien der Strecke (Poly-Haven-Texturen, CC0) + Shader-Erweiterungen:
//  - statischer Schatten (einmal gerenderte Sonnen-Tiefenkarte, "vorberechnetes Licht")
//  - Fahrbahnmarkierungen (Randlinien, Mittelstreifen, Start/Ziel-Karo, Checkpoint-Linie)
//  - Randsteine rot/weiß, Gras mit Kachel-Brechung
import * as THREE from 'three';
import { MAT } from '../track/defs.js';

const loader = new THREE.TextureLoader();
const cache = new Map();
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
};

function tex(url, srgb, repeat, aniso) {
  const key = url + '|' + repeat;
  if (cache.has(key)) return cache.get(key);
  const t = loader.load(url);
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
      float sbStatic() {
        if ( sbShadowOn < 0.5 ) return 1.0;
        vec4 sc = sbShadowMat * vec4( vSbWorld, 1.0 );
        vec3 c = sc.xyz / sc.w;
        if ( c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0 || c.z >= 1.0 ) return 1.0;
        float z = c.z - 0.0009;
        float d = sbTexel * 1.25;
        float s = texture( sbShadowMap, vec3( c.xy + vec2( -d, -d ), z ) )
                + texture( sbShadowMap, vec3( c.xy + vec2(  d, -d ), z ) )
                + texture( sbShadowMap, vec3( c.xy + vec2( -d,  d ), z ) )
                + texture( sbShadowMap, vec3( c.xy + vec2(  d,  d ), z ) );
        return s * 0.25;
      }`)
      // Chunk selbst einsetzen: #include wird erst NACH onBeforeCompile aufgelöst
      .replace('#include <lights_fragment_begin>', 'float sbShadowF = sbStatic();\n' + THREE.ShaderChunk.lights_fragment_begin
        .replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= ( UNROLLED_LOOP_INDEX == 0 ) ? sbShadowF : 1.0;'));
  };
  fn.tag = 'sb';
  addPatch(mat, fn);
  return mat;
}

function patchRoad(mat) {
  const fn = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRoad;\nvarying vec4 vRoad;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = aRoad;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vRoad;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        float x = vRoad.x, typ = floor( vRoad.y / 100.0 + 0.001 ), hw = vRoad.y - typ * 100.0;
        float s = vRoad.z, md = vRoad.w;
        float narrow = step( 9.5, typ ); float t = typ - narrow * 10.0;
        float ax = abs( x );
        float fw = max( fwidth( ax ), 0.002 );
        float edge = smoothstep( hw - 0.52 - fw, hw - 0.52 + fw, ax ) * ( 1.0 - smoothstep( hw - 0.36 - fw, hw - 0.36 + fw, ax ) );
        float dash = ( 1.0 - narrow ) * ( 1.0 - smoothstep( 0.07 - fw, 0.07 + fw, ax ) ) * step( mod( s, 9.0 ), 4.0 );
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
  fn.tag = 'road';
  addPatch(mat, fn);
}

function patchGrass(mat) {
  // zweite Abtastung in anderem Maßstab + Farbvariation gegen sichtbare Kacheln
  const fn = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGw;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGw = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
      varying vec2 vGw;
      float gHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      float gNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( gHash( i ), gHash( i + vec2( 1, 0 ) ), f.x ), mix( gHash( i + vec2( 0, 1 ) ), gHash( i + vec2( 1, 1 ) ), f.x ), f.y ); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 c2 = texture2D( map, vGw * 0.071 + vec2( 0.37, 0.11 ) ).rgb;
        float n = gNoise( vGw * 0.018 ) * 0.6 + gNoise( vGw * 0.07 ) * 0.4;
        vec3 base = mix( diffuseColor.rgb, c2, 0.45 );
        float lum = dot( base, vec3( 0.3, 0.55, 0.15 ) );
        vec3 dark = vec3( 0.035, 0.085, 0.02 ), light = vec3( 0.2, 0.34, 0.08 );
        vec3 green = mix( dark, light, clamp( lum * 2.4, 0.0, 1.0 ) );
        vec3 dry = vec3( 0.26, 0.27, 0.12 ) * clamp( lum * 2.0, 0.3, 1.2 );
        green = mix( green, dry, smoothstep( 0.55, 0.95, n ) * 0.55 );
        diffuseColor.rgb = mix( green, base * vec3( 0.7, 0.85, 0.5 ), 0.25 ) * mix( 0.85, 1.12, n );
      }`);
  };
  fn.tag = 'grass';
  addPatch(mat, fn);
}

function kerbTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#c21d14'; g.fillRect(0, 0, 16, 32);
  g.fillStyle = '#f2f2ee'; g.fillRect(0, 32, 16, 32);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(1, 0.5);
  t.magFilter = THREE.LinearFilter;
  return t;
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
  M[MAT.METAL] = new THREE.MeshStandardMaterial({ ...set('metal', 1 / 2.2), roughness: 0.8, metalness: 0.35, color: lin(4.2, 5.4, 7.2), envMapIntensity: 1.2 });
  M[MAT.STEEL] = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.35, metalness: 0.9 });
  M[MAT.BANNER] = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  M.grass = new THREE.MeshStandardMaterial({ ...set('grass', 1 / 3.2), roughness: 1, metalness: 0, color: 0xffffff, aoMapIntensity: 0.7, normalScale: new THREE.Vector2(0.9, 0.9) });
  patchGrass(M.grass);
  M.water = new THREE.MeshStandardMaterial({ color: 0x1d3a3a, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.88 });
  M.tree = [0, 1].map((v) => {
    const m = new THREE.MeshStandardMaterial({ map: tex(`assets/tex/fir_card_${v}.webp`, true, 1, aniso), alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.95, metalness: 0, color: 0xd8f0c8, emissive: 0x0b1406 });
    m.map.wrapS = m.map.wrapT = THREE.ClampToEdgeWrapping;
    m.map.repeat.set(1, 1);
    return m;
  });
  for (const k of Object.keys(M)) {
    const m = M[k];
    if (Array.isArray(m)) m.forEach(patchStaticShadow); else patchStaticShadow(m);
  }
  return M;
}
