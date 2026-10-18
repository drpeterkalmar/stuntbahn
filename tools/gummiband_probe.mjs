// Hermes 15.10. (übernommen und erweitert in n34): Wie weit fahren die Gegner einem SCHLECHTEN Spieler davon? (Peter: „egal wie
// schlecht man fährt, die Gegner sollen immer in der Nähe bleiben“). Spieler = Mittel, Autopilot-Lenkung, Tempo × s (1 = gut,
// 0,7 = mäßig, 0,5 = schlecht) bzw. „Crash-Spieler“ (× 0,7 und alle 25 s ein erzwungener Crash → Reset + 5 s).
// Misst je Rennen: Abstand (m Streckenweg) zum NÄCHSTEN Gegner – Mittel, p90, Max; Anteil Zeit mit nächstem Gegner ≤ 100 m;
// Feldspitze max vor dem Spieler; Zielabstand des besten Gegners zum Spieler (s, + = Gegner schneller); Gegner-Crashs und Stöße.
// Aufruf: node tools/gummiband_probe.mjs [aufholhilfe 0|1] [--strecken=11-2,4711-3] [--staerken=locker,…] [--spieler=1,0.7,0.5,crash]
//         [--json=datei] [--summe=datei1,datei2 …]
import fs from 'fs'; import path from 'path'; import url from 'url';
const R = url.pathToFileURL(path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..') + '/').href;
const { generate } = await import(R + 'src/track/generator.js');
const { verifySync } = await import(R + 'src/track/verify.js');
const { Race } = await import(R + 'src/game/race.js');
const { GegnerFeld } = await import(R + 'src/ai/gegner.js');
const DT = 1 / 120;
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const auf = process.argv[2] === '1';
const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const STRECKEN = arg('strecken', '11-2,4711-3,77-2,5-1,2024-3,303-2').split(',').map((x) => x.split('-').map(Number));
const STAERKEN = arg('staerken', 'locker,ebenbuertig,profi').split(',');
const SPIELER = arg('spieler', '1,0.7,0.5,crash').split(',');
const SIEHT = arg('sieht', '0') === '1';

export function probe(v, staerke, sp, aufholhilfe, seed = 3) {
  const crashSp = sp === 'crash', sc = crashSp ? 0.7 : +sp;
  const race = new Race(v.env, { assist: 'medium', countdown: 1, fahrstil: 'sauber', seed });
  race.ap.speedScale = sc;
  const F = new GegnerFeld(v.env, { anzahl: 3, staerke, seed, assist: 'medium', startplatz: 'mitte', aufholhilfe });
  F.spielerAufstellen(race);
  let t = 0, tc = 0; const near = [], spitze = [];
  let crashG = 0, stoss = 0, stossSp = 0; const gr = {};
  while (t < v.apTime * 5 && race.state !== 'finished') {
    const inp = { steer: race.ap.out.steer, throttle: race.ap.out.throttle, brake: race.ap.out.brake };
    race.step(DT, inp); F.step(DT, race); t += DT;
    // --sieht=1: Spieler sieht den Verkehr (weicht aus/hält Abstand wie die Leicht-Hilfe, GegnerFeld.ausweichen) – ein Mensch fährt
    // nicht blind auf; ohne: blinder Bot (obere Grenze für Auffahr-Stöße)
    if (SIEHT) { const A = F.ausweichen(race, DT); race.ap.avoid = A.versatz; race.ap.vCap = A.vCap; }
    if (crashSp && race.state === 'running' && (tc += DT) > 25) { tc = 0; race.car.setCrash('Test'); }
    race.events.length = 0;
    for (const e of F.events) { if (e.type === 'gegnerCrash') { crashG++; gr[e.reason] = (gr[e.reason] || 0) + 1; } if (e.type === 'stoss') { stoss++; if (e.spieler) stossSp++; } }
    F.events.length = 0;
    if (t > 5 && Math.round(t * 120) % 60 === 0) {
      const p = race.tracker.progress();
      const ds = F.fahrer.filter((g) => !g.fertig).map((g) => g.fortschritt() - p);
      if (ds.length) { near.push(Math.min(...ds.map(Math.abs))); spitze.push(Math.max(...ds)); }
    }
  }
  const ziel = race.state === 'finished';
  if (ziel) F.abschliessen();
  const gz = F.fahrer.map((g) => g.zeit).filter((z) => z != null);
  return {
    ziel, zeit: ziel ? race.finalTime : null, ap: v.apTime,
    mean: near.reduce((a, b) => a + b, 0) / Math.max(1, near.length), p90: q(near, 0.9) || 0, max: near.length ? Math.max(...near) : 0,
    in100: near.filter((x) => x <= 100).length / Math.max(1, near.length), spitze: spitze.length ? Math.max(...spitze) : 0,
    vorsprung: ziel && gz.length ? race.finalTime - Math.min(...gz) : null,   // + = bester Gegner schneller als der Spieler
    platz: ziel ? 1 + gz.filter((z) => z < race.finalTime).length : null,
    strafe: race.penalties * 5,   // Strafzeit des Spielers (s) – gleicht kein Gummiband aus
    crashG: F.fahrer.reduce((a, g) => a + g.crashes, 0), crashPhysik: crashG, gr, stoesse: stoss, stossSp, kontakt: F.stoesse, imZiel: F.fahrer.filter((g) => g.fertig).length,
  };
}

function summe(rows, titel) {
  const by = {};
  for (const r of rows) (by[r.sp] ||= []).push(r);
  console.log(`\n${titel}`);
  for (const [sp, L] of Object.entries(by)) {
    const m = (f) => L.reduce((a, r) => a + f(r), 0) / L.length;
    console.log(`  Spieler ${String(sp).padEnd(5)}: nächster Gegner Ø ${m((r) => r.mean).toFixed(0)} m, max ${Math.max(...L.map((r) => r.max)).toFixed(0)} m, ≤100 m ${(m((r) => r.in100) * 100).toFixed(0)} % (schlechtestes Rennen ${(Math.min(...L.map((r) => r.in100)) * 100).toFixed(0)} %), Spitze max +${Math.max(...L.map((r) => r.spitze)).toFixed(0)} m, Sieger-Vorsprung max ${Math.max(...L.map((r) => r.vorsprung ?? 0)).toFixed(1)} s (ohne Spieler-Strafzeit max ${Math.max(...L.map((r) => (r.vorsprung ?? 0) - (r.strafe || 0))).toFixed(1)} s, Ø ${m((r) => (r.vorsprung ?? 0) - (r.strafe || 0)).toFixed(1)} s), Platz Ø ${m((r) => r.platz || 4).toFixed(1)}, Gegner-Crashs ${L.reduce((a, r) => a + r.crashG, 0)} (Physik ${L.reduce((a, r) => a + (r.crashPhysik ?? r.crashG), 0)}: ${JSON.stringify(L.reduce((a, r) => { for (const k in r.gr || {}) a[k] = (a[k] || 0) + r.gr[k]; return a; }, {}))}), Stöße > 1,5 m/s ${L.reduce((a, r) => a + r.stoesse, 0)} (mit Spieler ${L.reduce((a, r) => a + (r.stossSp || 0), 0)})`);
  }
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  if (arg('summe')) {
    const rows = arg('summe').split(',').flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).rows);
    summe(rows, arg('titel', 'Summe'));
    process.exit(0);
  }
  const rows = [];
  for (const [s, d] of STRECKEN) {
    const v = verifySync(generate(s, d));
    if (!v.ok) { console.log(`S${s}/${d} Autopilot ohne Ziel – übersprungen`); continue; }
    for (const staerke of STAERKEN) for (const sp of SPIELER) {
      const r = probe(v, staerke, sp, auf);
      rows.push({ strecke: `${s}-${d}`, staerke, sp, ...r });
      console.log(`S${s}/${d} ${staerke.padEnd(11)} Spieler ${String(sp).padEnd(5)} ${r.ziel ? 'Ziel ' + r.zeit.toFixed(0) + ' s' : 'X'} (AP ${v.apTime.toFixed(0)} s) | nächster Gegner: Ø ${r.mean.toFixed(0)} m, p90 ${r.p90.toFixed(0)} m, max ${r.max.toFixed(0)} m, ≤100 m ${(r.in100 * 100).toFixed(0)} % | Spitze max +${r.spitze.toFixed(0)} m | Platz ${r.platz}, bester Gegner ${r.vorsprung != null ? (r.vorsprung >= 0 ? '+' : '') + r.vorsprung.toFixed(1) + ' s' : '–'} | Gegner-Crashs ${r.crashG}, Stöße ${r.stoesse} (Spieler ${r.stossSp}), im Ziel ${r.imZiel}/3`);
    }
  }
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ auf, rows }));
  summe(rows, auf ? 'Gummiband an' : 'Gummiband aus');
}
