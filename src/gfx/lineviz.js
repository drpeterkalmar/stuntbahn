// Farbige Ideallinie (Fahrhilfe Mittel/Leicht): grün = Gas, gelb = vom Gas, rot = bremsen, blau = Luft.
// Ein Band knapp über der Fahrbahn; Farbe aus dem Tempo-Profil (Ziel vs. erreichbares Tempo).
// Anzeige-Stufe (Einstellung „Ideallinie“): Aus / Dezent / Kräftig. Breite, Deckkraft, weicher Rand und
// Ausblenden in der Ferne sind Uniforms – ein Stufenwechsel baut nichts neu.
import * as THREE from 'three';

// half = halbe Bandbreite (m), edge = ab welchem Anteil der Halbbreite es zum Rand hin ausblendet
// (0 = Verlauf über die ganze Breite, ~0,8 = fast harte Kante), near/far = Ausblenden mit der Entfernung (m)
// vom Auto – nicht von der Kamera, damit die Streckenkamera aus der Ferne die Linie am Auto trotzdem zeigt
export const LINE_LEVELS = {
  off: { name: 'Aus' },
  soft: { name: 'Dezent', opacity: 0.28, half: 0.24, edge: 0.2, near: 60, far: 115 },
  strong: { name: 'Kräftig', opacity: 0.55, half: 0.32, edge: 0.8, near: 220, far: 320 },
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
    const vt = prof.vt;
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < 2; s++) {
        const o = (i * 2 + s) * 3;
        pos[o] = L.px[i] + L.nx[i] * lift; pos[o + 1] = L.py[i] + L.ny[i] * lift; pos[o + 2] = L.pz[i] + L.nz[i] * lift;
        bin[o] = L.bx[i]; bin[o + 1] = L.by[i]; bin[o + 2] = L.bz[i];
        side[i * 2 + s] = s ? 1 : -1;
      }
      // Farbe: Bremszone wenn Zieltempo in den nächsten 40 m deutlich fällt
      let minAhead = vt[i];
      for (let k = i, acc = 0; k < n && acc < 45; k++) { minAhead = Math.min(minAhead, vt[k]); acc += k > i ? L.s[k] - L.s[k - 1] : 0; }
      const drop = vt[i] - minAhead;
      let c = [0.15, 0.95, 0.25];
      if (drop > 6) c = [1.0, 0.18, 0.1]; else if (drop > 2) c = [1.0, 0.85, 0.1];
      if (L.air[i]) c = [0.2, 0.7, 1.0];
      for (let s = 0; s < 2; s++) col.set(c, (i * 2 + s) * 3);
      if (i < n - 1 && !L.air[i] && !L.air[i + 1]) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('bin', new THREE.BufferAttribute(bin, 3));
    g.setAttribute('lcol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('side', new THREE.BufferAttribute(side, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    g.boundingSphere.radius += 1;   // Bandbreite kommt erst im Shader dazu
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = 'ideal-line';
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    this.scene.add(this.mesh);
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
  }
}
