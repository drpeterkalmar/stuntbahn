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
    this._t = V(); this._d = V(); this._u = V(); this._h = V();
    this.airT = 0; this.airK = 0; this.baseY = 0;
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
    if (!this.init) { this.fwd.copy(f); this.up.copy(u); this.init = true; this.pos.copy(cp).addScaledVector(f, -6).addScaledVector(u, 2.3); this.baseY = cp.y; this.airK = 0; }
    // Flug (alle Räder frei, nicht in Looping/Röhre): Verfolger zieht nicht mit hoch, sondern bleibt auf
    // Absprunghöhe, etwas weiter hinten und waagrecht → der Sprung wirkt sichtbar hoch. airK blendet weich.
    this.airT = P.air && !crashed ? this.airT + dt : 0;
    const airOn = this.airT > 0.12 ? 1 : 0;
    this.airK += (airOn - this.airK) * (1 - Math.exp(-dt * (airOn ? 3.5 : 2.2)));
    if (this.airK < 0.02 && !airOn) this.baseY = cp.y;       // am Boden: Bezugshöhe = Auto
    else this.baseY = Math.min(cp.y, this.baseY + dt * 0.4); // im Flug: bleibt unten, folgt nur abwärts
    const kf = 1 - Math.exp(-dt * 7);
    const ku = 1 - Math.exp(-dt * 3.2);
    // Im Crash: Richtung von vor dem Unfall halten (Kamera dreht nicht mit dem Wrack), nur Oben → Welt
    if (!crashed) this.fwd.lerp(f, kf).normalize();
    else { this.fwd.y *= 0.9; this.fwd.normalize(); }
    // im Flug: Oben → Welt-Oben (Kamera kippt nicht mit der Nase des Autos)
    if (this.airK > 0.01 && (this.mode === 'chase' || this.mode === 'far')) u.lerp(this._h.set(0, 1, 0), this.airK).normalize();
    this.up.lerp(u, ku).normalize();
    let targetFov = 62 + Math.min(14, speed * 0.16);
    if (this.mode === 'chase' || this.mode === 'far') {
      // Verfolger näher am Auto (Peter 27.09.: vorher 6.8 m / 2.15 m)
      const dist = this.mode === 'far' ? 11.5 : crashed ? 8 : 5.0, h = this.mode === 'far' ? 3.8 : crashed ? 3.0 : 1.75;
      // Flug: Blickrichtung waagrecht, 1,5 m weiter zurück, Höhe bleibt bei der Absprunghöhe (85 %)
      const a = this.airK, back = this._h.copy(this.fwd);
      if (a > 0) { back.y *= 1 - a; back.normalize(); }
      const want = V().copy(cp).addScaledVector(back, -(dist + 1.5 * a)).addScaledVector(this.up, h);
      if (a > 0) want.y -= a * 0.85 * Math.max(0, cp.y - this.baseY);
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
