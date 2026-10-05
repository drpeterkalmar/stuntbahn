// Zielshow-Pyro (n27): das Feuerwerk aus game/zielshow.js als EIN instanziertes Mesh (ein Draw-Call). Jede Partikel ist
// ein Rechteck; Ort, Farbe und Form rechnet der Vertex-Shader allein aus der Zeit seit dem Zieldurchgang (uT) – die CPU
// setzt je Bild nur Uniforms. Funken liegen als Strich entlang ihrer Flugrichtung (Bewegungsspur), Glut wächst und
// verglüht, Konfetti flattert deckend, der Bodenschein liegt flach auf der Fahrbahn und leuchtet mit den Fontänen bzw.
// den Blitzen. Mischung „vormultipliziert“ (eins + eins − Alpha): leuchtende Teile addieren (Alpha 0), Konfetti deckt.
import * as THREE from 'three';
import { pyroPlan, flashAt, KIND } from '../game/zielshow.js';

const VS = `
attribute vec4 a0; attribute vec4 a1; attribute vec4 a2; attribute vec4 a3;
uniform float uT; uniform float uFlash; uniform float uPxK;
varying vec4 vC; varying vec2 vUv; varying float vKind; varying float vU;
float h1(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
// Bahn mit linearem Luftwiderstand k (wie game/zielshow.js particleAt): p = p0 + v0·f1 + g·h2
vec3 pyroPos(float age) {
  float k = a2.y, ka = k * age, f1, h2;
  if (ka < 0.01) { f1 = age * (1.0 - ka * 0.5 + ka * ka / 6.0); h2 = age * age * (0.5 - ka / 6.0); }
  else { f1 = (1.0 - exp(-ka)) / k; h2 = (age - f1) / k; }
  return a0.xyz + a1.xyz * f1 + vec3(0.0, -9.81 * a2.z, 0.0) * h2;
}
void main() {
  float age = uT - a0.w, life = a1.w;
  vUv = position.xy; vKind = a2.w; vU = 0.0;
  if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vC = vec4(0.0); return; }
  vec3 p = pyroPos(age);
  float u = age / life; vU = u;
  int kind = int(a2.w + 0.5);
  float size = a2.x, alpha = 1.0;
  vec3 col = a3.rgb;
  if (kind == 3) {
    // Bodenschein: flach (Welt-XZ), Stärke aus Hülle (Fontäne) oder Blitz
    float e = a2.y > 0.5 ? uFlash * 2.2 : smoothstep(0.0, 0.25, age) * (1.0 - smoothstep(life - 0.6, life, age)) * (0.75 + 0.25 * h1(floor(uT * 24.0) + a3.w * 13.0));
    vec3 wp = p + vec3(position.x * size, 0.0, position.y * size);
    vC = vec4(col * e * 0.5, 0.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    return;
  }
  if (kind == 2) {
    // Konfetti: seitliches Taumeln, Drehen, Kippen (Breite schwankt) – deckend
    float sw = a3.w * 6.283;
    p.x += sin(age * 4.3 + sw) * 0.5 * min(1.0, age); p.z += cos(age * 3.7 + sw) * 0.5 * min(1.0, age);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float rot = age * (2.0 + 3.0 * a3.w) + sw, flip = 0.25 + 0.75 * abs(cos(age * 7.0 + sw * 2.0));
    vec2 q = vec2(position.x * flip, position.y * 0.62) * size;
    q = vec2(q.x * cos(rot) - q.y * sin(rot), q.x * sin(rot) + q.y * cos(rot));
    mv.xy += q;
    float fade = 1.0 - smoothstep(0.85, 1.0, u);
    vC = vec4(col * (0.55 + 0.45 * flip), fade * smoothstep(0.4, 1.5, -mv.z));
    gl_Position = projectionMatrix * mv;
    return;
  }
  vec4 mv = viewMatrix * vec4(p, 1.0);
  if (kind == 5) {
    // Rauch (Burst-Wolke am Taghimmel): wächst, grau, deckt halb
    size *= 0.4 + 1.2 * sqrt(u);
    mv.xy += position.xy * size * 0.5;
    float a5 = (1.0 - smoothstep(0.35, 1.0, u)) * smoothstep(0.0, 0.08, u) * 0.38 * smoothstep(0.8, 3.5, -mv.z);
    vC = vec4(col * a5, a5);
    gl_Position = projectionMatrix * mv;
    return;
  }
  if (kind == 1) {
    // Glut: wächst, glüht weiß-gelb → Farbe → dunkelrot, blendet aus
    size *= 0.55 + 0.9 * u;
    col = mix(vec3(1.0, 0.95, 0.8), col, smoothstep(0.0, 0.35, u)) * (1.0 - u * 0.65);
    alpha = (1.0 - smoothstep(0.55, 1.0, u)) * smoothstep(0.0, 0.06, age);
    mv.xy += position.xy * size * 0.5;
  } else {
    // Funke/Glitzer: Strich entlang der Flugrichtung im Bild, Kopf hell, kühlt ab (weiß → Farbe → rot), funkelt am Ende
    // Flugrichtung im Bild aus zwei Bahnpunkten (eine direkt gerechnete Geschwindigkeit ergab auf Metal/ANGLE NaN)
    vec4 m2 = viewMatrix * vec4(pyroPos(age + 0.02), 1.0);
    vec2 dv = (m2.xy - mv.xy) * 50.0;
    float sp = length(dv);
    vec2 dir = sp > 0.001 ? dv / sp : vec2(0.0, 1.0);
    vec2 perp = vec2(dir.y, -dir.x);   // so gedreht, dass das Rechteck nicht gespiegelt (= Rückseite) ist
    float sL = max(size * 2.5, min(size * 12.0, sp * 0.11));
    float sW = size * (1.0 - 0.4 * u);
    mv.xy += dir * (position.y * sL * 0.5) + perp * (position.x * sW * 0.5);
    col = mix(vec3(1.0, 0.97, 0.88), col, smoothstep(0.0, 0.15, u));
    col *= 1.0 - 0.55 * smoothstep(0.6, 1.0, u);
    alpha = 1.0 - smoothstep(0.7, 1.0, u);
    if (kind == 4) alpha *= step(0.45, h1(floor(age * 22.0) + a3.w * 97.0)) * 1.4;
    else if (u > 0.55) alpha *= 0.55 + 0.45 * step(0.3, h1(floor(age * 30.0) + a3.w * 31.0));
  }
  // nah an der Kamera ausblenden (keine bildfüllenden Flächen), sehr kleine Funken in der Ferne etwas kräftiger
  alpha *= smoothstep(0.8, 3.5, -mv.z);
  // Deckung: am hellen Taghimmel bringt reines Addieren kaum etwas – Funken/Glut ersetzen den Hintergrund zum Teil
  vC = vec4(col * alpha, alpha * 0.75);
  gl_Position = projectionMatrix * mv;
}`;

const FS = `
varying vec4 vC; varying vec2 vUv; varying float vKind; varying float vU;
void main() {
  int kind = int(vKind + 0.5);
  float r2 = dot(vUv, vUv);
  if (kind == 2) { if (vC.a < 0.01) discard; gl_FragColor = vec4(vC.rgb * vC.a, vC.a); return; }
  if (kind == 5) { float s5 = exp(-r2 * 2.5) * (1.0 - smoothstep(0.8, 1.0, r2)); if (s5 * vC.a < 0.004) discard; gl_FragColor = vC * s5; return; }
  float a;
  if (kind == 1 || kind == 3) a = exp(-r2 * 3.2) * (1.0 - smoothstep(0.85, 1.0, r2));
  else a = exp(-vUv.x * vUv.x * 5.0) * smoothstep(-1.0, 0.6, vUv.y) * (1.0 - smoothstep(0.7, 1.0, abs(vUv.y)));
  if (a < 0.004) discard;
  gl_FragColor = vec4(vC.rgb * a, vC.a * a);
}`;

export class PyroFX {
  constructor(scene) {
    this.scene = scene;
    this.plan = null; this.mesh = null; this.tau = -1; this.flash = { k: 0, col: [1, 1, 1] };
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: -1 }, uFlash: { value: 0 }, uPxK: { value: 1 } },
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, depthTest: true, fog: false, toneMapped: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
  }
  // Show vorbereiten (einmal je Zieldurchgang bzw. je Replay): geo = pyroGeo(track), opt = { tier, best, easy, seed }
  prepare(geo, opt) {
    const key = JSON.stringify([geo.p.map((x) => Math.round(x * 10)), opt.tier, !!opt.best, !!opt.easy, opt.seed]);
    if (key === this.key && this.mesh) return this.plan;
    this.key = key; this.geo = geo;
    this.dispose();
    const P = this.plan = pyroPlan(geo, opt);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const D = P.data, n = P.n;
    const A = [new Float32Array(n * 4), new Float32Array(n * 4), new Float32Array(n * 4), new Float32Array(n * 4)];
    for (let i = 0; i < n; i++) for (let a = 0; a < 4; a++) for (let c = 0; c < 4; c++) A[a][i * 4 + c] = D[i * 16 + a * 4 + c];
    A.forEach((arr, a) => g.setAttribute('a' + a, new THREE.InstancedBufferAttribute(arr, 4)));
    g.instanceCount = n;
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.name = 'pyro'; this.mesh.visible = false;
    this.scene.add(this.mesh);
    this.sndNext = 0;
    return P;
  }
  // Zeit seit dem Zieldurchgang (Spielsekunden; < 0 oder nach dem Ende: unsichtbar). Liefert die Lichtblitz-Stärke.
  set(tau) {
    this.tau = tau;
    const P = this.plan, on = !!(P && this.mesh && tau >= 0 && tau <= P.end + 0.1);
    if (this.mesh) this.mesh.visible = on;
    if (!on) { this.flash.k = 0; return this.flash; }
    flashAt(P, tau, this.flash);
    this.mat.uniforms.uT.value = tau;
    this.mat.uniforms.uFlash.value = this.flash.k;
    return this.flash;
  }
  // Ton-Ereignisse zwischen zwei Zeitpunkten (Rückwärts/Sprung: neu ansetzen) → Liste der fälligen
  due(t0, t1) {
    const P = this.plan;
    if (!P || t1 < t0 || t1 - t0 > 0.5) { this.sndNext = P ? P.sounds.findIndex((s) => s.t > t1) : 0; if (this.sndNext < 0) this.sndNext = P ? P.sounds.length : 0; return []; }
    const out = [];
    while (this.sndNext < P.sounds.length && P.sounds[this.sndNext].t <= t1) { if (P.sounds[this.sndNext].t > t0 - 1e-6) out.push(P.sounds[this.sndNext]); this.sndNext++; }
    return out;
  }
  hide() { if (this.mesh) this.mesh.visible = false; this.flash.k = 0; this.tau = -1; }
  dispose() {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
  }
}
export { KIND };
