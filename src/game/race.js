// Renn-Logik: Countdown, Zeit, Checkpoints, Crash (Fahrbahn-Reset mit Zeitstrafe oder Wrack),
// Rückspulen, Fahrhilfen (Mischung Spieler/Autopilot), Abkürzungs-Regel, Aufzeichnung für Replay + Geist.
// Reines JS (auch in Node lauffähig).
import { Car } from '../physics/car.js';
import { Autopilot, Tracker } from '../ai/autopilot.js';
import { WORLD_SCALE, ROAD_HW } from '../track/defs.js';

export const ASSISTS = {
  easy: { name: 'Leicht', icon: '🟢', steerPull: 0.82, autoSpeed: true, autoStunts: true, free: true, magnet: 1, air: 1, autoRewind: true, showLine: true },
  medium: { name: 'Mittel', icon: '🟡', steerPull: 0.28, stuntPull: 0.6, autoSpeed: false, brakeAssist: true, autoStunts: false, magnet: 0.35, air: 0.4, autoRewind: true, showLine: true },
  original: { name: 'Original', icon: '🔴', steerPull: 0, autoSpeed: false, autoStunts: false, magnet: 0, air: 0, autoRewind: false, showLine: false },
};

// Totalschaden ist eine eigene Option (Standard aus, Peter 27.09.): aus → jeder Crash = Fahrbahn-Reset
// vor das Element mit fliegendem Neustart und PENALTY Sekunden Zeitstrafe; an → Wrack wie bisher.
export const PENALTY = 5;
export const RESET_DELAY = 0.35; // kurzes Aufblitzen zwischen Crash und Reset (Spielzeit, s)

// Leicht: Spieler hat Vorrang (Peter 27.09.). Deutlicher Lenkeinschlag (> in, hold s gehalten) blendet den
// Zug zur Linie in fadeOut s aus – dann frei, auch ins Gelände. Loslassen (< keep, 0,3 s): Hilfe blendet in
// fadeIn s ein, das Ziel des Autopiloten wandert weich (ohne Ruck) von der Autoposition zurück auf die Linie.
// Vor Stunts (pre s bzw. mindestens preMin m) übernimmt der Autopilot wieder, mit Ansage im HUD.
// Abseits der Fahrbahn gemäßigtes Gas (höchstens offV m/s).
export const FREE = { in: 0.5, hold: 0.2, keep: 0.15, rel: 0.2, fadeOut: 0.25, fadeIn: 0.8, back: [1.2, 3.0], pre: 2.5, preMin: 35, offV: 16 };
// Abkürzen (alle Stufen): neben der Fahrbahn mehr Streckenfortschritt als gefahrene Strecke → zurück an die
// Stelle, wo das Auto die Fahrbahn verlassen hat (Uhr läuft weiter). Toleranz CUT_TOL m + 15 % der Strecke.
// Erlaubter Gewinn beim Kurven-Schneiden hängt an der Fahrbahnbreite (bis 27.09.2026 fest 8 m bei 4,5 m)
export const CUT_TOL = 8 * ROAD_HW / 4.5;
// Abseits: ab OFF.far m Abstand zur Linie, OFF.sec s lang → Crash; ab OFF.hint m Hinweis im HUD. Die Abstände
// wachsen mit dem Weltmaßstab (Nachbar-Abschnitte liegen entsprechend weiter weg); bis 27.09.2026 30 m / 18 m.
export const OFF = { far: 30 * WORLD_SCALE, hint: 18 * WORLD_SCALE, sec: 4 };
const STUNT_NAMES = { loop: 'Looping', tube: 'Röhre', cork: 'Korkenzieher', jump: 'Sprung' };

export const REC_HZ = 60;
export const REC_STRIDE = 16; // floats pro Frame

export class Race {
  constructor(env, opts = {}) {
    this.env = env; // { track, world, ideal, prof }
    this.assistKey = opts.assist || 'medium';
    this.assist = ASSISTS[this.assistKey];
    this.wreckOn = !!opts.wreck; // Totalschaden an/aus (gilt für alle Fahrhilfe-Stufen)
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
    this.penalties = 0;
    this.pens = [];  // Zeitstrafen { f: Aufzeichnungs-Frame, sec }
    this.cuts = [];  // Schnitte (Auto versetzt) { f } – fürs Replay
    this.autopilotOnly = !!opts.autopilot;
    this.noCutRule = !!opts.noCutRule;
    this.maxProgress = 0;
    this.offT = 0;
    this.stuckProg = -1e9; this.stuckT = 0;
    this.lastInput = { steer: 0, throttle: 0, brake: 0 };
    // Leicht, freies Lenken: Anteil des Spielers (0 = Hilfe voll, 1 = frei), Haltezeit, Rückführung
    this.own = 0; this.manual = false; this.holdT = 0; this.relT = 0; this.back = null;
    this.hud = null;        // Hinweis fürs HUD (Stunt-Ansage, „Zurück zur Strecke“) oder null
    this.shortcut = null;   // laufender Ausflug neben die Fahrbahn { p0, idx, lap, cp, driven }
    this.onRoad = { prog: 0, idx: 0, lap: 0, cp: 0 };
    this.zones = this.stuntZones();
    this.place(this.startIdx - (opts.startBack ?? 1));
  }

  // onLine: auf die Ideallinie setzen (Reset mitten im Rennen) statt auf die Fahrbahnmitte (Start)
  place(idx, speed = 0, onLine = false) {
    const L = onLine && this.env.ideal ? this.env.ideal : this.env.track.line;
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
      this.record(dt);
      if (this.crashT > (this.assist.autoRewind ? 1.4 : 2.6)) this.recover();
      return;
    }
    if (this.state === 'reset') {
      // Totalschaden aus: kurz aufblitzen (Uhr läuft weiter), dann zurück auf die Fahrbahn
      car.input.steer = 0; car.input.throttle = 0; car.input.brake = 0.4; car.input.hold = true;
      car.step(dt, this.env.world);
      this.time += dt;
      this.crashT += dt;
      this.record(dt);
      if (this.crashT >= RESET_DELAY) this.recover();
      return;
    }
    // ---- Rennen läuft ----
    this.time += dt;
    const ap = this.ap.control(car);
    const idx = this.ap.tr.idx;
    const stunt = L.loop[idx] || L.tube[idx] || L.air[idx] || this.isJumpZone(idx);
    let steer = input.steer, thr = input.throttle, brk = input.brake;
    this.hud = null;
    if (this.autopilotOnly) { steer = ap.steer; thr = ap.throttle; brk = ap.brake; }
    else if (A.steerPull > 0) {
      const pull = stunt && A.stuntPull ? A.stuntPull : A.steerPull;
      const zone = A.free ? this.freeSteer(dt, input, idx) : null;
      // Leicht: im Stunt und auf den letzten ~1,2 s davor lenkt allein der Autopilot (sauber ausgerichtet)
      const lead = zone && !zone.inside && zone.dist < Math.max(20, car.fwdSpeed() * 1.2);
      if (A.autoStunts && (stunt || lead)) { steer = ap.steer; }
      else {
        // Rückführung nach freiem Lenken: Autopilot mit voller Kraft (sonst max. 82 %)
        const p = this.back ? 1 : pull;
        steer = ap.steer * p + steer * (1 - pull) + (pull > 0.5 && !A.stuntPull ? steer * 0.25 : 0);
        if (A.free) steer = steer * (1 - this.own) + input.steer * this.own;   // Spieler hat Vorrang
      }
      steer = Math.max(-1, Math.min(1, steer));
      // Rückführung ohne Ruck: Lenkänderung höchstens 4/s (wie eine ruhige Hand an der Tastatur)
      if (this.calmT > 0 && !this.manual) { const d = 4 * dt; steer = Math.max(this.lastInput.steer - d, Math.min(this.lastInput.steer + d, steer)); }
      if (zone) this.hud = { kind: 'stunt', text: `${zone.name}${zone.inside ? '' : ' voraus'} – Autopilot lenkt` };
      if (A.autoSpeed) {
        thr = ap.throttle; brk = ap.brake;
        // neben der Fahrbahn gemäßigt
        const ti = this.tracker.idx;
        if (A.free && !stunt && this.tracker.dist > L.hw[ti] + 0.5) {
          // beim Zurückführen mit großem Kurswinkel erst langsamer werden (engerer Bogen auf der Wiese)
          const vOff = this.back && Math.abs(this.ap.psi || 0) > 0.5 ? FREE.offV * 0.65 : FREE.offV;
          const over = car.fwdSpeed() - vOff;
          if (over > 0) { thr = 0; brk = Math.max(brk, Math.min(0.6, 0.15 + over * 0.08)); } else thr = Math.min(thr, 0.8);
        }
        // die Bremse des Spielers geht immer vor
        if (input.brake > 0.05) { thr = 0; brk = Math.max(brk, input.brake); }
      }
      else if (A.brakeAssist) {
        const vt = this.env.prof.vt[idx];
        const v = car.fwdSpeed();
        if (v > vt * 1.06 + 1.5) { thr = Math.min(thr, 0.15); brk = Math.max(brk, ap.brake * 0.8); }
        // Stabilitätshilfe (ESP): bei großem Kurswinkel gegenlenken + Gas weg, falsche Richtung abfangen
        const psi = Math.abs(this.ap.psi || 0);
        if (psi > 0.5 && v > 3) {
          const k = Math.min(1, (psi - 0.5) / 0.6);
          steer = steer * (1 - 0.8 * k) + ap.steer * 0.8 * k;
          thr = Math.min(thr, 1 - 0.7 * k);
        }
        if (psi > 2.2 && Math.abs(v) < 6) { this.wrongT = (this.wrongT || 0) + dt; if (this.wrongT > 1.5) { this.wrongT = 0; this.car.setCrash('Falsche Richtung'); } }
        else this.wrongT = 0;
      }
    }
    this.lastInput = { steer, throttle: thr, brake: brk };
    car.input.steer = steer; car.input.throttle = thr; car.input.brake = brk; car.input.hold = !!A.autoSpeed && !this.autopilotOnly && input.brake < 0.5;
    car.assist.magnet = this.autopilotOnly ? 0 : A.magnet;
    car.assist.air = this.autopilotOnly ? 0 : A.air;
    car.surfaceKind = (L.loop[idx] || L.tube[idx]) ? 1 : 0;
    car.step(dt, this.env.world);
    // Fortschritt / Checkpoints / Ziel
    let ti = this.tracker.update(car.pos.x, car.pos.y, car.pos.z);
    // Klar neben der Fahrbahn und am Boden: höchstens alle 0,1 s neu orten (Abkürzung quer übers Gelände)
    this.relocT = (this.relocT || 0) - dt;
    let jumped = false;
    if (this.tracker.dist > L.hw[ti] + 8 && car.onGround > 0 && this.relocT <= 0) {
      this.relocT = 0.1;
      // nur nach vorn: zurück zu einem früheren Abschnitt bringt nichts (dort fährt man ohnehin neu), die alte
      // Ortung bleibt – so verhält sich das Herumfahren im Gelände wie bisher
      const p0 = this.tracker.progress(), keep = { idx: this.tracker.idx, lap: this.tracker.lap, dist: this.tracker.dist };
      if (this.tracker.relocate(car.pos.x, car.pos.y, car.pos.z)) {
        if (this.tracker.progress() > p0) { ti = this.tracker.idx; jumped = true; } else Object.assign(this.tracker, keep);
      }
    }
    const prog = this.tracker.progress();
    if (prog > this.maxProgress) this.maxProgress = prog;
    // Abkürzen lohnt nicht (alle Stufen) – vor Checkpoints/Ziel prüfen: eine erschummelte Durchfahrt zählt nicht
    if (this.checkShortcut(dt, prog, ti, jumped)) return;
    if (this.cpNext < this.cps.length) {
      const ci = this.cps[this.cpNext];
      if (this.passed(ci, ti)) { this.cpNext++; this.emit('checkpoint', { n: this.cpNext, of: this.cps.length }); }
    } else if ((L.closed && this.tracker.lap >= 1 && ti >= this.startIdx) || (!L.closed && ti >= L.n - 2)) {
      this.finish();
    }
    // Abseits: zu weit weg von der Linie (großzügig, OFF); Hinweis im HUD schon vorher
    if (this.tracker.dist > OFF.far) { this.offT += dt; if (this.offT > OFF.sec) { this.car.setCrash('Abseits'); } } else this.offT = 0;
    if (this.tracker.dist > OFF.hint && !this.autopilotOnly) this.hud = { kind: 'off', text: 'Zurück zur Strecke ↺' };
    // Festgefahren: 5 s ohne nennenswerten Fortschritt. Wer frei durchs Gelände fährt (in Bewegung, selbst
    // lenkend), darf das – dort greift erst nach 20 s ohne Fortschritt die Sicherung (sonst die Abseits-Regel).
    if (prog > this.stuckProg + 2) { this.stuckProg = prog; this.stuckT = 0; }
    else {
      const roam = Math.abs(car.fwdSpeed()) > 3 && (this.manual || this.own > 0 || (!A.autoSpeed && !this.autopilotOnly));
      this.stuckT = (this.stuckT || 0) + dt;
      if (this.stuckT > (roam ? 20 : 5)) { this.stuckT = 0; this.stuckProg = prog; this.car.setCrash('Festgefahren'); }
    }
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

  // Stunt-Zonen der Linie (dort lenkt auf Leicht der Autopilot): zusammenhängende Stücke mit Looping,
  // Röhre, Luft oder Sprung-Anlauf/-Landung, mit Namen fürs HUD. [{ i0, i1, s0, s1, name }]
  stuntZones() {
    const L = this.env.track.line, T = this.env.track, out = [];
    const kindAt = (i) => {
      if (this.isJumpZone(i) || L.air[i]) return 'jump';
      if (L.tube[i]) return 'tube';
      if (L.loop[i]) { const pc = T.pieces[L.piece[i]]; return pc && /cork/.test(pc.type) ? 'cork' : 'loop'; }
      return null;
    };
    let cur = null;
    for (let i = 0; i < L.n; i++) {
      const k = kindAt(i);
      if (k && cur && i === cur.i1 + 1) { cur.i1 = i; cur.s1 = L.s[i]; if (!cur.kinds.includes(k)) cur.kinds.push(k); continue; }
      if (k) { cur = { i0: i, i1: i, s0: L.s[i], s1: L.s[i], kinds: [k] }; out.push(cur); }
    }
    for (const z of out) z.name = STUNT_NAMES[z.kinds.includes('loop') ? 'loop' : z.kinds.includes('cork') ? 'cork' : z.kinds.includes('tube') ? 'tube' : 'jump'];
    return out;
  }

  // Nächste Stunt-Zone, in der das Auto ist oder die innerhalb von dist Metern beginnt
  zoneAhead(idx, dist) {
    const L = this.env.track.line, s = L.s[idx];
    for (const z of this.zones) {
      if (idx >= z.i0 && idx <= z.i1) return { ...z, inside: true, dist: 0 };
      let d = z.s0 - s;
      if (d < 0 && L.closed) d += L.total;
      if (d >= 0 && d <= dist) return { ...z, inside: false, dist: d };
    }
    return null;
  }

  // Leicht: Spieler-Vorrang. Aktualisiert own (Anteil Spieler) und die Rückführung des Autopiloten.
  // Liefert die Stunt-Zone, falls der Autopilot gerade (oder gleich) lenkt.
  freeSteer(dt, input, idx) {
    const v = this.car.fwdSpeed(), a = Math.abs(input.steer);
    const zone = this.zoneAhead(idx, Math.max(FREE.preMin, v * FREE.pre));
    if (a > FREE.in) this.holdT += dt; else this.holdT = 0;
    if (zone) this.manual = false;
    else if (this.holdT >= FREE.hold) { this.manual = true; this.relT = 0; }
    else if (this.manual) {
      if (a <= FREE.keep) { this.relT += dt; if (this.relT >= FREE.rel) this.manual = false; } else this.relT = 0;
    }
    const ap = this.ap;
    // Lenk-Glättung läuft von der Übernahme bis 2 s nach Ende der Rückführung
    this.calmT = this.manual || this.back || this.own > 0 || Math.abs(ap.lat) > 1 ? 1.5 : Math.max(0, (this.calmT || 0) - dt);
    if (this.manual) {
      this.own = Math.min(1, this.own + dt / FREE.fadeOut);
      ap.shift = ap.lat; this.back = null;    // Ziel des Autopiloten = da, wo das Auto gerade ist
    } else {
      this.own = Math.max(0, this.own - dt / (zone ? 0.6 : FREE.fadeIn));
      if (ap.shift && !this.back) {
        // weich zurück: Versatz fällt mit glattem Verlauf (Anfang und Ende ohne Querbewegung) auf 0
        let T = Math.max(FREE.back[0], Math.min(FREE.back[1], Math.abs(ap.shift) * 0.2));
        if (zone) T = Math.max(0.6, Math.min(T, (zone.dist / Math.max(v, 5)) * 0.7));
        this.back = { s0: ap.shift, t: 0, T };
      }
      if (this.back) {
        const B = this.back;
        if (zone && !B.zone) { B.zone = true; B.T = Math.max(0.6, Math.min(B.T - B.t, (zone.dist / Math.max(v, 5)) * 0.7)) + B.t; }
        B.t += dt;
        const u = Math.min(1, B.t / B.T);
        // Ziel höchstens 5 m seitlich vor dem Auto: flacher Anfahrwinkel statt steil zurück
        ap.shift = Math.max(ap.lat - 5, Math.min(ap.lat + 5, B.s0 * (1 - u * u * (3 - 2 * u))));
        if (u >= 1 && Math.abs(ap.shift) < 0.05) { ap.shift = 0; this.back = null; }
      }
    }
    return zone;
  }

  // Abkürzung? Neben der Fahrbahn (Wagenmitte > 1 m hinter der Kante) Fortschritt entlang der Strecke gegen
  // die tatsächlich gefahrene Strecke rechnen; spart der Ausflug mehr als die Toleranz → zurück an die Stelle,
  // an der das Auto die Fahrbahn verlassen hat. Herumfahren im Gelände (ohne Streckengewinn) bleibt erlaubt.
  checkShortcut(dt, prog, ti, jumped = false) {
    if (this.noCutRule) return false;     // nur für Tests (Vergleich „was brächte die Abkürzung“)
    const L = this.env.track.line;
    const step = this.car.speed() * dt;
    // Gefahrene Strecke ab dem Rücksetzpunkt zählen (nicht erst ab dem ersten Schritt neben der Fahrbahn):
    // sonst galt eine überflogene Sprunglücke als Abkürzung (Auto schießt über die Landung hinaus, 27.09.2026)
    this.anchorDriven = (this.anchorDriven || 0) + step;
    // Im Flug über einer Sprungzone nie: die Flugbahn weicht von der Anzeige-Linie ab (27.09.2026)
    if (this.car.onGround === 0 && (L.air[ti] || this.isJumpZone(ti))) { if (this.shortcut) this.shortcut.driven += step; return false; }
    const off = this.tracker.dist > L.hw[ti] + 1.0 && !L.air[ti];
    // Neu geortet (Tracker, quer übers Gelände) und schon wieder auf der Fahrbahn eines späteren Abschnitts:
    // Gewinn gegen den letzten Punkt auf der Fahrbahn prüfen, bevor dieser Punkt weiterwandert
    if (!off && jumped) {
      const gain = prog - this.onRoad.prog - this.anchorDriven;
      if (gain > CUT_TOL + 0.15 * this.anchorDriven) { this.shortcut = { ...this.onRoad, driven: this.anchorDriven }; return this.cutBack(gain, prog); }
    }
    if (!off) {
      this.shortcut = null;
      // Rücksetzpunkt nur auf Fahrbahn merken – nie über einer Sprunglücke (dort läge die Linie in der Luft,
      // das Auto fiele nach dem Versetzen herunter; fiel mit dem schnelleren Auto 27.09. auf)
      if (!L.air[ti]) { this.onRoad.prog = prog; this.onRoad.idx = ti; this.onRoad.lap = this.tracker.lap; this.onRoad.cp = this.cpNext; this.anchorDriven = 0; }
      return false;
    }
    if (!this.shortcut) this.shortcut = { ...this.onRoad, driven: this.anchorDriven };
    const S = this.shortcut;
    if (S.driven !== this.anchorDriven) S.driven += step;
    const gain = prog - S.prog - S.driven;
    if (!(gain <= this.maxGain)) this.maxGain = gain;   // nur Diagnose (Tests)
    if (gain <= CUT_TOL + 0.15 * S.driven) return false;
    return this.cutBack(gain, prog);
  }

  // Abkürzung erkannt: zurück an den letzten Punkt auf der Fahrbahn (this.shortcut)
  cutBack(gain, prog) {
    const S = this.shortcut;
    // zurücksetzen: auf die Linie an der Ausfahrt-Stelle, Checkpoints/Runde wie dort – liegt die in einer
    // Sprungzone (Anlauf/Lippe/Landung), 45 m vor die Lippe: mit Rücksetz-Tempo sprang das Auto sonst zu kurz
    let j = S.idx, lap = S.lap;
    for (const J of this.env.track.jumps) if (j >= J.lipIdx - 30 && j <= J.landIdx + 12) { const b = this.backFrom(J.lipIdx, 45); if (b > J.lipIdx) lap--; j = b; break; }
    this.place(j, Math.min(this.env.prof.vt[j] || 12, 15), true);
    this.tracker.lap = lap; this.cpNext = S.cp;
    this.shortcuts = (this.shortcuts || 0) + 1;
    this.afterJump();
    this.emit('shortcut', { gain, driven: S.driven, prog: prog - S.prog });
    return true;
  }

  // Linienindex m Meter vor i (auf Rundkursen über den Anfang hinweg)
  backFrom(i, m) {
    const L = this.env.track.line;
    let j = i, acc = 0;
    while (acc < m) {
      const pj = j - 1 < 0 ? (L.closed ? L.n - 2 : 0) : j - 1;
      if (pj === j) break;
      acc += Math.abs(L.s[j] - L.s[pj]) || 0;
      j = pj;
    }
    return j;
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
    this.crashT = 0;
    if (this.wreckOn) {
      this.emit('crash', { reason: this.car.crash.reason });
      this.state = 'wreck';
      return;
    }
    // Totalschaden aus: +5 s sofort auf die Uhr, kurzer Effekt, dann Fahrbahn-Reset (recover)
    this.time += PENALTY;
    this.penalties++;
    this.pens.push({ f: this.recFrames(), sec: PENALTY });
    this.emit('crash', { reason: this.car.crash.reason, penalty: PENALTY });
    this.state = 'reset';
  }

  recFrames() { return this.rec.length / REC_STRIDE; }

  // Zurück auf die Strecke. Totalschaden aus: immer vor das Element (fliegender Neustart).
  // Totalschaden an: Rückspulen (3 s) bzw. bei Original vor das Element.
  recover() {
    const again = this.simTime - (this.lastRecoverT ?? -99) < 6;
    this.lastRecoverT = this.simTime;
    // Mehrfach an derselben Stelle gescheitert → hinter das Hindernis setzen (nie festhängen).
    // Totalschaden aus: auf Leicht schon beim 2. Mal (der Autopilot fährt die Stunts, ein zweiter
    // Crash dort ist kein Spielerfehler), sonst beim 3. Mal – jede Runde kostet trotzdem +5 s.
    const prog = this.tracker.progress();
    if (Math.abs(prog - (this.failS ?? -1e9)) < 80) this.failN = (this.failN || 0) + 1; else { this.failS = prog; this.failN = 1; }
    if (!this.wreckOn) {
      if (this.failN >= (this.assistKey === 'easy' ? 2 : 3)) this.skipAhead();
      else this.safeReset();
      return;
    }
    if (this.assist.autoRewind && this.failN >= 3) { this.skipAhead(); return; }
    if (this.assist.autoRewind && !again) { this.rewind(3); return; }
    this.safeReset();
  }

  // Hinter das Stück setzen, an dem der Unfall passiert (plus Sprunglücken), mit Tempo aus dem Profil
  skipAhead() {
    const L = this.env.track.line, T = this.env.track;
    let idx = this.tracker.idx;
    const pc = T.pieces[L.piece[idx]];
    let j = pc ? pc.lineEnd + 1 : idx + 20;
    // anschließende Luftstrecke (Sprunglücke) mit überspringen
    for (let guard = 0; guard < 400 && L.air[((j % L.n) + L.n) % L.n]; guard++) j++;
    j += 6;
    let lap = this.tracker.lap;
    if (L.closed && j >= L.n) { j -= L.n - 1; lap++; }
    j = Math.min(L.n - 3, j);
    this.place(j, Math.min(this.env.prof.vt[j] || 12, 18), true);
    this.tracker.lap = lap;
    this.failN = 0; this.failS = this.tracker.progress();
    this.skips = (this.skips || 0) + 1;
    this.afterJump();
    this.emit('skip');
  }

  // Sicherer Punkt: vor Stunt-Elementen ~45 m zurück, sonst ~12 m; Tempo aus dem Profil
  safeReset() {
    const L = this.env.track.line, T = this.env.track;
    let idx = this.tracker.idx;
    const pc = T.pieces[L.piece[idx]];
    if (pc && pc.stunt) idx = pc.lineStart;
    const back = pc && pc.stunt ? 45 : 12;
    let j = idx, acc = 0;
    while (acc < back) {
      const pj = j - 1 < 0 ? (L.closed ? L.n - 2 : 0) : j - 1;
      if (pj === j) break;
      acc += Math.abs(L.s[j] - L.s[pj]) || 0;
      j = pj;
      if (L.air[j]) acc = Math.min(acc, back - 5);
    }
    // nicht vor den Start zurück (Checkpoints/Runde bleiben gültig)
    const v = Math.min(this.env.prof.vt[j] || 10, 26) * 0.95;
    const lap = this.tracker.lap - (j > this.tracker.idx ? 1 : 0);
    this.place(j, v, true);
    this.tracker.lap = lap;
    this.afterJump();
    this.emit('reset');
  }

  // Nach dem Versetzen: Schnitt fürs Replay merken, Wächter zurücksetzen, weiterfahren
  afterJump() {
    this.cuts.push({ f: this.recFrames() });
    this.offT = 0; this.stuckT = 0; this.stuckProg = this.tracker.progress(); this.wrongT = 0;
    this.freeReset();
    // Rückspul-Puffer leeren (sonst spult ⏪ vor den Reset zurück in den Crash)
    if (!this.wreckOn) this.snaps.length = 0;
    this.state = 'running';
  }

  // Rückspulen. Totalschaden an (bisheriges Verhalten): Uhr und Aufzeichnung werden mit zurückgedreht.
  // Totalschaden aus: die Uhr läuft weiter – das Rückspulen kostet genau die Zeit, die man neu fährt,
  // bringt also nie Zeit; die Aufzeichnung läuft weiter (Replay zeigt einen Schnitt, Geist bleibt synchron).
  rewind(sec = 3) {
    const keepClock = !this.wreckOn;
    if (!this.snaps.length) {
      if (keepClock) return;
      this.place(this.startIdx - 1); this.state = 'running'; return;
    }
    let k = this.snaps.length - 1 - Math.round(sec * 10);
    k = Math.max(0, k);
    const sn = this.snaps[k];
    this.snaps.length = k + 1;
    this.car.restore(sn.s);
    this.cpNext = sn.cp;
    this.tracker.lap = sn.lap; this.tracker.reset(sn.idx);
    this.ap.tr.reset(sn.apIdx);
    if (keepClock) this.cuts.push({ f: this.recFrames() });
    else { this.time = sn.time; this.rec.length = Math.min(this.rec.length, sn.recLen); }
    this.offT = 0; this.stuckT = 0; this.stuckProg = this.tracker.progress();
    this.freeReset();
    this.state = 'running';
    this.rewinds++;
    this.emit('rewind', { keepClock });
  }

  // nach Versetzen/Rückspulen: Hilfe wieder voll, keine Rückführung, kein laufender Ausflug
  freeReset() {
    this.own = 0; this.manual = false; this.holdT = 0; this.back = null; this.ap.shift = 0; this.shortcut = null; this.calmT = 0; this.anchorDriven = 0;
    const t = this.tracker;
    this.onRoad = { prog: t.progress(), idx: t.idx, lap: t.lap, cp: this.cpNext };
  }

  requestRewind() {
    if (this.state === 'running' || this.state === 'wreck') { this.rewind(3); }
  }

  // Aufzeichnung fürs Geisterauto: jede Zeitstrafe als Stillstand an der Crash-Stelle einfügen,
  // damit Geist und Uhr zusammenpassen (Rennzeit = Aufzeichnungszeit + Strafen).
  ghostRec() {
    if (!this.pens.length) return this.rec;
    const R = this.rec, out = [];
    let from = 0;
    for (const p of this.pens) {
      const o = Math.min(p.f * REC_STRIDE, R.length);
      for (let i = from; i < o; i++) out.push(R[i]);
      from = o;
      const src = Math.max(0, o - REC_STRIDE);
      if (src + REC_STRIDE > R.length) continue;
      for (let k = Math.round(p.sec * REC_HZ); k > 0; k--) for (let q = 0; q < REC_STRIDE; q++) out.push(R[src + q]);
    }
    for (let i = from; i < R.length; i++) out.push(R[i]);
    return out;
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
