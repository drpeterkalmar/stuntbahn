// Geisterauto: spielt die gespeicherte Bestfahrt (15 Hz, interpoliert) zeitgleich zum Rennen ab.
import * as THREE from 'three';
import { nitroLevel } from '../physics/extras.js';
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();

export class Ghost {
  constructor(data) { this.data = data; this.t = 0; this.pose = { pos: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }; }
  advance(dt, race) { if (race.state === 'running' || race.state === 'wreck' || race.state === 'reset' || race.state === 'finished') this.t = race.time; }
  sample(t) {
    const D = this.data; if (!D) return null;
    const f = t * D.hz, i = Math.min(D.frames - 2, Math.max(0, Math.floor(f))), a = Math.min(1, Math.max(0, f - i));
    const d = D.data, o = i * 8, p = o + 8;
    const P = this.pose;
    P.pos.x = d[o] + (d[p] - d[o]) * a; P.pos.y = d[o + 1] + (d[p + 1] - d[o + 1]) * a; P.pos.z = d[o + 2] + (d[p + 2] - d[o + 2]) * a;
    qa.set(d[o + 3], d[o + 4], d[o + 5], d[o + 6]).normalize(); qb.set(d[p + 3], d[p + 4], d[p + 5], d[p + 6]).normalize();
    qa.slerp(qb, a);
    P.q.x = qa.x; P.q.y = qa.y; P.q.z = qa.z; P.q.w = qa.w;
    P.done = f >= D.frames - 1;
    return P;
  }
  // Nitro-Stärke des Geists jetzt (gespeicherte Zünd-Zeiten, gleiche Hüllkurve wie im Rennen)
  nitro() {
    const N = this.data && this.data.nitro;
    if (!N || !N.length) return 0;
    for (const [a, b] of N) if (this.t >= a && this.t < b) return nitroLevel(this.t - a);
    return 0;
  }
  sync(vis) {
    const P = this.sample(this.t);
    if (!P) { vis.root.visible = false; return; }
    vis.root.position.set(P.pos.x, P.pos.y, P.pos.z);
    vis.root.quaternion.set(P.q.x, P.q.y, P.q.z, P.q.w);
  }
}
