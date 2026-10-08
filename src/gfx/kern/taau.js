// Grafik-Kern (n31): TAAU – temporales Hochskalieren mit Kantenglättung auf WebGL2 („DLSS-Ersatz“), eigener Code.
// Die Szene wird je Bild mit einem Halton-Versatz (Jitter) in Renderskala gezeichnet; EIN Vollbild-Durchgang (Resolve) in
// Zielauflösung sammelt die Abtastungen über die Zeit in einer History (HalfFloat, Ping-Pong) – Kanten, Zäune, Gras werden
// ruhig, Renderskala 0,6–0,7 soll aussehen wie 1,0. Mathematik und CPU-Vorlage des Shaders: taau_mathe.js (Node-Test).
//
// Anschluss (ohne Kino-Look, z. B. Bandenkick/Schmetterlingswiese; im Kino-Look erledigt kinolook.js das):
//   const taau = new TAAU(renderer, { gewicht: 0.9, muster: 'auto' });       // taau.technik === false → nicht verwenden
//   taau.koerper(0, auto, box, 'fest');           // bewegte Objekte mit Tiefe (Box in Objekt-Koordinaten), je Bild
//   taau.koerper(1, geist, box, 'durchsichtig');  // durchsichtige bewegte Objekte (ohne Tiefe): History dort schwächer
//   je Bild:  taau.jitterAn(camera, sw, sh, skala); renderer.render(scene, camera) → rt (Farbe + DepthTexture, KEIN MSAA);
//             taau.jitterAus(camera);
//             const tex = taau.resolve(renderer, { farbe: rt.texture, tiefe: rt.depthTexture, sw, sh, w, h, camera, schnitt });
//             tex = Endbild in w × h (rgb), danach nachschärfen (CAS) und anzeigen.
//   Kameraschnitt/Teleport: schnitt = true (History wird neu angesetzt). taau.uJit (uv) = Jitter dieses Bilds für andere
//   Durchgänge, die die verschobene Tiefe lesen (Dunst, Tiefenschärfe), damit sie nicht mitflimmern.
//
// Was das Spiel liefern muss: Farbe (Anzeige-Werte, 8 bit reicht) + Tiefe als Textur (perspektivisch, nicht logarithmisch),
// die Kamera unverändert zwischen jitterAn/jitterAus (kein updateProjectionMatrix dazwischen), Boxen der bewegten Objekte.
// Was es nicht kann: Partikel, Rauch, Zuschauer-Karten u. ä. ohne Tiefe/Bewegungsdaten werden nur über den Nachbarschafts-
// Clip vor Schlieren geschützt (Randsaum 2–3 px im ersten Bild, siehe test_taau.mjs) – im Bild prüfen.
import * as THREE from 'three';
import { TAAU_STANDARD, jitterFolge, jitterAnzahl, jitterVersatz, jitterProjektion } from './taau_mathe.js';

const VS = `varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Resolve (Zielauflösung). Spiegelbild von taauReferenz() in taau_mathe.js – Änderungen an beiden Stellen nachziehen.
const RESOLVE_FS = `
  uniform sampler2D tFarbe, tTiefe, tHist;
  uniform vec2 uSrcRes, uDstRes, uJit;
  uniform mat4 uInvVP, uPrevVP;
  uniform float uNear, uFar, uGewicht, uGamma, uSigTreffer, uDis, uAlphaMin, uHistOk, uOrtho, uDebug, uCub, uMot;
  uniform mat4 uKInv[ 2 ], uKDelta[ 2 ];
  uniform vec3 uKMin[ 2 ], uKMax[ 2 ];
  uniform vec2 uKArt[ 2 ];        // x: 0 aus, 1 fest (Tiefe, eigene Bewegung), 2 durchsichtig (Strahltest); y: reaktiv 0…1
  uniform vec3 uCamPos;
  varying vec2 vUv;

  vec3 kY( vec3 c ) { return vec3( 0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b ); }
  vec3 kRgb( vec3 y ) { float t = y.x - y.z; return vec3( t + y.y, y.x + y.z, t - y.y ); }
  float kLin( float d ) { return uOrtho > 0.5 ? uNear + d * ( uFar - uNear ) : uNear * uFar / ( uFar - d * ( uFar - uNear ) ); }
  vec3 kClip( vec3 h, vec3 mn, vec3 mx ) {
    vec3 c = 0.5 * ( mx + mn ), e = 0.5 * ( mx - mn ) + 1e-5, v = h - c;
    vec3 a = abs( v / e );
    float m = max( a.x, max( a.y, a.z ) );
    return m > 1.0 ? c + v / m : h;
  }
  // Disocclusion als Bereichstest (taau_mathe.js disoBereich): History-Tiefe gegen [zLo, zHi] der Nachbarschaft
  float kDis( float zH, float zLo, float zHi, float sA, float sB ) {
    if ( abs( zH ) <= 0.0 || ( sign( zH ) != sA && sign( zH ) != sB ) ) return 1.0;
    float z = abs( zH ), r = max( max( zLo - z, z - zHi ), 0.0 ) / max( 1e-4, z );
    return clamp( ( r - uDis ) / uDis, 0.0, 1.0 );
  }
  // liegt Weltpunkt w in einem festen Körper? → -1 (Körper i), sonst 1
  float kKoerper( vec4 w, out int ki ) {
    ki = -1;
    for ( int i = 0; i < 2; i++ ) if ( uKArt[ i ].x > 0.5 && uKArt[ i ].x < 1.5 ) {
      vec3 l = ( uKInv[ i ] * w ).xyz;
      if ( all( greaterThan( l, uKMin[ i ] ) ) && all( lessThan( l, uKMax[ i ] ) ) ) { ki = i; return -1.0; }
    }
    return 1.0;
  }
  // History bikubisch (Keys-Kubik mit Parameter a = uCub, 5 bilineare Abtastungen; a = -0,5 ist Catmull-Rom). Abnahme im
  // Browser: jedes Nachführen dämpft feine Details etwas, über die ~20 Bilder Lebensdauer der History bei Renderskala 0,65
  // summiert sich das zu sichtbarer Weichheit in Bewegung – ein schärferer Kern (a < -0,5) gleicht einen Teil aus, das
  // Überschwingen fängt der Varianz-Clip
  vec3 kHist( vec2 uv ) {
    vec2 sp = uv * uDstRes, tp = floor( sp - 0.5 ) + 0.5, f = sp - tp;
    float a = uCub;
    vec2 w0 = a * f * ( 1.0 - f ) * ( 1.0 - f ), w3 = a * f * f * ( 1.0 - f );
    vec2 w1 = 1.0 - ( a + 3.0 ) * f * f + ( a + 2.0 ) * f * f * f;
    vec2 w2 = 1.0 - w0 - w1 - w3;
    vec2 w12 = w1 + w2, t12 = ( tp + w2 / w12 ) / uDstRes, t0 = ( tp - 1.0 ) / uDstRes, t3 = ( tp + 2.0 ) / uDstRes;
    vec3 r = texture2D( tHist, vec2( t12.x, t0.y ) ).rgb * ( w12.x * w0.y ) + texture2D( tHist, vec2( t0.x, t12.y ) ).rgb * ( w0.x * w12.y )
      + texture2D( tHist, t12 ).rgb * ( w12.x * w12.y ) + texture2D( tHist, vec2( t3.x, t12.y ) ).rgb * ( w3.x * w12.y )
      + texture2D( tHist, vec2( t12.x, t3.y ) ).rgb * ( w12.x * w3.y );
    float s = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
    return max( r / s, 0.0 );
  }
  // Strahl Kamera → Weltpunkt schneidet die Box (Objekt-Koordinaten) vor dem Punkt? (durchsichtige Objekte ohne Tiefe)
  bool kStrahl( mat4 inv, vec3 mn, vec3 mx, vec3 w ) {
    vec3 o = ( inv * vec4( uCamPos, 1.0 ) ).xyz, d = ( inv * vec4( w, 1.0 ) ).xyz - o;
    vec3 id = 1.0 / ( d + vec3( 1e-6 ) ), t0 = ( mn - o ) * id, t1 = ( mx - o ) * id;
    vec3 a = min( t0, t1 ), b = max( t0, t1 );
    float tn = max( a.x, max( a.y, a.z ) ), tf = min( b.x, min( b.y, b.z ) );
    return tf >= max( tn, 0.0 ) && tn <= 1.0;
  }

  // Lanczos-2, Näherung ohne sin (wie FSR 2) über x² (|x| < 2)
  float kL2( float x2 ) { x2 = min( x2, 4.0 ); float b = 0.4 * x2 - 1.0, wi = 0.25 * x2 - 1.0; return ( 1.5625 * b * b - 0.5625 ) * wi * wi; }

  void main() {
    vec2 p = vUv * uSrcRes;                              // Zielpixelmitte in Render-Pixel-Koordinaten
    vec2 sx = uDstRes / uSrcRes;                         // Zielpixel je Render-Pixel (= 1 / Renderskala)
    ivec2 k0 = ivec2( floor( p + uJit ) ), kMax = ivec2( uSrcRes ) - 1;
    vec3 acc = vec3( 0.0 ), sch = vec3( 0.0 ), m1 = vec3( 0.0 ), m2 = vec3( 0.0 ), lo = vec3( 1e9 ), hi = vec3( -1e9 ), cLo = vec3( 1e9 ), cHi = vec3( -1e9 );
    float ws = 0.0, wt = 0.0, tr = 0.0, dMin = 2.0, dMax = -1.0, dC = 1.0, oC = 1e9; vec2 sMin = vUv, sC = vUv;
    float t2 = 2.0 * uSigTreffer * uSigTreffer;
    for ( int b = -1; b <= 1; b++ ) for ( int a = -1; a <= 1; a++ ) {
      ivec2 k = clamp( k0 + ivec2( a, b ), ivec2( 0 ), kMax );
      vec3 c = texelFetch( tFarbe, k, 0 ).rgb;
      float d = texelFetch( tTiefe, k, 0 ).x;
      vec2 s = vec2( k ) + 0.5 - uJit;                   // wo diese Abtastung in der Szene liegt (unverschoben)
      vec2 o = s - p, oo = o * sx;
      float g = kL2( o.x * o.x ) * kL2( o.y * o.y ), gt = exp( -dot( oo, oo ) / t2 );
      cLo = min( cLo, c ); cHi = max( cHi, c );
      acc += c * g; ws += g; sch += c * gt; wt += gt; tr = max( tr, gt );
      vec3 y = kY( c ); m1 += y; m2 += y * y; lo = min( lo, y ); hi = max( hi, y );
      if ( d < dMin ) { dMin = d; sMin = s / uSrcRes; }  // vorderste Abtastung: ihre Bewegung gilt (Kanten wandern mit)
      dMax = max( dMax, d );
      if ( dot( o, o ) < oC ) { oC = dot( o, o ); dC = d; sC = s / uSrcRes; }   // nächst der Zielmitte: ihre Tiefe kommt in die History
    }
    // Ersatz, wo die History fehlt/verworfen ist: Lanczos-2 aus dem aktuellen Bild (Abnahme: die Gauß-Rekonstruktion σ 0,55 war
    // weicher als die bilineare Vergrößerung der FXAA-Art), gegen Überschwinger auf Min/Max der Nachbarschaft geklemmt
    vec3 weit = clamp( acc / ws, cLo, cHi ), eng = wt > 1e-4 ? sch / wt : weit;
    // Bewegung: an Tiefenkanten die der vordersten Abtastung (Vordergrund-Kanten wandern mit, „Velocity-Dilation“), sonst die
    // der mittleren. Abnahme im Browser: immer die vorderste verschmierte die Fahrbahn bei Tempo – auf schrägen Flächen ist die
    // vorderste ein Nachbar mit anderer Bewegung (Fehler ≈ Bewegungsgefälle × 1,5 px je Bild)
    float zMin = kLin( min( dMin, 1.0 ) ), zC = kLin( min( dC, 1.0 ) );
    bool kante = zMin < zC * 0.95;
    vec2 sB = kante ? sMin : sC; float dB = kante ? dMin : dC;
    vec4 w = uInvVP * vec4( sB * 2.0 - 1.0, min( dB, 1.0 ) * 2.0 - 1.0, 1.0 ); w /= w.w;
    float reaktiv = 0.0;
    int ki;
    float sgn = dB >= 1.0 ? 1.0 : kKoerper( w, ki );
    if ( dB >= 1.0 ) ki = -1;
    vec4 wp = ki == 0 ? uKDelta[ 0 ] * w : ki == 1 ? uKDelta[ 1 ] * w : w;
    for ( int i = 0; i < 2; i++ )
      if ( uKArt[ i ].x > 1.5 && kStrahl( uKInv[ i ], uKMin[ i ], uKMax[ i ], w.xyz ) ) reaktiv = max( reaktiv, uKArt[ i ].y );
    // mittlere Abtastung: Körper-Vorzeichen für die History
    float sgnC = sgn;
    if ( kante ) {
      vec4 wc = uInvVP * vec4( sC * 2.0 - 1.0, min( dC, 1.0 ) * 2.0 - 1.0, 1.0 ); wc /= wc.w;
      int kc;
      sgnC = dC >= 1.0 ? 1.0 : kKoerper( wc, kc );
    }
    vec4 pc = uPrevVP * wp;
    vec2 prevUv = pc.xy / pc.w * 0.5 + 0.5;
    vec2 hUv = vUv + ( prevUv - sB );
    float zNeu = zC * sgnC;
    // erwartete Tiefe des Bewegungs-Punkts im Vorbild; der Tiefenbereich der Nachbarschaft wird um dieselbe Änderung verschoben
    float zErw = uOrtho > 0.5 ? kLin( pc.z / pc.w * 0.5 + 0.5 ) : pc.w;
    float dz = zErw - kLin( min( dB, 1.0 ) );
    float zLo = zMin + dz, zHi = kLin( min( dMax, 1.0 ) ) + dz;
    float ab = uHistOk < 0.5 || pc.w <= 0.0 || any( lessThan( hUv, vec2( 0.0 ) ) ) || any( greaterThan( hUv, vec2( 1.0 ) ) ) ? 1.0 : 0.0;
    vec3 col = weit;
  #ifdef TAA_DEBUG
    float dbAl = 1.0, dbClip = 0.0, dbS = 1.0, dbR = 1.0;
  #endif
    if ( ab < 1.0 ) {
      // Disocclusion: beste Übereinstimmung unter den 4 History-Texeln um hUv (Zäune, Kanten: einer passt meist)
      ivec2 h0 = ivec2( floor( hUv * uDstRes - 0.5 ) ), hMax = ivec2( uDstRes ) - 1;
      float best = 1.0;
      for ( int j = 0; j < 4; j++ ) {
        ivec2 hq = clamp( h0 + ivec2( j - ( j / 2 ) * 2, j / 2 ), ivec2( 0 ), hMax );
        float zq = texelFetch( tHist, hq, 0 ).a;
        best = min( best, kDis( zq, zLo, zHi, sgn, sgnC ) );
      #ifdef TAA_DEBUG
        if ( uDebug > 1.5 ) { dbS = min( dbS, sign( zq ) != sgn && sign( zq ) != sgnC ? 1.0 : 0.0 ); dbR = min( dbR, max( max( zLo - abs( zq ), abs( zq ) - zHi ), 0.0 ) / max( 1e-4, abs( zq ) ) ); }
      #endif
      }
      ab = max( ab, best );
      vec3 mu = m1 / 9.0, sg = sqrt( max( m2 / 9.0 - mu * mu, 0.0 ) );
      vec3 mn = max( lo, mu - uGamma * sg ), mx = min( hi, mu + uGamma * sg );
      vec3 hk = kRgb( kClip( kY( kHist( hUv ) ), mn, mx ) );
      // Bewegung: Nachkommaanteil der Verschiebung (ganzzahlig = verlustfrei, halbe Zielpixel = größter Verlust) hebt den
      // Mindestanteil des neuen Bilds – weniger aufsummierte Weichheit, dafür etwas mehr Rauschen in Bewegung
      vec2 fr = fract( hUv * uDstRes - 0.5 ), q = 4.0 * fr * ( 1.0 - fr );
      float bew = uMot * max( q.x, q.y ) * min( 1.0, length( ( hUv - vUv ) * uDstRes ) * 2.0 );
      float aTr = ( 1.0 - uGewicht ) * tr;
      float al = min( 1.0, max( max( max( uAlphaMin, bew ), aTr ), max( ab, reaktiv ) ) );
      // neues Bild: Treffer-Anteil aus den Abtastungen nahe der Zielmitte (eng), Bewegungs-/Ablehnungs-Anteil aus der glatten
      // Rekonstruktion (weit) – sonst käme in Bewegung die nächste Einzelabtastung (Treppen) ins Bild
      vec3 cur = mix( eng, weit, max( ab, clamp( ( bew - aTr ) / max( bew, 1e-4 ), 0.0, 1.0 ) ) );
      float lc = 1.0 / ( 1.0 + kY( cur ).x ), lh = 1.0 / ( 1.0 + kY( hk ).x );   // Luma-Gewichtung (Karis)
      float wc = al * lc, wh = ( 1.0 - al ) * lh;
      col = ( cur * wc + hk * wh ) / ( wc + wh );
    #ifdef TAA_DEBUG
      dbAl = al; dbClip = length( kHist( hUv ) - hk ) * 4.0;
    #endif
    }
    // ?taadbg=1: rot = History verworfen, grün = Anteil neues Bild, blau = Clip-Stärke; Körper-Pixel aufgehellt (grau = gut)
    // ?taadbg=2: rot = Tiefe außerhalb des Bereichs, grün = Welt↔Körper-Wechsel, blau = keine History / hinter der Kamera
    // ?taadbg=3: Auto-Koordinaten der vordersten Abtastung (rot = Höhe, grün = Länge, blau = in der Box)
  #ifdef TAA_DEBUG
    if ( uDebug > 2.5 ) { vec3 l = ( uKInv[ 0 ] * w ).xyz; col = vec3( clamp( ( l.y + 0.6 ) / 1.4, 0.0, 1.0 ), clamp( ( l.z + 2.6 ) / 5.2, 0.0, 1.0 ), all( greaterThan( l, uKMin[ 0 ] ) ) && all( lessThan( l, uKMax[ 0 ] ) ) ? 1.0 : 0.0 ); }
    else if ( uDebug > 1.5 ) col = vec3( min( dbR * 5.0, 1.0 ), dbS, uHistOk < 0.5 || pc.w <= 0.0 ? 1.0 : 0.0 ) * ( sgn < 0.0 ? 0.5 : 1.0 ) + ( sgn < 0.0 ? 0.4 : 0.0 );
    else if ( uDebug > 0.5 ) col = vec3( ab, dbAl, min( dbClip, 1.0 ) ) * ( sgn < 0.0 ? 0.5 : 1.0 ) + ( sgn < 0.0 ? 0.4 : 0.0 );
  #endif
    gl_FragColor = vec4( col, zNeu );
  }`;

// Negativer Mip-Bias (n31, Abnahme im Browser): bei Renderskala s wählt die GPU die Textur-Mipmaps für die kleine Auflösung –
// Texturdetail (Asphaltrisse, Gras, Fels) ist dann schon vor dem Jitter weg und kommt auch über die Zeit nicht zurück
// (gemessen: im Standbild 58 % der Kantenenergie von 1,0 + MSAA 4). FSR 2/DLSS verlangen deshalb Bias ≈ log2(s).
// WebGL2 kennt keinen globalen LOD-Bias → Konstante TAA_MIP im three.js-Baustein `common` und Bias-Argument in den
// Textur-Zugriffen der Material-Bausteine. Muss VOR dem ersten Übersetzen eines Materials laufen (Wert ist eine Konstante;
// ändern = alle Shader neu übersetzen). Eigene Shader-Teile hinter `#include <common>` (nur Fragment-Shader!) können
// `texture2D( t, uv, TAA_MIP )` schreiben – ohne TAA ist TAA_MIP 0,0.
const MIP_BAUSTEINE = { map_fragment: 'map', alphamap_fragment: 'alphaMap', emissivemap_fragment: 'emissiveMap', normal_fragment_maps: 'normalMap',
  roughnessmap_fragment: 'roughnessMap', metalnessmap_fragment: 'metalnessMap', bumpmap_pars_fragment: 'bumpMap', specularmap_fragment: 'specularMap' };
export function mipBiasEinbauen(ShaderChunk, bias = 0) {
  const b = Math.max(-2, Math.min(0, Number.isFinite(+bias) ? +bias : 0));
  const C = ShaderChunk, kopf = /\/\* TAA_MIP \*\/[^]*?\/\* TAA_MIP Ende \*\/\n/;
  C.common = `/* TAA_MIP */\n#define TAA_MIP ${b.toFixed(3)}\n/* TAA_MIP Ende */\n` + C.common.replace(kopf, '');
  for (const [k, t] of Object.entries(MIP_BAUSTEINE)) {
    const uv = 'v' + t[0].toUpperCase() + t.slice(1) + 'Uv';
    if (C[k]) C[k] = C[k].split(`texture2D( ${t}, ${uv} )`).join(`texture2D( ${t}, ${uv}, TAA_MIP )`);
  }
  return b;
}

export class TAAU {
  constructor(renderer, opts = {}) {
    this.r = renderer;
    const zahl = (v, d) => (v != null && v !== '' && Number.isFinite(+v) ? +v : d);
    this.o = { ...TAAU_STANDARD };
    for (const k of ['gewicht', 'gamma', 'dis', 'sigmaTreffer', 'alphaMin', 'cub', 'bewegung']) this.o[k] = zahl(opts[k], TAAU_STANDARD[k]);
    this.o.gewicht = Math.max(0.5, Math.min(0.98, this.o.gewicht));
    this.muster = opts.muster || 'auto';
    this.debug = +opts.debug || 0;   // ?taadbg=1: Anzeige der Verwerfung/Mischung (eigener Durchgang, History bleibt sauber)
    const ext = renderer.extensions;
    // History in HalfFloat braucht ein Render-Ziel mit Fließkomma (WebGL2 + EXT_color_buffer_float bzw. _half_float)
    this.technik = !!(renderer.capabilities.isWebGL2 && ext && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')));
    this.hist = [null, null]; this.idx = 0; this.nr = 0; this.histOk = false;
    this.jit = [0, 0]; this.anzahl = 0; this.folge = null;
    this.uJit = new THREE.Vector2();      // Jitter dieses Bilds in uv (für Durchgänge, die die verschobene Tiefe lesen)
    this.prevVP = new THREE.Matrix4(); this.prevOk = false;
    this._p = new THREE.Matrix4(); this._pi = new THREE.Matrix4(); this._m = new THREE.Matrix4();
    this.k = [0, 1].map(() => ({ obj: null, art: 0, reaktiv: this.o.reaktiv, min: new THREE.Vector3(), max: new THREE.Vector3(), prev: new THREE.Matrix4(), prevOk: false }));
    this.u = {
      tFarbe: { value: null }, tTiefe: { value: null }, tHist: { value: null },
      uSrcRes: { value: new THREE.Vector2(1, 1) }, uDstRes: { value: new THREE.Vector2(1, 1) }, uJit: { value: new THREE.Vector2() },
      uInvVP: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() },
      uNear: { value: 0.1 }, uFar: { value: 1000 }, uOrtho: { value: 0 },
      uGewicht: { value: this.o.gewicht }, uGamma: { value: this.o.gamma }, uSigTreffer: { value: this.o.sigmaTreffer },
      uDis: { value: this.o.dis }, uAlphaMin: { value: this.o.alphaMin }, uHistOk: { value: 0 }, uDebug: { value: 0 }, uCub: { value: this.o.cub }, uMot: { value: this.o.bewegung },
      uKInv: { value: [new THREE.Matrix4(), new THREE.Matrix4()] }, uKDelta: { value: [new THREE.Matrix4(), new THREE.Matrix4()] },
      uKMin: { value: [new THREE.Vector3(), new THREE.Vector3()] }, uKMax: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      uKArt: { value: [new THREE.Vector2(), new THREE.Vector2()] }, uCamPos: { value: new THREE.Vector3() },
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VS, fragmentShader: RESOLVE_FS, depthTest: false, depthWrite: false });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(g, this.mat); this.quad.frustumCulled = false;
    this.szene = new THREE.Scene(); this.szene.add(this.quad);
    this.kam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.stats = { resolves: 0, resets: 0 };
  }

  // Bewegtes Objekt i (0/1) für dieses Bild anmelden. art: 'fest' (schreibt Tiefe, eigene Reprojektion – Auto),
  // 'durchsichtig' (keine Tiefe – Geist: dort History schwächer), null = aus. box: { min, max } in Objekt-Koordinaten
  koerper(i, obj, box, art = 'fest', reaktiv = null) {
    const K = this.k[i];
    if (!obj || !obj.visible || !art || !box) { K.art = 0; K.obj = null; K.prevOk = false; return; }
    if (K.obj !== obj) K.prevOk = false;
    K.obj = obj; K.art = art === 'durchsichtig' ? 2 : 1; K.min.copy(box.min); K.max.copy(box.max);
    K.reaktiv = reaktiv ?? this.o.reaktiv;
  }

  // Projektion der Kamera um den Jitter dieses Bilds verschieben (bis jitterAus). skala = Renderskala (Länge der Folge)
  jitterAn(camera, sw, sh, skala = 1) {
    const n = jitterAnzahl(skala, this.muster);
    if (n !== this.anzahl) { this.anzahl = n; this.folge = n ? jitterFolge(n) : null; }
    this.jit = jitterVersatz(this.nr, n, this.folge);
    this.uJit.set(this.jit[0] / sw, this.jit[1] / sh);
    this._p.copy(camera.projectionMatrix); this._pi.copy(camera.projectionMatrixInverse);
    jitterProjektion(camera.projectionMatrix.elements, this.jit[0], this.jit[1], sw, sh);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  jitterAus(camera) { camera.projectionMatrix.copy(this._p); camera.projectionMatrixInverse.copy(this._pi); }

  ensure(w, h) {
    const H = this.hist;
    if (H[0] && H[0].width === w && H[0].height === h) return;
    for (const t of H) if (t) t.dispose();
    const opt = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.hist = [new THREE.WebGLRenderTarget(w, h, opt), new THREE.WebGLRenderTarget(w, h, opt)];
    this.histOk = false;
  }
  // History verwerfen (Schnitt, Stufe aus/an, Größe)
  reset() { if (this.histOk) this.stats.resets++; this.histOk = false; }

  // Ein Bild auflösen. o = { farbe, tiefe (DepthTexture), sw, sh, w, h, camera (UNverschoben), schnitt }
  // Rückgabe: Textur w × h (rgb = Bild, a = lineare Tiefe mit Körper-Vorzeichen – intern)
  resolve(renderer, o) {
    const { w, h, sw, sh, camera } = o, U = this.u;
    this.ensure(w, h);
    if (o.schnitt) this.reset();
    U.tFarbe.value = o.farbe; U.tTiefe.value = o.tiefe;
    U.uSrcRes.value.set(sw, sh); U.uDstRes.value.set(w, h); U.uJit.value.set(this.jit[0], this.jit[1]);
    const vp = this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    U.uInvVP.value.copy(vp).invert();
    U.uPrevVP.value.copy(this.prevOk ? this.prevVP : vp);
    U.uNear.value = camera.near; U.uFar.value = camera.far; U.uOrtho.value = camera.isOrthographicCamera ? 1 : 0;
    U.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    U.uGewicht.value = this.o.gewicht; U.uGamma.value = this.o.gamma; U.uDis.value = this.o.dis;
    for (let i = 0; i < 2; i++) {
      const K = this.k[i];
      U.uKArt.value[i].set(K.art, K.reaktiv);
      if (!K.art) continue;
      K.obj.updateMatrixWorld();
      U.uKInv.value[i].copy(K.obj.matrixWorld).invert();
      // vorige Welt · aktuelle Inverse: Punkt auf dem Objekt → wo er im Vorbild war
      U.uKDelta.value[i].copy(K.prevOk ? K.prev : K.obj.matrixWorld).multiply(U.uKInv.value[i]);
      U.uKMin.value[i].copy(K.min); U.uKMax.value[i].copy(K.max);
      K.prev.copy(K.obj.matrixWorld); K.prevOk = true;
    }
    U.uHistOk.value = this.histOk ? 1 : 0;
    const lesen = this.hist[this.idx], schreiben = this.hist[1 - this.idx];
    U.tHist.value = lesen.texture;
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(schreiben);
    renderer.render(this.szene, this.kam);
    let aus = schreiben.texture;
    if (this.debug) {
      if (!this.dbgRT || this.dbgRT.width !== w || this.dbgRT.height !== h) { if (this.dbgRT) this.dbgRT.dispose(); this.dbgRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false }); }
      // Debug-Ansicht: eigenes Material mit TAA_DEBUG (im normalen Shader kostet der Debug-Code nichts), gleiche Uniforms
      if (!this.matDbg) { this.matDbg = this.mat.clone(); this.matDbg.uniforms = this.u; this.matDbg.defines = { TAA_DEBUG: 1 }; }
      this.quad.material = this.matDbg; U.uDebug.value = this.debug;
      renderer.setRenderTarget(this.dbgRT); renderer.render(this.szene, this.kam);
      U.uDebug.value = 0; this.quad.material = this.mat;
      aus = this.dbgRT.texture;
    }
    renderer.autoClear = ac;
    this.idx = 1 - this.idx;
    this.prevVP.copy(vp); this.prevOk = true;
    this.histOk = true; this.nr++; this.stats.resolves++;
    return aus;
  }
  get textur() { return this.hist[1 - this.idx] ? this.hist[1 - this.idx].texture : null; }   // zuletzt geschriebenes Bild

  describe() {
    return { technik: this.technik, gewicht: this.o.gewicht, gamma: this.o.gamma, dis: this.o.dis, muster: this.muster, phasen: this.anzahl, jit: this.jit.map((v) => +v.toFixed(3)),
      groesse: this.hist[0] ? [this.hist[0].width, this.hist[0].height] : null, koerper: this.k.map((K) => K.art), ...this.stats };
  }
  dispose() {
    for (const t of this.hist) if (t) t.dispose();
    if (this.dbgRT) this.dbgRT.dispose();
    if (this.matDbg) this.matDbg.dispose();
    this.hist = [null, null];
    this.mat.dispose(); this.quad.geometry.dispose();
  }
}
