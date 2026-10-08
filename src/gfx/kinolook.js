// Kino-Look (n17, Peter 28.09.2026: „Mehr Details und realistische Grafik, Effekte wie Forza mit DLSS“).
// Echtes DLSS (neuronales Rendern) gibt es im Browser nicht – dieses Modul holt den Eindruck mit klassischen
// Echtzeit-Techniken, die WebGL2 auf einem Mittelklasse-Handy schafft. Gekapselt als Pilot für andere three.js-Spiele
// (Portierung: KINOLOOK.md).
//
// Schnittstelle (Szene/Kamera/Renderer rein, Bild raus):
//   const kino = new KinoLook(renderer, { level: 1, stages: '-ssao,+haze', grade: 'mittag' });
//   kino.render(scene, camera, { dt, sunDir, run, speed, boost, car, cut, heat, overlay, time, dof, shutter, flash, white, whip });   // zeichnet auf den Bildschirm
//     flash = { k 0…1, col } Lichtblitz (n27, Feuerwerk), white 0…1 Weißblitz, whip = { len, ang } Reißschwenk-Unschärfe
//     dof = { focus (m), k 0…1 } Tiefenschärfe auf das Auto (n18, Kino-Replay); shutter = Belichtung × (Zeitlupe)
//   kino.setLevel(0|1|2)   0 = Einfach (direkt, wie bisher), 1 = Standard, 2 = Kino
//   kino.stages            einzelne Stufen an/aus (siehe STAGES), kino.describe() für Tests/Bericht
//   kino.adapt(fps)        dynamische Auflösung (von der Qualitäts-Automatik aufgerufen)
//
// Ablauf je Bild (Stufe ≥ 1), alles in EINEM Szenen-Durchlauf:
//   1. Szene → Render-Target in Renderskala (dynamische Auflösung), Tonemapping + sRGB schon im Material (8 bit,
//      Handy-Bandbreite), Tiefe als Textur, MSAA nur auf „Kino“.
//   2. Halbe Auflösung: Umgebungsverdeckung aus der Tiefe (SAO-Art, 6–10 Abtastungen) – nur wenn an.
//   3. Bloom: Viertel-Auflösung mit Schwelle, 3–4 Stufen hinunter und additiv wieder hinauf (Dual-Filter).
//   4. Bewegungsunschärfe (aus n7): Stufe 1 in halber Auflösung, Stufe 2 direkt im Endbild.
//   4b. Tiefenschärfe (n18, nur wenn o.dof übergeben – Kino-Replay): halbe Auflösung, Scheibe mit 12 Abtastungen, Radius
//      nach Unschärfekreis aus der Tiefe; scharfe Stellen (Auto) bluten nicht in den Hintergrund (Gewicht nach dem
//      Unschärfekreis der Abtastung). Das Auto bleibt scharf (Auto-Maske in der Mitte).
//   5. Endbild (volle Bildschirmauflösung): kantenbewusstes Hochskalieren mit Kantenglättung (FXAA-Art) und
//      Nachschärfen (CAS-Art) – eigener Code –, Hitzeflimmern, Unschärfe, Verdeckung, Luftperspektive (Dunst nach Tiefe
//      und Höhe, zur Sonne hin warm), Bloom, Sonnen-Blendung/Lens-Flare, Farbkorrektur je Tageszeit, Vignette, Dither.
//   Danach optional `overlay(renderer)` (z. B. das Cockpit), scharf darüber.
//
// n31 – Stufe `taa` (TAAU, „DLSS-Ersatz“, Standard AUS; ?taa=1 bzw. ?kl=+taa): Szene mit Halton-Jitter in Renderskala
//   0,6–0,7, KEIN MSAA, dann EIN Resolve-Durchgang in Bildschirmauflösung (kern/taau.js: Reprojektion über Tiefe + vorige
//   Kamera, Auto getrennt über seine Box, Varianz-Clip, Disocclusion) → das Endbild liest die History statt der Renderskala,
//   nur noch CAS-Nachschärfen (keine FXAA-Art). Rückfall (Autopilot, fehlendes HalfFloat-Ziel, Skala < 0,6): FXAA-Art,
//   MSAA 0. Schnittstelle für andere Spiele: KINOLOOK.md „TAAU in ein anderes Spiel“.
import * as THREE from 'three';
import { TAAU } from './kern/taau.js';
import { taaModus } from './kern/taau_mathe.js';

// Stufen, die einzeln schaltbar sind (URL ?kl=-bloom,+ssao …)
export const STAGES = ['scale', 'aa', 'sharpen', 'ssao', 'bloom', 'flare', 'aerial', 'grade', 'vignette', 'blur', 'haze', 'dither', 'contact', 'dof', 'taa'];
// n31: tiefste Renderskala für TAAU (darunter Rückfall auf die FXAA-Art)
export const TAA_SKALA_MIN = 0.6;

// Presets je Qualitätsstufe. scale = Renderskala (Start/Min/Max) relativ zur Bildschirmauflösung der Stufe.
// n31: taaScale/taaSharpen gelten, wenn die Stufe `taa` an ist (Startwerte, TODO Heavy-Job: am Bild/mit perf_gate abstimmen)
export const PRESETS = [
  { name: 'Einfach', pipeline: false, stages: { contact: true } },
  {
    name: 'Standard', pipeline: true, msaa: 0, scale: [0.84, 0.62, 0.92],
    stages: { scale: true, aa: true, sharpen: true, ssao: false, bloom: true, flare: true, aerial: true, grade: true, vignette: true, blur: true, haze: false, dither: true, contact: true, dof: true },
    sharpen: 0.42, ao: { taps: 6, radius: 1.1, strength: 0.55 }, bloom: { levels: 3, strength: 0.3, threshold: 0.9 }, blurHalf: true,
    taaScale: [0.7, 0.6, 0.85], taaSharpen: 0.5,
  },
  {
    name: 'Kino', pipeline: true, msaa: 4, scale: [1, 0.7, 1],
    stages: { scale: true, aa: false, sharpen: true, ssao: true, bloom: true, flare: true, aerial: true, grade: true, vignette: true, blur: true, haze: true, dither: true, contact: true, dof: true },
    sharpen: 0.25, ao: { taps: 10, radius: 1.2, strength: 0.65 }, bloom: { levels: 4, strength: 0.36, threshold: 0.88 }, blurHalf: false,
    taaScale: [0.7, 0.6, 1], taaSharpen: 0.4,
  },
];

// Farbkorrektur je Tageszeit (Anzeige-Raum, nach dem Tonemapping – wirkt wie eine LUT, kostet aber keine Textur).
// wb = Weißabgleich, lift/gamma/gain = ASC-CDL-artig, split = Schatten kühl / Lichter warm, sat/vib = Sättigung/Lebendigkeit,
// contrast = S-Kurve. Stuntbahn nutzt „mittag“ (HDRI Kloofendal, Sonne ~48°); die anderen sind für andere Spiele/Himmel.
export const GRADES = {
  mittag: { wb: [1.012, 1.0, 0.982], lift: [0.004, 0.006, 0.014], gamma: [1.0, 1.0, 1.02], gain: [1.02, 1.01, 1.0], shadow: [-0.012, 0.0, 0.016], high: [0.014, 0.006, -0.012], split: 1, sat: 1.05, vib: 0.14, contrast: 0.24, green: 1 },
  morgen: { wb: [1.03, 1.0, 0.95], lift: [0.01, 0.006, 0.012], gamma: [0.98, 1.0, 1.03], gain: [1.04, 1.0, 0.94], shadow: [-0.01, 0.0, 0.02], high: [0.03, 0.012, -0.02], split: 1, sat: 1.0, vib: 0.14, contrast: 0.12 },
  abend: { wb: [1.06, 0.99, 0.9], lift: [0.012, 0.004, 0.012], gamma: [0.97, 1.0, 1.04], gain: [1.06, 0.99, 0.88], shadow: [-0.006, -0.004, 0.026], high: [0.04, 0.014, -0.03], split: 1.2, sat: 1.06, vib: 0.18, contrast: 0.2 },
  nacht: { wb: [0.92, 0.98, 1.1], lift: [0.0, 0.004, 0.014], gamma: [1.04, 1.02, 0.98], gain: [0.96, 1.0, 1.06], shadow: [-0.01, 0.0, 0.03], high: [0.0, 0.006, 0.01], split: 0.8, sat: 0.9, vib: 0.06, contrast: 0.14 },
  neutral: { wb: [1, 1, 1], lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], shadow: [0, 0, 0], high: [0, 0, 0], split: 0, sat: 1, vib: 0, contrast: 0 },
  // Kulissen (n20): je Landschafts-Thema (gfx/themes.js)
  wueste: { wb: [1.04, 1.0, 0.93], lift: [0.012, 0.006, 0.006], gamma: [0.99, 1.0, 1.03], gain: [1.05, 1.0, 0.94], shadow: [-0.004, -0.004, 0.018], high: [0.026, 0.01, -0.02], split: 1.1, sat: 1.06, vib: 0.12, contrast: 0.26 },
  alpen: { wb: [0.995, 1.0, 1.02], lift: [0.0, 0.004, 0.016], gamma: [1.0, 1.0, 1.02], gain: [1.01, 1.01, 1.02], shadow: [-0.012, 0.0, 0.02], high: [0.01, 0.006, -0.006], split: 1, sat: 1.06, vib: 0.16, contrast: 0.26, green: 1 },
  kueste: { wb: [1.0, 1.0, 1.0], lift: [0.002, 0.006, 0.012], gamma: [1.0, 0.99, 1.0], gain: [1.02, 1.02, 1.0], shadow: [-0.014, 0.004, 0.018], high: [0.016, 0.008, -0.01], split: 1, sat: 1.1, vib: 0.2, contrast: 0.24, green: 0.6 },
  stadt: { wb: [1.04, 1.0, 0.93], lift: [0.01, 0.006, 0.012], gamma: [0.98, 1.0, 1.03], gain: [1.05, 1.0, 0.92], shadow: [-0.01, -0.002, 0.024], high: [0.034, 0.012, -0.024], split: 1.2, sat: 1.04, vib: 0.16, contrast: 0.24 },
  herbst: { wb: [1.03, 1.0, 0.94], lift: [0.008, 0.006, 0.008], gamma: [0.99, 1.0, 1.02], gain: [1.04, 1.0, 0.93], shadow: [-0.006, 0.0, 0.016], high: [0.028, 0.012, -0.018], split: 1.1, sat: 1.1, vib: 0.2, contrast: 0.22 },
  winter: { wb: [0.97, 0.99, 1.04], lift: [0.006, 0.008, 0.014], gamma: [1.0, 1.0, 0.99], gain: [0.99, 1.0, 1.03], shadow: [-0.008, 0.0, 0.022], high: [0.004, 0.004, 0.0], split: 0.8, sat: 0.92, vib: 0.08, contrast: 0.2 },
};

// Bewegungsunschärfe (n7, unverändert in Wirkung): Belichtungszeit und größte Streifenlänge (Anteil der Bildbreite)
export const BLUR_LEVELS = {
  off: { name: 'Aus', shutter: 0, max: 0 },
  light: { name: 'Leicht', shutter: 1 / 170, max: 0.028 },
  strong: { name: 'Stark', shutter: 1 / 85, max: 0.05 },
};
const BLUR_TAPS = { 1: { light: 5, strong: 7 }, 2: { light: 9, strong: 13 } };
export const BLUR_V0 = 80 / 3.6, BLUR_V1 = 190 / 3.6;
const ROT_KEEP = 0.45;   // Anteil der Kamera-Drehung, der verwischt (Kurven bleiben lesbar)

const VS = `varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// gemeinsame Helfer: Tiefe → Blickraum, Luma, Rauschen (Interleaved Gradient Noise)
const COMMON = `
  float kLuma( vec3 c ) { return dot( c, vec3( 0.299, 0.587, 0.114 ) ); }
  float kIgn( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
  vec3 kView( mat4 invProj, vec2 uv, float d ) { vec4 v = invProj * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 ); return v.xyz / v.w; }`;

// Bewegungsunschärfe: Geschwindigkeit je Pixel aus Tiefe + voriger Kamera; Auto-Box bleibt scharf
const BLUR_CORE = `
  uniform mat4 uReproj, uInvVP, uCarInv;
  uniform vec3 uBoxMin, uBoxMax;
  uniform float uCarOn, uScale, uMaxLen, uRadial, uNear, uFar;
  float kLinZ( float d ) { return uNear * uFar / ( uFar - d * ( uFar - uNear ) ); }
  float kCarMask( vec2 uv, float d ) {
    if ( uCarOn < 0.5 || d >= 1.0 ) return 0.0;
    vec4 w = uInvVP * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 ); w /= w.w;
    vec3 l = ( uCarInv * w ).xyz;
    return ( all( greaterThan( l, uBoxMin ) ) && all( lessThan( l, uBoxMax ) ) ) ? 1.0 : 0.0;
  }
  // gibt Farbe (rgb) und Mischanteil (a) zurück
  vec4 kBlur( sampler2D tCol, sampler2D tDep, vec2 uv, float d, float car, vec2 res ) {
    vec4 pc = uReproj * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
    vec2 v = ( uv - ( pc.xy / pc.w * 0.5 + 0.5 ) ) * uScale;
    if ( pc.w <= 0.0 ) v = vec2( 0.0 );
    vec2 c = uv - 0.5;
    v += c * uRadial * smoothstep( 0.12, 0.5, length( c ) );   // Nitro: zusätzlicher Zoom am Rand
    v *= 1.0 - car;
    float L = length( v * res ), Lmax = uMaxLen * res.x;
    if ( L > Lmax ) { v *= Lmax / L; L = Lmax; }
    if ( L <= 0.6 ) return vec4( 0.0 );
    float z0 = kLinZ( d ), sum = 0.0; vec3 col = vec3( 0.0 );
    float j = kIgn( gl_FragCoord.xy );
    for ( int i = 0; i < TAPS; i++ ) {
      vec2 q = uv + v * ( ( float( i ) + j ) / float( TAPS ) - 0.5 );
      float w = step( z0 * 0.75 - 0.3, kLinZ( texture2D( tDep, q ).x ) );   // Vordergrund (Auto) nicht in den Hintergrund ziehen
      col += texture2D( tCol, q ).rgb * w; sum += w;
    }
    return sum > 0.0 ? vec4( col / sum, smoothstep( 0.6, 2.5, L ) ) : vec4( 0.0 );
  }`;

const BLUR_HALF_FS = `
  uniform sampler2D tColor, tDepth; uniform vec2 uRes; varying vec2 vUv;
  ${COMMON}
  ${BLUR_CORE}
  void main() {
    float d = texture2D( tDepth, vUv ).x;
    float car = kCarMask( vUv, d );
    vec4 b = kBlur( tColor, tDepth, vUv, d, car, uRes );
    gl_FragColor = vec4( b.a > 0.0 ? b.rgb : texture2D( tColor, vUv ).rgb, b.a * ( 1.0 - car ) );
  }`;

// Tiefenschärfe (n18): Unschärfekreis 0 … 1 aus der linearen Tiefe – hinter dem Fokus über uDofFar·Fokus, davor über
// uDofNear·Fokus voll –, mal Stärke uDofK
const DOF_CORE = `
  uniform float uDofF, uDofR, uDofNear, uDofFar, uDofK;
  float kCoc( float z ) { float c = z > uDofF ? ( z - uDofF ) / ( uDofF * uDofFar ) : ( uDofF - z ) / ( uDofF * uDofNear ); return clamp( c, 0.0, 1.0 ) * uDofK; }`;
const DOF_FS = `
  uniform sampler2D tColor, tDepth; uniform vec2 uRes; varying vec2 vUv;
  ${COMMON}
  ${BLUR_CORE}
  ${DOF_CORE}
  uniform vec2 uJitUv;   // n31: Jitter dieses Bilds (uv) – Tiefenschärfe liest die unverschobene Stelle, sonst wabert sie
  void main() {
    vec2 uv0 = vUv + uJitUv;
    float d = texture2D( tDepth, uv0 ).x;
    float c0 = d >= 1.0 ? uDofK : kCoc( kLinZ( d ) ) * ( 1.0 - kCarMask( vUv, d ) );
    vec3 acc = texture2D( tColor, uv0 ).rgb; float ws = 1.0;
    if ( c0 > 0.02 ) {
      vec2 R = vec2( uDofR * uRes.y / uRes.x, uDofR ) * c0;
      float ang = kIgn( gl_FragCoord.xy ) * 6.2831853;
      for ( int i = 0; i < 12; i++ ) {
        float a = ( float( i ) + 0.5 ) / 12.0, th = ang + float( i ) * 2.3999632;
        vec2 q = uv0 + vec2( cos( th ), sin( th ) ) * sqrt( a ) * R;
        float dq = texture2D( tDepth, q ).x;
        float cq = dq >= 1.0 ? uDofK : kCoc( kLinZ( dq ) );
        float w = clamp( cq / max( c0, 1e-3 ) * 1.5, 0.0, 1.0 );   // scharfe Stellen (Auto im Fokus: cq ≈ 0) bluten nicht
        acc += texture2D( tColor, q ).rgb * w; ws += w;
      }
    }
    gl_FragColor = vec4( acc / ws, 1.0 );
  }`;

// Umgebungsverdeckung (halbe Auflösung): Alchemy/SAO-Art aus der Tiefe, Normale aus Nachbartiefen
const AO_FS = `
  uniform sampler2D tDepth; uniform mat4 uInvProj; uniform vec2 uTexel, uProj, uDepthSize; uniform float uRadius, uFadeFar;
  varying vec2 vUv;
  ${COMMON}
  // Tiefe und Position immer an derselben Texelmitte (Tiefe wird nicht gefiltert) – sonst Streifen auf flachem Boden
  vec3 kP( vec2 uv ) { vec2 s = ( floor( uv * uDepthSize ) + 0.5 ) / uDepthSize; return kView( uInvProj, s, texture2D( tDepth, s ).x ); }
  void main() {
    vec2 uv = ( floor( vUv * uDepthSize ) + 0.5 ) / uDepthSize;
    float d = texture2D( tDepth, uv ).x;
    if ( d >= 1.0 ) { gl_FragColor = vec4( 1.0 ); return; }
    vec3 P = kView( uInvProj, uv, d );
    float z = -P.z;
    if ( z > uFadeFar ) { gl_FragColor = vec4( 1.0 ); return; }
    vec2 t = 1.0 / uDepthSize;
    vec3 pr = kP( uv + vec2( t.x, 0.0 ) ), pl = kP( uv - vec2( t.x, 0.0 ) ), pu = kP( uv + vec2( 0.0, t.y ) ), pd = kP( uv - vec2( 0.0, t.y ) );
    vec3 dx = abs( pr.z - P.z ) < abs( P.z - pl.z ) ? pr - P : P - pl;
    vec3 dy = abs( pu.z - P.z ) < abs( P.z - pd.z ) ? pu - P : P - pd;
    vec3 N = normalize( cross( dx, dy ) );
    vec2 rUv = uRadius * uProj * 0.5 / z;              // Radius in UV (x, y)
    if ( rUv.y < uTexel.y ) { gl_FragColor = vec4( 1.0 ); return; }
    float ang = kIgn( gl_FragCoord.xy ) * 6.2831853, sum = 0.0, R2 = uRadius * uRadius;
    for ( int i = 0; i < TAPS; i++ ) {
      float a = ( float( i ) + 0.5 ) / float( TAPS );
      float th = ang + float( i ) * 2.3999632;
      vec3 S = kP( uv + vec2( cos( th ), sin( th ) ) * rUv * ( 0.15 + 0.85 * a ) );
      vec3 v = S - P; float vv = dot( v, v );
      sum += max( dot( v, N ) - 0.02 - 0.003 * z, 0.0 ) / ( vv + 0.02 ) * max( 0.0, 1.0 - vv / R2 );
    }
    float ao = max( 0.0, 1.0 - 1.6 * sum / float( TAPS ) );
    ao = mix( ao, 1.0, smoothstep( uFadeFar * 0.6, uFadeFar, z ) );
    gl_FragColor = vec4( ao, ao, ao, 1.0 );
  }`;

// Bloom: Schwelle + Verkleinern (Viertel-Auflösung), weiter verkleinern, additiv vergrößern (Dual-Filter)
const BLOOM_PRE_FS = `
  uniform sampler2D tColor, tDepth; uniform vec2 uTexel; uniform float uTh, uSky; varying vec2 vUv;
  ${COMMON}
  vec3 tap( vec2 uv ) {
    vec3 c = texture2D( tColor, uv ).rgb;
    float l = max( c.r, max( c.g, c.b ) );
    float w = smoothstep( uTh, min( uTh + 0.1, 1.0 ), l );
    return c * w * ( texture2D( tDepth, uv ).x >= 1.0 ? uSky : 1.0 );   // Himmel/Wolken nur schwach (Sonne: Flare)
  }
  void main() {
    vec2 t = uTexel;
    vec3 c = tap( vUv + vec2( -t.x, -t.y ) ) + tap( vUv + vec2( t.x, -t.y ) ) + tap( vUv + vec2( -t.x, t.y ) ) + tap( vUv + vec2( t.x, t.y ) );
    gl_FragColor = vec4( c * 0.25, 1.0 );
  }`;
const BLOOM_DOWN_FS = `
  uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
  void main() {
    vec2 t = uTexel;
    vec3 c = texture2D( tSrc, vUv ).rgb * 4.0 + texture2D( tSrc, vUv + vec2( -t.x, -t.y ) ).rgb + texture2D( tSrc, vUv + vec2( t.x, -t.y ) ).rgb
      + texture2D( tSrc, vUv + vec2( -t.x, t.y ) ).rgb + texture2D( tSrc, vUv + vec2( t.x, t.y ) ).rgb;
    gl_FragColor = vec4( c / 8.0, 1.0 );
  }`;
const BLOOM_UP_FS = `
  uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uK; varying vec2 vUv;
  void main() {
    vec2 t = uTexel;
    vec3 c = texture2D( tSrc, vUv + vec2( -2.0 * t.x, 0.0 ) ).rgb + texture2D( tSrc, vUv + vec2( 2.0 * t.x, 0.0 ) ).rgb
      + texture2D( tSrc, vUv + vec2( 0.0, -2.0 * t.y ) ).rgb + texture2D( tSrc, vUv + vec2( 0.0, 2.0 * t.y ) ).rgb
      + 2.0 * ( texture2D( tSrc, vUv + vec2( -t.x, -t.y ) ).rgb + texture2D( tSrc, vUv + vec2( t.x, -t.y ) ).rgb
      + texture2D( tSrc, vUv + vec2( -t.x, t.y ) ).rgb + texture2D( tSrc, vUv + vec2( t.x, t.y ) ).rgb );
    gl_FragColor = vec4( c / 12.0 * uK, 1.0 );
  }`;

// Sonnen-Sichtbarkeit: ein Pixel, 9 Tiefen-Abtastungen um die Sonne, zeitlich geglättet (Mischung mit dem Vorbild)
const SUNVIS_FS = `
  uniform sampler2D tDepth; uniform vec3 uSunScr; uniform vec2 uRes; uniform float uK;
  void main() {
    float vis = 0.0;
    for ( int i = 0; i < 9; i++ ) {
      vec2 o = vec2( float( i - ( i / 3 ) * 3 ) - 1.0, float( i / 3 ) - 1.0 ) * vec2( uRes.y / uRes.x, 1.0 ) * 0.012;
      vec2 q = uSunScr.xy + o;
      vis += ( q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0 && texture2D( tDepth, q ).x >= 1.0 ) ? 1.0 : 0.0;
    }
    gl_FragColor = vec4( vec3( vis / 9.0 * uSunScr.z ), uK );
  }`;

// Endbild
const COMP_FS = `
  uniform sampler2D tColor, tDepth, tAO, tBloom, tBlur, tSunVis, tDof, tTaa;
  uniform vec2 uSrcTexel, uRes, uAOTexel, uTaaTexel, uJitUv;
  uniform float uTime, uSharp, uAOStr, uBloomStr, uVig, uBlurOn, uDither;
  uniform mat4 uInvProj; uniform mat3 uCamRot; uniform vec3 uCamPos;
  uniform vec3 uSunDir, uSunCol, uHazeCol; uniform vec4 uAerial;
  uniform vec3 uSunScr; uniform float uFlare;
  uniform vec4 uHaze0, uHaze1; uniform vec2 uHazeR; uniform float uHazeK;
  uniform vec3 uWB, uLift, uGamma, uGain, uShTint, uHiTint; uniform float uSplit, uSat, uVib, uContrast, uGreen;
  uniform vec4 uFx; uniform vec3 uFlashCol;
  varying vec2 vUv;
  ${COMMON}
  ${BLUR_CORE}
  ${DOF_CORE}

  // kantenbewusstes Hochskalieren: bilinear aus der Renderskala, an Kanten entlang der Kante glätten (FXAA-Art,
  // 4 Diagonalen + 4 Richtungs-Abtastungen), sonst kontrastabhängig nachschärfen (CAS-Art, Halos begrenzt)
  // n31 TAA: Quelle ist die History in Bildschirmauflösung (schon geglättet + hochskaliert) → nur CAS
  #ifdef TAA
   #define K_SRC tTaa
   #define K_TEXEL uTaaTexel
  #else
   #define K_SRC tColor
   #define K_TEXEL uSrcTexel
  #endif
  vec3 kinoSR( vec2 uv ) {
    vec3 c = texture2D( K_SRC, uv ).rgb;
  #if defined( AA ) || defined( SHARP )
    vec2 t = K_TEXEL;
    vec3 nw = texture2D( K_SRC, uv + vec2( -t.x, t.y ) * 0.5 ).rgb, ne = texture2D( K_SRC, uv + vec2( t.x, t.y ) * 0.5 ).rgb;
    vec3 sw = texture2D( K_SRC, uv + vec2( -t.x, -t.y ) * 0.5 ).rgb, se = texture2D( K_SRC, uv + vec2( t.x, -t.y ) * 0.5 ).rgb;
    float lnw = kLuma( nw ), lne = kLuma( ne ), lsw = kLuma( sw ), lse = kLuma( se ), lc = kLuma( c );
    float lmin = min( lc, min( min( lnw, lne ), min( lsw, lse ) ) ), lmax = max( lc, max( max( lnw, lne ), max( lsw, lse ) ) );
    float range = lmax - lmin;
   #ifdef AA
    if ( range > max( 0.04, lmax * 0.1 ) ) {
      vec2 dir = vec2( -( ( lnw + lne ) - ( lsw + lse ) ), ( lnw + lsw ) - ( lne + lse ) );
      float red = max( ( lnw + lne + lsw + lse ) * 0.03125, 0.0078125 );
      dir = clamp( dir / ( min( abs( dir.x ), abs( dir.y ) ) + red ), -6.0, 6.0 ) * t;
      vec3 a = 0.5 * ( texture2D( tColor, uv + dir * ( 1.0 / 3.0 - 0.5 ) ).rgb + texture2D( tColor, uv + dir * ( 2.0 / 3.0 - 0.5 ) ).rgb );
      vec3 b = a * 0.5 + 0.25 * ( texture2D( tColor, uv - dir * 0.5 ).rgb + texture2D( tColor, uv + dir * 0.5 ).rgb );
      float lb = kLuma( b );
      return ( lb < lmin || lb > lmax ) ? a : b;
    }
   #endif
   #ifdef SHARP
    vec3 mn = min( c, min( min( nw, ne ), min( sw, se ) ) ), mx = max( c, max( max( nw, ne ), max( sw, se ) ) );
    vec3 amp = sqrt( clamp( min( mn, 1.0 - mx ) / max( mx, 1e-3 ), 0.0, 1.0 ) );   // CAS: wenig Spielraum → wenig schärfen
    vec3 avg = ( nw + ne + sw + se ) * 0.25;
    c = clamp( c + ( c - avg ) * amp * uSharp * 2.0, mn, mx );
   #endif
  #endif
    return c;
  }

  vec2 kHaze( vec4 seg, float r, vec2 uv ) {
    vec2 asp = vec2( uRes.x / uRes.y, 1.0 );
    vec2 pa = ( uv - seg.xy ) * asp, ba = ( seg.zw - seg.xy ) * asp;
    float h = clamp( dot( pa, ba ) / max( dot( ba, ba ), 1e-6 ), 0.0, 1.0 );
    float dd = length( pa - ba * h ) / ( r * ( 0.5 + 1.2 * h ) );
    float m = ( 1.0 - smoothstep( 0.2, 1.0, dd ) ) * smoothstep( 0.0, 0.2, h ) * ( 1.0 - 0.6 * h );
    vec2 q = uv * asp * uRes.y / ( r * 900.0 + 1.0 );
    return m * vec2( sin( q.y * 0.9 - uTime * 19.0 ) + 0.5 * sin( q.x * 1.7 + uTime * 13.0 ), cos( q.x * 0.8 - uTime * 23.0 ) + 0.5 * sin( q.y * 1.3 - uTime * 11.0 ) );
  }

  vec3 kGhost( vec2 uv, vec2 p, float rad, float warm ) {
    float r = length( ( uv - p ) * vec2( uRes.x / uRes.y, 1.0 ) ) / rad;
    if ( r >= 1.0 ) return vec3( 0.0 );
    float disc = ( 1.0 - smoothstep( 0.75, 1.0, r ) ) * ( 0.55 + 0.45 * smoothstep( 0.3, 0.95, r ) );
    return mix( vec3( 0.55, 0.75, 1.0 ), vec3( 1.0, 0.7, 0.45 ), warm ) * disc;
  }
  vec3 kFlare( vec2 uv ) {
    float vis = texture2D( tSunVis, vec2( 0.5 ) ).r;   // Sichtbarkeit aus dem 1-Pixel-Durchgang
    if ( vis <= 0.004 ) return vec3( 0.0 );
    vec2 asp = vec2( uRes.x / uRes.y, 1.0 );
    vec2 dv = ( uv - uSunScr.xy ) * asp;
    float d = length( dv );
    vec3 c = uSunCol * ( exp( -d * 8.0 ) * 0.035 + exp( -d * 32.0 ) * 0.26 );                // Glühen um die Sonne
    c += uSunCol * exp( -abs( dv.y ) * 140.0 ) * exp( -abs( dv.x ) * 4.0 ) * 0.05;        // flacher Streifen
    vec2 axis = vec2( 0.5 ) - uSunScr.xy;
    float edge = 1.0 - smoothstep( 0.35, 0.8, length( axis * asp ) );                         // Geister nur, wenn die Sonne nicht am Rand steht
    // Geister entlang der Achse Sonne → Bildmitte (dezent, leicht farbig); ausgeschrieben statt Schleife über ein Array
    // (dynamisch indizierte Arrays landen auf manchen GPUs im langsamen Speicher – gemessen ~3 ms bei 8 MP)
    if ( edge > 0.0 ) {
      c += kGhost( uv, uSunScr.xy + axis * 0.55, 0.035, 0.6 ) * 0.9 * 0.03 * edge;
      c += kGhost( uv, uSunScr.xy + axis * 1.25, 0.06, 0.45 ) * 0.8 * 0.03 * edge;
      c += kGhost( uv, uSunScr.xy + axis * 1.7, 0.028, 0.9 ) * 0.55 * 0.03 * edge;
      c += kGhost( uv, uSunScr.xy + axis * 2.2, 0.1, 0.5 ) * 0.35 * 0.03 * edge;
    }
    return c * vis * uFlare;
  }

  vec3 kGrade( vec3 c ) {
    c *= uWB;
    float l = kLuma( c );
    c += ( uShTint * ( 1.0 - smoothstep( 0.0, 0.45, l ) ) + uHiTint * smoothstep( 0.45, 1.0, l ) ) * uSplit;
    c = pow( max( c * uGain + uLift, 0.0 ), uGamma );
    l = kLuma( c );
    float s = max( c.r, max( c.g, c.b ) ) - min( c.r, min( c.g, c.b ) );
    c = mix( vec3( l ), c, uSat + uVib * ( 1.0 - smoothstep( 0.0, 0.6, s ) ) );
    // Grün-Bremse: knallige Wiese wie im Film etwas entsättigt und dunkler (Gras ist in Fotos oliv, nicht neon)
    float gd = smoothstep( 0.02, 0.18, c.g - max( c.r, c.b ) ) * uGreen;
    c = mix( c, mix( vec3( l ), c, 0.8 ) * vec3( 0.93, 0.9, 0.86 ) + vec3( 0.01, 0.007, 0.0 ), gd );
    c = clamp( c, 0.0, 1.0 );
    return mix( c, c * c * ( 3.0 - 2.0 * c ), uContrast );
  }

  void main() {
    vec2 uv = vUv;
    float d = texture2D( tDepth, uv + uJitUv ).x;   // n31: mit TAA die unverschobene Tiefe (Dunst/Masken flimmern sonst an Kanten)
    float car = 0.0;
  #if defined( BLUR_FULL ) || defined( HAZE ) || defined( DOF )
    car = kCarMask( uv, d );
  #endif
  #ifdef HAZE
    if ( uHazeK > 0.0 && car < 0.5 ) {
      vec2 o = kHaze( uHaze0, uHazeR.x, uv ) + kHaze( uHaze1, uHazeR.y, uv );
      if ( dot( o, o ) > 0.0 ) { vec2 q = uv + o * uHazeK * uSrcTexel * 2.2; if ( kCarMask( q, texture2D( tDepth, q ).x ) < 0.5 ) uv = q; }
    }
  #endif
    vec3 col = kinoSR( uv );
  #ifdef WHIP
    // Reißschwenk (n27, Kino-Replay): Bewegungsunschärfe entlang der Schwenkrichtung, 12 Abtastungen
    { vec2 wd = vec2( cos( uFx.w ), sin( uFx.w ) * uRes.x / uRes.y ) * uFx.z; vec3 a = vec3( 0.0 );
      for ( int i = 0; i < 12; i++ ) a += texture2D( tColor, uv + wd * ( float( i ) / 11.0 - 0.5 ) ).rgb;
      col = mix( col, a / 12.0, smoothstep( 0.0, 0.01, uFx.z ) ); }
  #endif
  #ifdef BLUR_FULL
    if ( uBlurOn > 0.5 ) { vec4 b = kBlur( tColor, tDepth, uv, d, car, uRes ); col = mix( col, b.rgb, b.a ); }
  #endif
  #ifdef BLUR_HALF
    if ( uBlurOn > 0.5 ) { vec4 b = texture2D( tBlur, vUv ); col = mix( col, b.rgb, b.a ); }
  #endif
  #ifdef DOF
    { float cf = ( d >= 1.0 ? uDofK : kCoc( kLinZ( d ) ) ) * ( 1.0 - car ); if ( cf > 0.01 ) col = mix( col, texture2D( tDof, vUv ).rgb, smoothstep( 0.0, 0.3, cf ) ); }
  #endif
  #ifdef AO
    {
      vec2 t = uAOTexel;
      float ao = 0.25 * ( texture2D( tAO, vUv + vec2( -t.x, -t.y ) ).r + texture2D( tAO, vUv + vec2( t.x, -t.y ) ).r
        + texture2D( tAO, vUv + vec2( -t.x, t.y ) ).r + texture2D( tAO, vUv + vec2( t.x, t.y ) ).r );
      col *= mix( 1.0, ao, uAOStr * ( 1.0 - 0.45 * kLuma( col ) ) );
     #ifdef DEBUG_AO
      gl_FragColor = vec4( vec3( ao ), 1.0 ); return;
     #endif
    }
  #endif
  #ifdef AERIAL
    if ( d < 1.0 ) {
      vec3 vp = kView( uInvProj, vUv, d );
      float dist = length( vp );
      vec3 wd = uCamRot * ( vp / dist );
      float h = uCamPos.y + wd.y * dist * 0.5 - uAerial.z;                       // mittlere Höhe des Blickstrahls
      float dens = uAerial.x * exp( -max( h, 0.0 ) * uAerial.y );
      float f = ( 1.0 - exp( -dist * dens ) ) * uAerial.w;
      float sa = pow( max( dot( wd, uSunDir ), 0.0 ), 5.0 );
      col = mix( col, mix( uHazeCol, uSunCol * 0.95, sa * 0.55 ), f );
    }
  #endif
  #ifdef BLOOM
    { vec3 b = texture2D( tBloom, vUv ).rgb * uBloomStr; col = 1.0 - ( 1.0 - col ) * ( 1.0 - min( b, 1.0 ) ); }
  #endif
  #ifdef FLARE
    col += kFlare( vUv );
  #endif
    // Lichtblitz (n27, Feuerwerk der Zielshow): helle Stellen stärker, getönt
    col += uFlashCol * uFx.x * ( 0.3 + 0.7 * kLuma( col ) );
  #ifdef GRADE
    col = kGrade( col );
  #endif
  #ifdef VIGNETTE
    { vec2 c = vUv - 0.5; col *= 1.0 - uVig * smoothstep( 0.3, 0.85, length( c * vec2( 1.0, uRes.y / uRes.x ) * 1.25 ) ); }
  #endif
  #ifdef DITHER
    col += ( kIgn( gl_FragCoord.xy + fract( uTime * 7.31 ) * 61.0 ) - 0.5 ) / 255.0;
  #endif
    col = mix( col, vec3( 1.0 ), uFx.y );   // Weißblitz-Übergang (Kino-Replay)
    gl_FragColor = vec4( col, 1.0 );
  }`;

function rtOpts(extra = {}) {
  return { depthBuffer: false, stencilBuffer: false, type: THREE.UnsignedByteType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, ...extra };
}

export class KinoLook {
  constructor(renderer, opts = {}) {
    this.r = renderer;
    this.supported = !!renderer.capabilities.isWebGL2;
    this.grade = opts.grade || 'mittag';
    this.overrides = {};
    for (const s of String(opts.stages || '').split(',').map((x) => x.trim()).filter(Boolean)) {
      const on = s[0] !== '-', k = s.replace(/^[-+]/, '');
      if (STAGES.includes(k)) this.overrides[k] = on;
    }
    this.aerial = { density: 0.0003, falloff: 0.012, base: 0, max: 0.34, ...(opts.aerial || {}) };
    this.hazeCol = new THREE.Color(opts.hazeColor || 0xa9bbd0);
    this.sunCol = new THREE.Color(opts.sunColor || 0xfff0d8);
    // Bewegungsunschärfe-Zustand (Schnittstelle wie bisher post.js: setting, tier, autoOff, active, k, stats, prev, samples)
    this.setting = 'light'; this.tier = 1; this.autoOff = false; this.active = false; this.k = 0;
    this.stats = { frames: 0, last: null, drawn: 0 };
    this.prev = { ok: false, pos: new THREE.Vector3(), q: new THREE.Quaternion(), proj: new THREE.Matrix4() };
    this.samples = null;           // MSAA-Abtastungen erzwingen (Tests); sonst Preset
    this.dtS = 1 / 60;
    this.renderScale = 1; this.scaleRange = [1, 1, 1];
    // n31 TAAU: opts.taa = { gewicht, muster, gamma, dis } (URL ?taaw= ?jit= ?taagamma= ?taadis=); an über Stufe `taa`.
    // taaRueckfall setzt der Autopilot (true = FXAA-Art statt TAA); taau wird erst angelegt, wenn die Stufe gewünscht ist
    this.taaOpts = opts.taa || {}; this.taau = null; this.taaRueckfall = false; this.taaLetzt = 'aus';
    this.level = -1;
    this.setLevel(opts.level ?? 1);
    // Vollbild-Dreieck
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(g, null);
    this.quad.frustumCulled = false;
    this.fsScene = new THREE.Scene(); this.fsScene.add(this.quad);
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const V2 = () => ({ value: new THREE.Vector2() }), V3 = (x = 0, y = 0, z = 0) => ({ value: new THREE.Vector3(x, y, z) }), F = (v = 0) => ({ value: v });
    const M4 = () => ({ value: new THREE.Matrix4() });
    // gemeinsame Uniforms aller Durchgänge
    this.u = {
      tColor: { value: null }, tDepth: { value: null }, tSunVis: { value: null }, tAO: { value: null }, tBloom: { value: null }, tBlur: { value: null }, tSrc: { value: null }, tDof: { value: null }, tTaa: { value: null }, uTaaTexel: V2(), uJitUv: V2(),
      uDofF: F(10), uDofR: F(0.012), uDofNear: F(0.6), uDofFar: F(1.5), uDofK: F(0),
      uSrcTexel: V2(), uRes: V2(), uAOTexel: V2(), uTexel: V2(), uProj: V2(), uDepthSize: V2(),
      uTime: F(), uSharp: F(0.3), uAOStr: F(0.6), uBloomStr: F(0.4), uVig: F(0.2), uBlurOn: F(0), uDither: F(1),
      uInvProj: M4(), uCamRot: { value: new THREE.Matrix3() }, uCamPos: V3(),
      uSunDir: V3(0, 1, 0), uSunCol: { value: new THREE.Vector3() }, uHazeCol: { value: new THREE.Vector3() }, uAerial: { value: new THREE.Vector4() },
      uSunScr: V3(), uFlare: F(1),
      uHaze0: { value: new THREE.Vector4() }, uHaze1: { value: new THREE.Vector4() }, uHazeR: V2(), uHazeK: F(0),
      uWB: V3(1, 1, 1), uLift: V3(), uGamma: V3(1, 1, 1), uGain: V3(1, 1, 1), uShTint: V3(), uHiTint: V3(), uSplit: F(0), uSat: F(1), uVib: F(0), uContrast: F(0),
      uReproj: M4(), uInvVP: M4(), uCarInv: M4(),
      uBoxMin: V3(-1.1, -0.6, -2.5), uBoxMax: V3(1.1, 1.4, 2.5),
      uCarOn: F(0), uScale: F(0), uMaxLen: F(0.03), uRadial: F(0), uNear: F(0.25), uFar: F(8000),
      uRadius: F(1), uFadeFar: F(160), uTh: F(0.8), uSky: F(0.08), uK: F(1), uGreen: F(0),
      uFx: { value: new THREE.Vector4() }, uFlashCol: V3(1, 0.9, 0.7),
    };
    this.mats = new Map();
    this.rt = null; this.aoRT = null; this.blurRT = null; this.bloomRT = []; this.dofRT = null;
    this.sunRT = new THREE.WebGLRenderTarget(1, 1, rtOpts({ minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }));
    this._sz = new THREE.Vector2(); this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._m = new THREE.Matrix4(); this._m2 = new THREE.Matrix4();
    this._q = new THREE.Quaternion(); this._one = new THREE.Vector3(1, 1, 1);
    this.t0 = performance.now();
  }

  // ---------- Einstellungen ----------
  setLevel(level) {
    level = Math.max(0, Math.min(2, Math.round(+level || 0)));
    if (level === this.level) return;
    this.level = level;
    this.preset = PRESETS[level];
    this.stages = {};
    for (const k of STAGES) this.stages[k] = k in this.overrides ? this.overrides[k] : !!(this.preset.stages && this.preset.stages[k]);
    this.scaleRange = this.scaleRangeOf(level);
    this.renderScale = this.stages.scale ? this.scaleRange[0] : 1;
  }
  // ---------- n31: TAAU ----------
  // Stufe `taa` für eine Grafikstufe gewünscht? (URL-Überschreibung vor Preset)
  taaGewuenscht(level = this.level) {
    const P = PRESETS[level];
    if (!this.supported || !P || !P.pipeline) return false;
    return 'taa' in this.overrides ? this.overrides.taa : !!(P.stages && P.stages.taa);
  }
  // Technik da? (WebGL2 + HalfFloat-Ziel) – legt TAAU beim ersten Wunsch an
  taaTechnik() {
    if (!this.taau && this.supported) this.taau = new TAAU(this.r, this.taaOpts);
    return !!(this.taau && this.taau.technik);
  }
  // 'taa' | 'fxaa' | 'aus' für das aktuelle Bild (reine Entscheidung: kern/taau_mathe.js taaModus)
  taaModus() {
    const g = this.pipeline && !!this.stages.taa;
    return taaModus({ gewuenscht: g, technik: g ? this.taaTechnik() : true, pipeline: this.pipeline, rueckfall: this.taaRueckfall,
      skala: this.stages.scale ? this.renderScale : 1, min: TAA_SKALA_MIN });
  }
  get pipeline() { return this.supported && !!this.preset.pipeline; }
  // Bewegungsunschärfe wirksam? (Stufe ≥ 1, Einstellung, nicht von der Automatik abgeschaltet)
  enabled() { return this.supported && this.tier > 0 && this.pipeline && this.stages.blur && this.setting !== 'off' && !this.autoOff && !!BLUR_LEVELS[this.setting]; }
  // dynamische Auflösung: true, wenn sich etwas geändert hat
  adapt(fps) {
    if (!this.pipeline || !this.stages.scale) return false;
    const [, lo, hi] = this.scaleRange, s0 = this.renderScale;
    if (fps < 52) this.renderScale = Math.max(lo, this.renderScale - 0.08);
    else if (fps > 58.5) this.renderScale = Math.min(hi, this.renderScale + 0.04);
    return this.renderScale !== s0;
  }
  // Renderskala [Start, Min, Max] einer Stufe (n30: Qualitäts-Autopilot setzt die Skala selbst)
  // n31: mit Stufe `taa` der TAAU-Bereich (z. B. Kino 0,7 / 0,6 / 1 statt 1 / 0,7 / 1 mit MSAA 4)
  scaleRangeOf(level) {
    const P = PRESETS[level];
    if (P && P.taaScale && this.taaGewuenscht(level) && this.taaTechnik()) return P.taaScale;
    return (P && P.scale) || [1, 1, 1];
  }
  describe() {
    return { level: this.level, name: this.preset.name, pipeline: this.pipeline, scale: +this.renderScale.toFixed(3), msaa: this.msaa(), stages: Object.keys(this.stages).filter((k) => this.stages[k]), grade: this.grade,
      size: this.rt ? [this.rt.width, this.rt.height] : null,
      taa: { modus: this.taaModus(), rueckfall: this.taaRueckfall, ...(this.taau ? this.taau.describe() : {}) } };
  }
  // n31: mit TAA bzw. deren Rückfall kein MSAA (TAA braucht ein einzelnes Abtastmuster je Pixel; Rückfall = FXAA-Art)
  msaa() { return this.samples != null ? this.samples : this.taaModus() !== 'aus' ? 0 : (this.preset.msaa || 0); }
  setCarBox(box) {
    this.u.uBoxMin.value.copy(box.min).addScalar(-0.04); this.u.uBoxMin.value.y = box.min.y + 0.12;
    this.u.uBoxMax.value.copy(box.max).addScalar(0.06);
    // n31 TAA: Auto-Box für die eigene Reprojektion – fast bis zum Boden (Reifen unten), Fahrbahn darunter bleibt Welt.
    // TODO Heavy-Job: Unterkante am Bild prüfen (Schlieren an den Reifen ↔ Fahrbahn unter dem Auto wandert mit)
    this.taaBox = { min: box.min.clone().addScalar(-0.04), max: box.max.clone().addScalar(0.06) };
    this.taaBox.min.y = box.min.y + 0.03;
  }
  reset() { this.prev.ok = false; if (this.taau) this.taau.reset(); }

  mat(kind, defines, fs, extra = {}) {
    const key = kind + JSON.stringify(defines);
    if (!this.mats.has(key)) this.mats.set(key, new THREE.ShaderMaterial({ uniforms: this.u, defines, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, ...extra }));
    return this.mats.get(key);
  }
  pass(material, target, clear = true) {
    this.quad.material = material;
    const ac = this.r.autoClear;
    this.r.autoClear = clear;
    this.r.setRenderTarget(target);
    this.r.render(this.fsScene, this.fsCam);
    this.r.autoClear = ac;
  }

  ensureTargets(w, h, sw, sh) {
    const S = this.msaa();
    if (!this.rt || this.rt.width !== sw || this.rt.height !== sh || this.rt.samples !== S) {
      if (this.rt) { this.rt.depthTexture.dispose(); this.rt.dispose(); }
      const dt = new THREE.DepthTexture(sw, sh);
      dt.type = THREE.UnsignedIntType;
      this.rt = new THREE.WebGLRenderTarget(sw, sh, { samples: S, depthTexture: dt, depthBuffer: true, stencilBuffer: false, type: THREE.UnsignedByteType });
      // Tonemapping + sRGB wie beim direkten Zeichnen (three.js wendet beides sonst nur auf dem Bildschirm an);
      // Speicher bleibt lineares RGBA8 (keine Dekodierung beim Lesen) → Anzeige-Werte, Handy-Bandbreite wie bisher
      this.rt.isXRRenderTarget = true;
      this.rt.texture.colorSpace = THREE.SRGBColorSpace;
      this.rt.texture.internalFormat = 'RGBA8';
      this.rt.texture.generateMipmaps = false;
      this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter;
    }
    const need = (rt, W, H) => !rt || rt.width !== W || rt.height !== H;
    const hw = Math.max(1, Math.round(sw / 2)), hh = Math.max(1, Math.round(sh / 2));
    if (this.stages.ssao && need(this.aoRT, hw, hh)) { if (this.aoRT) this.aoRT.dispose(); this.aoRT = new THREE.WebGLRenderTarget(hw, hh, rtOpts()); }
    if (this.blurNeedsHalf() && need(this.blurRT, hw, hh)) { if (this.blurRT) this.blurRT.dispose(); this.blurRT = new THREE.WebGLRenderTarget(hw, hh, rtOpts()); }
    if (this.wantDof && need(this.dofRT, hw, hh)) { if (this.dofRT) this.dofRT.dispose(); this.dofRT = new THREE.WebGLRenderTarget(hw, hh, rtOpts()); }
    if (this.stages.bloom) {
      const L = this.preset.bloom ? this.preset.bloom.levels : 3;
      for (let i = 0; i < L; i++) {
        const bw = Math.max(1, Math.round(sw / (4 << i))), bh = Math.max(1, Math.round(sh / (4 << i)));
        if (need(this.bloomRT[i], bw, bh)) { if (this.bloomRT[i]) this.bloomRT[i].dispose(); this.bloomRT[i] = new THREE.WebGLRenderTarget(bw, bh, rtOpts()); }
      }
      for (let i = L; i < this.bloomRT.length; i++) { if (this.bloomRT[i]) this.bloomRT[i].dispose(); }
      this.bloomRT.length = L;
    }
  }
  blurNeedsHalf() { return this.stages.blur && this.preset.blurHalf; }

  // Bewegungsunschärfe: Stärke und Matrizen setzen; gibt k (0 = nichts zu tun) zurück
  blurSetup(camera, o, w, h) {
    const P = this.prev, L = BLUR_LEVELS[this.setting] || BLUR_LEVELS.off, q = camera.quaternion, pos = camera.position;
    const cut = o.cut || !P.ok || P.pos.distanceTo(pos) > Math.max(6, (o.speed || 0) * 0.25 + 3) || P.q.angleTo(q) > 0.5;
    this.dtS += (Math.min(0.1, Math.max(1 / 240, o.dt || 1 / 60)) - this.dtS) * 0.25;
    const ks = Math.min(1, Math.max(0, ((o.speed || 0) - BLUR_V0) / (BLUR_V1 - BLUR_V0)));
    const k = this.enabled() && o.run ? ks * ks * (3 - 2 * ks) * (1 + 0.6 * (o.boost || 0)) : 0;
    this.k = k;
    const U = this.u;
    if (!(k > 0.004 && !cut)) return 0;
    this._q.copy(P.q).slerp(q, 1 - ROT_KEEP);
    this._m2.compose(P.pos, this._q, this._one).invert();
    const prevVP = this._m2.premultiply(P.proj);
    U.uReproj.value.multiplyMatrices(prevVP, U.uInvVP.value);
    U.uScale.value = Math.min(4, L.shutter * k / this.dtS * (o.shutter || 1));
    U.uMaxLen.value = L.max * Math.min(1.3, k);
    U.uRadial.value = 0.08 * (o.boost || 0) * Math.min(1.5, L.shutter / (1 / 170));
    return k;
  }

  // Ein Bild zeichnen. o = { dt, sunDir (Welt, normiert), run, speed (m/s), boost 0…1, car (Object3D), ghost (Object3D,
  //   durchsichtig – n31 TAA), cut (Kameraschnitt),
  //   heat: [{ a: Vector3, b: Vector3, r (m), k 0…1 }] (Hitzeflimmern, Strecke a→b in Welt), overlay: (renderer) => void }
  render(scene, camera, o = {}) {
    const r = this.r;
    camera.updateMatrixWorld();
    if (!this.pipeline) {
      this.active = false; this.k = 0;
      if (this.taau) this.taau.reset();
      r.setRenderTarget(null); r.render(scene, camera);
      if (o.overlay) o.overlay(r);
      this.savePrev(camera);
      return true;
    }
    const U = this.u, st = this.stages;
    r.getDrawingBufferSize(this._sz);
    const w = this._sz.x, h = this._sz.y;
    const sc = st.scale ? this.renderScale : 1;
    const sw = Math.max(1, Math.round(w * sc)), sh = Math.max(1, Math.round(h * sc));
    // n31 TAAU: Modus dieses Bilds; Schnitt (Kamerasprung wie bei der Unschärfe, Wechsel aus/an) → History neu
    const taa = this.taaModus();
    let taaSchnitt = false;
    if (taa === 'taa') {
      const P0 = this.prev;
      taaSchnitt = !!o.cut || this.taaLetzt !== 'taa' || !P0.ok || P0.pos.distanceTo(camera.position) > Math.max(6, (o.speed || 0) * 0.25 + 3) || P0.q.angleTo(camera.quaternion) > 0.5;
    } else if (this.taau) this.taau.reset();
    this.taaLetzt = taa;
    this.ensureTargets(w, h, sw, sh);
    U.uTime.value = o.time ?? (performance.now() - this.t0) / 1000;
    U.uRes.value.set(w, h); U.uSrcTexel.value.set(1 / sw, 1 / sh);
    U.uInvProj.value.copy(camera.projectionMatrixInverse);
    U.uCamRot.value.setFromMatrix4(camera.matrixWorld);
    U.uCamPos.value.copy(camera.position);
    // Auto-Maske (Unschärfe, Tiefenschärfe, Hitzeflimmern) und Tiefe → Abstand
    if (o.car && o.car.visible) { o.car.updateMatrixWorld(); U.uCarInv.value.copy(o.car.matrixWorld).invert(); U.uCarOn.value = 1; } else U.uCarOn.value = 0;
    U.uInvVP.value.copy(this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)).invert();
    U.uNear.value = camera.near; U.uFar.value = camera.far;
    const k = st.blur ? this.blurSetup(camera, o, w, h) : (this.k = 0);
    // Tiefenschärfe nur auf Wunsch (Kino-Replay), Ziele erst beim ersten Mal anlegen
    const dof = st.dof && o.dof && o.dof.k > 0.01 ? o.dof : null;
    if (dof && !this.wantDof) { this.wantDof = true; this.ensureTargets(w, h, sw, sh); }
    // 1. Szene (mit TAA: Projektion um den Halton-Versatz dieses Bilds verschoben, nur für diesen Durchlauf)
    if (taa === 'taa') this.taau.jitterAn(camera, sw, sh, sc);
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    if (taa === 'taa') this.taau.jitterAus(camera);
    U.tColor.value = this.rt.texture; U.tDepth.value = this.rt.depthTexture;
    // 1b. TAAU-Resolve (EIN Vollbild-Durchgang in Bildschirmauflösung) – Auto als Körper mit eigener Bewegung, Geist durchsichtig
    if (taa === 'taa') {
      const T = this.taau, box = this.taaBox || { min: U.uBoxMin.value, max: U.uBoxMax.value };
      T.koerper(0, o.car && o.car.visible ? o.car : null, box, 'fest');
      T.koerper(1, o.ghost && o.ghost.visible ? o.ghost : null, box, 'durchsichtig');
      U.tTaa.value = T.resolve(r, { farbe: this.rt.texture, tiefe: this.rt.depthTexture, sw, sh, w, h, camera, schnitt: taaSchnitt });
      U.uTaaTexel.value.set(1 / w, 1 / h); U.uJitUv.value.copy(T.uJit);
    } else U.uJitUv.value.set(0, 0);
    // 2. Umgebungsverdeckung
    const P = this.preset;
    if (st.ssao) {
      const A = P.ao || PRESETS[2].ao;
      U.uTexel.value.set(2 / sw, 2 / sh); U.uDepthSize.value.set(sw, sh);
      U.uProj.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
      U.uRadius.value = A.radius; U.uAOStr.value = A.strength;
      this.pass(this.mat('ao', { TAPS: A.taps }, AO_FS), this.aoRT);
      U.tAO.value = this.aoRT.texture;
      U.uAOTexel.value.set(1 / this.aoRT.width, 1 / this.aoRT.height);
    }
    // 3. Bloom
    if (st.bloom) {
      const B = P.bloom || PRESETS[1].bloom, L = this.bloomRT.length;
      U.uTh.value = B.threshold; U.uBloomStr.value = B.strength * (1 + 2.2 * (o.flash ? o.flash.k : 0));
      U.uTexel.value.set(1 / sw, 1 / sh);
      this.pass(this.mat('bpre', {}, BLOOM_PRE_FS), this.bloomRT[0]);
      for (let i = 1; i < L; i++) {
        const s = this.bloomRT[i - 1]; U.tSrc.value = s.texture; U.uTexel.value.set(1 / s.width, 1 / s.height);
        this.pass(this.mat('bdown', {}, BLOOM_DOWN_FS), this.bloomRT[i]);
      }
      const up = this.mat('bup', {}, BLOOM_UP_FS, { blending: THREE.AdditiveBlending, transparent: true });
      for (let i = L - 1; i > 0; i--) {
        const s = this.bloomRT[i]; U.tSrc.value = s.texture; U.uTexel.value.set(0.5 / s.width, 0.5 / s.height); U.uK.value = 1;
        this.pass(up, this.bloomRT[i - 1], false);
      }
      U.tBloom.value = this.bloomRT[0].texture;
    }
    // 4b. Tiefenschärfe (halbe Auflösung)
    if (dof) {
      U.uDofF.value = Math.max(1, dof.focus); U.uDofK.value = Math.min(1, dof.k); U.uDofR.value = dof.r ?? 0.012;
      U.uDofNear.value = dof.near ?? 0.6; U.uDofFar.value = dof.far ?? 1.5;
      U.uRes.value.set(w, h);
      this.pass(this.mat('dof', { TAPS: 1 }, DOF_FS), this.dofRT);
      U.tDof.value = this.dofRT.texture;
    }
    // 4. Bewegungsunschärfe
    const L = BLUR_LEVELS[this.setting] || BLUR_LEVELS.off;
    const taps = (BLUR_TAPS[P.blurHalf ? 1 : 2] || BLUR_TAPS[1])[this.setting] || 5;
    U.uBlurOn.value = k > 0 ? 1 : 0;
    if (k > 0 && this.blurNeedsHalf()) {
      U.uRes.value.set(w, h);
      this.pass(this.mat('blurh', { TAPS: taps }, BLUR_HALF_FS), this.blurRT);
      U.tBlur.value = this.blurRT.texture;
    }
    // 5. Endbild
    U.uSharp.value = taa === 'taa' ? (P.taaSharpen ?? 0.4) : (P.sharpen || 0.3);
    U.uVig.value = (st.vignette ? 0.2 : 0) + (k > 0 ? 0.22 * Math.min(1, k) : 0);
    const sun = o.sunDir;
    if (sun) U.uSunDir.value.copy(sun);
    U.uSunCol.value.set(this.sunCol.r, this.sunCol.g, this.sunCol.b);
    U.uHazeCol.value.set(this.hazeCol.r, this.hazeCol.g, this.hazeCol.b);
    const A = this.aerial; U.uAerial.value.set(A.density, A.falloff, A.base, A.max);
    if (st.flare && sun) {
      this._v.copy(camera.position).addScaledVector(sun, camera.far * 0.5).project(camera);
      const front = this._v2.copy(sun).applyQuaternion(this._q.copy(camera.quaternion).invert()).z < 0;
      U.uSunScr.value.set(this._v.x * 0.5 + 0.5, this._v.y * 0.5 + 0.5, front && Math.abs(this._v.x) < 1.6 && Math.abs(this._v.y) < 1.6 ? 1 : 0);
      U.uFlare.value = (this.level >= 2 ? 1 : 0.8) * (o.flareK || 1);   // n27: im Kino-Replay kräftigere Blendung
      // Sichtbarkeit: weich überblenden (Bäume/Pfeiler vor der Sonne flackern sonst), nach Schnitten sofort
      U.uK.value = o.cut ? 1 : Math.min(1, (o.dt || 1 / 60) * 12);
      this.pass(this.mat('sunvis', {}, SUNVIS_FS, { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, transparent: true }), this.sunRT, false);
      U.tSunVis.value = this.sunRT.texture;
    } else U.uSunScr.value.z = 0;
    let haze = false;
    if (st.haze && o.heat && o.heat.length) {
      haze = this.hazeSetup(camera, o.heat);
    }
    if (st.grade) this.applyGrade();
    // n27: Lichtblitz (Feuerwerk), Weißblitz-Übergang, Reißschwenk (o.whip = { len Anteil der Bildbreite, ang rad })
    U.uFx.value.set(o.flash ? o.flash.k : 0, o.white || 0, o.whip ? o.whip.len : 0, o.whip ? o.whip.ang : 0);
    if (o.flash && o.flash.col) U.uFlashCol.value.fromArray(o.flash.col);
    const defs = {};
    if (o.whip && o.whip.len > 0.002) defs.WHIP = 1;
    if (taa === 'taa') defs.TAA = 1;                                       // n31: History statt Renderskala, nur CAS
    else if (taa === 'fxaa' || st.aa && sc < 0.999 || st.aa && this.msaa() === 0) defs.AA = 1;   // Rückfall: FXAA-Art
    if (st.sharpen) defs.SHARP = 1;
    if (st.ssao) defs.AO = 1;
    if (st.bloom) defs.BLOOM = 1;
    if (st.flare && sun) defs.FLARE = 1;
    if (st.aerial) defs.AERIAL = 1;
    if (st.grade) defs.GRADE = 1;
    if (st.vignette || k > 0) defs.VIGNETTE = 1;
    if (st.dither) defs.DITHER = 1;
    if (haze) defs.HAZE = 1;
    if (dof) defs.DOF = 1;
    if (k > 0) { if (this.blurNeedsHalf()) defs.BLUR_HALF = 1; else { defs.BLUR_FULL = 1; defs.TAPS = taps; } }
    if (this.debug === 'ao' && st.ssao) defs.DEBUG_AO = 1;
    if (!defs.TAPS) defs.TAPS = 1;
    this.pass(this.mat('comp', defs, COMP_FS), null);
    if (o.overlay) o.overlay(r);
    this.active = k > 0;
    if (this.active) {
      this.stats.frames++;
      this.stats.last = { k: +k.toFixed(3), scale: +U.uScale.value.toFixed(3), max: +U.uMaxLen.value.toFixed(4), taps, half: !!defs.BLUR_HALF };
    }
    this.stats.drawn++;
    this.savePrev(camera);
    return true;
  }
  savePrev(camera) { const P = this.prev; P.pos.copy(camera.position); P.q.copy(camera.quaternion); P.proj.copy(camera.projectionMatrix); P.ok = true; }

  hazeSetup(camera, heat) {
    const U = this.u; let any = false;
    const segs = [U.uHaze0.value, U.uHaze1.value], rr = [0, 0];
    let kk = 0;
    for (let i = 0; i < 2; i++) {
      const H = heat[i];
      if (!H || !(H.k > 0.01)) { segs[i].set(-9, -9, -9, -9); continue; }
      this._v.copy(H.a).project(camera); this._v2.copy(H.b).project(camera);
      if (this._v.z > 1 || this._v2.z > 1 || this._v.z < -1) { segs[i].set(-9, -9, -9, -9); continue; }
      segs[i].set(this._v.x * 0.5 + 0.5, this._v.y * 0.5 + 0.5, this._v2.x * 0.5 + 0.5, this._v2.y * 0.5 + 0.5);
      // Radius in Bildhöhen: Weltradius / Entfernung · Brennweite
      const dist = Math.max(0.3, H.a.distanceTo(camera.position));
      rr[i] = H.r / dist * camera.projectionMatrix.elements[5] * 0.5;
      kk = Math.max(kk, H.k); any = true;
    }
    U.uHazeR.value.set(rr[0], rr[1]); U.uHazeK.value = kk;
    return any;
  }

  applyGrade() {
    const G = GRADES[this.grade] || GRADES.mittag, U = this.u;
    U.uWB.value.fromArray(G.wb); U.uLift.value.fromArray(G.lift); U.uGamma.value.fromArray(G.gamma); U.uGain.value.fromArray(G.gain);
    U.uShTint.value.fromArray(G.shadow); U.uHiTint.value.fromArray(G.high); U.uSplit.value = G.split;
    U.uSat.value = G.sat; U.uVib.value = G.vib; U.uContrast.value = G.contrast; U.uGreen.value = G.green || 0;
  }

  dispose() {
    for (const t of [this.rt, this.aoRT, this.blurRT, this.sunRT, this.dofRT, ...this.bloomRT]) if (t) { if (t.depthTexture) t.depthTexture.dispose(); t.dispose(); }
    this.rt = this.aoRT = this.blurRT = this.dofRT = null; this.bloomRT = [];
    if (this.taau) { this.taau.dispose(); this.taau = null; }
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }
}

// Kontaktschatten (weicher, dunkler Fleck unter einem Fahrzeug/einer Figur) – ein Quad mit erzeugter Textur, liegt in
// Objekt-Koordinaten auf der Aufstandsfläche; set(alpha) blendet aus (Sprung). Kostet 1 Draw-Call, keine Schattenkarte.
export function makeContactShadow({ width = 2.2, length = 4.8, y = 0, opacity = 0.62 } = {}) {
  const W = 64, H = 128, data = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = Math.abs((i + 0.5) / W * 2 - 1), z = Math.abs((j + 0.5) / H * 2 - 1);
    // abgerundetes Rechteck mit weichem Rand, dichterer Kern
    const qx = Math.max(x - 0.42, 0) / 0.58, qz = Math.max(z - 0.62, 0) / 0.38;
    const dd = Math.sqrt(qx * qx + qz * qz);
    const a = Math.max(0, 1 - dd) ** 1.6 * (0.65 + 0.35 * (1 - Math.min(1, Math.hypot(x * 0.9, z * 0.75))));
    const k = (j * W + i) * 4; data[k] = data[k + 1] = data[k + 2] = 0; data[k + 3] = Math.round(255 * Math.min(1, a));
  }
  const tex = new THREE.DataTexture(data, W, H);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0x000000, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, fog: false });
  const geo = new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y;
  mesh.name = 'contact-shadow';
  mesh.renderOrder = 1;
  mesh.userData.fx = true;
  mesh.userData.base = opacity;
  mesh.set = (alpha) => { mat.opacity = opacity * Math.max(0, Math.min(1, alpha)); mesh.visible = mat.opacity > 0.01; };
  return mesh;
}
