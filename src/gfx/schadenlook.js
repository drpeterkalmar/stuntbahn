// Schadens-Optik im Shader (n34-Heavy, Nachtrag Schadensmodell): Kratzer, abgeplatzter Lack (Grundierung/blankes Blech), Ruß
// rund um jede Delle und gesprungene Scheibe – prozedural, ohne Texturen. Asset-Recherche (Bericht): kein freies Schadens-Set
// für einen Supersportwagen; die CC0-Texturen (Poly Haven „Blue Metal Plate“ u. a.) zeigen Blechplatten mit Nähten statt
// einzelner Kratzer – als Decal unbrauchbar. Deshalb Rauschen im Shader: keine Downloads, keine Lizenzfragen, folgt den Dellen.
// Je Auto (gfx/carmesh.js makeCar) ein Satz Uniforms (car.sbU) für Karosserie-, Lack- und Glas-Material; gefüllt aus dem
// Schadens-Zustand (physics/schaden.js S.dellen, S.gesamt) in gfx/schadenvis.js schadenZeigen. Der Zusatz steckt immer im
// Programm (einmal beim Laden übersetzt – kein Neu-Übersetzen mitten im Rennen); ohne Schaden (sbN = 0) überspringt ein
// einheitlicher Zweig alles. Koordinaten: Auto (x rechts, y oben, z hinten) = Objektraum der Karosserie-Meshes.
import * as THREE from 'three';
import { OPTIK } from '../physics/schaden.js';

const QL = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
export const LOOK_MAX = 12;   // = DELLE.dellenMax
// Abstimmung (am Bild, tests/schaden_shots.py): rad = Wirkradius × Dellen-Radius, chip/kratz/russ = Stärke-Schwellen
export const LOOK = { rad: 1.0, chipTief: 0.05, russTief: 0.09, glasAb: OPTIK.scheibe - 0.15, glasVoll: 0.85 };

// Nur mit Schaden-Option (Aus = Shader wie vor n34): der Zusatz kostete auf „Kino“ auch ohne Schaden +19 % GPU-Zeit (Mess-Gate
// 18.10.). LOOK_AN.an wird beim Rennstart gesetzt (main.js lookSchalten) – nie mitten im Rennen; Wechsel = einmal neu übersetzen.
export const LOOK_AN = { an: false, mats: new Set() };
export function lookSchalten(an) {
  if (LOOK_AN.an === !!an) return false;
  LOOK_AN.an = !!an;
  for (const m of LOOK_AN.mats) m.needsUpdate = true;
  return true;
}

export function lookUniforms() {
  return {
    sbHA: { value: Array.from({ length: LOOK_MAX }, () => new THREE.Vector4()) },   // Ort xyz, Radius
    sbHB: { value: Array.from({ length: LOOK_MAX }, () => new THREE.Vector4()) },   // Richtung xyz, Tiefe
    sbN: { value: 0 }, sbGes: { value: 0 }, sbGlas: { value: 0 },
  };
}

// Zustand → Uniforms (U aus lookUniforms; S = physics/schaden.js-Zustand oder null = heil)
export function lookSetzen(U, S) {
  if (!U) return;
  const n = S ? Math.min(LOOK_MAX, S.dellen.length) : 0;
  for (let i = 0; i < n; i++) {
    const d = S.dellen[i];
    U.sbHA.value[i].set(d.p[0], d.p[1], d.p[2], d.r);
    U.sbHB.value[i].set(d.d[0], d.d[1], d.d[2], d.t);
  }
  U.sbN.value = n;
  U.sbGes.value = S ? S.gesamt : 0;
  const g = S ? (S.gesamt - LOOK.glasAb) / (LOOK.glasVoll - LOOK.glasAb) : 0;
  U.sbGlas.value = Math.max(0, Math.min(1, g));
}

const GLSL_KOPF = `
uniform vec4 sbHA[${LOOK_MAX}];
uniform vec4 sbHB[${LOOK_MAX}];
uniform float sbN, sbGes, sbGlas;
varying vec3 vSbP;
float sbHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float sbNoise( vec3 x ) {
  vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( sbHash( i ), sbHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( sbHash( i + vec3( 0, 1, 0 ) ), sbHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( sbHash( i + vec3( 0, 0, 1 ) ), sbHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( sbHash( i + vec3( 0, 1, 1 ) ), sbHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
// Schaden an dieser Stelle: x = Fläche (0 … 1), y = Stärke (aus der Dellen-Tiefe), z = Ruß. Schlank (Mess-Gate Kino: der erste
// Entwurf mit Rauschen je Treffer kostete auch ungenutzt +13 % GPU): Abstand im Quadrat zuerst, Rauschen erst außerhalb der Schleife
vec3 sbWirkung( vec3 p ) {
  vec3 w = vec3( 0.0 );
  for ( int i = 0; i < ${LOOK_MAX}; i++ ) {
    if ( float( i ) >= sbN ) break;
    vec3 r = p - sbHA[ i ].xyz;
    float R = sbHA[ i ].w * ${LOOK.rad.toFixed(3)}, d2 = dot( r, r );
    if ( d2 >= R * R ) continue;
    float k = 1.0 - smoothstep( R * 0.2, R, sqrt( d2 ) );
    float t = sbHB[ i ].w;
    w = max( w, vec3( k, k * ( 0.25 + 0.75 * clamp( t / ${LOOK.chipTief.toFixed(3)}, 0.0, 1.0 ) ), k * clamp( ( t - 0.03 ) / ${LOOK.russTief.toFixed(3)}, 0.0, 1.0 ) ) );
  }
  return w;
}`;

// Lack und Karosserie: Farbe/Rauheit/Metall vor der Beleuchtung anpassen, Klarlack an den Schadstellen weg
function lackPatch(U, paintGewicht) {
  const fn = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSbP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSbP = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_KOPF + '\nfloat sbClear = 0.0;')
      .replace('#include <lights_physical_fragment>', `
      vec3 w = vec3( 0.0 );
      if ( sbN > 0.5 ) w = sbWirkung( vSbP );
      if ( w.x > 0.002 || sbGes > 0.68 ) {
        vec3 p = vSbP;
        w *= 0.75 + 0.5 * sbNoise( p * 9.0 );   // ausgefranster Rand
        float lack = ${paintGewicht};
        // Kratzer: feine Linien längs des Autos (Schleifspuren), dichter in der Mitte der Stelle
        float r = 1.0 - abs( 2.0 * sbNoise( vec3( p.x * 55.0, p.y * 55.0, p.z * 2.5 ) ) - 1.0 );
        float kratz = smoothstep( 0.9, 0.985, r ) * smoothstep( 0.05, 0.6, w.x );
        // Lack abgeplatzt: Flecken bis aufs Blech (stärkere Treffer: größer); Rand der Flecken hell (Grundierung)
        float c = sbNoise( p * 15.0 ) * 0.65 + sbNoise( p * 41.0 ) * 0.35;
        float chipW = c + 0.2 * w.y;                 // Stelle (Rauschen) + Stärke: nur im Kern harter Treffer viel
        float chip = smoothstep( 0.78, 0.81, chipW ) * smoothstep( 0.2, 0.6, w.y );
        float grund = smoothstep( 0.74, 0.77, chipW ) * ( 1.0 - chip ) * smoothstep( 0.2, 0.6, w.y );
        // Ruß: harte Treffer und ab ~70 % Gesamtschaden über dem Heckmotor
        float russ = w.z * ( 0.55 + 0.45 * sbNoise( p * 6.0 ) );
        russ = max( russ, smoothstep( 0.68, 1.0, sbGes ) * smoothstep( 0.6, 1.2, p.z ) * smoothstep( 0.05, 0.3, p.y ) * ( 0.4 + 0.6 * sbNoise( p * 4.0 ) ) );
        kratz *= lack; chip *= lack; grund *= lack;
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.78, 0.78, 0.76 ), kratz * 0.75 );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.62, 0.6, 0.55 ), grund );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.5, 0.51, 0.53 ), chip );
        diffuseColor.rgb *= 1.0 - 0.82 * clamp( russ, 0.0, 1.0 );
        metalnessFactor = mix( metalnessFactor, 0.95, chip );
        metalnessFactor = mix( metalnessFactor, 0.0, max( grund, russ ) );
        roughnessFactor = mix( roughnessFactor, 0.55, max( kratz, chip ) );
        roughnessFactor = mix( roughnessFactor, 0.9, max( grund, russ ) );
        sbClear = clamp( max( max( chip, grund ), max( kratz * 0.6, russ ) ) + 0.35 * w.y * lack, 0.0, 1.0 );
      }
      #include <lights_physical_fragment>
      #ifdef USE_CLEARCOAT
        material.clearcoat *= 1.0 - sbClear;
      #endif`);
  };
  fn.tag = 'schaden';
  return fn;
}

// Glas: Sprünge (Zellkanten eines groben Voronoi-Rauschens + Strahlen um die Trefferstelle), milchig, rauer
function glasPatch(U) {
  const fn = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSbP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSbP = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_KOPF + `
      float sbClear = 0.0;
      vec3 sbZelle( vec3 c ) { return vec3( sbHash( c ), sbHash( c + 17.1 ), sbHash( c + 31.7 ) ); }
      float sbKante( vec3 x ) {
        vec3 i = floor( x ), f = fract( x ); float d1 = 8.0, d2 = 8.0;
        for ( int a = -1; a <= 1; a++ ) for ( int b = -1; b <= 1; b++ ) for ( int c = -1; c <= 1; c++ ) {
          vec3 g = vec3( float( a ), float( b ), float( c ) ), o = sbZelle( i + g );
          float d = length( g + o - f );
          if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) d2 = d;
        }
        return d2 - d1;
      }`)
      .replace('#include <lights_physical_fragment>', `
      if ( sbGlas > 0.0 ) {
        vec3 p = vSbP;
        vec3 w = sbWirkung( p );
        float amt = sbGlas * ( 0.35 + 0.65 * clamp( w.x * 1.6, 0.0, 1.0 ) );
        float kante = 1.0 - smoothstep( 0.02, 0.06 + 0.04 * w.x, sbKante( p * ( 7.0 + 6.0 * w.x ) ) );   // nah am Treffer feiner
        float spr = clamp( kante, 0.0, 1.0 ) * amt;
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.82, 0.86, 0.88 ), spr * 0.8 );
        diffuseColor.a = mix( diffuseColor.a, 1.0, spr * 0.6 + amt * 0.12 );
        roughnessFactor = mix( roughnessFactor, 0.6, max( spr, amt * 0.35 ) );
        sbClear = spr;
      }
      #include <lights_physical_fragment>
      #ifdef USE_CLEARCOAT
        material.clearcoat *= 1.0 - sbClear;
      #endif`);
  };
  fn.tag = 'schadenglas';
  return fn;
}

function anhaengen(mat, fn) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); if (LOOK_AN.an) fn(sh, r); };
  const pk = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => pk() + (LOOK_AN.an ? '|' + fn.tag : '');
  mat.needsUpdate = true;
  LOOK_AN.mats.add(mat);
}

// Materialien eines Autos vorbereiten: { body (car_body, Lack per Maske gPaint), paint (Klarlack-Teile), glass } → Uniforms
export function schadenLook(mats) {
  const U = lookUniforms();
  // Mess-Regler ?looklack=0 / ?lookglas=0: nur einen Teil der Schadens-Optik übersetzen (A/B)
  if (QL.get('looklack') !== '0') {
    if (mats.body) anhaengen(mats.body, lackPatch(U, 'gPaint + 0.35 * ( 1.0 - gPaint - gChrome )'));
    if (mats.paint) anhaengen(mats.paint, lackPatch(U, '1.0'));
  }
  if (mats.glass && QL.get('lookglas') !== '0') anhaengen(mats.glass, glasPatch(U));
  return U;
}
