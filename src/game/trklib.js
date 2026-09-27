// Bibliothek importierter .TRK-Strecken – bleibt im Browser (localStorage): Rohdaten (1802 Bytes als
// Base64), Name, Importdatum, Ergebnis der Autopilot-Probefahrt je Build. Bestzeiten/Geister liegen wie
// bei generierten Strecken im Store (Schlüssel „trk-<Hash>“ je Fahrhilfe).
import { parseTrk, trkHash, TRK_BYTES } from '../track/trk.js';

const KEY = 'stuntbahn.trklib.v1';
const MAX = 150;

const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };
const fromB64 = (b) => { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

export class TrkLib {
  constructor(storage = globalThis.localStorage) {
    this.st = storage;
    this.list = [];
    try { this.list = JSON.parse(this.st.getItem(KEY) || '[]'); } catch { this.list = []; }
  }
  save() {
    try { this.st.setItem(KEY, JSON.stringify(this.list)); return true; } catch { return false; }
  }
  get(id) { return this.list.find((t) => t.id === id) || null; }
  bytes(id) { const t = this.get(id); return t ? fromB64(t.data) : null; }
  // Datei-Inhalt übernehmen → { rec, dup } oder Fehler (TrkError mit deutscher Meldung)
  add(u8, fileName) {
    const trk = parseTrk(u8, fileName);
    const id = 'trk-' + trkHash(trk.bytes);
    const old = this.get(id);
    if (old) return { rec: old, dup: true, trk };
    if (this.list.length >= MAX) throw new Error(`Bibliothek voll (${MAX} Strecken) – bitte zuerst welche löschen.`);
    const rec = { id, name: trk.name.slice(0, 40), file: String(fileName || '').replace(/^.*[\\/]/, '').slice(0, 60), added: new Date().toISOString().slice(0, 10), data: toB64(trk.bytes), src: trk.source, meta: trk.meta || null };
    this.list.unshift(rec);
    if (!this.save()) { this.list.shift(); throw new Error('Browser-Speicher voll – Strecke konnte nicht gespeichert werden.'); }
    return { rec, dup: false, trk };
  }
  remove(id) { this.list = this.list.filter((t) => t.id !== id); this.save(); }
  rename(id, name) { const t = this.get(id); if (t) { t.name = String(name).slice(0, 40); this.save(); } }
  setVerified(id, build, res) { const t = this.get(id); if (t) { t.v = { b: build, ...res }; this.save(); } }
  getVerified(id, build) { const t = this.get(id); return t && t.v && t.v.b === build ? t.v : null; }
}

// ZIP-Archive (z. B. Downloads der Stunts-Seiten): .TRK/.RPL-Einträge auspacken (stored + deflate)
export async function unzipTracks(u8) {
  const out = [];
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = 0;
  while (p + 30 <= u8.length && dv.getUint32(p, true) === 0x04034b50) {
    const flags = dv.getUint16(p + 6, true), method = dv.getUint16(p + 8, true);
    let csize = dv.getUint32(p + 18, true);
    const nlen = dv.getUint16(p + 26, true), xlen = dv.getUint16(p + 28, true);
    const name = new TextDecoder('latin1').decode(u8.subarray(p + 30, p + 30 + nlen));
    const start = p + 30 + nlen + xlen;
    if (flags & 8 && !csize) break;               // Größe erst im Datendeskriptor: nicht unterstützt
    const data = u8.subarray(start, start + csize);
    if (/\.(trk|rpl)$/i.test(name) && out.length < MAX) {
      try {
        if (method === 0) out.push({ name, data: data.slice() });
        else if (method === 8 && typeof DecompressionStream !== 'undefined') {
          const ds = new DecompressionStream('deflate-raw');
          const buf = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
          out.push({ name, data: new Uint8Array(buf) });
        }
      } catch { /* Eintrag überspringen */ }
    }
    p = start + csize;
  }
  return out;
}

export { TRK_BYTES };
