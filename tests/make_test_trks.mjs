// Erzeugt eigene Test-Strecken als Dateien (tests/out/, nicht im Repo): Beispielstrecke, kleines Rechteck,
// beschädigte Datei, ZIP mit zwei Strecken, Replay mit Strecke.
import fs from 'fs';
import zlib from 'zlib';
import { TrackDesigner } from '../src/track/trkdesign.js';
import { showcaseBytes } from '../src/track/showcase.js';

const OUT = new URL('./out/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const rect = (w, h, surf) => {
  const t = new TrackDesigner(5, 5, 0, surf);
  t.put('sf').road(w).put('large', { turn: 'R' }).road(h).put('large', { turn: 'R' }).road(w + 1).put('large', { turn: 'R' }).road(h).put('large', { turn: 'R' });
  return t.bytes(1);
};
const files = { 'BEISPIEL.TRK': showcaseBytes('demo-rundkurs'), 'OVAL.TRK': rect(6, 3), 'SCHOTTER.TRK': rect(8, 4, 'dirt') };
for (const [n, b] of Object.entries(files)) fs.writeFileSync(new URL(n, OUT), b);
// beschädigt: ungültige Geländecodes
const bad = Uint8Array.from(files['OVAL.TRK']); for (let k = 901; k < 1000; k++) bad[k] = 0x40;
fs.writeFileSync(new URL('KAPUTT.TRK', OUT), bad);
fs.writeFileSync(new URL('NOTIZ.TRK', OUT), Buffer.from('keine Strecke'));
// Replay: Kopf 26 Bytes + Strecke + 50 Ticks
const rpl = new Uint8Array(26 + 1802 + 50);
rpl.set(Buffer.from('ANSX'), 0); rpl.set(Buffer.from('LAUF'), 13); rpl[22] = 20; rpl[24] = 50; rpl.set(files['SCHOTTER.TRK'], 26);
fs.writeFileSync(new URL('LAUF.RPL', OUT), rpl);
// ZIP (deflate) mit zwei Strecken
const entries = [['ZIP1.TRK', rect(5, 2)], ['sub/ZIP2.TRK', rect(7, 5, 'icy')]];
const parts = [], central = [];
let off = 0;
const crc32 = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
for (const [name, data] of entries) {
  const comp = zlib.deflateRawSync(data), nm = Buffer.from(name), crc = crc32(data);
  const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26);
  const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
  parts.push(h, nm, comp); central.push(c, nm);
  off += 30 + nm.length + comp.length;
}
const cd = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
fs.writeFileSync(new URL('PAKET.ZIP', OUT), Buffer.concat([...parts, cd, end]));
console.log('Testdateien:', fs.readdirSync(OUT).join(', '));
