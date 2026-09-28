// Sammlung (assets/sammlung.bin + assets/sammlung.json): 250 eigene, generierte Strecken.
// Prüft: Paket vollständig und lesbar, alle Rundkurse, Metadaten stimmig; 20 deterministisch gewählte Strecken mit
// dem Autopilot „Leicht“ im Ziel ohne übersprungenen Stunt (≥ 19/20); Ähnlichkeits-Tor gegen den Korpus und
// innerhalb der Sammlung (nur lokal mit trk_local/, sonst übersprungen); Namen eindeutig und nicht nah an einem
// Original-Namen (nur mit trk_local/zak_popularity.json); kein 1802-Byte-Block gleicht einer Korpus-Datei.
// Filter/Sortierung der Oberfläche: src/game/sammlung.js (reine Funktionen).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTrk, TRK_BYTES, trkHash } from '../../src/track/trk.js';
import { trkToLayout } from '../../src/track/trkimport.js';
import { prepare } from '../../src/track/verify.js';
import { Race } from '../../src/game/race.js';
import { tracksOf } from '../../src/game/sammlung.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DT = 1 / 120;
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sammlung.json'), 'utf8'));
const bin = new Uint8Array(fs.readFileSync(path.join(ROOT, 'assets/sammlung.bin')));
const T = tracksOf(meta);
check(T.length === 250 && meta.count === 250, `250 Strecken im Verzeichnis (${T.length})`);
check(bin.length === T.length * TRK_BYTES, `Paket = ${T.length} × ${TRK_BYTES} Byte (${bin.length})`);
const block = (k) => bin.subarray(k * TRK_BYTES, (k + 1) * TRK_BYTES);

// ---------- alle lesbar, Rundkurs, Metadaten ----------
let parsed = 0, closed = 0, metaOk = 0;
const layouts = [];
T.forEach((t, k) => {
  try {
    const trk = parseTrk(block(k), t.id + '.trk');
    parsed++;
    const { layout, report } = trkToLayout(trk);
    if (report.closed) closed++;
    layouts.push({ trk, layout });
    const good = t.id === 'sam-' + String(k + 1).padStart(3, '0') && t.name && t.m > 500 && [1, 2, 3].includes(t.d) && t.h === trk.horizon && t.tl > 0 && (k === 0 || t.seed > T[k - 1].seed);
    if (good) metaOk++;
  } catch (e) { console.log('   ', t.id, e.message); layouts.push(null); }
});
check(parsed === T.length, `alle parsebar (${parsed}/${T.length})`);
check(closed === T.length, `alle Rundkurs (${closed}/${T.length})`);
check(metaOk === T.length, `Metadaten stimmig: Id fortlaufend, Seeds steigend, Name, Länge, Stufe, Horizont (${metaOk}/${T.length})`);
const ids = new Set(T.map((t) => t.id)), hashes = new Set(T.map((t, k) => trkHash(block(k))));
check(ids.size === T.length && hashes.size === T.length, 'Ids und Inhalte eindeutig');
const nm = new Set(T.map((t) => t.name.toLowerCase()));
check(nm.size === T.length, `Namen eindeutig (${nm.size})`);

// ---------- 20 deterministisch gewählte: Autopilot „Leicht“ ----------
const pick = Array.from({ length: 20 }, (_, q) => Math.floor((q + 0.5) * T.length / 20));
let easyOk = 0;
const t0 = Date.now();
for (const k of pick) {
  const env = prepare(layouts[k].layout, { treeCount: 0 });
  const race = new Race(env, { assist: 'easy', countdown: 0.05 });
  const maxT = Math.max(90, env.track.line.total / 7);
  let t = 0;
  const zero = { steer: 0, throttle: 0, brake: 0 };
  while (t < maxT && race.state !== 'finished') { race.step(DT, zero); t += DT; race.events.length = 0; }
  const ok = race.state === 'finished' && !race.skips;
  if (ok) easyOk++;
  else console.log(`   ${T[k].id} „${T[k].name}“: ${race.state}${race.skips ? ', Stunt übersprungen' : ''}`);
}
check(easyOk >= 19, `Autopilot „Leicht“ im Ziel ohne übersprungenen Stunt: ${easyOk}/20 (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

// ---------- Korpus (nur lokal) ----------
const TRK_LOCAL = path.join(ROOT, 'trk_local');
if (!fs.existsSync(TRK_LOCAL)) {
  console.log('SKIP trk_local/ fehlt – Ähnlichkeits-Tor, Namens- und Byte-Vergleich nur lokal.');
} else {
  const S = await import('../../tools/sammlung_stil.mjs');
  const { levenshtein } = await import('../../tools/build_sammlung.mjs');
  // Byte-Vergleich gegen alle lokalen .TRK-Dateien (Wettbewerbe + Track-Pack)
  const files = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.trk$/i.test(f)) files.push(p); } })(TRK_LOCAL);
  const corpusHashes = new Set();
  for (const f of files) { const b = new Uint8Array(fs.readFileSync(f)); if (b.length >= TRK_BYTES) corpusHashes.add(trkHash(b.subarray(0, TRK_BYTES))); }
  const same = T.filter((t, k) => corpusHashes.has(trkHash(block(k))));
  check(same.length === 0, `kein Block gleicht einer der ${files.length} lokalen .TRK-Dateien (${same.length})`);
  if (S.haveCorpus()) {
    const corpus = S.loadCorpus();
    const cal = S.calibrate(corpus);
    const lim = cal.limit;
    check(lim.jac === meta.build.calibration.limit.jac && lim.lcs === meta.build.calibration.limit.lcs, `Grenzen wie beim Build: Jaccard ≤ ${lim.jac.toFixed(3)}, Abschnitt ≤ ${lim.lcs} (p95 von ${cal.pairs} Korpus-Paaren)`);
    const fps = layouts.map((x) => S.fingerprint(x.trk, x.layout));
    let mjC = 0, mlC = 0, mjS = 0, mlS = 0;
    for (let a = 0; a < fps.length; a++) {
      for (const c of cal.fps) { const x = S.similarity(fps[a], c); if (x.jac > mjC) mjC = x.jac; if (x.lcs > mlC) mlC = x.lcs; }
      for (let b = a + 1; b < fps.length; b++) { const x = S.similarity(fps[a], fps[b]); if (x.jac > mjS) mjS = x.jac; if (x.lcs > mlS) mlS = x.lcs; }
    }
    check(mjC <= lim.jac && mlC <= lim.lcs, `Tor gegen ${corpus.length} Korpus-Strecken (8 Lagen, ±3 Felder): max. Jaccard ${mjC.toFixed(3)}, max. Abschnitt ${mlC} Token`);
    check(mjS <= lim.jac && mlS <= lim.lcs, `Tor innerhalb der Sammlung: max. Jaccard ${mjS.toFixed(3)}, max. Abschnitt ${mlS} Token`);
    const pop = JSON.parse(fs.readFileSync(S.POP_FILE, 'utf8'));
    const orig = pop.tracks.map((t) => String(t.name || '').toLowerCase().trim()).filter(Boolean);
    const near = T.filter((t) => orig.some((o) => levenshtein(t.name.toLowerCase().trim(), o) <= 2));
    check(near.length === 0, `kein Name gleich/fast gleich einem der ${orig.length} Original-Namen (Levenshtein ≤ 2): ${near.map((t) => t.name).join(', ') || 'keiner'}`);
  } else console.log('SKIP zak_popularity.json fehlt – Tor und Namensvergleich übersprungen.');
}

// ---------- Filter & Sortierung (Oberfläche) ----------
const samMod = path.join(ROOT, 'src/game/sammlung.js');
if (fs.existsSync(samMod)) {
  const { filterSort, dayIndex, lengthClass, DEFAULT_VIEW } = await import('../../src/game/sammlung.js');
  const best = (id) => (id === 'sam-003' ? { time: 50 } : id === 'sam-010' ? { time: 40 } : null);
  const played = { 'sam-005': 2000, 'sam-003': 1000 };
  const ctx = { best, played, lengthBounds: meta.lengthBounds };
  const all = filterSort(T, DEFAULT_VIEW, ctx);
  check(all.length === 250 && all[0].sn >= all[1].sn && all[1].sn >= all[249].sn, 'Standard „Empfohlen“: alle 250, nach Stil-Nähe absteigend');
  const q = filterSort(T, { ...DEFAULT_VIEW, q: T[17].name.slice(0, 6).toUpperCase() }, ctx);
  check(q.some((t) => t.id === T[17].id) && q.every((t) => t.name.toLowerCase().includes(T[17].name.slice(0, 6).toLowerCase())), `Suche „${T[17].name.slice(0, 6).toUpperCase()}“ findet ${q.length} (Groß/klein egal)`);
  const loops = filterSort(T, { ...DEFAULT_VIEW, st: ['loop'] }, ctx);
  check(loops.length > 0 && loops.every((t) => t.st.loop > 0), `Filter Looping: ${loops.length}`);
  const two = filterSort(T, { ...DEFAULT_VIEW, st: ['loop', 'roehre'] }, ctx);
  check(two.every((t) => t.st.loop > 0 && t.st.roehre > 0) && two.length <= loops.length, `Filter Looping + Röhre (beides): ${two.length}`);
  const hard = filterSort(T, { ...DEFAULT_VIEW, d: [3] }, ctx);
  check(hard.length > 0 && hard.every((t) => t.d === 3), `Filter Schwierigkeit Irre: ${hard.length}`);
  const easyShort = filterSort(T, { ...DEFAULT_VIEW, d: [1], len: ['kurz'] }, ctx);
  check(easyShort.every((t) => t.d === 1 && lengthClass(t.m, meta.lengthBounds) === 'kurz'), `Filter Sanft + kurz: ${easyShort.length}`);
  const alps = filterSort(T, { ...DEFAULT_VIEW, h: [2] }, ctx);
  check(alps.length > 0 && alps.every((t) => t.h === 2), `Filter Horizont Alpen: ${alps.length}`);
  const never = filterSort(T, { ...DEFAULT_VIEW, never: true }, ctx);
  check(never.length === 248 && !never.some((t) => t.id === 'sam-005' || t.id === 'sam-003'), `„noch nie gefahren“: ${never.length}`);
  const mine = filterSort(T, { ...DEFAULT_VIEW, mine: true, sort: 'best' }, ctx);
  check(mine.length === 2 && mine[0].id === 'sam-010' && mine[1].id === 'sam-003', '„mit meiner Bestzeit“ + Sortierung eigene Bestzeit');
  const byName = filterSort(T, { ...DEFAULT_VIEW, sort: 'name' }, ctx);
  check(byName.every((t, k) => k === 0 || byName[k - 1].name.localeCompare(t.name, 'de') <= 0), 'Sortierung Name A–Z');
  const byLen = filterSort(T, { ...DEFAULT_VIEW, sort: 'len' }, ctx);
  check(byLen.every((t, k) => k === 0 || byLen[k - 1].m <= t.m), 'Sortierung Länge');
  const byStunts = filterSort(T, { ...DEFAULT_VIEW, sort: 'stunts' }, ctx);
  const nSt = (t) => Object.values(t.st).reduce((a, b) => a + b, 0);
  check(byStunts.every((t, k) => k === 0 || nSt(byStunts[k - 1]) >= nSt(t)), 'Sortierung Anzahl Stunts');
  const byDiff = filterSort(T, { ...DEFAULT_VIEW, sort: 'diff' }, ctx);
  check(byDiff.every((t, k) => k === 0 || byDiff[k - 1].d <= t.d), 'Sortierung Schwierigkeit');
  const recent = filterSort(T, { ...DEFAULT_VIEW, sort: 'recent' }, ctx);
  check(recent[0].id === 'sam-005' && recent[1].id === 'sam-003', 'Sortierung zuletzt gefahren');
  const d0 = dayIndex(new Date(2026, 8, 28)), d1 = dayIndex(new Date(2026, 8, 29));
  check(d0 >= 0 && d0 < 250 && d1 === (d0 + 1) % 250, `Strecke des Tages: Tage seit Epoche mod 250 (${d0} → ${d1})`);
}

console.log(fails ? `${fails} Fehler` : 'Sammlung ok');
process.exit(fails ? 1 : 0);
