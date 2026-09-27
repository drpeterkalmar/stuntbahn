// Farbige Ideallinie (Fahrhilfe Mittel/Leicht): grün = Gas, gelb = vom Gas, rot = bremsen.
// Ein Band knapp über der Fahrbahn; Farbe aus dem Tempo-Profil (Ziel vs. erreichbares Tempo).
import * as THREE from 'three';

export class LineViz {
  constructor(scene) { this.scene = scene; this.mesh = null; }
  build(L, prof, track) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
    const n = L.n, w = 0.32;
    const pos = new Float32Array(n * 2 * 3), col = new Float32Array(n * 2 * 3), idx = [];
    const vt = prof.vt;
    for (let i = 0; i < n; i++) {
      const lift = 0.05;
      for (let s = 0; s < 2; s++) {
        const o = (i * 2 + s) * 3, sg = s ? w : -w;
        pos[o] = L.px[i] + L.bx[i] * sg + L.nx[i] * lift;
        pos[o + 1] = L.py[i] + L.by[i] * sg + L.ny[i] * lift;
        pos[o + 2] = L.pz[i] + L.bz[i] * sg + L.nz[i] * lift;
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
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide, fog: true });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.name = 'ideal-line';
    this.mesh.renderOrder = 2;
    this.scene.add(this.mesh);
  }
  update(camera, race, assist, mode) {
    if (!this.mesh) return;
    this.mesh.visible = mode === 'race' && (assist === 'medium' || assist === 'easy');
  }
}
