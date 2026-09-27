// Autopilot: Pure Pursuit auf der Ideallinie + Tempo-Regler auf das Profil.
// Wird für Lösbarkeitsprüfung (Generator), Fahrhilfen (Mischung Spieler/Autopilot) und Demo genutzt.
import { GRIP } from '../track/defs.js';

export class Tracker {
  // Fortschritt entlang der Linie (nächster Linienpunkt, lokal gesucht → kein Springen bei Kreuzungen)
  constructor(L) { this.L = L; this.idx = 0; this.lap = 0; this.dist = 0; }
  reset(i) { this.idx = i; }
  update(px, py, pz, global = false) {
    const L = this.L, n = L.n;
    let best = this.idx, bd = 1e18, bdist = 1e18;
    const s0 = L.s[this.idx], half = L.total / 2;
    const scan = (i) => {
      const dx = L.px[i] - px, dy = L.py[i] - py, dz = L.pz[i] - pz;
      const d = dx * dx + dy * dy * 1.5 + dz * dz;
      // Sprünge entlang der Linie kosten etwas: an Kreuzungen liegt der andere Durchgang sonst manchmal
      // näher (seit die Ideallinie dort nicht mehr in der Mitte fährt)
      let ds = Math.abs(L.s[i] - s0);
      if (L.closed && ds > half) ds = L.total - ds;
      const q = global ? d : d + (ds * 0.1) * (ds * 0.1);
      if (q < bd) { bd = q; best = i; bdist = d; }
    };
    if (global) for (let i = 0; i < n; i++) scan(i);
    else for (let k = -25; k <= 70; k++) {
      let i = this.idx + k;
      if (L.closed) i = ((i % n) + n) % n; else if (i < 0 || i >= n) continue;
      scan(i);
    }
    // Rundenzähler bei Überlauf
    if (L.closed && this.idx > n * 0.8 && best < n * 0.2) this.lap++;
    if (L.closed && this.idx < n * 0.2 && best > n * 0.8) this.lap--;
    this.idx = best;
    this.dist = Math.sqrt(bdist);
    return best;
  }
  // Gesamtfortschritt in Metern (inkl. Runden)
  progress() { return this.lap * this.L.total + this.L.s[this.idx]; }
}

export class Autopilot {
  constructor(L, prof) {
    this.L = L; this.P = prof;
    this.tr = new Tracker(L);
    this.out = { steer: 0, throttle: 0, brake: 0 };
    this.offset = null; // optionale seitliche Versätze (Racing-Line), Float32Array
    this.shift = 0;     // zusätzlicher Seitenversatz des Ziels (m): sanftes Zurückführen nach freiem Lenken
    this.lat = 0;       // Seitenlage der Vorderachse zur (unverschobenen) Linie, m
    this.speedScale = 1;
    this.lastTarget = [0, 0, 0];
  }
  ahead(i, meters) {
    const L = this.L, n = L.n;
    let j = i, acc = 0;
    for (let k = 0; k < 400 && acc < meters; k++) {
      let nj = j + 1, ds;
      if (nj >= n) { if (!L.closed) break; nj = 1; ds = L.s[1]; } else ds = L.s[nj] - L.s[j];
      acc += ds; j = nj;
    }
    return j;
  }
  control(car) {
    const L = this.L, F = car.frame, o = this.out;
    const i = this.tr.update(car.pos.x, car.pos.y, car.pos.z);
    const v = car.fwdSpeed();
    // Stanley-Regler im Rahmen der Fahrlinie (funktioniert auch kopfüber im Looping):
    // Lenkwinkel = −Kursfehler − atan(k·Querfehler/v) + Vorsteuerung aus der Linienkrümmung
    const ja = this.ahead(i, Math.max(1.2, Math.abs(v) * 0.12));
    const off = (this.offset ? this.offset[ja] : 0) + this.shift;
    let px = L.px[ja] + L.bx[ja] * off, py = L.py[ja] + L.by[ja] * off, pz = L.pz[ja] + L.bz[ja] * off;
    this.lastTarget[0] = px; this.lastTarget[1] = py; this.lastTarget[2] = pz;
    // Querfehler am Vorderachs-Bezugspunkt
    const fa = 1.3;
    const cx = car.pos.x + F.f.x * fa, cy = car.pos.y + F.f.y * fa, cz = car.pos.z + F.f.z * fa;
    const e = (cx - px) * L.bx[ja] + (cy - py) * L.by[ja] + (cz - pz) * L.bz[ja];
    // Kursfehler: Fahrzeug-Vorwärts in die Linienebene projiziert
    const fn = F.f.x * L.nx[ja] + F.f.y * L.ny[ja] + F.f.z * L.nz[ja];
    const fpx = F.f.x - fn * L.nx[ja], fpy = F.f.y - fn * L.ny[ja], fpz = F.f.z - fn * L.nz[ja];
    const psi = Math.atan2(fpx * L.bx[ja] + fpy * L.by[ja] + fpz * L.bz[ja], fpx * L.tx[ja] + fpy * L.ty[ja] + fpz * L.tz[ja]);
    const jf = this.ahead(i, 1.2 + Math.abs(v) * 0.06);
    const ff = Math.atan(2.72 * (this.P.kA ? this.P.kA[jf] : 0));
    this.psi = psi; this.cross = e; this.lat = e + this.shift;
    let delta = -psi - Math.atan2(2.4 * e, Math.abs(v) + 3) + ff;
    // Gierraten-Dämpfung (verhindert Pendeln bei hohem Tempo)
    const yaw = car.w.x * F.u.x + car.w.y * F.u.y + car.w.z * F.u.z;
    const yawWant = -v * (this.P.kA ? this.P.kA[jf] : 0);
    delta += 0.06 * (yaw - yawWant);
    const maxSteer = car.def.steerMax / (1 + Math.abs(v) / 15) + 0.035;
    o.steer = Math.max(-1, Math.min(1, delta / maxSteer));
    if (L.air[i] || car.onGround === 0) o.steer = 0;
    // Tempo: Ziel = Minimum des Profils über die nächsten ~0.35 s
    const jv = this.ahead(i, Math.max(3, Math.abs(v) * 0.35));
    let vt = this.P.vt[i];
    for (let q = i, c = 0; c < 60; c++) { vt = Math.min(vt, this.P.vt[q]); if (q === jv) break; q = q + 1 >= L.n ? (L.closed ? 1 : L.n - 1) : q + 1; }
    vt *= this.speedScale;
    const ev = vt - v;
    if (ev > -0.4) { o.throttle = Math.max(0, Math.min(1, 0.35 + ev * 0.45)); o.brake = 0; }
    else { o.throttle = 0; o.brake = Math.max(0, Math.min(1, -ev * 0.3)); }
    if (v < 3 && vt > 5) { o.throttle = 1; o.brake = 0; }
    // Traktionskontrolle auf rutschigem Belag (Eis/Schotter): Gas nur, soweit Seitenhaftung übrig bleibt
    let gs = 0, gn = 0;
    for (const w of car.wheels) if (w.contact) { gs += GRIP[w.mat] ?? 1; gn++; }
    const grip = gn ? gs / gn : 1.25;
    if (grip < 1.05) {
      const k = (1.05 - grip) / 0.55;               // 0 (Schotter) … 1 (Eis)
      o.throttle = Math.min(o.throttle, Math.max(0.2, 1 - (0.6 + 0.8 * k) * Math.abs(o.steer)));
    }
    return o;
  }
}
