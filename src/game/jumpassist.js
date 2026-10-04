// Sprung-Hilfe Mittel (n24, Peter 03.10.2026: „Sprünge gehen zu weit“): Im Flug über eine Standard-Schanze (n21, nicht
// Import-Lücken) sagt eine kleine Vorausrechnung den Aufsetzpunkt voraus – mit derselben Luft-Physik wie das Auto
// (Flug-Schwerkraft AIR.factor, Luftwiderstand). Landet das Auto hinter dem Ende der Landerampe, wirkt dezent etwas mehr
// Schwerkraft (höchstens bis zur echten, gUp) und ein leichter Luftwiderstand (aH); landet es vor der Rampe bzw. auf ihrer
// Vorderkante (lo m: die ganze Wagenlänge soll auf der Rampe aufsetzen, sonst schlägt die Front an der Kante an), etwas
// weniger Schwerkraft (gDown) und ein kleiner Schub (aH). Stärke k (0 … 1) so klein wie möglich: gerade so, dass das Auto
// am Rand des Fensters aufsetzt (lo m hinter der Vorderkante bzw. hiMargin m vor dem Ende) – kein „Schienen“-Gefühl,
// wer viel zu schnell ist, fliegt weiter hinaus. Rein rechnerisch (kein three.js), deterministisch.
import { G, AIR } from '../physics/air.js';
import { CAR_DEF } from '../physics/car.js';

export const JUMP_PULL = { lo: 10, hiMargin: 4, aH: 3.0, gUp: 3.0, gDown: 2.5, rate: 4, dtP: 1 / 40, tMax: 6 };
const DRAG = CAR_DEF.dragK / CAR_DEF.mass;

// Boden hinter der Lücke (Landerampe und Strecke danach) als Höhe über der Achse Lippe → Landung (x ab Lippe, waagrecht)
export function jumpFloor(track, j) {
  if (j._floor) return j._floor;
  const L = track.line, li = j.lipIdx, la = j.landIdx;
  let ax = L.px[la] - L.px[li], az = L.pz[la] - L.pz[li];
  const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
  const xs = [], ys = [];
  for (let i = la, c = 0; c < 400; c++) {
    const x = (L.px[i] - L.px[li]) * ax + (L.pz[i] - L.pz[li]) * az;
    if (xs.length && x <= xs[xs.length - 1]) { /* Kurve dahinter: Abstand wächst nicht mehr */ }
    else { xs.push(x); ys.push(L.py[i]); }
    if (x > al + (j.landLen || 45) + 120) break;
    i++; if (i >= L.n) { if (!L.closed) break; i = 1; }
  }
  j._floor = { lx: L.px[li], lz: L.pz[li], ax, az, al, xs: Float32Array.from(xs), ys: Float32Array.from(ys), len: j.landLen || 45 };
  return j._floor;
}
function floorAt(F, x) {
  const xs = F.xs;
  if (x < xs[0]) return -1e9;   // über der Lücke: kein Aufsetzen (Hindernisse liegen unter der tiefsten Flugbahn)
  let a = 0, b = xs.length - 1;
  if (x >= xs[b]) return F.ys[b];
  while (b - a > 1) { const m = (a + b) >> 1; if (xs[m] <= x) a = m; else b = m; }
  const t = (x - xs[a]) / Math.max(1e-6, xs[b] - xs[a]);
  return F.ys[a] + (F.ys[b] - F.ys[a]) * t;
}

// Aufsetzpunkt (m hinter der Vorderkante der Landerampe) bei konstanter Hilfe: aH (m/s², + = Schub) längs der waagrechten
// Bewegung, gAdd (m/s², + = mehr Schwerkraft). h0 = Höhe der Wagenmitte über der Fahrbahn im Stand.
export function predictLanding(F, p, v, h0, aH = 0, gAdd = 0, o = JUMP_PULL) {
  let x = (p.x - F.lx) * F.ax + (p.z - F.lz) * F.az, y = p.y;
  let vh = v.x * F.ax + v.z * F.az, vy = v.y;
  const g = G * AIR.factor + gAdd, h = o.dtP;
  for (let t = 0; t < o.tMax; t += h) {
    const sp = Math.hypot(vh, vy);
    vh += (aH - DRAG * sp * vh) * h; vy += (-g - DRAG * sp * vy) * h;
    x += vh * h; y += vy * h;
    if (vy < 0 && y - h0 <= floorAt(F, x)) return { fl: x - F.al, t };
  }
  return { fl: 1e9, t: o.tMax };
}

export class JumpAssist {
  constructor(o = JUMP_PULL) { this.o = o; this.k = 0; this.h0 = 0.6; this.j = null; this.out = null; }
  reset() { this.k = 0; this.j = null; this.out = null; }
  // nach car.step: Auto in der Luft über Schanze j (Linienindex ti) → Geschwindigkeit dezent anpassen
  step(dt, car, track, ti) {
    const o = this.o, L = track.line;
    if (car.onGround > 0) {
      // Ruhelage der Wagenmitte über der Fahrbahn (für die Vorausrechnung), nur auf normaler Fahrbahn
      if (car.onGround === 4 && !L.air[ti]) this.h0 += (Math.max(0.3, Math.min(1, car.pos.y - L.py[ti])) - this.h0) * 0.05;
      this.k = 0; this.j = null; this.out = null;
      return 0;
    }
    if (car.crash || car.surfaceKind) return 0;
    if (!this.j) this.j = track.jumps.find((j) => !j.gen && j.landLen && ti >= j.lipIdx - 2 && ti <= (j.endIdx ?? j.landIdx + 40)) || null;
    const j = this.j;
    if (!j) return 0;
    const F = jumpFloor(track, j), hi = F.len - o.hiMargin;
    const p0 = predictLanding(F, car.pos, car.v, this.h0);
    let want = 0, sgn = 0;
    if (p0.t > 0.12 && (p0.fl > hi || p0.fl < o.lo)) {
      sgn = p0.fl > hi ? -1 : 1;
      const edge = sgn < 0 ? hi : o.lo;
      const at = (k) => predictLanding(F, car.pos, car.v, this.h0, sgn * k * o.aH, sgn < 0 ? k * o.gUp : -k * o.gDown).fl;
      if (sgn < 0 ? at(1) >= edge : at(1) <= edge) want = 1;
      else { let a = 0, b = 1; for (let it = 0; it < 7; it++) { const m = (a + b) / 2; if (sgn < 0 ? at(m) > edge : at(m) < edge) a = m; else b = m; } want = b; }
    }
    // weich: Stärke ändert sich höchstens rate je s
    this.k += Math.max(-o.rate * dt, Math.min(o.rate * dt, want * (sgn || Math.sign(this.k) || 1) - this.k));
    const k = this.k;
    if (Math.abs(k) < 1e-4) { this.out = { fl: p0.fl, k: 0 }; return 0; }
    const s = Math.sign(k), m = Math.abs(k);
    const aH = s * m * o.aH, gAdd = s < 0 ? m * o.gUp : -m * o.gDown;
    const vh = Math.hypot(car.v.x, car.v.z) || 1;
    car.v.x += car.v.x / vh * aH * dt; car.v.z += car.v.z / vh * aH * dt;
    car.v.y -= gAdd * dt;
    this.out = { fl: p0.fl, k };
    return k;
  }
}
