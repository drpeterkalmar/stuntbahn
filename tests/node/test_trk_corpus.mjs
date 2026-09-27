// Korpus-Test .TRK-Import (nur lokal: Archiv-Strecken liegen in trk_local/, nie im Repo).
// Je Strecke: parsen → Weg verfolgen → bauen → Autopilot-Runde (a) streng ohne Hilfen,
// (b) Fahrhilfe „Leicht" ohne Spielereingabe. Ausfälle nach Ursache/Element gruppiert.
// Aufruf: node tests/node/test_trk_corpus.mjs [Anzahl=120] [--all-parse] [--only=Muster] [--json=out.json]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTrk } from '../../src/track/trk.js';
import { trkToLayout } from '../../src/track/trkimport.js';
import { prepare } from '../../src/track/verify.js';
import { Race } from '../../src/game/race.js';
import { KIND_NAMES } from '../../src/track/trkelems.js';
import { fmtTime } from '../../src/core/util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'trk_local');
const args = process.argv.slice(2);
const N = +(args.find((a) => /^\d+$/.test(a)) || 120);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const jsonOut = (args.find((a) => a.startsWith('--json=')) || '').slice(7);
const allParse = args.includes('--all-parse');
const assists = (args.find((a) => a.startsWith('--assist=')) || '--assist=easy,strict').slice(9).split(',');

if (!fs.existsSync(DIR)) { console.log('trk_local/ fehlt – Korpus-Test übersprungen (Archiv-Strecken nur lokal).'); process.exit(0); }
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.trk$/i.test(f)) files.push(p); } })(DIR);

// Deterministische Auswahl: gleichmäßig über das sortierte Archiv verteilt (Wettbewerbe + Track-Pack)
function pick(list, n) {
  if (only) return list.filter((f) => f.includes(only));
  if (n >= list.length) return list;
  const out = [];
  for (let k = 0; k < n; k++) out.push(list[Math.floor((k + 0.5) * list.length / n)]);
  return out;
}

const DT = 1 / 120;
function lap(env, assist) {
  const race = new Race(env, assist === 'strict' ? { assist: 'original', autopilot: true, countdown: 0.05 } : { assist: 'easy', countdown: 0.05 });
  const L = env.track.line;
  const maxT = Math.max(90, L.total / 7);
  let t = 0, firstCrash = null;
  const zero = { steer: 0, throttle: 0, brake: 0 };
  while (t < maxT) {
    race.step(DT, zero);
    t += DT;
    if (race.state === 'finished') break;
    if (race.car.crash || race.state === 'wreck') {
      if (!firstCrash) {
        const idx = race.tracker.idx;
        const pc = env.layout.pieces[L.piece[idx]];
        firstCrash = { reason: race.car.crash ? race.car.crash.reason : 'Wrack', kind: pc ? pc.kind : '?', type: pc ? pc.type : '?', s: Math.round(L.s[idx]) };
      }
      if (assist === 'strict') break;
    }
    for (const e of race.events) if (e.type === 'crash' && !firstCrash) {
      const idx = race.tracker.idx, pc = env.layout.pieces[L.piece[idx]];
      firstCrash = { reason: e.reason, kind: pc ? pc.kind : '?', type: pc ? pc.type : '?', s: Math.round(L.s[idx]) };
    }
    race.events.length = 0;
  }
  // „Überspringen“ nach 3 Fehlversuchen ist eine Spiel-Sicherung – für die Quote zählt es als Ausfall
  const ok = race.state === 'finished' && !race.skips;
  let fail = null;
  if (!ok) {
    const idx = race.tracker.idx;
    const pc = env.layout.pieces[L.piece[idx]];
    fail = firstCrash || { reason: 'Zeitlimit', kind: pc ? pc.kind : '?', type: pc ? pc.type : '?', s: Math.round(L.s[idx]) };
  }
  return { ok, time: ok ? race.finalTime : null, crashes: race.crashes, rewinds: race.rewinds, fail, progress: race.tracker.progress() / L.total };
}

const res = [];
const t0 = Date.now();
const sel = pick(files, N);
// Parser/Weg-Statistik über ALLE Dateien (schnell), Fahrten nur für die Auswahl
if (allParse) {
  const st = { files: files.length, parsed: 0, mapped: 0, closed: 0 }, errs = {};
  for (const f of files) {
    try {
      const trk = parseTrk(fs.readFileSync(f), f); st.parsed++;
      const r = trkToLayout(trk); st.mapped++; if (r.report.closed) st.closed++;
    } catch (e) { const k = e.message.split(':')[0].slice(0, 70); errs[k] = (errs[k] || 0) + 1; }
  }
  console.log('Alle Dateien:', JSON.stringify(st), JSON.stringify(errs));
}
for (const f of sel) {
  const rel = path.relative(DIR, f);
  const row = { file: rel };
  try {
    const trk = parseTrk(fs.readFileSync(f), f);
    row.parsed = true;
    const { layout, report } = trkToLayout(trk);
    row.mapped = !report.unknown.length;
    row.closed = report.closed; row.gaps = report.gaps; row.pieces = report.pieces;
    const tb = Date.now();
    const env = prepare(layout, { treeCount: 0 });
    row.buildMs = Date.now() - tb;
    row.km = +(env.ideal.total / 1000).toFixed(2);
    for (const a of assists) {
      const r = lap(env, a);
      row[a] = r;
    }
  } catch (e) {
    row.error = e.message;
  }
  res.push(row);
  const e = row.easy, s = row.strict;
  console.log(`${(e && e.ok) ? 'OK  ' : 'FAIL'} ${rel.padEnd(34)} ${row.error ? 'Fehler: ' + row.error : `${row.km} km ${row.closed ? 'Rund' : 'offen'} Lücken ${row.gaps}  Leicht ${e ? (e.ok ? fmtTime(e.time) + ' (' + e.rewinds + '× zurück)' : 'x ' + e.fail.reason + ' @' + (KIND_NAMES[e.fail.kind] || e.fail.kind) + ' ' + Math.round(e.progress * 100) + '%') : '-'}  streng ${s ? (s.ok ? fmtTime(s.time) : 'x ' + s.fail.reason + ' @' + (KIND_NAMES[s.fail.kind] || s.fail.kind)) : '-'}  ${row.buildMs} ms`}`);
}
const n = res.length;
const cnt = (fn) => res.filter(fn).length;
const pct = (k) => (100 * k / n).toFixed(1) + ' %';
const parsed = cnt((r) => r.parsed), mapped = cnt((r) => r.parsed && r.mapped && !r.error), easyOk = cnt((r) => r.easy && r.easy.ok), strictOk = cnt((r) => r.strict && r.strict.ok);
console.log('\n| Prüfung | Anzahl | Quote |\n|---|---|---|');
console.log(`| Strecken im Test | ${n} | |`);
console.log(`| parsebar | ${parsed} | ${pct(parsed)} |`);
console.log(`| vollständig gemappt + gebaut | ${mapped} | ${pct(mapped)} |`);
console.log(`| Rundkurs gefunden | ${cnt((r) => r.closed)} | ${pct(cnt((r) => r.closed))} |`);
if (assists.includes('easy')) console.log(`| Autopilot im Ziel, Fahrhilfe Leicht | ${easyOk} | ${pct(easyOk)} |`);
if (assists.includes('strict')) console.log(`| Autopilot im Ziel, ohne Hilfen (streng) | ${strictOk} | ${pct(strictOk)} |`);
// Ausfälle gruppieren
for (const a of assists) {
  const g = {};
  for (const r of res) {
    const x = r[a];
    const k = r.error ? 'Fehler: ' + r.error.slice(0, 60) : x && !x.ok ? `${x.fail.reason} @ ${KIND_NAMES[x.fail.kind] || x.fail.kind}` : null;
    if (k) g[k] = (g[k] || 0) + 1;
  }
  console.log(`\nAusfälle (${a}):`);
  for (const [k, v] of Object.entries(g).sort((p, q) => q[1] - p[1])) console.log(`  ${String(v).padStart(3)} × ${k}`);
}
console.log(`\nDauer ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(res, null, 1));
