// Cockpit-Instrumente (src/gfx/gauges.js): Skalen/Winkel, Vmax passt auf den Tacho, Zeiger-Dynamik
// (Drehzahl schwingt leicht nach, Tacho nicht), Schaltkulisse fährt über die Neutralgasse,
// Replay-Gang aus dem Tempo = Gang der Physik.
import { Car, CAR_DEF } from '../../src/physics/car.js';
import { SPEEDO, TACHO, speedAngle, rpmAngle, Needle, GateKnob, gateSlot, gearTrack, displayGear } from '../../src/gfx/gauges.js';

let fails = 0;
const ok = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) fails++; };
const deg = (r) => r * 180 / Math.PI;

// 1) Skalen
ok(Math.abs(deg(speedAngle(0)) + 130) < 1e-6 && Math.abs(deg(speedAngle(300)) - 130) < 1e-6, 'Tacho 0 … 300 km/h über 260°');
ok(Math.abs(deg(speedAngle(150))) < 1e-6, '150 km/h = senkrecht');
ok(TACHO.max === 8 && TACHO.red === 7 && CAR_DEF.redline <= TACHO.max * 1000, `Drehzahl 0 … ${TACHO.max}×1000, Begrenzer ${CAR_DEF.redline} auf der Skala, rot ab ${TACHO.red}000`);
ok(deg(speedAngle(400)) < 136 && deg(speedAngle(-20)) > -135, 'Anschlagstifte begrenzen den Zeiger');

// 2) Vmax (Ebene, Vollgas) ≤ Skalenende, aber nicht viel darunter (Skala = Vmax aufgerundet)
const flat = { ray(x, y, z, dx, dy, dz, L) { if (dy >= -1e-6) return null; const t = -y / dy; if (t < 0 || t > L) return null; return { t, x: x + dx * t, y: 0, z: z + dz * t, nx: 0, ny: 1, nz: 0, mat: 0 }; }, rayTrack() { return null; }, contacts() { return []; } };
const car = new Car(); car.pos.y = 0.6; car.input.throttle = 1;
const sp = [], gears = [];
let vmax = 0;
for (let i = 0; i < 120 * 70; i++) {
  // Fahrprogramm: Vollgas, dann Bremsen, wieder Gas (Hoch- und Runterschalten)
  const t = i / 120;
  car.input.throttle = t < 40 || t > 50 ? 1 : 0; car.input.brake = t >= 40 && t <= 50 ? 0.6 : 0;
  car.step(1 / 120, flat);
  if (car.pos.z < -800) car.pos.z += 1600;
  vmax = Math.max(vmax, car.fwdSpeed() * 3.6);
  if (i % 2 === 0) { sp.push(car.fwdSpeed()); gears.push(car.gear); }   // 60 Hz wie die Aufzeichnung
}
ok(vmax <= SPEEDO.max && vmax > SPEEDO.max - 50, `Vmax ${vmax.toFixed(0)} km/h ≤ Skala ${SPEEDO.max} (aufgerundet)`);

// 3) Replay-Gang aus dem Tempo
const gt = gearTrack(Float32Array.from(sp));
let same = 0; for (let i = 0; i < gt.length; i++) if (gt[i] === gears[i]) same++;
const shifts = gears.filter((g, i) => i && g !== gears[i - 1]).length;
ok(same / gt.length > 0.99 && shifts >= 8, `Replay-Gang = Physik-Gang in ${(100 * same / gt.length).toFixed(1)} % der Bilder (${shifts} Schaltvorgänge)`);
ok(displayGear(-3, 1) === 'R' && displayGear(3, 2) === 2, 'Rückwärtsfahrt zeigt R');

// 4) Zeiger-Dynamik: Sprung 0 → Ziel
const step = (n, target, T = 1.5) => { n.update(0.016, 0); let peak = 0; for (let t = 0; t < T; t += 0.016) peak = Math.max(peak, n.update(0.016, target)); return { peak, end: n.a }; };
const rt = step(new Needle(26, 0.42), 1), rs = step(new Needle(15, 0.85), 1);
ok(rt.peak > 1.05 && rt.peak < 1.35 && Math.abs(rt.end - 1) < 0.01, `Drehzahlzeiger schwingt nach (Spitze ${rt.peak.toFixed(2)}) und kommt zur Ruhe`);
ok(rs.peak < 1.02 && Math.abs(rs.end - 1) < 0.01, `Tachozeiger ohne sichtbares Überschwingen (${rs.peak.toFixed(3)})`);
const jit = new Needle(26, 0.42); jit.update(0.016, 0); let bad = false;
for (let i = 0; i < 200; i++) { const a = jit.update(i % 7 ? 0.004 : 0.09, 0.5); if (!Number.isFinite(a) || Math.abs(a) > 2) bad = true; }
ok(!bad && Math.abs(jit.a - 0.5) < 0.02, 'stabil bei ruckelnder Bildrate');

// 5) Schaltkulisse: 2 → 3 fährt über die Neutralgasse (nie diagonal durch das Blech)
const k = new GateKnob(11); k.update(0.016, 2);
// nach jedem Bild muss der Knauf in einer Gasse liegen: Neutralgasse (y = 0) oder eine der Spalten
const onGate = () => Math.abs(k.y) < 1e-6 || [-1, -1 / 3, 1 / 3, 1].some((c) => Math.abs(k.x - c) < 1e-6);
let viaNeutral = false, off = false;
for (let t = 0; t < 1; t += 0.016) {
  k.update(0.016, 3);
  if (Math.abs(k.y) < 1e-6) viaNeutral = true;
  if (!onGate()) off = true;
}
const s3 = gateSlot(3);
ok(viaNeutral && !off && Math.abs(k.x - s3.x) < 1e-6 && Math.abs(k.y - s3.y) < 1e-6, 'Knauf 2 → 3 über die Neutralgasse, immer in einer Gasse, Ziel erreicht');
for (let i = 0; i < 60; i++) { k.update(0.016, 'R'); if (!onGate()) off = true; }
ok(!off && Math.abs(k.x + 1) < 1e-6 && Math.abs(k.y - 1) < 1e-6, 'R links oben');

console.log(fails ? `${fails} Fehler` : 'Cockpit-Instrumente: alle Prüfungen grün');
process.exit(fails ? 1 : 0);
