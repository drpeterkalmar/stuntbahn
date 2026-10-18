// Nachgebautes Netz für Tests (n35 Netz-Schicht): mehrere Teilnehmer in einem Raum, virtuelle Zeit, einstellbare
// Laufzeit (je Richtung), Schwankung, Verlust und Vertauschen der Reihenfolge – schlechter als ein echter
// WebRTC-Datenkanal (Trystero: zuverlässig + geordnet), damit der Netz-Kern auch auf dem Ausweichweg robust ist.
// Jeder Teilnehmer hat eine eigene, versetzte Uhr (wie performance.now auf zwei Geräten).
// Schnittstelle des Transports (gilt auch für bc.js und trystero.js):
//   t.id                              eigene Peer-ID
//   t.senden(kanal, daten, ziel?)     daten: Uint8Array (Kanal 'z') oder JSON-fähiges Objekt; ziel: ID, [IDs] oder alle
//   t.bei(kanal, fn(daten, von))      Empfang
//   t.beiBeitritt(fn(id)), t.beiAbgang(fn(id)), t.beiFehler(fn({ art, peer, text }))
//   t.peers() → [IDs], t.verlassen()
// Node-Test: tests/node/test_netz.mjs.

export class FakeNetz {
  // latenz = Laufzeit je Richtung (ms, Ping ≈ 2 × latenz), jitter = ± ms (gleichverteilt), verlust = Anteil 0…1,
  // asym = Anteil, um den der Rückweg (höhere ID → niedrigere) länger ist (Uhr-Abgleich: schlechtester Fall)
  constructor(opt = {}) {
    this.opt = { latenz: 0, jitter: 0, verlust: 0, asym: 0, seed: 1, aufbau: null, abgangVerzug: 2500, ...opt };
    this.zeit = 0;
    this.teil = new Map();
    this.post = [];         // [{ an, zu, fn }]
    this.rnd = mulberry(this.opt.seed);
    this.gesperrt = new Set();   // 'a|b': direkte Verbindung blockiert (Firmennetz)
    this.zaehler = { gesendet: 0, verloren: 0, bytes: 0 };
  }
  // neuer Teilnehmer; uhr = Versatz seiner Uhr (ms), gang = Gangfehler (z. B. 1e-4 = 0,1 ms je s), raum = Raumcode
  // (nur Teilnehmer desselben Raums finden sich)
  teilnehmer(id, opt = {}) {
    const t = new FakeTransport(this, id ?? 'p' + (this.teil.size + 1), opt);
    t.raum = opt.raum ?? '';
    this.teil.set(t.id, t);
    // Verbindungsaufbau zu allen, die schon da sind
    const aufbau = this.opt.aufbau ?? 3 * this.opt.latenz + 20;
    for (const o of this.teil.values()) {
      if (o === t || o.raum !== t.raum) continue;
      if (this.gesperrt.has(schl(o.id, t.id))) {
        this.spaeter(aufbau + 8000, () => { t._fehler({ art: 'p2p', peer: o.id, text: 'keine direkte Verbindung' }); o._fehler({ art: 'p2p', peer: t.id, text: 'keine direkte Verbindung' }); });
        continue;
      }
      this.spaeter(aufbau, () => { if (t.aktiv && o.aktiv) { o._join(t.id); t._join(o.id); } });
    }
    return t;
  }
  sperren(a, b) { this.gesperrt.add(schl(a, b)); }
  spaeter(ms, fn) { this.post.push({ an: this.zeit + ms, n: this.post.length, fn }); }
  laufzeit(von, zu) {
    const o = this.opt;
    let l = o.latenz + (o.jitter ? (this.rnd() * 2 - 1) * o.jitter : 0);
    if (o.asym && von > zu) l *= 1 + o.asym;
    return Math.max(0, l);
  }
  zustellen(von, zu, kanal, daten) {
    this.zaehler.gesendet++;
    this.zaehler.bytes += daten instanceof Uint8Array ? daten.length : JSON.stringify(daten).length;
    if (this.opt.verlust && this.rnd() < this.opt.verlust) { this.zaehler.verloren++; return; }
    const kopie = daten instanceof Uint8Array ? daten.slice() : structuredClone(daten);
    this.spaeter(this.laufzeit(von, zu), () => { const t = this.teil.get(zu); if (t && t.aktiv && t.verbunden.has(von)) t._rein(kanal, kopie, von); });
  }
  // Zeit vorrücken (ms): fällige Zustellungen in Zeitreihenfolge
  schritt(ms) {
    const ende = this.zeit + ms;
    for (;;) {
      let bi = -1;
      for (let i = 0; i < this.post.length; i++) if (this.post[i].an <= ende && (bi < 0 || this.post[i].an < this.post[bi].an || (this.post[i].an === this.post[bi].an && this.post[i].n < this.post[bi].n))) bi = i;
      if (bi < 0) break;
      const p = this.post.splice(bi, 1)[0];
      this.zeit = Math.max(this.zeit, p.an);
      p.fn();
    }
    this.zeit = ende;
  }
  // abruptes Verschwinden (Akku leer, Funkloch): die anderen merken es erst nach abgangVerzug
  wegreissen(id) {
    const t = this.teil.get(id); if (!t) return;
    t.aktiv = false;
    for (const o of this.teil.values()) if (o !== t && o.verbunden.has(id)) this.spaeter(this.opt.abgangVerzug, () => o._leave(id));
    this.teil.delete(id);
  }
}

class FakeTransport {
  constructor(netz, id, opt) {
    this.netz = netz; this.id = id; this.aktiv = true;
    this.uhrVersatz = opt.uhr ?? 0; this.gang = opt.gang ?? 0;
    this.verbunden = new Set();
    this.h = { kanal: new Map(), join: [], leave: [], fehler: [] };
    this.jetzt = () => netz.zeit * (1 + this.gang) + this.uhrVersatz;
  }
  senden(kanal, daten, ziel = null) {
    if (!this.aktiv) return;
    const ziele = ziel == null ? [...this.verbunden] : Array.isArray(ziel) ? ziel : [ziel];
    for (const z of ziele) if (this.verbunden.has(z)) this.netz.zustellen(this.id, z, kanal, daten);
  }
  bei(kanal, fn) { this.h.kanal.set(kanal, fn); }
  beiBeitritt(fn) { this.h.join.push(fn); }
  beiAbgang(fn) { this.h.leave.push(fn); }
  beiFehler(fn) { this.h.fehler.push(fn); }
  peers() { return [...this.verbunden]; }
  verlassen() {
    if (!this.aktiv) return;
    this.aktiv = false;
    for (const o of this.netz.teil.values()) if (o !== this && o.verbunden.has(this.id)) this.netz.spaeter(this.netz.laufzeit(this.id, o.id), () => o._leave(this.id));
    this.netz.teil.delete(this.id);
    this.verbunden.clear();
  }
  _join(id) { if (this.verbunden.has(id)) return; this.verbunden.add(id); for (const f of this.h.join) f(id); }
  _leave(id) { if (!this.verbunden.delete(id)) return; for (const f of this.h.leave) f(id); }
  _rein(kanal, daten, von) { const f = this.h.kanal.get(kanal); if (f) f(daten, von); }
  _fehler(e) { for (const f of this.h.fehler) f(e); }
}

const schl = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
