// n26: Sprung-Hilfe (Mittel, src/game/jumpassist.js) abstimmen – Landungen der Mittel-Bots auf den Sprung-Strecken
// (tools/sprung_probe.mjs jumpTracks, Seeds 7 und 8) je Einstellung: ok / weit / kurz / Crash und Lippen-Tempo.
// Aufruf: node tools/sprunghilfe_probe.mjs "gUp:3,aH:3;gUp:6,aH:4.5" [mensch-voll,mensch-handy]
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), get length() { return mem.size; }, key: (i) => [...mem.keys()][i] };
const { MEDIUM_N24 } = await import('../src/game/race.js');
const { JUMP_PULL } = await import('../src/game/jumpassist.js');
const { jumpTracks } = await import('./sprung_probe.mjs');
const { runBot } = await import('./mittel_probe.mjs');
const DT = 1 / 120;
const tracks = jumpTracks(8);
const sets = (process.argv[2] || 'gUp:3,aH:3').split(';');
for (const set of sets) {
  const o = {}; for (const kv of set.split(',')) { const [k, v] = kv.split(':'); o[k] = +v; }
  Object.assign(JUMP_PULL, { lo: 10, hiMargin: 4, aH: 3.0, gUp: 3.0, gDown: 2.5, rate: 4 }, o);
  for (const bot of (process.argv[3] || 'mensch-voll,mensch-handy').split(',')) {
    const st = [], vs = [];
    const hook = (() => { let s = null; return (race) => {
      const Lx = race.env.track.line, Js = race.env.track.jumps.filter((j) => !j.gen), car = race.car, ti = race.tracker.idx;
      if (!s || s.race !== race) s = { race, at: null, prev: ti, air: 0, cr: race.crashes };
      for (const j of Js) if (s.prev < j.lipIdx && ti >= j.lipIdx && ti - s.prev < 20 && race.state === 'running') { s.at = { j, cr: race.crashes, t: race.time }; vs.push(car.speed() * 3.6); }
      s.prev = ti;
      if (!s.at) return;
      const j = s.at.j;
      if (car.onGround === 0) s.air += DT;
      if (race.crashes > s.at.cr || race.state !== 'running') { st.push('crash'); s.at = null; s.air = 0; return; }
      if (car.onGround > 0 && s.air > 0.3) {
        const ax = Lx.px[j.landIdx] - Lx.px[j.lipIdx], az = Lx.pz[j.landIdx] - Lx.pz[j.lipIdx], al = Math.hypot(ax, az);
        const fl = ((car.pos.x - Lx.px[j.lipIdx]) * ax + (car.pos.z - Lx.pz[j.lipIdx]) * az) / al - al;
        st.push(fl < 0 ? 'kurz' : fl > j.landLen ? 'weit' : 'ok'); s.at = null; s.air = 0;
      }
      if (s.at && race.time - s.at.t > 6) { s.at = null; s.air = 0; }
    }; })();
    for (const [, v] of tracks) runBot(v, MEDIUM_N24, bot, [7, 8], hook);
    const c = (k) => st.filter((x) => x === k).length; vs.sort((a, b) => a - b);
    console.log(`${set.padEnd(22)} ${bot.padEnd(12)} n ${st.length} ok ${c('ok')} weit ${c('weit')} kurz ${c('kurz')} crash ${c('crash')} | Lippe km/h P10 ${vs[Math.floor(vs.length * 0.1)]?.toFixed(0)} Median ${vs[vs.length >> 1]?.toFixed(0)} P90 ${vs[Math.floor(vs.length * 0.9)]?.toFixed(0)} max ${vs[vs.length - 1]?.toFixed(0)}`);
  }
}
