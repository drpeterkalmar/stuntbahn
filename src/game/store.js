// Speicher (localStorage): Einstellungen, Bestzeiten + Geisterautos getrennt je Strecke UND Fahrhilfe.
const KEY = 'stuntbahn.v1';
const GHOST_MAX = 40;

export class Store {
  constructor() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { d = {}; }
    this.settings = Object.assign({ assist: 'easy', paint: 0xa3120e, sound: true, ghost: true, touch: 'auto', tilt: false, quality: 'auto', diff: 2, lastSeed: null, seenHelp: false }, d.settings || {});
    this.best = d.best || {};      // key|assist -> { time, date, name }
    this.ghostIndex = d.ghostIndex || []; // Reihenfolge für LRU
    try { this.verified = JSON.parse(localStorage.getItem(KEY + '.verified') || '{}'); } catch { this.verified = {}; }
  }
  // Geprüfte Strecken (Autopilot) cachen: Layout nach Entschärfen + Referenzzeit
  getVerified(key, build) {
    const v = this.verified[key];
    if (!v || v.b !== build) return null;
    return { pieces: v.p.map(([type, i, j, d, m, lvl]) => ({ type, i, j, d, m, lvl })), ap: v.ap, fixes: v.f };
  }
  setVerified(key, build, pieces, ap, fixes) {
    this.verified[key] = { b: build, p: pieces.map((q) => [q.type, q.i, q.j, q.d, q.m || 1, q.lvl || 0]), ap, f: fixes };
    const keys = Object.keys(this.verified);
    if (keys.length > 60) delete this.verified[keys[0]];
    try { localStorage.setItem(KEY + '.verified', JSON.stringify(this.verified)); } catch { /* voll */ }
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ settings: this.settings, best: this.best, ghostIndex: this.ghostIndex })); } catch { /* voll */ }
  }
  bestFor(key, assist) { return this.best[key + '|' + assist] || null; }
  // Rennen beendet: Bestzeit prüfen, Geist speichern
  submit(key, assist, time, rec, meta = {}) {
    const k = key + '|' + assist;
    const prev = this.best[k];
    const isBest = !prev || time < prev.time;
    if (isBest) {
      this.best[k] = { time, date: new Date().toISOString().slice(0, 10), name: meta.name || '' };
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
  loadGhost(key, assist) {
    const s = localStorage.getItem('stuntbahn.ghost.' + key + '|' + assist);
    if (!s) return null;
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
      return { hz: 15, frames: n, data: out };
    } catch { return null; }
  }
}
