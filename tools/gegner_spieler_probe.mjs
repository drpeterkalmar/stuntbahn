// n34: Spieler-Rennen mit Gegnern in Node (Rasterstart, Leicht „Hände weg“ mit Ausweichen/Abstand wie main.js gegnerSchritt, Mittel
// = Autopilot-Lenkung mit dessen Pedalen – ein „blinder“ Spieler, der Gegner nicht beachtet). Prüft: Ziel, falsche Abkürzungs-/
// Reset-Ereignisse vom Rasterstart, Platz, Kontakt-Schritte. Aufruf: node tools/gegner_spieler_probe.mjs (~90 s)
import path from 'path'; import url from 'url';
const R = url.pathToFileURL(path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..') + '/').href;
const { generate } = await import(R + 'src/track/generator.js');
const { verifySync } = await import(R + 'src/track/verify.js');
const { Race } = await import(R + 'src/game/race.js');
const { GegnerFeld } = await import(R + 'src/ai/gegner.js');
const DT = 1 / 120;
for (const [s, d] of [[11, 2], [4711, 3]]) {
  const v = verifySync(generate(s, d));
  for (const assist of ['easy', 'medium']) for (const mit of [false, true]) {
    const race = new Race(v.env, { assist, countdown: 1, fahrstil: 'sauber', seed: 3 });
    const F = mit ? new GegnerFeld(v.env, { anzahl: 5, staerke: 'locker', seed: 3, assist, startplatz: 'hinten' }) : null;
    if (F) F.spielerAufstellen(race);
    const ev = {};
    let t = 0;
    // Mittel: Gas voll, Lenkung vom Autopiloten (perfekter Lenker), Leicht: Hände weg
    while (t < v.apTime * 3 && race.state !== 'finished') {
      const inp = assist === 'medium' ? { steer: race.ap.out.steer, throttle: race.ap.out.throttle, brake: race.ap.out.brake } : { steer: 0, throttle: 0, brake: 0 };
      race.step(DT, inp); if (F) { F.step(DT, race); if (assist === "easy") { const A = F.ausweichen(race, DT); race.ap.avoid = A.versatz; race.ap.vCap = A.vCap; } }
      t += DT;
      for (const e of race.events.splice(0)) if (!['count', 'go', 'checkpoint', 'brakehint', 'land', 'refill', 'hop', 'nitro'].includes(e.type)) ev[e.type + (e.reason ? ':' + e.reason : '')] = (ev[e.type + (e.reason ? ':' + e.reason : '')] || 0) + 1;
    }
    const st = F ? F.stand(race) : null;
    console.log(`S${s}/${d} ${assist.padEnd(6)} ${mit ? 'mit 5' : 'solo '} ${race.state === 'finished' ? 'Ziel ' + race.finalTime.toFixed(1) : 'X'} ${JSON.stringify(ev)}${st ? ' Platz ' + st.find((e) => e.spieler).platz + '/6, Stöße ' + F.stoesse : ''}`);
  }
}
