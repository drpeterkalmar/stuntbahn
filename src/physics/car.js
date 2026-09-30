// Fahrzeugphysik (Arcade, aber echte Starrkörper-Dynamik): 4 Raycast-Federbeine, Reifenkräfte mit
// Haftungskreis, Luftwiderstand/Abtrieb, Karosserie-Kontakte als Impulse, Crash-Erkennung.
// Eigene Mini-Mathematik (keine Abhängigkeiten) → deterministisch, läuft in Node und im Browser.
// Körperachsen: x = rechts, y = oben, z = hinten (vorwärts = −z).
import { GRIP, ROLL, MAT, WORLD_SCALE } from '../track/defs.js';
import { G as GRAV, gravStep } from './air.js';
import { NITRO } from './extras.js';

// „Verirrt“: so weit draußen liegt nur noch der Bergkranz (wächst mit dem Weltmaßstab; bis 27.09.2026 950 m)
const LOST = 950 * WORLD_SCALE;

// Abstimmung „doppelt so schnell“ (Peter 27.09.2026: „km/h können gut doppelt so hoch werden“):
// Vmax ~586 statt 286 km/h. Viel mehr Leistung (2,2 MW), lange Übersetzung, mehr Abtrieb,
// Rennreifen (mu 1,5 statt 1,0: schnellere Kurven, kürzere Bremswege – die Strecken sind eng, ohne mehr
// Haftung bliebe das Tempo dort fast gleich).
// Neu: Antriebs- und Bremskraft wachsen mit der Aero-Last (aeroGrip) – die Reifen können bei Tempo mehr
// übertragen, weil der Abtrieb sie auf die Straße drückt. Lenkung, Federung und Stunt-Geometrie bleiben gleich.
export const CAR_DEF = {
  mass: 1300,
  inertia: [3000, 3300, 850],
  wheels: [
    { x: -0.86, z: -1.36, front: true },
    { x: 0.86, z: -1.36, front: true },
    { x: -0.88, z: 1.36, front: false },
    { x: 0.88, z: 1.36, front: false },
  ],
  mountY: 0.12, wheelR: 0.345, rest: 0.36, maxComp: 0.33,
  k: 70000, bumpStart: 0.22, bumpK: 260000, cComp: 4300, cReb: 6000,
  mu: 1.7, slip0: 0.085, rollH: 0.3,
  power: 2200000, maxDrive: 18000, driveFront: 0.5, brake: 27000, brakeFront: 0.6, aeroGrip: 1,
  dragK: 0.48, downK: 2.5, groundFx: 0.5, reverseMax: 9,
  steerMax: 0.6, steerSpeed: 3.0,
  gears: [0, 20, 35, 55, 82, 117, 165], idle: 900, redline: 7600,   // Gangspitzen m/s (bis 27.09.: 13 … 70)
};
// Mehr Bodenhaftung (Peter 28.09.2026: „Bei Original brauchen wir mehr Bodenhaftung“, n14): Reifen mu 1,5 → 1,7,
// Abtrieb 1,5 → 2,5 als Bodeneffekt (groundFx, wirkt nur nahe der Fahrbahn – Sprünge bleiben), Antrieb 42/58 →
// 50/50 (weniger Übersteuern beim Gasgeben in der Kurve). Dazu teilt build.js verwundene Fahrbahn fein auf (vorher
// ließ ein Sägezahn die Räder an Steilkurven-Eingängen abheben). Messung: FAHRGEFUEHL_BERICHT.md, tools/fahr_analyse.mjs.
// Werte bis n13 – URL ?grip=1 fährt zum Vergleich damit (und wertet in den Bestzeiten der alten Physik).
export const CAR_DEF_GRIP_ALT = { mu: 1.5, downK: 1.5, groundFx: 0, driveFront: 0.42 };
// Abstimmung bis 27.09.2026 (Vmax 286 km/h) – zum Vergleich (tools/tempo_measure.mjs, URL ?auto=alt)
export const CAR_DEF_ALT = {
  ...CAR_DEF, ...CAR_DEF_GRIP_ALT,
  mu: 1.0, power: 240000, maxDrive: 15500, brake: 27000, aeroGrip: 0, dragK: 0.43, downK: 1.1,
  gears: [0, 13, 22, 31, 41, 53, 70],
};

// Physik-Version für Bestzeiten/Geister (store.js): 1 = bis 27.09.2026, 2 = „doppelt so schnell“, 3 = mehr
// Bodenhaftung (n14, 29.09.2026). URL ?auto=alt / ?grip=1 fährt zum Vergleich mit der alten Abstimmung (und wertet
// dann auch in der alten Liste). GRIP_ALT: auch Fahrbahn-Aufteilung (build.js) und Profil-Reserven wie bis n13.
const urlQ = globalThis.location && globalThis.location.search ? new URLSearchParams(globalThis.location.search) : null;
export const GRIP_ALT = !!urlQ && (urlQ.get('grip') === '1' || urlQ.get('auto') === 'alt');
export const PHYS = (() => {
  if (urlQ && urlQ.get('auto') === 'alt') { Object.assign(CAR_DEF, CAR_DEF_ALT); return 1; }
  if (GRIP_ALT) { Object.assign(CAR_DEF, CAR_DEF_GRIP_ALT); return 2; }
  return 3;
})();

// Größter Lenkwinkel bei Tempo v (m/s) – gemeinsam für Physik und Autopilot
export function maxSteerAt(def, v) { return def.steerMax / (1 + Math.abs(v) / 15) + 0.035; }
// Aero-Last-Faktor: (Gewicht + Abtrieb) / Gewicht. Antrieb und Bremse wachsen damit (aeroGrip = 1), weil
// die Reifen unter Abtrieb entsprechend mehr übertragen können. Alte Abstimmung: aeroGrip = 0 → immer 1.
export function aeroLoad(def, vF) { return 1 + (def.aeroGrip || 0) * def.downK * vF * vF / (def.mass * 9.81); }

// Längsbeschleunigung bei Vollgas auf ebener Straße (m/s², ohne Rollwiderstand) – für Tempo-Profil/Messungen
export function driveAccel(def, v) {
  v = Math.max(1, Math.abs(v));
  return (Math.min(def.maxDrive * aeroLoad(def, v), def.power / v) - def.dragK * v * v) / def.mass;
}
// Planbare Bremsverzögerung bei Tempo v (m/s²): Grundwert (Asphalt, mit Reserve für den Regler) wächst mit
// der Aero-Last, dazu der halbe Luftwiderstand. Vollbremsung (gemessen, n14): Reibungsgrenze 1,25·mu·g·Aero-Last
// + Luftwiderstand (mu 1,5: 18,4·Aero-Last).
export function brakeDecel(def, v, base = 8) {
  return base * aeroLoad(def, v) + 0.5 * def.dragK * v * v / def.mass;
}
// Höchsttempo (m/s) auf ebener Straße: Vollgas reicht gerade noch für 0,3 m/s² (Rollwiderstand, Reserve)
export function topSpeed(def) {
  let v = 5;
  while (v < 250 && driveAccel(def, v) > 0.3) v += 0.25;
  return v;
}

// Karosserie-Sonden: [innen, außen, Art]  Art: 0 Boden, 1 Dach, 2 Front/Heck, 3 Seite
const PROBES = [];
for (const sx of [-0.78, 0.78]) for (const sz of [-1.75, 1.75]) PROBES.push([[sx, 0.12, sz], [sx, -0.24, sz], 0]);
PROBES.push([[0, 0.12, 0], [0, -0.26, 0], 0]);
for (const sx of [-0.55, 0.55]) for (const sz of [-0.55, 0.75]) PROBES.push([[sx, 0.15, sz], [sx, 0.72, sz], 1]);
PROBES.push([[0, 0.15, 0.1], [0, 0.78, 0.1], 1]);
for (const sx of [-0.7, 0.7]) { PROBES.push([[sx, 0.05, -1.5], [sx * 1.1, 0.02, -2.3], 2]); PROBES.push([[sx, 0.05, 1.5], [sx * 1.1, 0.05, 2.3], 2]); }
for (const sz of [-1.1, 1.1]) for (const sx of [-1, 1]) PROBES.push([[0, 0.12, sz], [sx * 0.98, 0.12, sz], 3]);
PROBES.push([[0, 0.1, -1.2], [0, 0.1, -2.35], 2]);
PROBES.push([[0, 0.1, 1.2], [0, 0.1, 2.35], 2]);

// ---- Quaternion/Vektor-Helfer (Objekte {x,y,z(,w)}) ----
function qrot(q, x, y, z, out) {
  const tx = 2 * (q.y * z - q.z * y), ty = 2 * (q.z * x - q.x * z), tz = 2 * (q.x * y - q.y * x);
  out.x = x + q.w * tx + (q.y * tz - q.z * ty);
  out.y = y + q.w * ty + (q.z * tx - q.x * tz);
  out.z = z + q.w * tz + (q.x * ty - q.y * tx);
  return out;
}
function qrotInv(q, x, y, z, out) {
  const c = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
  return qrot(c, x, y, z, out);
}

export class Car {
  constructor(def = CAR_DEF) {
    this.def = def;
    this.pos = { x: 0, y: 1, z: 0 };
    this.q = { x: 0, y: 0, z: 0, w: 1 };
    this.v = { x: 0, y: 0, z: 0 };
    this.w = { x: 0, y: 0, z: 0 };
    this.input = { steer: 0, throttle: 0, brake: 0, hold: false };
    this.steerAng = 0;
    this.wheels = def.wheels.map((w) => ({ ...w, comp: 0, prevComp: 0, contact: false, spin: 0, spinV: 0, mat: 0, nx: 0, ny: 1, nz: 0, hx: 0, hy: 0, hz: 0, load: 0, slip: 0, steer: 0 }));
    this.crash = null;
    this.onGround = 0;
    this.airTime = 0;
    this.gScale = 1; // Schwerkraft-Anteil (Luft-Faktor, air.js)
    // Extras (extras.js): Nitro-Stärke 0 … 1 (setzt die Rennlogik je Schritt), Hüpfer-Lage (Fahrbahn-Oben beim
    // Absprung; bis zur Landung gehalten)
    this.boost = 0;
    this.hopUp = null; this.hopT = 0;
    this.gear = 1; this.rpm = def.idle;
    this.time = 0;
    this.maxG = 0;
    this.assist = { level: 0, magnet: 0, grip: 1 };
    this.surfaceKind = 0;
    this.lastImpact = 0;
    this.upsideT = 0;
    this._t = { x: 0, y: 0, z: 0 };
    this.frame = { r: { x: 1, y: 0, z: 0 }, u: { x: 0, y: 1, z: 0 }, f: { x: 0, y: 0, z: -1 } };
    this.updateFrame();
  }

  // Pose setzen: Position p (Array), Vorwärtsrichtung fw, Oben up
  place(p, fw, up = [0, 1, 0], speed = 0) {
    // Rotationsmatrix aus (rechts, oben, hinten)
    let ux = up[0], uy = up[1], uz = up[2];
    let bx = -fw[0], by = -fw[1], bz = -fw[2];
    let rx = uy * bz - uz * by, ry = uz * bx - ux * bz, rz = ux * by - uy * bx;
    let l = Math.hypot(rx, ry, rz); rx /= l; ry /= l; rz /= l;
    ux = by * rz - bz * ry; uy = bz * rx - bx * rz; uz = bx * ry - by * rx;
    l = Math.hypot(ux, uy, uz); ux /= l; uy /= l; uz /= l;
    l = Math.hypot(bx, by, bz); bx /= l; by /= l; bz /= l;
    // Matrix -> Quaternion (Spalten r,u,b)
    const m00 = rx, m01 = ux, m02 = bx, m10 = ry, m11 = uy, m12 = by, m20 = rz, m21 = uz, m22 = bz;
    const tr = m00 + m11 + m22;
    const q = this.q;
    if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); q.w = 0.25 / s; q.x = (m21 - m12) * s; q.y = (m02 - m20) * s; q.z = (m10 - m01) * s; }
    else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); q.w = (m21 - m12) / s; q.x = 0.25 * s; q.y = (m01 + m10) / s; q.z = (m02 + m20) / s; }
    else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); q.w = (m02 - m20) / s; q.x = (m01 + m10) / s; q.y = 0.25 * s; q.z = (m12 + m21) / s; }
    else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); q.w = (m10 - m01) / s; q.x = (m02 + m20) / s; q.y = (m12 + m21) / s; q.z = 0.25 * s; }
    const d = this.def;
    const h = d.wheelR + d.rest - d.mass * 9.81 / 4 / d.k - d.mountY;
    this.pos.x = p[0] + ux * h; this.pos.y = p[1] + uy * h; this.pos.z = p[2] + uz * h;
    this.v.x = fw[0] * speed; this.v.y = fw[1] * speed; this.v.z = fw[2] * speed;
    this.w.x = this.w.y = this.w.z = 0;
    this.steerAng = 0; this.crash = null; this.upsideT = 0; this.airTime = 0; this.gScale = 1; this.hopUp = null;
    for (const w of this.wheels) { w.comp = w.prevComp = d.mass * 9.81 / 4 / d.k; w.contact = true; w.spinV = speed / d.wheelR; }
    this.updateFrame();
  }

  updateFrame() {
    const q = this.q, F = this.frame;
    qrot(q, 1, 0, 0, F.r); qrot(q, 0, 1, 0, F.u); qrot(q, 0, 0, -1, F.f);
  }

  speed() { return Math.hypot(this.v.x, this.v.y, this.v.z); }
  fwdSpeed() { const f = this.frame.f; return this.v.x * f.x + this.v.y * f.y + this.v.z * f.z; }

  // Welt-Inverse-Trägheit anwenden: out = I_w^-1 * t
  _invI(tx, ty, tz, out) {
    const b = qrotInv(this.q, tx, ty, tz, this._t);
    const I = this.def.inertia;
    return qrot(this.q, b.x / I[0], b.y / I[1], b.z / I[2], out);
  }

  // Impuls J im Punkt (px,py,pz) (Welt)
  _impulse(px, py, pz, jx, jy, jz) {
    const m = this.def.mass;
    this.v.x += jx / m; this.v.y += jy / m; this.v.z += jz / m;
    const rx = px - this.pos.x, ry = py - this.pos.y, rz = pz - this.pos.z;
    const tx = ry * jz - rz * jy, ty = rz * jx - rx * jz, tz = rx * jy - ry * jx;
    const dw = this._invI(tx, ty, tz, { x: 0, y: 0, z: 0 });
    this.w.x += dw.x; this.w.y += dw.y; this.w.z += dw.z;
  }
  // effektive inverse Masse im Punkt entlang n
  _kEff(px, py, pz, nx, ny, nz) {
    const rx = px - this.pos.x, ry = py - this.pos.y, rz = pz - this.pos.z;
    const cx = ry * nz - rz * ny, cy = rz * nx - rx * nz, cz = rx * ny - ry * nx;
    const a = this._invI(cx, cy, cz, { x: 0, y: 0, z: 0 });
    const ex = a.y * rz - a.z * ry, ey = a.z * rx - a.x * rz, ez = a.x * ry - a.y * rx;
    return 1 / this.def.mass + (ex * nx + ey * ny + ez * nz);
  }
  _pointVel(px, py, pz, out) {
    const rx = px - this.pos.x, ry = py - this.pos.y, rz = pz - this.pos.z;
    const w = this.w;
    out.x = this.v.x + (w.y * rz - w.z * ry);
    out.y = this.v.y + (w.z * rx - w.x * rz);
    out.z = this.v.z + (w.x * ry - w.y * rx);
    return out;
  }

  step(dt, world) {
    const d = this.def, F = this.frame, m = d.mass;
    this.time += dt;
    this.updateFrame();
    const inp = this.input;
    const wrecked = !!this.crash;
    const steerIn = wrecked ? 0 : inp.steer, thr = wrecked ? 0 : inp.throttle, brk = wrecked ? 0.3 : inp.brake;
    const vF = this.fwdSpeed();
    const sp = this.speed();
    // Lenkung (drehzahl-/tempoabhängiger Einschlag, begrenzte Lenkgeschwindigkeit)
    const maxSteer = maxSteerAt(d, vF);
    const target = steerIn * maxSteer;
    const ds = d.steerSpeed * dt;
    this.steerAng += Math.max(-ds, Math.min(ds, target - this.steerAng));
    this.steerAng = Math.max(-maxSteer, Math.min(maxSteer, this.steerAng));

    // Schwerkraft: im Flug nur AIR.factor (bis 27.09.2026 fest −9.81·m), Anteil aus dem letzten Schritt
    const gm = GRAV * this.gScale * m;
    let fx = 0, fy = -gm, fz = 0, tx = 0, ty = 0, tz = 0;
    const addForce = (px, py, pz, ax, ay, az) => {
      fx += ax; fy += ay; fz += az;
      const rx = px - this.pos.x, ry = py - this.pos.y, rz = pz - this.pos.z;
      tx += ry * az - rz * ay; ty += rz * ax - rx * az; tz += rx * ay - ry * ax;
    };

    // Antrieb (Allrad) / Bremse / Rückwärts
    let drive = 0, brake = brk;
    const aero = aeroLoad(d, vF);
    if (thr > 0.01) drive = thr * Math.min(d.maxDrive * aero, d.power / Math.max(Math.abs(vF), 1));
    if (brk > 0.01 && vF < 1.0 && thr < 0.01 && !inp.hold && !wrecked) { drive = -brk * d.maxDrive * 0.55 * (vF > -d.reverseMax ? 1 : 0); brake = 0; }

    // Federbeine
    const L = d.rest + d.wheelR;
    let contacts = 0, nAvgX = 0, nAvgY = 0, nAvgZ = 0;
    const tmp = { x: 0, y: 0, z: 0 }, vp = { x: 0, y: 0, z: 0 };
    for (const w of this.wheels) {
      const mp = qrot(this.q, w.x, d.mountY, w.z, tmp);
      const mx = this.pos.x + mp.x, my = this.pos.y + mp.y, mz = this.pos.z + mp.z;
      const hit = world.ray(mx, my, mz, -F.u.x, -F.u.y, -F.u.z, L, true);
      w.prevComp = w.comp;
      w.steer = w.front ? this.steerAng : 0;
      if (!hit) { w.contact = false; w.comp = 0; w.load = 0; w.spinV *= 0.995; w.spin += w.spinV * dt; continue; }
      w.contact = true; contacts++;
      w.comp = L - hit.t;
      w.hx = hit.x; w.hy = hit.y; w.hz = hit.z; w.nx = hit.nx; w.ny = hit.ny; w.nz = hit.nz; w.mat = hit.mat;
      nAvgX += hit.nx; nAvgY += hit.ny; nAvgZ += hit.nz;
      const rate = (w.comp - w.prevComp) / dt;
      let fs = d.k * w.comp + (rate > 0 ? d.cComp : d.cReb) * rate;
      if (w.comp > d.bumpStart) fs += d.bumpK * (w.comp - d.bumpStart);
      if (fs < 0) fs = 0;
      const nDotU = hit.nx * F.u.x + hit.ny * F.u.y + hit.nz * F.u.z;
      const load = fs * Math.max(0, nDotU);
      w.load = load;
      // Federkraft entlang Karosserie-Oben am Kontaktpunkt
      addForce(hit.x, hit.y, hit.z, F.u.x * fs, F.u.y * fs, F.u.z * fs);
      // Reifen: Richtungen in der Kontaktebene
      const cs = Math.cos(w.steer), sn = Math.sin(w.steer);
      // gelenkte Vorwärtsrichtung: f*cos + r*sin (positiver Lenkwinkel = nach rechts)
      let wfx = F.f.x * cs + F.r.x * sn, wfy = F.f.y * cs + F.r.y * sn, wfz = F.f.z * cs + F.r.z * sn;
      const dn = wfx * hit.nx + wfy * hit.ny + wfz * hit.nz;
      wfx -= dn * hit.nx; wfy -= dn * hit.ny; wfz -= dn * hit.nz;
      let l = Math.hypot(wfx, wfy, wfz) || 1; wfx /= l; wfy /= l; wfz /= l;
      // rechts = f × n
      const wrx = wfy * hit.nz - wfz * hit.ny, wry = wfz * hit.nx - wfx * hit.nz, wrz = wfx * hit.ny - wfy * hit.nx;
      // Kraftangriff etwas über dem Kontakt (weniger Wanken)
      const ax = hit.x + F.u.x * d.rollH, ay = hit.y + F.u.y * d.rollH, az = hit.z + F.u.z * d.rollH;
      this._pointVel(hit.x, hit.y, hit.z, vp);
      const vLong = vp.x * wfx + vp.y * wfy + vp.z * wfz;
      const vLat = vp.x * wrx + vp.y * wry + vp.z * wrz;
      const grip = (GRIP[w.mat] ?? 1) * d.mu * (this.assist.grip || 1);   // Fahrhilfe Mittel: mehr Reifenhaftung (n16)
      const fmax = grip * load;
      const slip = vLat / Math.max(Math.abs(vLong), 3.2);
      w.slip = slip;
      let fLat = -fmax * Math.tanh(slip / (d.slip0 * (this.assist.slipK || 1)));
      let fLong = 0;
      const share = w.front ? d.driveFront / 2 : (1 - d.driveFront) / 2;
      fLong += drive * share;
      if (brake > 0) {
        const bshare = w.front ? d.brakeFront / 2 : (1 - d.brakeFront) / 2;
        fLong -= brake * d.brake * aero * bshare * Math.max(-1, Math.min(1, vLong / 0.6));
      }
      const rr = (ROLL[w.mat] ?? 0.02) * load * Math.max(-1, Math.min(1, vLong / 0.4));
      fLong -= rr;
      // Haftungskreis
      const tot = Math.hypot(fLat, fLong);
      if (tot > fmax && tot > 0) { const s = fmax / tot; fLat *= s; fLong *= s; }
      addForce(ax, ay, az, wfx * fLong + wrx * fLat, wfy * fLong + wry * fLat, wfz * fLong + wrz * fLat);
      w.spinV = vLong / d.wheelR;
      w.spin += w.spinV * dt;
    }
    this.onGround = contacts;
    // Nitro: Zusatzschub am Schwerpunkt längs Auto-Vorwärts, anteilig zum Gas, nur mit Radkontakt
    if (this.boost > 0 && thr > 0.01 && contacts && !wrecked) {
      const fn = this.boost * NITRO.k * thr * Math.min(d.maxDrive * aero, d.power / Math.max(Math.abs(vF), 1));
      fx += F.f.x * fn; fy += F.f.y * fn; fz += F.f.z * fn;
    }
    // Hüpfer: bis zur Landung (erster Radkontakt nach dem Abheben) Lage halten
    if (this.hopUp) { this.hopT += dt; if (contacts && this.hopT > 0.25) this.hopUp = null; }
    if (contacts) this.airTime = 0; else this.airTime += dt;
    // Luft-Faktor nur, wenn alle Räder frei sind und das Auto nicht in Looping/Röhre steckt
    this.gScale = gravStep(this.gScale, contacts === 0 && !this.surfaceKind, dt, this.airTime);

    // Aerodynamik
    fx -= d.dragK * sp * this.v.x; fy -= d.dragK * sp * this.v.y; fz -= d.dragK * sp * this.v.z;
    const down = d.downK * vF * Math.abs(vF);
    // Abtrieb als Bodeneffekt (d.groundFx = Reichweite in m, n14): voll bis zur normalen Bodenfreiheit, darüber
    // linear weniger, 0 ab groundFx m Abstand – hält das Auto über Kuppen und an verwundenen Übergängen am Boden,
    // Sprünge bleiben (nach ~0,05 s über der Lippe außer Reichweite), der Hüpfer ist ausgenommen.
    // Ohne groundFx wie bis n13: nur mit mindestens 2 Rädern am Boden.
    let gf = contacts >= 2 ? 1 : 0;
    if (d.groundFx > 0) gf = this.hopUp ? gf : this.groundFactor(world, d.groundFx);
    this.downF = down * gf;
    if (gf > 0) { fx -= F.u.x * down * gf; fy -= F.u.y * down * gf; fz -= F.u.z * down * gf; }
    // Magnet-Hilfe (Fahrhilfe "Leicht"/Stunts): drückt auf die Fahrbahn, wenn Räder Kontakt haben
    if (this.assist.magnet > 0 && contacts >= 2) {
      const l = Math.hypot(nAvgX, nAvgY, nAvgZ) || 1;
      const g = this.assist.magnet * 9.81 * m * (this.surfaceKind ? 1.4 : 0.35);
      fx -= nAvgX / l * g; fy -= nAvgY / l * g; fz -= nAvgZ / l * g;
    }
    // Luft: leichte Dämpfung + optionale Lagehilfe
    if (!contacts) {
      const ad = 0.25 * dt;
      this.w.x *= 1 - ad; this.w.y *= 1 - ad; this.w.z *= 1 - ad;
      if (this.hopUp && !wrecked) this._hopHold(dt);
      else if (this.assist.air > 0 && !wrecked) this._airAssist(dt);
    }

    // Integration der Geschwindigkeiten
    this.v.x += fx / m * dt; this.v.y += fy / m * dt; this.v.z += fz / m * dt;
    const dw = this._invI(tx, ty, tz, { x: 0, y: 0, z: 0 });
    this.w.x += dw.x * dt; this.w.y += dw.y * dt; this.w.z += dw.z * dt;
    const g = Math.hypot(fx, fy + gm, fz) / m / 9.81;
    if (contacts) this.maxG = Math.max(this.maxG * 0.999, g);

    // Kontakte: Federbein-Anschläge + Karosserie
    this._contacts(dt, world);

    // Positionen integrieren
    this.pos.x += this.v.x * dt; this.pos.y += this.v.y * dt; this.pos.z += this.v.z * dt;
    const q = this.q, w = this.w;
    const hx = 0.5 * dt;
    const qx = q.x + hx * (w.x * q.w + w.y * q.z - w.z * q.y);
    const qy = q.y + hx * (w.y * q.w + w.z * q.x - w.x * q.z);
    const qz = q.z + hx * (w.z * q.w + w.x * q.y - w.y * q.x);
    const qw = q.w - hx * (w.x * q.x + w.y * q.y + w.z * q.z);
    const ql = Math.hypot(qx, qy, qz, qw);
    q.x = qx / ql; q.y = qy / ql; q.z = qz / ql; q.w = qw / ql;
    this.updateFrame();

    // Gang/Drehzahl (für Ton und Anzeige)
    const av = Math.abs(vF);
    const G = d.gears;
    if (this.gear < G.length - 1 && av > G[this.gear] * 0.97) this.gear++;
    if (this.gear > 1 && av < G[this.gear - 1] * 0.62) this.gear--;
    const lo = this.gear > 1 ? G[this.gear - 1] * 0.55 : 0;
    const rt = Math.max(0, Math.min(1.05, (av - lo) / (G[this.gear] - lo)));
    const target2 = d.idle + rt * (d.redline - d.idle) * (contacts ? 1 : 1) + (thr > 0 && av < 2 ? 1800 * thr : 0);
    this.rpm += (target2 - this.rpm) * Math.min(1, dt * 12);

    // Crash-Regeln
    if (!this.crash) {
      if (this.pos.y < -1.6) this.setCrash('Abgestürzt');
      if (F.u.y < -0.25 && contacts === 0 && this._roofTouch) this.setCrash('Überschlag');
      if (F.u.y < 0.0 && sp < 2.5 && (this._bodyTouch || contacts)) { this.upsideT += dt; if (this.upsideT > 0.8) this.setCrash('Auf dem Dach'); }
      else this.upsideT = Math.max(0, this.upsideT - dt);
      if (Math.abs(this.pos.x) > LOST || Math.abs(this.pos.z) > LOST) this.setCrash('Verirrt');
    }
  }

  // Bodeneffekt-Anteil 0 … 1: Strahl von der Wagenmitte nach unten (Karosserie-Unten); voll bis zur Ruhelage
  // (Bodenfreiheit wie beim Aufsetzen, place()), linear weniger bis range m darüber
  groundFactor(world, range) {
    const d = this.def, F = this.frame;
    const h0 = d.wheelR + d.rest - d.mass * 9.81 / 4 / d.k - d.mountY;
    const hit = world.ray(this.pos.x, this.pos.y, this.pos.z, -F.u.x, -F.u.y, -F.u.z, h0 + range, true);
    if (!hit) return 0;
    return Math.max(0, Math.min(1, 1 - (hit.t - h0) / range));
  }

  setCrash(reason, info) {
    if (this.crash) return;
    this.crash = { reason, t: this.time, pos: { ...this.pos }, info };
  }

  _contacts(dt, world) {
    const d = this.def, F = this.frame;
    this._roofTouch = false; this._bodyTouch = false;
    this.scrape = 0;   // Gleit-Tempo der Karosserie an Wand/Leitplanke/Boden in diesem Schritt (nur für den Ton, n16)
    const tmpA = { x: 0, y: 0, z: 0 }, tmpB = { x: 0, y: 0, z: 0 }, vp = { x: 0, y: 0, z: 0 };
    let bestPen = 0, cx = 0, cy = 0, cz = 0;
    const doContact = (px, py, pz, nx, ny, nz, pen, fric, rest, kind) => {
      this._pointVel(px, py, pz, vp);
      const vn = vp.x * nx + vp.y * ny + vp.z * nz;
      if (kind !== 4) this.scrape = Math.max(this.scrape, Math.hypot(vp.x - vn * nx, vp.y - vn * ny, vp.z - vn * nz));
      if (vn < 0) {
        if (!this.crash) {
          const info = { kind, vn: +vn.toFixed(1), n: [+nx.toFixed(2), +ny.toFixed(2), +nz.toFixed(2)], p: [+px.toFixed(1), +py.toFixed(1), +pz.toFixed(1)] };
          if (kind === 2 || kind === 3) { if (vn < -9.5) this.setCrash('Aufprall', info); }
          else if (kind === 0) { if (vn < -13) this.setCrash('Harte Landung', info); }
          else if (kind === 4) { if (vn < -15) this.setCrash('Harte Landung', info); }
        }
        this.lastImpact = Math.max(this.lastImpact, -vn);
        const k = this._kEff(px, py, pz, nx, ny, nz);
        const j = -(1 + rest) * vn / k;
        this._impulse(px, py, pz, nx * j, ny * j, nz * j);
        // Reibung
        this._pointVel(px, py, pz, vp);
        const vn2 = vp.x * nx + vp.y * ny + vp.z * nz;
        let vtx = vp.x - vn2 * nx, vty = vp.y - vn2 * ny, vtz = vp.z - vn2 * nz;
        const vt = Math.hypot(vtx, vty, vtz);
        if (vt > 1e-4) {
          vtx /= vt; vty /= vt; vtz /= vt;
          const kt = this._kEff(px, py, pz, vtx, vty, vtz);
          const jt = Math.min(vt / kt, fric * j);
          this._impulse(px, py, pz, -vtx * jt, -vty * jt, -vtz * jt);
        }
      }
      if (pen > bestPen) { bestPen = pen; cx = nx; cy = ny; cz = nz; }
    };
    // Federbein-Endanschlag
    for (const w of this.wheels) {
      if (!w.contact) continue;
      if (w.comp > d.maxComp) doContact(w.hx, w.hy, w.hz, w.nx, w.ny, w.nz, w.comp - d.maxComp, 0.0, 0.0, 4);
    }
    // Karosserie
    for (const [a, b, kind] of PROBES) {
      const A = qrot(this.q, a[0], a[1], a[2], tmpA);
      const B = qrot(this.q, b[0], b[1], b[2], tmpB);
      const ax = this.pos.x + A.x, ay = this.pos.y + A.y, az = this.pos.z + A.z;
      let dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z;
      const Ln = Math.hypot(dx, dy, dz); dx /= Ln; dy /= Ln; dz /= Ln;
      const hit = world.ray(ax, ay, az, dx, dy, dz, Ln, true);
      if (!hit) continue;
      const pen = (Ln - hit.t) * Math.max(0.2, -(dx * hit.nx + dy * hit.ny + dz * hit.nz));
      if (kind === 1) this._roofTouch = true;
      this._bodyTouch = true;
      if (kind === 1 && !this.crash) this.setCrash('Überschlag');
      doContact(ax + dx * Ln, ay + dy * Ln, az + dz * Ln, hit.nx, hit.ny, hit.nz, pen, kind === 0 ? 0.35 : kind === 1 ? 0.5 : 0.22, 0.12, kind);
    }
    if (bestPen > 0.002) {
      const c = Math.min(bestPen, 0.25) * 0.8;
      this.pos.x += cx * c; this.pos.y += cy * c; this.pos.z += cz * c;
    }
  }

  // Hüpfer auslösen: Tempo senkrecht zur Fahrbahn (Mittel der Rad-Normalen) auf lift m/s, Vorwärtstempo bleibt.
  // Nick-/Rolldrehung weg (nur Gieren bleibt), danach hält _hopHold die Lage bis zur Landung.
  hop(lift) {
    let nx = 0, ny = 0, nz = 0;
    for (const w of this.wheels) if (w.contact) { nx += w.nx; ny += w.ny; nz += w.nz; }
    let l = Math.hypot(nx, ny, nz);
    if (l < 1e-6) { const u = this.frame.u; nx = u.x; ny = u.y; nz = u.z; l = 1; }
    nx /= l; ny /= l; nz /= l;
    const v = this.v, vn = v.x * nx + v.y * ny + v.z * nz;
    const dv = lift - Math.max(0, vn);
    v.x += nx * dv; v.y += ny * dv; v.z += nz * dv;
    const w = this.w, wn = w.x * nx + w.y * ny + w.z * nz;
    w.x = nx * wn; w.y = ny * wn; w.z = nz * wn;
    this.hopUp = { x: nx, y: ny, z: nz }; this.hopT = 0;
  }
  // Im Hüpfer: Dach zeigt weiter senkrecht zur Absprung-Fahrbahn, Nick-/Rollrate gedämpft (Gieren bleibt)
  _hopHold(dt) {
    const F = this.frame, T = this.hopUp, w = this.w;
    const cx = F.u.y * T.z - F.u.z * T.y, cy = F.u.z * T.x - F.u.x * T.z, cz = F.u.x * T.y - F.u.y * T.x;
    const wt = w.x * T.x + w.y * T.y + w.z * T.z;
    const px = w.x - T.x * wt, py = w.y - T.y * wt, pz = w.z - T.z * wt;
    w.x += (cx * 10 - px * 5) * dt; w.y += (cy * 10 - py * 5) * dt; w.z += (cz * 10 - pz * 5) * dt;
  }

  _airAssist(dt) {
    // Fahrhilfe im Flug: Dach nach oben, Nase folgt der Flugbahn (landet parallel zu Landerampen).
    // Ziel-Oben = Welt-Oben ohne Anteil in Flugrichtung; Drehachse u × Ziel.
    const F = this.frame, a = this.assist.air;
    let tx = 0, ty = 1, tz = 0;
    const sp = Math.hypot(this.v.x, this.v.y, this.v.z);
    if (sp > 6) {
      const vx = this.v.x / sp, vy = this.v.y / sp, vz = this.v.z / sp;
      tx = -vy * vx; ty = 1 - vy * vy; tz = -vy * vz;
      const l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
    }
    const cx = F.u.y * tz - F.u.z * ty, cz = F.u.x * ty - F.u.y * tx, k = 6 * a;
    this.w.x += (cx * k - this.w.x * 2.5 * a) * dt;
    this.w.z += (cz * k - this.w.z * 2.5 * a) * dt;
  }

  // Zustand für Rückspulen/Replay
  snapshot() {
    return {
      p: [this.pos.x, this.pos.y, this.pos.z], q: [this.q.x, this.q.y, this.q.z, this.q.w],
      v: [this.v.x, this.v.y, this.v.z], w: [this.w.x, this.w.y, this.w.z], s: this.steerAng,
      c: this.wheels.map((w) => w.comp), t: this.time,
    };
  }
  restore(s) {
    this.pos.x = s.p[0]; this.pos.y = s.p[1]; this.pos.z = s.p[2];
    this.q.x = s.q[0]; this.q.y = s.q[1]; this.q.z = s.q[2]; this.q.w = s.q[3];
    this.v.x = s.v[0]; this.v.y = s.v[1]; this.v.z = s.v[2];
    this.w.x = s.w[0]; this.w.y = s.w[1]; this.w.z = s.w[2];
    this.steerAng = s.s;
    this.wheels.forEach((w, i) => { w.comp = w.prevComp = s.c[i]; });
    this.crash = null; this.upsideT = 0; this.gScale = 1; this.hopUp = null;
    this.updateFrame();
  }
}
