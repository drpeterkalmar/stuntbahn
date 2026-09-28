// „Sammlung“: 250 eigene Strecken im Stil der beliebtesten Stunts-Wettbewerbe (assets/sammlung.bin + .json, gebaut
// von tools/build_sammlung.mjs). Wird erst beim Aufklappen in der Bibliothek geladen (ein Request je Datei), nicht beim
// Start. Nicht Teil der TrkLib („Meine Strecken“): Bestzeiten/Geister laufen über die Id „sam-<nr>“ wie bei Importen.
// Filter und Sortierung sind reine Funktionen (Node-Test: tests/node/test_sammlung.mjs).
import { TRK_BYTES } from '../track/trk.js';

// Stunt-Arten (Schlüssel wie im Build) → Symbol, Name
export const SAM_STUNTS = {
  loop: ['➰', 'Looping'], kork: ['🌀', 'Korkenzieher'], roehre: ['🕳️', 'Röhre'], sprung: ['🛫', 'Sprung'], tunnel: ['🚇', 'Tunnel'],
  autobahn: ['🛣️', 'Autobahn'], steil: ['↪️', 'Steilkurve'], hoch: ['🌉', 'Hochstraße'], slalom: ['🚧', 'Slalom'], schikane: ['🔀', 'Schikane'],
  kreuz: ['🚦', 'Kreuzung'],
};
export const SAM_DIFF = { 1: ['🟢', 'Sanft'], 2: ['🟡', 'Sportlich'], 3: ['🔴', 'Irre'] };
export const SAM_SORTS = { rec: 'Empfohlen', name: 'Name A–Z', len: 'Länge', stunts: 'Anzahl Stunts', diff: 'Schwierigkeit', best: 'Eigene Bestzeit', recent: 'Zuletzt gefahren' };
// Ansicht (in store.settings.sam gespeichert): Suche, Filter je Gruppe (innerhalb ODER, Stunts UND), Sortierung
export const DEFAULT_VIEW = { open: false, fo: false, q: '', d: [], len: [], st: [], h: [], never: false, mine: false, sort: 'rec' };

export function lengthClass(m, bounds) { return m < bounds[0] ? 'kurz' : m < bounds[1] ? 'mittel' : 'lang'; }
const stuntCount = (t) => Object.values(t.st || {}).reduce((a, b) => a + b, 0);
// Strecke des Tages: Kalendertage seit 1.1.1970 mod Anzahl – für alle gleich
export function dayIndex(date = new Date(), n = 250) {
  const days = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return ((days % n) + n) % n;
}

// ctx: { best(id) → {time}|null (aktuelle Wertung), hasBest(id) → bool (irgendeine Fahrhilfe), played: {id: Zeitstempel}, lengthBounds }
export function filterSort(tracks, view, ctx) {
  const v = { ...DEFAULT_VIEW, ...view };
  const q = String(v.q || '').trim().toLowerCase();
  const has = ctx.hasBest || ((id) => !!ctx.best(id));
  const played = ctx.played || {};
  const out = tracks.filter((t) => {
    if (q && !t.name.toLowerCase().includes(q)) return false;
    if (v.d.length && !v.d.includes(t.d)) return false;
    if (v.len.length && !v.len.includes(lengthClass(t.m, ctx.lengthBounds))) return false;
    if (v.h.length && !v.h.includes(t.h)) return false;
    for (const s of v.st) if (!(t.st && t.st[s] > 0)) return false;
    if (v.never && played[t.id]) return false;
    if (v.mine && !has(t.id)) return false;
    return true;
  });
  const byName = (a, b) => a.name.localeCompare(b.name, 'de');
  const cmp = {
    rec: (a, b) => b.sn - a.sn || byName(a, b),
    name: byName,
    len: (a, b) => a.m - b.m || byName(a, b),
    stunts: (a, b) => stuntCount(b) - stuntCount(a) || byName(a, b),
    diff: (a, b) => a.d - b.d || b.sn - a.sn,
    // eigene Bestzeit: schnellste zuerst, Strecken ohne Zeit ans Ende (dort nach Empfehlung)
    best: (a, b) => { const x = ctx.best(a.id), y = ctx.best(b.id); if (x && y) return x.time - y.time; if (x) return -1; if (y) return 1; return b.sn - a.sn; },
    recent: (a, b) => (played[b.id] || 0) - (played[a.id] || 0) || b.sn - a.sn,
  }[v.sort] || ((a, b) => b.sn - a.sn);
  return out.sort(cmp);
}

// Laden auf Anforderung; fehlt das Paket (z. B. lokal ohne Build → 404), bleibt failed gesetzt und die Oberfläche
// blendet den Abschnitt ohne Fehlermeldung aus
export class Sammlung {
  constructor(base = 'assets/') {
    this.base = base;
    this.meta = null; this.bin = null; this.failed = false; this._p = null;
  }
  get ready() { return !!(this.meta && this.bin); }
  get list() { return this.meta ? this.meta.tracks : []; }
  load() {
    if (this._p) return this._p;
    this._p = (async () => {
      try {
        const [j, b] = await Promise.all([fetch(this.base + 'sammlung.json'), fetch(this.base + 'sammlung.bin')]);
        if (!j.ok || !b.ok) throw new Error('Paket fehlt');
        const meta = await j.json(), bin = new Uint8Array(await b.arrayBuffer());
        if (!meta.tracks || bin.length < meta.tracks.length * TRK_BYTES) throw new Error('Paket unvollständig');
        this.meta = meta; this.bin = bin;
        this.byId = new Map(meta.tracks.map((t, k) => [t.id, k]));
      } catch (e) {
        this.failed = true;
      }
      return this.ready;
    })();
    return this._p;
  }
  get(id) { return this.ready && this.byId.has(id) ? this.meta.tracks[this.byId.get(id)] : null; }
  bytes(id) {
    if (!this.ready || !this.byId.has(id)) return null;
    const k = this.byId.get(id);
    return this.bin.slice(k * TRK_BYTES, (k + 1) * TRK_BYTES);
  }
  today(date = new Date()) { return this.ready ? this.meta.tracks[dayIndex(date, this.meta.tracks.length)] : null; }
}
