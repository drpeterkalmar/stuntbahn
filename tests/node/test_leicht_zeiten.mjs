// Leicht ohne Bestzeiten (n15): Zeit wird nur notiert (letzte 5 je Strecke, neueste zuerst, mit Datum), keine
// Bestzeit und kein Geist; vorhandene Leicht-Bestzeiten bleiben gespeichert und kommen einmalig in die Liste;
// Mittel wertet wie bisher (Bestzeit + Geist).
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), get length() { return mem.size; }, key: (i) => [...mem.keys()][i] };
const { Store, modeKey } = await import('../../src/game/store.js');
let ok = true;
const expect = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); ok = ok && !!c; };
const rec = new Float32Array(16 * 4 * 30).fill(0.1);

// alter Stand: Leicht-Bestzeit der aktuellen Wertung + eine der alten Physik, Mittel-Bestzeit
const kE = 'T1|' + modeKey('easy', false), kEold = 'T1|' + modeKey('easy', false, 2), kM = 'T1|' + modeKey('medium', false);
mem.set('stuntbahn.v1', JSON.stringify({ settings: {}, best: { [kE]: { time: 61.5, date: '2026-09-20', pen: 0 }, [kEold]: { time: 70, date: '2026-09-01' }, [kM]: { time: 80, date: '2026-09-21' } }, ghostIndex: [] }));
let S = new Store();
expect(S.best[kE] && S.best[kE].time === 61.5 && S.best[kEold], 'alte Leicht-Bestzeiten bleiben gespeichert');
let L = S.timesFor('T1');
expect(L.length === 1 && L[0].t === 61.5 && L[0].old === 1 && L[0].d === '2026-09-20', `aktuelle Leicht-Bestzeit einmalig in die Zeiten-Liste übernommen ${JSON.stringify(L)}`);

// Leicht-Rennen: kein Best, kein Geist, Zeit vorne in der Liste
const ghosts0 = [...mem.keys()].filter((k) => k.startsWith('stuntbahn.ghost.')).length;
const r = S.submit('T1', 'easy', false, 55.25, rec, { penalties: 1, extras: true });
expect(r.easy && !r.isBest && r.list[0].t === 55.25 && r.list[0].pen === 1, 'Leicht: Ergebnis ohne Bestzeit, Zeit oben in der Liste');
expect(S.best[kE].time === 61.5 && Object.keys(S.best).filter((k) => k.includes('|easy')).length === 2, 'Leicht: Bestzeit unverändert, keine neue Leicht-Wertung');
expect([...mem.keys()].filter((k) => k.startsWith('stuntbahn.ghost.')).length === ghosts0, 'Leicht: kein Geist gespeichert');
for (const t of [90, 91, 92, 93, 94]) S.submit('T1', 'easy', false, t, rec, {});
L = S.timesFor('T1');
expect(L.length === 5 && L.map((e) => e.t).join(',') === '94,93,92,91,90', `Liste: 5 Einträge, neueste zuerst, nicht nach Zeit sortiert (${L.map((e) => e.t)})`);
expect(L.every((e) => /^\d{4}-\d\d-\d\d$/.test(e.d)), 'Liste: jedes Datum gesetzt');
// Neuladen: Liste bleibt, Migration läuft nicht noch einmal
S = new Store();
expect(S.timesFor('T1').map((e) => e.t).join(',') === '94,93,92,91,90', 'nach Neuladen gleiche Liste (keine zweite Übernahme)');

// Mittel: wie bisher
const m1 = S.submit('T1', 'medium', false, 75, rec, { name: 'x' });
expect(m1.isBest && m1.prev === 80 && S.best[kM].time === 75, 'Mittel: neue Bestzeit gewertet');
expect(mem.has('stuntbahn.ghost.' + kM), 'Mittel: Geist gespeichert');
const m2 = S.submit('T1', 'medium', false, 79, rec, {});
expect(!m2.isBest && m2.prev === 75, 'Mittel: langsamere Zeit keine Bestzeit');
expect(S.timesFor('T1').length === 5 && S.timesFor('T1')[0].t === 94, 'Mittel-Zeiten landen nicht in der Leicht-Liste');
console.log(ok ? 'Leicht-Zeiten: alle Prüfungen grün' : 'Leicht-Zeiten: FEHLER');
process.exit(ok ? 0 : 1);
