// Renn-Logik: Countdown, Zeit, Checkpoints, Crash/Wrack/Rückspulen, Fahrhilfen (Mischung
// Spieler/Autopilot), Aufzeichnung für Replay + Geisterauto. Reines JS (auch in Node lauffähig).
import { Car } from '../physics/car.js';
import { Autopilot, Tracker } from '../ai/autopilot.js';

export const ASSISTS = {
  easy: { name: 'Leicht', icon: '🟢', steerPull: 0.82, autoSpeed: true, autoStunts: true, magnet: 1, air: 1, autoRewind: true, wreck: false, showLine: true },
  medium: { name: 'Mittel', icon: '🟡', steerPull: 0.28, autoSpeed: false, brakeAssist: true, autoStunts: false, magnet: 0.35, air: 0.4, autoRewind: true, wreck: true, showLine: true },
  original: { name: 'Original', icon: '🔴', steerPull: 0, autoSpeed: false, autoStunts: false, magnet: 0, air: 0, autoRewind: false, wreck: true, showLine: false },
};

export const REC_HZ = 60;
export const REC_STRIDE = 16; // floats pro Frame

export class Race {
  constructor(env, opts = {}) {
    this.env = env; // { track, world, ideal, prof }
    this.assistKey = opts.assist || 'medium';
    this.assist = ASSISTS[this.assistKey];
    this.car = new Car();
    this.ap = new Autopilot(env.ideal, env.prof);
    this.tracker = new Tracker(env.track.line);
    this.state = 'countdown';
    this.countdown = opts.countdown ?? 3;
    this.time = 0;
    this.simTime = 0;
    this.events = [];
    this.cpNext = 0;
    this.cps = env.track.checkpoints.map((c) => c.idx).sort((a, b) => a - b);
    this.startIdx = env.track.start.idx;
    this.snaps = [];
    this.snapT = 0;
    this.rec = [];
    this.recT = 0;
    this.crashT = 0;
    this.crashes = 0;
    this.rewinds = 0;
    this.autopilotOnly = !!opts.autopilot;
    this.maxProgress = 0;
    this.offT = 0;
    this.lastInput = { steer: 0, throttle: 0, brake: 0 };
    this.place(this.startIdx - (opts.startBack ?? 1));
  }

  place(idx, speed = 0) {
    const L = this.env.track.line;
    idx = Math.max(0, Math.min(L.n - 1, idx));
    this.car.place([L.px[idx], L.py[idx], L.pz[idx]], [L.tx[idx], L.ty[idx], L.tz[idx]], [L.nx[idx], L.ny[idx], L.nz[idx]], speed);
    this.tracker.reset(idx);
    this.ap.tr.reset(idx);
  }

  emit(type, data = {}) { this.events.push({ type, t: this.time, ...data }); }

  setAssist(key) { this.assistKey = key; this.assist = ASSISTS[key]; this.assistChanged = true; }

  // Ein Physikschritt
  step(dt, input) {
    const car = this.car, A = this.assist, L = this.env.track.line;
    this.simTime += dt;
    if (this.state === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (Math.ceil(this.countdown) < before && this.countdown > 0 && before <= 3) this.emit('count', { n: Math.ceil(this.countdown) });
      car.input.steer = 0; car.input.throttle = 0; car.input.brake = 1; car.input.hold = true;
      car.step(dt, this.env.world);
      if (this.countdown <= 0) { this.state = 'running'; car.input.hold = false; this.emit('go'); }
      return;
    }
    if (this.state === 'finished') {
      // Auslaufen mit Autopilot, langsam
      const c = this.ap.control(car);
      car.input.steer = c.steer; car.input.throttle = 0; car.input.brake = 0.35; car.input.hold = true;
      car.step(dt, this.env.world);
      return;
    }
    if (this.state === 'wreck') {
      car.input.steer = 0; car.input.throttle = 0; car.input.brake = 0.4; car.input.hold = true;
      car.step(dt, this.env.world);
      this.time += dt;
      this.crashT += dt;
      if (this.crashT > (this.assist.autoRewind ? 1.4 : 2.6)) this.recover();
      return;
    }
    // ---- Rennen läuft ----
    this.time += dt;
    const ap = this.ap.control(car);
    const idx = this.ap.tr.idx;
    const stunt = L.loop[idx] || L.tube[idx] || L.air[idx] || this.isJumpZone(idx);
    let steer = input.steer, thr = input.throttle, brk = input.brake;
    if (this.autopilotOnly) { steer = ap.steer; thr = ap.throttle; brk = ap.brake; }
    else if (A.steerPull > 0) {
      if (A.autoStunts && stunt) { steer = ap.steer; }
      else steer = ap.steer * A.steerPull + steer * (1 - A.steerPull) + (A.steerPull > 0.5 ? steer * 0.25 : 0);
      steer = Math.max(-1, Math.min(1, steer));
      if (A.autoSpeed) { thr = ap.throttle; brk = ap.brake; if (input.brake > 0.5) { thr = 0; brk = Math.max(brk, input.brake * 0.6); } }
      else if (A.brakeAssist) {
        const vt = this.env.prof.vt[idx];
        const v = car.fwdSpeed();
        if (v > vt * 1.06 + 1.5) { thr = Math.min(thr, 0.15); brk = Math.max(brk, ap.brake * 0.8); }
      }
    }
    this.lastInput = { steer, throttle: thr, brake: brk };
    car.input.steer = steer; car.input.throttle = thr; car.input.brake = brk; car.input.hold = !!A.autoSpeed && !this.autopilotOnly && input.brake < 0.5;
    car.assist.magnet = this.autopilotOnly ? 0 : A.magnet;
    car.assist.air = this.autopilotOnly ? 0 : A.air;
    car.surfaceKind = (L.loop[idx] || L.tube[idx]) ? 1 : 0;
    car.step(dt, this.env.world);
    // Fortschritt / Checkpoints / Ziel
    const ti = this.tracker.update(car.pos.x, car.pos.y, car.pos.z);
    const prog = this.tracker.progress();
    if (prog > this.maxProgress) this.maxProgress = prog;
    if (this.cpNext < this.cps.length) {
      const ci = this.cps[this.cpNext];
      if (this.passed(ci, ti)) { this.cpNext++; this.emit('checkpoint', { n: this.cpNext, of: this.cps.length }); }
    } else if ((L.closed && this.tracker.lap >= 1 && ti >= this.startIdx) || (!L.closed && ti >= L.n - 2)) {
      this.finish();
    }
    // Abseits: zu weit weg von der Linie
    if (this.tracker.dist > 30) { this.offT += dt; if (this.offT > 4) { this.car.setCrash('Abseits'); } } else this.offT = 0;
    // Rückspul-Puffer (10 Hz, 8 s)
    this.snapT += dt;
    if (this.snapT >= 0.1) {
      this.snapT = 0;
      this.snaps.push({ s: car.snapshot(), time: this.time, cp: this.cpNext, lap: this.tracker.lap, idx: ti, recLen: this.rec.length, apIdx: this.ap.tr.idx });
      if (this.snaps.length > 80) this.snaps.shift();
    }
    this.record(dt);
    if (car.crash) this.onCrash();
  }

  isJumpZone(idx) {
    for (const j of this.env.track.jumps) if (idx >= j.lipIdx - 30 && idx <= j.landIdx + 12) return true;
    return false;
  }

  passed(ci, ti) {
    // Linienindex ci überschritten (mit Umlauf-Toleranz)
    const n = this.env.track.line.n;
    const d = ti - ci;
    return d >= 0 && d < n * 0.3;
  }

  finish() {
    if (this.state === 'finished') return;
    this.state = 'finished';
    this.finalTime = this.time;
    this.emit('finish', { time: this.time });
  }

  onCrash() {
    this.crashes++;
    this.emit('crash', { reason: this.car.crash.reason });
    if (this.assist.wreck) { this.state = 'wreck'; this.crashT = 0; }
    else this.recover();
  }

  // Zurück: Rückspulen (3 s) oder bei Original: an die Strecke setzen
  recover() {
    if (this.assist.autoRewind || this.state === 'rewindRequest') { this.rewind(3); return; }
    const L = this.env.track.line;
    const back = Math.max(0, this.tracker.idx - 12);
    this.place(back, 0);
    this.state = 'running';
    this.emit('reset');
  }

  rewind(sec = 3) {
    if (!this.snaps.length) { this.place(this.startIdx - 1); this.state = 'running'; return; }
    let k = this.snaps.length - 1 - Math.round(sec * 10);
    k = Math.max(0, k);
    // nicht in einen Crash zurückspulen: weiter zurück, wenn Auto dort schon unruhig war
    const sn = this.snaps[k];
    this.snaps.length = k + 1;
    this.car.restore(sn.s);
    this.time = sn.time;
    this.cpNext = sn.cp;
    this.tracker.lap = sn.lap; this.tracker.reset(sn.idx);
    this.ap.tr.reset(sn.apIdx);
    this.rec.length = Math.min(this.rec.length, sn.recLen);
    this.state = 'running';
    this.rewinds++;
    this.emit('rewind');
  }

  requestRewind() {
    if (this.state === 'running' || this.state === 'wreck') { this.rewind(3); }
  }

  record(dt) {
    this.recT += dt;
    if (this.recT < 1 / REC_HZ - 1e-6) return;
    this.recT = 0;
    const c = this.car;
    const w = c.wheels;
    this.rec.push(c.pos.x, c.pos.y, c.pos.z, c.q.x, c.q.y, c.q.z, c.q.w, c.steerAng, w[0].spin, w[2].spin,
      w[0].comp, w[1].comp, w[2].comp, w[3].comp, c.fwdSpeed(), c.rpm);
  }
}
