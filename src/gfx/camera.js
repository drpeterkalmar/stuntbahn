// Kameras: Verfolger (folgt Fahrzeug-Oben weich → dreht im Looping mit), Cockpit (Fahrerplatz, dreht mit
// dem Auto), Stoßstange, Streckenkameras (feste Masten an der Strecke, schwenken mit) für Replays.
import * as THREE from 'three';
import { Tracker } from '../ai/autopilot.js';
import { ROAD_HW, WORLD_SCALE } from '../track/defs.js';

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
// Hochformat (Handy hochkant): Verfolger höher, weiter hinten, größeres vertikales Sichtfeld, Blick weiter
// voraus → Auto im unteren Drittel, mehr Strecke voraus. Anteil p = 0 (quer/Desktop, unverändert) … 1 (≤ 0,5).
// Dazu blickt der Verfolger anteilig (aim) auf einen Punkt der Strecke aimDist + aimSpeed·v Meter voraus: Kurven
// laufen hochkant sonst seitlich aus dem schmalen Bild.
// Abgestimmt mit tests/hochformat_cam.py (Auto im unteren Drittel, Strecke voraus im Bild, Auto nie am Rand).
// aimDist wächst mit dem Weltmaßstab (Kurvenradien = Feld; bis 27.09.2026 40 m)
export const PORTRAIT = { vfov: 88, dist: 2.2, h: 3.6, look: 12, lookUp: -0.5, speedFov: 0.5, aim: 0.5, aimDist: 40 * WORLD_SCALE, aimSpeed: 0.6 };
export function portraitK(aspect) { return Math.max(0, Math.min(1, (1 - aspect) / 0.5)); }
const clamp = (x, a) => Math.max(-a, Math.min(a, x));
const AIM_MAX = 14 * Math.PI / 180;   // hochkant: größtes Eindrehen in die Kurve
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
    // Kameraschütteln (Verfolger): Anregung aus dem Federweg der Räder (Bodenwellen), klingt schnell ab
    this.shake = 0; this.shT = 0; this.lastComp = null; this.shakeOn = true;
  }
  // sehr dezent: höchstens ~4 cm, Frequenz 9–14 Hz; dazu ab ~250 km/h ein feines Tempo-Zittern (≤ 1 cm)
  shakeOffset(dt, P, speed) {
    const w = P.wheels;
    let ex = 0;
    if (w && dt > 1e-4) {
      if (!this.lastComp) this.lastComp = w.map((x) => x.comp || 0);
      for (let i = 0; i < w.length; i++) { const c = w[i].comp || 0; ex += Math.abs(c - this.lastComp[i]); this.lastComp[i] = c; }
      ex /= dt;   // m/s Federweg-Geschwindigkeit (Summe der vier Räder)
    }
    const want = Math.min(1, Math.max(0, ex - 0.6) / 5);
    this.shake = Math.max(this.shake * Math.exp(-dt * 7), want);
    this.shT += dt;
    const hi = Math.max(0, Math.min(1, (speed - 70) / 90));
    const a = this.shakeOn ? 0.04 * this.shake + 0.008 * hi : 0, t = this.shT;
    return [a * (Math.sin(t * 71) * 0.6 + Math.sin(t * 113) * 0.4), a * 0.6 * Math.sin(t * 89 + 1.3)];
  }
  setTrackCams(track) {
    // Masten neben der Strecke an Stunt-Bauwerken (Auto-Maßstab: ab 45 m Abstand) und sonst alle ~120 m
    // (wächst mit dem Weltmaßstab). Schritt nach Bogenlänge (~2 m), der Mast steht 8,5 m neben der Fahrbahnkante.
    // Stunt = Looping/Röhre/Luft/Sprung-Lippe selbst, nicht der Anfang des (im größeren Feld längeren) Stücks
    const L = track.line, out = [], WS = WORLD_SCALE, off = ROAD_HW + 8.5;
    const lip = new Uint8Array(L.n);
    for (const j of track.jumps || []) for (let i = Math.max(0, j.lipIdx - 8); i <= Math.min(L.n - 1, j.lipIdx); i++) lip[i] = 1;
    let lastS = -1e9, lastI = -1e9;
    for (let i = 0; i < L.n; i++) {
      if (L.s[i] - L.s[Math.max(0, lastI)] < 2 && lastI >= 0) continue;
      lastI = i;
      const pc = track.pieces[L.piece[i]];
      const structure = L.loop[i] || L.tube[i] || L.air[i] || lip[i] || (pc && pc.stunt && !/^(jump|loop|tube|tr_loop|tr_corklr|tr_pipe|tr_gap)/.test(pc.type));
      const want = (structure && L.s[i] - lastS > 45) || L.s[i] - lastS > 120 * WS;
      if (!want) continue;
      lastS = L.s[i];
      const side = (out.length % 2) ? 1 : -1;
      const p = new THREE.Vector3(L.px[i] + L.bx[i] * side * off, Math.max(L.py[i], 0) + 5.5, L.pz[i] + L.bz[i] * side * off);
      out.push({ p, s: L.s[i], i });
    }
    this.trackCams = out;
    this.line = L; this.trk = new Tracker(L); this.trkOk = false;
    this.cork = track.pieces.map((pc) => !!pc && /cork/.test(pc.kind || pc.type || ''));
    this.aimK = 0; this.hiK = 1; this.aimDir = new THREE.Vector3(); this.aimInit = false;
  }
  // Hochformat: Richtung (nur Gieren, ⟂ Kamera-Oben) zu einem Punkt der Fahrlinie voraus; Gewicht 0, wenn das
  // Auto weit neben der Strecke, im Looping/in der Röhre/im Korkenzieher, kopfüber oder in der Luft ist.
  // Nebenbei hiK: Anteil der Hochkant-Zusatzhöhe/-distanz – in Looping/Röhre/Korkenzieher weich auf 0 (die
  // höhere Kamera würde dort vom Bauwerk abgefangen und dicht ans Auto rücken)
  aimAhead(dt, cp, speed, pk, air) {
    const L = this.line, tr = this.trk, PT = PORTRAIT;
    let want = 0, hi = 1;
    if (L && pk > 0) {
      tr.update(cp.x, cp.y, cp.z, !this.trkOk);
      this.trkOk = tr.dist < 25;
      const stunt = this.trkOk && (this.up.y < 0.6 || this.stuntAhead(tr.idx, Math.max(18, 0.4 * speed)));
      if (stunt) hi = 0;
      if (this.trkOk && !air && !stunt) {
        const n = L.n, D = PT.aimDist + PT.aimSpeed * speed;
        let i = tr.idx, acc = 0;
        for (let k = 0; k < n && acc < D; k++) {
          const j = i + 1 < n ? i + 1 : (L.closed ? 0 : i);
          if (j === i) break;
          acc += Math.hypot(L.px[j] - L.px[i], L.py[j] - L.py[i], L.pz[j] - L.pz[i]);
          i = j;
        }
        const a = this._a || (this._a = new THREE.Vector3());
        a.set(L.px[i] - cp.x, L.py[i] - cp.y, L.pz[i] - cp.z).addScaledVector(this.up, -a.dot(this.up));
        if (a.lengthSq() > 1) {
          a.normalize();
          if (!this.aimInit) { this.aimDir.copy(a); this.aimInit = true; }
          this.aimDir.lerp(a, 1 - Math.exp(-dt * 4)).normalize();
          want = pk * PT.aim;
        }
      }
    }
    this.aimK += (want - this.aimK) * (1 - Math.exp(-dt * 3));
    this.hiK += (hi - this.hiK) * (1 - Math.exp(-dt * (hi ? 1.5 : 4)));
    return this.aimK;
  }
  // Looping, Röhre oder Korkenzieher/Wendel ab Linienpunkt i0 innerhalb der nächsten m Meter?
  stuntAhead(i0, m) {
    const L = this.line, n = L.n, C = this.cork;
    for (let i = i0, k = 0, acc = 0; k < n && acc <= m; k++) {
      if (L.loop[i] || L.tube[i] || C[L.piece[i]]) return true;
      const j = i + 1 < n ? i + 1 : (L.closed ? 0 : i);
      if (j === i) break;
      acc += Math.hypot(L.px[j] - L.px[i], L.py[j] - L.py[i], L.pz[j] - L.pz[i]);
      i = j;
    }
    return false;
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
    if (!this.init) { this.cInit = false; this.fwd.copy(f); this.up.copy(u); this.init = true; this.pos.copy(cp).addScaledVector(f, -6).addScaledVector(u, 2.3); this.baseY = cp.y; this.airK = 0; this.hasCp = false; this.trkOk = false; this.aimK = 0; this.hiK = 1; this.aimInit = false; }
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
    const pk = portraitK(cam.aspect), PT = PORTRAIT;
    let targetFov = 62 + pk * (PT.vfov - 62) + (1 - pk * PT.speedFov) * (Math.min(14, speed * 0.16) + 6 * Math.max(0, Math.min(1, (speed - 70) / 85)));
    if (pk > 0) targetFov = Math.min(targetFov, 62 + pk * (PT.vfov + 8 - 62) + 14 * (1 - pk));   // hochkant höchstens ~96°
    // Nitro: Sichtfeld etwas weiter (quer +8°, hochkant +4°) – nicht im Cockpit (festes Sichtfeld gegen Übelkeit)
    targetFov += (this.boost || 0) * (8 - 4 * pk);
    // Drehen (quer ↔ hoch): Sichtfeld sofort umstellen statt langsam nachzuziehen
    if (this.aspect !== cam.aspect) { if (this.aspect != null && Math.abs(portraitK(this.aspect) - pk) > 0.05) this.fov = targetFov; this.aspect = cam.aspect; }
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
      // Hochkant: Blick in die Kurve (Gewicht w) und Zusatzhöhe/-distanz (Anteil ph, in Loopings/Röhren weg)
      const w = this.aimAhead(dt, cp, speed, pk, this.airK > 0.5 || crashed), ph = pk * this.hiK;
      // Verfolger näher am Auto (Peter 27.09.: vorher 6.8 m / 2.15 m)
      const dist = (this.mode === 'far' ? 11.5 : crashed ? 8 : 5.0) + ph * PT.dist, h = (this.mode === 'far' ? 3.8 : crashed ? 3.0 : 1.75) + ph * PT.h;
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
      if (view === 'chase' && !crashed) {
        const [sy, sx] = this.shakeOffset(dt, P, speed);
        cam.position.addScaledVector(this.up, sy).addScaledVector(this._v || (this._v = V()).crossVectors(this.fwd, this.up).normalize(), sx);
      }
      cam.up.copy(this.up);
      // Blickrichtung: Fahrtrichtung, hochkant anteilig in die Kurve voraus gedreht (Neigung bleibt die des Autos)
      const dir = this._h.copy(this.fwd);
      if (w > 0.001) {
        // Gieren um Kamera-Oben: Anteil w des Winkels zum Zielpunkt, höchstens AIM_MAX (Auto bleibt sicher im
        // Bild); liegt der Punkt fast quer/hinter dem Auto (Wendel, Kehre), sanft aus
        const up = this.up, fh = V().copy(this.fwd).addScaledVector(up, -this.fwd.dot(up));
        if (fh.lengthSq() > 1e-4) {
          fh.normalize();
          const th = Math.acos(Math.max(-1, Math.min(1, fh.dot(this.aimDir))));
          const fade = Math.max(0, Math.min(1, (1.9 - th) / 0.5));
          const yaw = Math.min(w * th, AIM_MAX) * fade * Math.sign(V().crossVectors(fh, this.aimDir).dot(up));
          const side = V().crossVectors(up, fh);   // links von fh
          dir.copy(fh).multiplyScalar(Math.cos(yaw)).addScaledVector(side, Math.sin(yaw)).addScaledVector(up, this.fwd.dot(up)).normalize();
        }
      }
      this.look.copy(cp).addScaledVector(dir, 3.5 + ph * PT.look).addScaledVector(this.up, 0.9 + ph * PT.lookUp);
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
        targetFov = Math.max(18, Math.min(55, 900 / Math.max(8, Math.sqrt(bd)))) * (1 + 0.5 * pk);
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
