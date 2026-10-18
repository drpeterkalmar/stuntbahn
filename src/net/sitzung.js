// Sitzung (n35 Netz-Schicht, spielunabhängig): Raum mit 2–4 Menschen über einen Transport (fake.js, bc.js,
// trystero.js). Kein Server – einer ist Gastgeber: er führt die Lobby (Mitglieder, Einstellungen, Phase), gibt den
// Start vor, bestätigt Zieleinläufe und stellt die Zieltabelle auf. Geht er, wird der nächste in der Beitrittsfolge
// Gastgeber (alle rechnen dasselbe aus). Jedes Gerät rechnet sein eigenes Fahrzeug und sendet dessen Zustand binär
// (paket.js, 20–30 Hz); fremde Zustände landen je Absender und Platz in einem Interpolations-Puffer (puffer.js).
// Uhr-Abgleich gegen den Gastgeber (uhr.js): alle Zeiten (Start, Ziel, Pakete) in Sitzungszeit.
//
// Meldungen (Kanal 'm', JSON): { k: Art, i: laufende Nummer, r: 1 = bitte quittieren, … }. Zuverlässig wird es durch
// Quittung + Wiederholung (alle SITZUNG.wieder ms, verfällt nach `verfall` ms) und Doppel-Filter – auch über einen
// verlustbehafteten Weg (Test: 5 % Verlust); über Trystero (ohnehin zuverlässig) kostet das nur die Quittungen.
// Zustände (Kanal 'z', binär): ohne Quittung, Folgenummer, ältere werden verworfen.
// Zeit kommt nur über jetzt() und takt() – kein setTimeout im Kern: in Tests deterministisch, im Spiel ruft die
// Spielschleife (bzw. ein Intervall in der Lobby) takt() auf.
//
// Rollen-Wechsel: Lobby trägt `ep` (Gastgeber-Epoche, +1 je Wechsel) und `v` (Version). Angenommen wird die Lobby
// mit größerem (ep, v); zwei Gastgeber gleichzeitig (Netz kurz geteilt) → größere Epoche, dann kleinere Nummer
// gewinnt. Wer zurückkommt (App im Hintergrund, neu verbunden), holt sich die Gastgeber-Rolle nie zurück.
// Mitglieder werden über `sid` (feste Spieler-ID, im Gerät gespeichert) erkannt – nach Neu-Verbinden gleicher Platz.
// Node-Test: tests/node/test_netz.mjs, tests/node/test_netz_sitzung.mjs.

import { UhrAbgleich } from './uhr.js';
import { FremdPuffer } from './puffer.js';
import { packeEinzel, packeSammel, entpacke, neuer, zeitVoll } from './paket.js';

export const PROTOKOLL = 1;
export const SITZUNG = {
  maxMenschen: 4,
  wieder: 300,          // ms bis zur Wiederholung einer unquittierten Meldung
  verfall: 10000,       // ms, danach wird eine Meldung aufgegeben
  still: 3000,          // ms ohne Lebenszeichen → Mitglied „still“ (Hinweis „Verbindung wackelt“)
  suchen: 10000,        // ms ohne jeden Kontakt beim Beitreten → „Raum nicht gefunden“
  ohneGastgeber: 3000,  // ms mit Peers, aber ohne Gastgeber → der mit der kleinsten Nummer übernimmt
  vorlauf: 3000,        // ms von „Start“ bis „Los!“ (Countdown; Gastgeber legt zusätzlich die größte Laufzeit drauf)
  zielSchluss: 45000,   // ms nach dem ersten Zieleinlauf → Zieltabelle (Rest: nicht im Ziel / hochgerechnet)
  ziel: { spaet: 250 }, // ms: so viel darf ein gemeldeter Zieleinlauf nach dem Eintreffen beim Gastgeber liegen
};

// Hat Gastgeber A (Epoche, Nummer, sid) Vorrang vor B?
export function vorrang(epA, nrA, sidA, epB, nrB, sidB) {
  if (epA !== epB) return epA > epB;
  if (nrA !== nrB) return nrA < nrB;
  return sidA < sidB;
}

export class Sitzung {
  // transport: siehe fake.js; opt: { jetzt (ms eigene Uhr), sid, info, gastgeber (Raum erstellen), schema (paket.js),
  // lin (Felder linear interpolieren), maxMenschen, einstellungen (Startwerte des Gastgebers) }
  constructor(transport, opt = {}) {
    this.opt = { maxMenschen: SITZUNG.maxMenschen, lin: [], ...opt };
    this.jetzt = opt.jetzt || transport.jetzt || (() => performance.now());
    this.sid = opt.sid || 's' + Math.random().toString(36).slice(2, 10);
    this.info = { ...(opt.info || {}) };
    this.bereit = false;
    this.schema = opt.schema || null;
    this.uhr = new UhrAbgleich(this.jetzt);
    this.h = {};
    this.mitglieder = new Map();     // sid → { sid, pid, nummer, info, bereit, zuletzt, still, da }
    this.pid2sid = new Map();
    this.lobby = { ep: 0, v: 0, host: null, phase: 'lobby', einst: { ...(opt.einstellungen || {}) }, rennId: 0, startAt: null, ziel: {}, ergebnis: null, naechste: 1 };
    this.fremde = new Map();         // 'pid:platz' → { pid, sid, platz, puffer, seq, zuletzt }
    this.raus = new Map();           // i → { msg, ziele: Set, t0, tw }
    this.gesehen = new Map();        // pid → Set der letzten Nummern (Doppel-Filter)
    this.lfd = 1; this.seq = 0; this.seqS = 0;
    this.status = 'verbinde';        // 'verbinde' | 'lobby' | 'niemand' | 'voll' | 'weg'
    this.t0 = this.jetzt(); this.tKontakt = null; this.tOhne = null; this.pingT = -1e9;
    this.statistik = { rein: 0, raus: 0, bytesRaus: 0, wieder: 0 };
    this._anbinden(transport);
    if (opt.gastgeber) this._werdeGastgeber(true);
  }

  // ---------- öffentliche Schnittstelle ----------
  on(art, fn) { (this.h[art] ||= []).push(fn); return this; }
  emit(art, ...a) { for (const f of this.h[art] || []) f(...a); }
  get istGastgeber() { return this.lobby.host === this.sid; }
  get zeit() { return this.uhr.zeit(); }
  ich() { return this.mitglieder.get(this.sid); }
  // Mitglieder nach Beitrittsfolge (nur anwesende)
  liste() { return [...this.mitglieder.values()].filter((m) => m.da).sort((a, b) => a.nummer - b.nummer); }
  setzeInfo(info) { Object.assign(this.info, info); this._ichMelden(); }
  setzeBereit(b) { this.bereit = !!b; this._ichMelden(); }
  // nur Gastgeber: Einstellungen (Strecke, Runden, KI …) – Objekt, beliebig (Spiel)
  setzeEinstellungen(e) { if (!this.istGastgeber) return false; Object.assign(this.lobby.einst, e); this._lobbySenden(); return true; }
  // nur Gastgeber: Rennen starten (alle Anwesenden fahren). Vorlauf + größte Laufzeit, damit alle rechtzeitig wissen.
  // ki = IDs der KI-Gegner (rechnet der Gastgeber; ihre Zieleinläufe trägt er mit zielEintragen() ein).
  starten(extra = {}, ki = []) {
    if (!this.istGastgeber) return false;
    const rtt = Math.max(0, ...this.liste().map((m) => m.rtt || 0));
    const L = this.lobby;
    L.rennId++; L.phase = 'rennen'; L.startAt = Math.round(this.zeit + SITZUNG.vorlauf + rtt); L.ziel = {}; L.ergebnis = null; L.ersterZiel = null;
    L.fahrer = this.liste().map((m) => m.sid); L.ki = ki.slice(); L.kiAktiv = ki.length > 0;
    Object.assign(L.einst, extra);
    for (const m of this.mitglieder.values()) m.bereit = false;
    this.meinZiel = null; this.bereit = false;
    this._lobbySenden();
    this.emit('start', L.startAt, L.einst, L.rennId);
    return L.startAt;
  }
  // eigener Zieleinlauf: zeit = Rennzeit (s, mit Strafen, wie das Spiel sie zählt), daten = beliebig (z. B. Strafen)
  zielMelden(zeit, daten = {}) {
    const m = { k: 'ziel', rennId: this.lobby.rennId, zeit, sz: this.zeit, daten };
    this.meinZiel = m;
    if (this.istGastgeber) this._zielAnnehmen(this.sid, m, this.zeit);
    else this._senden(m, this.lobby.host ? this._pidVon(this.lobby.host) : null, true);
  }
  // nur Gastgeber: Ergebnis für einen Nicht-Menschen (KI-Gegner) eintragen
  zielEintragen(id, zeit, daten = {}) { if (this.istGastgeber) this._zielAnnehmen(id, { rennId: this.lobby.rennId, zeit, sz: this.zeit, daten, ki: true }, this.zeit, true); }
  // nur Gastgeber: Zieltabelle jetzt aufstellen (z. B. alle im Ziel oder Spiel bricht ab); rest = [{ id, fortschritt }]
  abschliessen(rest = []) {
    if (!this.istGastgeber || this.lobby.phase !== 'rennen') return;
    const L = this.lobby, fertig = Object.entries(L.ziel).map(([id, z]) => ({ id, zeit: z.zeit, sz: z.sz, ki: !!z.ki, daten: z.daten, name: z.daten && z.daten.name }));
    fertig.sort((a, b) => a.zeit - b.zeit || (a.id < b.id ? -1 : 1));
    const offen = rest.filter((r) => !L.ziel[r.id]).sort((a, b) => (b.fortschritt || 0) - (a.fortschritt || 0)).map((r) => ({ id: r.id, zeit: null, fortschritt: r.fortschritt, ki: !!r.ki, name: r.name }));
    // gefahren, aber weder im Ziel noch in `rest` (Verbindung weg) → ausgeschieden
    const bekannt = new Set([...fertig, ...offen].map((e) => e.id));
    const weg = [...(L.fahrer || []), ...(L.ki || [])].filter((id) => !bekannt.has(id)).map((id) => ({ id, zeit: null, weg: true, ki: (L.ki || []).includes(id) }));
    L.ergebnis = [...fertig, ...offen, ...weg].map((e, k) => ({ ...e, platz: k + 1, name: this.mitglieder.get(e.id)?.info.name ?? e.name ?? (this.opt.nameVon ? this.opt.nameVon(e.id) : null) ?? null }));
    L.phase = 'ergebnis';
    this._lobbySenden();
    this.emit('ergebnis', L.ergebnis);
  }
  // nur Gastgeber: zurück in die Lobby (neue Strecke wählen)
  zurLobby() { if (!this.istGastgeber) return; Object.assign(this.lobby, { phase: 'lobby', startAt: null, ergebnis: null }); this._lobbySenden(); }
  // eigene Meldung des Spiels (zuverlässig): art darf keine der internen Arten sein (p, P, hallo, lobby, ich, ziel, voll,
  // ev, tschuess, ack); kommt beim Empfänger als Ereignis 'meldung' (d, mitglied) an
  melden(art, daten = {}, ziel = null, verfall = SITZUNG.verfall) { this._senden({ ...daten, k: art }, ziel, true, verfall); }
  // Ereignis an alle (Rempler, Kurzruf …) – zuverlässig, verfällt schnell
  ereignis(art, daten = {}, ziel = null) { this._senden({ k: 'ev', art, daten, sz: this.zeit }, ziel, true, 1500); }

  // eigener Zustand: satz = Objekt nach Schema (Platz 0) – Aufruf mit 20–30 Hz
  sendeZustand(satz) {
    if (!this.schema) return;
    const b = packeEinzel(this.schema, this.seq = (this.seq + 1) & 0xffff, this.zeit, satz);
    this.statistik.bytesRaus += b.length;
    this.tr.senden('z', b);
  }
  // mehrere Körper in einem Paket (Gastgeber: KI-Gegner), saetze = [{ platz ≥ 1, … }]
  sendeSammel(saetze) {
    if (!this.schema || !saetze.length) return;
    const b = packeSammel(this.schema, this.seqS = (this.seqS + 1) & 0xffff, this.zeit, saetze);
    this.statistik.bytesRaus += b.length;
    this.tr.senden('z', b);
  }
  // Lage eines fremden Körpers jetzt (interpoliert); key = 'pid:platz' aus fremdeListe()
  // voraus ∈ [0, 1]: um diesen Anteil des Puffer-Verzugs vorausgerechnet (puffer.js)
  lage(key, zeit = this.zeit, voraus = 0) { const f = this.fremde.get(key); return f ? f.puffer.abtasten(zeit, voraus) : null; }
  fremdeListe() { return [...this.fremde.entries()].map(([key, f]) => ({ key, ...f })); }

  // je Bild bzw. alle ~50 ms: Wiederholungen, Uhr-Anfragen, Stille, Gastgeber-Wahl, Zieltabelle
  takt() {
    const t = this.jetzt();
    // Wiederholung unquittierter Meldungen
    for (const [i, r] of this.raus) {
      for (const pid of r.ziele) if (!this.tr.peers().includes(pid)) r.ziele.delete(pid);
      if (!r.ziele.size || t - r.t0 > r.verfall) { this.raus.delete(i); continue; }
      if (t - r.tw >= SITZUNG.wieder) { r.tw = t; this.statistik.wieder++; this.tr.senden('m', r.msg, [...r.ziele]); }
    }
    // Uhr-Anfrage an den Gastgeber
    const host = this.lobby.host && this.lobby.host !== this.sid ? this._pidVon(this.lobby.host) : null;
    if (host && t - this.pingT >= this.uhr.abstand()) { this.pingT = t; this.tr.senden('m', { k: 'p', a: t, r: this.uhr.rtt }, host); }
    // Stille
    for (const m of this.mitglieder.values()) {
      if (m.sid === this.sid || !m.da) continue;
      const still = t - m.zuletzt > SITZUNG.still;
      if (still !== !!m.still) { m.still = still; this.emit('still', m, still); }
    }
    // Beitreten: niemand da?
    if (this.status === 'verbinde' && !this.istGastgeber && this.tKontakt == null && t - this.t0 > SITZUNG.suchen) { this.status = 'niemand'; this.emit('status', this.status); }
    // Peers da, aber kein Gastgeber (er ist gegangen, bevor wir die Lobby hatten) → kleinste Nummer übernimmt
    if (!this.lobby.host && this.tr.peers().length) {
      if (this.tOhne == null) this.tOhne = t;
      else if (t - this.tOhne > SITZUNG.ohneGastgeber) { this.tOhne = null; this._wahl(); }
    } else this.tOhne = null;
    // Gastgeber: Zieltabelle, wenn alle (Menschen, KI solange sie fährt) im Ziel sind oder die Frist abläuft.
    // opt.rest() liefert die noch Fahrenden [{ id, fortschritt, ki, name }] für die Tabelle (Spiel).
    if (this.istGastgeber && this.lobby.phase === 'rennen') {
      const L = this.lobby;
      const offen = [...(L.fahrer || []).filter((s) => this.mitglieder.get(s)?.da), ...(L.kiAktiv ? L.ki || [] : [])].filter((s) => !L.ziel[s]);
      const imZiel = Object.keys(L.ziel).length > 0;
      if ((imZiel && !offen.length) || (L.ersterZiel != null && this.zeit - L.ersterZiel > SITZUNG.zielSchluss)) this.abschliessen(this.opt.rest ? this.opt.rest() : []);
    }
  }

  verlassen() {
    this._senden({ k: 'tschuess' }, null, false);
    this.tr.verlassen();
    this.status = 'weg';
  }
  // neu verbinden (App war im Hintergrund): neuer Transport, gleiche sid → gleicher Platz; Rolle immer Gast
  neuVerbinden(transport) {
    try { this.tr.verlassen(); } catch (e) { /* schon weg */ }
    this.raus.clear(); this.gesehen.clear(); this.fremde.clear(); this.pid2sid.clear();
    for (const m of this.mitglieder.values()) if (m.sid !== this.sid) m.da = false;
    // Rolle Gast; ist niemand mehr da bzw. hat keiner übernommen, wählt takt() nach SITZUNG.ohneGastgeber neu
    this.lobby.host = null; this.uhr.alsGast(); this.uhr.neuerBezug();
    this.status = 'verbinde'; this.t0 = this.jetzt(); this.tKontakt = null;
    this._anbinden(transport);
  }

  // ---------- intern ----------
  _anbinden(tr) {
    this.tr = tr;
    this.pid = tr.id;
    const ich = this.mitglieder.get(this.sid) || { sid: this.sid, nummer: 0, bereit: false };
    Object.assign(ich, { pid: tr.id, info: this.info, bereit: this.bereit, zuletzt: this.jetzt(), da: true });
    this.mitglieder.set(this.sid, ich); this.pid2sid.set(tr.id, this.sid);
    // Rückrufe eines alten Transports (nach neuVerbinden) ignorieren
    tr.bei('m', (d, von) => { if (this.tr === tr) this._meldung(d, von); });
    tr.bei('z', (d, von) => { if (this.tr === tr) this._zustand(d, von); });
    tr.beiBeitritt((pid) => { if (this.tr === tr) this._beitritt(pid); });
    tr.beiAbgang((pid) => { if (this.tr === tr) this._abgang(pid); });
    if (tr.beiFehler) tr.beiFehler((e) => { if (this.tr === tr) this.emit('fehler', e); });
  }
  _pidVon(sid) { return this.mitglieder.get(sid)?.pid ?? null; }
  _senden(msg, ziel = null, zuverlaessig = true, verfall = SITZUNG.verfall) {
    const m = { ...msg, i: this.lfd++ };
    const ziele = ziel == null ? this.tr.peers() : Array.isArray(ziel) ? ziel : [ziel];
    if (!ziele.length && ziel == null) return;
    if (zuverlaessig) { m.r = 1; this.raus.set(m.i, { msg: m, ziele: new Set(ziele), t0: this.jetzt(), tw: this.jetzt(), verfall }); }
    this.statistik.raus++;
    this.tr.senden('m', m, ziel == null ? null : ziele);
  }
  _beitritt(pid) {
    this.tKontakt ??= this.jetzt();
    this._senden({ k: 'hallo', sid: this.sid, info: this.info, bereit: this.bereit, proto: PROTOKOLL, host: this.istGastgeber }, pid);
    if (this.istGastgeber) this._lobbySenden(pid);
  }
  _abgang(pid) {
    const sid = this.pid2sid.get(pid);
    for (const [k, f] of this.fremde) if (f.pid === pid) this.fremde.delete(k);
    for (const r of this.raus.values()) r.ziele.delete(pid);
    if (!sid) return;
    const m = this.mitglieder.get(sid);
    if (!m || m.pid !== pid) return;     // schon mit neuer Verbindung zurück
    m.da = false;
    this.emit('weg', m);
    if (sid === this.lobby.host) this._wahl();
    else if (this.istGastgeber) this._lobbySenden();
  }
  // nächster Gastgeber: anwesend, kleinste Nummer (Nummer 0 = noch keine → nach sid)
  _wahl() {
    const kand = [...this.mitglieder.values()].filter((m) => m.da && (m.sid === this.sid || this.tr.peers().includes(m.pid)));
    kand.sort((a, b) => (a.nummer || 1e9) - (b.nummer || 1e9) || (a.sid < b.sid ? -1 : 1));
    const neu = kand[0];
    if (!neu) return;
    const alt = this.lobby.host;
    if (neu.sid === this.sid) this._werdeGastgeber(false);
    else { this.lobby.host = neu.sid; this.uhr.neuerBezug(); this.pingT = -1e9; }
    this.emit('gastgeber', neu, alt);
  }
  _werdeGastgeber(neuerRaum) {
    const L = this.lobby;
    L.host = this.sid; L.ep++; L.v++;
    this.uhr.alsGastgeber();
    const ich = this.ich();
    if (!ich.nummer) ich.nummer = L.naechste++;
    if (neuerRaum) this.status = 'lobby';
    else {
      // Übernahme im Rennen: die KI-Gegner rechnete der alte Gastgeber – sie fahren nicht weiter; eigener Zieleinlauf
      // (falls die Bestätigung des alten Gastgebers fehlte) wird jetzt selbst bestätigt
      L.kiAktiv = false;
      if (this.meinZiel && L.phase === 'rennen' && this.meinZiel.rennId === L.rennId && !L.ziel[this.sid]) { this._lobbySenden(); this._zielAnnehmen(this.sid, this.meinZiel, this.zeit); return; }
    }
    this._lobbySenden();
  }
  _ichMelden() {
    const ich = this.ich(); ich.info = this.info; ich.bereit = this.bereit;
    if (this.istGastgeber) this._lobbySenden();
    else if (this.lobby.host) this._senden({ k: 'ich', info: this.info, bereit: this.bereit }, this._pidVon(this.lobby.host));
  }
  // Lobby-Abbild (was alle sehen)
  _lobbyBild() {
    const L = this.lobby;
    return {
      k: 'lobby', ep: L.ep, v: L.v, host: L.host, phase: L.phase, einst: L.einst, rennId: L.rennId, startAt: L.startAt,
      ziel: L.ziel, ergebnis: L.ergebnis, fahrer: L.fahrer || [], ki: L.ki || [], kiAktiv: !!L.kiAktiv, naechste: L.naechste, ersterZiel: L.ersterZiel ?? null,
      mitglieder: [...this.mitglieder.values()].map((m) => ({ sid: m.sid, pid: m.pid, nummer: m.nummer, info: m.info, bereit: m.bereit, da: m.da })),
    };
  }
  _lobbySenden(ziel = null) {
    if (ziel == null) this.lobby.v++;
    this._senden(this._lobbyBild(), ziel);
    this.emit('lobby', this.lobby);
  }
  _meldung(d, von) {
    if (!d || typeof d !== 'object') return;
    this.statistik.rein++;
    if (d.k === 'ack') { const r = this.raus.get(d.a); if (r) { r.ziele.delete(von); if (!r.ziele.size) this.raus.delete(d.a); } return; }
    if (d.r) this.tr.senden('m', { k: 'ack', a: d.i }, von);
    if (d.i != null) {
      const g = this.gesehen.get(von) || new Set();
      if (g.has(d.i)) return;
      g.add(d.i); if (g.size > 400) g.delete(g.values().next().value);
      this.gesehen.set(von, g);
    }
    const sid = this.pid2sid.get(von), m = sid && this.mitglieder.get(sid);
    if (m) m.zuletzt = this.jetzt();
    switch (d.k) {
      case 'p': if (this.istGastgeber) { this.tr.senden('m', { k: 'P', a: d.a, h: this.zeit }, von); if (m && d.r != null) m.rtt = d.r; } return;
      case 'P': {
        if (this._pidVon(this.lobby.host) !== von) return;
        this.uhr.probe(d.a, d.h);
        const ich = this.ich(); if (ich) ich.rtt = this.uhr.rtt;
        if (m) m.rtt = this.uhr.rtt;
        return;
      }
      case 'hallo': return this._hallo(d, von);
      case 'lobby': return this._lobbyRein(d, von);
      case 'ich': if (this.istGastgeber && m) { m.info = d.info; m.bereit = !!d.bereit; this._lobbySenden(); } return;
      case 'ziel': if (this.istGastgeber && sid) this._zielAnnehmen(sid, d, this.zeit); return;
      case 'voll': this.status = 'voll'; this.emit('status', 'voll'); return;
      case 'ev': this.emit('ereignis', d.art, d.daten, m || { pid: von }, d.sz); return;
      case 'tschuess': return;
      default: this.emit('meldung', d, m || { pid: von });
    }
  }
  _hallo(d, von) {
    this.tKontakt ??= this.jetzt();
    if (d.proto !== PROTOKOLL) { this.emit('fehler', { art: 'version', peer: von, text: 'andere Spielversion' }); return; }
    let m = this.mitglieder.get(d.sid);
    if (!m) {
      // Gastgeber: Raum voll?
      const menschen = this.liste().length;
      if (this.istGastgeber && menschen >= this.opt.maxMenschen) { this._senden({ k: 'voll' }, von); return; }
      m = { sid: d.sid, nummer: 0, rtt: null };
      this.mitglieder.set(d.sid, m);
    }
    const alt = m.pid;
    if (alt && alt !== von) this.pid2sid.delete(alt);
    Object.assign(m, { pid: von, info: d.info, bereit: !!d.bereit, zuletzt: this.jetzt(), da: true, still: false });
    this.pid2sid.set(von, d.sid);
    if (this.istGastgeber) {
      if (!m.nummer) m.nummer = this.lobby.naechste++;
      this._lobbySenden();
      this.emit('neu', m, !!alt);
    } else this.emit('neu', m, !!alt);
  }
  _lobbyRein(d, von) {
    const L = this.lobby, sender = d.host;
    // nur vom (behaupteten) Gastgeber selbst; seine Peer-ID steht in der Mitgliederliste (falls sein „hallo“ noch fehlt)
    const he = (d.mitglieder || []).find((x) => x.sid === sender);
    if (!he || he.pid !== von) return;
    this.pid2sid.set(von, sender);
    // Vorrang zweier Gastgeber: größere Epoche, dann kleinere Nummer, dann kleinere sid
    const seinNr = d.mitglieder.find((x) => x.sid === sender)?.nummer || 1e9;
    if (this.istGastgeber && sender !== this.sid) {
      if (!vorrang(d.ep, seinNr, sender, L.ep, this.ich().nummer || 1e9, this.sid)) { this._lobbySenden(von); return; }   // ich bleibe
      this.uhr.alsGast();
    } else if (L.host === sender) {
      if (d.ep < L.ep || (d.ep === L.ep && d.v <= L.v)) return;     // alt bzw. doppelt
    } else if (L.host) {
      if (!vorrang(d.ep, seinNr, sender, L.ep, this.mitglieder.get(L.host)?.nummer || 1e9, L.host)) return;
    }
    const hostWechsel = L.host !== sender;
    const phaseAlt = L.phase, rennAlt = L.rennId;
    Object.assign(L, { ep: d.ep, v: d.v, host: sender, phase: d.phase, einst: d.einst, rennId: d.rennId, startAt: d.startAt, ziel: d.ziel || {}, ergebnis: d.ergebnis, fahrer: d.fahrer || [], ki: d.ki || [], kiAktiv: !!d.kiAktiv, naechste: d.naechste, ersterZiel: d.ersterZiel });
    const peers = this.tr.peers();
    for (const x of d.mitglieder) {
      if (x.sid === this.sid) { this.ich().nummer = x.nummer; continue; }
      const m = this.mitglieder.get(x.sid) || { sid: x.sid, zuletzt: this.jetzt(), rtt: null };
      Object.assign(m, { pid: x.pid, nummer: x.nummer, info: x.info, bereit: x.bereit, da: !!x.da && peers.includes(x.pid) });
      if (m.da) this.pid2sid.set(x.pid, x.sid);
      this.mitglieder.set(x.sid, m);
    }
    if (hostWechsel) { this.uhr.neuerBezug(); this.pingT = -1e9; }
    if (this.status === 'verbinde') { this.status = 'lobby'; this.emit('status', 'lobby'); }
    this.emit('lobby', L);
    if (L.phase === 'rennen' && (phaseAlt !== 'rennen' || rennAlt !== L.rennId)) { this.meinZiel = null; this.bereit = false; this.emit('start', L.startAt, L.einst, L.rennId); }
    // Gastgeber (z. B. neu nach einem Wechsel) kennt meinen Zieleinlauf nicht → noch einmal melden (höchstens 1× je s)
    if (L.phase === 'rennen' && this.meinZiel && this.meinZiel.rennId === L.rennId && !L.ziel[this.sid] && (hostWechsel || this.jetzt() - (this.zielNachT || -1e9) > 1000)) {
      this.zielNachT = this.jetzt();
      this._senden(this.meinZiel, von);
    }
    if (L.phase === 'ergebnis' && phaseAlt !== 'ergebnis') this.emit('ergebnis', L.ergebnis);
  }
  _zielAnnehmen(sid, d, jetzt, ki = false) {
    const L = this.lobby;
    if (L.phase !== 'rennen' || d.rennId !== L.rennId || L.ziel[sid]) return;
    // Zeitstempel in Sitzungszeit: gemeldet (sz) nicht später als jetzt + spaet; sonst gilt das Eintreffen
    const sz = Number.isFinite(d.sz) && d.sz <= jetzt + SITZUNG.ziel.spaet && d.sz > L.startAt ? d.sz : jetzt;
    L.ziel[sid] = { zeit: d.zeit, sz, bestaetigt: jetzt, daten: d.daten || {}, ki: ki || !!d.ki };
    if (L.ersterZiel == null) L.ersterZiel = jetzt;
    this._lobbySenden();
    this.emit('zielBestaetigt', sid, L.ziel[sid]);
  }
  _zustand(bytes, von) {
    if (!this.schema) return;
    const P = entpacke(this.schema, bytes);
    if (!P) return;
    const sid = this.pid2sid.get(von);
    const m = sid && this.mitglieder.get(sid);
    const jetzt = this.zeit;
    if (m) m.zuletzt = this.jetzt();
    const t = zeitVoll(P.t, jetzt);
    for (const s of P.saetze) {
      const key = von + ':' + s.platz;
      let f = this.fremde.get(key);
      if (!f) { f = { pid: von, sid, platz: s.platz, puffer: new FremdPuffer({ lin: this.opt.lin }), seq: null, zuletzt: 0, ki: s.platz > 0 }; this.fremde.set(key, f); this.emit('fremdNeu', key, f); }
      // vertauscht angekommen: älteres Paket darf noch in den Puffer (einsortiert), doppelt nicht
      if (f.seq != null && P.seq === f.seq) continue;
      if (neuer(P.seq, f.seq)) { f.seq = P.seq; f.letzter = s; }
      f.zuletzt = jetzt;
      f.puffer.rein(t, s, jetzt);
    }
  }
}
