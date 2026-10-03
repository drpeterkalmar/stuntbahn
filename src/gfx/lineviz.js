// Farbige Ideallinie (Fahrhilfe Mittel/Leicht) wie bei Forza: grün = Gas, gelb = Gas weg, orange → rot = bremsen
// (je dunkler, desto stärker), blau = Luft. Ein Band knapp über der Fahrbahn; Farben aus dem Pedal-Plan des Tempo-
// Profils (profile.js pedalPlan: Soll-Verzögerung gegen Ausrollen, n14) – bis n13 eine Faustregel („rot, wenn das
// Ziel-Tempo in den nächsten 90 m um > 6 m/s fällt“), die weit vor dem Bremspunkt rot färbte.
// Scheitelpunkte (I.apex): flacher Keil von der Linie zum Innenrand, in Linienfarbe – zeigt, wo die Linie
// die Kurve innen berührt. Teil desselben Meshes, folgt also Sichtbarkeit und Stufe der Linie.
// Anzeige-Stufe (Einstellung „Ideallinie“): Aus / Dezent / Kräftig. Breite, Deckkraft, weicher Rand und
// Ausblenden in der Ferne sind Uniforms – ein Stufenwechsel baut nichts neu.
import * as THREE from 'three';
import { WORLD_SCALE } from '../track/defs.js';
import { pedalPlan } from '../ai/profile.js';
import { BRAKE_WARN } from '../game/warn.js';

// Dynamische Linie (n23, Peter 02.10.2026: „Die Ideallinie soll wie bei Rennspielen dynamisch anzeigen, ob ich zu schnell
// bin“): das Stück vor dem Auto bis zur nächsten Kurve färbt sich nach dem JETZIGEN Tempo – dieselbe Brems-Rechnung wie
// der Hinweis „Bremsen!“ (game/warn.js): grün = mit diesem Tempo kommt man mit normalem Bremsen hin, gelb = Gas weg,
// orange → rot = bremsen (je röter, desto stärker). Langsam bleibt die Bremszone grün/gelb. Weich überblendet (fade s),
// je Bild nur die Punkte im Fenster neu (Attribut-Teilupdate). Dahinter die Plan-Farben. ?dynlinie=0 = nur Plan-Farben.
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const DYN_LINE = { on: !(Q && Q.get('dynlinie') === '0'), fade: 0.15, back: 30, band: 0.06 };
// Farbe aus dem Brems-Bedarf r (warn.js): fließend grün → gelb → orange → rot
export function dynColor(r, out = [0, 0, 0]) {
  const C = LINE_COLORS, W = BRAKE_WARN, b = DYN_LINE.band;
  const mix = (a, c, u) => { u = Math.max(0, Math.min(1, u)); for (let k = 0; k < 3; k++) out[k] = a[k] + (c[k] - a[k]) * u; return out; };
  if (r < W.lift - b) return mix(C.gas, C.gas, 0);
  if (r < W.lift + b) return mix(C.gas, C.lift, (r - W.lift + b) / (2 * b));
  if (r < W.brake - b) return mix(C.lift, C.lift, 0);
  if (r < W.brake + b) return mix(C.lift, C.brakeLo, (r - W.brake + b) / (2 * b));
  return mix(C.brakeLo, C.brakeHi, (r - W.brake - b) / (1 - W.brake));
}

// Farben (linear, vor Tonemapping): Gas, Gas weg, Bremsen leicht → voll, Luft
export const LINE_COLORS = { gas: [0.15, 0.95, 0.25], lift: [1.0, 0.85, 0.1], brakeLo: [1.0, 0.55, 0.08], brakeHi: [1.0, 0.1, 0.08], air: [0.2, 0.7, 1.0] };
// Farbe einer Stelle aus dem Pedal-Plan (cls 0 Gas, 1 Gas weg, 2 bremsen, 3 Luft; brake 0 … 1 = nötiger Bremsdruck)
export function lineColor(cls, brake) {
  const C = LINE_COLORS;
  if (cls === 3) return C.air;
  if (cls === 1) return C.lift;
  if (cls === 2) { const u = Math.min(1, brake / 0.6); return C.brakeLo.map((x, k) => x + (C.brakeHi[k] - x) * u); }
  return C.gas;
}

// half = halbe Bandbreite (m), edge = ab welchem Anteil der Halbbreite es zum Rand hin ausblendet
// (0 = Verlauf über die ganze Breite, ~0,8 = fast harte Kante), near/far = Ausblenden mit der Entfernung (m)
// vom Auto – nicht von der Kamera, damit die Streckenkamera aus der Ferne die Linie am Auto trotzdem zeigt.
// near/far wachsen mit dem Weltmaßstab: Kurven und Bremspunkte liegen entsprechend weiter voraus
// (bis 27.09.2026: 60/115 bzw. 220/320 m)
const WS = WORLD_SCALE;
export const LINE_LEVELS = {
  off: { name: 'Aus' },
  soft: { name: 'Dezent', opacity: 0.28, half: 0.24, edge: 0.2, near: 60 * WS, far: 115 * WS },
  strong: { name: 'Kräftig', opacity: 0.55, half: 0.32, edge: 0.8, near: 220 * WS, far: 320 * WS },
};

const VERT = /* glsl */`
  attribute vec3 lcol;
  attribute vec3 bin;
  attribute float side;
  uniform float uHalf;
  uniform vec3 uFocus;
  varying vec3 vColor;
  varying float vSide;
  varying float vDist;
  void main() {
    vec4 wp = modelMatrix * vec4(position + bin * side * uHalf, 1.0);
    vColor = lcol; vSide = side; vDist = distance(wp.xyz, uFocus);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const FRAG = /* glsl */`
  uniform float uOpacity, uEdge, uNear, uFar;
  varying vec3 vColor;
  varying float vSide;
  varying float vDist;
  void main() {
    float a = uOpacity * (1.0 - smoothstep(uEdge, 1.0, abs(vSide))) * (1.0 - smoothstep(uNear, uFar, vDist));
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class LineViz {
  constructor(scene) {
    this.scene = scene; this.mesh = null;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uFocus: { value: new THREE.Vector3() }, uHalf: { value: 0.24 }, uOpacity: { value: 0.28 }, uEdge: { value: 0.2 }, uNear: { value: 60 }, uFar: { value: 115 } },
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide,
    });
    this.level = null;
  }
  build(L, prof, track) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
    const n = L.n, lift = 0.05;
    // je Linienpunkt zwei Ecken (side −1/+1); die Breite setzt der Vertex-Shader über die Binormale
    const pos = new Float32Array(n * 2 * 3), bin = new Float32Array(n * 2 * 3), col = new Float32Array(n * 2 * 3), side = new Float32Array(n * 2), idx = [];
    const plan = pedalPlan(L, prof);
    this.plan = plan;
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < 2; s++) {
        const o = (i * 2 + s) * 3;
        pos[o] = L.px[i] + L.nx[i] * lift; pos[o + 1] = L.py[i] + L.ny[i] * lift; pos[o + 2] = L.pz[i] + L.nz[i] * lift;
        bin[o] = L.bx[i]; bin[o + 1] = L.by[i]; bin[o + 2] = L.bz[i];
        side[i * 2 + s] = s ? 1 : -1;
      }
      const c = lineColor(L.air[i] ? 3 : plan.cls[i], plan.brake[i]);
      for (let s = 0; s < 2; s++) col.set(c, (i * 2 + s) * 3);
      if (i < n - 1 && !L.air[i] && !L.air[i + 1]) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const W = this.apexWedges(L, track, col);
    const P2 = new Float32Array(pos.length + W.pos.length), B2 = new Float32Array(bin.length + W.pos.length);
    const C2 = new Float32Array(col.length + W.col.length), S2 = new Float32Array(side.length + W.pos.length / 3);
    P2.set(pos); P2.set(W.pos, pos.length); B2.set(bin); C2.set(col); C2.set(W.col, col.length); S2.set(side);
    for (let k = 0; k < W.pos.length / 3; k++) idx.push(n * 2 + k);   // side = 0: keine Bandverbreiterung
    this.apexCount = W.pos.length / 9;
    // dynamische Farben: Plan-Farben je Linienpunkt (base), gezeigte Farben (cur), Bereich mit Abweichung (dynA … dynB)
    this.L = L; this.n = n; this.base = col.slice(0, n * 6); this.cur = null; this.dynA = -1; this.dynB = -1;
    this.apexAt = (I => { const m = new Map(); (I.apex || []).forEach((a, k) => m.set(a.i, k)); return m; })(L);
    this.t0 = null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P2, 3));
    g.setAttribute('bin', new THREE.BufferAttribute(B2, 3));
    g.setAttribute('lcol', new THREE.BufferAttribute(C2, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('side', new THREE.BufferAttribute(S2, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    g.boundingSphere.radius += 1;   // Bandbreite kommt erst im Shader dazu
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = 'ideal-line';
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    this.scene.add(this.mesh);
  }
  // Keil je Scheitel: Spitze kurz vor dem Innenrand, Basis (2,8 m lang) auf der Linie; leicht angehoben
  apexWedges(I, track, col) {
    const pos = [], cl = [];
    const B = track && track.line;
    if (!B || !I.apex) return { pos: new Float32Array(0), col: new Float32Array(0) };
    const lift = 0.06;
    for (const { i, side: sg } of I.apex) {
      const hw = B.hw[i], edge = sg * (hw - 0.25);     // Innenrand (Fahrbahnkante) relativ zur Basislinie
      const nx = I.nx[i] * lift, ny = I.ny[i] * lift, nz = I.nz[i] * lift;
      const lx = I.px[i] + nx, ly = I.py[i] + ny, lz = I.pz[i] + nz;
      const tip = [B.px[i] + B.bx[i] * edge + nx, B.py[i] + B.by[i] * edge + ny, B.pz[i] + B.bz[i] * edge + nz];
      const a = 1.4;
      const v0 = [lx + I.tx[i] * a, ly + I.ty[i] * a, lz + I.tz[i] * a], v1 = [lx - I.tx[i] * a, ly - I.ty[i] * a, lz - I.tz[i] * a];
      // Umlaufsinn egal (DoubleSide)
      pos.push(...v0, ...v1, ...tip);
      const c = [col[i * 6], col[i * 6 + 1], col[i * 6 + 2]];
      cl.push(...c, ...c, ...c);
    }
    return { pos: new Float32Array(pos), col: new Float32Array(cl) };
  }
  setLevel(level) {
    if (level === this.level) return;
    this.level = level;
    const P = LINE_LEVELS[level], u = this.mat.uniforms;
    if (!P || !P.opacity) return;
    u.uHalf.value = P.half; u.uOpacity.value = P.opacity; u.uEdge.value = P.edge; u.uNear.value = P.near; u.uFar.value = P.far;
  }
  // Nur im Rennen auf Leicht/Mittel und nicht „Aus“; Replay, Menü-Kamerafahrt und Original nie.
  // Die Fahrhilfe-Lenkung hängt nicht daran – das hier ist nur die Anzeige.
  update(camera, race, assist, mode, level = 'soft') {
    if (!this.mesh) return;
    this.setLevel(level);
    const c = race && race.car;
    if (c) this.mat.uniforms.uFocus.value.set(c.pos.x, c.pos.y, c.pos.z); else this.mat.uniforms.uFocus.value.copy(camera.position);
    this.mesh.visible = mode === 'race' && (assist === 'medium' || assist === 'easy') && !!(LINE_LEVELS[level] && LINE_LEVELS[level].opacity);
    const now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0, dt = this.t0 == null ? 0.016 : Math.min(0.1, now - this.t0);
    this.t0 = now;
    if (this.mesh.visible && DYN_LINE.on && race && race.state !== 'countdown') this.dynamic(race, dt);
    else if (this.dynA >= 0) this.resetDyn();
  }
  // Farbe der Punkte vor dem Auto (bis zur nächsten Kurve) aus dem jetzigen Tempo, weich überblendet; Punkte, die das
  // Fenster verlassen, laufen zurück auf die Plan-Farbe. Nur der geänderte Bereich wird hochgeladen.
  dynamic(race, dt) {
    const L = this.L, n = this.n, W = race.brakeWarn(), car = race.car;
    if (W.L.n !== n) return;
    const idx = race.ap.tr.idx, v = Math.max(0, car.fwdSpeed());
    if (!this.cur) this.cur = this.base.slice();
    // Fenster: Auto … nächste Kurve (mindestens 3 m voraus), höchstens horizon s bzw. hMin m
    const H = Math.max(BRAKE_WARN.hMin, v * BRAKE_WARN.horizon);
    let kEnd = -1;
    for (let c = 0, m = W.firstMin(idx); c < W.mins.length; c++, m++) {
      if (m >= W.mins.length) { if (!L.closed) break; m = 0; }
      const D = W.dist(idx, W.mins[m]);
      if (D > H) break;
      if (D >= 3) { kEnd = W.mins[m]; break; }
    }
    const wrap = (i) => (i >= n ? (L.closed ? i - n + 1 : n - 1) : i < 0 ? (L.closed ? i + n - 1 : 0) : i);
    const inWin = new Map();
    for (let i = idx, c = 0; c < n; c++) {
      const d = W.dist(idx, i);
      if (d > H || (kEnd >= 0 && i === kEnd)) { if (i === kEnd) inWin.set(i, d); break; }
      inWin.set(i, d);
      const j = wrap(i + 1); if (j === i) break; i = j;
    }
    const k = 1 - Math.exp(-dt / DYN_LINE.fade), tmp = [0, 0, 0], cur = this.cur, base = this.base;
    // Bereich: bisherige Abweichung + neues Fenster (in Index-Schritten ab dynA, mit Umlauf)
    if (this.dynA >= 0 && ((idx - this.dynA + n) % n) > n / 2) this.resetDyn();   // Rücksprung (Reset, Rückspulen): neu ab Auto
    const a = this.dynA >= 0 ? this.dynA : wrap(idx - 1), lenPrev = this.dynA >= 0 ? (this.dynB - this.dynA + n) % n : 0;
    const span = Math.min(n, Math.max(lenPrev + 2, (inWin.size ? ((([...inWin.keys()].pop()) - a + n) % n) + 2 : 2)));
    let lo = -1, hi = -1, up0 = n, up1 = -1, rLast = 0, rN = 0;
    for (let c = 0, i = a; c < span; c++, i = wrap(i + 1)) {
      if (L.air[i]) continue;
      const d = inWin.get(i);
      // Brems-Bedarf nur an jedem 3. Punkt neu rechnen (Punkte ~1 m auseinander; die Überblendung glättet) – spart am Handy
      if (d != null && rN++ % 3 === 0) rLast = W.ratio(idx, v, d);
      const t = d != null ? dynColor(rLast, tmp) : [base[i * 6], base[i * 6 + 1], base[i * 6 + 2]];
      let dev = 0;
      for (let q = 0; q < 3; q++) {
        const o = i * 6 + q, x = cur[o] + (t[q] - cur[o]) * k;
        cur[o] = x; cur[o + 3] = x;
        dev = Math.max(dev, Math.abs(x - base[o]));
      }
      if (d == null && dev < 0.004) { for (let q = 0; q < 6; q++) cur[i * 6 + q] = base[i * 6 + q]; }
      else { if (lo < 0) lo = i; hi = i; }
      up0 = Math.min(up0, i); up1 = Math.max(up1, i);
    }
    this.dynA = lo; this.dynB = hi;
    if (up1 >= up0) this.upload(up0, up1);
  }
  upload(i0, i1) {
    const attr = this.mesh.geometry.getAttribute('lcol'), arr = attr.array, cur = this.cur;
    arr.set(cur.subarray(i0 * 6, (i1 + 1) * 6), i0 * 6);
    attr.clearUpdateRanges ? attr.clearUpdateRanges() : null;
    if (attr.addUpdateRange) attr.addUpdateRange(i0 * 6, (i1 - i0 + 1) * 6);
    // Scheitel-Keile in Linienfarbe mitziehen
    const L = this.L;
    if (L.apex && L.apex.length) {
      const off = this.n * 6;
      let a0 = -1, a1 = -1;
      for (let i = i0; i <= i1; i++) {
        const w = this.apexAt.get(i);
        if (w == null) continue;
        for (let v = 0; v < 3; v++) for (let q = 0; q < 3; q++) arr[off + w * 9 + v * 3 + q] = cur[i * 6 + q];
        if (a0 < 0) a0 = w; a1 = w;
      }
      if (a0 >= 0 && attr.addUpdateRange) attr.addUpdateRange(off + a0 * 9, (a1 - a0 + 1) * 9);
    }
    attr.needsUpdate = true;
  }
  resetDyn() {
    if (!this.cur) return;
    this.cur.set(this.base);
    const attr = this.mesh.geometry.getAttribute('lcol');
    attr.array.set(this.base, 0);
    const L = this.L, off = this.n * 6;
    (L.apex || []).forEach((a, w) => { for (let v = 0; v < 3; v++) for (let q = 0; q < 3; q++) attr.array[off + w * 9 + v * 3 + q] = this.base[a.i * 6 + q]; });
    if (attr.clearUpdateRanges) attr.clearUpdateRanges();
    attr.needsUpdate = true;
    this.dynA = this.dynB = -1;
  }
}
