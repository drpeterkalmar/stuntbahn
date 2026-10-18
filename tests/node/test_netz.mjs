// n35 Netz-Kern ohne Sitzung: Raumcode, Binär-Pakete, Uhr-Abgleich über das Fake-Netz, Interpolations-Puffer
// (glatt und genau bei 0/50/150 ms Ping, Schwankung, 5 % Verlust, Funkloch, Sprung nach Reset).
import { ALPHABET, neuerCode, normalisieren, codeAusUrl, teilenLink, vorlesbar } from '../../src/net/code.js';
import { schema, packeEinzel, packeSammel, entpacke, neuer, zeitVoll } from '../../src/net/paket.js';
import { UhrAbgleich } from '../../src/net/uhr.js';
import { FremdPuffer, qwinkel } from '../../src/net/puffer.js';
import { FakeNetz, mulberry } from '../../src/net/fake.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

// ---------- Raumcode ----------
{
  ok(![...'0O1lIL'].some((c) => ALPHABET.includes(c)) && ALPHABET.length === 31 && new Set(ALPHABET).size === 31, 'Alphabet ohne 0/O/1/l/I/L, 31 Zeichen');
  const r = mulberry(7), codes = new Set();
  for (let i = 0; i < 2000; i++) codes.add(neuerCode(r));
  ok([...codes].every((c) => c.length === 4 && [...c].every((ch) => ALPHABET.includes(ch))) && codes.size > 1990, `2000 Codes gültig, ${codes.size} verschieden`);
  ok(normalisieren(' ab-cd ') === 'ABCD' && normalisieren('abc de') === 'ABCDE' && normalisieren('AB0D') === null && normalisieren('ABC') === null && normalisieren('ABCDEF') === null && normalisieren(null) === null, 'Eingabe säubern (klein, Leerzeichen, Bindestrich; 0 und Länge abgelehnt)');
  ok(codeAusUrl('?raum=wxyz&x=1') === 'WXYZ' && codeAusUrl('?x=1') === null && codeAusUrl('?raum=W0YZ') === null, 'Code aus ?raum=');
  const L = teilenLink('QRST', 'https://drpeterkalmar.github.io/stuntbahn/?raum=AAAA&gegner=3#x');
  ok(L === 'https://drpeterkalmar.github.io/stuntbahn/?raum=QRST', 'Teilen-Link kurz (nur ?raum=), ersetzt alten Raum, ohne #: ' + L);
  const L2 = teilenLink('QRST', 'http://127.0.0.1:8000/index.html?nosw&seed=4&netz=bc&netzlag=25&raum=AAAA');
  ok(L2 === 'http://127.0.0.1:8000/index.html?nosw=&netz=bc&netzlag=25&raum=QRST', 'Test-Link behält Netz-Regler und nosw: ' + L2);
  ok(vorlesbar('ABCD') === 'AB-CD' && vorlesbar('ABCDE') === 'ABC-DE', 'vorlesbar AB-CD');
}

// ---------- Pakete ----------
const S = schema([['px', 'f32'], ['py', 'f32'], ['pz', 'f32'], ['q', 'quat'], ['vx', 'i16', 0.01], ['vy', 'i16', 0.01], ['vz', 'i16', 0.01],
  ['lenk', 'i8', 1 / 127], ['gas', 'u8', 1 / 255], ['f', 'bits', ['nitro', 'crash', 'luft']], ['sprung', 'u8'], ['fort', 'f32']]);
{
  ok(S.groesse === 12 + 7 + 6 + 1 + 1 + 1 + 1 + 4, `Datensatz ${S.groesse} Byte`);
  const r = mulberry(3);
  let maxP = 0, maxW = 0, maxV = 0;
  for (let i = 0; i < 500; i++) {
    const q = [r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5], l = Math.hypot(...q);
    const o = { px: (r() - 0.5) * 8000, py: r() * 300, pz: (r() - 0.5) * 8000, q: { x: q[0] / l, y: q[1] / l, z: q[2] / l, w: q[3] / l }, vx: (r() - 0.5) * 180, vy: (r() - 0.5) * 60, vz: (r() - 0.5) * 180, lenk: r() * 2 - 1, gas: r(), f: { nitro: r() < 0.5, crash: r() < 0.5, luft: r() < 0.5 }, sprung: i & 255, fort: r() * 30000 };
    const b = packeEinzel(S, i, 123456 + i, o), P = entpacke(S, b), d = P.saetze[0];
    maxP = Math.max(maxP, Math.abs(d.px - o.px), Math.abs(d.pz - o.pz));
    maxW = Math.max(maxW, qwinkel([d.q.x, d.q.y, d.q.z, d.q.w], q.map((v) => v / l)));
    maxV = Math.max(maxV, Math.abs(d.vx - o.vx), Math.abs(d.vz - o.vz));
    if (P.seq !== i || P.t !== 123456 + i || d.sprung !== (i & 255) || d.f.nitro !== o.f.nitro || d.f.crash !== o.f.crash || Math.abs(d.lenk - o.lenk) > 0.005 || Math.abs(d.gas - o.gas) > 0.003) { maxP = Infinity; break; }
  }
  ok(maxP < 0.001 && maxV <= 0.005 + 1e-9 && maxW < 0.01 * Math.PI / 180, `500 Zufalls-Zustände: Lage ±${maxP.toExponential(1)} m, Tempo ±${maxV.toFixed(4)} m/s, Drehung ${(maxW * 180 / Math.PI).toFixed(4)}°`);
  const b = packeEinzel(S, 1, 0, { px: 0, py: 0, pz: 0, q: { x: 0, y: 0, z: 0, w: 1 }, vx: 999, vy: -999, vz: 0, lenk: 3, gas: -1, f: {}, sprung: 300, fort: 0 });
  const d = entpacke(S, b).saetze[0];
  ok(Math.abs(d.vx - 327.67) < 1e-6 && Math.abs(d.vy + 327.67) < 1e-6 && Math.abs(d.lenk - 1) < 1e-9 && d.gas === 0 && d.sprung === 255, 'Werte außerhalb des Bereichs werden begrenzt (kein Überlauf)');
  const sam = packeSammel(S, 9, 5000, [1, 2, 3, 4, 5].map((p) => ({ platz: p, px: p, py: 0, pz: -p, q: { x: 0, y: 0, z: 0, w: 1 }, vx: 0, vy: 0, vz: 0, lenk: 0, gas: 0, f: {}, sprung: 0, fort: p * 10 })));
  const P = entpacke(S, sam);
  ok(P.typ === 2 && P.saetze.length === 5 && P.saetze.every((x, k) => x.platz === k + 1 && x.px === k + 1 && x.fort === (k + 1) * 10) && sam.length === 8 + 5 * (1 + S.groesse), `Sammelpaket 5 KI-Autos: ${sam.length} Byte`);
  ok(entpacke(S, new Uint8Array(3)) === null && entpacke(S, sam.slice(0, 20)) === null, 'kaputte/kurze Pakete → null');
  ok(neuer(1, 0) && !neuer(0, 1) && neuer(2, 65535) && !neuer(65535, 2) && !neuer(5, 5) && neuer(0, null), 'Folgenummer mit Überlauf');
  const M = 2 ** 32;
  ok(zeitVoll(10, M + 5) === M + 10 && zeitVoll(M - 10, M + 5) === M - 10 && zeitVoll(1234, 1000) === 1234, 'Zeit über den 32-bit-Überlauf');
  // Bandbreite: 20 Hz × (Kopf 7 + Satz) ≈ kB/s je Mitspieler
  ok(20 * (7 + S.groesse) < 1000, `Zustand 20 Hz: ${20 * (7 + S.groesse)} B/s je Auto (+ Trystero-Rahmen)`);
}

// ---------- Uhr-Abgleich über das Fake-Netz ----------
// Gastgeber-Uhr = Sitzungsuhr; Gast mit 12,345 s Versatz und Gangfehler. Proben im Abstand der Uhr selbst.
function uhrTest(latenz, jitter, asym = 0, verlust = 0, dauer = 8000) {
  const N = new FakeNetz({ latenz, jitter, asym, verlust, seed: 11 + latenz });
  const H = N.teilnehmer('a', { uhr: 0 }), G = N.teilnehmer('b', { uhr: 12345.6, gang: 2e-5 });
  const U = new UhrAbgleich(G.jetzt);
  H.bei('m', (d, von) => { if (d.k === 'p') H.senden('m', { k: 'P', a: d.a, h: H.jetzt() }, von); });
  G.bei('m', (d) => { if (d.k === 'P') U.probe(d.a, d.h); });
  let tp = -1e9, maxF = 0, fehler = [];
  for (let t = 0; t < dauer; t += 5) {
    N.schritt(5);
    if (G.peers().length && G.jetzt() - tp >= U.abstand()) { tp = G.jetzt(); G.senden('m', { k: 'p', a: tp }); }
    if (U.gueltig && N.zeit > 1500) { const f = U.zeit() - H.jetzt(); fehler.push(Math.abs(f)); maxF = Math.max(maxF, Math.abs(f)); }
  }
  return { maxF, mittel: fehler.reduce((a, b) => a + b, 0) / Math.max(1, fehler.length), rtt: U.rtt };
}
for (const [lat, jit, asym, verl] of [[0, 0, 0, 0], [25, 5, 0, 0], [75, 20, 0, 0.05], [75, 40, 0.3, 0.05], [150, 60, 0.2, 0.05]]) {
  const r = uhrTest(lat, jit, asym, verl);
  const grenze = lat === 0 ? 2 : 50;
  ok(r.maxF <= grenze, `Uhr-Abgleich Ping ${2 * lat} ms ±${jit} Schwankung, Rückweg +${asym * 100} %, ${verl * 100} % Verlust: Fehler max ${f1(r.maxF)} ms, Mittel ${f1(r.mittel)} ms (Grenze ±${grenze})`);
}

// ---------- Interpolations-Puffer ----------
// Wahre Fahrt: Achterbahn-artig (Acht, 35–55 m/s), mit Sprung (ballistisch) und einem Reset (Teleport) bei 14 s
function wahr(t) {
  const w = 0.22, R = 160;
  let x = R * Math.sin(w * t), z = 0.5 * R * Math.sin(2 * w * t), y = 2;
  let vx = R * w * Math.cos(w * t), vz = R * w * Math.cos(2 * w * t), vy = 0;
  if (t > 6 && t < 8) { const u = t - 6; y = 2 + 9.81 * u - 4.905 * u * u; vy = 9.81 - 9.81 * u; }   // Sprung 2 s, 4,9 m hoch
  let sprung = 0;
  if (t >= 14) { x += 300; sprung = 1; }
  const yaw = Math.atan2(vx, vz), pitch = Math.atan2(vy, Math.hypot(vx, vz)) * 0.5;
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(-pitch / 2), sp = Math.sin(-pitch / 2);
  const q = { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp };
  return { px: x, py: y, pz: z, vx, vy, vz, q, sprung };
}
// Sender 20 Hz → Netz (Laufzeit, Schwankung, Verlust, Funkloch) → Empfänger 60 Hz; Uhrfehler ε
function pufferTest({ latenz = 0, jitter = 0, verlust = 0, hz = 20, eps = 0, loch = null, dauer = 20, voraus = 0 }) {
  const r = mulberry(5 + latenz + jitter);
  const P = new FremdPuffer();
  const post = [];
  for (let t = 0.2; t < dauer; t += 1 / hz) {
    if (r() < verlust) continue;
    if (loch && t > loch[0] && t < loch[1]) continue;
    const an = t * 1000 + latenz + (r() * 2 - 1) * jitter;
    post.push({ an: Math.max(t * 1000, an), t: t * 1000 + eps, d: wahr(t) });
  }
  post.sort((a, b) => a.an - b.an);
  let k = 0, prev = null, prev2 = null, wPrev = null, maxErr = 0, sumErr = 0, n = 0, ruck = 0, maxRuck = 0, maxW = 0, verzug = [], satz = 0;
  const dtF = 1000 / 60, err = [];
  for (let now = 500; now < dauer * 1000; now += dtF) {
    while (k < post.length && post[k].an <= now) { P.rein(post[k].t, post[k].d, post[k].an + eps); k++; }
    const o = P.abtasten(now + eps, voraus);
    if (!o) continue;
    // Vergleichszeit: gezeigte Pufferzeit bzw. (vorausgerechnet) um den Verzug später
    const tr = (P.letztT - eps + (voraus ? voraus * Math.min(P.verzug, 250) : 0)) / 1000, W = wahr(tr);
    const p = [o.px, o.py, o.pz];
    // Fehler gegen die Wahrheit zur gezeigten Zeit (ohne die Sekunde um den Sprung/Reset)
    // Wahrheit selbst unstetig: Absprung/Landung (6 s, 8 s), Reset (14 s) – dort nur Sprünge zählen
    const nahReset = Math.abs(tr - 14) < 0.6 || Math.abs(tr - 6) < 0.3 || Math.abs(tr - 8) < 0.3, imLoch = loch && tr > loch[0] - 0.1 && tr < loch[1] + 0.6;
    if (!nahReset && !imLoch) {
      const e = Math.hypot(o.px - W.px, o.py - W.py, o.pz - W.pz);
      err.push(e); maxErr = Math.max(maxErr, e); sumErr += e; n++;
      maxW = Math.max(maxW, qwinkel([o.q.x, o.q.y, o.q.z, o.q.w], [W.q.x, W.q.y, W.q.z, W.q.w]));
    }
    // Glätte: Beschleunigung aus der zweiten Differenz der gezeigten Lage; wahre Fahrt hat höchstens ~12 m/s²
    if (prev && prev2 && !nahReset && !imLoch) {
      const a = Math.hypot(p[0] - 2 * prev[0] + prev2[0], p[1] - 2 * prev[1] + prev2[1], p[2] - 2 * prev[2] + prev2[2]) / (dtF / 1000) ** 2;
      maxRuck = Math.max(maxRuck, a); if (a > 40) ruck++;
    }
    // Satz je Bild: gezeigte Bewegung minus wahre Bewegung (m) – außer am Reset
    if (prev && wPrev && !nahReset) satz = Math.max(satz, Math.hypot(p[0] - prev[0] - (W.px - wPrev.px), p[1] - prev[1] - (W.py - wPrev.py), p[2] - prev[2] - (W.pz - wPrev.pz)));
    prev2 = prev; prev = p; wPrev = W;
    verzug.push(P.verzug);
  }
  err.sort((a, b) => a - b);
  return { maxErr, mittel: sumErr / n, p99: err[Math.floor(err.length * 0.99)], ruck, maxRuck, maxW: maxW * 180 / Math.PI, verzug: verzug[verzug.length - 1], art: P.art, satz };
}
for (const [lat, jit, verl, grenzeM] of [[0, 0, 0, 0.05], [25, 5, 0, 0.05], [75, 15, 0.05, 0.3], [75, 40, 0.05, 0.5]]) {
  const r = pufferTest({ latenz: lat, jitter: jit, verlust: verl });
  ok(r.mittel < grenzeM && r.ruck === 0 && r.maxW < 2 && r.satz < 0.3, `Puffer Ping ${2 * lat} ms ±${jit}, ${verl * 100} % Verlust: Fehler Mittel ${r.mittel.toFixed(3)} m, 99 % ${r.p99.toFixed(2)} m, max ${r.maxErr.toFixed(2)} m, Drehung max ${r.maxW.toFixed(2)}°, Ruckler ${r.ruck} (max ${f1(r.maxRuck)} m/s²), Satz max ${r.satz.toFixed(2)} m, Verzug ${Math.round(r.verzug)} ms`);
}
{
  // 150 ms Ping, starke Schwankung: Verzug wächst mit, bleibt glatt
  const r = pufferTest({ latenz: 75, jitter: 60, verlust: 0.05 });
  ok(r.mittel < 0.6 && r.ruck === 0 && r.satz < 0.3 && r.verzug >= 100 && r.verzug <= 300, `Puffer 150 ms ±60: Fehler Mittel ${r.mittel.toFixed(3)} m, 99 % ${r.p99.toFixed(2)} m, Ruckler ${r.ruck}, Satz ${r.satz.toFixed(2)} m, Verzug ${Math.round(r.verzug)} ms`);
  // Uhrfehler 30 ms (Abgleich ungenau): verschiebt nur die Zeit, bleibt glatt
  const e = pufferTest({ latenz: 25, jitter: 10, eps: 30 });
  ok(e.ruck === 0 && e.mittel < 0.1, `Puffer mit 30 ms Uhrfehler: glatt (Ruckler ${e.ruck}), Fehler ${e.mittel.toFixed(3)} m`);
  // Funkloch 0,3 s: extrapoliert, danach ohne Sprung zurück (Fehler wird ausgeblendet: Satz je Bild klein)
  const l = pufferTest({ latenz: 25, jitter: 5, loch: [9.0, 9.3] });
  ok(l.satz < 0.6 && l.mittel < 0.1, `Funkloch 0,3 s: größter Satz je Bild ${l.satz.toFixed(2)} m, Fehler außerhalb ${l.mittel.toFixed(3)} m`);
  // Funkloch 0,6 s: 250 ms extrapoliert, dann steht das Auto; danach holt es auf (Fehler > 8 m → einmal Sprung)
  const l2 = pufferTest({ latenz: 25, jitter: 5, loch: [9.0, 9.6] });
  ok(l2.mittel < 0.1 && l2.art === 'interp', `Funkloch 0,6 s: Satz ${l2.satz.toFixed(1)} m (sichtbar, ehrlich), danach wieder genau (${l2.mittel.toFixed(3)} m)`);
  // Vorausrechnen um den Verzug (Kollision/Anzeige „wo das Auto jetzt ist“): stetig, kleiner Fehler gegen die Wahrheit JETZT
  for (const [lat, jit] of [[25, 5], [75, 30]]) {
    const v = pufferTest({ latenz: lat, jitter: jit, verlust: 0.05, voraus: 1 });
    // Ruckler hier nur winzig: beim Wechsel Extrapolation → Interpolation (Paket verspätet) ändert sich das Tempo um wenige
    // Zehntel m/s, × Verzug = wenige cm Satz (Beschleunigung im 60-Hz-Bild > 40 m/s², sichtbar ist das nicht)
    ok(v.satz < 0.15 && v.mittel < 0.6 && v.maxW < 3, `vorausgerechnet Ping ${2 * lat} ±${jit}: Fehler zur Wahrheit jetzt Mittel ${v.mittel.toFixed(2)} m, 99 % ${v.p99.toFixed(2)} m, Drehung max ${v.maxW.toFixed(1)}°, größter Satz je Bild ${v.satz.toFixed(3)} m`);
  }
  // 10 Hz statt 20 Hz (z. B. KI-Autos): noch brauchbar
  const z = pufferTest({ latenz: 25, jitter: 5, hz: 10 });
  ok(z.mittel < 0.3 && z.ruck === 0, `10 Hz: Fehler Mittel ${z.mittel.toFixed(3)} m, max ${z.maxErr.toFixed(2)} m`);
}
{
  // Reset (Sprungzähler): keine Interpolation über 300 m, Lage springt genau einmal
  const P = new FremdPuffer();
  for (let t = 0; t <= 2000; t += 50) { const d = wahr(13 + t / 1000); P.rein(t, d, t + 30); }
  let spruenge = 0, prev = null, zwischen = 0;
  for (let now = 130; now < 2100; now += 1000 / 60) {
    const o = P.abtasten(now);
    if (prev && Math.hypot(o.px - prev.px, o.pz - prev.pz) > 50) spruenge++;
    const tr = 13 + P.letztT / 1000;
    if (Math.abs(tr - 14) > 0.02 && Math.abs(o.px - wahr(tr).px) > 2) zwischen++;   // weder vorher noch nachher
    prev = { px: o.px, pz: o.pz };
  }
  ok(spruenge === 1 && zwischen === 0, `Reset: genau ein Sprung, ${zwischen} Bilder dazwischen`);
  // Leer → null; ein Paket → steht dort; nur ein Paket und Zeit weiter → extrapoliert höchstens 250 ms
  const Q = new FremdPuffer();
  ok(Q.abtasten(0) === null, 'leerer Puffer → null');
  Q.rein(1000, { px: 0, py: 0, pz: 0, vx: 10, vy: 0, vz: 0, q: { x: 0, y: 0, z: 0, w: 1 }, sprung: 0 }, 1000);
  const o = Q.abtasten(5000);
  ok(Math.abs(o.px - 2.5) < 1e-9 && Q.art === 'halt', `Extrapolation gedeckelt: ${o.px.toFixed(2)} m nach 4 s (10 m/s × 0,25 s)`);
  // verspätetes Paket (vertauscht) wird einsortiert, doppeltes ignoriert
  const R = new FremdPuffer();
  const d = (x) => ({ px: x, py: 0, pz: 0, vx: 20, vy: 0, vz: 0, q: { x: 0, y: 0, z: 0, w: 1 }, sprung: 0 });
  R.rein(0, d(0), 10); R.rein(100, d(2), 110); R.rein(50, d(1), 120);
  ok(R.s.map((e) => e.t).join(',') === '0,50,100' && R.rein(50, d(1), 130) === false, 'vertauschte Pakete einsortiert, doppelte verworfen');
}

console.log(bad ? `${bad} FEHLER` : 'alle Netz-Kern-Tests OK');
process.exit(bad ? 1 : 0);
