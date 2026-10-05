// Leicht „Brachial“ (n25, Peter 03.10.2026: „Kannst du den Autopilot auf Leicht etwas brachialer fahren lassen? Mit
// Driften und Schleudern so häufig wie möglich am oberen Grenzbereich des Machbaren?“).
// Fahrstil des Autopiloten auf Leicht (Option „Autopilot-Fahrstil“, Standard Brachial; „Sauber“ = Stand bis n24):
//  – Tempo am Limit: eigenes Tempo-Profil mit weniger Reserve (BRACHIAL.prof, profile.js computeProfile opts.prof)
//  – Drifts in geeigneten Kurven: Einlenken mit kurzem Handbremsen-Impuls, dann Soll-Schwimmwinkel (Car.step,
//    assist.drift: Giermoment) und Gegenlenken aus der Fahrtrichtung der Vorderachse (wie ein Drift-Fahrer: Vorderräder
//    zeigen dorthin, wo das Auto hinfährt), Gas halten; vor dem Kurvenausgang weich einfangen
//  – Show-Momente, zufällig dosiert (fester Seed je Strecke/Runde): Beinahe-Dreher (≥ 60°, wieder eingefangen), Ausritt
//    mit zwei Rädern aufs Gras am Kurvenausgang, Wackeln nach harten Landungen
//  – wo es kritisch wird (Looping, Röhre, Korkenzieher, Engstelle, Schanze, Steilkurve, Wellen/Kuppen, Hochstraße),
//    fährt er wie bisher sauber
import { maxSteerAt } from '../physics/car.js';
import { computeProfile } from './profile.js';
import { MAT, WORLD_SCALE } from '../track/defs.js';
import { rng, hashStr } from '../core/util.js';

export const BRACHIAL = {
  // Tempo-Profil (Teilmenge von PROF): Querhaftung 96 % statt 76 % (der Leicht-Magnet hält zusätzlich), Bremsplan 90 %
  // statt 70 % des Haftungskreises (später, härter), Schanze 1,3 statt 1,5 m/s unter der Fenster-Obergrenze (Landung am Ende der Rampe), an Kuppen
  // ein Viertel der Bodenhaftung bei Tempo eingerechnet. Vor Stunts/Engstellen bleibt resPre (sauber einfädeln).
  prof: { res: 0.96, brakeCircle: 0.9, jumpSafe: 1.3, haft: 0.25 },
  // Drift-Stellen: Kurven mit Radius ≤ rMax m, Bogen ≥ minTurn rad und ≥ minLen m, Fahrbahn ≥ minW m breit (Ideallinie
  // lo … hi), nicht näher als gapStunt m bzw. gapT s vor und gapAfter m hinter Stunts/Schanzen/Engstellen/Steilkurven/Wellen,
// vor Hochstraßen ohne Bande und starken Kuppen gapSoft m bzw. gapSoftT s
  rMax: 75 * WORLD_SCALE, minTurn: 0.55, minLen: 14, minW: 6, gapStunt: 25, gapT: 1.4, gapSoft: 8, gapSoftT: 0.6, gapAfter: 12, kMin: 1 / (75 * WORLD_SCALE), kCMax: 0.012,
  // Bahnregler im Drift (Querfehler-Verstärkung wie der Autopilot, nur kräftiger), Gas beim Einfangen höchstens thrOut
  kE: 4, thrOut: 0.55,
  // Ablauf: Einlenken lead s vor dem Kurvenbeginn, Winkel in tIn s auf, in tOut s vor dem Kurvenende wieder ab
  lead: 0.25, tIn: 0.35, tOut: 0.45, hand: 0.14,
  // Soll-Schwimmwinkel (Grad): zufällig im Band, enge Kurven eher mehr; Wahrscheinlichkeit je Kurve und Runde
  beta: [18, 34], p: 0.93,
  // Physik im Drift (car.js): Gegenlenk-Einschlag (rad), Heckhaftung, Antriebsanteil vorn
  lock: 0.62, rearGrip: 0.9, driveFront: 0.3,
  // Tempo in Drift-Kurven: Anteil fD des Brachial-Kurventempos (im Drift zeigt die Hinterachse schräg zur Fahrtrichtung
  // und trägt weniger zur Kurvenkraft bei), ab lead s vor der Kurve bis zu ihrem Ende
  fD: 0.88,
  // Show: Beinahe-Dreher (Winkel, Dauer s, Wahrscheinlichkeit je Kurve, höchstens 1 je Runde, nur bis vSpin m/s),
  // Ausritt (Wahrscheinlichkeit je Kurve mit Gras außen, Tiefe m über die Kante, höchstens 1 je Runde)
  spin: 66, spinT: 0.5, spinP: 0.4, vSpin: 32, spinLen: 30, grassP: 0.35, grassOut: 0.35, grassNear: 2.0, grassT: 1.6,
  // Einfangen: nach dem Drift (und bei jedem ungewollten Rutschen über slip Grad) Soll-Winkel 0, bis das Auto calmT s
  // lang unter calm Grad liegt (höchstens settleMax s)
  slip: 10, calm: 3, calmT: 0.25, settleMax: 1.5,
  // Wackeln nach harter Landung (Sprung mit ≥ wobbleAir s Flug): Winkel-Ausschlag (Grad), Dauer s
  wobble: 9, wobbleT: 0.7, wobbleAir: 0.8,
  // Sicherheit: Abbruch, wenn die Wagenmitte (vorausgesagt edgeLook s) näher als edge m an den Fahrbahnrand kommt
  edge: 0.6, edgeLook: 0.25,
};

const RAD = Math.PI / 180;
const sm = (q) => (q <= 0 ? 0 : q >= 1 ? 1 : q * q * (3 - 2 * q));

// Drift-Stellen auf der Ideallinie I (gleiches Index-Raster wie die Basislinie). track: Stunts, Schanzen; high: Linien-
// punkte hoch über dem Gelände (race.js highLine); world: Gras außen (Ausritt). Liefert [{ i0, ia, i1, sg, len, kMax }]:
// i0 Einlenk-Punkt (lead vor ia), ia/i1 Kurvenbeginn/-ende, sg +1 = Rechtskurve (kA > 0), −1 = Linkskurve.
export function planDrifts(I, prof, track, high, world) {
  const B = BRACHIAL, L = track.line, n = I.n, kA = prof.kA, vt = prof.vt, TR = track.terrain;
  // gesperrte Punkte: 2 = hart (Stunts, Schanzen-Zonen, Engstellen, Steilkurven, Wellen/Kuppen/Steilwand – davor viel
  // Abstand), 1 = weich (Hochstraße ohne Bande, starke Kuppe/Senke – der Drift muss nur vorher eingefangen sein)
  const bad = new Uint8Array(n);
  // Hochstraße: Linie > 3 m über dem Gelände (wie race.js highLine, ohne dessen 25-m-Saum), nur mit Bande/Wand auf
  // beiden Seiten befahrbar (waagrechter Strahl 0,45 m über der Fahrbahn bis 1,2 m hinter die Kante; jeden 3. Punkt)
  let wallOk = 0;
  const walls = (i) => {
    if (!world) return false;
    for (const sd of [-1, 1]) {
      const ox = L.px[i] + L.nx[i] * 0.45, oy = L.py[i] + L.ny[i] * 0.45, oz = L.pz[i] + L.nz[i] * 0.45;
      const h = world.ray(ox, oy, oz, L.bx[i] * sd, L.by[i] * sd, L.bz[i] * sd, (L.hw ? L.hw[i] : 7) + 1.2, true);
      if (!h) return false;
    }
    return true;
  };
  const isHigh = (i) => (TR ? L.py[i] - TR.height(L.px[i], L.pz[i]) > 3 : high && high[i]);
  for (let i = 0; i < n; i++) {
    const pc = track.pieces[L.piece[i]];
    if (L.air[i] || L.loop[i] || L.tube[i] || Math.abs(L.by[i]) > 0.12 || (L.wave && L.wave[i]) || (pc && pc.stunt)) bad[i] = 2;
    else if (I.blo && I.bhi && I.bhi[i] - I.blo[i] < 1) bad[i] = 2;
    else if (I.hi[i] - I.lo[i] < B.minW || Math.abs(prof.kC[i]) > B.kCMax) bad[i] = 1;
    else if (isHigh(i)) { if (i % 3 === 0 || !wallOk) wallOk = walls(i) ? 1 : 0; if (!wallOk) bad[i] = 1; }
  }
  for (const j of track.jumps) for (let i = Math.max(0, j.lipIdx - 30); i <= Math.min(n - 1, j.endIdx ?? j.landIdx + 12); i++) bad[i] = 2;
  // Abstand zum nächsten gesperrten Punkt voraus (hart/weich getrennt) bzw. zurück (m, entlang der Linie, Rundkurs)
  const dist = (lvl, fwd) => {
    const D = new Float32Array(n).fill(1e9);
    for (let pass = 0; pass < (I.closed ? 2 : 1); pass++) {
      if (fwd) for (let i = n - 1; i >= 0; i--) {
        if (bad[i] >= lvl) { D[i] = 0; continue; }
        const j = i + 1 >= n ? (I.closed ? 1 : -1) : i + 1;
        if (j >= 0) D[i] = Math.min(D[i], D[j] + Math.max(0, I.s[j] - I.s[i]) + (j < i ? I.s[1] || 0 : 0));
      } else for (let i = 0; i < n; i++) {
        if (bad[i] >= lvl) { D[i] = 0; continue; }
        const a = i > 0 ? i - 1 : I.closed ? n - 2 : -1;
        if (a >= 0) D[i] = Math.min(D[i], D[a] + Math.max(0, I.s[i] - I.s[a]) + (a > i ? I.s[1] || 0 : 0));
      }
    }
    return D;
  };
  const toHard = dist(2, true), toSoft = dist(1, true), fromBad = dist(1, false);
  const ok = (i) => !bad[i] && toHard[i] > Math.max(B.gapStunt, vt[i] * B.gapT) && toSoft[i] > Math.max(B.gapSoft, vt[i] * B.gapSoftT) && fromBad[i] > B.gapAfter;
  const segs = [];
  let i = 0;
  while (i < n) {
    if (!(Math.abs(kA[i]) > B.kMin) || !ok(i)) { i++; continue; }
    const sg = Math.sign(kA[i]);
    let j = i, turn = 0, kMax = 0;
    while (j + 1 < n && Math.abs(kA[j + 1]) > B.kMin * 0.7 && Math.sign(kA[j + 1]) === sg && ok(j + 1)) {
      const ds = I.s[j + 1] - I.s[j];
      turn += Math.abs(kA[j]) * ds; kMax = Math.max(kMax, Math.abs(kA[j]));
      j++;
    }
    const len = I.s[j] - I.s[i];
    if (turn >= B.minTurn && len >= B.minLen && 1 / Math.max(kMax, 1e-6) <= B.rMax && vt[i] > 9) {
      // Einlenk-Punkt: lead s (beim Plan-Tempo) vor dem Kurvenbeginn, nicht in gesperrtes Gebiet
      let i0 = i;
      const dLead = Math.max(4, vt[i] * B.lead);
      while (i0 > 0 && I.s[i] - I.s[i0 - 1] <= dLead && ok(i0 - 1)) i0--;
      // Gras außen (für den Ausritt): Strahl nach unten 1,2 m hinter der Außenkante, an drei Stellen im letzten Drittel
      // … nur wo die Ideallinie am Kurvenende schon nah (≤ grassNear m) an der Außenkante liegt („außen raus“)
      const edgeEnd = -sg > 0 ? I.hi[j] : -I.lo[j];
      let grass = !!world && edgeEnd <= B.grassNear;
      if (grass) {
        for (const q of [0.6, 0.8, 0.95]) {
          const k = Math.round(i + (j - i) * q);
          const out = -sg;   // Außenseite: Rechtskurve (sg > 0) → links (−B); hinter einem Randstein (1,1 m) prüfen
          const o = out * ((L.hw ? L.hw[k] : 7) + 1.7);
          const px = L.px[k] + L.bx[k] * o, py = L.py[k] + L.by[k] * o + 3, pz = L.pz[k] + L.bz[k] * o;
          const h = world.ray(px, py, pz, 0, -1, 0, 8, true);
          if (!h || h.mat !== MAT.GRASS || Math.abs(h.y - (L.py[k])) > 0.8) { grass = false; break; }
        }
      }
      segs.push({ i0, ia: i, i1: j, sg, len, kMax, turn, grass });
    }
    i = j + 1;
  }
  return segs;
}

// Tempo-Profil fürs Driften: Brachial-Profil, in den Drift-Kurven (Einlenk-Punkt bis Kurvenende) höchstens fD des
// Kurventempos – der Bremsplan davor folgt (computeProfile opts.vcap). Je Strecke einmal (env.profD).
export function driftProfile(env, prof, segs) {
  if (env.profD) return env.profD;
  const I = env.ideal || env.track.line, T = env.track, cap = new Float32Array(I.n);
  for (const s of segs) for (let i = s.i0; i <= s.i1; i++) cap[i] = prof.vt[i] * BRACHIAL.fD;
  env.profD = computeProfile(I, { jumps: T.jumps, startIdx: T.start.idx, prof: BRACHIAL.prof, vcap: cap });
  return env.profD;
}

// Drift-Regler: läuft nach dem normalen Autopiloten (ap.control) und verändert dessen Ausgabe (Lenkung, Pedale) bzw.
// setzt die Drift-Physik (car.assist.drift/lock/rearGrip/driveFront).
export class DriftCtl {
  constructor(env, prof, opts = {}) {
    this.env = env; this.I = env.ideal || env.track.line;
    this.segs = planDrifts(this.I, prof, env.track, opts.high, env.world);
    this.P = driftProfile(env, prof, this.segs);
    this.segAt = new Int16Array(this.I.n).fill(-1);
    this.segs.forEach((s, k) => { for (let i = s.i0; i <= s.i1; i++) this.segAt[i] = k; });
    const key = (env.meta && env.meta.key) || (env.layout && env.layout.meta && env.layout.meta.key) || '';
    this.seed0 = (hashStr(String(key)) ^ (opts.seed ?? 0x5eed)) >>> 0;
    this.lapRolled = -1;
    this.st = null;          // laufender Drift { k, ph: 'in'|'hold'|'out', t, bs, b0, spin, grass, hand }
    this.beta = 0;           // gemessener Schwimmwinkel (rad, + = Heck nach rechts / Linksdrift)
    this.log = [];           // fürs Kino-Replay/Messung: { k, t0, t1, bMax }
    this.wob = null;         // Wackeln nach Landung
    this.airT = 0;
  }
  reset() { this.st = null; this.wob = null; this.airT = 0; this.settle = null; this.exc = null; }

  // Würfeln je Runde: welche Kurven driften, mit welchem Winkel, wo Beinahe-Dreher/Ausritt
  roll(lap) {
    const B = BRACHIAL, r = rng((this.seed0 + lap * 7919) >>> 0);
    this.lapRolled = lap;
    this.plan = this.segs.map((s) => {
      const tight = Math.min(1, s.kMax * 30 * WORLD_SCALE);   // R ≤ 30 m × Maßstab = eng → mehr Winkel
      const deg = B.beta[0] + (B.beta[1] - B.beta[0]) * (0.35 * tight + 0.65 * r());
      return { on: r() < B.p, bs: deg * RAD, spinR: r(), grassR: r(), pos: r() };
    });
    // höchstens ein Beinahe-Dreher und ein Ausritt je Runde
    let sp = -1, gr = -1;
    this.plan.forEach((p, k) => {
      if (!p.on) return;
      if (sp < 0 && p.spinR < B.spinP && this.segs[k].len > B.spinLen && this.P.vt[this.segs[k].ia] < B.vSpin) { p.spin = true; sp = k; }
      else if (gr < 0 && this.segs[k].grass && p.grassR < B.grassP) { p.grass = true; gr = k; }
    });
  }

  // car: Auto; ap: Autopilot (nach control); o: Ausgabe { steer, throttle, brake } (wird verändert); blocked: Spieler lenkt
  // selbst / Stunt-Übergabe; lap: Runde (Tracker). Liefert die Physik-Hilfen fürs Auto.
  step(dt, car, ap, o, blocked, lap) {
    const B = BRACHIAL, I = this.I, F = car.frame, idx = ap.tr.idx;
    if (lap !== this.lapRolled) this.roll(lap);
    const vf = car.v.x * F.f.x + car.v.y * F.f.y + car.v.z * F.f.z, vr = car.v.x * F.r.x + car.v.y * F.r.y + car.v.z * F.r.z;
    const yaw = car.w.x * F.u.x + car.w.y * F.u.y + car.w.z * F.u.z;
    const v = Math.hypot(vf, vr);
    this.beta = Math.atan2(vr, vf);
    o.hand = 0;
    const res = { drift: null, lock: 0, rearGrip: 0, driveFront: null };
    // Ausritt: Ziel des Autopiloten weich bis grassOut m über die Asphaltkante (Basislinie ± hw) und zurück – die
    // Außenräder rollen hinter dem Randstein durchs Gras
    if (this.exc) {
      const X = this.exc, u = (X.t += dt) / B.grassT, out = -X.sg, Lb = this.env.track.line;
      const ja = ap.ahead(idx, Math.max(1.2, Math.abs(vf) * 0.12));
      const tgt = out * ((Lb.hw ? Lb.hw[ja] : 7) + B.grassOut) - (I.off ? I.off[ja] : 0);
      const bump = sm(u / 0.35) * (1 - sm((u - 0.6) / 0.4));
      if (u >= 1 || blocked || car.onGround < 2) { ap.extra = 0; this.exc = null; } else ap.extra = tgt * bump;
      if (car.grass > 0) { if (this.st) this.st.grassHit = true; else if (X.log) X.log.grass = true; }
    }
    // Wackeln nach einer harten Landung (kurzer Gier-Ausschlag hin und her, Drift-Physik hält ihn)
    if (car.onGround === 0) this.airT += dt;
    else {
      if (this.airT > B.wobbleAir && !this.st && !blocked && v > 12) this.wob = { t: 0, sg: (lap + idx) % 2 ? 1 : -1 };
      this.airT = 0;
    }
    let S = this.st;
    // neuer Drift: Einlenk-Punkt erreicht
    if (!S && !blocked) {
      const k = this.segAt[idx];
      if (k >= 0 && idx <= this.segs[k].ia && this.plan[k].on && car.onGround >= 3 && v > 9 && this.lastK !== k + lap * 10000) {
        const p = this.plan[k], seg = this.segs[k];
        S = this.st = { k, ph: 'in', t: 0, bs: p.bs, b0: 0, spin: !!p.spin, grass: !!p.grass, hand: v > 14 ? B.hand : 0, bMax: 0, t0: car.time, sg: seg.sg };
        this.lastK = k + lap * 10000;
        this.wob = null;
      }
    }
    // Einfangen nach dem Drift bzw. ungewolltes Rutschen: Soll-Winkel 0 (Lenkung bleibt beim normalen Autopiloten)
    if (!S && !blocked && car.onGround >= 3 && v > 6 && !this.wob && (this.settle || Math.abs(this.beta) > B.slip * RAD)) {
      const T = this.settle || (this.settle = { t: 0, calm: 0 });
      T.t += dt; T.calm = Math.abs(this.beta) < B.calm * RAD ? T.calm + dt : 0;
      if (T.calm >= B.calmT || T.t > B.settleMax) this.settle = null;
      else { res.drift = 0; return res; }
    } else if (blocked || car.onGround < 3) this.settle = null;
    if (!S) {
      if (this.wob) {
        const W = this.wob; W.t += dt;
        if (W.t >= B.wobbleT || blocked || (car.onGround === 0 && W.t > 0.1)) this.wob = null;
        else { res.drift = W.sg * B.wobble * RAD * Math.sin(W.t / B.wobbleT * 2 * Math.PI) * (1 - W.t / B.wobbleT); res.lock = B.lock; }
      }
      return res;
    }
    const seg = this.segs[S.k];
    S.t += dt;
    S.bMax = Math.max(S.bMax, Math.abs(this.beta));
    if (car.grass > 0) S.grassHit = true;
    // Fahrbahnrand: Lage der Wagenmitte zur Ideallinie (+ = rechts) jetzt und vorausgesagt
    const ci = idx;
    const e = (car.pos.x - I.px[ci]) * I.bx[ci] + (car.pos.y - I.py[ci]) * I.by[ci] + (car.pos.z - I.pz[ci]) * I.bz[ci];
    const vb = car.v.x * I.bx[ci] + car.v.y * I.by[ci] + car.v.z * I.bz[ci];
    const eP = e + vb * B.edgeLook;
    const lo = I.lo[ci] + B.edge, hi = I.hi[ci] - B.edge;
    const nearEdge = (eP < lo && vb < 0) || (eP > hi && vb > 0);
    // Phasen
    const inSeg = this.segAt[idx] === S.k;
    const dEnd = inSeg ? I.s[seg.i1] - I.s[idx] : -1;
    if (S.ph !== 'out') {
      const abort = blocked || car.onGround < 2 || v < 7 || nearEdge || !inSeg;
      const toOut = dEnd < Math.max(3, v * B.tOut * 0.8);
      if (abort || toOut) {
        S.ph = 'out'; S.t = 0; S.b0 = this.bAim ?? S.bs; S.fast = abort;
        if (S.grass && !abort) this.exc = { t: 0, sg: S.sg };   // Ausritt am Kurvenausgang
      }
      else if (S.ph === 'in' && S.t >= B.tIn) { S.ph = 'hold'; S.t = 0; }
    }
    // Soll-Winkel (Betrag), Vorzeichen: Linkskurve (sg < 0) → Heck nach rechts (+)
    let bAim;
    if (S.ph === 'in') bAim = S.bs * sm(S.t / B.tIn);
    else if (S.ph === 'hold') {
      bAim = S.bs;
      // Beinahe-Dreher: nach 0,15 s halten auf spin Grad hoch und wieder zurück (nur mit genug Kurve übrig)
      if (S.spin && S.t > 0.15 && (S.spinOn || (v < B.vSpin && dEnd > v * (B.spinT + B.tOut + 0.2)))) {
        S.spinOn = true;
        const u = (S.t - 0.15) / B.spinT;
        if (u < 1) bAim = S.bs + (B.spin * RAD - S.bs) * Math.sin(Math.PI * u) ** 0.7;
      }
    } else bAim = S.b0 * (1 - sm(S.t / (S.fast ? B.tOut * 0.6 : B.tOut)));
    this.bAim = bAim;
    if (S.ph === 'out' && (S.t >= B.tOut * (S.fast ? 0.6 : 1)) && (Math.abs(this.beta) < 5 * RAD || S.t > 1.5)) {
      this.log.push({ k: S.k, t0: S.t0, t1: car.time, bMax: S.bMax, spin: !!S.spinOn, grass: !!S.grassHit, sg: S.sg });
      if (this.exc) this.exc.log = this.log[this.log.length - 1];
      this.endT = car.time;   // Kurvenausgang (race.js: Nitro)
      if (this.log.length > 400) this.log.shift();
      this.st = null;
      this.settle = { t: 0, calm: 0 };
      // neben der Linie: Ziel des Autopiloten dorthin, wo das Auto ist – race.js freeSteer führt es weich zurück
      if (Math.abs(ap.lat) > 0.6 && !this.exc) ap.shift = ap.lat;
      return res;
    }
    const sgn = -S.sg;
    res.drift = sgn * bAim;
    res.lock = B.lock; res.rearGrip = B.rearGrip; res.driveFront = B.driveFront;
    // Lenkung: Vorderräder relativ zur Fahrtrichtung der Vorderachse (Gegenlenken), plus Bahnregler auf den Kurs der
    // Geschwindigkeit (nicht der Fahrzeug-Längsachse) und halbe Kurven-Vorsteuerung
    const L = I, ja = ap.ahead(idx, Math.max(1.2, v * 0.12));
    const ex = (car.pos.x - L.px[ja]) * L.bx[ja] + (car.pos.y - L.py[ja]) * L.by[ja] + (car.pos.z - L.pz[ja]) * L.bz[ja] - ap.extra;
    const nv = car.v.x * L.nx[ja] + car.v.y * L.ny[ja] + car.v.z * L.nz[ja];
    const px = car.v.x - nv * L.nx[ja], py = car.v.y - nv * L.ny[ja], pz = car.v.z - nv * L.nz[ja];
    const chi = Math.atan2(px * L.bx[ja] + py * L.by[ja] + pz * L.bz[ja], px * L.tx[ja] + py * L.ty[ja] + pz * L.tz[ja]);
    const jf = ap.ahead(idx, 1.2 + v * 0.06);
    const ff = Math.atan(2.72 * (this.P.kA ? this.P.kA[jf] : 0));
    const thf = Math.atan2(vr - 1.36 * yaw, Math.max(1, vf));
    const dDrift = thf - chi - Math.atan2(B.kE * ex, v + 3) + 0.5 * ff;
    const ms = maxSteerAt(car.def, vf), lockMax = Math.max(ms, B.lock);
    // Überblenden am Anfang/Ende (die normale Lenkung ist auf ms normiert, mit Drift-Einschlag gilt lockMax)
    const w = S.ph === 'in' ? sm(S.t / 0.12) : S.ph === 'out' ? 1 - sm((S.t - B.tOut * 0.5) / (B.tOut * 0.6)) : 1;
    const dNorm = o.steer * ms;
    o.steer = Math.max(-1, Math.min(1, (w * dDrift + (1 - w) * dNorm) / lockMax));
    // Einlenken: kurz Handbremse, Gas weg (Lastwechsel)
    if (S.ph === 'in' && S.t < S.hand) { o.hand = 1; o.throttle = 0; o.brake = 0; }
    else if (S.ph !== 'out' && o.brake === 0) o.throttle = Math.max(o.throttle, 0.25);   // Gas halten
    else if (S.ph === 'out') o.throttle = Math.min(o.throttle, B.thrOut + (1 - B.thrOut) * (1 - Math.min(1, Math.abs(this.beta) / Math.max(0.1, S.bs))));
    return res;
  }
}
