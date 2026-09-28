// Build der „Sammlung“: Seeds 1, 2, … → eigene .TRK-Strecken aus src/track/trkgen.js → Prüfungen → die ersten N,
// die alles bestehen, kommen ins Paket assets/sammlung.bin (N × 1802 Byte, ein Request) + assets/sammlung.json.
// Prüfungen je Kandidat: parsebar, Rundkurs, Ähnlichkeits-Tor (tools/sammlung_stil.mjs) gegen alle Korpus-Strecken
// (trk_local/, nur lokal) und gegen die Sammlung selbst, Name (eindeutig, nicht nah an einem Original-Namen),
// Autopilot „Leicht“ im Ziel ohne übersprungenen Stunt; dazu Zeiten Mittel und Referenz (Autopilot ohne Hilfen).
// Eingefroren ab dem ersten Push: vorhandene Einträge bleiben unverändert (Bestzeiten hängen an der sam-Nummer),
// ein neuer Lauf hängt nur an (--anzahl größer als vorhanden). --neu baut von vorn (nur vor der Veröffentlichung).
// Abschnittsweise: --zeit=Sekunden beendet den Lauf sauber (Dateien geschrieben), der nächste Lauf macht weiter.
// --grenzen legt die Grenzen kurz/mittel/lang und die Schwierigkeitsstufen neu über alle Strecken fest (nur vor der
// Veröffentlichung; danach bleiben sie, neue Strecken werden mit denselben Grenzen eingestuft).
// Aufruf: node tools/build_sammlung.mjs [--anzahl=250] [--neu] [--zeit=540] [--grenzen] [--max=600000]
import fs from 'fs';
import path from 'path';
import { parseTrk, TRK_BYTES, HORIZONS } from '../src/track/trk.js';
import { trkToLayout } from '../src/track/trkimport.js';
import { prepare } from '../src/track/verify.js';
import { Race } from '../src/game/race.js';
import { generateTrk, trkName } from '../src/track/trkgen.js';
import { ROOT, POP_FILE, haveCorpus, loadCorpus, calibrate, fingerprint, Gate, similarity, features, COUNT_KEYS, TOKEN } from './sammlung_stil.mjs';
import { tracksOf, colsOf } from '../src/game/sammlung.js';

const args = process.argv.slice(2);
const arg = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const WANT = +arg('anzahl', 250);
const MAX_SEEDS = +arg('max', 600000);
const FRESH = args.includes('--neu');
const TIME = +arg('zeit', 1e9);
const REBOUND = args.includes('--grenzen');
const BIN = path.join(ROOT, 'assets', 'sammlung.bin');
const JSN = path.join(ROOT, 'assets', 'sammlung.json');
const STYLE = path.join(ROOT, 'assets', 'sammlung_stil.json');
const DT = 1 / 120;

// ---------- Namen ----------
export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const norm = (s) => String(s).toLowerCase().trim();
export function nameTooClose(name, originals) { const a = norm(name); return originals.some((o) => levenshtein(a, norm(o)) <= 2); }

// ---------- Autopilot-Runden ----------
function lap(env, kind) {
  const opt = kind === 'leicht' ? { assist: 'easy', countdown: 0.05 } : kind === 'mittel' ? { assist: 'medium', countdown: 0.05 } : { assist: 'original', autopilot: true, countdown: 0.05 };
  const race = new Race(env, opt);
  const L = env.track.line;
  const maxT = Math.max(90, L.total / 7) * (kind === 'mittel' ? 1.5 : 1);
  let t = 0, first = null;
  const zero = { steer: 0, throttle: 0, brake: 0 };
  while (t < maxT && race.state !== 'finished') {
    let inp = zero;
    if (kind === 'mittel') { const o = race.ap.control(race.car); inp = { steer: o.steer, throttle: o.throttle, brake: o.brake }; }
    race.step(DT, inp);
    t += DT;
    if ((race.car.crash || race.state === 'wreck') && !first) {
      const pc = env.layout.pieces[L.piece[race.tracker.idx]];
      first = { reason: race.car.crash ? race.car.crash.reason : 'Wrack', kind: pc ? pc.kind : '' };
      if (kind === 'streng') break;
    }
    race.events.length = 0;
  }
  const ok = race.state === 'finished' && !race.skips;
  return { ok, time: ok ? +race.finalTime.toFixed(2) : null, crashes: race.crashes || 0, skips: race.skips || 0, fail: ok ? null : first || { reason: 'Zeitlimit', kind: '' } };
}

// ---------- Kennzahlen für die Oberfläche ----------
// Stunt-Zählung je Strecke (Schlüssel wie die Filter-Chips in src/game/sammlung.js)
function stunts(layout) {
  const c = { loop: 0, kork: 0, roehre: 0, sprung: 0, tunnel: 0, autobahn: 0, steil: 0, hoch: 0, slalom: 0, schikane: 0, kreuz: 0 };
  const P = layout.pieces;
  P.forEach((p, k) => {
    const nx = P[(k + 1) % P.length];
    if (p.kind === 'loop') c.loop++;
    if (p.kind === 'corklr' || p.kind === 'corkud') c.kork++;
    if (p.kind === 'pipeT' && p.into) c.roehre++;
    if (p.kind === 'gap') c.sprung++;
    if (p.kind === 'tunnel' && (!nx || nx.kind !== 'tunnel')) c.tunnel++;
    if (p.kind === 'hwyT' && p.into) c.autobahn++;
    if (p.kind === 'bankC') c.steil++;
    if (['elramp', 'bramp', 'sramp'].includes(p.kind) && p.h1 > p.lvl && nx && ['elev', 'span', 'solid', 'spanroad', 'elcorner'].includes(nx.kind)) c.hoch++;
    if (p.kind === 'corkud' && p.h1 > p.lvl) c.hoch++;
    if (p.kind === 'slalom') c.slalom++;
    if (p.kind === 'chicane') c.schikane++;
    if (p.kind === 'cross' || p.kind === 'spanroad') c.kreuz++;
  });
  for (const k of Object.keys(c)) if (!c[k]) delete c[k];
  return c;
}
// Stil-Nähe 0 … 100: Abstand der Merkmale zum (nach Beliebtheit gewichteten) Korpus-Mittel in Standardabweichungen
export function styleScore(f, style) {
  const zs = [];
  const z = (x, d) => { const sd = Math.max(d.sd, 0.3 * Math.abs(d.mean), 0.5); zs.push(((x - d.mean) / sd) ** 2); };
  z(f.elements, style.length.elements); z(f.tokens, style.length.tokens); z(f.cells, style.shape.cells);
  z(f.bboxW, style.shape.bboxW); z(f.bboxH, style.shape.bboxH); z(f.fill, style.shape.fill);
  for (const k of COUNT_KEYS) z(f.counts[k], style.counts[k]);
  z(f.heightChanges, style.height.changes); z(f.hill, style.terrain.hill); z(f.water, style.terrain.water); z(f.scenery, style.scenery.count);
  const m = zs.reduce((a, b) => a + b, 0) / zs.length;
  return Math.round(100 * Math.exp(-m / 2));
}
// Schwierigkeits-Wert (höher = schwerer): Stunts und enge Kurven je km, Sprünge, Eis/Schotter, Crashs im Mittel-Lauf,
// Scheitern des Autopiloten ohne Hilfen
function diffScore(f, st, laps, km) {
  const hard = (st.loop || 0) + (st.kork || 0) + (st.roehre || 0) + 1.3 * (st.sprung || 0);
  return hard / km * 0.9 + f.counts.sharp / km * 0.35 + f.counts.chicane * 0.3 + (f.icy > 0 ? 1.2 : 0) + (f.dirt > 0 ? 0.5 : 0)
    + laps.m.crashes * 0.8 + (laps.m.ok ? 0 : 1.5) + (laps.s.ok ? 0 : 1.6) + laps.l.crashes * 0.6;
}

// ---------- Hauptprogramm ----------
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!haveCorpus()) { console.log('trk_local/ fehlt – der Build prüft gegen den Korpus und läuft nur lokal.'); process.exit(1); }
  const t0 = Date.now();
  const style = JSON.parse(fs.readFileSync(STYLE, 'utf8'));
  const pop = JSON.parse(fs.readFileSync(POP_FILE, 'utf8'));
  const originals = pop.tracks.map((t) => t.name).filter(Boolean);
  const corpus = loadCorpus();
  console.log(`Korpus ${corpus.length} Strecken · Token-Art „${TOKEN.mode}“ · Kalibrierung …`);
  const cal = calibrate(corpus);
  const LIM = cal.limit;
  console.log(`  Paare verschiedener Designer: ${cal.pairs}`);
  console.log(`  Jaccard: Median ${cal.jac.median.toFixed(3)} · p95 ${cal.jac.p95.toFixed(3)} · p99 ${cal.jac.p99.toFixed(3)} · max ${cal.jac.max.toFixed(3)}`);
  console.log(`  Abschnitt (Token): Median ${cal.lcs.median} · p95 ${cal.lcs.p95} · p99 ${cal.lcs.p99} · max ${cal.lcs.max}`);
  console.log(`  Grenzen: Jaccard ≤ ${LIM.jac.toFixed(3)}, Abschnitt ≤ ${LIM.lcs} Token (strengere aus p95 und 0,35 / 6)`);
  const gCorpus = new Gate(LIM), gColl = new Gate(LIM);
  for (const f of cal.fps) gCorpus.add(f);
  const corpusRaw = corpus.map((c) => c.raw.subarray(0, TRK_BYTES));

  // vorhandene Sammlung (eingefroren) übernehmen
  let tracks = [], bins = [], startSeed = 1, frozen = null;
  if (!FRESH && fs.existsSync(JSN) && fs.existsSync(BIN)) {
    frozen = JSON.parse(fs.readFileSync(JSN, 'utf8'));
    const bin = new Uint8Array(fs.readFileSync(BIN));
    tracks = tracksOf(frozen);
    for (let k = 0; k < tracks.length; k++) {
      const b = bin.slice(k * TRK_BYTES, (k + 1) * TRK_BYTES);
      bins.push(b);
      const trk = parseTrk(b, 'x.trk');
      gColl.add(fingerprint(trk, trkToLayout(trk).layout));
    }
    startSeed = Math.max(0, ...tracks.map((t) => t.seed)) + 1;
    console.log(`Vorhandene Sammlung: ${tracks.length} Strecken (eingefroren), weiter ab Seed ${startSeed}`);
  }
  const usedNames = new Set(tracks.map((t) => norm(t.name)));
  const rej = frozen && frozen.build ? { ...frozen.build.rejected } : {};
  const triedBefore = frozen && frozen.build ? frozen.build.tried : 0;
  const reject = (k) => { rej[k] = (rej[k] || 0) + 1; };
  const cand = [];     // angenommene Kandidaten mit Rohdaten (für Schwierigkeit/Grenzen am Ende)
  let seed = startSeed, tried = 0;
  const tStart = Date.now();
  while (tracks.length + cand.length < WANT && seed < startSeed + MAX_SEEDS && (Date.now() - t0) / 1000 < TIME) {
    const s = seed++;
    tried++;
    const g = generateTrk(s, style);
    if (!g) { reject('Generator ohne Rundkurs'); continue; }
    let trk, layout, report;
    try { trk = parseTrk(g.bytes, 'sam.trk'); ({ layout, report } = trkToLayout(trk)); } catch (e) { reject('nicht lesbar'); continue; }
    if (!report.closed) { reject('kein Rundkurs'); continue; }
    const fp = fingerprint(trk, layout);
    if (!gCorpus.lcsOk(fp)) { reject('Korpus: gemeinsamer Abschnitt'); continue; }
    if (!gColl.lcsOk(fp)) { reject('Sammlung: gemeinsamer Abschnitt'); continue; }
    if (!gColl.jacOk(fp)) { reject('Sammlung: Felder-Überdeckung'); continue; }
    if (!gCorpus.jacOk(fp)) { reject('Korpus: Felder-Überdeckung'); continue; }
    if (corpusRaw.some((c) => c.every((v, k) => v === g.bytes[k]))) { reject('Byte-gleich mit Korpus'); continue; }
    // Name
    let name = null;
    for (let v = 0; v < 60 && !name; v++) { const nm = trkName(s, v); if (!usedNames.has(norm(nm)) && !nameTooClose(nm, originals)) name = nm; }
    if (!name) { reject('kein freier Name'); continue; }
    // Autopilot
    let env;
    try { env = prepare(layout, { treeCount: 0 }); } catch (e) { reject('Bau fehlgeschlagen'); continue; }
    const l = lap(env, 'leicht');
    if (!l.ok) { reject(`Autopilot Leicht: ${l.skips ? 'Stunt übersprungen' : l.fail.reason}`); continue; }
    const m = lap(env, 'mittel'), st = lap(env, 'streng');
    usedNames.add(norm(name));
    gColl.add(fp);
    const f = features(trk, layout, Math.round(env.track.line.total));
    const stc = stunts(layout);
    cand.push({ seed: s, name, bytes: g.bytes, horizon: g.horizon, f, st: stc, laps: { l, m, s: st }, km: env.track.line.total / 1000, fp });
    const n = tracks.length + cand.length;
    const rate = (Date.now() - tStart) / 1000;
    console.log(`✓ ${String(n).padStart(3)} Seed ${String(s).padStart(6)} „${name}“ ${(env.track.line.total / 1000).toFixed(2)} km · Leicht ${l.time} s${l.crashes ? ` (${l.crashes} Crash)` : ''} · Mittel ${m.ok ? m.time + ' s' : '–'} · ohne Hilfen ${st.ok ? st.time + ' s' : st.fail.reason} · ${tried} geprüft, ${rate.toFixed(0)} s`);
  }
  const all = tracks.length + cand.length;
  if (all < WANT) console.log(`\n⚠️ Nur ${all} von ${WANT} Strecken nach ${tried} Seeds.`);

  // Grenzen für Länge/Schwierigkeit: beim ersten Build aus den Terzilen, danach fest (eingefroren)
  const q = (arr, p) => { const s2 = [...arr].sort((a, b) => a - b); return s2[Math.min(s2.length - 1, Math.floor(p * s2.length))]; };
  const dsc = cand.map((c) => +diffScore(c.f, c.st, c.laps, c.km).toFixed(3));
  const allM = [...tracks.map((t) => t.m), ...cand.map((c) => Math.round(c.km * 1000))], allD = [...tracks.map((t) => t.ds), ...dsc];
  // nach der Veröffentlichung (keine Rohwerte ds mehr im Paket) bleiben die Grenzen fest
  if (REBOUND && tracks.some((t) => t.ds === undefined)) console.log('⚠️ --grenzen ignoriert: die Sammlung ist veröffentlicht, Grenzen bleiben eingefroren.');
  const fresh = !frozen || REBOUND && !tracks.some((t) => t.ds === undefined);
  const lengthBounds = fresh ? [Math.round(q(allM, 1 / 3) / 50) * 50, Math.round(q(allM, 2 / 3) / 50) * 50] : frozen.lengthBounds;
  const diffBounds = fresh ? [+q(allD, 1 / 3).toFixed(2), +q(allD, 2 / 3).toFixed(2)] : frozen.diffBounds;
  const stage = (x) => (x < diffBounds[0] ? 1 : x < diffBounds[1] ? 2 : 3);
  if (fresh) for (const t of tracks) t.d = stage(t.ds);
  const first = tracks.length;
  cand.forEach((c, k) => {
    const d = stage(dsc[k]);
    tracks.push({
      id: 'sam-' + String(first + k + 1).padStart(3, '0'), seed: c.seed, name: c.name, m: Math.round(c.km * 1000),
      st: c.st, d, h: c.horizon, sn: styleScore(c.f, style),
      tl: Math.round(c.laps.l.time * 10) / 10, tm: c.laps.m.ok ? Math.round(c.laps.m.time * 10) / 10 : null, ap: c.laps.s.ok ? c.laps.s.time : null,
      apf: c.laps.s.ok ? undefined : `${c.laps.s.fail.reason}|${c.laps.s.fail.kind}`,
    });
    bins.push(c.bytes);
  });

  // Größte Ähnlichkeiten der Sammlung (exakt) gegen Korpus und untereinander – müssen unter den Grenzen liegen
  const fps = [...gColl.fps];
  let mjC = 0, mlC = 0, mjS = 0, mlS = 0;
  for (let a = 0; a < fps.length; a++) {
    for (const c of cal.fps) { const x = similarity(fps[a], c); if (x.jac > mjC) mjC = x.jac; if (x.lcs > mlC) mlC = x.lcs; }
    for (let b = a + 1; b < fps.length; b++) { const x = similarity(fps[a], fps[b]); if (x.jac > mjS) mjS = x.jac; if (x.lcs > mlS) mlS = x.lcs; }
  }
  const build = {
    date: new Date().toISOString().slice(0, 10), token: TOKEN.mode, seeds: `1–${seed - 1}`, tried: triedBefore + tried, rejected: rej,
    calibration: { pairs: cal.pairs, jac: cal.jac, lcs: cal.lcs, limit: LIM },
    collectionMax: { jacCorpus: +mjC.toFixed(3), lcsCorpus: mlC, jacInside: +mjS.toFixed(3), lcsInside: mlS },
    seconds: Math.round((Date.now() - t0) / 1000) + (frozen && frozen.build ? frozen.build.seconds : 0),
  };
  for (const t of tracks) delete t.ds;
  const out = { version: 2, count: tracks.length, bytesPer: TRK_BYTES, horizons: HORIZONS, lengthBounds, diffBounds, created: frozen ? frozen.created : build.date, build, cols: colsOf(tracks) };
  const bin = new Uint8Array(bins.length * TRK_BYTES);
  bins.forEach((b, k) => bin.set(b, k * TRK_BYTES));
  fs.writeFileSync(BIN, bin);
  fs.writeFileSync(JSN, JSON.stringify(out) + '\n');

  // Protokoll
  console.log(`\n=== Build-Protokoll ===`);
  console.log(`Kandidaten (Seeds ${build.seeds}): ${build.tried} geprüft (dieser Lauf ${tried}), ${cand.length} neu angenommen, Sammlung ${tracks.length}`);
  console.log('Verwürfe je Grund:');
  for (const [k, v] of Object.entries(rej).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(7)} × ${k}`);
  console.log(`Kalibrierung (${cal.pairs} Korpus-Paare verschiedener Designer):`);
  console.log(`  Jaccard  Median ${cal.jac.median.toFixed(3)} · p95 ${cal.jac.p95.toFixed(3)} · p99 ${cal.jac.p99.toFixed(3)} · max ${cal.jac.max.toFixed(3)} → Grenze ${LIM.jac.toFixed(3)}`);
  console.log(`  Abschnitt Median ${cal.lcs.median} · p95 ${cal.lcs.p95} · p99 ${cal.lcs.p99} · max ${cal.lcs.max} → Grenze ${LIM.lcs}`);
  console.log(`Größte Werte der Sammlung: gegen Korpus Jaccard ${mjC.toFixed(3)} / Abschnitt ${mlC} · untereinander Jaccard ${mjS.toFixed(3)} / Abschnitt ${mlS}`);
  const okAll = mjC <= LIM.jac && mlC <= LIM.lcs && mjS <= LIM.jac && mlS <= LIM.lcs;
  console.log(okAll ? '✅ alle unter den Grenzen' : '❌ Grenze überschritten!');
  console.log(`Paket: ${path.relative(ROOT, BIN)} ${(bin.length / 1024).toFixed(1)} KB, ${path.relative(ROOT, JSN)} ${(fs.statSync(JSN).size / 1024).toFixed(1)} KB · ${build.seconds} s`);
  if (!okAll) process.exitCode = 1;
}
