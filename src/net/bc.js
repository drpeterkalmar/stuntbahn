// Transport über BroadcastChannel (n35 Netz-Schicht): mehrere Tabs/Seiten desselben Browsers bilden einen Raum –
// für Browser-Tests mit zwei Pages ohne Internet (?netz=bc). Künstliche Laufzeit/Schwankung/Verlust per URL:
// ?netzlag=75 (ms je Richtung) &netzjitter=30 &netzverlust=0.05. Abgang: geordnet per „weg“, sonst nach
// BC.still ms ohne Herzschlag (wie ein Funkloch). Schnittstelle wie fake.js.

export const BC = { herz: 1000, still: 4000 };

export function bcTransport(code, opt = {}) { return new BcTransport(code, opt); }

export class BcTransport {
  constructor(code, opt = {}) {
    this.opt = { latenz: 0, jitter: 0, verlust: 0, ...opt };
    this.id = opt.id || 'bc' + Math.random().toString(36).slice(2, 10);
    this.kanal = new (opt.BroadcastChannel || globalThis.BroadcastChannel)('stuntbahn-netz-' + code);
    this.h = { kanal: new Map(), join: [], leave: [], fehler: [] };
    this.da = new Map();              // pid → zuletzt (ms)
    this.aktiv = true;
    this.kanal.onmessage = (e) => this._post(e.data);
    this._schicken({ typ: 'da' });
    this._herz = setInterval(() => this._takt(), BC.herz);
    this._weg = () => this.verlassen();
    if (globalThis.addEventListener) globalThis.addEventListener('pagehide', this._weg);
  }
  _schicken(m) { if (this.aktiv) this.kanal.postMessage({ ...m, von: this.id }); }
  _post(m) {
    if (!this.aktiv || !m || m.von === this.id) return;
    if (m.an && m.an !== this.id && !(Array.isArray(m.an) && m.an.includes(this.id))) return;
    const zustellen = () => {
      if (!this.aktiv) return;
      if (m.typ === 'weg') { if (this.da.delete(m.von)) for (const f of this.h.leave) f(m.von); return; }
      const neu = !this.da.has(m.von);
      this.da.set(m.von, Date.now());
      if (neu) { for (const f of this.h.join) f(m.von); if (m.typ === 'da') this._schicken({ typ: 'da', an: m.von }); }
      if (m.typ === 'n') { const f = this.h.kanal.get(m.kanal); if (f) f(m.daten, m.von); }
    };
    // Steuer-Meldungen sofort, Daten mit künstlicher Laufzeit/Verlust
    if (m.typ !== 'n' || (!this.opt.latenz && !this.opt.jitter && !this.opt.verlust)) return zustellen();
    if (Math.random() < this.opt.verlust) return;
    setTimeout(zustellen, Math.max(0, this.opt.latenz + (Math.random() * 2 - 1) * this.opt.jitter));
  }
  _takt() {
    this._schicken({ typ: 'herz' });
    const t = Date.now();
    for (const [p, z] of this.da) if (t - z > BC.still) { this.da.delete(p); for (const f of this.h.leave) f(p); }
  }
  senden(kanal, daten, ziel = null) { this._schicken({ typ: 'n', kanal, daten, an: ziel }); }
  bei(kanal, fn) { this.h.kanal.set(kanal, fn); }
  beiBeitritt(fn) { this.h.join.push(fn); }
  beiAbgang(fn) { this.h.leave.push(fn); }
  beiFehler(fn) { this.h.fehler.push(fn); }
  peers() { return [...this.da.keys()]; }
  verlassen() {
    if (!this.aktiv) return;
    this._schicken({ typ: 'weg' });
    this.aktiv = false;
    clearInterval(this._herz);
    if (globalThis.removeEventListener) globalThis.removeEventListener('pagehide', this._weg);
    this.kanal.close();
    this.da.clear();
  }
}
