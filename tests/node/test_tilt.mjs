// Neigen-Lenkung (src/game/input.js tiltSteerDeg): richtige Achse je Bildschirm-Ausrichtung (hochkant 0°/180°,
// quer 90°/270° bzw. −90°), quer identisch zur bisherigen Formel (beta · Vorzeichen), Nicken lenkt nie,
// flach und aufrecht gehalten, keine Sprünge/NaN.
import { tiltSteerDeg } from '../../src/game/input.js';

let fails = 0;
const ok = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) fails++; };
const near = (a, b, e = 0.5) => Math.abs(a - b) < e;

// Hochkant (0°): Kippen um die Längsachse (gamma) lenkt, Nicken (beta) nicht
ok(near(tiltSteerDeg(0, 20, 0), 20), 'hoch, flach: gamma +20° → rechts 20°');
ok(near(tiltSteerDeg(0, -20, 0), -20), 'hoch, flach: gamma −20° → links 20°');
ok(near(tiltSteerDeg(40, 0, 0), 0) && near(tiltSteerDeg(80, 0, 0), 0), 'hoch: Nicken (beta) lenkt nicht');
ok(tiltSteerDeg(45, 20, 0) > 12 && tiltSteerDeg(45, 20, 0) < 20, `hoch, 45° geneigt: gamma +20° → rechts (${tiltSteerDeg(45, 20, 0).toFixed(1)}°)`);
// Aufrecht wie ein Lenkrad um 20° im Uhrzeigersinn gedreht: Oben-Vektor im Gerät (−sin20°, cos20°, 0);
// als Euler-Winkel (Oben = (−sinγ cosβ, sinβ, cosγ cosβ)) ist das beta = 70°, gamma = 90°
{ const b = Math.asin(Math.cos(20 * Math.PI / 180)) * 180 / Math.PI;
  ok(near(tiltSteerDeg(b, 90, 0), 20, 0.6), `hoch, aufrecht wie Lenkrad 20° rechts gedreht (${tiltSteerDeg(b, 90, 0).toFixed(1)}°)`); }
// Kopfüber (180°): Vorzeichen dreht sich
ok(near(tiltSteerDeg(0, 20, 180), -20), 'kopfüber: gamma +20° → links');
// Quer (90° und 270°/−90°): wie bisher beta · Vorzeichen des Winkels
for (const beta of [-30, -10, 0, 5, 15, 30]) {
  ok(near(tiltSteerDeg(beta, 0, 90), beta, 0.01) && near(tiltSteerDeg(beta, 0, -90), -beta, 0.01) && near(tiltSteerDeg(beta, 0, 270), -beta, 0.01), `quer: beta ${beta}° → ${beta}° (90) / ${-beta}° (270, −90)`);
}
ok(near(tiltSteerDeg(10, 40, 90), 10, 0.01), 'quer: Neigung zum Körper (gamma) ändert die Lenkung nicht');
// Keine NaN, begrenzt, stetig über den ganzen Bereich
let bad = 0, jump = 0;
for (const ang of [0, 90, 180, 270]) for (let b = -180; b <= 180; b += 5) for (let g = -90; g <= 90; g += 5) {
  const v = tiltSteerDeg(b, g, ang), v2 = tiltSteerDeg(b, g + 1, ang);
  if (!Number.isFinite(v) || Math.abs(v) > 90.0001) bad++;
  if (Math.abs(v2 - v) > 3) jump++;
}
ok(bad === 0, 'immer endlich und |Winkel| ≤ 90°');
ok(jump === 0, `stetig (1° gamma ändert höchstens 3°) – ${jump} Sprünge`);
console.log(fails ? `${fails} Fehler` : 'Neigen: alle Achsen ok');
process.exit(fails ? 1 : 0);
