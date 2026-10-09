// Wetter (n32): Aussehen anwenden – nur Optik (Licht, Nebel, Himmel, Farbkorrektur, nasse/verschneite Flächen über
// Uniforms). Werte rein rechnend in track/wetter.js (wetterLook). Grundlage sind immer die Werte des Themas (gfx/themes.js
// merkt sie sich in ThemeManager.base) → Wetterwechsel ohne Neubau der Welt, „Klar“ stellt das Thema exakt wieder her.
// Shader-Anschlüsse: materials.js (Fahrbahn: Nässe/Pfützen/Matsch; Gelände: nass/Schneedecke; Tannen; Dächer über
// patchSnowCover), env.js (Himmel abdunkeln/entsättigen), deko.js (Regenstreifen, kind 4), fx.js (Gischt, Dampf, Spuren).
import * as THREE from 'three';
import { wetterLook } from '../track/wetter.js';

// gemeinsame Uniforms aller Wetter-Shader (0 = klar → Shader-Zweige werden übersprungen, Bild wie bis n31)
export const wetterUniforms = {
  wWet: { value: 0 },      // Nässe 0 … 1 (dunkler, glatter)
  wPud: { value: 0 },      // Pfützen 0 … 1 (spiegeln den Himmel)
  wSnow: { value: 0 },     // Schneedecke 0 … 1 (Gelände, Bäume, Dächer)
  wSlush: { value: 0 },    // Matsch/Schneewälle am Fahrbahnrand 0 … 1
};

// Farbkorrektur des Kino-Looks bei Regen/Schnee (gfx/kinolook.js GRADES-Format): flacher, entsättigt, kühl
export const WETTER_GRADES = {
  regen: { wb: [0.97, 0.995, 1.04], lift: [0.012, 0.014, 0.02], gamma: [1.0, 1.0, 1.0], gain: [0.97, 0.98, 1.0], shadow: [-0.006, 0.0, 0.016], high: [0.0, 0.0, 0.004], split: 0.6, sat: 0.82, vib: 0.04, contrast: 0.14 },
  schnee: { wb: [0.97, 0.99, 1.05], lift: [0.014, 0.016, 0.022], gamma: [1.0, 1.0, 0.99], gain: [1.0, 1.0, 1.03], shadow: [-0.006, 0.0, 0.02], high: [0.0, 0.002, 0.006], split: 0.6, sat: 0.86, vib: 0.05, contrast: 0.16 },
};

const tmpC = new THREE.Color();
const mixRGB = (c, rgb, k) => (rgb && k > 0 ? c.lerp(tmpC.setRGB(rgb[0], rgb[1], rgb[2]), k) : c);

// Werte des Themas, bevor das Wetter sie verändert (ThemeManager.apply ruft das am Ende auf)
export function merkeBasis(c) {
  const { scene, sky, sun, kino } = c, U = sky.material.uniforms;
  return {
    fogNear: scene.fog.near, fogFar: scene.fog.far, fogCol: scene.fog.color.clone(),
    sunI: sun.intensity, sunCol: sun.color.clone(), envI: scene.environmentIntensity,
    horizon: U.horizon.value.clone(),
    clouds: U.cK ? { k: U.cK.value, soft: U.cSoft.value, sc: U.cSc.value, sp: U.cSp.value, dark: U.cDark.value.clone() } : null,
    kino: kino ? { grade: kino.grade, haze: kino.hazeCol.clone(), sun: kino.sunCol.clone(), aerial: { ...kino.aerial } } : null,
  };
}

// Wetter anwenden. c = Kontext des ThemeManagers, B = merkeBasis(), w = 'klar' | 'regen' | 'schnee', themeId, tier,
// extra = { treeSnow (Thema) }. Liefert das verwendete Aussehen (wetterLook).
export function wendeWetterAn(c, B, w, themeId, tier, extra = {}) {
  const { scene, sky, sun, kino } = c, U = sky.material.uniforms;
  const L = wetterLook(w, themeId, tier);
  // Nebel: dichter (näher) und zur Dunstfarbe
  scene.fog.near = B.fogNear * L.fog; scene.fog.far = B.fogFar * L.fog;
  mixRGB(scene.fog.color.copy(B.fogCol), L.haze, L.hazeK);
  // Licht: flacher (weniger Sonne, Umgebungslicht trägt), Sonne kühler
  sun.intensity = B.sunI * L.sun;
  sun.color.copy(B.sunCol); if (L.sunTint) sun.color.multiply(tmpC.setRGB(...L.sunTint));
  scene.environmentIntensity = B.envI * L.env;
  // Himmel: abdunkeln/entsättigen (Uniform wSky aus env.js makeSky), Horizont zum Dunst, Wolkendecke
  if (U.wSky) U.wSky.value.set(1 - L.skyDark, L.skyDesat);
  mixRGB(U.horizon.value.copy(B.horizon), L.haze, L.hazeK * 0.8);
  if (U.cK && B.clouds) {
    const C0 = B.clouds;
    if (L.clouds) {
      U.cK.value = Math.max(C0.k, L.clouds.k); U.cSoft.value = Math.max(C0.soft, L.clouds.soft);
      U.cSc.value = C0.k > 0 ? C0.sc : 1.1; U.cSp.value = C0.k > 0 ? C0.sp * 1.4 : 1.4;
      // Schattenfarbe der Wolken = Dunst × dark (Regen grau-dunkel, Schnee hell-grau)
      U.cDark.value.copy(C0.k > 0 ? C0.dark : U.horizon.value); if (L.haze) U.cDark.value.lerp(tmpC.setRGB(...L.haze), 0.6);
      U.cDark.value.multiplyScalar(L.clouds.dark);
    } else { U.cK.value = C0.k; U.cSoft.value = C0.soft; U.cSc.value = C0.sc; U.cSp.value = C0.sp; U.cDark.value.copy(C0.dark); }
  }
  // Kino-Look: Farbkorrektur, Dunst (Luftperspektive dichter), Sonnenfarbe
  if (kino && B.kino) {
    kino.grade = WETTER_GRADES[L.id] ? 'wetter_' + L.id : B.kino.grade;
    mixRGB(kino.hazeCol.copy(B.kino.haze), L.haze, L.hazeK);
    kino.sunCol.copy(B.kino.sun); if (L.sunTint) kino.sunCol.multiply(tmpC.setRGB(...L.sunTint));
    kino.aerial.density = B.kino.aerial.density * (1 + (1 / Math.max(0.2, L.fog) - 1) * 0.6);   // n32 Heavy: am Bild abgestimmt (voll ×2 war zu milchig)
    kino.aerial.max = L.fog < 1 ? Math.min(0.75, B.kino.aerial.max * 1.6) : B.kino.aerial.max;
  }
  // Flächen
  wetterUniforms.wWet.value = L.wet; wetterUniforms.wPud.value = L.puddles;
  wetterUniforms.wSnow.value = L.snow; wetterUniforms.wSlush.value = L.slush;
  if (c.themeUniforms) c.themeUniforms.tTreeSnow.value = Math.max(extra.treeSnow || 0, L.snow);
  return L;
}

// Farbkorrekturen beim Kino-Look anmelden (GRADES ist ein offenes Objekt; Name „wetter_regen“ / „wetter_schnee“)
export function meldeWetterGrades(GRADES) {
  for (const [k, g] of Object.entries(WETTER_GRADES)) GRADES['wetter_' + k] = g;
}

// ---------- Shader-Stücke ----------
// Fahrbahn (patchRoad, nach dem Markierungs-Block; vRoad.x quer, vRoad.z entlang, hw halbe Breite): Nässe dunkelt den
// Asphalt und macht ihn glatt (Spiegelung über die Umgebungskarte = Himmel), Pfützen per Rauschen in Spurrinnen und
// Senken, Matsch/Schneewälle am Rand bei Schnee. Setzt rRough (Rauheit) und sbPud (für die Normale).
export const ROAD_WET_GLSL = `
      if ( wWet + wSlush > 0.0 ) {
        float wx = vRoad.x, ws = vRoad.z, whw = vRoad.y - floor( vRoad.y / 100.0 + 0.001 ) * 100.0, wax = abs( wx );
        float wn = rNoise( vec2( wx * 0.33, ws * 0.11 ) ) * 0.62 + rNoise( vec2( wx * 1.4, ws * 0.47 ) ) * 0.38;
        float wrut = exp( - pow( abs( wax - whw * 0.34 ), 2.0 ) / 0.18 );                    // Spurrinnen stehen zuerst unter Wasser
        // Pfützen: kleine, unregelmäßige Lachen (feineres Rauschen), fast nur in den Spurrinnen und am tiefen Rand
        float wp = rNoise( vec2( wx * 0.9, ws * 0.3 ) ) * 0.55 + rNoise( vec2( wx * 2.7, ws * 0.9 ) ) * 0.3 + wn * 0.15;
        float wfw = max( fwidth( wp ), 0.004 );
        float wthr = 0.8 - wrut * 0.2;
        sbPud = smoothstep( wthr - wfw, wthr + 0.03 + wfw, wp ) * wPud * ( 1.0 - smoothstep( whw - 1.2, whw - 0.4, wax ) );
        float wk = wWet * ( 0.8 + 0.2 * wn );
        diffuseColor.rgb *= 1.0 - 0.45 * wk - 0.3 * sbPud;
        // nasser Asphalt glänzt (in den Spurrinnen mehr), Pfützen fast spiegelnd mit leichter Unruhe
        rRough -= wk * ( 0.4 + 0.18 * wrut ) + sbPud * 0.35;
        if ( wSlush > 0.0 ) {
          // Matsch am Rand (grau-weiß, rau), Schneewall dahinter heller; innen bleibt die Fahrbahn dunkel und befahrbar
          float edgeS = smoothstep( whw - 1.6 - wn * 0.9, whw - 0.2, wax ) * wSlush;
          vec3 slush = mix( vec3( 0.42, 0.43, 0.46 ), vec3( 0.8, 0.82, 0.86 ), smoothstep( whw - 0.9, whw + 0.1, wax ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, slush * ( 0.85 + 0.25 * wn ), edgeS );
          rRough += edgeS * 0.5;
        }
      }`;
// Pfützen: Normale glätten (Asphaltkorn verschwindet unter dem Wasserfilm) → ruhige Spiegelung
export const ROAD_PUDDLE_NORMAL_GLSL = `
      if ( sbPud > 0.0 ) normal = normalize( mix( normal, nonPerturbedNormal, sbPud ) );`;

// Gelände (patchGrass, am Ende des Farb-Blocks; vGw Welt-xz, vGn Weltnormale, vGy Höhe): nass = dunkler, etwas glatter;
// Schneedecke auf flachen Stellen zuerst (Hänge ab ~40° bleiben Fels/Erde), Verwehungen per Rauschen.
export const GRASS_WEATHER_GLSL = `
        if ( wWet > 0.0 ) diffuseColor.rgb *= 1.0 - 0.18 * wWet;
        if ( wSnow > 0.0 ) {
          float sny = normalize( vGn ).y;
          float snn = gNoise( vGw * 0.06 ) * 0.6 + gNoise( vGw * 0.5 ) * 0.4;
          float cover = smoothstep( 0.62, 0.86, sny + ( snn - 0.5 ) * 0.25 ) * wSnow;
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.8, 0.83, 0.88 ) * ( 0.88 + 0.18 * snn ), cover );
        }`;
// Rauheit des Geländes (nach roughnessmap_fragment): nass glatter, Schnee rau
export const GRASS_ROUGH_GLSL = `
        if ( wWet + wSnow > 0.0 ) roughnessFactor = clamp( roughnessFactor - 0.12 * wWet + 0.1 * wSnow, 0.45, 1.0 );   // n32 Heavy: nasser Sand/Wiese glänzte zu hell`;

// Schnee auf nach oben zeigenden Flächen (Dächer, Tribünendächer, Bauten, Felsen, Zäune): an emissivemap_fragment
// (Normale steht fest, Licht noch nicht gerechnet). Weltnormale aus der Blickraum-Normale.
export function patchSnowCover(mat, k = 1) {
  if (!mat || !(mat.isMeshStandardMaterial || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial) || mat.userData.wsnow) return mat;
  mat.userData.wsnow = true;
  const rough = mat.isMeshStandardMaterial ? 'roughnessFactor = mix( roughnessFactor, 0.85, wsC );' : '';
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.wSnow = wetterUniforms.wSnow;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float wSnow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if ( wSnow > 0.0 ) {
        vec3 wsN = inverseTransformDirection( normal, viewMatrix );
        float wsC = smoothstep( 0.55, 0.85, wsN.y ) * wSnow * ${k.toFixed(2)};
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.82, 0.85, 0.9 ), wsC );
        ${rough}
      }`);
  };
  const pk = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => pk() + '|wsnow';
  return mat;
}
