// n35 Sitzung über das Fake-Netz: Lobby, Raum voll, synchroner Start (±50 ms) bei 0/50/150 ms Ping mit Schwankung
// und 5 % Verlust, Zustände + Interpolation, Zieleinlauf vom Gastgeber bestätigt, gleiche Zieltabelle für alle,
// Gastgeber geht (geordnet und abrupt) → Nächster übernimmt ohne Uhr-Sprung, Abbruch eines Gasts, Neu-Verbinden mit
// gleichem Platz, Raum nicht gefunden, direkte Verbindung blockiert, zwei Gastgeber gleichzeitig.
import { FakeNetz } from '../../src/net/fake.js';
import { Sitzung, SITZUNG } from '../../src/net/sitzung.js';
import { schema } from '../../src/net/paket.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const S = schema([['px', 'f32'], ['py', 'f32'], ['pz', 'f32'], ['q', 'quat'], ['vx', 'i16', 0.01], ['vy', 'i16', 0.01], ['vz', 'i16', 0.01], ['sprung', 'u8'], ['fort', 'f32']]);

// Spieler k fährt einen Kreis (Radius 80 m, 40 m/s), Phase je Spieler versetzt
const wahr = (k, t) => { const w = 0.5, a = w * t + k; return { px: 80 * Math.cos(a), py: 1, pz: 80 * Math.sin(a), vx: -40 * Math.sin(a), vy: 0, vz: 40 * Math.cos(a), q: { x: 0, y: Math.sin(-a / 2), z: 0, w: Math.cos(-a / 2) }, sprung: 0, fort: 40 * t }; };

function welt(opt = {}) { return { N: new FakeNetz({ abgangVerzug: 2500, ...opt }), alle: [] }; }
function spieler(W, id, opt = {}) {
  const t = W.N.teilnehmer(id, { uhr: opt.uhr ?? (id.charCodeAt(0) * 7919) % 50000, gang: opt.gang ?? 0 });
  const s = new Sitzung(t, { jetzt: t.jetzt, sid: 'sid-' + id, info: { name: opt.name || id.toUpperCase(), stufe: 'medium' }, gastgeber: !!opt.gastgeber, schema: S, einstellungen: { strecke: 'sam-12', runden: 1 } });
  s._id = id; s._tr = t;
  W.alle.push(s);
  return s;
}
// Zeit laufen lassen (ms, 5-ms-Raster); jeTakt(N.zeit) nach jedem Raster
function lauf(W, ms, jeTakt = null) {
  for (let t = 0; t < ms; t += 5) { W.N.schritt(5); for (const s of W.alle) if (s.status !== 'weg' && s._tr.aktiv) s.takt(); if (jeTakt) jeTakt(W.N.zeit); }
}
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- Lobby ----------
for (const [lat, jit, verl] of [[0, 0, 0], [75, 40, 0.05]]) {
  const W = welt({ latenz: lat, jitter: jit, verlust: verl, seed: 3 });
  const A = spieler(W, 'a', { gastgeber: true, name: 'Peter' });
  lauf(W, 300);
  const B = spieler(W, 'b', { name: 'Ben' }); lauf(W, 700);
  const C = spieler(W, 'c', { name: 'Cleo' }); lauf(W, 2500);
  const sicht = (s) => s.liste().map((m) => `${m.nummer}:${m.info.name}`).join(' ');
  ok([A, B, C].every((s) => sicht(s) === '1:Peter 2:Ben 3:Cleo' && s.lobby.host === 'sid-a'), `Lobby (Ping ${2 * lat} ±${jit}, ${verl * 100} % Verlust): alle sehen „${sicht(C)}“, Gastgeber Peter`);
  A.setzeEinstellungen({ strecke: 'trk-xy', runden: 2, ki: 2 }); B.setzeBereit(true); C.setzeInfo({ name: 'Cleo 🏎', stufe: 'easy' });
  lauf(W, 2000);
  ok([B, C].every((s) => s.lobby.einst.strecke === 'trk-xy' && s.lobby.einst.runden === 2) && [A, B, C].every((s) => s.liste()[1].bereit === true && s.liste()[2].info.stufe === 'easy' && s.liste()[2].info.name === 'Cleo 🏎'), 'Einstellungen, „Bereit“ und Name/Stufe kommen bei allen an');
  ok(!B.setzeEinstellungen({ strecke: 'x' }) && A.lobby.einst.strecke === 'trk-xy', 'nur der Gastgeber ändert Einstellungen');
  ok(B.uhr.gueltig && C.uhr.gueltig && Math.abs(B.zeit - A.zeit) < 30 && Math.abs(C.zeit - A.zeit) < 30, `Uhr-Abgleich in der Lobby: B ${(B.zeit - A.zeit).toFixed(1)} ms, C ${(C.zeit - A.zeit).toFixed(1)} ms`);
  if (lat) ok(W.N.zaehler.verloren > 0, `Fake-Netz hat ${W.N.zaehler.verloren} von ${W.N.zaehler.gesendet} Paketen verloren – Lobby trotzdem vollständig`);
}

// ---------- Raum voll ----------
{
  const W = welt({ latenz: 20 });
  const A = spieler(W, 'a', { gastgeber: true });
  for (const id of 'bcd') { spieler(W, id); lauf(W, 400); }
  const E = spieler(W, 'e'); lauf(W, 1500);
  ok(E.status === 'voll' && A.liste().length === 4 && !A.liste().some((m) => m.sid === 'sid-e'), `5. Mensch: „Raum voll“ (Gastgeber zählt ${A.liste().length})`);
}

// ---------- Start, Fahren, Ziel ----------
function rennen(lat, jit, verl, seed = 5) {
  const W = welt({ latenz: lat, jitter: jit, verlust: verl, seed });
  const A = spieler(W, 'a', { gastgeber: true, uhr: 1000 }), B = spieler(W, 'b', { uhr: 777777, gang: 3e-5 }), C = spieler(W, 'c', { uhr: 31337, gang: -2e-5 });
  lauf(W, 200); lauf(W, 3000);
  const los = {}, startAt = {};
  for (const s of [A, B, C]) s.on('start', (t) => { startAt[s._id] = t; });
  A.starten({ ki: 0 });
  // „Los!“ = erste Abtastung mit Sitzungszeit ≥ startAt (wahre Zeit des Fake-Netzes, 1-ms-Raster)
  for (let t = 0; t < SITZUNG.vorlauf + 1500; t++) {
    W.N.schritt(1);
    for (const s of [A, B, C]) { if (t % 5 === 0) s.takt(); if (startAt[s._id] != null && los[s._id] == null && s.zeit >= startAt[s._id]) los[s._id] = W.N.zeit; }
  }
  const ts = Object.values(los), spanne = Math.max(...ts) - Math.min(...ts);
  // Fahren: 20 Hz Zustand, Empfänger tastet je 16 ms ab und vergleicht mit der Wahrheit zur gezeigten Zeit
  const t0 = W.N.zeit;
  let maxErr = 0, n = 0, letztS = -1e9;
  const sp = [A, B, C];
  lauf(W, 8000, (now) => {
    const tt = (now - t0) / 1000;
    if (now - letztS >= 50) { letztS = now; sp.forEach((s, k) => s.sendeZustand(wahr(k, tt))); }
    if (now % 15 === 0 && tt > 1) {
      for (const s of sp) for (const f of s.fremdeListe()) {
        const o = s.lage(f.key), k = sp.findIndex((x) => x.pid === f.pid);
        const tr = (f.puffer.letztT - (s.zeit - (now - t0))) / 1000;   // gezeigte Zeit in Rennsekunden
        const w = wahr(k, tr);
        maxErr = Math.max(maxErr, Math.hypot(o.px - w.px, o.pz - w.pz)); n++;
      }
    }
  });
  const fremdOk = sp.every((s) => s.fremdeListe().length === 2);
  // Ziel: C, A, B in dieser Reihenfolge
  C.zielMelden(61.234, { strafen: 0 }); lauf(W, 400);
  A.zielMelden(62.5); lauf(W, 300);
  B.zielMelden(70.01, { strafen: 1 }); lauf(W, 3000);
  return { W, A, B, C, spanne, los, startAt, maxErr, n, fremdOk };
}
for (const [lat, jit, verl] of [[0, 0, 0], [25, 10, 0.05], [75, 30, 0.05], [75, 60, 0.05]]) {
  const r = rennen(lat, jit, verl, 5 + lat + jit);
  const { A, B, C } = r;
  ok(r.spanne <= 50 && Object.keys(r.los).length === 3, `Start Ping ${2 * lat} ±${jit}, ${verl * 100} % Verlust: „Los!“ auf 3 Geräten innerhalb ${r.spanne.toFixed(0)} ms (Grenze 50)`);
  // Fehler enthält den Uhrfehler zwischen Sender und Empfänger × Tempo (40 m/s: 1 m = 25 ms) – zeitlich verschoben, nicht sichtbar
  ok(r.fremdOk && r.maxErr < 1, `Fahren: je Gerät 2 fremde Autos, Lage-Fehler zur gezeigten Zeit max ${r.maxErr.toFixed(3)} m (inkl. Uhrfehler × 40 m/s; ${r.n} Proben)`);
  const tab = (s) => (s.lobby.ergebnis || []).map((e) => `${e.platz}.${e.name} ${e.zeit}`).join(' | ');
  ok([A, B, C].every((s) => s.lobby.phase === 'ergebnis' && tab(s) === tab(A)) && tab(A) === '1.C 61.234 | 2.A 62.5 | 3.B 70.01', `Zieltabelle bei allen gleich: ${tab(A)}`);
  ok(Object.values(A.lobby.ziel).every((z) => z.sz > A.lobby.startAt && z.bestaetigt >= z.sz - SITZUNG.ziel.spaet), 'Zieleinläufe mit Zeitstempel in Gastgeber-Uhr bestätigt');
}

// ---------- Streuung: 12 Zufalls-Netze bei 150 ms ±60 und 5 % Verlust ----------
{
  let schlecht = 0, maxSp = 0;
  for (let seed = 100; seed < 112; seed++) {
    const r = rennen(75, 60, 0.05, seed);
    const tab = (x) => (x.lobby.ergebnis || []).map((e) => e.id).join(',');
    maxSp = Math.max(maxSp, r.spanne);
    if (r.spanne > 50 || !r.fremdOk || tab(r.A) !== 'sid-c,sid-a,sid-b' || tab(r.B) !== tab(r.A) || tab(r.C) !== tab(r.A)) schlecht++;
  }
  ok(schlecht === 0, `12 Zufalls-Netze (150 ms ±60, 5 % Verlust): alle gestartet innerhalb ${maxSp.toFixed(0)} ms, Tabelle überall gleich (${schlecht} Ausreißer)`);
}

// ---------- Revanche: gleicher Raum, neuer Countdown ----------
{
  const r = rennen(25, 10, 0, 9);
  const { W, A, B, C } = r;
  let starts = 0; for (const s of [B, C]) s.on('start', () => starts++);
  const id0 = A.lobby.rennId;
  A.starten(); lauf(W, 1500);
  ok(starts === 2 && [A, B, C].every((s) => s.lobby.rennId === id0 + 1 && s.lobby.phase === 'rennen' && Object.keys(s.lobby.ziel).length === 0), 'Revanche: neues Rennen (neue Nummer, Ziele leer) bei allen');
}

// ---------- KI-Gegner: Gastgeber trägt sie ein; Tabelle wartet auf sie ----------
{
  const W = welt({ latenz: 25 });
  const A = spieler(W, 'a', { gastgeber: true }), B = spieler(W, 'b');
  lauf(W, 1500);
  A.opt.rest = () => [{ id: 'ki-2', fortschritt: 900, ki: true, name: 'Rosa' }];
  A.starten({}, ['ki-1', 'ki-2']);
  lauf(W, 4000);
  A.zielMelden(50); B.zielMelden(55); A.zielEintragen('ki-1', 52, {}); lauf(W, 1000);
  const offen = A.lobby.phase === 'rennen';
  A.zielEintragen('ki-2', 58); lauf(W, 1000);
  const tab = B.lobby.ergebnis?.map((e) => e.id).join(',');
  ok(offen && tab === 'sid-a,ki-1,sid-b,ki-2', `KI: Tabelle wartet auf alle KI, dann ${tab}`);
}
// Aufgeben: zählt als fertig (Tabelle wartet nicht 45 s), steht hinter den Fahrenden als „aufgabe“; Gastgeber gibt auf →
// seine KI endet (kiAktiv aus)
{
  const W = welt({ latenz: 25 });
  const A = spieler(W, 'a', { gastgeber: true }), B = spieler(W, 'b'), C = spieler(W, 'c');
  lauf(W, 1500); A.starten({}, ['ki-1']); lauf(W, 4000);
  B.aufgeben({ stufe: 'easy' }); lauf(W, 500);
  const zwischen = A.lobby.phase;
  A.zielMelden(50); C.zielMelden(60); A.zielEintragen('ki-1', 55); lauf(W, 1500);
  const E = C.lobby.ergebnis || [];
  ok(zwischen === 'rennen' && E.map((e) => e.id).join(',') === 'sid-a,ki-1,sid-c,sid-b' && E[3].aufgabe && E[3].zeit == null, `Aufgeben: Tabelle sofort nach den anderen, Aufgeber hinten (${E.map((e) => e.id + (e.aufgabe ? '🏳' : '')).join(',')})`);
  const W2 = welt({ latenz: 25 });
  const A2 = spieler(W2, 'a', { gastgeber: true }), B2 = spieler(W2, 'b');
  lauf(W2, 1500); A2.starten({}, ['ki-1']); lauf(W2, 4000); A2.aufgeben(); lauf(W2, 300); B2.zielMelden(61); lauf(W2, 1500);
  const E2 = B2.lobby.ergebnis || [];
  ok(!A2.lobby.kiAktiv && E2.map((e) => e.id + (e.aufgabe ? '🏳' : e.weg ? '✗' : '')).join(',') === 'sid-b,sid-a🏳,ki-1✗', `Gastgeber gibt auf → KI endet, Tabelle ohne Warten (${E2.map((e) => e.id + (e.aufgabe ? '🏳' : e.weg ? '✗' : '')).join(',')})`);
}
// KI des Gastgebers ohne Zieleintrag (Gastgeber-Wechsel): Name über opt.nameVon (Spiel kennt die KI-Liste)
{
  const W = welt({ latenz: 25 });
  const A = spieler(W, 'a', { gastgeber: true });
  A.opt.nameVon = (id) => (id === 'ki-9' ? 'Rita' : null);
  lauf(W, 500); A.starten({}, ['ki-9']); lauf(W, 4000); A.zielMelden(50); A.abschliessen(); lauf(W, 200);
  const e = (A.lobby.ergebnis || []).find((x) => x.id === 'ki-9');
  ok(e && e.name === 'Rita' && e.weg && e.ki, `KI ohne Ziel: Name aus nameVon, weg, ki (${JSON.stringify(e)})`);
}

// ---------- Gastgeber geht mitten im Rennen ----------
for (const art of ['verlassen', 'wegreissen']) {
  const W = welt({ latenz: 50, jitter: 20, verlust: 0.05, seed: 21 });
  const A = spieler(W, 'a', { gastgeber: true }), B = spieler(W, 'b', { uhr: 5e5 });
  lauf(W, 800);
  const C = spieler(W, 'c', { uhr: 9e5 });
  lauf(W, 3000);
  A.starten(); lauf(W, 5000);
  let wechsel = 0; for (const s of [B, C]) s.on('gastgeber', () => wechsel++);
  // Uhr beobachten: Unterschied B–C und Sprung der Sitzungszeit gegen die wahre Zeit
  let maxD = 0, maxSprung = 0, prevB = null;
  if (art === 'verlassen') A.verlassen(); else W.N.wegreissen('a');
  lauf(W, 6000, (now) => {
    maxD = Math.max(maxD, Math.abs(B.zeit - C.zeit));
    if (prevB) maxSprung = Math.max(maxSprung, Math.abs((B.zeit - prevB.z) - (now - prevB.n)));
    prevB = { z: B.zeit, n: now };
  });
  ok(B.istGastgeber && C.lobby.host === 'sid-b' && !C.istGastgeber && B.lobby.ep === 2 && C.lobby.ep === 2, `Gastgeber ${art}: Nr. 2 (B) übernimmt bei allen (Epoche ${C.lobby.ep})`);
  ok(maxD < 50 && maxSprung < 5, `… Sitzungsuhr läuft weiter: B–C max ${maxD.toFixed(1)} ms, kein Sprung (${maxSprung.toFixed(2)} ms)`);
  C.zielMelden(80); B.zielMelden(81); lauf(W, 2000);
  ok(C.lobby.phase === 'ergebnis' && C.lobby.ergebnis.map((e) => e.id + (e.weg ? '(weg)' : '')).join(',') === 'sid-c,sid-b,sid-a(weg)', `… neuer Gastgeber bestätigt Ziele, Tabelle: ${C.lobby.ergebnis?.map((e) => e.id + (e.weg ? '(weg)' : '')).join(', ')}`);
}

// ---------- Zieleinlauf, kurz bevor der Gastgeber geht (Bestätigung fehlt) ----------
{
  const W = welt({ latenz: 60, seed: 4 });
  const A = spieler(W, 'a', { gastgeber: true }), B = spieler(W, 'b'); lauf(W, 600);
  const C = spieler(W, 'c');
  lauf(W, 2000); A.starten(); lauf(W, 4000);
  C.zielMelden(40.5); W.N.wegreissen('a');      // Meldung unterwegs, Gastgeber weg
  lauf(W, 5000);
  ok(B.istGastgeber && B.lobby.ziel['sid-c']?.zeit === 40.5, 'Ziel ohne Bestätigung wird beim neuen Gastgeber nachgemeldet');
}

// ---------- Gast bricht ab, Stille-Hinweis, Neu-Verbinden mit gleichem Platz ----------
{
  const W = welt({ latenz: 30, abgangVerzug: 4000 });
  const A = spieler(W, 'a', { gastgeber: true }), B = spieler(W, 'b'), C = spieler(W, 'c');
  lauf(W, 2000);
  A.starten(); lauf(W, 4000, () => { for (const s of [A, B, C]) if (s._tr.aktiv) s.sendeZustand(wahr(0, 1)); });
  const still = [], weg = [];
  A.on('still', (m, s) => s && still.push(m.sid)); A.on('weg', (m) => weg.push(m.sid)); B.on('weg', (m) => weg.push('B:' + m.sid));
  W.N.wegreissen('c');
  lauf(W, 3500, () => { for (const s of [A, B]) s.sendeZustand(wahr(0, 1)); });
  const stillVorWeg = still.includes('sid-c') && !weg.length;
  lauf(W, 1500);
  ok(stillVorWeg && weg.includes('sid-c') && weg.includes('B:sid-c') && !A.fremdeListe().some((f) => f.sid === 'sid-c'), 'Gast weg: erst „still“ (3 s), dann „weg“ bei allen, sein Auto verschwindet');
  // C kommt zurück (App aus dem Hintergrund): neuer Transport, gleiche sid
  const t2 = W.N.teilnehmer('c2', { uhr: 4242 });
  C.neuVerbinden(t2); C._tr = t2;
  lauf(W, 3000);
  const nr = A.liste().find((m) => m.sid === 'sid-c')?.nummer;
  ok(nr === 3 && C.ich().nummer === 3 && C.lobby.host === 'sid-a' && !C.istGastgeber && C.uhr.gueltig && A.liste().length === 3, `Neu verbunden: gleicher Platz (Nr. ${nr}), Rolle Gast, Uhr wieder abgeglichen`);
}

// ---------- Gastgeber kommt nach Hintergrund zurück: holt sich die Rolle nicht zurück ----------
{
  const W = welt({ latenz: 30, abgangVerzug: 2000 });
  const A = spieler(W, 'a', { gastgeber: true }), B = spieler(W, 'b');
  lauf(W, 2000);
  W.N.wegreissen('a'); lauf(W, 3000);
  const t2 = W.N.teilnehmer('a2'); A.neuVerbinden(t2); A._tr = t2;
  lauf(W, 4000);
  ok(B.istGastgeber && !A.istGastgeber && A.lobby.host === 'sid-b' && A.ich().nummer === 1, 'alter Gastgeber kommt zurück → bleibt Gast (Nr. 1), B bleibt Gastgeber');
}

// ---------- Raum nicht gefunden / Verbindung blockiert / zwei Gastgeber ----------
{
  const W = welt();
  const B = spieler(W, 'b'); let st = null; B.on('status', (s) => { st = s; });
  lauf(W, SITZUNG.suchen + 500);
  ok(st === 'niemand', 'Beitreten ohne Gastgeber: nach 10 s „Raum nicht gefunden“');
  const W2 = welt({ latenz: 20 });
  W2.N.sperren('a', 'b');
  const A2 = spieler(W2, 'a', { gastgeber: true }), B2 = spieler(W2, 'b');
  const fe = []; B2.on('fehler', (e) => fe.push(e.art));
  lauf(W2, 10000);
  ok(fe.includes('p2p') && B2.status === 'verbinde', 'direkte Verbindung blockiert → Fehler „p2p“ (Spiel zeigt: Netz blockiert direkte Verbindung – WLAN probieren)');
  const W3 = welt({ latenz: 20 });
  const X = spieler(W3, 'a', { gastgeber: true }), Y = spieler(W3, 'b', { gastgeber: true });
  lauf(W3, 3000);
  ok(X.istGastgeber !== Y.istGastgeber && X.lobby.host === Y.lobby.host && X.liste().length === 2 && Y.liste().length === 2, `zwei Gastgeber im selben Raum → einer bleibt (${X.lobby.host}), beide sehen 2 Mitglieder`);
}

// ---------- Bandbreite ----------
{
  const r = rennen(25, 5, 0, 77);
  const s = r.W.N.zaehler;
  ok(s.bytes / 3 / ((r.W.N.zeit) / 1000) < 3000, `Netzlast je Gerät ≈ ${(s.bytes / 3 / (r.W.N.zeit / 1000) / 1000).toFixed(2)} kB/s (3 Spieler, 20 Hz, ohne Trystero-Rahmen)`);
}

console.log(bad ? `${bad} FEHLER` : 'alle Sitzungs-Tests OK');
process.exit(bad ? 1 : 0);
