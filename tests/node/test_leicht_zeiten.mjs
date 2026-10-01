// Speicher (store.js): Bestzeiten gestrichen (n21) und Leicht ohne Bestzeiten (n15).
// - Altes Profil (Bestzeiten aller Physik-/Welt-/Mittel-Versionen, Geister, Leicht-Zeiten mit „früher“-Einträgen aus
//   alten Leicht-Bestzeiten): beim ersten Laden einmalig alle Bestzeiten + Geister weg, Leicht-Zeiten bleiben (ohne
//   „früher“), Einstellungen bleiben; zweites Laden löscht nichts mehr (idempotent).
// - Leicht: Zeit nur notiert (letzte 5 je Strecke, neueste zuerst, mit Datum), keine Bestzeit, kein Geist.
// - Mittel: Bestzeit + Geist unter dem neuen Schlüssel ohne Versions-Zusatz; A/B-Link wertet nicht.
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), get length() { return mem.size; }, key: (i) => [...mem.keys()][i] };
const { Store, modeKey } = await import('../../src/game/store.js');
let ok = true;
const expect = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); ok = ok && !!c; };
const rec = new Float32Array(16 * 4 * 30).fill(0.1);

// echtes Alt-Profil (Schlüssel wie bis n19: Physik @t2/@t3, Welt @w2, Extras @x, Mittel @m2; alte Liste ohne Zusatz)
const oldKeys = ['T1|medium+reset@t3@w2@x@m2', 'T1|medium+reset@t3@w2@x', 'T1|original+reset@t3@w2@x', 'T1|medium', 'T1|original@t2', 'T1|easy+reset@t3@w2@x', 'sam-001|original+reset@t3@w2@x', '4711-3-3d|medium+reset@t3@w2@x@m2'];
const best = Object.fromEntries(oldKeys.map((k, i) => [k, { time: 60 + i, date: '2026-09-2' + (i % 9), name: 'alt', pen: 0 }]));
mem.set('stuntbahn.v1', JSON.stringify({ settings: { assist: 'medium', paint: 123, wreck: true }, best, ghostIndex: oldKeys.slice(0, 4), timesMig: 1,
  times: { T1: [{ t: 55, d: '2026-09-30', pen: 0, x: 1, w: 0 }, { t: 61.5, d: '2026-09-20', pen: 0, x: 1, w: 0, old: 1 }], T2: [{ t: 70, d: '2026-09-19', old: 1 }] } }));
for (const k of oldKeys.slice(0, 4)) mem.set('stuntbahn.ghost.' + k, 'AAAA');
mem.set('stuntbahn.v1.verified', '{"x":{"b":"1"}}');
let S = new Store();
expect(Object.keys(S.best).length === 0, `Bestzeiten gelöscht (vorher ${oldKeys.length}, alte Physik/Welt/Mittel-Listen eingeschlossen)`);
expect(![...mem.keys()].some((k) => k.startsWith('stuntbahn.ghost.')) && S.ghostIndex.length === 0, 'Geisterautos gelöscht');
expect(S.settings.assist === 'medium' && S.settings.paint === 123 && S.settings.wreck === true, 'Einstellungen bleiben');
expect(S.timesFor('T1').length === 1 && S.timesFor('T1')[0].t === 55 && !S.timesFor('T2').length, 'Leicht-Zeiten bleiben, Einträge aus alten Leicht-Bestzeiten („früher“) weg');
expect(mem.get('stuntbahn.v1.verified') === '{"x":{"b":"1"}}', 'geprüfte Strecken (Cache) bleiben');
expect(JSON.parse(mem.get('stuntbahn.v1')).reset === 21, 'Migration gespeichert (reset 21)');

// Leicht-Rennen: kein Best, kein Geist, Zeit vorne in der Liste
const r = S.submit('T1', 'easy', false, 55.25, rec, { penalties: 1, extras: true });
expect(r.easy && !r.isBest && r.list[0].t === 55.25 && r.list[0].pen === 1, 'Leicht: Ergebnis ohne Bestzeit, Zeit oben in der Liste');
expect(Object.keys(S.best).length === 0 && ![...mem.keys()].some((k) => k.startsWith('stuntbahn.ghost.')), 'Leicht: keine Bestzeit, kein Geist');
for (const t of [90, 91, 92, 93, 94]) S.submit('T1', 'easy', false, t, rec, {});
let L = S.timesFor('T1');
expect(L.length === 5 && L.map((e) => e.t).join(',') === '94,93,92,91,90', `Liste: 5 Einträge, neueste zuerst, nicht nach Zeit sortiert (${L.map((e) => e.t)})`);
expect(L.every((e) => /^\d{4}-\d\d-\d\d$/.test(e.d)), 'Liste: jedes Datum gesetzt');

// Mittel: neue Liste fängt leer an, wertet unter dem Schlüssel ohne Versions-Zusatz
const kM = 'T1|' + modeKey('medium', false);
const m1 = S.submit('T1', 'medium', false, 75, rec, { name: 'x' });
expect(m1.isBest && m1.prev === null && S.best[kM].time === 75 && kM === 'T1|medium+reset@x', `Mittel: erste Bestzeit in der leeren Liste (${kM})`);
expect(mem.has('stuntbahn.ghost.' + kM) && S.loadGhost('T1', 'medium', false, true), 'Mittel: Geist gespeichert und ladbar');
const m2 = S.submit('T1', 'medium', false, 79, rec, {});
expect(!m2.isBest && m2.prev === 75, 'Mittel: langsamere Zeit keine Bestzeit');
expect(S.timesFor('T1')[0].t === 94, 'Mittel-Zeiten landen nicht in der Leicht-Liste');

// Neuladen: nichts wird noch einmal gelöscht (idempotent)
S = new Store();
expect(S.best[kM] && S.best[kM].time === 75 && mem.has('stuntbahn.ghost.' + kM) && S.timesFor('T1').length === 5, 'nach Neuladen: neue Bestzeit, Geist und Zeiten bleiben (Migration nur einmal)');

// A/B-Link (z. B. ?schanze=alt): Zeit zeigen, nicht werten, keinen Geist laden
S.ab = true;
const ab = S.submit('T1', 'medium', false, 40, rec, {});
expect(ab.ab && !ab.isBest && S.best[kM].time === 75 && S.loadGhost('T1', 'medium', false, true) === null, 'A/B-Link: schnellere Zeit wird nicht gewertet, kein Geist');
console.log(ok ? 'Leicht-Zeiten: alle Prüfungen grün' : 'Leicht-Zeiten: FEHLER');
process.exit(ok ? 0 : 1);
