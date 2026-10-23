// Tier-Zuschauer (n40) zeichnen: Figur (gfx/tierform.js) als BufferGeometry für das instanzierte Zuschauer-Mesh in
// gfx/kulisse2.js (gleiche Instanz-Daten iA/iB, gleiche Vorauswahl, 1 Draw-Call + Blob-Schatten), Material mit derselben
// Haltungs-/Jubel-Rechnung wie die Menschen (fanPoseGlsl mit Tier-Gelenken) und eigener Farbgebung je Art, dazu der
// Atlas für die Karten (ferne Gruppen, Tribünen-Streifen) im selben Raster wie der Menschen-Atlas (gfx/deco.js).
// Art je Figur: iA.y = Art · 16 + Farbe (tierform.js tierCol); Teile anderer Arten fallen im Shader in den Rumpf zusammen.
// TODO n40-Heavy: Proportionen/Farben/Glanz am Bild abstimmen, Vision-Gate „niedlich und als Tiere erkennbar?“
import * as THREE from 'three';
import { decoUniforms, canvasTex, once } from './deco.js';
import { fanPoseGlsl } from './kulisse2.js';
import { patchStaticShadow } from './materials.js';
import { tierForm, tierAtlasPlan, TIERE, TIER_FARBEN, TIER_J, POLE_X, KL } from './tierform.js';

export function tierGeometry() {
  const F = tierForm(), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(F.P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(F.N, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(F.A, 1));
  g.setAttribute('aCls', new THREE.Float32BufferAttribute(F.C, 1));
  g.setAttribute('aMask', new THREE.Float32BufferAttribute(F.M, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(F.P.length).fill(1), 3));
  g.setIndex(F.I);
  return g;
}

// Farbtabellen je Art als GLSL (aus TIER_FARBEN, eine Quelle für Figur und Atlas)
const f3 = (c) => `vec3( ${c.map((x) => x.toFixed(3)).join(', ')} )`;
const tab = (k) => `vec3[${TIERE.length}]( ${TIERE.map((a) => f3(TIER_FARBEN[a][k])).join(', ')} )`;
const P = POLE_X.toFixed(2);

// Farbe je Ecke: Klasse (tierform.js KL) × Art; Fellvariante je Figur (fell2, ~35 %), Fahne wie bei den Menschen
const TIER_COLOR_GLSL = `
        {
          float tA = floor( iA.y / 16.0 + 0.01 ), c16 = mod( iA.y, 16.0 );
          int k = int( tA );
          vec3 FE[${TIERE.length}] = ${tab('fell')};
          vec3 FE2[${TIERE.length}] = ${tab('fell2')};
          vec3 HE[${TIERE.length}] = ${tab('hell')};
          vec3 NA[${TIERE.length}] = ${tab('nase')};
          vec3 RO[${TIERE.length}] = ${tab('rosa')};
          vec3 EX[${TIERE.length}] = ${tab('extra')};
          vec3 fell = fract( iA.z * 5.7 + c16 * 0.37 ) < 0.35 ? FE2[ k ] : FE[ k ];
          vec3 flag = fract( iA.z * 9.1 ) < 0.5 ? vec3( 0.95, 0.8, 0.05 ) : vec3( 0.8, 0.05, 0.05 );
          vec3 cc = aCls < 0.5 ? fell : aCls < 1.5 ? HE[ k ] : aCls < 2.5 ? vec3( 0.97 ) : aCls < 3.5 ? vec3( 0.04, 0.035, 0.04 ) : aCls < 4.5 ? flag
            : aCls < 5.5 ? vec3( 0.55 ) : aCls < 6.5 ? NA[ k ] : aCls < 7.5 ? vec3( 1.0 ) : aCls < 8.5 ? RO[ k ] : aCls < 9.5 ? EX[ k ] : HE[ k ];
          vColor.rgb = pow( cc, vec3( 2.2 ) ) * ( aCls > 1.5 && aCls < 3.5 || aCls > 6.5 && aCls < 7.5 ? 1.0 : 0.8 + 0.2 * smoothstep( 0.0, 1.1, position.y ) );   // linear; Augen ohne Abdunkeln
        }`;

export function tierMaterial() {
  return once('tier3d', () => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
    m.userData.uFanFade = { value: new THREE.Vector2(58, 74) };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = decoUniforms.uTime; sh.uniforms.uCheer = decoUniforms.uCheer; sh.uniforms.uFanFade = m.userData.uFanFade;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + fanPoseGlsl(TIER_J) + '\n  attribute float aMask;\n  varying float vGlanz;')
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        fanJoint( fJo, fJm, fJl, fJk ); objectNormal = fJm * objectNormal;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 fo = fJo; mat3 fm = fJm; float fl = fJl, fk = fJk;
          vec3 p = transformed;
          float tArt = floor( iA.y / 16.0 + 0.01 );
          if ( mod( floor( aMask / exp2( tArt ) + 0.01 ), 2.0 ) < 0.5 ) p = vec3( 0.0, 0.5, 0.0 );                // Teil einer anderen Art
          if ( aPart > 5.5 ) p.z += sin( uTime * 8.0 + p.x * 7.0 + iA.z * 20.0 ) * 0.07 * ( p.x - ${P} );   // Tuch weht
          if ( aPart > 4.5 && iA.w < 0.5 ) p = vec3( ${TIER_J.armR} );                                        // keine Fahne
          p = fo + fm * ( p - fo );
          p.y += fl;
          vec4 ip = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
          float f = 1.0 - smoothstep( uFanFade.x, uFanFade.y, distance( ip.xyz, cameraPosition ) );
          transformed = p * f;
          // Kamerablitz (Handy hoch beim Jubel an Stunts): kurz, zufällig, nur die rechte Pfote
          float fr = fract( sin( floor( uTime * 9.0 + iA.z * 50.0 ) * 12.9898 + iA.y ) * 43758.5453 );
          vFlash = iB.x * fk * step( 0.9, fr ) * step( 3.5, aPart ) * step( aPart, 4.5 ) * step( ${(KL.pfote - 0.5).toFixed(1)}, aCls );
          vGlanz = step( ${(KL.glanz - 0.5).toFixed(1)}, aCls ) * step( aCls, ${(KL.glanz + 0.5).toFixed(1)} );
        }`)
        .replace('#include <color_vertex>', '#include <color_vertex>' + TIER_COLOR_GLSL);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFlash;\nvarying float vGlanz;')
        // Glanzpunkt in den Augen leuchtet leicht (bleibt auch im Schatten sichtbar)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3( 9.0, 9.0, 8.5 ) * vFlash + vec3( 0.8 ) * vGlanz;');
    };
    m.customProgramCacheKey = () => 'tier3d';
    return patchStaticShadow(m);
  });
}

// ---------- Atlas-Karten ----------
const hex = (c) => '#' + c.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('');
// Ein Tier (Canvas 2D) an x, Oberkante top, Maßstab s; seated = nur Oberkörper (Tribüne), up = jubelnd (Ärmchen hoch)
export function drawTier(g, p, y0, seated, up) {
  const s = p.s, art = TIERE[p.art], F = TIER_FARBEN[art], x = p.x;
  const fell = hex(p.v2 ? F.fell2 : F.fell), hell = hex(F.hell), top = y0 + p.top - (up ? 6 : 0);
  const hy = top + 14 * s, hr = 9.5 * s;   // Kopf groß
  const circle = (cx, cy, rx, ry, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  // Ärmchen hoch (hinter dem Körper)
  if (up) { g.strokeStyle = fell; g.lineWidth = 4 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - 6 * s, top + 30 * s); g.lineTo(x - 13 * s, top + 8 * s); g.moveTo(x + 6 * s, top + 30 * s); g.lineTo(x + 13 * s, top + 8 * s); g.stroke(); circle(x - 13.5 * s, top + 7 * s, 2.6 * s, 2.6 * s, hell); circle(x + 13.5 * s, top + 7 * s, 2.6 * s, 2.6 * s, hell); }
  // Körper rundlich mit hellem Bauch, Beinchen (stehend)
  if (!seated) { circle(x - 4 * s, top + 52 * s, 3.6 * s, 4 * s, art === 'pinguin' ? hex(F.extra) : fell); circle(x + 4 * s, top + 52 * s, 3.6 * s, 4 * s, art === 'pinguin' ? hex(F.extra) : fell); }
  circle(x, top + 37 * s, 9.5 * s, 14 * s, fell);
  circle(x, top + 40 * s, 6.5 * s, 9.5 * s, hell);
  // Ohren hinter dem Kopf
  if (art === 'baer') { circle(x - 7.5 * s, hy - 7.5 * s, 3.6 * s, 3.6 * s, fell); circle(x + 7.5 * s, hy - 7.5 * s, 3.6 * s, 3.6 * s, fell); }
  if (art === 'hase') { circle(x - 4 * s, hy - 15 * s, 2.6 * s, 8.5 * s, fell); circle(x + 4 * s, hy - 15 * s, 2.6 * s, 8.5 * s, fell); circle(x - 4 * s, hy - 15 * s, 1.3 * s, 6 * s, hex(F.rosa)); circle(x + 4 * s, hy - 15 * s, 1.3 * s, 6 * s, hex(F.rosa)); }
  if (art === 'fuchs' || art === 'katze') {
    const h = art === 'fuchs' ? 11 : 8;
    g.fillStyle = fell;
    for (const sg of [-1, 1]) { g.beginPath(); g.moveTo(x + sg * 3 * s, hy - 7 * s); g.lineTo(x + sg * 9.5 * s, hy - 3 * s); g.lineTo(x + sg * 8 * s, hy - h * s - 3 * s); g.closePath(); g.fill(); }
  }
  if (art === 'kuh') { circle(x - 11 * s, hy + 1 * s, 4 * s, 2 * s, fell); circle(x + 11 * s, hy + 1 * s, 4 * s, 2 * s, fell); g.fillStyle = hex(F.extra); g.fillRect(x - 6 * s, hy - 12 * s, 2 * s, 4 * s); g.fillRect(x + 4 * s, hy - 12 * s, 2 * s, 4 * s); }
  circle(x, hy, hr, hr * 0.92, fell);
  if (art === 'pinguin') circle(x, hy + 2 * s, hr * 0.7, hr * 0.6, hell);
  else circle(x, hy + 4 * s, (art === 'kuh' ? 5.5 : 4) * s, 3 * s, art === 'kuh' ? hex(F.hell) : hex(F.hell));
  // Augen groß, mit Glanz; Nase/Schnabel; Bäckchen
  for (const sg of [-1, 1]) { circle(x + sg * 3.4 * s, hy - 1 * s, 2.6 * s, 3 * s, '#f6f6f6'); circle(x + sg * 3.2 * s, hy - 0.6 * s, 1.7 * s, 2.1 * s, '#0a090a'); circle(x + sg * 2.7 * s, hy - 1.7 * s, 0.6 * s, 0.6 * s, '#ffffff'); circle(x + sg * 6.5 * s, hy + 3 * s, 1.6 * s, 1.1 * s, hex(F.rosa)); }
  circle(x, hy + 3 * s, (art === 'pinguin' ? 2.2 : 1.3) * s, (art === 'pinguin' ? 1.3 : 1) * s, hex(F.nase));
  if (p.flag) { g.fillStyle = p.flag; g.fillRect(x + 7 * s + (up ? 6 * s : 0), top - 6 * s - (up ? 12 * s : 0), 13 * s, 9 * s); }
}
export function tierAtlas() {
  return canvasTex(1024, 1024, (g) => {
    const rows = tierAtlasPlan();
    rows.forEach((r, row) => { for (const p of r.ps) drawTier(g, p, row * 128, r.seated, false); });
    rows.forEach((r, row) => { for (const p of r.ps) drawTier(g, p, 512 + row * 128, r.seated, true); });
  });
}
