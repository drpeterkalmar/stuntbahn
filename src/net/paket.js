// Kompakte Binär-Pakete für den Zustand bewegter Körper (n35 Netz-Schicht, spielunabhängig). Ein Spiel beschreibt
// seinen Zustand als Schema (Liste von Feldern), die Netz-Schicht packt ihn in ein Uint8Array und zurück.
// Kopf: Typ (1 B), Folgenummer (2 B, läuft über), Sitzungszeit beim Abtasten (4 B, ms, läuft nach 49 Tagen über).
// Einzelpaket: Kopf + 1 Datensatz. Sammelpaket (z. B. KI-Gegner vom Gastgeber): Kopf + Anzahl (1 B) + je Satz
// Platz-Nummer (1 B) + Datensatz. Node-Test: tests/node/test_netz.mjs.
//
// Feld-Arten: 'f32' (4 B), 'i16' (2 B, Wert/skala gerundet, begrenzt), 'i8', 'u8', 'u16' (dito), 'quat' (7 B:
// „kleinste drei“ – die größte Komponente wird weggelassen, die anderen drei als i16; Fehler < 0,01°),
// 'bits' (1 B: bis 8 Wahrheitswerte, Namen in `namen`).

export const TYP = { EINZEL: 1, SAMMEL: 2 };
const KOPF = 7;
const BYTES = { f32: 4, i16: 2, i8: 1, u8: 1, u16: 2, quat: 7, bits: 1 };
const GRENZE = { i16: [-32767, 32767], i8: [-127, 127], u8: [0, 255], u16: [0, 65535] };
const Q_SKALA = 32767 / Math.SQRT1_2;

// Schema bauen. felder: [{ name, art, skala?, namen? }] oder Kurzform [name, art, skala|namen]
export function schema(felder) {
  const F = felder.map((f) => Array.isArray(f) ? { name: f[0], art: f[1], ...(Array.isArray(f[2]) ? { namen: f[2] } : { skala: f[2] ?? 1 }) } : { skala: 1, ...f });
  let groesse = 0;
  for (const f of F) {
    if (!BYTES[f.art]) throw new Error('Feld-Art unbekannt: ' + f.art);
    if (f.art === 'bits' && (!f.namen || f.namen.length > 8)) throw new Error('bits braucht 1–8 Namen');
    f.off = groesse; groesse += BYTES[f.art];
  }
  return { felder: F, groesse };
}

// Datensatz o (Objekt mit den Feld-Namen; quat als {x,y,z,w}, bits als Objekt { name: bool } oder Feld-Werte im
// Objekt selbst) an Stelle off schreiben
export function schreibeSatz(S, dv, off, o) {
  for (const f of S.felder) {
    const p = off + f.off, x = o[f.name];
    switch (f.art) {
      case 'f32': dv.setFloat32(p, +x || 0, true); break;
      case 'i16': dv.setInt16(p, ganz(x, f), true); break;
      case 'u16': dv.setUint16(p, ganz(x, f), true); break;
      case 'i8': dv.setInt8(p, ganz(x, f)); break;
      case 'u8': dv.setUint8(p, ganz(x, f)); break;
      case 'quat': schreibeQuat(dv, p, x || { x: 0, y: 0, z: 0, w: 1 }); break;
      case 'bits': { let b = 0; const src = x && typeof x === 'object' ? x : o; f.namen.forEach((n, k) => { if (src[n]) b |= 1 << k; }); dv.setUint8(p, b); break; }
    }
  }
}

export function leseSatz(S, dv, off, o = {}) {
  for (const f of S.felder) {
    const p = off + f.off;
    switch (f.art) {
      case 'f32': o[f.name] = dv.getFloat32(p, true); break;
      case 'i16': o[f.name] = dv.getInt16(p, true) * f.skala; break;
      case 'u16': o[f.name] = dv.getUint16(p, true) * f.skala; break;
      case 'i8': o[f.name] = dv.getInt8(p) * f.skala; break;
      case 'u8': o[f.name] = dv.getUint8(p) * f.skala; break;
      case 'quat': o[f.name] = leseQuat(dv, p, o[f.name] || {}); break;
      case 'bits': { const b = dv.getUint8(p), z = o[f.name] || {}; f.namen.forEach((n, k) => { z[n] = !!(b & (1 << k)); }); o[f.name] = z; break; }
    }
  }
  return o;
}

function ganz(x, f) {
  const [lo, hi] = GRENZE[f.art];
  const v = Math.round((+x || 0) / f.skala);
  return v < lo ? lo : v > hi ? hi : v;
}

// Quaternion „kleinste drei“: Index der größten Komponente (2 bit) + Vorzeichen so, dass sie positiv ist
export function schreibeQuat(dv, p, q) {
  let c = [q.x, q.y, q.z, q.w];
  const l = Math.hypot(c[0], c[1], c[2], c[3]) || 1;
  c = c.map((v) => v / l);
  let gi = 0;
  for (let i = 1; i < 4; i++) if (Math.abs(c[i]) > Math.abs(c[gi])) gi = i;
  const s = c[gi] < 0 ? -1 : 1;
  dv.setUint8(p, gi);
  let k = 0;
  for (let i = 0; i < 4; i++) if (i !== gi) { dv.setInt16(p + 1 + 2 * k, Math.max(-32767, Math.min(32767, Math.round(c[i] * s * Q_SKALA))), true); k++; }
}
export function leseQuat(dv, p, out = {}) {
  const gi = dv.getUint8(p) & 3, c = [0, 0, 0, 0];
  let k = 0, sum = 0;
  for (let i = 0; i < 4; i++) if (i !== gi) { c[i] = dv.getInt16(p + 1 + 2 * k, true) / Q_SKALA; sum += c[i] * c[i]; k++; }
  c[gi] = Math.sqrt(Math.max(0, 1 - sum));
  out.x = c[0]; out.y = c[1]; out.z = c[2]; out.w = c[3];
  return out;
}

// Einzelpaket: ein Datensatz
export function packeEinzel(S, seq, t, o) {
  const b = new Uint8Array(KOPF + S.groesse), dv = new DataView(b.buffer);
  kopf(dv, TYP.EINZEL, seq, t);
  schreibeSatz(S, dv, KOPF, o);
  return b;
}
// Sammelpaket: saetze = [{ platz, …Felder }]
export function packeSammel(S, seq, t, saetze) {
  const n = Math.min(255, saetze.length);
  const b = new Uint8Array(KOPF + 1 + n * (1 + S.groesse)), dv = new DataView(b.buffer);
  kopf(dv, TYP.SAMMEL, seq, t);
  dv.setUint8(KOPF, n);
  for (let i = 0; i < n; i++) { const off = KOPF + 1 + i * (1 + S.groesse); dv.setUint8(off, saetze[i].platz & 255); schreibeSatz(S, dv, off + 1, saetze[i]); }
  return b;
}
function kopf(dv, typ, seq, t) { dv.setUint8(0, typ); dv.setUint16(1, seq & 0xffff, true); dv.setUint32(3, Math.max(0, Math.round(t)) >>> 0, true); }

// Auspacken: { typ, seq, t, saetze: [{ platz, … }] } oder null (zu kurz/unbekannt)
export function entpacke(S, bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < KOPF) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const typ = dv.getUint8(0), seq = dv.getUint16(1, true), t = dv.getUint32(3, true);
  if (typ === TYP.EINZEL) {
    if (b.length < KOPF + S.groesse) return null;
    return { typ, seq, t, saetze: [leseSatz(S, dv, KOPF, { platz: 0 })] };
  }
  if (typ === TYP.SAMMEL) {
    const n = dv.getUint8(KOPF);
    if (b.length < KOPF + 1 + n * (1 + S.groesse)) return null;
    const saetze = [];
    for (let i = 0; i < n; i++) { const off = KOPF + 1 + i * (1 + S.groesse); saetze.push(leseSatz(S, dv, off + 1, { platz: dv.getUint8(off) })); }
    return { typ, seq, t, saetze };
  }
  return null;
}

// Folgenummer neuer als die letzte? (Überlauf bei 65536 beachtet; Abstand > 32768 = älter)
export function neuer(seq, letzte) { if (letzte == null) return true; const d = (seq - letzte) & 0xffff; return d !== 0 && d < 0x8000; }
// Sitzungszeit aus dem 32-bit-Feld zurück auf die volle Zeit nahe `nahe` (ms) – Überlauf nach 49 Tagen
export function zeitVoll(t32, nahe) { const M = 2 ** 32; let t = t32 + Math.floor(nahe / M) * M; if (t - nahe > M / 2) t -= M; else if (nahe - t > M / 2) t += M; return t; }
