// Speicher (localStorage): Einstellungen, Bestzeiten + Geisterautos getrennt je Strecke, Fahrhilfe
// UND Totalschaden-Einstellung.
import { PHYS } from '../physics/car.js';
import { WORLD_TAG } from '../track/defs.js';

const KEY = 'stuntbahn.v1';
const GHOST_MAX = 40;

// Wertungsklasse aus Fahrhilfe + Totalschaden. Migration ohne Umkopieren: die bisherigen Schlüssel
// (nur Fahrhilfe) behalten ihre Bedeutung – Leicht fuhr bisher ohne Wrack (→ Totalschaden aus),
// Mittel/Original mit Wrack (→ Totalschaden an). Nur die jeweils andere Variante bekommt einen Zusatz.
// Physik-Version (27.09.2026, doppelt so schnell): Zeiten der neuen Physik bekommen „@t2“ angehängt.
// Die alten Einträge bleiben unverändert stehen und werden im Menü als „alte Physik“ gezeigt – nichts
// wird gelöscht oder umgeschrieben; mit ?auto=alt (PHYS 1) gelten wieder die alten Schlüssel.
// Weltmaßstab (27.09.2026, n12): neue Welt = neue Wertung, Zusatz „@w2“ (defs.js WORLD_TAG). Die Zeiten der
// alten Welt bleiben unverändert und erscheinen im Menü als „alte Welt“; ?welt=1 wertet wieder dort.
// Extras (28.09.2026, Hüpfer + Nitro): Zeiten mit Extras bekommen „@x“ – eine eigene Liste. Die bisherigen
// Zeiten (ohne Extras gefahren) bleiben unverändert und sind genau die Liste mit ausgeschalteten Extras
// (Option „Hüpfer & Nitro“ aus, für Puristen); das Menü zeigt sie als „ohne Extras“.
// Mehr Bodenhaftung (29.09.2026, n14): Physik 3 → Zusatz „@t3“. Die Zeiten der Physik 2 (gleiche Welt, gleiche
// Extras-Einstellung) bleiben stehen und erscheinen im Menü als „alte Physik“; ?grip=1 wertet wieder dort.
export function modeKey(assist, wreck, phys = PHYS, world = WORLD_TAG, extras = true) {
  const legacy = assist === 'easy' ? !wreck : !!wreck;
  return (legacy ? assist : assist + (wreck ? '+wrack' : '+reset')) + (phys >= 2 ? '@t' + phys : '') + world + (extras ? '@x' : '');
}

export class Store {
  constructor() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { d = {}; }
    this.settings = Object.assign({ assist: 'easy', paint: 0xa3120e, sound: true, ghost: true, touch: 'auto', tilt: false, wreck: false, line: 'soft', lineLast: 'soft', cam: 'chase', quality: 'auto', diff: 2, lastSeed: null, seenHelp: false, extras: true, autoExtras: true, blur: 'light', brakeHelp: 'hint' }, d.settings || {});
    this.best = d.best || {};      // key|modeKey -> { time, date, name, pen }
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
  bestFor(key, assist, wreck = this.settings.wreck, extras = this.settings.extras) { return this.best[key + '|' + modeKey(assist, wreck, PHYS, WORLD_TAG, extras)] || null; }
  // Bestzeit derselben Wertung mit der jeweils anderen Extras-Einstellung (nur Anzeige: „ohne/mit Extras“)
  otherExtrasBestFor(key, assist, wreck = this.settings.wreck) { return this.bestFor(key, assist, wreck, !this.settings.extras); }
  // Bestzeit derselben Wertung mit der Physik vor n14 (bis 28.09.2026, weniger Haftung; gleiche Welt und Extras) –
  // nur zur Anzeige, nicht vergleichbar
  prevPhysBestFor(key, assist, wreck = this.settings.wreck, extras = this.settings.extras) { return PHYS >= 3 ? this.best[key + '|' + modeKey(assist, wreck, 2, WORLD_TAG, extras)] || null : null; }
  // Bestzeit derselben Wertung mit der ersten Physik (bis 27.09.2026, alte Welt, ohne Extras) – nur zur Anzeige
  oldBestFor(key, assist, wreck = this.settings.wreck) { return PHYS >= 2 ? this.best[key + '|' + modeKey(assist, wreck, 1, '', false)] || null : null; }
  // Bestzeit derselben Wertung in der alten Welt (Maßstab 1, Physik 2, bis 27.09.2026, ohne Extras) – nur zur Anzeige
  oldWorldBestFor(key, assist, wreck = this.settings.wreck) { return WORLD_TAG && PHYS >= 2 ? this.best[key + '|' + modeKey(assist, wreck, 2, '', false)] || null : null; }
  // Rennen beendet: Bestzeit prüfen, Geist speichern (rec inkl. Strafzeit-Stillstand, Race.ghostRec)
  submit(key, assist, wreck, time, rec, meta = {}) {
    const k = key + '|' + modeKey(assist, wreck, PHYS, WORLD_TAG, meta.extras !== false);
    const prev = this.best[k];
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
    const k = key + '|' + modeKey(assist, wreck, PHYS, WORLD_TAG, extras);
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
