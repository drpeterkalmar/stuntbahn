// Renn-Logik: Countdown, Zeit, Checkpoints, Crash (Fahrbahn-Reset mit Zeitstrafe oder Wrack),
// Rückspulen, Fahrhilfen (Mischung Spieler/Autopilot), Abkürzungs-Regel, Aufzeichnung für Replay + Geist.
// Reines JS (auch in Node lauffähig).
import { Car, CAR_DEF, driveAccel, aeroLoad } from '../physics/car.js';
import { G } from '../physics/air.js';
import { Autopilot, Tracker } from '../ai/autopilot.js';
import { WORLD_SCALE, ROAD_HW, TILE } from '../track/defs.js';
import { HOP, NITRO, NITRO_TOTAL, nitroLevel, hopModel, hopHeightAt } from '../physics/extras.js';

// Mittel (n16, Peter 29.09.2026: „Mittlere Schwierigkeit mehr Bodenhaftung und kein Magnet zur Ideallinie“): kein
// Lenkzug zur Linie mehr (steerPull bis n15 0,28, im Stunt stuntPull 0,6), dafür mehr Reifenhaftung (grip, Faktor auf
// die Reifen-Reibung, bis n15 1) und mehr Anpressdruck (magnet, bis n15 0,35). URL ?mgrip=1 = Mittel bis n15 (A/B,
// wertet dann auch in der alten Mittel-Liste). Messung: MITTEL_BERICHT.md, tools/mittel_probe.mjs
const urlQ = globalThis.location && globalThis.location.search ? new URLSearchParams(globalThis.location.search) : null;
export const MED_ALT = !!urlQ && urlQ.get('mgrip') === '1';
// Ohne jeden Zug crasht ein menschenähnlicher Fahrer in Looping/Röhre etwa viermal so oft wie bis n15 (Messung
// tools/mittel_probe.mjs). Deshalb dort (nur auf dem Stunt-Stück selbst, am Boden) eine reine Spurhilfe: hält
// die Fahrbahnmitte (nicht die Ideallinie), HUD „Looping – Spurhilfe“, deutliches Lenken übersteuert sie (SPUR).
export const MEDIUM_N15 = { steerPull: 0.28, stuntPull: 0.6, magnet: 0.35, grip: 1, slipK: 1, lanePull: 0 };
export const MEDIUM_N16 = { steerPull: 0, stuntPull: 0, magnet: 0.6, grip: 1.15, slipK: 1.25, lanePull: 0.6 };
// Spurhilfe (Mittel, n16): Anteil lanePull des Spurhalters (Regler auf die Fahrbahnmitte) im Looping/in der Röhre.
// Lenkt der Spieler deutlich (|Lenkung| > in), blendet sie in out s ganz aus; losgelassen (< keep) in back s wieder
// ein. Ankündigung im HUD ab ann s vor dem Stück (mindestens annMin m).
export const SPUR = { in: 0.5, keep: 0.15, out: 0.25, back: 0.6, ann: 1.5, annMin: 25 };
export const ASSISTS = {
  easy: { name: 'Leicht', icon: '🟢', steerPull: 0.82, autoSpeed: true, autoStunts: true, free: true, magnet: 1, air: 1, autoRewind: true, showLine: true },
  medium: { name: 'Mittel', icon: '🟡', ...(MED_ALT ? MEDIUM_N15 : MEDIUM_N16), autoSpeed: false, brakeHelp: true, autoStunts: false, air: 0.4, autoRewind: true, showLine: true },
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
// URL-Regler (Zahl) für A/B-Vergleiche am Handy
const urlNum = (k) => { const q = globalThis.location && globalThis.location.search; if (!q) return null; const v = new URLSearchParams(q).get(k); return v !== null && v !== '' && Number.isFinite(+v) ? +v : null; };
// Mittel: keine Zwangsbremse mehr (Peter 28.09.2026: „Bei Mittel bremst mich die Ideallinie ab“, n14). Bis n13 nahm die
// Hilfe ab 6 % Übertempo Gas weg und bremste (18–31 % der Rennzeit eines Vollgas-Spielers). Jetzt Einstellung
// „Bremshilfe“ (store.settings.brakeHelp): 'off' | 'hint' (Standard: nur Hinweis „Bremsen!“ + Ton, sobald man schneller
// ist als das Profil look s voraus, frühestens alle gap s) | 'soft' (bremst sanft nur bei mehr als over Übertempo UND
// ohne Vollgas; baut in inT s auf, gibt in outT s frei – Vollgas gibt sofort frei). ESP (Gegenlenken bei großem
// Kurswinkel) weicher und blendet bei deutlichem Gegenlenken (|Lenkung| > FREE.in) in espOut s aus.
export const BRAKE_HELP = { look: 0.7, hintOver: 0.03, gap: 1.5, over: 0.15, inT: 0.25, outT: 0.3, espFrom: 0.6, espRange: 0.8, espMax: 0.5, espOut: 0.3 };
export const BRAKE_HELP_MODES = { off: 'Aus', hint: 'Hinweis', soft: 'Sanft' };

// Leicht „mitlenken statt Schienen“ (Peter 28.09.2026: „ein bisschen mitlenken müssen, um auf der Ideallinie zu
// bleiben“, n14). Die Hilfe liefert nur (1 − lk) der Kurven-Vorsteuerung; den Rest lenkt der Spieler. Um die Linie
// liegt ein Band (± dz m; ab vFast[0] m/s schmaler bis fastMin × dz bei vFast[1]; nie über die Fahrbahngrenze der
// Ideallinie hinaus, an Steilkurven dzBank, vor Engstellen und angekündigten Stunts weich auf 0): darin kein Zug zur
// Linie, nur eine schwache Kurshaltung (hold) gegen Schlingern. Wer das Band verlässt (vorausschauend: Lage in look s),
// wird wie vom Autopiloten (Kurs + Querfehler, Verstärkung kE) zum Bandrand zurückgeführt, höchstens mit vlat m/s bzw.
// vlatK × Tempo quer (die Hilfe allein bringt das Auto nie ins Schleudern). Die Tempo-Automatik nimmt ab slowFrom m
// neben der Linie Tempo raus, am Bandrand bis slow (Anteil). Freies Lenken (Übernahme) nur, wenn die Eingabe außerhalb
// des Bandes weiter von der Linie wegdrückt (> awayEx m) – Mitlenken in die Kurve bleibt Hilfe.
// URL: ?lk=0…1 (Mitlenk-Anteil; 0 = Verhalten bis n13, Zug 82 %), ?lkband=m (Band ±, Standard 3,5). Wie weit das
// Auto bei „Hände weg“ treibt, hängt vor allem am Band (gemessen, 4 Strecken: lk 0,8 → 0,9 Ø 1,34–1,75 → 1,38–1,78 m;
// Band 3,5 → 4 m: 1,44–1,93 m, aber der Kind-Bot crasht dann öfter)
export const LEICHT = { lk: Math.max(0, Math.min(1, urlNum('lk') ?? 0.8)), dz: Math.max(0.5, Math.min(8, urlNum('lkband') ?? 3.5)), dzBank: 1.0, vFast: [30, 60], fastMin: 0.3, hold: 0.05, look: 0.3, lookBand: 0.8, kE: 8, vlat: 4, vlatK: 0.12, slow: 0.3, slowFrom: 1.1, gain: 0.6, awayEx: 0.5 };
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
    this.brakeHelp = BRAKE_HELP_MODES[opts.brakeHelp] ? opts.brakeHelp : 'hint';   // Mittel: Bremshilfe (n14)
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
    // Extras (Peter 28.09.2026): je 1 Hüpfer + 1 Nitro pro Runde, beim Überfahren von Start/Ziel wieder voll
    // (nicht ansparen). Option „Hüpfer & Nitro“ (Standard an); auf Leicht nutzt der Autopilot sie auf Wunsch
    // selbst („Extras automatisch“). Werte: physics/extras.js
    this.extrasOn = opts.extras !== false;
    this.autoExtras = !!opts.autoExtras;
    this.charges = { hop: this.extrasOn ? 1 : 0, nitro: this.extrasOn ? 1 : 0 };
    this.used = { hop: 0, nitro: 0 };
    this.want = { hop: false, nitro: false };
    this.nitroT = -1;       // s seit dem Zünden (< 0: aus)
    this.xev = [];          // fürs Replay: { f: Aufzeichnungs-Frame, k: 'hop' | 'nitro', end?: Frame }
    this.nitroLog = [];     // fürs Geisterauto: [Rennzeit an, Rennzeit aus]
    this.hopState = null; this.hopChkT = 0;
    this.xplan = null;      // Leicht automatisch: geplante Stellen (lazy)
    this.place(this.startIdx - (opts.startBack ?? 1));
    this.chargeLap = this.tracker.lap;
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
    else if (A.steerPull > 0 || A.stuntPull > 0 || A.brakeHelp) {
      const pull = stunt && A.stuntPull ? A.stuntPull : A.steerPull;
      const lane = A.lanePull > 0 ? this.laneSteer(dt, input, idx) : null;
      const zone = A.free ? this.freeSteer(dt, input, idx) : null;
      // Leicht: im Stunt und auf den letzten ~1,2 s davor lenkt allein der Autopilot (sauber ausgerichtet)
      const lead = zone && !zone.inside && zone.dist < Math.max(20, car.fwdSpeed() * 1.2);
      if (A.autoStunts && (stunt || lead)) { steer = ap.steer; }
      else {
        // Rückführung nach freiem Lenken: Autopilot mit voller Kraft (sonst max. 82 %)
        const p = this.back ? 1 : pull;
        // Leicht mit Mitlenk-Modell (LEICHT.lk > 0): Teil-Vorsteuerung + Korridor + Spieler; sonst Zug zur Linie
        if (A.free && LEICHT.lk > 0 && !this.back) steer = this.leichtSteer(input.steer, idx);
        else steer = ap.steer * p + steer * (1 - pull) + (pull > 0.5 && !A.stuntPull ? steer * 0.25 : 0);
        if (lane && lane.k > 0) steer = lane.steer * lane.k + steer * (1 - lane.k);
        if (A.free) steer = steer * (1 - this.own) + input.steer * this.own;   // Spieler hat Vorrang
      }
      steer = Math.max(-1, Math.min(1, steer));
      // Rückführung ohne Ruck: Lenkänderung höchstens 4/s (wie eine ruhige Hand an der Tastatur). Die Glättung endet
      // erst, wenn die Lenkung ihr Ziel erreicht hat – vorher sprang sie beim Ablauf von calmT schlagartig nach (n14)
      if ((this.calmT > 0 || this.calmLag) && !this.manual) {
        const d = 4 * dt, s2 = Math.max(this.lastInput.steer - d, Math.min(this.lastInput.steer + d, steer));
        this.calmLag = Math.abs(s2 - steer) > 1e-6;
        steer = s2;
      } else this.calmLag = false;
      if (zone) this.hud = { kind: 'stunt', text: `${zone.name}${zone.inside ? '' : ' voraus'} – Autopilot lenkt` };
      if (lane && lane.zone) this.hud = { kind: 'lane', text: `${lane.zone.name}${lane.zone.inside ? '' : ' voraus'} – Spurhilfe${lane.k > 0 || !lane.zone.inside ? '' : ' aus'}` };
      // Leicht: außerhalb der toten Zone Tempo raus (wirkt im nächsten Regler-Schritt); sonst unverändert
      // (nicht vor und in Stunts: dort muss das Profil-Tempo stimmen, z. B. das Absprung-Tempo der Schanze)
      this.ap.assistScale = A.free && LEICHT.lk > 0 && !this.manual && !this.back && !stunt && !zone ? 1 - LEICHT.slow * (this.cw || 0) : 1;
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
      else if (A.brakeHelp) {
        const vt = this.env.prof.vt[idx];
        const v = car.fwdSpeed();
        const H = BRAKE_HELP;
        if (this.brakeHelp !== 'off') this.brakeHint(v, idx, input);
        // „Sanft“: nur bei deutlichem Übertempo und ohne Vollgas; Vollgas oder genug langsamer → in outT s frei
        const want = this.brakeHelp === 'soft' && v > vt * (1 + H.over) + 1 && input.throttle < 0.95;
        this.softB = want ? Math.min(1, (this.softB || 0) + dt / H.inT) : Math.max(0, (this.softB || 0) - dt / H.outT);
        if (this.softB > 0) { thr = Math.min(thr, 1 - this.softB); brk = Math.max(brk, this.softB * Math.min(0.8, ap.brake)); }
        // Stabilitätshilfe (ESP): bei großem Kurswinkel gegenlenken + Gas weg, falsche Richtung abfangen. Weicher als
        // bis n13 (ab 0,6 statt 0,5 rad, höchstens 50 % statt 80 %) und nie gegen eine deutliche Lenkeingabe: lenkt der
        // Spieler deutlich in die andere Richtung, blendet ESP in espOut s aus
        // Ohne Linienzug (Mittel ab n16) richtet ESP nur den Kurs nach der Fahrbahn aus (−Kurswinkel) und zieht nicht
        // zur Ideallinie; bis n15 (?mgrip=1) lenkte es wie der Autopilot (Kurs + Abstand zur Linie)
        const psi = Math.abs(this.ap.psi || 0);
        const espS = A.steerPull > 0 ? ap.steer : Math.max(-1, Math.min(1, -(this.ap.psi || 0) / (this.ap.maxSteer || 0.3)));
        const against = Math.abs(input.steer) > FREE.in && Math.sign(input.steer) !== Math.sign(espS);
        this.espFade = against ? Math.min(1, (this.espFade || 0) + dt / H.espOut) : Math.max(0, (this.espFade || 0) - dt / 0.6);
        if (psi > H.espFrom && v > 3) {
          const k = Math.min(1, (psi - H.espFrom) / H.espRange) * (1 - this.espFade);
          steer = steer * (1 - H.espMax * k) + espS * H.espMax * k;
          thr = Math.min(thr, 1 - 0.5 * k);
        }
        if (psi > 2.2 && Math.abs(v) < 6) { this.wrongT = (this.wrongT || 0) + dt; if (this.wrongT > 1.5) { this.wrongT = 0; this.car.setCrash('Falsche Richtung'); } }
        else this.wrongT = 0;
      }
    }
    this.lastInput = { steer, throttle: thr, brake: brk };
    car.input.steer = steer; car.input.throttle = thr; car.input.brake = brk; car.input.hold = !!A.autoSpeed && !this.autopilotOnly && input.brake < 0.5;
    car.assist.magnet = this.autopilotOnly ? 0 : A.magnet;
    car.assist.air = this.autopilotOnly ? 0 : A.air;
    car.assist.grip = this.autopilotOnly ? 1 : A.grip || 1;
    car.assist.slipK = this.autopilotOnly ? 1 : A.slipK || 1;
    car.surfaceKind = (L.loop[idx] || L.tube[idx]) ? 1 : 0;
    this.extrasStep(dt, idx);
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
    // Start/Ziel überfahren (neue Runde): Extras wieder voll – nicht ansparen, höchstens je 1
    if (this.tracker.lap > this.chargeLap) {
      this.chargeLap = this.tracker.lap;
      if (this.extrasOn && this.state === 'running' && (!this.charges.hop || !this.charges.nitro)) {
        this.charges.hop = 1; this.charges.nitro = 1; this.emit('refill');
      }
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
      this.snaps.push({ s: car.snapshot(), time: this.time, cp: this.cpNext, lap: this.tracker.lap, idx: ti, recLen: this.rec.length, apIdx: this.ap.tr.idx, ch: { ...this.charges } });
      if (this.snaps.length > 80) this.snaps.shift();
    }
    this.record(dt);
    if (car.crash) this.onCrash();
  }

  // Mittel, Bremshilfe „Hinweis“/„Sanft“: schneller als das Profil look s voraus (+ hintOver) und nicht selbst am
  // Bremsen → Anzeige „Bremsen!“ (race.hud) und beim ersten Mal Ereignis 'brakehint' (Ton), frühestens alle gap s
  brakeHint(v, idx, input) {
    const H = BRAKE_HELP, P = this.env.prof, L = this.env.track.line;
    const j1 = this.ap.ahead(idx, Math.max(8, v * H.look));
    let vmin = P.vt[idx];
    for (let j = idx, c = 0; c < 400; c++) { vmin = Math.min(vmin, P.vt[j]); if (j === j1) break; j = j + 1 >= L.n ? (L.closed ? 1 : L.n - 1) : j + 1; }
    const need = v > vmin * (1 + H.hintOver) + 1 && input.brake < 0.3;
    if (need && !this.bhOn && this.simTime - (this.bhT ?? -99) > H.gap) { this.bhT = this.simTime; this.emit('brakehint', { dv: v - vmin }); }
    this.bhOn = need;
    if (need) this.hud = { kind: 'brake', text: 'Bremsen!' };
  }

  // Mittel: Spurhilfe in Looping/Röhre/Korkenzieher (nicht in der Luft, nicht an Schanzen). Liefert { steer, k, zone }:
  // steer = Lenkung des Spurhalters (Fahrbahnmitte), k = sein Anteil (0 … lanePull), zone = Stück fürs HUD (oder null)
  laneSteer(dt, input, idx) {
    const L = this.env.track.line, car = this.car, A = this.assist;
    const on = (L.loop[idx] || L.tube[idx]) && !L.air[idx] && car.onGround > 0;
    const a = Math.abs(input.steer);
    this.laneOwn = a > SPUR.in ? Math.min(1, (this.laneOwn || 0) + dt / SPUR.out) : a < SPUR.keep ? Math.max(0, (this.laneOwn || 0) - dt / SPUR.back) : (this.laneOwn || 0);
    let z = this.zoneAhead(idx, Math.max(SPUR.annMin, car.fwdSpeed() * SPUR.ann));
    if (z && !z.kinds.some((k) => k !== 'jump')) z = null;
    if (!on) return { steer: 0, k: 0, zone: z };
    if (!this.laneAp) this.laneAp = new Autopilot(L, this.env.prof);
    this.laneAp.tr.idx = this.ap.tr.idx; this.laneAp.tr.lap = this.ap.tr.lap;
    return { steer: this.laneAp.control(car).steer, k: A.lanePull * (1 - this.laneOwn), zone: z };
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
    this.zoneNow = zone;
    // Mitlenk-Modell: Übernahme nur, wenn die Eingabe außerhalb des Bandes weiter von der Linie wegdrückt (positives
    // Lenken bewegt das Auto zur +B-Seite, lat > 0 = rechts der Linie); in die Kurve mitlenken bleibt Hilfe
    const ex = this.ex || 0;
    const away = LEICHT.lk <= 0 || (Math.abs(ex) > LEICHT.awayEx && Math.sign(input.steer) === Math.sign(ex));
    if (a > FREE.in && away) this.holdT += dt; else this.holdT = 0;
    if (zone) this.manual = false;
    else if (this.holdT >= FREE.hold) { this.manual = true; this.relT = 0; }
    else if (this.manual) {
      if (a <= FREE.keep) { this.relT += dt; if (this.relT >= FREE.rel) this.manual = false; } else this.relT = 0;
    }
    const ap = this.ap;
    // Lenk-Glättung läuft von der Übernahme bis 2 s nach Ende der Rückführung
    // (Mitlenk-Modell: nicht schon ab 1 m neben der Linie – dort fährt man jetzt oft, die Glättung bremste den Spieler)
    this.calmT = this.manual || this.back || this.own > 0 || (LEICHT.lk <= 0 && Math.abs(ap.lat) > 1) ? 1.5 : Math.max(0, (this.calmT || 0) - dt);
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

  // Leicht, Mitlenk-Modell: (1 − lk) der Kurven-Vorsteuerung des Autopiloten + Band-Rückführung + Spieler.
  // Rückführung vorausschauend (Lage in look s aus Kurswinkel und Tempo) und sanft: Kurshaltung von hold (im Band)
  // weich bis voll (0,5 m darüber), Rückkehr höchstens mit vlat m/s quer – ein fester großer Ausschlag ließ das Auto
  // bei Tempo quer schießen.
  leichtSteer(u, idx) {
    const ap = this.ap, v = Math.abs(this.car.fwdSpeed()), psi = ap.psi || 0;
    // Vorhersage der Lage in look s aus dem Kurswinkel – nicht in der Anfahrt zu einem angekündigten Stunt: dort
    // versetzt die Linie ihre Spur (Korkenzieher, Looping), der Kurswinkel zur Linie voraus sähe wie Wegdriften aus
    const ex = this.corridor(idx, ap.lat, this.zoneNow ? ap.lat : ap.lat + v * Math.sin(psi) * LEICHT.look);
    const sm = (q) => (q <= 0 ? 0 : q >= 1 ? 1 : q * q * (3 - 2 * q));
    const k = LEICHT.hold + (1 - LEICHT.hold) * sm(Math.abs(ex) / 0.5);
    const lim = Math.asin(Math.min(1, Math.max(LEICHT.vlat, LEICHT.vlatK * v) / Math.max(v, 1)));
    const eT = Math.max(-lim, Math.min(lim, Math.atan2(LEICHT.kE * ex, v + 3)));
    const corr = (-k * psi - eT + k * (ap.yawTerm || 0)) / (ap.maxSteer || 0.3);
    // Spieler-Anteil (grobe Handy-Tipps wirken nicht mit vollem Einschlag); vor einem angekündigten Stunt („… voraus –
    // Autopilot lenkt“) blendet er mit dem Band aus, damit das Auto gerade und mittig einfädelt
    const up = u * LEICHT.gain * (this.stuntFade ?? 1);
    // Vorsteuerung auffüllen: höchstens (1 − lk) des Nötigen und nur, was der Spieler in Kurvenrichtung noch nicht
    // selbst lenkt (wer voll mitlenkt, bekommt nichts dazu – sonst lenkte das Auto doppelt ein)
    const F = Math.abs(ap.ffN || 0), sg = Math.sign(ap.ffN || 0), U = up * sg;
    const ff = sg * Math.max(0, Math.min((1 - LEICHT.lk) * F, (1 - LEICHT.lk) * F - (U - LEICHT.lk * F)));
    // vor einem angekündigten Stunt weich auf die reine Autopilot-Lenkung überblenden (bis zur Übergabe ~1,2 s davor)
    const sf = this.stuntFade ?? 1;
    return sf * (ff + corr + up) + (1 - sf) * (ap.out ? ap.out.steer : 0);
  }
  // Band um die Ideallinie: ± dz, begrenzt durch die Fahrbahngrenze der Ideallinie (I.lo/I.hi). Liefert, wie weit das
  // Auto (Vorderachse, lat) außerhalb liegt (0 = im Band), merkt sich Band (freeSteer) und Anteil (Tempo-Abschlag).
  corridor(idx, lat, latP = lat) {
    const I = this.env.ideal || this.env.track.line;
    // engste Stelle der nächsten Meter (Tempo × look + 3 m): am Scheitel rückt die Innengrenze an die Linie heran
    // Stunt angekündigt (freeSteer): Band schrumpft bis zur Übergabe an den Autopiloten (~1,2 s davor) weich auf 0 –
    // das Auto ist dann schon auf der Linie und fädelt ruhig in Looping, Röhre, Korkenzieher oder Schanze ein
    const v = Math.abs(this.car.fwdSpeed()), Z = this.zoneNow;
    // bei hohem Tempo schmaler (ab vFast[0] m/s weich bis auf fastMin des Bandes bei vFast[1]): Mitlenken zählt in
    // Kurven; bei 200+ km/h ließ ein breites Band das Auto an Leitplanken, Hochstraßen-Wände und Bauwerke treiben
    const uF = Math.max(0, Math.min(1, (v - LEICHT.vFast[0]) / (LEICHT.vFast[1] - LEICHT.vFast[0])));
    let dz = LEICHT.dz * (1 - (1 - LEICHT.fastMin) * uF * uF * (3 - 2 * uF));
    this.stuntFade = 1;
    if (Z && !Z.inside) {
      const lead = Math.max(20, v * 1.2), pre = Math.max(FREE.preMin, v * FREE.pre);
      this.stuntFade = Math.max(0, Math.min(1, (Z.dist - lead) / Math.max(1, pre - lead)));
      dz *= this.stuntFade;
    }
    // überhöhte Fahrbahn (Steilkurven und ihre Übergänge): schmales Band wie die Ideallinie dort (KEEP_BANK) –
    // neben der Linie rutscht ein Auto die Flanke hinab bzw. hebt am verwundenen Übergang ab
    const B = this.env.track.line;
    if (Math.abs(B.by[idx]) > 0.12) dz = Math.min(dz, LEICHT.dzBank);
    // Engstelle voraus (Slalom, Stunt-Spur: Linien-Grenzen < 1 m breit): Band wie vor Stunts rechtzeitig auf 0
    const lo0 = I.blo || I.lo, hi0 = I.bhi || I.hi;
    const jn = this.ap.ahead(idx, Math.max(20, v * 2.2));
    for (let j = idx, c = 0, d = 0; c < 600; c++) {
      if (hi0[j] - lo0[j] < 1) { const lead = Math.max(10, v * 1.0); dz *= Math.max(0, Math.min(1, (d - lead) / Math.max(1, v * 1.2))); break; }
      if (j === jn) break;
      const k = j + 1 >= I.n ? (I.closed ? 1 : I.n - 1) : j + 1;
      d += Math.max(0, I.s[k] - I.s[j]); j = k;
    }
    // selbst gezündeter Nitro (Extras automatisch): der geplante Zeitgewinn setzt die Linie voraus → schmales Band
    if (this.autoNitro && this.nitroT >= 0) dz = Math.min(dz, LEICHT.dzBank);
    let lo = -dz, hi = dz;
    // Fahrbahngrenzen der nächsten lookBand s (+3 m): Verengungen (Autobahn-Übergang, Scheitel) früh genug sehen
    const j1 = this.ap.ahead(idx, v * LEICHT.lookBand + 3);
    for (let j = idx, c = 0; c < 400; c++) {
      if (Math.abs(B.by[j]) > 0.12) { lo = Math.max(lo, -LEICHT.dzBank); hi = Math.min(hi, LEICHT.dzBank); }
      lo = Math.max(lo, lo0[j]); hi = Math.min(hi, hi0[j]);
      if (j === j1) break;
      j = j + 1 >= I.n ? (I.closed ? 1 : I.n - 1) : j + 1;
    }
    if (lo > hi) lo = hi = (lo + hi) / 2;
    // Überschreitung: jetzt oder (vorausschauend) gleich – die größere zählt, nach außen gerichtet
    const exOf = (x) => (x < lo ? x - lo : x > hi ? x - hi : 0);
    const e0 = exOf(lat), e1 = exOf(latP);
    const ex = Math.abs(e1) > Math.abs(e0) ? e1 : e0;
    this.band = [lo, hi]; this.ex = ex;
    // Tempo-Abschlag (Anteil 0 … 1): in Kurven (Querbeschleunigung des Plans bis 8 m/s² voll) ab slowFrom m neben
    // der Linie, voll am Bandrand und außerhalb – ein Auto neben der Ideallinie fährt einen engeren Bogen
    const curv = Math.min(1, Math.abs(this.env.prof.kA[idx]) * v * v / 8);
    const x = (Math.abs(lat) - LEICHT.slowFrom) / Math.max(0.3, LEICHT.dz - LEICHT.slowFrom);
    // außerhalb des Bandes wächst der Abschlag mit der Überschreitung (die Band-Grenze liegt an Scheitel und Kurven-
    // ausgang genau auf der Fahrbahngrenze der Linie – wenige cm darüber sind noch Fahrbahn), voll 0,8 m darüber
    const sm = (q) => (q <= 0 ? 0 : q >= 1 ? 1 : q * q * (3 - 2 * q));
    this.cw = Math.max(curv * sm(x), sm(Math.abs(ex) / 0.8));
    return ex;
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
    this.stopNitro();
    this.state = 'finished';
    this.finalTime = this.time;
    this.emit('finish', { time: this.time });
  }

  onCrash() {
    this.crashes++;
    this.crashT = 0;
    this.stopNitro();
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
    this.stopNitro();
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
    this.stopNitro();
    if (keepClock) this.cuts.push({ f: this.recFrames() });
    else {
      // Totalschaden an: Uhr und Aufzeichnung zurück – dann auch die Extras wie damals
      this.time = sn.time; this.rec.length = Math.min(this.rec.length, sn.recLen);
      if (sn.ch) Object.assign(this.charges, sn.ch);
      const fr = this.recFrames();
      this.xev = this.xev.filter((e) => e.f < fr);
      for (const e of this.xev) if (e.end > fr) e.end = fr;
      this.nitroLog = this.nitroLog.filter((x) => x[0] < this.time);
      for (const x of this.nitroLog) x[1] = Math.min(x[1], this.time);
    }
    this.offT = 0; this.stuckT = 0; this.stuckProg = this.tracker.progress();
    this.freeReset();
    this.state = 'running';
    this.rewinds++;
    this.emit('rewind', { keepClock });
  }

  // nach Versetzen/Rückspulen: Hilfe wieder voll, keine Rückführung, kein laufender Ausflug
  freeReset() {
    this.own = 0; this.manual = false; this.holdT = 0; this.back = null; this.ap.shift = 0; this.shortcut = null; this.calmT = 0; this.anchorDriven = 0; this.calmLag = false;
    const t = this.tracker;
    this.onRoad = { prog: t.progress(), idx: t.idx, lap: t.lap, cp: this.cpNext };
  }

  // ---------- Extras: Hüpfer + Nitro ----------
  // Wunsch vom Spieler (Taste/Knopf); ausgeführt im nächsten Physikschritt
  requestHop() { if (this.state === 'running') this.want.hop = true; }
  requestNitro() { if (this.state === 'running') this.want.nitro = true; }

  // je Physikschritt vor car.step: Nitro-Hüllkurve, Leicht-Automatik, Wünsche ausführen, Anzeige-Zustand
  extrasStep(dt, idx) {
    const car = this.car;
    if (this.nitroT >= 0) { this.nitroT += dt; if (this.nitroT >= NITRO_TOTAL) this.stopNitro(); }
    car.boost = this.nitroT >= 0 ? nitroLevel(this.nitroT) : 0;
    if (!this.extrasOn) { this.want.hop = this.want.nitro = false; return; }
    // Leicht + „Extras automatisch“: nur, solange die Hilfe lenkt (nicht während der Spieler frei fährt)
    if (this.autoExtras && this.assist.autoSpeed && !this.autopilotOnly && !this.manual && this.own < 0.05 && !this.back) this.autoUse(idx);
    if (this.want.nitro) { this.want.nitro = false; this.fireNitro(); }
    if (this.want.hop) { this.want.hop = false; this.fireHop(idx); }
    this.hopChkT -= dt;
    if (this.hopChkT <= 0) { this.hopChkT = 0.1; this.hopState = this.hopBlock(idx); }
  }
  fireNitro() {
    if (this.charges.nitro < 1) { this.emit('xdenied', { k: 'nitro', why: 'empty' }); return; }
    this.charges.nitro = 0; this.used.nitro++;
    this.nitroT = 0;
    this.xev.push({ f: this.recFrames(), k: 'nitro' });
    this.nitroLog.push([this.time, this.time + NITRO_TOTAL]);
    this.emit('nitro');
  }
  stopNitro() {
    if (this.nitroT < 0) return;
    this.nitroT = -1; this.car.boost = 0; this.autoNitro = false;
    const e = this.xev.filter((x) => x.k === 'nitro').pop(), fr = this.recFrames();
    if (e && e.end == null) e.end = fr;
    const g = this.nitroLog[this.nitroLog.length - 1];
    if (g) g[1] = Math.min(g[1], this.time);
  }
  fireHop(idx) {
    const why = this.hopBlock(idx);
    if (why) { this.emit('xdenied', { k: 'hop', why }); return; }
    this.car.hop(hopModel().lift);
    this.charges.hop = 0; this.used.hop++;
    this.hopState = 'air';
    this.xev.push({ f: this.recFrames(), k: 'hop' });
    this.emit('hop');
  }
  // Warum geht der Hüpfer gerade nicht? null = geht. 'off' Option aus, 'empty' verbraucht, 'wait' kein Rennen,
  // 'air' kein Bodenkontakt, 'lock' Looping/Röhre/Korkenzieher/Schanze (darin oder in Reichweite des Fluges),
  // 'tilt' Fahrbahn zu schräg, 'roof' Brücke/Decke über der Flugbahn
  hopBlock(idx) {
    if (!this.extrasOn) return 'off';
    if (this.charges.hop < 1) return 'empty';
    const car = this.car;
    if (this.state !== 'running' || car.crash) return 'wait';
    if (car.onGround < HOP.minGround || car.hopUp) return 'air';
    const L = this.env.track.line, M = hopModel();
    const v = Math.max(0, car.fwdSpeed()), reach = v * M.flight.time + 15;
    const n = L.n, s0 = L.s[idx];
    // entlang der Linie: 5 m zurück bis Flugweite + 15 m voraus
    let i = idx;
    for (let k = 0; k < 8 && i > 0 && s0 - L.s[i - 1] < 5; k++) i--;
    if (L.loop[i] || L.tube[i] || this.isJumpZone(i)) return 'lock';
    const W = this.env.world, ox = car.pos.x - L.px[idx], oz = car.pos.z - L.pz[idx];
    let lastRay = -1e9;
    for (let k = 0, j = idx; k < n; k++) {
      let d = L.s[j] - s0; if (d < 0) d += L.total;
      if (d > reach) break;
      // Schanzen (Anlauf, Lippe, Landung) auch: der Hüpfer verdürbe den Sprung
      if (L.loop[j] || L.tube[j] || (d < reach - 15 && this.isJumpZone(j))) return 'lock';
      // Decke über der Flugbahn (Brücke, Tunnel): Strahl von der Fahrbahn bis 1,6 m über den Wagenboden
      if (W && d - lastRay >= 5) {
        lastRay = d;
        const h = hopHeightAt(M.flight, v, d);
        if (h > 0.3) {
          const hit = W.rayTrack(L.px[j] + ox, L.py[j] + 0.5, L.pz[j] + oz, 0, 1, 0, h + 1.6, false);
          if (hit) return 'roof';
        }
      }
      const nj = j + 1 >= n ? (L.closed ? 1 : n - 1) : j + 1;
      if (nj === j) break;
      j = nj;
    }
    // Fahrbahn zu schräg (Steilkurven-Flanke, Wand): seitlich weg hüpfen ginge schief
    let gx = 0, gy = 0, gz = 0;
    for (const w of car.wheels) if (w.contact) { gx += w.nx; gy += w.ny; gz += w.nz; }
    if (gy / (Math.hypot(gx, gy, gz) || 1) < HOP.maxTilt) return 'tilt';
    return null;
  }
  // Leicht automatisch: Nitro auf der längsten Geraden, Hüpfer nur über Bodenwellen und nur, wenn sicher
  autoUse(idx) {
    const P = this.xplan || (this.xplan = this.planExtras());
    const car = this.car;
    if (this.tracker.lap >= 1 && this.cpNext >= this.cps.length) return;   // Zieleinfahrt: lohnt nicht mehr
    if (this.charges.nitro && P.nitro && this.nitroT < 0 && car.onGround >= 2 && this.inRange(idx, P.nitro.i0, P.nitro.i1)) { this.want.nitro = true; this.autoNitro = true; }
    if (this.charges.hop && !this.want.hop && P.hops.some((h) => this.inRange(idx, h.i0, h.i1)) && this.hopSafe(idx)) this.want.hop = true;
  }
  inRange(i, a, b) { return a <= b ? i >= a && i <= b : i >= a || i <= b; }
  // Plan einmal je Rennen. Nitro: Stelle mit dem größten Zeitgewinn – 1-D-Rechnung auf dem Tempo-Profil (wie
  // der Vorwärtslauf in profile.js, gedeckelt vom Brems-Profil vt) –, das ist der Anfang der längsten Geraden.
  // Ausgeschlossen, wenn während der Wirkung ein Sprung, Looping, Korkenzieher oder eine Röhre kommt.
  planExtras() {
    const L = this.env.track.line, T = this.env.track, P = this.env.prof, n = L.n, def = CAR_DEF;
    const stunt = (i) => L.air[i] || L.loop[i] || L.tube[i] || this.isJumpZone(i);
    // Runde in Fahrtrichtung ab dem Start (nur eine Runde zählt: Gewinn hinter dem Ziel ist nichts wert)
    const ord = [];
    for (let k = 0, i = Math.max(0, this.startIdx - 1); k < n; k++) {
      ord.push(i);
      const j = i + 1 >= n ? (L.closed ? 1 : -1) : i + 1;
      if (j < 0 || (L.closed && k > 10 && j === this.startIdx)) break;
      i = j;
    }
    const acc = (v, lv, i) => driveAccel(def, v) + lv * NITRO.k * Math.min(def.maxDrive * aeroLoad(def, v), def.power / Math.max(v, 1)) / def.mass - G * L.ty[i];
    const ds = (k) => Math.max(0, L.s[ord[k + 1]] - L.s[ord[k]]) || 0;
    // Vergleichsfahrt ohne Nitro (stehender Start), gleiche Rechnung
    const vb = new Float32Array(ord.length);
    for (let k = 0; k + 1 < ord.length; k++) vb[k + 1] = Math.min(P.vt[ord[k + 1]], Math.sqrt(Math.max(0, vb[k] * vb[k] + 2 * acc(vb[k], 0, ord[k]) * ds(k))));
    const gain = (k0) => {
      let v = vb[k0], t = 0, g = 0;
      for (let k = k0; k + 1 < ord.length; k++) {
        if (stunt(ord[k + 1]) && t < NITRO_TOTAL + 0.5) return -1;
        const d = ds(k);
        const v2 = Math.min(P.vt[ord[k + 1]], Math.sqrt(Math.max(0, v * v + 2 * acc(v, nitroLevel(t), ord[k]) * d)));
        const vn = Math.max(0.5, (v + v2) / 2), vo = Math.max(0.5, (vb[k] + vb[k + 1]) / 2);
        t += d / vn; g += d / vo - d / vn;
        v = v2;
        if (t > NITRO_TOTAL && v <= vb[k + 1] + 0.05) break;
      }
      return g;
    };
    let best = -1, bk = -1;
    for (let k = 0; k + 1 < ord.length; k += 2) {
      // nur in voller Fahrt (ab 54 km/h), wo das Auto beschleunigt – also auf einer Geraden, nicht beim stehenden
      // Start (dort brächte er ~0,25 s mehr, Peter wünscht ihn aber auf der Geraden; selbst zünden geht immer)
      if (vb[k] < 15 || vb[k] > P.vt[ord[k]] - 1 || stunt(ord[k])) continue;
      const g = gain(k);
      if (g > best) { best = g; bk = k; }
    }
    let nitro = null;
    if (bk >= 0 && best > 0.02) {
      let k = bk;
      while (k + 1 < ord.length && L.s[ord[k + 1]] - L.s[ord[bk]] <= 15 && L.s[ord[k + 1]] >= L.s[ord[bk]]) k++;
      nitro = { i0: ord[bk], i1: ord[k], gain: best };
    }
    // Bodenwellen (Generator-Baustein, drei Wellen mittig im Feld): Absprung so, dass die Landung hinter den
    // Wellen liegt – frühestens 150 m, spätestens 3 m vor der ersten Welle (die Flugweite prüft hopSafe)
    const hops = [];
    T.pieces.forEach((pc) => {
      if (!pc || pc.type !== 'bumps' || pc.lineEnd < pc.lineStart) return;
      const sb = L.s[pc.lineStart] + TILE / 2 - 7.5;
      let i0 = -1, i1 = -1;
      for (let k = 0, i = pc.lineStart; k < n; k++) {
        let d = sb - L.s[i]; if (d < -L.total / 2) d += L.total;
        if (d > 150) break;
        if (d >= 3) { i0 = i; if (i1 < 0) i1 = i; }
        i = i - 1 < 0 ? (L.closed ? n - 2 : 0) : i - 1;
        if (i === 0 && !L.closed) break;
      }
      if (i0 >= 0) hops.push({ i0, i1, sb, sEnd: sb + 15 });
    });
    return { nitro, hops };
  }
  // Automatischer Hüpfer sicher? Zusätzlich zu hopBlock: Tempo 10–60 m/s, die Landung liegt hinter den Wellen,
  // gerade Fahrbahn über die ganze Flugstrecke + 25 m, kein Sprung, keine Engstelle, und ab den Wellen bis zur
  // Landung nirgends langsamer als jetzt nötig (in der Luft kann das Auto nicht bremsen). Das Tempo-Limit der
  // Wellen selbst zählt nicht – über sie fliegt das Auto ja hinweg.
  hopSafe(idx) {
    const L = this.env.track.line, I = this.env.ideal || L, P = this.env.prof, car = this.car, n = L.n;
    const H = this.xplan.hops.find((h) => this.inRange(idx, h.i0, h.i1));
    if (!H) return false;
    const v = car.fwdSpeed();
    if (v < 10 || v > 60) return false;
    const fl = v * hopModel().flight.time * 0.95, s0 = L.s[idx];
    let toB = H.sb - s0; if (toB < -L.total / 2) toB += L.total;
    if (toB < 3 || fl < toB + 20) return false;
    if (this.hopBlock(idx)) return false;
    for (let k = 0, j = idx; k < n; k++) {
      let d = L.s[j] - s0; if (d < 0) d += L.total;
      if (d > fl + 25) break;
      if (Math.abs(P.kA[j]) > 1 / 250 || this.isJumpZone(j) || L.air[j]) return false;
      if (d >= toB + 15 && d <= fl + 5 && P.vt[j] < v - 0.5) return false;
      if (I.lo && I.hi && I.hi[j] - I.lo[j] < 1) return false;
      const nj = j + 1 >= n ? (L.closed ? 1 : n - 1) : j + 1;
      if (nj === j) return false;
      j = nj;
    }
    return true;
  }
  // Anzeige: { hop: null | Sperrgrund, nitro: 'ok' | 'on' | 'empty' | 'off', left: Rest der Wirkung 0 … 1 }
  xstate() {
    const nitro = !this.extrasOn ? 'off' : this.nitroT >= 0 ? 'on' : this.charges.nitro ? 'ok' : 'empty';
    return { hop: this.extrasOn ? (this.charges.hop ? this.hopState : 'empty') : 'off', nitro, left: this.nitroT >= 0 ? 1 - this.nitroT / NITRO_TOTAL : 0, boost: this.car.boost };
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
