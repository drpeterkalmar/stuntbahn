// .TRK-Dateien lesen (Streckenformat des Stunt-Klassikers, Doku: wiki.stunts.hu/wiki/Track_file).
// Aufbau (1802 Bytes): 900 Bytes Strecke (30×30, Zeilen von SÜDEN nach NORDEN), 1 Byte Horizont,
// 900 Bytes Gelände (Zeilen von NORDEN nach SÜDEN), 1 Füllbyte. Danach optional Metadaten (Bliss "smdf").
// Replays (.RPL) enthalten dieselben 1802 Bytes nach einem Kopf von 26 (neu) bzw. 24 Bytes (alt).
// Ergebnis-Raster sind einheitlich [j * 30 + i] mit i = Spalte (West→Ost), j = Zeile (Nord→Süd).
// Reines JS ohne DOM → in Node testbar.

export const TRK_BYTES = 1802;
export const TRK_MAX = 13802;           // größer lädt auch das Original nicht (Überlagerung max. 12000 Bytes)
export const HORIZONS = ['Wüste', 'Tropen', 'Alpen', 'Stadt', 'Land', 'Chaos'];

export class TrkError extends Error {
  constructor(msg) { super(msg); this.name = 'TrkError'; }
}

const hex = (v) => '0x' + v.toString(16).toUpperCase().padStart(2, '0');
const MAX_TERRAIN = 0x12;

// Prüft, ob 1802 Bytes ab `off` eine plausible Strecke sind (Geländecodes gültig, Füllbyte egal)
function plausible(b, off) {
  if (b.length < off + TRK_BYTES) return false;
  for (let k = 0; k < 900; k++) if (b[off + 901 + k] > MAX_TERRAIN) return false;
  if (b[off + 900] > 5) return false;
  return true;
}

// Replay erkennen: Kopf + 1802 Bytes Strecke + 1 Byte je Tick (Tick-Zahl steht im Kopf)
function replayOffset(b) {
  if (b.length >= 26 + TRK_BYTES) {
    const ticks = b[24] | (b[25] << 8);
    if (b.length === 26 + TRK_BYTES + ticks && plausible(b, 26)) return 26;
  }
  if (b.length >= 24 + TRK_BYTES) {
    const ticks = b[22] | (b[23] << 8);
    if (b.length === 24 + TRK_BYTES + ticks && plausible(b, 24)) return 24;
  }
  return -1;
}

function latin1(b, a, e) {
  let s = '';
  for (let k = a; k < e && b[k]; k++) s += String.fromCharCode(b[k]);
  return s;
}

function utf8(b) {
  try { return new TextDecoder('utf-8').decode(b); } catch { return latin1(b, 0, b.length); }
}

// Bliss-Metadaten ("smdf" + Chunks: 4 Zeichen ID, 16-Bit-Länge, Daten)
function readMeta(b, off) {
  if (b.length < off + 8 || latin1(b, off, off + 4) !== 'smdf') return null;
  const meta = {};
  let p = off + 8;
  while (p + 6 <= b.length) {
    const id = latin1(b, p, p + 4), len = b[p + 4] | (b[p + 5] << 8);
    p += 6;
    if (p + len > b.length) break;
    const v = b.subarray(p, p + len);
    if (id === 'Titl') meta.title = utf8(v).replace(/\0+$/, '').trim();
    else if (id === 'Autr') meta.author = utf8(v).replace(/\0+$/, '').trim();
    else if (id === 'Comm') meta.comment = utf8(v).replace(/\0+$/, '').trim();
    else if (id === 'Date' && len >= 4) meta.date = `${v[0] | (v[1] << 8)}-${String(v[2]).padStart(2, '0')}-${String(v[3]).padStart(2, '0')}`;
    p += len;
  }
  return Object.keys(meta).length ? meta : null;
}

// Hauptfunktion: Bytes → { elem, terr, horizon, meta, warnings, bytes, source }
export function parseTrk(input, fileName = '') {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  const lower = String(fileName).toLowerCase();
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4) {
    throw new TrkError('Das ist ein ZIP-Archiv. Bitte die .TRK-Dateien daraus wählen (oder das ZIP über „Strecke laden“ importieren).');
  }
  if (b.length === 0) throw new TrkError('Die Datei ist leer.');
  let off = 0, source = 'trk';
  const rpl = replayOffset(b);
  if (lower.endsWith('.rpl') || (rpl >= 0 && !plausible(b, 0))) {
    if (rpl < 0) throw new TrkError('Replay-Datei ohne lesbare Strecke (Format unbekannt oder beschädigt).');
    off = rpl; source = 'rpl';
  } else {
    if (b.length < TRK_BYTES) throw new TrkError(`Datei zu kurz: ${b.length} Bytes – eine .TRK-Strecke hat genau 1802 Bytes.`);
    if (b.length > TRK_MAX) throw new TrkError(`Datei zu groß: ${b.length} Bytes – keine .TRK-Strecke (max. 1802 Bytes + Metadaten).`);
  }
  const warnings = [];
  const elem = new Uint8Array(900), terr = new Uint8Array(900);
  for (let r = 0; r < 30; r++) for (let c = 0; c < 30; c++) {
    // Strecke: Dateizeile 0 = Süden → j = 29 - Dateizeile; Gelände: Dateizeile 0 = Norden
    elem[r * 30 + c] = b[off + (29 - r) * 30 + c];
    terr[r * 30 + c] = b[off + 901 + r * 30 + c];
  }
  let badTerr = 0, firstBad = null;
  for (let k = 0; k < 900; k++) {
    if (terr[k] > MAX_TERRAIN) { badTerr++; if (!firstBad) firstBad = [k % 30, (k / 30) | 0, terr[k]]; }
  }
  if (badTerr) {
    throw new TrkError(`Beschädigte Strecke: ${badTerr} ungültige Geländecodes (erster ${hex(firstBad[2])} bei Feld ${firstBad[0] + 1}/${firstBad[1] + 1}). Das Original würde hier abstürzen.`);
  }
  // Interne Codes 0xB6–0xFC: das Original macht daraus beim Start gerade Asphaltstraßen (Nord-Süd)
  let internal = 0;
  for (let k = 0; k < 900; k++) if (elem[k] >= 0xB6 && elem[k] <= 0xFC) { elem[k] = 0x04; internal++; }
  if (internal) warnings.push(`${internal} interne Elementcodes wie im Original als gerade Straße gelesen.`);
  let horizon = b[off + 900];
  if (horizon > 5) { warnings.push(`Unbekannter Horizont ${horizon} → Land.`); horizon = 4; }
  let used = 0;
  for (let k = 0; k < 900; k++) if (elem[k]) used++;
  if (!used) throw new TrkError('Die Strecke ist leer (keine Elemente).');
  const meta = source === 'trk' && b.length > TRK_BYTES ? readMeta(b, TRK_BYTES) : null;
  let name = (meta && meta.title) || '';
  if (!name && source === 'rpl') name = latin1(b, 13, 22).trim();
  if (!name && fileName) name = String(fileName).replace(/^.*[\\/]/, '').replace(/\.(trk|rpl)$/i, '');
  return { name: name || 'Strecke', elem, terr, horizon, extra: b[off + 1801], meta, warnings, source, bytes: b.slice(off, off + TRK_BYTES) };
}

// Schreiben (für eigene Showcase-Strecken und Tests): Raster [j*30+i] → 1802 Bytes
export function writeTrk(elem, terr, horizon = 4) {
  const b = new Uint8Array(TRK_BYTES);
  for (let r = 0; r < 30; r++) for (let c = 0; c < 30; c++) {
    b[(29 - r) * 30 + c] = elem[r * 30 + c];
    b[901 + r * 30 + c] = terr ? terr[r * 30 + c] : 0;
  }
  b[900] = horizon;
  return b;
}

// Kurzer Inhalts-Hash (FNV-1a) → Schlüssel für Bestzeiten/Geister einer importierten Strecke
export function trkHash(bytes) {
  let h = 2166136261 >>> 0;
  for (let k = 0; k < bytes.length; k++) { h ^= bytes[k]; h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}
