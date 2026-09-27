// .TRK-Parser + Elementtabelle: Byte-Layout, Abdeckung aller Codes, Größen/Anschlüsse, Fehlermeldungen.
// Nur synthetische Daten (keine fremden Strecken im Repo).
import { parseTrk, writeTrk, trkHash, TrkError, TRK_BYTES } from '../../src/track/trk.js';
import { CODES, KINDS, TERRAIN, TRACK_CODES, SCENERY_CODES, placeElement, KIND_NAMES } from '../../src/track/trkelems.js';

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FEHLER', msg); } };
const throwsTrk = (fn, re, msg) => { try { fn(); ok(false, msg + ' (kein Fehler)'); } catch (e) { ok(e instanceof TrkError && re.test(e.message), msg + ' → ' + e.message); } };

// 1) Byte-Layout von Hand: Strecke Zeilen Süd→Nord, Gelände Nord→Süd, Horizont bei 0x384
{
  const b = new Uint8Array(TRK_BYTES);
  b[0] = 0x04;                    // Dateizeile 0, Spalte 0 = Südwest-Ecke (i=0, j=29)
  b[29 * 30 + 29] = 0x05;         // letzte Streckenzeile = Nordrand (i=29, j=0)
  b[0x384] = 3;                   // Horizont Stadt
  b[0x385] = 0x06;                // Gelände: erste Zeile = Nordrand (i=0, j=0)
  b[0x385 + 29 * 30 + 1] = 0x01;  // Gelände Südrand (i=1, j=29)
  b[0x709] = 153;                 // Füllbyte (Bliss)
  const t = parseTrk(b, 'X.TRK');
  ok(t.elem[29 * 30 + 0] === 0x04, 'Strecke: Dateizeile 0 ist Süden');
  ok(t.elem[0 * 30 + 29] === 0x05, 'Strecke: letzte Dateizeile ist Norden');
  ok(t.terr[0] === 0x06, 'Gelände: erste Zeile ist Norden');
  ok(t.terr[29 * 30 + 1] === 0x01, 'Gelände: letzte Zeile ist Süden');
  ok(t.horizon === 3 && t.extra === 153, 'Horizont/Füllbyte');
  ok(t.name === 'X', 'Name aus Dateiname');
  // Rundreise über writeTrk
  const b2 = writeTrk(t.elem, t.terr, t.horizon);
  ok(b2.length === TRK_BYTES && b2.every((v, k) => k === 0x709 || v === b[k]), 'writeTrk ist Umkehrung von parseTrk');
}

// 2) Tabelle: jeder Code 0x01–0xB5 und die Füllcodes genau einmal, keine unbekannten
{
  const all = [...CODES.keys()];
  ok(new Set(all).size === all.length, 'keine doppelten Codes');
  for (let c = 0x01; c <= 0xB5; c++) ok(CODES.has(c), 'Code fehlt: 0x' + c.toString(16));
  for (const c of [0xFD, 0xFE, 0xFF]) ok(CODES.get(c) && CODES.get(c).kind === 'filler', 'Füllcode 0x' + c.toString(16));
  ok(!CODES.has(0) && !CODES.has(0xB6) && !CODES.has(0xFC), 'Leer/intern nicht in der Tabelle');
  ok(SCENERY_CODES.length === 28, `28 Szenerie-Elemente (ist ${SCENERY_CODES.length})`);
  ok(TRACK_CODES.length === 151, `151 Strecken-Codes inkl. 3 zusätzlicher Start/Ziel-Richtungen (ist ${TRACK_CODES.length})`);
  for (const e of CODES.values()) ok(KIND_NAMES[e.kind], 'deutscher Name für ' + e.kind);
  ok(TERRAIN.length === 0x13, 'Geländecodes 0x00–0x12');
}

// 3) Größen (empirisch am Archiv bestätigt) und Anschlussseiten
{
  const size = (c) => placeElement(c, 5, 5).cells.length;
  for (const c of [0x40, 0x41, 0x55, 0x56]) ok(size(c) === 2, '2×1: 0x' + c.toString(16));
  for (const c of [0x0A, 0x14, 0x1E, 0x34, 0x69, 0x3C, 0x57, 0x75, 0x7C]) ok(size(c) === 4, '2×2: 0x' + c.toString(16));
  for (const c of [0x04, 0x06, 0x22, 0x24, 0x4A, 0x4F, 0x73]) ok(size(c) === 1, '1×1: 0x' + c.toString(16));
  // Anker = NW-Feld: 2×2 belegt (i..i+1, j..j+1)
  const cells = placeElement(0x0A, 5, 5).cells.map((c) => c.join(',')).sort().join(' ');
  ok(cells === '5,5 5,6 6,5 6,6', '2×2 ab NW-Anker');
  // Seiten einer Kurve: Code 0x06 = enge Kurve S–E: Einfahrt von Süden (Richtung N) → Ausfahrt nach Osten
  // Einfahrtsseiten (0 E, 1 S, 2 W, 3 N): S–E-Kurve wird von S (Fahrt nach N) oder E (Fahrt nach W) befahren
  const entry = (c) => new Set(placeElement(c, 5, 5).routes.map((r) => (r.d + 2) % 4));
  const eq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  ok(eq(entry(0x06), new Set([1, 0])), '0x06 verbindet S und E');
  ok(eq(entry(0x07), new Set([2, 1])), '0x07 verbindet W und S');
  ok(eq(entry(0x08), new Set([3, 0])), '0x08 verbindet N und E');
  ok(eq(entry(0x09), new Set([2, 3])), '0x09 verbindet W und N');
  ok(eq(entry(0x4A), new Set([0, 1, 2, 3])), 'Kreuzung: alle vier Seiten');
  // Start/Ziel 0x01 = Fahrtrichtung Nord (Weg d=3 vorwärts)
  ok(placeElement(0x01, 5, 5).routes.find((r) => !r.rev).d === 3, 'Start/Ziel 0x01 fährt nach Norden');
  ok(placeElement(0xB4, 5, 5).routes.find((r) => !r.rev).d === 0, 'Start/Ziel 0xB4 fährt nach Osten');
  // Rampe 0x24 steigt nach Osten
  const ramp = placeElement(0x24, 5, 5).routes.find((r) => r.d === 0);
  ok(ramp.h0 === 0 && ramp.h1 === 1, 'Rampe 0x24 steigt nach Osten');
  // Schikane 0x3C (N–S, SW–NE): Einfahrt SW nach Norden, Versatz nach rechts (Osten)
  const ch = placeElement(0x3C, 5, 5).routes.find((r) => r.d === 3);
  ok(ch.i === 5 && ch.j === 6 && ch.m === 1, 'Schikane 0x3C: Einfahrt SW, rechts versetzt');
  // Korkenzieher auf/ab 0x75: nach Norden hinauf, Kreis rechts (Osten), Gerade in der Westspalte
  const cu = placeElement(0x75, 5, 5).routes.find((r) => r.d === 3);
  ok(cu.i === 5 && cu.j === 6 && cu.m === 1 && cu.h1 === 1, 'Wendel 0x75: Westspalte hinauf, Kreis östlich');
  // Abzweig 0x4F: Gerade S→N und Kurve S→E; Einfahrt von S hat zwei Wege
  const sp = placeElement(0x4F, 5, 5).routes.filter((r) => r.d === 3);
  ok(sp.length === 2 && sp.some((r) => r.lane === 'b' && r.m === 1), 'Abzweig 0x4F: gerade + rechts');
  // Steilstraßen-Übergang 0x28: N–S, höchster Punkt NW → Einfahrt von Süden flach, hohe Seite links (West)
  const bt = placeElement(0x28, 5, 5).routes.find((r) => r.d === 3);
  ok(bt.b0 === 0 && bt.b1 === 1 && bt.side === -1, 'Übergang 0x28: nach Norden überhöht, West hoch');
  // Szenerie: Tankstelle 0x9B blickt nach Süden
  ok(placeElement(0x9B, 5, 5).facing === 1, 'Tankstelle 0x9B blickt nach Süden');
}

// 4) Fehlermeldungen (deutsch, ohne Absturz)
{
  throwsTrk(() => parseTrk(new Uint8Array(302), 'kurz.trk'), /zu kurz/, 'zu kurz');
  throwsTrk(() => parseTrk(new Uint8Array(20000), 'gross.trk'), /zu groß/, 'zu groß');
  throwsTrk(() => parseTrk(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), 'x.zip'), /ZIP/, 'ZIP erkannt');
  throwsTrk(() => parseTrk(new Uint8Array(0), 'leer.trk'), /leer/, 'leere Datei');
  throwsTrk(() => parseTrk(new Uint8Array(TRK_BYTES), 'nix.trk'), /leer/, 'Strecke ohne Elemente');
  const bad = new Uint8Array(TRK_BYTES); bad[5] = 0x04; bad[0x385 + 10] = 0x40;
  throwsTrk(() => parseTrk(bad, 'kaputt.trk'), /Geländecodes/, 'ungültiger Geländecode');
  // interne Codes 0xB6–0xFC werden wie im Original zu Straßen (Warnung)
  const intl = new Uint8Array(TRK_BYTES); intl[7] = 0xC0;
  const ti = parseTrk(intl, 'i.trk');
  ok(ti.elem[29 * 30 + 7] === 0x04 && ti.warnings.length === 1, 'interner Code → Straße + Warnung');
}

// 5) Replay (.RPL): Kopf 26 Bytes + Strecke + 1 Byte je Tick → Strecke wird ausgelesen
{
  const trk = new Uint8Array(TRK_BYTES); trk[3] = 0x01; trk[0x384] = 2;
  const ticks = 40, rpl = new Uint8Array(26 + TRK_BYTES + ticks);
  rpl.set([...'PMIN'].map((c) => c.charCodeAt(0)), 0);
  rpl.set([...'MEINE'].map((c) => c.charCodeAt(0)), 13);
  rpl[22] = 20; rpl[24] = ticks & 255; rpl[25] = ticks >> 8;
  rpl.set(trk, 26);
  const t = parseTrk(rpl, 'lauf.rpl');
  ok(t.source === 'rpl' && t.name === 'MEINE' && t.horizon === 2 && t.elem[29 * 30 + 3] === 0x01, 'Strecke aus Replay');
  ok(trkHash(t.bytes) === trkHash(trk), 'Replay-Strecke = Originalbytes');
}

// 6) Bliss-Metadaten (Überlagerung nach 1802 Bytes)
{
  const b = new Uint8Array(TRK_BYTES + 40); b[3] = 0x01;
  const enc = (s) => [...s].map((c) => c.charCodeAt(0));
  let p = TRK_BYTES;
  b.set(enc('smdf'), p); p += 8;
  b.set(enc('Titl'), p); b[p + 4] = 6; p += 6; b.set(enc('Kurven'), p); p += 6;
  b.set(enc('Autr'), p); b[p + 4] = 4; p += 6; b.set(enc('Anna'), p); p += 4;
  const t = parseTrk(b.subarray(0, p), 'm.trk');
  ok(t.name === 'Kurven' && t.meta && t.meta.author === 'Anna', 'Bliss-Titel/Autor');
}

console.log(`${checks - fails}/${checks} Prüfungen ok`);
process.exit(fails ? 1 : 0);
