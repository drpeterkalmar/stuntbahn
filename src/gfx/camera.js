// Kameras: Verfolger (folgt Fahrzeug-Oben weich → dreht im Looping mit), Cockpit (Fahrerplatz, dreht mit
// dem Auto), Stoßstange, Streckenkameras (feste Masten an der Strecke, schwenken mit) für Replays.
import * as THREE from 'three';

const V = () => new THREE.Vector3();
export const CAM_MODES = ['chase', 'cockpit', 'far', 'bumper', 'track'];
export const CAM_NAMES = { chase: 'Verfolger', cockpit: 'Cockpit', far: 'Hubschrauber', bumper: 'Stoßstange', track: 'Streckenkamera' };
// Cockpit: Augenpunkt in Auto-Koordinaten (x rechts, y oben, z hinten): Fahrer links, ~1 m über der Straße
export const EYE = { x: -0.34, y: 0.45, z: 0.12 };
// Festes Sichtfeld im Cockpit: 75° waagrecht (Querformat); vertikal daraus, begrenzt auf 34–75° (Hochformat)
export function cockpitFov(aspect) {
  const v = 2 * Math.atan(Math.tan(37.5 * Math.PI / 180) / Math.max(0.2, aspect)) * 180 / Math.PI;
  return Math.max(34, Math.min(75, v));
}
const clamp = (x, a) => Math.max(-a, Math.min(a, x));
const LAG_MAX = 3.0; // m: größter Verzug des Verfolgers hinter dem Auto (Tempo-Nachführung)

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
    this.lastCp = V(); this.hasCp = false;
    this.view = 'chase';     // tatsächlich gezeigte Ansicht (Cockpit → Verfolger beim Wrack)
    // Cockpit: geglättete Lage, Kopf-Feder (Landungen), Hilfsobjekte
    this.cq = new THREE.Quaternion(); this.cInit = false;
    this.bob = 0; this.bobV = 0; this.lastP = V(); this.lastV = V(); this.aUp = 0; this.hasLast = 0;
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._e = new THREE.Euler();
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
    const modes = CAM_MODES;
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
    if (!this.init) { this.cInit = false; this.fwd.copy(f); this.up.copy(u); this.init = true; this.pos.copy(cp).addScaledVector(f, -6).addScaledVector(u, 2.3); this.baseY = cp.y; this.airK = 0; this.hasCp = false; }
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
    // Tempo-Sichtfeld: bis ~315 km/h wie bisher +14°, darüber (seit Vmax ~580 km/h) sanft bis +20°
    let targetFov = 62 + Math.min(14, speed * 0.16) + 6 * Math.max(0, Math.min(1, (speed - 70) / 85));
    // Cockpit beim Wrack: kurz in den Verfolger (wie im Original), danach wieder zurück ins Cockpit
    const view = this.mode === 'cockpit' && crashed ? 'chase' : this.mode;
    if (view !== this.view && view === 'cockpit') this.cInit = false;
    this.view = view;
    if (view === 'cockpit') {
      this.cockpit(dt, P, cp);
      return;
    }
    const hadCp = this.hasCp;
    this.hasCp = false;
    if (view === 'chase' || this.mode === 'far') {
      this.hasCp = hadCp;
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
      // Nachführung: Verzug hinter dem Auto ~ Tempo/14 (bei 100 km/h ~2 m, wirkt lebendig). Bei hohem Tempo
      // (Vmax ~580 km/h) wären das > 11 m – daher wird die Kamera vorab um einen Teil der Autobewegung
      // mitgenommen, der Verzug bleibt höchstens LAG_MAX m (bis 27.09.2026: nur das Nachziehen).
      const kp = 1 - Math.exp(-dt * 14);
      if (this.hasCp && !crashed) {
        const vcar = this._h.subVectors(cp, this.lastCp), stepLen = vcar.length();
        const v = stepLen / Math.max(dt, 1e-4), carry = v > 1 ? Math.max(0, 1 - LAG_MAX * 14 / v) : 0;
        if (stepLen < 30) this.pos.addScaledVector(vcar, carry);   // kein Mitnehmen bei Teleport (Reset)
      }
      this.pos.lerp(want, kp);
      cam.position.copy(this.pos);
      cam.up.copy(this.up);
      this.look.copy(cp).addScaledVector(this.fwd, 3.5).addScaledVector(this.up, 0.9);
      cam.lookAt(this.look);
      this.lastCp.copy(cp); this.hasCp = true;
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
  // Cockpit: Kamera = Fahrerauge, dreht voll mit dem Auto (Looping, Korkenzieher). Gegen Übelkeit am Handy:
  // Federungs-Nicken/-Wanken nur zur Hälfte, Lage leicht geglättet (~60 ms), Kopf federt bei Landungen
  // höchstens 4 cm nach, festes Sichtfeld (kein Tempo-Zoom).
  cockpit(dt, P, cp) {
    const cam = this.cam, q = this._q.set(P.q.x, P.q.y, P.q.z, P.q.w);
    let pitch = 0, roll = 0;
    const w = P.wheels;
    if (w) {
      const cf = (w[0].comp + w[1].comp) / 2, cr = (w[2].comp + w[3].comp) / 2;
      const cl = (w[0].comp + w[2].comp) / 2, cR = (w[1].comp + w[3].comp) / 2;
      pitch = clamp(Math.atan2(cf - cr, 2.72), 0.08);   // > 0: Nase eingefedert
      roll = clamp(Math.atan2(cl - cR, 1.73), 0.08);    // > 0: links eingefedert
    }
    // Kopf-Feder: Beschleunigung längs Auto-Oben (aus der Bewegung, auch im Replay) → Kopf sinkt/hebt sich
    const u = this._u.set(P.frame.u.x, P.frame.u.y, P.frame.u.z);
    if (!this.cInit) { this.cq.copy(q); this.bob = 0; this.bobV = 0; this.aUp = 0; this.hasLast = 0; this.cInit = true; }
    if (dt > 1e-4) {
      const vx = (cp.x - this.lastP.x) / dt, vy = (cp.y - this.lastP.y) / dt, vz = (cp.z - this.lastP.z) / dt;
      if (this.hasLast >= 2) {
        const a = ((vx - this.lastV.x) * u.x + (vy - this.lastV.y) * u.y + (vz - this.lastV.z) * u.z) / dt;
        this.aUp += (clamp(a, 150) - this.aUp) * Math.min(1, dt * 25);
      }
      if (this.hasLast >= 1) this.lastV.set(vx, vy, vz);
      this.hasLast = Math.min(2, this.hasLast + 1);
      const n = Math.min(8, Math.ceil(dt / 0.004)), h = Math.min(dt, 0.1) / n;
      for (let i = 0; i < n; i++) { this.bobV += (-110 * this.bob - 12.6 * this.bobV - 0.04 * this.aUp) * h; this.bob += this.bobV * h; }
      this.bob = clamp(this.bob, 0.04);
    }
    this.lastP.copy(cp);
    // Ziel-Lage: Auto-Lage mit halbierter Federungsbewegung, Blick 3° gesenkt (+ Nicken mit dem Kopf)
    this._e.set(0.5 * pitch - 3 * Math.PI / 180 + this.bob * 0.6, 0, -0.5 * roll);
    const target = this._q2.copy(q).multiply(new THREE.Quaternion().setFromEuler(this._e));
    if (this.cq.angleTo(target) > 0.9) this.cq.copy(target);
    else this.cq.slerp(target, 1 - Math.exp(-dt * 16));
    const eye = this._h.set(EYE.x, EYE.y, EYE.z).applyQuaternion(this.cq);
    this.pos.copy(cp).add(eye).addScaledVector(u, this.bob);
    cam.position.copy(this.pos);
    cam.quaternion.copy(this.cq);
    cam.up.copy(u);
    this.look.copy(this.pos).addScaledVector(this._d.set(0, 0, -1).applyQuaternion(this.cq), 10);
    this.fov = cockpitFov(cam.aspect);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}
