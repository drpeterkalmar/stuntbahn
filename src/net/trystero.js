// Transport über Trystero (n35 Netz-Schicht): WebRTC-Datenkanäle direkt zwischen den Geräten, Partnersuche über
// öffentliche Relays – Standard Nostr, Ausweich MQTT. Kein eigener Server, keine Schlüssel. Bibliothek liegt gepinnt
// unter vendor/trystero/ (tools/vendor_trystero.py) und wird erst hier, beim Öffnen von „Online“, geladen.
// Geprüft im Quellcode 0.26.0: Nostr nimmt 5 der 29 eingetragenen Relays (Auswahl gemischt nach appId), MQTT alle 4
// Broker (emqx, shiftr, hivemq, mosquitto); STUN von Google und Cloudflare, kein TURN. Je Peer ein zuverlässiger,
// geordneter Datenkanal (Zustände kommen also nie vertauscht, bei Verlust aber verspätet – der Puffer fängt das ab).
// Verschlüsselung: Die Verbindungsdaten (SDP) verschlüsselt Trystero mit dem Raumcode als Passwort, die Datenkanäle
// selbst sind per DTLS verschlüsselt (WebRTC).
// Strategie 'auto': Nostr sofort; ist nach AUSWEICH.nach ms noch niemand da, zusätzlich MQTT (beide Räume werden zu
// einem zusammengeführt: ein Peer, der in beiden auftaucht, zählt einmal). Schnittstelle wie fake.js.
// Node-Test (mit nachgebautem joinRoom): tests/node/test_netz_transport.mjs. Echt nur im Browser (Heavy-Job).

export const APP_ID = 'drpeterkalmar-stuntbahn-n35';
export const AUSWEICH = { nach: 6000 };
const PFAD = { nostr: '../../vendor/trystero/nostr.js', mqtt: '../../vendor/trystero/mqtt.js' };

// code: Raumcode; opt: { strategie: 'auto'|'nostr'|'mqtt'|'beide', module: { nostr, mqtt } (Test), laden(name) }
export async function trysteroTransport(code, opt = {}) {
  const T = new TrysteroTransport(code, opt);
  await T.start();
  return T;
}

export class TrysteroTransport {
  constructor(code, opt = {}) {
    this.code = code;
    this.opt = { strategie: 'auto', ...opt };
    this.raeume = [];                 // [{ name, room, m, z }]
    this.peerRaum = new Map();        // pid → [Namen der Räume, in denen er da ist] (erster = Hauptweg)
    this.h = { kanal: new Map(), join: [], leave: [], fehler: [] };
    this.aktiv = true;
    this.id = null;
    this._timer = null;
  }
  async _modul(name) {
    if (this.opt.module && this.opt.module[name]) return this.opt.module[name];
    if (this.opt.laden) return this.opt.laden(name);
    return import(PFAD[name]);
  }
  async start() {
    const s = this.opt.strategie;
    const erst = s === 'mqtt' ? ['mqtt'] : s === 'beide' ? ['nostr', 'mqtt'] : ['nostr'];
    for (const n of erst) await this._beitreten(n);
    if (s === 'auto') {
      this._timer = setTimeout(() => { if (this.aktiv && this.peerRaum.size === 0) this._beitreten('mqtt').catch((e) => this._fehler({ art: 'relay', text: String(e) })); }, AUSWEICH.nach);
    }
  }
  async _beitreten(name) {
    if (this.raeume.some((r) => r.name === name)) return;
    const M = await this._modul(name);
    if (!this.aktiv) return;
    this.id = M.selfId;
    const room = M.joinRoom({ appId: APP_ID, password: 'sb-' + this.code, relayConfig: { warnOnRelayFailure: false } }, 'raum-' + this.code, {
      onJoinError: (d) => this._fehler({ art: 'p2p', peer: d && d.peerId, text: String(d && d.error && d.error.message || d && d.error || 'Verbindung nicht möglich') }),
    });
    const r = { name, room, m: room.makeAction('sb-m'), z: room.makeAction('sb-z') };
    r.m.onMessage = (d, meta) => this._rein('m', d, meta && meta.peerId);
    r.z.onMessage = (d, meta) => this._rein('z', d, meta && meta.peerId);
    room.onPeerJoin = (pid) => this._join(name, pid);
    room.onPeerLeave = (pid) => this._leave(name, pid);
    this.raeume.push(r);
  }
  senden(kanal, daten, ziel = null) {
    if (!this.aktiv) return;
    const ziele = ziel == null ? [...this.peerRaum.keys()] : Array.isArray(ziel) ? ziel : [ziel];
    // je Raum die Peers, deren Hauptweg er ist (kein Peer bekommt etwas doppelt)
    for (const r of this.raeume) {
      const an = ziele.filter((p) => (this.peerRaum.get(p) || [])[0] === r.name);
      if (!an.length) continue;
      const a = kanal === 'z' ? r.z : r.m;
      a.send(daten, { target: an.length === 1 ? an[0] : an }).catch(() => {});
    }
  }
  bei(kanal, fn) { this.h.kanal.set(kanal, fn); }
  beiBeitritt(fn) { this.h.join.push(fn); }
  beiAbgang(fn) { this.h.leave.push(fn); }
  beiFehler(fn) { this.h.fehler.push(fn); }
  peers() { return [...this.peerRaum.keys()]; }
  verlassen() {
    if (!this.aktiv) return;
    this.aktiv = false;
    clearTimeout(this._timer);
    for (const r of this.raeume) { try { r.room.leave(); } catch (e) { /* schon weg */ } }
    this.raeume = []; this.peerRaum.clear();
  }
  _join(name, pid) {
    if (!this.aktiv) return;
    const w = this.peerRaum.get(pid);
    if (w) { if (!w.includes(name)) w.push(name); return; }
    this.peerRaum.set(pid, [name]);
    for (const f of this.h.join) f(pid);
  }
  _leave(name, pid) {
    const w = this.peerRaum.get(pid);
    if (!w) return;
    const i = w.indexOf(name); if (i >= 0) w.splice(i, 1);
    if (w.length) return;          // über den anderen Raum noch da
    this.peerRaum.delete(pid);
    if (this.aktiv) for (const f of this.h.leave) f(pid);
  }
  _rein(kanal, d, von) {
    if (!this.aktiv || !von) return;
    const f = this.h.kanal.get(kanal);
    if (!f) return;
    f(kanal === 'z' && !(d instanceof Uint8Array) ? new Uint8Array(d) : d, von);
  }
  _fehler(e) { for (const f of this.h.fehler) f(e); }
}
