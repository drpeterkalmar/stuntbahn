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
  uniform float uNear, uFar, uGewicht, uGamma, uSigRek, uSigTreffer, uDis, uAlphaMin, uHistOk, uOrtho;
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
  float kDis( float zH, float zE ) {
    if ( abs( zH ) <= 0.0 || sign( zH ) != sign( zE ) ) return 1.0;
    float r = abs( abs( zH ) - abs( zE ) ) / max( 1e-4, abs( zE ) );
    return clamp( ( r - uDis ) / uDis, 0.0, 1.0 );
  }
  // History bikubisch (Catmull-Rom, 5 bilineare Abtastungen) – bilinear allein verwischt bei Bewegung jedes Bild etwas mehr
  vec3 kHist( vec2 uv ) {
    vec2 sp = uv * uDstRes, tp = floor( sp - 0.5 ) + 0.5, f = sp - tp;
    vec2 w0 = f * ( -0.5 + f * ( 1.0 - 0.5 * f ) ), w1 = 1.0 + f * f * ( -2.5 + 1.5 * f );
    vec2 w2 = f * ( 0.5 + f * ( 2.0 - 1.5 * f ) ), w3 = f * f * ( -0.5 + 0.5 * f );
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

  void main() {
    vec2 p = vUv * uSrcRes;                              // Zielpixelmitte in Render-Pixel-Koordinaten
    vec2 sx = uDstRes / uSrcRes;                         // Zielpixel je Render-Pixel (= 1 / Renderskala)
    ivec2 k0 = ivec2( floor( p + uJit ) ), kMax = ivec2( uSrcRes ) - 1;
    vec3 acc = vec3( 0.0 ), sch = vec3( 0.0 ), m1 = vec3( 0.0 ), m2 = vec3( 0.0 ), lo = vec3( 1e9 ), hi = vec3( -1e9 );
    float ws = 0.0, wt = 0.0, tr = 0.0, dMin = 2.0; vec2 sMin = vUv;
    float r2 = 2.0 * uSigRek * uSigRek, t2 = 2.0 * uSigTreffer * uSigTreffer;
    for ( int b = -1; b <= 1; b++ ) for ( int a = -1; a <= 1; a++ ) {
      ivec2 k = clamp( k0 + ivec2( a, b ), ivec2( 0 ), kMax );
      vec3 c = texelFetch( tFarbe, k, 0 ).rgb;
      float d = texelFetch( tTiefe, k, 0 ).x;
      vec2 s = vec2( k ) + 0.5 - uJit;                   // wo diese Abtastung in der Szene liegt (unverschoben)
      vec2 o = s - p, oo = o * sx;
      float g = exp( -dot( o, o ) / r2 ), gt = exp( -dot( oo, oo ) / t2 );
      acc += c * g; ws += g; sch += c * gt; wt += gt; tr = max( tr, gt );
      vec3 y = kY( c ); m1 += y; m2 += y * y; lo = min( lo, y ); hi = max( hi, y );
      if ( d < dMin ) { dMin = d; sMin = s / uSrcRes; }  // vorderste Abtastung: ihre Bewegung gilt (Kanten wandern mit)
    }
    vec3 weit = acc / ws, eng = wt > 1e-4 ? sch / wt : weit;
    // Reprojektion der vordersten Abtastung (Welt statisch; Körper mit eigener Bewegung)
    vec4 w = uInvVP * vec4( sMin * 2.0 - 1.0, dMin * 2.0 - 1.0, 1.0 ); w /= w.w;
    float sgn = 1.0, reaktiv = 0.0;
    vec4 wp = w;
    for ( int i = 0; i < 2; i++ ) {
      if ( uKArt[ i ].x > 0.5 && uKArt[ i ].x < 1.5 && sgn > 0.0 ) {
        vec3 l = ( uKInv[ i ] * w ).xyz;
        if ( all( greaterThan( l, uKMin[ i ] ) ) && all( lessThan( l, uKMax[ i ] ) ) ) { wp = uKDelta[ i ] * w; sgn = -1.0; }
      } else if ( uKArt[ i ].x > 1.5 && kStrahl( uKInv[ i ], uKMin[ i ], uKMax[ i ], w.xyz ) ) reaktiv = max( reaktiv, uKArt[ i ].y );
    }
    vec4 pc = uPrevVP * wp;
    vec2 prevUv = pc.xy / pc.w * 0.5 + 0.5;
    vec2 hUv = vUv + ( prevUv - sMin );
    float zNeu = kLin( min( dMin, 1.0 ) ) * sgn;
    float zErw = ( uOrtho > 0.5 ? kLin( pc.z / pc.w * 0.5 + 0.5 ) : pc.w ) * sgn;
    float ab = uHistOk < 0.5 || pc.w <= 0.0 || any( lessThan( hUv, vec2( 0.0 ) ) ) || any( greaterThan( hUv, vec2( 1.0 ) ) ) ? 1.0 : 0.0;
    vec3 col = weit;
    if ( ab < 1.0 ) {
      // Disocclusion: beste Übereinstimmung unter den 4 History-Texeln um hUv (Zäune, Kanten: einer passt meist)
      ivec2 h0 = ivec2( floor( hUv * uDstRes - 0.5 ) ), hMax = ivec2( uDstRes ) - 1;
      float best = 1.0;
      for ( int j = 0; j < 4; j++ ) {
        ivec2 hq = clamp( h0 + ivec2( j - ( j / 2 ) * 2, j / 2 ), ivec2( 0 ), hMax );
        best = min( best, kDis( texelFetch( tHist, hq, 0 ).a, zErw ) );
      }
      ab = max( ab, best );
      vec3 mu = m1 / 9.0, sg = sqrt( max( m2 / 9.0 - mu * mu, 0.0 ) );
      vec3 mn = max( lo, mu - uGamma * sg ), mx = min( hi, mu + uGamma * sg );
      vec3 hk = kRgb( kClip( kY( kHist( hUv ) ), mn, mx ) );
      vec3 cur = mix( eng, weit, ab );
      float al = min( 1.0, max( max( uAlphaMin, ( 1.0 - uGewicht ) * tr ), max( ab, reaktiv ) ) );
      float lc = 1.0 / ( 1.0 + kY( cur ).x ), lh = 1.0 / ( 1.0 + kY( hk ).x );   // Luma-Gewichtung (Karis)
      float wc = al * lc, wh = ( 1.0 - al ) * lh;
      col = ( cur * wc + hk * wh ) / ( wc + wh );
    }
    gl_FragColor = vec4( col, zNeu );
  }`;

export class TAAU {
  constructor(renderer, opts = {}) {
    this.r = renderer;
    const zahl = (v, d) => (v != null && v !== '' && Number.isFinite(+v) ? +v : d);
    this.o = { ...TAAU_STANDARD };
    for (const k of ['gewicht', 'gamma', 'dis', 'sigmaRek', 'sigmaTreffer', 'alphaMin']) this.o[k] = zahl(opts[k], TAAU_STANDARD[k]);
    this.o.gewicht = Math.max(0.5, Math.min(0.98, this.o.gewicht));
    this.muster = opts.muster || 'auto';
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
      uGewicht: { value: this.o.gewicht }, uGamma: { value: this.o.gamma }, uSigRek: { value: this.o.sigmaRek }, uSigTreffer: { value: this.o.sigmaTreffer },
      uDis: { value: this.o.dis }, uAlphaMin: { value: this.o.alphaMin }, uHistOk: { value: 0 },
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
    renderer.autoClear = ac;
    this.idx = 1 - this.idx;
    this.prevVP.copy(vp); this.prevOk = true;
    this.histOk = true; this.nr++; this.stats.resolves++;
    return schreiben.texture;
  }
  get textur() { return this.hist[1 - this.idx] ? this.hist[1 - this.idx].texture : null; }   // zuletzt geschriebenes Bild

  describe() {
    return { technik: this.technik, gewicht: this.o.gewicht, gamma: this.o.gamma, dis: this.o.dis, muster: this.muster, phasen: this.anzahl, jit: this.jit.map((v) => +v.toFixed(3)),
      groesse: this.hist[0] ? [this.hist[0].width, this.hist[0].height] : null, koerper: this.k.map((K) => K.art), ...this.stats };
  }
  dispose() {
    for (const t of this.hist) if (t) t.dispose();
    this.hist = [null, null];
    this.mat.dispose(); this.quad.geometry.dispose();
  }
}
