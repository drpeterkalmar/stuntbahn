// Analoge Instrumente – reine Logik ohne three.js (läuft in Node, getestet in tests/node/test_cockpit.mjs):
// Skalen (Tacho, Drehzahlmesser), Zeiger-Dynamik (Feder mit Nachschwingen), Ganganzeige als
// Schaltkulisse (Knauf fährt über die Neutralgasse), Gang fürs Replay aus dem aufgezeichneten Tempo.
import { CAR_DEF } from '../physics/car.js';

// Vmax des Autos: 586 km/h (Ebene, Vollgas, gemessen mit der Physik, tools/tempo_measure.mjs) → Skala
// aufgerundet bis 600, Zahlen alle 100, Striche alle 20 km/h. Bis 27.09.2026: Vmax 286 → 0 … 300 (50/10).
export const SPEEDO = { max: 600, major: 100, minor: 20, sweep: 260 * Math.PI / 180 };
// Drehzahl: Begrenzer 7600 (CAR_DEF.redline) → Skala 0 … 8 ×1000 U/min, roter Bereich ab 7000.
export const TACHO = { max: Math.ceil(CAR_DEF.redline / 1000), red: 7, sweep: 260 * Math.PI / 180 };

// Wert → Zeigerwinkel (Bogenmaß, 0 = senkrecht nach oben, positiv = im Uhrzeigersinn).
// Die Skala läuft symmetrisch von −sweep/2 (links unten) bis +sweep/2 (rechts unten).
export function valueAngle(v, max, sweep) {
  const k = Math.max(-0.015, Math.min(1.02, v / max)); // Anschlagstift knapp unter 0 / über max
  return -sweep / 2 + k * sweep;
}
export const speedAngle = (kmh) => valueAngle(kmh, SPEEDO.max, SPEEDO.sweep);
export const rpmAngle = (rpm) => valueAngle(rpm / 1000, TACHO.max, TACHO.sweep);

// Zeiger mit Trägheit: Feder-Dämpfer 2. Ordnung. zeta < 1 → leichtes Nachschwingen (Drehzahlmesser).
// Integration in kleinen Teilschritten → stabil auch bei ruckelnden Bildraten.
export class Needle {
  constructor(omega = 18, zeta = 0.5) { this.omega = omega; this.zeta = zeta; this.a = null; this.v = 0; }
  update(dt, target) {
    if (this.a === null || !(dt > 0)) { this.a = target; this.v = 0; return this.a; }
    const n = Math.min(8, Math.ceil(dt / 0.004)), h = Math.min(dt, 0.1) / n, w = this.omega, z = this.zeta;
    for (let i = 0; i < n; i++) {
      const acc = w * w * (target - this.a) - 2 * z * w * this.v;
      this.v += acc * h; this.a += this.v * h;
    }
    return this.a;
  }
  snap(target) { this.a = target; this.v = 0; }
}

// Schaltkulisse (Draufsicht, Einheiten −1 … 1): Spalten R | 1-2 | 3-4 | 5-6, oben/unten, Mitte = Neutralgasse.
//   R 1 3 5
//   ├─┼─┼─┤
//     2 4 6
export const GATE_COLS = { R: -1, 1: -1 / 3, 2: -1 / 3, 3: 1 / 3, 4: 1 / 3, 5: 1, 6: 1, N: 0 };
export function gateSlot(g) {
  if (g === 'N') return { x: 0, y: 0 };
  if (g === 'R') return { x: -1, y: 1 };
  const n = +g;
  return { x: GATE_COLS[n], y: n % 2 ? 1 : -1 };
}
// Knauf: fährt erst in die Neutralgasse, dann quer, dann in die Zielgasse (wie eine echte Kulisse).
export class GateKnob {
  constructor(speed = 9) { this.x = 0; this.y = 0; this.speed = speed; this.init = false; }
  update(dt, gear) {
    const t = gateSlot(gear);
    if (!this.init) { this.x = t.x; this.y = t.y; this.init = true; return this; }
    let step = this.speed * Math.max(0, Math.min(dt, 0.1));
    const move = (cur, to) => { const d = to - cur, s = Math.min(Math.abs(d), step); step -= s; return cur + Math.sign(d) * s; };
    for (let guard = 0; guard < 3 && step > 1e-6; guard++) {
      if (Math.abs(this.x - t.x) > 1e-4) {
        if (Math.abs(this.y) > 1e-4) this.y = move(this.y, 0);   // zuerst zurück in die Gasse
        else this.x = move(this.x, t.x);                         // dann quer
      } else if (Math.abs(this.y - t.y) > 1e-4) this.y = move(this.y, t.y);
      else break;
    }
    return this;
  }
}

// Anzeige-Gang: R bei Rückwärtsfahrt (wie das bisherige Digital-HUD), sonst der Gang der Physik.
export function displayGear(fwdSpeed, gear) { return fwdSpeed < -0.5 ? 'R' : gear; }

// Gang für das Replay: gleiche Schaltlogik wie car.js (Hochschalten bei 97 % der Gangspitze,
// Runterschalten unter 62 % des vorigen Gangs) auf dem aufgezeichneten Tempo nachgerechnet.
export function gearTrack(speeds, gears = CAR_DEF.gears) {
  const out = new Uint8Array(speeds.length);
  let g = 1;
  for (let i = 0; i < speeds.length; i++) {
    const av = Math.abs(speeds[i]);
    if (g < gears.length - 1 && av > gears[g] * 0.97) g++;
    if (g > 1 && av < gears[g - 1] * 0.62) g--;
    out[i] = g;
  }
  return out;
}
