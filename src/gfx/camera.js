// Kameras: Verfolger (folgt Fahrzeug-Oben weich → dreht im Looping mit), Cockpit/Stoßstange,
// Streckenkameras (feste Masten an der Strecke, schwenken mit) für Replays.
import * as THREE from 'three';

const V = () => new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.mode = 'chase';
    this.pos = V(); this.up = new THREE.Vector3(0, 1, 0); this.fwd = new THREE.Vector3(0, 0, -1);
    this.look = V();
    this.init = false;
    this.trackCams = [];
    this.tcIdx = 0;
    this.fov = 62;
    this._t = V(); this._d = V(); this._u = V();
  }
  setTrackCams(track) {
    // Masten neben der Strecke an Stunt-Elementen und alle ~120 m
    const L = track.line, out = [];
    let lastS = -1e9;
    for (let i = 0; i < L.n; i += 3) {
      const pc = track.pieces[L.piece[i]];
      const want = (pc && pc.stunt && L.s[i] - lastS > 45) || L.s[i] - lastS > 120;
      if (!want) continue;
      lastS = L.s[i];
      const side = (out.length % 2) ? 1 : -1;
      const p = new THREE.Vector3(L.px[i] + L.bx[i] * side * 13, Math.max(L.py[i], 0) + 5.5, L.pz[i] + L.bz[i] * side * 13);
      out.push({ p, s: L.s[i], i });
    }
    this.trackCams = out;
  }
  cycle() {
    const modes = ['chase', 'far', 'bumper', 'track'];
    this.mode = modes[(modes.indexOf(this.mode) + 1) % modes.length];
    this.init = false;
    return this.mode;
  }
  update(dt, P, crashed, world, speed = 0) {
    const cam = this.cam;
    const cp = this._t.set(P.pos.x, P.pos.y, P.pos.z);
    const f = this._d.set(P.frame.f.x, P.frame.f.y, P.frame.f.z);
    const u = this._u.set(P.frame.u.x, P.frame.u.y, P.frame.u.z);
    if (crashed) { u.set(0, 1, 0); }
    if (!this.init) { this.fwd.copy(f); this.up.copy(u); this.init = true; this.pos.copy(cp).addScaledVector(f, -8).addScaledVector(u, 3); }
    const kf = 1 - Math.exp(-dt * (crashed ? 1.5 : 7));
    const ku = 1 - Math.exp(-dt * 3.2);
    this.fwd.lerp(f, kf).normalize();
    this.up.lerp(u, ku).normalize();
    let targetFov = 62 + Math.min(14, speed * 0.16);
    if (this.mode === 'chase' || this.mode === 'far') {
      const dist = this.mode === 'far' ? 11.5 : 6.8, h = this.mode === 'far' ? 3.8 : 2.15;
      const want = V().copy(cp).addScaledVector(this.fwd, -dist).addScaledVector(this.up, h);
      // Kamera nicht durch Bauwerke: Strahl vom Auto zur Wunschposition
      if (world) {
        const o = V().copy(cp).addScaledVector(this.up, 1.2);
        const d = V().subVectors(want, o); const L = d.length(); d.divideScalar(L);
        const hit = world.rayTrack(o.x, o.y, o.z, d.x, d.y, d.z, L, false);
        if (hit && hit.t > 0.8) want.copy(o).addScaledVector(d, hit.t - 0.5);
        const gy = world.terrain.height(want.x, want.z) + 0.6;
        if (want.y < gy) want.y = gy;
      }
      const kp = 1 - Math.exp(-dt * 14);
      this.pos.lerp(want, kp);
      cam.position.copy(this.pos);
      cam.up.copy(this.up);
      this.look.copy(cp).addScaledVector(this.fwd, 3.5).addScaledVector(this.up, 0.9);
      cam.lookAt(this.look);
    } else if (this.mode === 'bumper') {
      this.pos.copy(cp).addScaledVector(f, -0.2).addScaledVector(u, 0.62);
      cam.position.copy(this.pos);
      cam.up.copy(u);
      this.look.copy(this.pos).addScaledVector(f, 10);
      cam.lookAt(this.look);
      targetFov += 6;
    } else if (this.mode === 'track') {
      // nächster Mast vor/neben dem Auto
      let best = null, bd = 1e18;
      for (const c of this.trackCams) { const d = c.p.distanceToSquared(cp); if (d < bd) { bd = d; best = c; } }
      if (best) {
        cam.position.copy(best.p);
        cam.up.set(0, 1, 0);
        cam.lookAt(cp);
        targetFov = Math.max(18, Math.min(55, 900 / Math.max(8, Math.sqrt(bd))));
      }
    }
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 3);
    if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}
