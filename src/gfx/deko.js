// Deko (n28, Peter 05.10.2026: „ressourcenschonend verschönern … mehr Details und Eye Candy“): Wolken am Himmel,
// Vogelschwärme. Alles im Spiel erzeugt (0 KB Download), je ein Draw-Call, Bewegung im Shader aus der Zeit (keine
// CPU-Arbeit je Bild). ?deko=0 = Aussehen wie bis n29 (alles hier aus); ?deko=aus = ohne Streckenrand-Deko (bis n29: ?deko=0).
import * as THREE from 'three';
import { decoUniforms } from './deco.js';

const Q = globalThis.location ? new URLSearchParams(globalThis.location.search) : new URLSearchParams();
export const DEKO = Q.get('deko') !== '0';
// „Bewegung reduzieren“ (Betriebssystem): kein Kameraschütteln, weniger Teilchen in der Luft
export const REDUCED = !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---------- Wolken ----------
// Je Thema: k = Bedeckung, soft = weicher Rand (Dunst), sc = Maßstab (größer = kleinere Wolken), sp = Zug-Tempo.
// Land und Winter haben ihre Wolken schon im Himmelsbild (Poly-Haven-HDRI) → keine zusätzlichen.
export const CLOUDS = {
  land: null,
  winter: null,
  alpen: { k: 0.47, soft: 0.13, sc: 1.0, sp: 1.0 },
  wueste: { k: 0.24, soft: 0.34, sc: 1.6, sp: 0.6 },
  kueste: { k: 0.3, soft: 0.24, sc: 1.15, sp: 1.4 },
  stadt: { k: 0.42, soft: 0.3, sc: 1.3, sp: 0.8 },
  herbst: { k: 0.48, soft: 0.18, sc: 0.95, sp: 1.1 },
};

// Kachelbares Wolken-Rauschen (fbm aus periodischem Wertrauschen), einmal beim Start gerechnet: 256² × 1 Byte
let cloudTex = null;
export function cloudTexture() {
  if (cloudTex) return cloudTex;
  const N = 256, raw = new Float32Array(N * N), data = new Uint8Array(N * N);
  let seed = 9173; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const oct = [[4, 0.5], [8, 0.27], [16, 0.13], [32, 0.065], [64, 0.035]].map(([g, a]) => { const v = new Float32Array(g * g); for (let i = 0; i < v.length; i++) v[i] = R(); return { g, a, v }; });
  const sm = (t) => t * t * (3 - 2 * t), tot = oct.reduce((s, o) => s + o.a, 0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let n = 0;
    for (const { g, a, v } of oct) {
      const fx = x / N * g, fy = y / N * g, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
      const V = (i, j) => v[(j % g) * g + (i % g)];
      n += a * ((V(x0, y0) * (1 - tx) + V(x0 + 1, y0) * tx) * (1 - ty) + (V(x0, y0 + 1) * (1 - tx) + V(x0 + 1, y0 + 1) * tx) * ty);
    }
    raw[y * N + x] = n / tot;
  }
  // Werte gleichverteilen (Histogramm-Ausgleich): Bedeckung k ≈ Anteil des Himmels mit Wolken
  const B = 1024, cdf = new Float32Array(B + 1);
  for (let i = 0; i < raw.length; i++) cdf[Math.min(B - 1, Math.floor(raw[i] * B)) + 1]++;
  for (let b = 1; b <= B; b++) cdf[b] += cdf[b - 1];
  for (let i = 0; i < raw.length; i++) { const f = raw[i] * B, b = Math.min(B - 1, Math.floor(f)); data[i] = Math.round(255 * (cdf[b] + (cdf[b + 1] - cdf[b]) * (f - b)) / raw.length); }
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return (cloudTex = t);
}

// Uniforms und Shader-Stück für die Himmelskugel (gfx/env.js makeSky): Wolken auf einer gedachten Ebene über der Welt,
// zur Sonne hin silbern, dicke Stellen unten grau, am Horizont dünn und im Dunst; ziehen langsam mit dem Wind.
export function cloudUniforms(sunDir) {
  return { cMap: { value: cloudTexture() }, cK: { value: 0 }, cSoft: { value: 0.25 }, cSc: { value: 1 }, cSp: { value: 1 },
    cSun: { value: sunDir || new THREE.Vector3(0.3, 0.7, 0.3) }, cLit: { value: new THREE.Color(1, 0.97, 0.92) },
    cDark: { value: new THREE.Color(0.55, 0.6, 0.68) }, cTime: decoUniforms.uTime };
}
export const CLOUD_GLSL = {
  pars: `uniform sampler2D cMap; uniform float cK, cSoft, cSc, cSp, cTime; uniform vec3 cSun, cLit, cDark;`,
  main: `
        if ( cK > 0.0 && d.y > 0.0 ) {
          vec2 p = d.xz / ( d.y + 0.07 ) * cSc;
          vec2 w = vec2( 0.0026, 0.0011 ) * cTime * cSp;
          vec2 u1 = p * 0.15 + w, u2 = mat2( 0.8, -0.6, 0.6, 0.8 ) * p * 0.41 - w * 1.7 + 0.37;
          float n2 = texture2D( cMap, u2 ).r;
          float n = texture2D( cMap, u1 ).r * 0.7 + n2 * 0.3;
          float th = 1.0 - cK - ( 1.0 - smoothstep( 0.02, 0.3, d.y ) ) * 0.13 * cK;   // zum Horizont dichter (Wolkenbank)
          float dens = smoothstep( th - cSoft * 0.35, th + cSoft, n ) * smoothstep( 0.0, 0.09, d.y );
          if ( dens > 0.002 ) {
            vec2 sd = normalize( cSun.xz + vec2( 1e-4 ) ) * 0.02;
            float ns = texture2D( cMap, u1 + sd ).r * 0.7 + n2 * 0.3;
            float lit = clamp( 0.62 + ( n - ns ) * 7.0, 0.0, 1.0 ) * ( 1.0 - 0.38 * smoothstep( th, th + 0.42, n ) );
            float mie = pow( max( dot( d, cSun ), 0.0 ), 10.0 );
            vec3 cc = mix( cDark, cLit, lit ) + cLit * mie * ( 1.0 - dens ) * 0.9;
            cc = mix( cc, horizon, ( 1.0 - smoothstep( 0.0, 0.22, d.y ) ) * 0.45 );
            c = mix( c, cc, dens * 0.93 );
          }
        }`,
};
// Thema anwenden (gfx/themes.js): Bedeckung, Licht- und Schattenfarbe aus Sonnenfarbe/Himmel des Themas
export function applyClouds(U, id, info) {
  if (!U.cK) return;
  const C = CLOUDS[id];
  U.cK.value = C ? C.k : 0;
  if (!C) return;
  U.cSoft.value = C.soft; U.cSc.value = C.sc; U.cSp.value = C.sp;
  const sc = info.sunColor || [1, 0.95, 0.88];
  U.cLit.value.setRGB(0.55 + 0.45 * sc[0], 0.55 + 0.45 * sc[1], 0.55 + 0.45 * sc[2]).multiplyScalar(1.02);
  const hz = info.horizon || [0.75, 0.76, 0.8], sm = info.skyMean || [0.3, 0.4, 0.6];
  U.cDark.value.setRGB(0.5 * hz[0] + 0.3 * sm[0], 0.5 * hz[1] + 0.3 * sm[1], 0.5 * hz[2] + 0.3 * sm[2]);
}

// ---------- Vögel ----------
// Schwärme kreisen über der Landschaft neben der Strecke (Höhe 22–60 m), Flügelschlag mit Gleitphasen, in die Kurve
// gelegt. Ein instanziertes Mesh (8 Dreiecke je Vogel), Bahn im Vertex-Shader aus der Zeit → 0 CPU je Bild.
function birdGeometry() {
  // Körper (schmale Raute) + je Flügel innen (Viereck) und Spitze (Dreieck); x = Spannweite, z = Länge, aW = Hebel fürs Schlagen
  const P = [], W = [], I = [];
  const v = (x, y, z, w) => { P.push(x, y, z); W.push(w); return P.length / 3 - 1; };
  const nose = v(0, 0, 0.42, 0), tail = v(0, 0, -0.5, 0), bl = v(-0.07, 0, 0, 0), br = v(0.07, 0, 0, 0);
  I.push(nose, bl, tail, nose, tail, br);
  for (const s of [-1, 1]) {
    const a = v(0.07 * s, 0, 0.14, 0), b = v(0.07 * s, 0, -0.16, 0), c = v(0.5 * s, 0, 0.1, 0.5), d = v(0.5 * s, 0, -0.14, 0.5), e = v(1.0 * s, 0, -0.2, 1);
    if (s < 0) I.push(a, c, b, b, c, d, c, e, d); else I.push(a, b, c, b, d, c, c, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(W, 1));
  g.setIndex(I);
  return g;
}
// track: Strecke (line px/py/pz), id: Thema, tier: Grafikstufe, seed: Zufall je Strecke
export function makeBirds(track, id, tier, seed = 1) {
  const L = track.line;
  if (!L || !L.n) return null;
  let s = (Math.abs(seed | 0) % 2147483646) + 1; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const flocks = tier === 0 ? 2 : 4, per = id === 'winter' ? 4 : id === 'stadt' ? 7 : 6;
  const n = flocks * per, aC = new Float32Array(n * 4), aP = new Float32Array(n * 4);
  let k = 0;
  for (let f = 0; f < flocks; f++) {
    const i = Math.floor(((f + 0.3 + R() * 0.4) / flocks) * L.n) % L.n;
    // seitlich neben die Strecke (nie direkt über der Fahrbahn kreisen: Kamera schaut dort hin, aber Vögel bleiben Kulisse)
    const j = (i + 3) % L.n, tx = L.px[j] - L.px[i], tz = L.pz[j] - L.pz[i], tl = Math.hypot(tx, tz) || 1, side = R() < 0.5 ? -1 : 1;
    const off = 40 + R() * 55, cx = L.px[i] - tz / tl * off * side, cz = L.pz[i] + tx / tl * off * side;
    const h = L.py[i] + 18 + R() * 24, rad = 22 + R() * 26, spd = (7 + R() * 4) * (R() < 0.5 ? -1 : 1);
    for (let b = 0; b < per; b++, k++) {
      aC.set([cx, h + (R() - 0.5) * 5, cz, rad + (R() - 0.5) * 9], k * 4);
      aP.set([R() * 0.9 + f * 1.7, spd * (0.95 + R() * 0.1), R() * 6.283, 0.85 + R() * 0.4], k * 4);
    }
  }
  const g = birdGeometry(), ig = new THREE.InstancedBufferGeometry();
  ig.index = g.index; ig.setAttribute('position', g.getAttribute('position')); ig.setAttribute('aW', g.getAttribute('aW'));
  ig.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4)); ig.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
  ig.instanceCount = n;
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCol: { value: new THREE.Color(id === 'kueste' ? 0xd9dcdf : id === 'winter' ? 0x2c2a2a : 0x23211f) } }]);
  u.uTime = decoUniforms.uTime;
  const m = new THREE.ShaderMaterial({
    uniforms: u, fog: true, side: THREE.DoubleSide,
    vertexShader: `attribute float aW; attribute vec4 aC, aP; uniform float uTime;
      #include <fog_pars_vertex>
      void main() {
        float sz = aP.w * 1.35;
        float a = aP.y * uTime / aC.w + aP.x;                     // Winkel auf dem Kreis (Bahntempo / Radius)
        float wob = sin( uTime * 0.31 + aP.z ) * 0.18;              // Kreis atmet → Schwarm wirkt lebendig
        float r = aC.w * ( 1.0 + wob );
        vec3 c = vec3( aC.x + cos( a ) * r, aC.y + sin( uTime * 0.53 + aP.z ) * 2.5, aC.z + sin( a ) * r );
        vec2 dir = normalize( vec2( -sin( a ), cos( a ) ) * sign( aP.y ) );
        // Flügelschlag (~4 Hz) mit Gleitphasen; Flügelspitze schlägt weiter als die Mitte
        float glide = smoothstep( -0.2, 0.4, sin( uTime * 0.7 + aP.z * 3.0 ) );
        float flap = sin( uTime * 25.0 + aP.z * 7.0 ) * ( 0.15 + 0.85 * glide );
        vec3 p = position;
        p.y += aW * aW * flap * 0.55 + aW * 0.08;
        p.x *= 1.0 - 0.12 * abs( flap ) * aW;
        float bank = 0.35 * sign( aP.y );                          // in die Kurve gelegt
        p = vec3( p.x * cos( bank ) - p.y * sin( bank ), p.x * sin( bank ) + p.y * cos( bank ), p.z );
        p *= sz;
        vec3 wp = c + vec3( dir.y * p.x + dir.x * p.z, p.y, -dir.x * p.x + dir.y * p.z );
        vec4 mvPosition = viewMatrix * vec4( wp, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 uCol;
      #include <fog_pars_fragment>
      void main() { gl_FragColor = vec4( uCol, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(ig, m);
  mesh.frustumCulled = false;
  mesh.name = 'deko-voegel';
  mesh.userData.count = n;
  return mesh;
}
