// Tageszeit (n32 Nachtrag, Peter 09.10.2026): Abend und Nacht – nur Optik. Werte rein rechnend in track/zeit.js.
//  - wendeZeitAn: Licht-Richtung (Abendsonne tief / Mond), Licht, Umgebungslicht, Nebel, Himmel (Sterne, Mond, Abendrot),
//    Farbkorrektur. Liefert eine geänderte Themen-Basis, auf die das Wetter (gfx/wetter.js) weiterrechnet.
//  - Licht-Karte: Flutlicht-Pfützen, Tribünen, Start/Ziel, Zelte, Hütten als EINE gebackene Textur über der Strecke (keine
//    Dutzende echte Lichter); jedes Material mit patchStaticShadow (materials.js) addiert sie (NACHT_GLSL).
//  - Leuchtpunkte (EIN Draw-Call): Flutlicht-Köpfe, Lichterketten an Looping/Röhre/Korkenzieher/Schanzen-Lippen,
//    Leitpfosten-Reflektoren (leuchten im Scheinwerferlicht), Lagerfeuer, Hüttenfenster, Tribünen-Lampen.
//  - Scheinwerfer am Auto: ein echtes SpotLight (main.js), zwei Leuchtpunkte vorn.
// „Tag“ setzt alle Uniforms auf 0 → Bild wie bis n31/Wetter.
import * as THREE from 'three';
import { zeitSonne } from '../track/zeit.js';

export const zeitUniforms = {
  zNacht: { value: 0 },          // 0 Tag … 1 Nacht (Fenster, Himmel)
  zLichtK: { value: 0 },         // Lichter an (Licht-Karte, Leuchtpunkte) 0 … 1
  zHell: { value: 1 },           // Helligkeit unbeleuchteter Shader (Fernkulisse, Partikel, Luft-Teilchen)
  zLichtMap: { value: null },    // Licht-Karte (RGB, Wurzel-kodiert, × 4)
  zLichtXf: { value: new THREE.Vector4(0, 0, 0, 0) },   // minX, minZ, 1/Breite, 1/Tiefe (0 = keine Karte)
  // Spiegel-Lichter für die nasse Fahrbahn (Streifen-Spiegelung): Position + Stärke, Anzahl
  zRefl: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, -1e4, 0, 0)) }, zReflN: { value: 0 }, zUpV: { value: new THREE.Vector3(0, 1, 0) },
};
// Platzhalter (schwarz), damit der Sampler immer gültig ist
zeitUniforms.zLichtMap.value = (() => { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); t.needsUpdate = true; return t; })();

// ---------- Shader-Stücke ----------
// patchStaticShadow (materials.js): Licht der Karte als zusätzliches diffuses Licht, auf glatten (nassen) Flächen auch als
// Glanz – so spiegelt die nasse Fahrbahn das Flutlicht. vSbWorld = Weltposition.
export const NACHT_PARS = `
      uniform float zLichtK; uniform sampler2D zLichtMap; uniform vec4 zLichtXf;
      vec3 zNachtLicht() {
        if ( zLichtK <= 0.0 || zLichtXf.z <= 0.0 ) return vec3( 0.0 );
        vec2 uv = ( vSbWorld.xz - zLichtXf.xy ) * zLichtXf.zw;
        if ( uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0 ) return vec3( 0.0 );
        vec3 t = texture2D( zLichtMap, uv ).rgb;
        return t * t * 4.0 * zLichtK;
      }`;
export const NACHT_APPLY = `
      {
        vec3 zl = zNachtLicht();
        if ( zl.r + zl.g + zl.b > 0.0 ) {
          reflectedLight.directDiffuse += zl * diffuseColor.rgb;
          #ifdef STANDARD
          reflectedLight.directSpecular += zl * 0.5 * pow( 1.0 - clamp( material.roughness, 0.0, 1.0 ), 3.0 );
          #endif
        }
      }`;

// patchRoad (materials.js), nach lights_fragment_end: Spiegelung der hellsten Lichter (Flutlicht-Köpfe, Portal, Tribünen) als
// senkrecht gezogene Streifen auf nasser Fahrbahn – wie auf echtem nassem Asphalt (Glanz-Lobe in der Höhe weit, seitlich
// schmal). Nur bei Nässe und Licht (gleichförmige Bedingung), höchstens 16 Lichter.
export const ROAD_REFL_PARS = `uniform vec4 zRefl[ 4 ]; uniform float zReflN; uniform vec3 zUpV;`;
export const ROAD_REFL_GLSL = `
      if ( zLichtK > 0.0 && wWet > 0.0 && zReflN > 0.0 ) {
        float wetK = wWet * clamp( 1.0 - roughnessFactor * 1.4, 0.0, 1.0 ) + sbPud * 0.6;
        if ( wetK > 0.02 ) {
          vec3 rp = - vViewPosition, rv = reflect( normalize( rp ), normal );
          float re = dot( rv, zUpV ); vec3 rh = rv - zUpV * re; float rhl = dot( rh, rh );
          float acc = 0.0;
          for ( int k = 0; k < 4; k ++ ) {   // feste Länge (ausgerollt, ohne Abbruch); unbenutzte Lichter haben Stärke 0
            vec3 lv = zRefl[ k ].xyz - rp; float ld2 = dot( lv, lv ); lv *= inversesqrt( ld2 );
            float le = dot( lv, zUpV ); vec3 lh = lv - zUpV * le;
            float az = 1.0 - dot( rh, lh ) * inversesqrt( max( rhl * dot( lh, lh ), 1e-8 ) ), el = re - le;
            acc += exp( - az * 1100.0 - el * el * 28.0 ) * zRefl[ k ].w;
          }
          reflectedLight.directSpecular += vec3( 1.0, 0.95, 0.85 ) * acc * wetK * zLichtK;
        }
      }`;

// Spiegel-Lichter für die nasse Fahrbahn: je Bild die nächsten (Kino 8, Standard 4) im Umkreis von 220 m vor der Kamera,
// in Blickraum-Koordinaten (spart die Matrix im Shader); Stärke fällt mit der Entfernung (fern kaum Spiegelung)
const _v = new THREE.Vector3(), _d2 = new Float32Array(256), _idx = new Int32Array(4);
let _nSel = 0, _tick = 0, _lastRefl = null;
export function reflNaechste(refl, cam, max = 8) {
  const U = zeitUniforms;
  if (!refl || !refl.length || max <= 0) { U.zReflN.value = 0; return; }
  // Auswahl nur alle 6 Bilder (ohne Speicher-Müll), die Blickraum-Lage jedes Bild
  if (refl !== _lastRefl || (_tick++ % 6) === 0) {
    _lastRefl = refl;
    const p = cam.position, f = _v.set(0, 0, -1).applyQuaternion(cam.quaternion), fx = f.x, fy = f.y, fz = f.z, m = Math.min(refl.length, 256);
    _nSel = 0;
    for (let i = 0; i < m; i++) {
      const r = refl[i], dx = r[0] - p.x, dy = r[1] - p.y, dz = r[2] - p.z, d2 = dx * dx + dy * dy + dz * dz;
      _d2[i] = d2 > 220 * 220 || dx * fx + dy * fy + dz * fz < -20 ? Infinity : d2;
    }
    for (let k = 0; k < Math.min(max, 4); k++) {   // k kleinste (Auswahl ohne Sortieren)
      let b = -1, bd = Infinity;
      for (let i = 0; i < m; i++) if (_d2[i] < bd) { bd = _d2[i]; b = i; }
      if (b < 0) break;
      _idx[_nSel++] = b; _d2[b] = Infinity;
    }
  }
  cam.updateMatrixWorld();
  const n = Math.min(_nSel, max), mi = cam.matrixWorldInverse, p = cam.position;
  for (let k = 0; k < n; k++) {
    const r = refl[_idx[k]], d = Math.hypot(r[0] - p.x, r[1] - p.y, r[2] - p.z);
    _v.set(r[0], r[1], r[2]).applyMatrix4(mi);
    U.zRefl.value[k].set(_v.x, _v.y, _v.z, r[3] * (1 - Math.min(1, Math.max(0, (d - 120) / 100))));
  }
  for (let k = n; k < 4; k++) U.zRefl.value[k].w = 0;
  U.zReflN.value = n;
  U.zUpV.value.set(0, 1, 0).transformDirection(mi);
}

// ---------- Himmel/Licht anwenden ----------
const tmpC = new THREE.Color();
// c = ThemeManager-Kontext, B = merkeBasis(), L = zeitLook(). Setzt Licht-Richtung und Himmel-Uniforms, liefert die geänderte
// Basis (Sonne/Umgebung/Nebel/Kino) für wendeWetterAn.
export function wendeZeitAn(c, B, L) {
  const { sky, sun } = c, U = sky.material.uniforms;
  // Licht-Richtung: Sonne des Themas → Abend tief, Nacht Mond (gleiches Objekt sun.userData.dir: Wolken, Teilchen, Blendung)
  if (B.sunDir && sun.userData && sun.userData.dir) {
    const d = zeitSonne(B.sunDir.toArray(), L);
    sun.userData.dir.set(d[0], d[1], d[2]).normalize();
    sun.position.copy(sun.target.position).addScaledVector(sun.userData.dir, 60);
  }
  if (U.wNight && B.sunDir) {
    U.wNight.value.set(L.night, sun.userData.dir.x, sun.userData.dir.y, sun.userData.dir.z);
    U.wGlow.value.set(L.glow, sun.userData.dir.x, sun.userData.dir.y, sun.userData.dir.z);
    U.wTint.value.set(...(L.skyTint || [1, 1, 1]));
    U.wOld.value.set(L.sunElev != null ? 1 : 0, B.sunDir.x, B.sunDir.y, B.sunDir.z);   // Sonnenfleck des Himmelsbilds dämpfen
  }
  zeitUniforms.zNacht.value = L.night;
  zeitUniforms.zLichtK.value = L.lights;
  zeitUniforms.zHell.value = L.id === 'nacht' ? 0.13 : L.id === 'abend' ? 0.8 : 1;
  const B2 = { ...B };
  B2.sunI = B.sunI * L.sun;
  B2.sunCol = B.sunCol.clone(); if (L.sunTint) B2.sunCol.multiply(tmpC.setRGB(...L.sunTint));
  B2.envI = B.envI * L.env;
  B2.fogNear = B.fogNear * L.fog; B2.fogFar = B.fogFar * L.fog;
  B2.fogCol = B.fogCol.clone(); if (L.fogCol) B2.fogCol.lerp(tmpC.setRGB(...L.fogCol), L.fogK);
  B2.horizon = B.horizon.clone(); if (L.fogCol) B2.horizon.lerp(tmpC.setRGB(...L.fogCol), L.fogK);
  B2.skyK = 1 - L.skyDark;
  B2.hazeScale = L.id === 'nacht' ? 0.07 : L.id === 'abend' ? 0.85 : 1;
  if (B.clouds) B2.clouds = { ...B.clouds, dark: B.clouds.dark.clone().multiplyScalar(L.id === 'nacht' ? 0.25 : 1) };
  if (B.kino) {
    B2.kino = { ...B.kino, aerial: { ...B.kino.aerial }, haze: B.kino.haze.clone(), sun: B.kino.sun.clone() };
    if (L.grade) { B2.kino.grade = L.grade; B2.kino.zeitGrade = true; }
    if (L.fogCol) B2.kino.haze.lerp(tmpC.setRGB(...L.fogCol), L.fogK);
    if (L.sunTint) B2.kino.sun.multiply(tmpC.setRGB(...L.sunTint));
    if (L.id === 'nacht') B2.kino.aerial.max = B.kino.aerial.max * 0.6;
  }
  return B2;
}

// ---------- Leuchtpunkte (ein Draw-Call) ----------
// Je Instanz: gC = Farbe (HDR, für den Bloom) + Art (0 ruhig, 1 Feuer flackert, 2 Reflektor: hell im Scheinwerferlicht,
// 3 Lichterkette: läuft), gS = Größe (m), Phase. Billboard im Vertex-Shader, additiv, fern etwas größer (bleibt sichtbar).
export const glowUniforms = { uTime: { value: 0 }, uCar: { value: new THREE.Vector3() }, uCarF: { value: new THREE.Vector3(0, 0, 1) }, uKetten: { value: 1 } };   // main.js setzt sie je Bild
function glowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: glowUniforms.uTime, uK: zeitUniforms.zLichtK, uCar: glowUniforms.uCar, uCarF: glowUniforms.uCarF, uKetten: glowUniforms.uKetten },
    vertexShader: `attribute vec4 gC; attribute vec2 gS; uniform float uTime, uK, uKetten; uniform vec3 uCar, uCarF;
      varying vec3 vC; varying vec2 vUv;
      void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
        float kind = gC.a, f = 1.0, s = gS.x;
        if ( kind > 0.5 && kind < 1.5 ) f = 0.7 + 0.3 * sin( uTime * 13.0 + gS.y * 7.0 ) * sin( uTime * 7.3 + gS.y * 3.0 );
        else if ( kind > 1.5 && kind < 2.5 ) {
          vec3 to = wp.xyz - uCar; float d = length( to );
          float cone = smoothstep( 0.35, 0.8, dot( to / max( d, 0.01 ), uCarF ) );
          f = 0.1 + 1.4 * cone * ( 1.0 - smoothstep( 30.0, 140.0, d ) );
        }
        else if ( kind > 3.5 ) f = smoothstep( 0.0, 0.5, dot( normalize( cameraPosition - wp.xyz ), uCarF ) );   // Scheinwerfer: nur von vorn
        else if ( kind > 2.5 ) f = uKetten * ( 0.7 + 0.3 * step( 0.5, fract( uTime * 1.2 - gS.y ) ) );
        vec4 mv = viewMatrix * wp;
        s *= max( 1.0, -mv.z / 140.0 );   // fern nicht unter ~1 Pixel
        mv.xy += position.xy * s;
        vC = gC.rgb * f * uK * ( 1.0 - smoothstep( 900.0, 1400.0, -mv.z ) ) * ( kind > 3.5 ? 1.0 : smoothstep( 3.0, 9.0, -mv.z ) );   // direkt vor der Kamera aus
        vUv = position.xy + 0.5;
        gl_Position = projectionMatrix * mv;
        if ( uK <= 0.0 || f <= 0.0 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
      }`,
    fragmentShader: `varying vec3 vC; varying vec2 vUv;
      void main() { vec2 q = vUv - 0.5; float r2 = dot( q, q ) * 4.0;
        float a = exp( - r2 * 5.0 ) * 0.55 + exp( - r2 * 60.0 ) * 1.6;
        if ( a < 0.004 ) discard;
        gl_FragColor = vec4( vC * a, 1.0 ); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
  });
}
export function glowMesh(list, name) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const im = new THREE.InstancedMesh(g, glowMaterial(), Math.max(1, list.length));
  const gC = new Float32Array(Math.max(1, list.length) * 4), gS = new Float32Array(Math.max(1, list.length) * 2), m4 = new THREE.Matrix4();
  list.forEach((p, k) => { m4.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(k, m4); gC.set([p.c[0], p.c[1], p.c[2], p.kind || 0], k * 4); gS.set([p.s, p.ph ?? Math.random()], k * 2); });
  g.setAttribute('gC', new THREE.InstancedBufferAttribute(gC, 4)); g.setAttribute('gS', new THREE.InstancedBufferAttribute(gS, 2));
  im.count = list.length; im.frustumCulled = false; im.renderOrder = 4; im.name = name;
  return im;
}

// ---------- Lichtquellen der Strecke planen ----------
const KALT = [1.0, 0.97, 0.9], WARM = [1.0, 0.72, 0.42], FEUER = [1.0, 0.5, 0.16];
const up = (L, i) => [L.nx[i], L.ny[i], L.nz[i]];
// liefert { pools: [{x,z,r,c,k}], glows: [...], ketten: [...] }
export function planNachtLichter(track, plan, gy, themeId) {
  const L = track.line, n = L.px.length, P = (plan && plan.inst) || {};
  const pools = [], glows = [], ketten = [];
  const pool = (x, z, r, c, k) => pools.push({ x, z, r, c, k });
  const glow = (x, y, z, s, c, k, kind = 0, ph) => glows.push({ x, y, z, s, c: [c[0] * k, c[1] * k, c[2] * k], kind, ph });
  // Flutlichtmasten: Kopf 24,6 m, Lampenfeld zur Straße (lokal +z), Lichtpfütze 14 m vor dem Mast Richtung Straße
  const refl = [];
  const nearest = (x, z) => { let b = Infinity, bi = 0; for (let i = 0; i < n; i += 2) { const d = (L.px[i] - x) ** 2 + (L.pz[i] - z) ** 2; if (d < b) { b = d; bi = i; } } return [bi, Math.sqrt(b)]; };
  for (const m of P.mast || []) {
    const fx = Math.sin(m.rot), fz = Math.cos(m.rot), y = gy(m.x, m.z);
    glow(m.x + fx * 0.6, y + 24.6, m.z + fz * 0.6, 4.2, KALT, 9);
    refl.push([m.x + fx * 0.6, y + 24.6, m.z + fz * 0.6, 1.0]);
    for (const d of [10, 24]) pool(m.x + fx * d, m.z + fz * d, 30, KALT, d === 10 ? 1.1 : 0.9);
    const [i, dd] = nearest(m.x, m.z);
    if (dd < 70) pool(L.px[i], L.pz[i], 32, KALT, 0.9);   // die Fahrbahn vor dem Mast liegt im Licht
  }
  // Start/Ziel-Portal: hell ausgeleuchtet
  if (plan && plan.portal) {
    const p = plan.portal;
    pool(p.x, p.z, 34, KALT, 1.2);
    for (const s of [-1, 1]) { glow(p.x + p.tz * s * 9, p.y + 10.6, p.z - p.tx * s * 9, 2.2, KALT, 6); refl.push([p.x + p.tz * s * 9, p.y + 10.6, p.z - p.tx * s * 9, 0.6]); }
  }
  // Tribünen: Lampenreihe am Dach (bzw. oben an der Rückwand), warmes Licht auf Sitzreihen und Vorplatz
  for (const st of P.stand || []) {
    const fx = Math.sin(st.rot || 0), fz = Math.cos(st.rot || 0), rx = fz, rz = -fx, y = gy(st.x, st.z);
    pool(st.x - fx * 4, st.z - fz * 4, 22, WARM, 0.9);
    refl.push([st.x + fx * 0.4, y + 11.2, st.z + fz * 0.4, 0.5]);
    for (let k = -2; k <= 2; k++) glow(st.x + rx * k * 4 + fx * 0.4, y + 11.2, st.z + rz * k * 4 + fz * 0.4, 1.3, KALT, 4);
  }
  // Leinwand, Rennleitung, Event-Gelände, Hütten, Höfe, Strandbar: warme Lichter
  for (const k of ['leinwand']) for (const o of P[k] || []) pool(o.x, o.z, 18, [0.45, 0.6, 1.0], 0.7);
  for (const o of P.leitturm || []) { pool(o.x, o.z, 14, WARM, 0.6); glow(o.x, gy(o.x, o.z) + 9.6, o.z, 3.5, WARM, 1.6); }
  for (const k of ['zelt', 'foodtruck', 'schirm', 'strandbar', 'apres', 'huepfburg']) for (const o of P[k] || []) {
    pool(o.x, o.z, k === 'apres' || k === 'strandbar' ? 16 : 11, WARM, 0.8);
    glow(o.x, gy(o.x, o.z) + 2.6, o.z, 1.6, WARM, 3);
  }
  for (const k of ['hut', 'farm', 'house']) for (const o of P[k] || []) { pool(o.x, o.z, 12, WARM, 0.55); glow(o.x, gy(o.x, o.z) + 2.0, o.z, 1.2, WARM, 2.2); }
  // Lagerfeuer: Wüste, Alpen, Winter, Küste (am Event-Gelände bzw. bei Hütten/Picknick), flackern
  if (['wueste', 'alpen', 'winter', 'kueste'].includes(themeId)) {
    const spots = [...(P.picnic || []), ...(P.hut || []), ...(P.zelt || []).filter((_, i) => i % 3 === 0)].slice(0, 12);
    for (const o of spots) { const x = o.x + 4, z = o.z + 3; pool(x, z, 14, FEUER, 1.0); glow(x, gy(x, z) + 0.7, z, 1.8, FEUER, 5, 1); }
  }
  // Lichterketten: entlang beider Ränder von Looping, Röhre, Korkenzieher/Wendel/Spirale (alle ~1,3 m) und an den
  // Schanzen-Lippen (quer), leicht über der Fahrbahnkante
  const ketteTyp = /loop|tube|cork|spiral|wendel|helix|screw/;
  const cols = [[1.0, 0.85, 0.4], [0.4, 0.75, 1.0], [1.0, 0.35, 0.3]];
  for (const pc of track.pieces || []) {
    if (!ketteTyp.test(pc.type) || pc.lineStart == null) continue;
    let last = -1e9;
    for (let i = Math.max(0, pc.lineStart); i <= Math.min(n - 1, pc.lineEnd); i++) {
      if (L.s[i] - last < 1.3) continue;
      last = L.s[i];
      const u = up(L, i), hw = L.hw[i] - 0.25;   // innen an der Kante: außen verdecken die Seitenwände
      for (const sg of [-1, 1]) {
        const c = cols[(Math.floor(L.s[i] / 1.3) + (sg > 0 ? 1 : 0)) % 3];
        ketten.push({ x: L.px[i] + L.bx[i] * hw * sg + u[0] * 0.35, y: L.py[i] + L.by[i] * hw * sg + u[1] * 0.35, z: L.pz[i] + L.bz[i] * hw * sg + u[2] * 0.35, s: 0.8, c: [c[0] * 3.5, c[1] * 3.5, c[2] * 3.5], kind: 3, ph: (L.s[i] / 9) % 1 });
      }
    }
  }
  for (const j of track.jumps || []) {
    for (const i of [j.lipIdx, j.landIdx]) {
      if (i == null || i < 0 || i >= n) continue;
      const u = up(L, i), hw = L.hw[i];
      for (let q = -6; q <= 6; q++) { const o = q / 6 * hw; ketten.push({ x: L.px[i] + L.bx[i] * o + u[0] * 0.3, y: L.py[i] + L.by[i] * o + u[1] * 0.3, z: L.pz[i] + L.bz[i] * o + u[2] * 0.3, s: 0.75, c: [3.2, 2.4, 0.6], kind: 3, ph: (q + 6) / 13 }); }
    }
  }
  // Streckenlaternen (nur abends/nachts gebaut, main.js): alle ~80 m, Seiten abwechselnd, 3,5 m neben der Kante, Ausleger
  // über den Rand, Lichtpfütze auf der Fahrbahn. Nicht in Looping/Röhre/Sprung/Luft, nur wo das Gelände auf Fahrbahnhöhe
  // liegt, nicht dicht an Objekten der Kulissen-Planung.
  const laternen = [], belegt = [];
  for (const k of Object.keys(P)) { if (['grass', 'flower', 'bush', 'laub', 'rock', 'tyre', 'board'].includes(k)) continue; for (const o of P[k] || []) if (o && o.x != null) belegt.push(o); }
  const frei = (x, z) => { for (const o of belegt) if ((o.x - x) ** 2 + (o.z - z) ** 2 < 49) return false; return true; };
  let lastL = -40, side = 1;
  for (let i = 0; i < n; i++) {
    if (L.s[i] - lastL < 80) continue;
    if ((L.loop && L.loop[i]) || (L.tube && L.tube[i]) || (L.air && L.air[i])) continue;
    const u = up(L, i);
    if (u[1] < 0.9) continue;
    let ok = false;
    for (const sg of [side, -side]) {
      const d = L.hw[i] + 3.5, x = L.px[i] + L.bx[i] * d * sg, z = L.pz[i] + L.bz[i] * d * sg, g = gy(x, z);
      if (Math.abs(g - L.py[i]) > 1.2 || !frei(x, z)) continue;
      let clear = true;   // keine andere Fahrbahn (Kreuzung, Hochstraße) näher als 2,5 m an der Kante
      for (let j = 0; j < n; j += 3) { const q = (L.px[j] - x) ** 2 + (L.pz[j] - z) ** 2; if (q < (L.hw[j] + 2.5) ** 2 && Math.abs(L.py[j] - g) < 12) { clear = false; break; } }
      if (!clear) continue;
      const rot = Math.atan2(-L.bx[i] * sg, -L.bz[i] * sg);   // lokal +z zur Straße
      const hx = x - L.bx[i] * sg * 3.2, hz = z - L.bz[i] * sg * 3.2;   // Leuchtenkopf über dem Rand
      laternen.push({ x, z, y: g, rot });
      glow(hx, g + 9.6, hz, 1.6, KALT, 4.5);
      pool(L.px[i] + L.bx[i] * L.hw[i] * 0.45 * sg, L.pz[i] + L.bz[i] * L.hw[i] * 0.45 * sg, 21, KALT, 0.95);
      refl.push([hx, g + 9.6, hz, 0.45]);
      ok = true; side = -sg; break;
    }
    if (ok) lastL = L.s[i];
  }
  // Leitpfosten-Reflektoren: beide Ränder alle ~24 m (nicht in Looping/Röhre/Sprung), 0,9 m hoch – leuchten im Scheinwerfer
  let last = -1e9;
  for (let i = 0; i < n; i++) {
    if (L.loop && L.loop[i]) continue; if (L.tube && L.tube[i]) continue; if (L.air && L.air[i]) continue;
    if (L.s[i] - last < 24) continue;
    last = L.s[i];
    const u = up(L, i);
    if (u[1] < 0.8) continue;
    for (const sg of [-1, 1]) {
      const hw = L.hw[i] + 0.9;
      glows.push({ x: L.px[i] + L.bx[i] * hw * sg, y: L.py[i] + 0.9, z: L.pz[i] + L.bz[i] * hw * sg, s: 0.45, c: sg > 0 ? [2.6, 2.6, 2.4] : [3.0, 0.7, 0.2], kind: 2, ph: 0 });
    }
  }
  return { pools, glows, ketten, refl, laternen };
}

// Licht-Karte backen: RGB-Summe aller Pfützen, weicher Abfall (1 − (d/r)²)², Wurzel-kodiert in 8 Bit (× 4 = 1)
export function backeLichtKarte(pools, bounds, res = 512) {
  const pad = 80, minX = bounds.minX - pad, minZ = bounds.minZ - pad, W = bounds.maxX - bounds.minX + 2 * pad, D = bounds.maxZ - bounds.minZ + 2 * pad;
  const S = Math.max(W, D), sx = S / res;
  const acc = new Float32Array(res * res * 3);
  for (const p of pools) {
    const r = p.r, x0 = Math.max(0, Math.floor((p.x - r - minX) / sx)), x1 = Math.min(res - 1, Math.ceil((p.x + r - minX) / sx));
    const z0 = Math.max(0, Math.floor((p.z - r - minZ) / sx)), z1 = Math.min(res - 1, Math.ceil((p.z + r - minZ) / sx));
    for (let zi = z0; zi <= z1; zi++) for (let xi = x0; xi <= x1; xi++) {
      const dx = minX + (xi + 0.5) * sx - p.x, dz = minZ + (zi + 0.5) * sx - p.z, q = (dx * dx + dz * dz) / (r * r);
      if (q >= 1) continue;
      const f = (1 - q) * (1 - q) * p.k * 0.6, o = (zi * res + xi) * 3;   // 0,6: Start-Bereich war mit überlagerten Pfützen taghell
      acc[o] += p.c[0] * f; acc[o + 1] += p.c[1] * f; acc[o + 2] += p.c[2] * f;
    }
  }
  const d = new Uint8Array(res * res * 4);
  for (let k = 0; k < res * res; k++) for (let c = 0; c < 3; c++) d[k * 4 + c] = Math.round(255 * Math.sqrt(Math.min(1, acc[k * 3 + c] / 4))), d[k * 4 + 3] = 255;
  const t = new THREE.DataTexture(d, res, res); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return { tex: t, xf: [minX, minZ, 1 / S, 1 / S] };
}
