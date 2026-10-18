// Online-Ablauf im Spiel (n35): Raum erstellen/beitreten, Lobby (Strecke + Landschaft/Wetter/Tageszeit vom Gastgeber,
// Stufe je Spieler, KI auffüllen, „Bereit“), Start, Revanche, Abbrüche, Neu-Verbinden nach dem Hintergrund.
// Kein DOM: die Anzeige (ui/online.js) liest zustand() und ruft die Methoden; main.js liefert das Spiel über `app`:
//   app.store                      Speicher (Name, Spieler-ID, Liste „Online“)
//   app.env()                      aktuelle Strecke (env) oder null
//   app.beschreibe()               aktuelle Strecke als Daten (game/onlinestrecke.js beschreibe)
//   app.ladeStrecke(desc, look)    Promise: Strecke aus Daten bauen (Gast), look = { thema, wetter, zeit }
//   app.look()                     { thema, wetter, zeit } der aktuellen Strecke (Gastgeber)
//   app.wendeLook(look)            Gast: neues Aussehen auf die schon geladene Strecke (optional)
//   app.startOnline(spiel)         Online-Rennen starten (main.js baut Race, ruft spiel.rennenBauen(race))
//   app.zumMenue()                 zurück ins Menü (Rennen abbrechen)
//   app.anzeige(art, daten)        Hinweis/Ansicht aktualisieren ('lobby', 'hinweis', 'ergebnis', 'status')
// opt: { verbinde(code) → Promise<Transport> (net/index.js verbinden), jetzt, neuerCode }.
// Node-Test: tests/node/test_onlinespiel.mjs (zwei „Geräte“ mit Fake-Netz und nachgebautem app).
import { Sitzung, SITZUNG } from '../net/sitzung.js';
import { neuerCode, normalisieren, teilenLink, vorlesbar } from '../net/code.js';
import { OnlineRennen, AUTO_SCHEMA, LIN, ONLINE, startDaten, kiFeld } from './online.js';
import { streckenKennung } from './onlinestrecke.js';
import { GAME_SPEED_STD } from './race.js';

export const SPIEL = { neuVerbindenAb: 4000, namenLaenge: 16 };

const lookKey = (l) => (l ? `${l.thema || ''}|${l.wetter || ''}|${l.zeit || ''}` : '');

export class OnlineSpiel {
  constructor(app, opt = {}) {
    this.app = app; this.opt = opt;
    this.S = null; this.code = null; this.rennen = null;
    this.strecke = null;          // aktuelle Strecke als Daten (Gastgeber: gewählt; Gast: empfangen)
    this.geladen = '';            // Kennung der hier geladenen Strecke
    this.laedt = null;            // Kennung, die gerade gebaut wird
    this.hinweise = [];           // [{ text, t }]
    this.verstecktSeit = null;
    this.revancheWunsch = new Set();
  }
  get aktiv() { return !!this.S && this.S.status !== 'weg'; }
  name() { return (this.app.store.settings.spielerName || '').trim().slice(0, SPIEL.namenLaenge) || 'Gast'; }
  setzeName(n) { this.app.store.settings.spielerName = String(n || '').trim().slice(0, SPIEL.namenLaenge); this.app.store.save(); if (this.S) this.S.setzeInfo({ name: this.name() }); }
  info() {
    const S = this.app.store.settings;
    return { name: this.name(), stufe: S.assist || 'medium', farbe: S.paint, geladen: this.geladen };
  }

  // ---------- Raum ----------
  async erstellen() {
    const code = (this.opt.neuerCode || neuerCode)();
    await this._oeffnen(code, true);
    this.waehleAktuelleStrecke();
    return code;
  }
  async beitreten(eingabe) {
    const code = normalisieren(eingabe);
    if (!code) { this.hinweis('Ungültiger Code – 4 Zeichen, ohne 0/O/1/I/L'); return null; }
    await this._oeffnen(code, false);
    return code;
  }
  async _oeffnen(code, gastgeber) {
    if (this.S) this.verlassen();
    this.code = code;
    const tr = await this.opt.verbinde(code);
    const S = this.S = new Sitzung(tr, { jetzt: this.opt.jetzt || tr.jetzt, sid: this._sid(), info: this.info(), gastgeber, schema: AUTO_SCHEMA, lin: LIN, maxMenschen: ONLINE.maxMenschen,
      einstellungen: { ki: 0, staerke: 'ebenbuertig', tempo: GAME_SPEED_STD } });
    S.on('lobby', () => { this._lobbyGesehen(); this.app.anzeige('lobby'); });
    S.on('status', (st) => {
      if (st === 'niemand') this.hinweis(`Kein Raum ${vorlesbar(code)} gefunden – Code prüfen. Klappt es nicht, blockiert vielleicht das Netz die Verbindung: WLAN probieren.`, 0);
      if (st === 'voll') this.hinweis(`Raum ${vorlesbar(code)} ist voll (${ONLINE.maxMenschen} Spieler).`, 0);
      this.app.anzeige('status', st);
    });
    S.on('fehler', (e) => {
      if (e.art === 'p2p') {
        // Partner über die Relays gefunden, direkte Verbindung scheitert (kein TURN): die Vermutung „kein Raum“ ist damit
        // widerlegt – ersetzen; ein Gast kennt den Namen des Gastgebers noch nicht
        const m = [...S.mitglieder.values()].find((x) => x.pid === e.peer);
        this.hinweise = this.hinweise.filter((h) => !h.text.startsWith('Kein Raum'));
        const wer = m ? m.info.name : S.istGastgeber ? 'einem Mitspieler' : `Raum ${vorlesbar(code)}`;
        this.hinweis(`Verbindung zu ${wer} nicht möglich (Netz blockiert direkte Verbindung) – WLAN probieren.`, 0);
      }
      if (e.art === 'version') this.hinweis('Ein Mitspieler hat eine andere Spielversion – bitte beide die Seite neu laden.', 0);
    });
    S.on('neu', (m, zurueck) => { this.hinweis(`${m.info.name} ist ${zurueck ? 'wieder da' : 'da'}`); if (S.istGastgeber && this.strecke) this._streckeSenden(m.pid); });
    S.on('weg', (m) => this.hinweis(`${m.info.name} ist weg`));
    S.on('still', (m, still) => { if (still) this.hinweis(`Verbindung zu ${m.info.name} wackelt …`); });
    S.on('gastgeber', (neu) => { this.hinweis(neu.sid === S.sid ? 'Du bist jetzt Gastgeber' : `${neu.info.name} ist jetzt Gastgeber`); if (neu.sid === S.sid && this.strecke) this._streckeSenden(); });
    S.on('meldung', (d, von) => this._meldung(d, von));
    S.on('start', () => this._start());
    S.on('ergebnis', (E) => this._ergebnis(E));
  }
  // feste Spieler-ID (Gerät) + Tab-Kennung (sessionStorage: zwei Tabs im selben Browser sind zwei Spieler; Neu-Laden im
  // selben Tab behält den Platz)
  _sid() {
    let tab = '';
    try { const ss = globalThis.sessionStorage; if (ss) { tab = ss.getItem('stuntbahn.tab') || Math.random().toString(36).slice(2, 6); ss.setItem('stuntbahn.tab', tab); } } catch { /* privat */ }
    return this.app.store.spielerId() + (tab ? '-' + tab : '');
  }
  verlassen() {
    if (this.rennen) { this.rennen.beenden(); this.rennen = null; }
    if (this.S) this.S.verlassen();
    this.S = null; this.code = null; this.strecke = null;
  }
  link() { return this.code ? teilenLink(this.code) : ''; }

  // ---------- Gastgeber ----------
  waehleAktuelleStrecke() {
    if (!this.S || !this.S.istGastgeber) return false;
    const d = this.app.beschreibe();
    if (!d) { this.hinweis('Diese Strecke lässt sich nicht teilen.'); return false; }
    this.strecke = d; this.geladen = streckenKennung(d);
    const L = this.app.look ? this.app.look() : {};
    this.S.setzeInfo({ geladen: this.geladen });
    this.S.setzeEinstellungen({ strecke: this.geladen, streckeName: d.name || '', look: L });
    this._streckeSenden();
    return true;
  }
  // Gastgeber hat Landschaft/Wetter/Tageszeit geändert (nur Optik): neuer Look für alle, Strecke bleibt
  lookGeaendert() { if (this.S && this.S.istGastgeber && this.app.look) this.S.setzeEinstellungen({ look: this.app.look() }); }
  setzeKi(n, staerke) { if (this.S && this.S.istGastgeber) this.S.setzeEinstellungen({ ki: Math.max(0, Math.min(5, n | 0)), ...(staerke ? { staerke } : {}) }); }
  // alle bereit (Gastgeber zählt immer als bereit) und alle mit der Strecke?
  startKlar() {
    if (!this.S || !this.S.istGastgeber) return { ok: false, grund: 'nur der Gastgeber startet' };
    const L = this.S.liste(), k = this.S.lobby.einst.strecke;
    if (!k) return { ok: false, grund: 'keine Strecke gewählt' };
    const ohne = L.filter((m) => m.sid !== this.S.sid && m.info.geladen !== k);
    if (ohne.length) return { ok: false, grund: `${ohne.map((m) => m.info.name).join(', ')} lädt noch die Strecke` };
    const nicht = L.filter((m) => m.sid !== this.S.sid && !m.bereit);
    if (nicht.length) return { ok: false, grund: `warte auf „Bereit“ von ${nicht.map((m) => m.info.name).join(', ')}` };
    return { ok: true };
  }
  starten(erzwingen = false) {
    const k = this.startKlar();
    if (!k.ok && !erzwingen) { this.hinweis(k.grund); return false; }
    const E = this.S.lobby.einst;
    const D = startDaten(this.S, { ki: E.ki, staerke: E.staerke, tempo: E.tempo });
    this.revancheWunsch.clear();
    this.S.starten(D.extra, D.kiIds);
    return true;
  }
  revanche() {
    if (!this.S) return;
    if (this.S.istGastgeber) this.starten(true);
    else { this.S.melden('revanche', {}, this.S._pidVon(this.S.lobby.host)); this.hinweis('Revanche-Wunsch geschickt'); }
  }
  zurLobby() { if (this.S && this.S.istGastgeber) this.S.zurLobby(); this.app.zumMenue(); this.app.anzeige('lobby'); }

  // ---------- jeder ----------
  setzeBereit(b) { if (this.S) this.S.setzeBereit(b); }
  stufeGeaendert() { if (this.S) this.S.setzeInfo({ stufe: this.app.store.settings.assist, farbe: this.app.store.settings.paint }); }
  hinweis(text, dauer = 4000) { this.hinweise.push({ text, t: this._jetzt(), dauer }); if (this.hinweise.length > 6) this.hinweise.shift(); this.app.anzeige('hinweis', text); }
  _jetzt() { return this.opt.jetzt ? this.opt.jetzt() : Date.now(); }

  // je Bild (Spiel) bzw. alle 50 ms (Menü/Lobby)
  takt() { if (this.S) this.S.takt(); }

  // App im Hintergrund: beim Zurückkommen nach > SPIEL.neuVerbindenAb ms neu verbinden (gleicher Platz)
  sichtbar(ja) {
    if (!this.S) return;
    if (!ja) { this.verstecktSeit = this._jetzt(); return; }
    const weg = this.verstecktSeit != null ? this._jetzt() - this.verstecktSeit : 0;
    this.verstecktSeit = null;
    if (weg > SPIEL.neuVerbindenAb) this.neuVerbinden();
  }
  async neuVerbinden() {
    if (!this.S || !this.code) return;
    this.hinweis('Verbinde neu …');
    const tr = await this.opt.verbinde(this.code);
    this.S.neuVerbinden(tr);
  }

  // ---------- intern ----------
  _streckeSenden(ziel = null) { if (this.S && this.strecke) this.S.melden('strecke', { d: this.strecke, kennung: this.geladen }, ziel, 30000); }
  _meldung(d, von) {
    if (d.k === 'strecke' && !this.S.istGastgeber) { this.strecke = d.d; this._ladeFallsNoetig(); }
    else if (d.k === 'brauche' && this.S.istGastgeber) this._streckeSenden(von.pid);
    else if (d.k === 'revanche' && this.S.istGastgeber) { this.revancheWunsch.add(von.sid); this.hinweis(`${von.info ? von.info.name : 'Jemand'} will Revanche`); }
  }
  _lobbyGesehen() {
    if (!this.S || this.S.istGastgeber) return;
    const k = this.S.lobby.einst.strecke;
    if (k && k !== this.geladen && (!this.strecke || streckenKennung(this.strecke) !== k) && this._brauchT !== k) {
      this._brauchT = k;
      this.S.melden('brauche', { kennung: k }, this.S._pidVon(this.S.lobby.host));
    }
    this._ladeFallsNoetig();
    // gleiche Strecke, neues Aussehen vom Gastgeber → nur die Optik nachziehen (nicht im Rennen)
    const look = this.S.lobby.einst.look;
    if (look && k && this.geladen === k && !this.laedt && this.lookAn !== lookKey(look) && this.S.lobby.phase !== 'rennen' && this.app.wendeLook) {
      this.lookAn = lookKey(look);
      Promise.resolve(this.app.wendeLook(look)).then(() => this.app.anzeige('lobby'));
    }
  }
  async _ladeFallsNoetig() {
    const k = this.S && this.S.lobby.einst.strecke;
    if (!k || !this.strecke || streckenKennung(this.strecke) !== k || this.geladen === k || this.laedt === k) return;
    this.laedt = k;
    try {
      const look = this.S.lobby.einst.look || {};
      await this.app.ladeStrecke(this.strecke, look);
      this.geladen = k; this.lookAn = lookKey(look);
      if (this.S) this.S.setzeInfo({ geladen: k });
    } catch (e) {
      this.hinweis('Strecke ließ sich nicht laden: ' + (e && e.message ? e.message : e), 0);
    } finally { this.laedt = null; }
    this.app.anzeige('lobby');
  }
  _start() {
    const L = this.S.lobby;
    if (L.einst.strecke !== this.geladen) { this.hinweis('Strecke fehlt noch – du startest, sobald sie geladen ist'); this._ladeFallsNoetig().then(() => { if (this.S && this.S.lobby.phase === 'rennen' && this.S.lobby.rennId === L.rennId) this.app.startOnline(this); }); return; }
    if (!(L.fahrer || []).includes(this.S.sid)) { this.hinweis('Rennen läuft – du fährst in der nächsten Runde mit'); return; }
    this.app.startOnline(this);
  }
  // von main.js nach dem Bau des Rennens (Race mit countdown 1e9, wreck aus): OnlineRennen + KI-Feld + Aufstellung
  rennenBauen(env, race, opt = {}) {
    if (this.rennen) this.rennen.beenden();
    const O = this.rennen = new OnlineRennen(this.S, env, race, opt);
    if (this.S.istGastgeber) kiFeld(env, O, race.assistKey, opt.kiOpt || {});
    O.aufstellen();
    return O;
  }
  _ergebnis(E) {
    const L = this.S.lobby, ich = E.find((e) => e.id === this.S.sid);
    if (ich && this.rennen && this.rennen.rennId === L.rennId && !this._eingetragen) {
      this._eingetragen = L.rennId;
      const env = this.app.env();
      this.app.store.submitOnline({ key: env && env.meta.key, name: L.einst.streckeName || (env && env.meta.name), t: ich.zeit, platz: ich.platz, von: E.length, stufe: this.app.store.settings.assist, mit: E.filter((e) => e.id !== this.S.sid).map((e) => e.name) });
    }
    this.app.anzeige('ergebnis', E);
  }
  // für die Anzeige
  zustand() {
    const S = this.S;
    if (!S) return { aktiv: false };
    const L = S.lobby;
    return {
      aktiv: true, code: this.code, vorlesbar: vorlesbar(this.code), link: this.link(), status: S.status, gastgeber: S.istGastgeber, phase: L.phase,
      ich: S.sid, einst: L.einst, ergebnis: L.ergebnis, geladen: this.geladen, laedt: !!this.laedt, start: this.startKlar(),
      mitglieder: S.liste().map((m) => ({ sid: m.sid, name: m.info.name, stufe: m.info.stufe, bereit: m.sid === L.host || m.bereit, host: m.sid === L.host, ich: m.sid === S.sid, still: !!m.still, rtt: m.sid === S.sid ? null : (S.istGastgeber ? m.rtt : (m.sid === L.host ? S.uhr.rtt : null)), nummer: m.nummer, strecke: m.info.geladen === L.einst.strecke })),
      hinweise: this.hinweise.filter((h) => !h.dauer || this._jetzt() - h.t < h.dauer).map((h) => h.text),
      wartet: L.phase === 'rennen' && !(L.fahrer || []).includes(S.sid),
    };
  }
}
export { SITZUNG };
