// Replay der letzten Fahrt (60 Hz aufgezeichnet), mit Pause/Zeitlupe und wählbaren Kameras.
// Fahrbahn-Resets erscheinen als Schnitt mit Überblendung (kein Teleport-Ruckler), Zeitstrafen im Overlay.
import { REC_HZ, REC_STRIDE } from './race.js';
import { gearTrack, displayGear } from '../gfx/gauges.js';
import { nitroLevel } from '../physics/extras.js';
import { gTrack } from '../core/gforce.js';

export class Replay {
  constructor(rec, env, marks = {}) {
    this.rec = Float32Array.from(rec); this.env = env;
    this.frames = Math.floor(rec.length / REC_STRIDE);
    this.t = 0; this.speedMul = 1; this.paused = false;
    this.duration = this.frames / REC_HZ;
    // Schnitte: erster Frame nach dem Versetzen; Strafen: Frame + Sekunden
    this.cutF = new Set((marks.cuts || []).map((c) => c.f));
    this.cutT = (marks.cuts || []).map((c) => c.f / REC_HZ);
    this.pens = (marks.pens || []).map((p) => ({ t: p.f / REC_HZ, sec: p.sec }));
    // Extras: Nitro-Zündungen (Frame bis Ende bzw. Abbruch) → Flammen im Replay
    this.nitros = (marks.xev || []).filter((e) => e.k === 'nitro').map((e) => ({ t0: e.f / REC_HZ, t1: e.end != null ? e.end / REC_HZ : Infinity }));
    this.jumped = false;
    const mk = () => ({ comp: 0, steer: 0, spin: 0 });
    this.fake = { wheels: [mk(), mk(), mk(), mk()] };
    // Gang wird nicht aufgezeichnet: aus dem Tempo mit der Schaltlogik der Physik nachgerechnet (Cockpit)
    const sp = new Float32Array(this.frames);
    for (let i = 0; i < this.frames; i++) sp[i] = this.rec[i * REC_STRIDE + 14];
    this.gears = gearTrack(sp);
    // G-Kräfte (n24): dieselbe Rechnung wie live (core/gforce.js), Spitzenwert bis zur aktuellen Stelle
    this.G = gTrack(this.rec, [...this.cutF]);
    this.gPeak = new Float32Array(this.frames);
    for (let i = 0, p = 0; i < this.frames; i++) { p = Math.max(p, this.G.now[i]); this.gPeak[i] = p; }
    this.gS = { lon: 0, lat: 0, vert: 0, g: 0, peak: 0 };
    this.P = { pos: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 }, frame: { f: { x: 0, y: 0, z: -1 }, u: { x: 0, y: 1, z: 0 }, r: { x: 1, y: 0, z: 0 } } };
  }
  advance(dt) {
    const t0 = this.t;
    if (!this.paused) this.t += dt * this.speedMul;
    if (this.t >= this.duration) { this.t = 0; this.jumped = true; }
    for (const tc of this.cutT) if (t0 < tc && this.t >= tc) this.jumped = true;
  }
  // über einen Schnitt hinweg nicht interpolieren (sonst fliegt das Auto ein Bild lang quer durchs Bild)
  _i() { const f = this.t * REC_HZ; const i = Math.min(this.frames - 2, Math.max(0, Math.floor(f))); return [i, this.cutF.has(i + 1) ? 0 : Math.min(1, f - i)]; }
  // Überblendung um jeden Schnitt: 0 … 1 (1 genau am Schnitt), ±0,3 s
  fade() { let a = 0; for (const tc of this.cutT) a = Math.max(a, 1 - Math.abs(this.t - tc) / 0.3); return a; }
  // Strafen bis zur aktuellen Stelle + Rennzeit (Aufzeichnungszeit + Strafen)
  penaltiesSoFar() { let n = 0, sec = 0; for (const p of this.pens) if (p.t <= this.t) { n++; sec += p.sec; } return { n, sec }; }
  raceTime() { return this.t + this.penaltiesSoFar().sec; }
  pose() {
    const [i, a] = this._i(), r = this.rec, o = i * REC_STRIDE, p = o + REC_STRIDE;
    const P = this.P;
    P.pos.x = r[o] + (r[p] - r[o]) * a; P.pos.y = r[o + 1] + (r[p + 1] - r[o + 1]) * a; P.pos.z = r[o + 2] + (r[p + 2] - r[o + 2]) * a;
    let qx = r[o + 3] + (r[p + 3] - r[o + 3]) * a, qy = r[o + 4] + (r[p + 4] - r[o + 4]) * a, qz = r[o + 5] + (r[p + 5] - r[o + 5]) * a, qw = r[o + 6] + (r[p + 6] - r[o + 6]) * a;
    if (r[o + 3] * r[p + 3] + r[o + 4] * r[p + 4] + r[o + 5] * r[p + 5] + r[o + 6] * r[p + 6] < 0) { qx = r[p + 3]; qy = r[p + 4]; qz = r[p + 5]; qw = r[p + 6]; }
    const l = Math.hypot(qx, qy, qz, qw) || 1; qx /= l; qy /= l; qz /= l; qw /= l;
    P.q.x = qx; P.q.y = qy; P.q.z = qz; P.q.w = qw;
    // Rahmen aus Quaternion
    const rot = (x, y, z, out) => { const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x); out.x = x + qw * tx + (qy * tz - qz * ty); out.y = y + qw * ty + (qz * tx - qx * tz); out.z = z + qw * tz + (qx * ty - qy * tx); };
    rot(0, 0, -1, P.frame.f); rot(0, 1, 0, P.frame.u); rot(1, 0, 0, P.frame.r);
    // im Flug = kein Rad eingefedert (für die Kamera)
    P.air = r[o + 10] === 0 && r[o + 11] === 0 && r[o + 12] === 0 && r[o + 13] === 0;
    return P;
  }
  phys() {
    const [i] = this._i(), r = this.rec, o = i * REC_STRIDE;
    const w = this.fake.wheels;
    w[0].steer = w[1].steer = r[o + 7];
    w[0].spin = w[1].spin = r[o + 8]; w[2].spin = w[3].spin = r[o + 9];
    for (let k = 0; k < 4; k++) w[k].comp = r[o + 10 + k];
    return this.fake;
  }
  // Nitro-Stärke an der aktuellen Stelle (Hüllkurve wie im Rennen; abgebrochen = sofort aus)
  nitro() {
    for (const n of this.nitros) if (this.t >= n.t0 && this.t < n.t1) return nitroLevel(this.t - n.t0);
    return 0;
  }
  // G-Anzeige an der aktuellen Stelle (angezeigte G, mit Spitzen-Halten)
  gState() {
    const [i] = this._i(), G = this.G, S = this.gS;
    if (!G.F) return S;
    S.lon = G.lon[i]; S.lat = G.lat[i]; S.vert = G.vert[i]; S.g = G.g[i]; S.peak = this.gPeak[i];
    return S;
  }
  speed() { const [i] = this._i(); return this.rec[i * REC_STRIDE + 14]; }
  rpm() { const [i] = this._i(); return this.rec[i * REC_STRIDE + 15]; }
  gear() { const [i] = this._i(); return displayGear(this.rec[i * REC_STRIDE + 14], this.gears[i] || 1); }
}
