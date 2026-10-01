// Speicher (localStorage): Einstellungen, Bestzeiten + Geisterautos getrennt je Strecke, Fahrhilfe, Totalschaden-
// Einstellung und Extras-Einstellung.
import { WORLD_SCALE_DEFAULT } from '../track/defs.js';

const KEY = 'stuntbahn.v1';
const GHOST_MAX = 40;
const TIMES_MAX = 5;   // Leicht: so viele letzte Zeiten je Strecke

// Bestzeiten ohne Versions-Schachtelung (Peter 30.09.2026: „Bestzeiten streichen“, n21). Bis n19 bekam jede neue
// Abstimmung einen Schlüssel-Zusatz (Physik @t2/@t3, Welt @w2, Mittel @m2) und die alten Listen erschienen im Menü als
// „alte Physik“/„alte Welt“/„erste Physik“. Jetzt: einmalig beim Laden alle bisherigen Bestzeiten und Geister löschen
// (RESET_MARK, idempotent), danach gibt es je Strecke nur noch die Wertung Fahrhilfe + Totalschaden + Extras – ohne
// Physik-Version. Leicht wertet weiter nicht (nur die letzten Zeiten, die bleiben stehen).
// A/B-Vergleiche per URL (alte Physik, alte Welt, alte Wiese/Haftung/Schanze, Luft-/Lippen-Regler) werten nicht: keine
// Bestzeit, kein Geist (sonst stünde eine Zeit mit anderer Physik in der Liste).
const RESET_MARK = 21;
const AB_PARAMS = [['auto', 'alt'], ['grip', '1'], ['mgrip', '1'], ['wiese', 'alt'], ['haft', 'alt'], ['schanze', 'alt'], ['welt', null], ['air', null], ['lip', null]];
export function abMode(search = globalThis.location ? globalThis.location.search : '') {
  if (!search) return false;
  const q = new URLSearchParams(search);
  return AB_PARAMS.some(([k, v]) => q.has(k) && (k === 'welt' ? Math.abs(parseFloat(q.get(k)) - WORLD_SCALE_DEFAULT) > 1e-6 : v === null ? q.get(k) !== '' : q.get(k) === v));
}
export const AB = abMode();
export function modeKey(assist, wreck, extras = true) {
  return assist + (wreck ? '+wrack' : '+reset') + (extras ? '@x' : '');
}

export class Store {
  constructor() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { d = {}; }
    this.settings = Object.assign({ assist: 'easy', paint: 0xa3120e, sound: true, ghost: true, touch: 'auto', tilt: false, wreck: false, line: 'soft', lineLast: 'soft', cam: 'chase', quality: 'auto', diff: 2, lastSeed: null, seenHelp: false, extras: true, autoExtras: true, blur: 'light', brakeHelp: 'hint', tbsize: 'gross', flat: false }, d.settings || {});
    this.best = d.best || {};      // key|modeKey -> { time, date, name, pen }
    this.ghostIndex = d.ghostIndex || []; // Reihenfolge für LRU
    // Leicht (n15, Peter 28.09.: „keine Highscores, nur Zeit notieren“): letzte Zeiten je Strecke, neueste zuerst,
    // { t, d (Datum), pen, x (Extras), w (Totalschaden) }
    this.times = d.times || {};
    this.timesMig = d.timesMig;
    this.reset = d.reset || 0;
    if (this.reset < RESET_MARK) { this.clearBests(); this.reset = RESET_MARK; this.save(); }
    try { this.verified = JSON.parse(localStorage.getItem(KEY + '.verified') || '{}'); } catch { this.verified = {}; }
  }
  // Einmalig (n21): alle Bestzeiten und Geisterautos löschen – auch die der alten Physik/Welt/Mittel-Listen und die
  // aus früheren Leicht-Bestzeiten übernommenen Einträge („früher“) der Leicht-Zeiten-Liste
  clearBests() {
    this.best = {};
    this.ghostIndex = [];
    const ghosts = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('stuntbahn.ghost.')) ghosts.push(k); }
    for (const k of ghosts) localStorage.removeItem(k);
    for (const [id, L] of Object.entries(this.times)) { const f = L.filter((e) => !e.old); if (f.length) this.times[id] = f; else delete this.times[id]; }
  }
  // Geprüfte Strecken (Autopilot) cachen: Layout nach Entschärfen + Referenzzeit
  getVerified(key, build) {
    const v = this.verified[key];
    if (!v || v.b !== build) return null;
    // 3D-Strecken (n19): 7. Wert = Ebene an der Ausfahrt (h1), v = Variante des Generators
    return { pieces: v.p.map(([type, i, j, d, m, lvl, h1]) => (h1 == null ? { type, i, j, d, m, lvl } : { type, i, j, d, m, lvl, h1 })), ap: v.ap, fixes: v.f, variant: v.v || 0 };
  }
  setVerified(key, build, pieces, ap, fixes, variant = 0) {
    this.verified[key] = { b: build, p: pieces.map((q) => (q.h1 == null ? [q.type, q.i, q.j, q.d, q.m || 1, q.lvl || 0] : [q.type, q.i, q.j, q.d, q.m || 1, q.lvl || 0, q.h1])), ap, f: fixes, ...(variant ? { v: variant } : {}) };
    const keys = Object.keys(this.verified);
    if (keys.length > 60) delete this.verified[keys[0]];
    try { localStorage.setItem(KEY + '.verified', JSON.stringify(this.verified)); } catch { /* voll */ }
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ settings: this.settings, best: this.best, ghostIndex: this.ghostIndex, times: this.times, timesMig: this.timesMig, reset: this.reset })); } catch { /* voll */ }
  }
  // Leicht: letzte Zeiten dieser Strecke (neueste zuerst, nicht nach Zeit sortiert)
  timesFor(key) { return this.times[key] || []; }
  bestFor(key, assist, wreck = this.settings.wreck, extras = this.settings.extras) { return this.best[key + '|' + modeKey(assist, wreck, extras)] || null; }
  // Bestzeit derselben Wertung mit der jeweils anderen Extras-Einstellung (nur Anzeige: „ohne/mit Extras“)
  otherExtrasBestFor(key, assist, wreck = this.settings.wreck) { return this.bestFor(key, assist, wreck, !this.settings.extras); }
  // Rennen beendet: Bestzeit prüfen, Geist speichern (rec inkl. Strafzeit-Stillstand, Race.ghostRec)
  submit(key, assist, wreck, time, rec, meta = {}) {
    // Leicht: keine Wertung, kein Geist – nur die Zeit mit Datum vorne in die Liste
    if (assist === 'easy') {
      const L = [{ t: time, d: new Date().toISOString().slice(0, 10), pen: meta.penalties || 0, x: meta.extras !== false ? 1 : 0, w: wreck ? 1 : 0 }, ...this.timesFor(key)].slice(0, TIMES_MAX);
      this.times[key] = L;
      this.save();
      return { easy: true, isBest: false, prev: null, time, list: L };
    }
    const k = key + '|' + modeKey(assist, wreck, meta.extras !== false);
    const prev = this.best[k];
    // A/B-Vergleich per URL: Zeit zeigen, aber nicht werten (n21)
    if (this.ab ?? AB) return { isBest: false, prev: prev ? prev.time : null, time, ab: true };
    const isBest = !prev || time < prev.time;
    if (isBest) {
      this.best[k] = { time, date: new Date().toISOString().slice(0, 10), name: meta.name || '', pen: meta.penalties || 0 };
      // Nitro-Zeiten (Rennuhr) für die Flammen des Geisterautos
      if (meta.nitro && meta.nitro.length) this.best[k].nx = meta.nitro.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]);
      this.saveGhost(k, rec);
    }
    this.save();
    return { isBest, prev: prev ? prev.time : null, time };
  }
  saveGhost(k, rec) {
    // 15 Hz, Position f32 + Quaternion i16 + Tempo i16 → base64
    const stride = 16, step = 4; // rec 60 Hz → jeder 4. Frame
    const n = Math.floor(rec.length / stride / step);
    const buf = new ArrayBuffer(4 + n * 22);
    const dv = new DataView(buf);
    dv.setUint32(0, n, true);
    for (let i = 0; i < n; i++) {
      const o = i * step * stride, b = 4 + i * 22;
      dv.setFloat32(b, rec[o], true); dv.setFloat32(b + 4, rec[o + 1], true); dv.setFloat32(b + 8, rec[o + 2], true);
      for (let q = 0; q < 4; q++) dv.setInt16(b + 12 + q * 2, Math.round(rec[o + 3 + q] * 32767), true);
      dv.setInt16(b + 20, Math.round(rec[o + 14] * 100), true);
    }
    let s = '';
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
    try {
      localStorage.setItem('stuntbahn.ghost.' + k, btoa(s));
      this.ghostIndex = this.ghostIndex.filter((x) => x !== k); this.ghostIndex.push(k);
      while (this.ghostIndex.length > GHOST_MAX) localStorage.removeItem('stuntbahn.ghost.' + this.ghostIndex.shift());
    } catch { /* Speicher voll: Geist verwerfen */ }
  }
  loadGhost(key, assist, wreck = this.settings.wreck, extras = this.settings.extras) {
    if (this.ab ?? AB) return null;
    const k = key + '|' + modeKey(assist, wreck, extras);
    const s = localStorage.getItem('stuntbahn.ghost.' + k);
    if (!s) return null;
    const nitro = (this.best[k] && this.best[k].nx) || [];
    try {
      const bin = atob(s), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const dv = new DataView(u8.buffer);
      const n = dv.getUint32(0, true);
      const out = new Float32Array(n * 8);
      for (let i = 0; i < n; i++) {
        const b = 4 + i * 22;
        out[i * 8] = dv.getFloat32(b, true); out[i * 8 + 1] = dv.getFloat32(b + 4, true); out[i * 8 + 2] = dv.getFloat32(b + 8, true);
        for (let q = 0; q < 4; q++) out[i * 8 + 3 + q] = dv.getInt16(b + 12 + q * 2, true) / 32767;
        out[i * 8 + 7] = dv.getInt16(b + 20, true) / 100;
      }
      return { hz: 15, frames: n, data: out, nitro };
    } catch { return null; }
  }
}
