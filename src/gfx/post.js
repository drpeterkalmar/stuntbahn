// Bewegungsunschärfe (28.09.2026, Peter: „Motion Blur fürs Speed-Feeling“): Kamera-Bewegungsunschärfe aus Tiefe
// + vorheriger/aktueller View-Projektion – ohne Velocity-Buffer für jede Geometrie.
//  - Die Szene läuft nur dann über ein Render-Target, wenn die Unschärfe wirklich wirkt (Rennen/Replay, ab ~80 km/h,
//    nicht in Menü, Pause, Replay-Standbild, nicht bei Kameraschnitten). Sonst wird wie bisher direkt gezeichnet.
//  - Das Render-Target bekommt Tonemapping + sRGB wie der Bildschirm (Kennung isXRRenderTarget: three.js wendet
//    Tonemapping sonst nur beim direkten Zeichnen an) → gleiches Bild, 8 bit statt Half-Float (Handy-Bandbreite).
//  - Das Auto bleibt scharf: Pixel, deren Weltpunkt in der Auto-Box liegt, bekommen Geschwindigkeit 0; Abtastungen,
//    die deutlich näher liegen als der Mittelpunkt (Auto vor der Straße), zählen nicht (kein Auto-Schmier).
//  - Drehungen der Kamera zählen nur zu ROT_KEEP (Kurven bleiben lesbar), Vorwärtsfahrt voll (radiale Streifen).
//  - Stufe 1: Unschärfe in halber Auflösung, wenige Abtastungen, danach Mischung mit dem scharfen Bild; Stufe 2:
//    volle Auflösung, mehr Abtastungen, direkt auf den Bildschirm. Stufe 0: aus (dort nur Rand-Tempostreifen im HUD).
import * as THREE from 'three';

const ROT_KEEP = 0.45;   // Anteil der Kamera-Drehung, der verwischt (1 = physikalisch, 0 = nur Fahrt)
// Einstellung „Bewegungsunschärfe“: Belichtungszeit (s) und größte Streifenlänge (Anteil der Bildbreite)
export const BLUR_LEVELS = {
  off: { name: 'Aus', shutter: 0, max: 0 },
  light: { name: 'Leicht', shutter: 1 / 170, max: 0.028 },
  strong: { name: 'Stark', shutter: 1 / 85, max: 0.05 },
};
// Abtastungen je Stufe/Einstellung (Stufe 1 in halber Auflösung)
const TAPS = { 1: { light: 5, strong: 7 }, 2: { light: 9, strong: 13 } };
// Tempo (m/s), ab dem eingeblendet wird, und volle Stärke
export const BLUR_V0 = 80 / 3.6, BLUR_V1 = 190 / 3.6;

const VS = `varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BLUR_FS = `
  uniform sampler2D tColor, tDepth;
  uniform mat4 uReproj, uInvVP, uCarInv;
  uniform vec3 uBoxMin, uBoxMax;
  uniform float uCarOn, uScale, uMaxLen, uNear, uFar, uVig, uRadial, uHalf;
  uniform vec2 uRes;
  varying vec2 vUv;
  float linZ( float d ) { return uNear * uFar / ( uFar - d * ( uFar - uNear ) ); }
  void main() {
    float d = texture2D( tDepth, vUv ).x;
    vec4 ndc = vec4( vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
    vec4 pc = uReproj * ndc;
    vec2 v = ( vUv - ( pc.xy / pc.w * 0.5 + 0.5 ) ) * uScale;
    if ( pc.w <= 0.0 ) v = vec2( 0.0 );
    float car = 0.0;
    if ( uCarOn > 0.5 ) {
      vec4 w = uInvVP * ndc; w /= w.w;
      vec3 l = ( uCarInv * w ).xyz;
      if ( all( greaterThan( l, uBoxMin ) ) && all( lessThan( l, uBoxMax ) ) ) car = 1.0;
    }
    vec2 c = vUv - 0.5;
    v += c * uRadial * smoothstep( 0.12, 0.5, length( c ) );   // Nitro: zusätzlicher Zoom am Rand
    v *= 1.0 - car;
    vec2 vp = v * uRes;                                          // Pixel (volle Auflösung)
    float L = length( vp ), Lmax = uMaxLen * uRes.x;
    if ( L > Lmax ) { v *= Lmax / L; L = Lmax; }
    vec3 c0 = texture2D( tColor, vUv ).rgb;
    vec3 col = c0;
    float blend = smoothstep( 0.6, 2.5, L );
    if ( L > 0.6 ) {
      float z0 = linZ( d ), sum = 1.0;
      float j = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
      for ( int i = 0; i < TAPS; i++ ) {
        vec2 uv = vUv + v * ( ( float( i ) + j ) / float( TAPS ) - 0.5 );
        float zs = linZ( texture2D( tDepth, uv ).x );
        float w = step( z0 * 0.75 - 0.3, zs );                // Vordergrund (Auto) nicht in den Hintergrund ziehen
        col += texture2D( tColor, uv ).rgb * w; sum += w;
      }
      col /= sum;
    }
    float vig = 1.0 - uVig * smoothstep( 0.32, 0.78, length( c * vec2( 1.0, uRes.y / uRes.x ) * 1.25 ) );
    if ( uHalf > 0.5 ) gl_FragColor = vec4( col, blend * ( 1.0 - car ) );
    else gl_FragColor = vec4( col * vig, 1.0 );
  }`;
const COMP_FS = `
  uniform sampler2D tColor, tBlur; uniform float uVig; uniform vec2 uRes; varying vec2 vUv;
  void main() {
    vec3 s = texture2D( tColor, vUv ).rgb; vec4 b = texture2D( tBlur, vUv );
    vec2 c = vUv - 0.5;
    float vig = 1.0 - uVig * smoothstep( 0.32, 0.78, length( c * vec2( 1.0, uRes.y / uRes.x ) * 1.25 ) );
    gl_FragColor = vec4( mix( s, b.rgb, b.a ) * vig, 1.0 );
  }`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    const gl = renderer.getContext();
    this.supported = !!renderer.capabilities.isWebGL2 || (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
    this.setting = 'light'; this.tier = 1;
    this.autoOff = false;          // Qualitäts-Automatik: bei Ruckeln zuerst die Unschärfe abschalten
    this.active = false; this.k = 0; this.stats = { frames: 0, last: null };
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(g, null);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.u = {
      tColor: { value: null }, tDepth: { value: null }, tBlur: { value: null },
      uReproj: { value: new THREE.Matrix4() }, uInvVP: { value: new THREE.Matrix4() }, uCarInv: { value: new THREE.Matrix4() },
      uBoxMin: { value: new THREE.Vector3(-1.1, -0.6, -2.5) }, uBoxMax: { value: new THREE.Vector3(1.1, 1.4, 2.5) },
      uCarOn: { value: 0 }, uScale: { value: 0 }, uMaxLen: { value: 0.03 }, uNear: { value: 0.25 }, uFar: { value: 8000 },
      uVig: { value: 0 }, uRadial: { value: 0 }, uHalf: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    };
    this.mats = new Map();
    this.comp = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VS, fragmentShader: COMP_FS, depthTest: false, depthWrite: false });
    this.rt = null; this.half = null;
    this.samples = 4;              // MSAA des Szenen-Ziels (Stufe 1: siehe render)
    this.prev = { ok: false, pos: new THREE.Vector3(), q: new THREE.Quaternion(), proj: new THREE.Matrix4() };
    this._m = new THREE.Matrix4(); this._m2 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3();
    this._one = new THREE.Vector3(1, 1, 1); this._sz = new THREE.Vector2();
    this.dtS = 1 / 60;
  }
  // Auto-Box in Auto-Koordinaten (einmal nach dem Laden aus dem Modell, etwas großzügiger)
  setCarBox(box) {
    // Unterkante 12 cm über der Radaufstandsfläche, sonst bleibt die Fahrbahn unter/neben dem Auto scharf
    this.u.uBoxMin.value.copy(box.min).addScalar(-0.04); this.u.uBoxMin.value.y = box.min.y + 0.12;
    this.u.uBoxMax.value.copy(box.max).addScalar(0.06);
  }
  blurMat(taps, half) {
    const key = taps + '|' + half;
    if (!this.mats.has(key)) this.mats.set(key, new THREE.ShaderMaterial({ uniforms: this.u, defines: { TAPS: taps }, vertexShader: VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false }));
    return this.mats.get(key);
  }
  // wirksame Stärke 0 … 1 (0 = nichts zu tun)
  enabled() { return this.supported && this.tier > 0 && this.setting !== 'off' && !this.autoOff && !!BLUR_LEVELS[this.setting]; }
  ensureTargets(w, h, half) {
    if (!this.rt || this.rt.width !== w || this.rt.height !== h || this.rt.samples !== this.samples) {
      if (this.rt) { this.rt.depthTexture.dispose(); this.rt.dispose(); }
      const dt = new THREE.DepthTexture(w, h);
      dt.type = THREE.UnsignedIntType;
      this.rt = new THREE.WebGLRenderTarget(w, h, { samples: this.samples, depthTexture: dt, depthBuffer: true, stencilBuffer: false, type: THREE.UnsignedByteType });
      // Tonemapping + sRGB wie beim Bildschirm (s. o.), Speicherformat trotzdem lineares RGBA8 (keine Dekodierung)
      this.rt.isXRRenderTarget = true;
      this.rt.texture.colorSpace = THREE.SRGBColorSpace;
      this.rt.texture.internalFormat = 'RGBA8';
      this.rt.texture.generateMipmaps = false;
      this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter;
    }
    const hw = Math.max(1, Math.round(w / 2)), hh = Math.max(1, Math.round(h / 2));
    if (half && (!this.half || this.half.width !== hw || this.half.height !== hh)) {
      if (this.half) this.half.dispose();
      this.half = new THREE.WebGLRenderTarget(hw, hh, { depthBuffer: false, stencilBuffer: false, type: THREE.UnsignedByteType });
      this.half.texture.generateMipmaps = false;
      this.half.texture.minFilter = this.half.texture.magFilter = THREE.LinearFilter;
    }
  }
  // Ein Bild zeichnen. o = { run (Rennen/Replay läuft), speed (m/s), boost 0 … 1, car (Object3D), dt, cut }.
  // Gibt true zurück, wenn gezeichnet wurde (sonst zeichnet der Aufrufer direkt).
  render(scene, camera, o) {
    const P = this.prev, L = BLUR_LEVELS[this.setting] || BLUR_LEVELS.off;
    camera.updateMatrixWorld();
    const q = camera.quaternion, pos = camera.position;
    // Kameraschnitt (Reset, Kamerawechsel, Replay-Sprung): kein Vorbild → diesmal nicht verwischen
    const cut = o.cut || !P.ok || P.pos.distanceTo(pos) > Math.max(6, o.speed * 0.25 + 3) || P.q.angleTo(q) > 0.5;
    this.dtS += (Math.min(0.1, Math.max(1 / 240, o.dt || 1 / 60)) - this.dtS) * 0.25;
    const ks = Math.min(1, Math.max(0, (o.speed - BLUR_V0) / (BLUR_V1 - BLUR_V0)));
    const k = this.enabled() && o.run ? ks * ks * (3 - 2 * ks) * (1 + 0.6 * (o.boost || 0)) : 0;
    this.k = k;
    let drew = false;
    if (k > 0.004 && !cut) {
      const r = this.r;
      r.getDrawingBufferSize(this._sz);
      const w = this._sz.x, h = this._sz.y, half = this.tier < 2;
      this.ensureTargets(w, h, half);
      // Vor-ViewProj: Position von damals, Drehung nur zu ROT_KEEP (Rest = aktuelle Drehung)
      this._q.copy(P.q).slerp(q, 1 - ROT_KEEP);
      this._m.compose(P.pos, this._q, this._one).invert();
      const prevVP = this._m2.multiplyMatrices(P.proj, this._m);
      const curVP = this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const U = this.u;
      U.uInvVP.value.copy(curVP).invert();
      U.uReproj.value.multiplyMatrices(prevVP, U.uInvVP.value);
      U.uScale.value = Math.min(4, L.shutter * k / this.dtS);
      U.uMaxLen.value = L.max * Math.min(1.3, k);
      U.uRadial.value = 0.08 * (o.boost || 0) * Math.min(1.5, L.shutter / (1 / 170));
      U.uVig.value = 0.22 * Math.min(1, k);
      U.uNear.value = camera.near; U.uFar.value = camera.far;
      U.uRes.value.set(w, h);
      if (o.car && o.car.visible) { o.car.updateMatrixWorld(); U.uCarInv.value.copy(o.car.matrixWorld).invert(); U.uCarOn.value = 1; } else U.uCarOn.value = 0;
      r.setRenderTarget(this.rt);
      r.render(scene, camera);
      U.tColor.value = this.rt.texture; U.tDepth.value = this.rt.depthTexture;
      const taps = (TAPS[Math.min(2, this.tier)] || TAPS[1])[this.setting] || 5;
      if (half) {
        U.uHalf.value = 1;
        this.quad.material = this.blurMat(taps, 1);
        r.setRenderTarget(this.half); r.render(this.scene, this.cam);
        U.tBlur.value = this.half.texture;
        this.quad.material = this.comp;
      } else {
        U.uHalf.value = 0;
        this.quad.material = this.blurMat(taps, 0);
      }
      r.setRenderTarget(null);
      r.render(this.scene, this.cam);
      drew = true;
      this.stats.frames++;
      this.stats.last = { k: +k.toFixed(3), scale: +U.uScale.value.toFixed(3), max: +U.uMaxLen.value.toFixed(4), taps, half };
    }
    this.active = drew;
    P.pos.copy(pos); P.q.copy(q); P.proj.copy(camera.projectionMatrix); P.ok = true;
    return drew;
  }
  // nächstes Bild ohne Vorbild (Kameraschnitt)
  reset() { this.prev.ok = false; }
}
