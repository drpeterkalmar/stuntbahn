// n39 Minikarte im Rennen: kleine, schräg von oben gesehene 3D-Karte der GANZEN Strecke (Peter 10.10.2026: „3D-Minimap der
// Strecke“). Eigene kleine Szene, gezeichnet in ein kleines Render-Target (MSAA) mit 20 Hz (groß 30 Hz) und jedes Bild mit
// EINEM Draw-Call in die Ecke des Bildes kopiert (nach dem Kino-Look, vor nichts – das DOM-HUD liegt darüber).
//
// Inhalt (fünf Draw-Calls je Karten-Bild, nichts wird je Bild neu gebaut):
//   1. Grundplatte: dezente runde Scheibe unter der Strecke (Gelände nur angedeutet)
//   2. Schatten des Bands senkrecht auf der Platte (zeigt die Höhe: Brücken, Rampen, Spirale)
//   3. dunkler Rand des Bands, 4. leuchtendes Band (Höhe = Farbe: tief türkis, hoch warmweiß; Looping/Korkenzieher orange;
//      Röhre/Tunnel gestrichelt halbtransparent; Sprung = Lücke mit dünnem gepunktetem Bogen); der nächste Abschnitt
//      (Auto bis zum nächsten Checkpoint bzw. Ziel) gelb mit wanderndem Lauflicht
//   5. alle Marken als Punkte in Bildschirmgröße: Auto-Pfeil mit Blickrichtung (pulsierend), Start/Ziel kariert,
//      Checkpoints (erreicht grün, offen gelber Ring, nächster gelb pulsierend), Geist, Gegner (setMarkers, ab n34)
// Ansicht: mitdrehend (Fahrtrichtung oben, weich nachgeführt) oder Norden oben; 3D um 42° geneigt bzw. 2D Draufsicht
// derselben Geometrie. Ganze Strecke im Bild; sehr große Strecken (Radius > 620 m) im kleinen Bild als Ausschnitt um das
// Auto, weich nachgeführt. Groß (Tippen/Taste M): immer die ganze Strecke.
import * as THREE from 'three';
import { GLATT } from '../core/glatt.js';   // n42: durchsichtig + beidseitig in einem Durchgang
import { karteGeo } from '../track/kartegeo.js';
import { GpuZeit } from './kern/autopilot.js';

const P = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
// URL-Regler (A/B, Abstimmen): ?karte=3d|2d|0, ?kartenord=1|0, ?kartehz=20, ?karteneig=42 (Grad von senkrecht), ?kartemess=1
const ART_URL = { '3d': '3d', '2d': '2d', '0': 'aus', aus: 'aus' }[P.get('karte')] || null;
export const KARTE = {
  artUrl: ART_URL,
  nordUrl: P.get('kartenord') === '1' ? true : P.get('kartenord') === '0' ? false : null,
  hz: Math.max(5, Math.min(60, +(P.get('kartehz') || 20))),
  hzUrl: P.has('kartehz'),
  hzGross: 30,
  neigung: Math.max(0, Math.min(70, +(P.get('karteneig') || 42))) * Math.PI / 180,   // von senkrecht: 0 = Draufsicht
  fov: 30 * Math.PI / 180,
  rMax: 620,          // m: größerer Strecken-Radius → im kleinen Bild Ausschnitt um das Auto
  rAus: 430,          // m: Radius des Ausschnitts
  drehT: 0.45,        // s: Zeitkonstante, mit der die Karte der Fahrtrichtung folgt
  mess: P.get('kartemess') === '1',
  samples: P.has('kartems') ? +P.get('kartems') : 4,   // MSAA des Render-Targets (A/B)
  kopieAus: P.get('kartekopie') === '0',              // nur zum Messen: Kopie weglassen
};

// Schatten, Rand und Band in EINEM Draw-Call: drei Instanzen derselben Geometrie (gl_InstanceID 0 = Schatten auf der
// Platte, 1 = dunkler Rand, 2 = Band; Instanzen werden in dieser Reihenfolge gezeichnet). Tiefe: der Schatten liegt
// am weitesten weg, das Band wird um einen Hauch zur Kamera gezogen (statt polygonOffset) und gewinnt gegen den eigenen Rand;
// der Rand einer oberen Brücke verdeckt das untere Band.
const vsBand = `
attribute vec3 aSide; attribute vec4 aInfo;
uniform float uW, uRand, uFlatY, uH0, uHk;
varying vec4 vInfo; varying float vMode;
void main() {
  float mode = float(gl_InstanceID);
  float art = aInfo.z;
  float wk = art > 2.5 ? 0.34 : (art > 1.5 ? 0.85 : 1.0);
  float w = uW * wk + (mode > 0.5 && mode < 1.5 ? uRand : 0.0);
  vec3 p = position + aSide * w;
  p.y = uH0 + (p.y - uH0) * uHk;   // Höhen überhöht (flache, große Strecken)
  if (mode < 0.5) p.y = uFlatY;
  vInfo = aInfo; vMode = mode;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  if (mode > 1.5) gl_Position.z -= 4e-4 * gl_Position.w;
}`;
const fsBand = `
uniform float uCarS, uZielS, uTotal, uTime, uDash, uZwei;
uniform vec3 uLo, uHi, uStunt, uRoehre, uLuft, uVor;
varying vec4 vInfo; varying float vMode;
void main() {
  float art = vInfo.z;
  if (vMode < 0.5) { if (art > 2.5 || uZwei > 0.5) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, 0.34); return; }   // Schatten
  if (vMode < 1.5) { if (art > 2.5) discard; gl_FragColor = vec4(0.015, 0.02, 0.035, 0.95); return; }   // Rand
  vec3 c = mix(uLo, uHi, smoothstep(0.0, 1.0, vInfo.y));
  float a = 1.0;
  if (art > 0.5 && art < 1.5) c = uStunt;
  if (art > 1.5) {
    float ph = fract(vInfo.x / uDash);
    if (ph > (art > 2.5 ? 0.38 : 0.62)) discard;
    a = art > 2.5 ? 0.6 : 0.62;
    c = art > 2.5 ? uLuft : mix(c, uRoehre, 0.55);
  }
  // nächster Abschnitt: vom Auto bis zum nächsten Checkpoint/Ziel, mit Lauflicht in Fahrtrichtung
  float d = mod(vInfo.x - uCarS + uTotal * 4.0, uTotal), zl = mod(uZielS - uCarS + uTotal * 4.0, uTotal);
  if (d < zl) {
    float fl = 0.5 + 0.5 * sin(d / uDash * 0.9 - uTime * 7.0);
    c = mix(c, uVor, (art > 0.5 && art < 1.5 ? 0.25 : 0.62) + 0.25 * fl);   // Looping bleibt orange erkennbar
  }
  // leuchtender Kern, Rand etwas dunkler
  c *= 1.0 - 0.32 * smoothstep(0.5, 1.0, abs(vInfo.w));
  gl_FragColor = vec4(c * a, a);
}`;
// Marken als Punkte in Bildschirmgröße. Form: 0 Scheibe mit Rand, 1 Ring, 2 kariert (Start/Ziel), 3 Glanz (Puls), 4 Pfeil
const vsPunkt = `
attribute vec3 aFarbe; attribute vec3 aForm;   // Größe (px), Form, Drehung (rad)
uniform float uPr, uH0, uHk;
varying vec3 vFarbe; varying vec2 vForm;
void main() {
  vFarbe = aFarbe; vForm = aForm.yz;
  gl_PointSize = aForm.x * uPr;
  vec3 p = position; p.y = uH0 + (p.y - uH0) * uHk;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const fsPunkt = `
varying vec3 vFarbe; varying vec2 vForm;
float sdTri(vec2 p) {   // Pfeil nach oben (Spitze bei y = −0.95)
  vec2 a = vec2(0.0, -0.95), b = vec2(0.72, 0.8), c = vec2(-0.72, 0.8), m = vec2(0.0, 1.02);
  // Pfeil = Dreieck minus Kerbe hinten
  vec2 e0 = b - a, e1 = c - b, e2 = a - c, v0 = p - a, v1 = p - b, v2 = p - c;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  float t = -sqrt(d.x) * sign(d.y);
  float k = length((p - m) * vec2(1.0, 1.4)) - 0.5;   // Kerbe hinten
  return max(t, -k);
}
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float form = vForm.x;
  float r = length(p);
  vec4 o;
  if (form < 0.5) {   // Scheibe mit dunklem Rand
    if (r > 1.0) discard;
    float a = 1.0 - smoothstep(0.86, 1.0, r);
    vec3 c = mix(vFarbe, vec3(0.02, 0.03, 0.05), smoothstep(0.62, 0.74, r));
    o = vec4(c, a);
  } else if (form < 1.5) {   // Ring
    if (r > 1.0) discard;
    float a = (1.0 - smoothstep(0.86, 1.0, r)) * smoothstep(0.36, 0.48, r);
    vec3 c = mix(vFarbe, vec3(0.02, 0.03, 0.05), smoothstep(0.7, 0.8, r) + (1.0 - smoothstep(0.42, 0.52, r)));
    o = vec4(c, a);
  } else if (form < 2.5) {   // kariert mit Rand
    vec2 q = abs(p);
    if (max(q.x, q.y) > 1.0) discard;
    float ch = mod(floor((p.x + 1.0) * 2.0) + floor((p.y + 1.0) * 2.0), 2.0);
    vec3 c = mix(vec3(0.05), vec3(1.0), ch);
    c = mix(c, vec3(0.9, 0.16, 0.11), step(0.8, max(q.x, q.y)));
    o = vec4(c, 1.0);
  } else if (form < 3.5) {   // Glanz (Puls um das Auto)
    if (r > 1.0) discard;
    float a = (1.0 - smoothstep(0.7, 1.0, r)) * smoothstep(0.45, 0.75, r) * 0.9;
    o = vec4(vFarbe, a * 0.75);
  } else {   // Pfeil, gedreht
    float cs = cos(vForm.y), sn = sin(vForm.y);
    vec2 q = vec2(cs * p.x + sn * p.y, -sn * p.x + cs * p.y);
    float d = sdTri(q / 0.92);
    if (d > 0.06) discard;
    float a = 1.0 - smoothstep(0.0, 0.06, d);
    vec3 c = mix(vec3(1.0), vFarbe, 1.0 - smoothstep(-0.13, -0.07, d));   // weißer Rand, rote Füllung
    o = vec4(c, a);
  }
  gl_FragColor = vec4(o.rgb * o.a, o.a);
}`;
// Kopie in die Bildecke: abgerundete Ecken, dunkler halbtransparenter Grund (vormultipliertes Alpha). Darunter die
// Grundplatte: Sichtstrahl je Pixel (inverse Kamera-Matrix des letzten Karten-Bilds) mit der Ebene unter der Strecke
// geschnitten → runde Scheibe mit weichem Rand und feinem 80-m-Raster (Gelände nur angedeutet). Kostet keinen eigenen Draw-Call.
const vsBlit = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const fsBlit = `
uniform sampler2D tMap; uniform vec2 uSize; uniform float uRad, uBg;
uniform mat4 uInvVP; uniform vec3 uPl;   // Platte: Mitte x, z, Radius
uniform float uPlY, uRaster;
varying vec2 vUv;
vec4 platte() {
  vec2 n = vUv * 2.0 - 1.0;
  vec4 a = uInvVP * vec4(n, -1.0, 1.0), b = uInvVP * vec4(n, 1.0, 1.0);
  vec3 p0 = a.xyz / a.w, p1 = b.xyz / b.w;
  float t = (uPlY - p0.y) / (p1.y - p0.y);
  if (t < 0.0 || t > 1.0) return vec4(0.0);
  vec2 q = mix(p0, p1, t).xz;
  float r = length(q - uPl.xy) / uPl.z;
  if (r > 1.0) return vec4(0.0);
  float al = 0.30 * (1.0 - smoothstep(0.82, 1.0, r));
  vec2 g = abs(fract(q / uRaster) - 0.5);
  float lin = 1.0 - smoothstep(0.0, 0.035, min(g.x, g.y) - 0.465);
  vec3 c = mix(vec3(0.16, 0.24, 0.30), vec3(0.32, 0.45, 0.52), lin * 0.55);
  float rand = smoothstep(0.955, 0.975, r) * (1.0 - smoothstep(0.985, 1.0, r));
  c = mix(c, vec3(0.45, 0.62, 0.70), rand * 0.6);
  al = max(al, rand * 0.35);
  return vec4(c * al, al);
}
void main() {
  vec2 p = vUv * uSize, h = uSize * 0.5;
  vec2 q = abs(p - h) - (h - uRad);
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRad;
  float m = 1.0 - smoothstep(-1.0, 0.5, sd);
  vec4 t = texture2D(tMap, vUv);
  vec4 pl = platte();
  t = vec4(t.rgb + pl.rgb * (1.0 - t.a), t.a + pl.a * (1.0 - t.a));
  vec3 bg = vec3(0.035, 0.05, 0.07);
  vec3 c = t.rgb + bg * uBg * (1.0 - t.a);
  float a = t.a + uBg * (1.0 - t.a);
  gl_FragColor = vec4(c * m, a * m);
}`;

const col = (h) => new THREE.Color(h);
const MAXP = 72;   // Punkte: Auto (Pfeil + Glanz), Start, Checkpoints, Geist, Gegner

export class Minikarte {
  constructor(renderer, opt = {}) {
    this.r = renderer;
    this.art = '3d';          // '3d' | '2d' | 'aus'
    this.nord = false;
    this.gross = false;
    this.sichtbar = false;
    this.marken = [];         // Gegner (n34): [{ pos: [x, y, z] | {x, y, z}, farbe }]
    this.scene = new THREE.Scene();
    this.cam3 = new THREE.PerspectiveCamera(30, 1, 1, 10000);
    this.cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 10000);
    this.geo = null;
    this.rt = null;
    this.acc = 1e9;
    this.t = 0;
    this.yaw = null;          // Blickrichtung der Karte (0 = Norden/−z oben)
    this.ziel = null;         // Mittelpunkt/Radius der Ansicht (weich)
    this.stats = { bilder: 0, kopien: 0, ms: 0, msMax: 0, gpuNeuMs: null, gpuKopieMs: null, rt: [0, 0], drawsNeu: 0 };
    this.gpu = KARTE.mess ? new GpuZeit(renderer.getContext()) : null;
    this.gpu2 = KARTE.mess ? new GpuZeit(renderer.getContext()) : null;
    this.darfMessen = opt.darfMessen || (() => true);
    const U = (v) => ({ value: v });
    this.uBand = {
      uW: U(7), uRand: U(2), uH0: U(0), uHk: U(1), uMode: U(0), uFlatY: U(0), uCarS: U(0), uZielS: U(0), uTotal: U(1), uTime: U(0), uDash: U(20),
      uLo: U(col('#3fd6ff')), uHi: U(col('#fff3cf')), uStunt: U(col('#ff9437')), uRoehre: U(col('#c9b8ff')), uLuft: U(col('#bfe9ff')), uVor: U(col('#ffe03a')),
    };
    // vormultipliertes Alpha in den Shadern → Mischung ONE / ONE_MINUS_SRC_ALPHA
    const pm = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
    this.uBand.uZwei = U(0);
    this.matBand = new THREE.ShaderMaterial({ uniforms: this.uBand, vertexShader: vsBand, fragmentShader: fsBand, transparent: true, side: THREE.DoubleSide, forceSinglePass: GLATT.einseitig, depthWrite: true, depthTest: true, ...pm });
    this.uPlatte = { uPl: U(new THREE.Vector3(0, 0, 1)), uPlY: U(0), uRaster: U(80), uInvVP: U(new THREE.Matrix4()) };
    // Punkte
    const pg = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAXP * 3); this.pFarbe = new Float32Array(MAXP * 3); this.pForm = new Float32Array(MAXP * 3);
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aFarbe', new THREE.BufferAttribute(this.pFarbe, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aForm', new THREE.BufferAttribute(this.pForm, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setDrawRange(0, 0);
    this.uPunkt = { uPr: U(1), uH0: this.uBand.uH0, uHk: this.uBand.uHk };
    this.punkte = new THREE.Points(pg, new THREE.ShaderMaterial({ uniforms: this.uPunkt, vertexShader: vsPunkt, fragmentShader: fsPunkt, transparent: true, depthTest: false, depthWrite: false, ...pm }));
    this.punkte.frustumCulled = false; this.punkte.renderOrder = 10;
    this.scene.add(this.punkte);
    // Kopie in die Bildecke
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    bg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this.uBlit = { tMap: U(null), uSize: U(new THREE.Vector2(1, 1)), uRad: U(10), uBg: U(0.6), ...this.uPlatte };
    this.blit = new THREE.Mesh(bg, new THREE.ShaderMaterial({ uniforms: this.uBlit, vertexShader: vsBlit, fragmentShader: fsBlit, transparent: true, depthTest: false, depthWrite: false, ...pm }));
    this.blit.frustumCulled = false;
    this.blitScene = new THREE.Scene(); this.blitScene.add(this.blit);
    this.blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._cc = new THREE.Color(); this._v = new THREE.Vector3(); this._w = new THREE.Vector3();
  }

  // Strecke: Geometrie EINMAL bauen (kartegeo.js) – danach nur noch Uniforms und die Punkt-Puffer
  setTrack(track) {
    this.dispose(false);
    if (!track || !track.line || track.line.n < 2) { this.geo = null; return; }
    const t0 = performance.now();
    const K = karteGeo(track);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(K.pos, 3));
    g.setAttribute('aSide', new THREE.BufferAttribute(K.side, 3));
    g.setAttribute('aInfo', new THREE.BufferAttribute(K.info, 4));
    g.setIndex(new THREE.BufferAttribute(K.index, 1));
    g.instanceCount = 3;   // Schatten, Rand, Band
    this.mBand = new THREE.Mesh(g, this.matBand); this.mBand.frustumCulled = false; this.mBand.renderOrder = 1; this.scene.add(this.mBand);
    const R = K.R + track.line.hw[0] + 8;
    // Höhe überhöhen, bis der Höhenbereich ~9 % des Strecken-Radius ausmacht (höchstens ×3; Gelände meist ×1)
    const hk = Math.max(1, Math.min(3, (0.09 * K.R) / Math.max(1, K.hmax - K.hmin)));
    this.uBand.uH0.value = K.hmin; this.uBand.uHk.value = hk;
    this.uBand.uFlatY.value = K.hmin - 1.5;
    this.uPlatte.uPl.value.set(K.cx, K.cz, R * 1.06); this.uPlatte.uPlY.value = K.hmin - 2;
    this.uBand.uTotal.value = K.closed ? K.total : K.total * 4 + 1000;   // offene Strecke: kein Umlauf
    this.bandGeo = g;
    this.K = K;
    this.track = track;
    this.geo = { R, cx: K.cx, cz: K.cz, hmin: K.hmin, hmax: K.hmin + (K.hmax - K.hmin) * hk, hw: track.line.hw[0] || 7.3, hk };
    this.stats.hoehe = +hk.toFixed(2);
    this.yaw = null; this.ziel = null; this.fit = null; this.acc = 1e9;
    // Shader gleich beim Laden übersetzen (sonst Hänger im ersten Rennbild)
    try { this.r.compile(this.scene, this.cam3); this.r.compile(this.blitScene, this.blitCam); } catch { /* optional */ }
    this.stats.bauMs = +(performance.now() - t0).toFixed(1);
    this.stats.punkte = K.m; this.stats.dreiecke = K.index.length / 3;
  }
  // Gegner/weitere Fahrer (n34): Liste von { pos: [x, y, z] oder {x, y, z}, farbe: '#ff5040' | 0xff5040 | [r, g, b] }
  setMarkers(list) { this.marken = Array.isArray(list) ? list.slice(0, MAXP - 24) : []; }
  setStil(art, nord) { if (art !== this.art || !!nord !== this.nord) { this.art = art; this.nord = !!nord; this.acc = 1e9; } }
  toggleGross() { this.gross = !this.gross; this.acc = 1e9; return this.gross; }

  // je Bild: z = { sichtbar, rect: {x, y, w, h} (CSS-Pixel, oben links), car: {pos, vel}, idx (Linienindex des Autos),
  //   zielIdx (nächster Checkpoint bzw. Start/Ziel), cps: [idx …], cpNext, startIdx, geist: {x, y, z} | null }
  update(dt, z) {
    this.sichtbar = !!(z && z.sichtbar && this.geo && this.art !== 'aus' && z.rect && z.rect.w > 8);
    if (!this.sichtbar) { this.acc = 1e9; return; }
    this.z = z;
    this.t += dt;
    // Fahrtrichtung (aus dem Tempo in der Ebene; im Stand die Ausrichtung des Autos), weich nachgeführt
    const v = z.car.vel, f = z.car.fwd;
    let soll = null;
    if (v && Math.hypot(v.x, v.z) > 3) soll = Math.atan2(v.x, -v.z);
    else if (f && Math.hypot(f.x, f.z) > 0.2) soll = Math.atan2(f.x, -f.z);
    if (soll != null) this.kurs = soll;
    const ziel = this.nord ? 0 : (this.kurs ?? 0);
    if (this.yaw == null) this.yaw = ziel;
    else { let d = ziel - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * (1 - Math.exp(-dt / KARTE.drehT)); }
    // Ausschnitt: ganze Strecke; sehr große Strecken im kleinen Bild um das Auto
    const G = this.geo, p = z.car.pos;
    let cx = G.cx, cz = G.cz, R = G.R;
    if (!this.gross && G.R > KARTE.rMax) {
      R = KARTE.rAus;
      let dx = p.x - G.cx, dz = p.z - G.cz;
      const l = Math.hypot(dx, dz), mx = G.R - R;
      if (l > mx) { dx *= mx / l; dz *= mx / l; }
      cx = G.cx + dx; cz = G.cz + dz;
    }
    if (!this.ziel) this.ziel = { cx, cz, R };
    else { const k = 1 - Math.exp(-dt / 0.6); this.ziel.cx += (cx - this.ziel.cx) * k; this.ziel.cz += (cz - this.ziel.cz) * k; this.ziel.R += (R - this.ziel.R) * k; }
    this.acc += dt;
  }

  // VOR dem Bild des Spiels: ggf. Karten-Bild neu (20/30 Hz). Davor statt mitten im Bild, damit der Zeichendurchgang des
  // Hauptbildes (MSAA, volle Auflösung) nicht für das Render-Target unterbrochen werden muss – gemessen kostete die
  // Unterbrechung auf ANGLE/Metal 1–9 ms GPU je Bild (mit der Bildgröße wachsend), die Karte selbst fast nichts.
  vorher(rect) {
    if (!this.sichtbar) return;
    const r = this.r, t0 = performance.now(), pr = r.getPixelRatio();
    const W = Math.max(8, Math.round(rect.w * pr)), H = Math.max(8, Math.round(rect.h * pr));
    if (!this.rt || this.rt.width !== W || this.rt.height !== H) {
      if (this.rt) this.rt.dispose();
      this.rt = new THREE.WebGLRenderTarget(W, H, { samples: KARTE.samples, depthBuffer: true, type: THREE.UnsignedByteType, format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace });
      this.rt.texture.generateMipmaps = false; this.rt.texture.minFilter = THREE.LinearFilter; this.rt.texture.magFilter = THREE.LinearFilter;
      this.stats.rt = [W, H];
      this.acc = 1e9;
    }
    this._neu = false;
    const hz = this.gross ? KARTE.hzGross : KARTE.hzUrl ? KARTE.hz : (this.hz || KARTE.hz);
    if (this.acc < 1 / hz) return;
    this.acc = this.acc > 1 ? 0 : this.acc % (1 / hz);
    const mess = this.gpu && this.darfMessen();
    if (mess) this.gpu.anfang();
    const c0 = r.info.render.calls;
    this.zeichneKarte(W, H, pr);
    if (mess) { this.gpu.ende(); if (this.gpu.ms != null) this.stats.gpuNeuMs = this.gpu.ms; }
    this.stats.drawsNeu = r.info.render.calls - c0;
    this.stats.bilder++; this._neu = true;
    this._msNeu = performance.now() - t0;
  }

  // NACH dem Bild des Spiels: Kopie in die Ecke (ein Draw-Call, im selben Durchgang wie das Bild)
  kopie(rect) {
    if (!this.sichtbar || !this.rt || KARTE.kopieAus) return;
    const r = this.r, t0 = performance.now(), pr = r.getPixelRatio();
    const mess = this.gpu2 && this.darfMessen();
    if (mess) this.gpu2.anfang();
    // Viewport in CSS-Pixeln (three rechnet die Pixeldichte ein), y von unten
    const ac = r.autoClear;
    r.autoClear = false;
    const cssH = r.getSize(this._sz || (this._sz = new THREE.Vector2())).y;
    const vp = r.getViewport(this._vp || (this._vp = new THREE.Vector4()));
    if (r.getRenderTarget() !== null) r.setRenderTarget(null);
    r.setViewport(rect.x, cssH - rect.y - rect.h, rect.w, rect.h);
    this.uBlit.tMap.value = this.rt.texture;
    this.uBlit.uSize.value.set(this.rt.width, this.rt.height);
    this.uBlit.uRad.value = (rect.rad ?? 12) * pr;
    r.render(this.blitScene, this.blitCam);
    r.setViewport(vp);
    r.autoClear = ac;
    if (mess) { this.gpu2.ende(); if (this.gpu2.ms != null) this.stats.gpuKopieMs = this.gpu2.ms; }
    this.stats.kopien++;
    const ms = performance.now() - t0 + (this._neu ? this._msNeu : 0);
    this.stats.ms = ms; this.stats.msMax = Math.max(this.stats.msMax * 0.995, ms);
    if (KARTE.mess) { const q = this._neu ? (this.stats.cpuNeu || (this.stats.cpuNeu = [])) : (this.stats.cpuKopie || (this.stats.cpuKopie = [])); q.push(+ms.toFixed(3)); if (q.length > 600) q.shift(); }
  }

  zeichneKarte(W, H, pr) {
    const r = this.r, z = this.z, G = this.geo, Zi = this.ziel, K = KARTE;
    const L = this.track.line;
    const zwei = this.art === '2d';
    const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const hs = Math.max(4, G.hmax - G.hmin), hm = (G.hmin + G.hmax) / 2;
    const el = zwei ? Math.PI / 2 : Math.PI / 2 - K.neigung;
    const ganz = Zi.R >= G.R - 1;
    const Rv = Math.hypot(Zi.R, hs * 0.5) * 1.04 + G.hw;
    let cam, ppm;
    if (zwei) {
      cam = this.cam2;
      const a = W / H, e = Rv * 1.04;
      cam.left = -e * Math.max(1, a); cam.right = e * Math.max(1, a); cam.top = e / Math.min(1, a); cam.bottom = -e / Math.min(1, a);
      cam.near = 1; cam.far = hs + 600;
      cam.position.set(Zi.cx, G.hmax + 300, Zi.cz);
      cam.up.set(fx, 0, fz);
      cam.lookAt(Zi.cx, hm, Zi.cz);
      cam.updateProjectionMatrix();
      ppm = H / (cam.top - cam.bottom);
    } else {
      cam = this.cam3;
      const d = Rv * 1.06 / Math.tan(K.fov / 2);
      cam.fov = K.fov * 180 / Math.PI; cam.aspect = W / H;
      cam.position.set(Zi.cx - fx * d * Math.cos(el), hm + d * Math.sin(el), Zi.cz - fz * d * Math.cos(el));
      cam.up.set(0, 1, 0);
      cam.lookAt(Zi.cx, hm, Zi.cz);
      cam.near = Math.max(1, d - Rv * 1.6 - hs); cam.far = d + Rv * 1.6 + hs;
      cam.updateProjectionMatrix();
      ppm = H / (2 * d * Math.tan(K.fov / 2));
    }
    cam.updateMatrixWorld();
    // Ganze Strecke: Bildausschnitt genau einpassen – Streckenpunkte mit der echten Kamera projizieren (Perspektive: die
    // nahe Kante ist größer), Rechteck um alle Punkte auf das Bild ziehen (Rand ~11 px für Band und Marken), weich (0,4 s)
    // nachgeführt, damit Drehen nicht ruckt. Die Verschiebung/Skalierung im Bildraum steckt in der Projektionsmatrix.
    if (ganz) {
      const KP = this.K.pos, v = this._v, H0 = G.hmin, hk = G.hk;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let q = 0; q < KP.length; q += 24) {   // jeder 4. Kartenpunkt (≤ 24 m Abstand, der Rand deckt den Rest)
        v.set(KP[q], H0 + (KP[q + 1] - H0) * hk, KP[q + 2]).project(cam);
        if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x; if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y;
      }
      const rx = 1 - 22 * pr / W, ry = 1 - 22 * pr / H;   // ~11 px Rand: Pfeil am Rand nicht angeschnitten
      const soll = { s: Math.min(2 * rx / Math.max(1e-3, x1 - x0), 2 * ry / Math.max(1e-3, y1 - y0)), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
      const dt = this.t - (this._tFit ?? -1e9); this._tFit = this.t;
      const k = dt > 1 || !this.fit ? 1 : 1 - Math.exp(-dt / 0.4);
      const F = this.fit || (this.fit = { ...soll });
      for (const q of ['s', 'cx', 'cy']) F[q] += (soll[q] - F[q]) * k;
      const M = this._m || (this._m = new THREE.Matrix4());
      M.set(F.s, 0, 0, -F.s * F.cx, 0, F.s, 0, -F.s * F.cy, 0, 0, 1, 0, 0, 0, 0, 1);
      cam.projectionMatrix.premultiply(M);
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      ppm *= F.s;
    } else this.fit = null;
    // Grundplatte in der Kopie: inverse Kamera-Matrix dieses Karten-Bilds
    this.uPlatte.uInvVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
    // Breiten in Welt-m aus Pixeln (mindestens ~3 px Band, 1 px Rand)
    const U = this.uBand;
    U.uW.value = Math.max(G.hw * 0.9, 1.7 * pr / ppm);
    U.uRand.value = 1.15 * pr / ppm;
    U.uDash.value = 7 * pr / ppm;
    U.uTime.value = this.t;
    U.uCarS.value = L.s[Math.max(0, Math.min(L.n - 1, z.idx | 0))];
    U.uZielS.value = L.s[Math.max(0, Math.min(L.n - 1, z.zielIdx | 0))];
    U.uZwei.value = zwei ? 1 : 0;
    this.uPunkt.uPr.value = pr;
    // ----- Punkte -----
    let n = 0;
    const put = (x, y, zz, farbe, size, form, rot = 0) => {
      if (n >= MAXP) return;
      this.pPos[n * 3] = x; this.pPos[n * 3 + 1] = y; this.pPos[n * 3 + 2] = zz;
      const c = this._cc;
      if (Array.isArray(farbe)) c.setRGB(farbe[0], farbe[1], farbe[2]); else c.set(farbe);
      this.pFarbe[n * 3] = c.r; this.pFarbe[n * 3 + 1] = c.g; this.pFarbe[n * 3 + 2] = c.b;
      this.pForm[n * 3] = size; this.pForm[n * 3 + 1] = form; this.pForm[n * 3 + 2] = rot;
      n++;
    };
    const at = (i) => [L.px[i], L.py[i] + 1, L.pz[i]];
    const puls = 0.5 + 0.5 * Math.sin(this.t * Math.PI * 2 * 1.4);
    // Start/Ziel
    if (z.startIdx != null) { const q = at(z.startIdx); put(q[0], q[1], q[2], 0xffffff, 10 + (z.cpNext >= (z.cps || []).length ? 3 * puls : 0), 2); }
    // Checkpoints: erreicht grün, offen gelber Ring, nächster gelb (pulsierend)
    (z.cps || []).forEach((ci, k) => {
      const q = at(ci);
      if (k < z.cpNext) put(q[0], q[1], q[2], 0x47d16a, 7, 0);
      else if (k === z.cpNext) put(q[0], q[1], q[2], 0xffd23d, 9 + 3 * puls, 0);
      else put(q[0], q[1], q[2], 0xffd23d, 9, 1);
    });
    // Geist, Gegner
    if (z.geist) put(z.geist.x, z.geist.y + 1, z.geist.z, 0x9fe0ff, 8, 0);
    for (const m of this.marken) {
      const q = m && (Array.isArray(m.pos) ? m.pos : m.pos ? [m.pos.x, m.pos.y, m.pos.z] : null);
      if (q) put(q[0], q[1] + 1, q[2], m.farbe ?? 0xff5a3a, m.groesse || 8, 0);
    }
    // Auto: Glanz (Puls) + Pfeil in Fahrtrichtung (Drehung im Bild aus der Projektion zweier Punkte)
    const p = z.car.pos;
    const a = this._v.set(p.x, p.y + 1, p.z).project(cam);
    const hx = z.car.vel && Math.hypot(z.car.vel.x, z.car.vel.z) > 3 ? z.car.vel.x : (z.car.fwd ? z.car.fwd.x : fx);
    const hz2 = z.car.vel && Math.hypot(z.car.vel.x, z.car.vel.z) > 3 ? z.car.vel.z : (z.car.fwd ? z.car.fwd.z : fz);
    const hl = Math.hypot(hx, hz2) || 1;
    const b = this._w.set(p.x + hx / hl * 30, p.y + 1, p.z + hz2 / hl * 30).project(cam);
    const rot = Math.atan2((b.x - a.x) * W, (b.y - a.y) * H);   // Bildschirm: 0 = nach oben
    put(p.x, p.y + 1, p.z, 0xff3b2f, 24 + 10 * puls, 3);
    put(p.x, p.y + 1, p.z, 0xff2a1f, 17 + 1.6 * puls, 4, rot);
    const pg = this.punkte.geometry;
    pg.attributes.position.needsUpdate = true; pg.attributes.aFarbe.needsUpdate = true; pg.attributes.aForm.needsUpdate = true;
    pg.setDrawRange(0, n);
    // ----- zeichnen -----
    const cc = r.getClearColor(this._cc2 || (this._cc2 = new THREE.Color())), ca = r.getClearAlpha();
    const rt0 = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    const ac = r.autoClear; r.autoClear = false;
    r.render(this.scene, cam);
    r.autoClear = ac;
    r.setClearColor(cc, ca);
    r.setRenderTarget(rt0);
  }

  dispose(alles = true) {
    if (this.mBand) { this.scene.remove(this.mBand); this.mBand = null; }
    if (this.bandGeo) { this.bandGeo.dispose(); this.bandGeo = null; }
    if (alles && this.rt) { this.rt.dispose(); this.rt = null; }
  }
}
