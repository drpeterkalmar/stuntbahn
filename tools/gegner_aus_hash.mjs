// n34 „Gegner Aus“ bitgleich: Hash der Renn-Aufzeichnung (race.rec) und der Endzeit für 2 Strecken × 3 Fahrhilfen, je einmal
// reiner Autopilot und einmal ein gescripteter Spieler (Lenken/Gas/Bremse nach festem Muster, Leicht/Mittel mit Hilfen).
// Ohne Gegner darf sich daran nichts ändern (Autopilot.avoid = 0, kein GegnerFeld). Referenz aus der Basis (n33-Vorbau
// 169a0f3) in tests/node/data/gegner_aus_ref.json; neu erzeugen: im Stand der Basis
//   node tools/gegner_aus_hash.mjs > tests/node/data/gegner_aus_ref.json
// (Hashes können zwischen Rechnern abweichen, wenn Math-Funktionen anders runden – dann auf dem Prüfrechner neu erzeugen.)
import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { generate } = await imp('src/track/generator.js');
const { prepare } = await imp('src/track/verify.js');
const { Race } = await imp('src/game/race.js');

export function fnv(buf, h = 0x811c9dc5) {
  const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
export function hashes() {
  const out = {};
  for (const [s, d] of [[11, 2], [4711, 3]]) {
    const env = prepare(generate(s, d));
    for (const assist of ['easy', 'medium', 'original']) for (const auto of [true, false]) {
      const race = new Race(env, { assist, autopilot: auto, countdown: 0.5, fahrstil: 'sauber', seed: 5 });
      let t = 0;
      while (t < 40 && race.state !== 'finished') {
        // gescripteter Spieler: Gas, kurze Bremsstöße, langsames Lenk-Pendeln
        const inp = auto ? { steer: 0, throttle: 0, brake: 0 } : { steer: 0.35 * Math.sin(t * 0.9), throttle: (t % 6) < 5 ? 1 : 0, brake: (t % 6) >= 5.4 ? 1 : 0 };
        race.step(1 / 120, inp); t += 1 / 120;
      }
      const rec = Float32Array.from(race.rec);
      out[`S${s}/${d} ${assist} ${auto ? 'auto' : 'spieler'}`] = `${fnv(rec).toString(16)} ${race.time.toFixed(6)} ${race.crashes}`;
    }
  }
  return out;
}
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(hashes(), null, 1));
