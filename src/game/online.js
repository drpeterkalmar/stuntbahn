// Online-Rennen (n35): verbindet die spielunabhängige Netz-Schicht (src/net/) mit der Stuntbahn – Startaufstellung,
// Countdown nach der Sitzungsuhr, eigener Zustand (25 Hz, binär), fremde Autos (Interpolation → kinematischer Körper für
// die Auto-Auto-Kollision und für die Darstellung mit gfx/gegnervis.js), Rempler-Ereignis, Rangliste fürs HUD
// (game/rennfeld.js), Zieleinlauf an den Gastgeber, KI-Gegner (rechnet nur der Gastgeber, sendet sie mit 15 Hz).
// Ohne Grafik und ohne DOM – läuft in Node (tests/node/test_online.mjs: zwei echte Autopilot-Rennen über das Fake-Netz).
//
// Regeln im Online-Rennen (Entscheidungen Vorbau, im Bericht begründet):
// - gemeinsames Spieltempo (Gastgeber-Einstellung `tempo`, Standard GAME_SPEED_STD 1,25) – sonst liefen die Welten
//   unterschiedlich schnell (Mittel hat solo 1,0);
// - Totalschaden aus (Rückspulen/Reset kostet Zeit auf der Uhr, nie Zeit zurück);
// - Rennzeit = Spielzeit seit „Los!“ (Sitzungsuhr × Tempo) + Strafen; die eigene Uhr wird nur vorwärts nachgezogen
//   (Ruckler am Handy kosten keine Zeit und bringen keine);
// - KI ohne Gummiband (es würde nur am Gastgeber hängen), Rückspulen des Gastgebers spult die KI nicht mit.
import { schema } from '../net/paket.js';
import { qmul, qkonj } from '../net/puffer.js';
import { startRaster, rangliste, Zeitnahme, abstaende, zielFortschritt } from './rennfeld.js';
import { stoss, HAERTE, HAERTE_JE_STUFE } from '../physics/autoauto.js';
import { CAR_DEF } from '../physics/car.js';
import { GAME_SPEED_STD, PENALTY, ASSISTS } from './race.js';
import { GegnerFeld, gegnerListe, STAERKE_STD } from '../ai/gegner.js';

const urlQ = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
// Menü „👥 Online“: im Vorbau Standard AUS (?online=1 zeigt es; ein Link mit ?raum= auch) – der Heavy-Job schaltet nach
// der Browser-Abnahme auf an
export const ONLINE_STANDARD = false;
export const ONLINE = {
  hz: 25,              // eigener Zustand je s
  kiHz: 15,            // KI-Gegner (Gastgeber) je s
  maxMenschen: 4, maxAutos: 6,
  geist: 1.5,          // s nach einem Reset/Rücksetzen eines fremden Autos: keine Kollision (wie GEIST in ai/gegner.js)
  rempler: { vMin: 1.5, abstand: 0.25 },   // m/s Stoß-Tempo für ein Rempler-Ereignis, s zwischen zwei je Paar
  p2pHinweis: 10000,   // ms: keine direkte Verbindung → ehrliche Meldung
  nachlauf: 45,        // s: so lange wartet die Zieltabelle nach dem ersten Zieleinlauf (SITZUNG.zielSchluss)
  // fremde Autos um den Puffer-Verzug vorausgerechnet zeigen und anstoßen (1) bzw. so, wie der Puffer sie hat (0, wie im Brief:
  // ~100 ms zurück). Messung tools/online_mess.mjs (Autopilot-Fahrt, 25 Hz, 5 % Verlust): mit 0 liegt das gezeigte Auto im
  // Mittel 3,0 m (Ping 0–50 ms) bzw. 4,8 m (150 ms) hinter dem echten, mit 1 nur 0,2–0,4 m → Rempler passieren dort, wo die
  // Autos wirklich sind. Nachteil: bei Vollbremsung/Crash schießt das Auto kurz über (≤ Tempo × Verzug). ?netzvoraus=0 = aus.
  voraus: urlQ && urlQ.has('netzvoraus') ? Math.max(0, Math.min(1, +urlQ.get('netzvoraus') || 0)) : 1,
};
export function onlineOptionen(search = urlQ ? location.search : '') {
  const q = new URLSearchParams(search);
  return { menue: q.get('online') === '1' || q.has('raum') || (ONLINE_STANDARD && q.get('online') !== '0') };
}

// Zustand eines Autos (eigenes und KI): 34 Byte je Satz
export const AUTO_SCHEMA = schema([
  ['px', 'f32'], ['py', 'f32'], ['pz', 'f32'], ['q', 'quat'],
  ['vx', 'i16', 0.01], ['vy', 'i16', 0.01], ['vz', 'i16', 0.01],
  ['lenk', 'i8', 0.01],          // Radeinschlag vorn (rad)
  ['gas', 'u8', 1 / 255],
  ['nitro', 'u8', 1 / 255],      // car.boost (Flammen)
  ['f', 'bits', ['crash', 'luft', 'bremse', 'ziel', 'geist', 'hupf']],
  ['sprung', 'u8'],              // Zähler: Reset/Rückspulen/Überspringen (keine Interpolation darüber)
  ['fort', 'f32'],               // Fortschritt (m, Runden eingerechnet) – Rangliste
]);
export const LIN = ['lenk', 'gas', 'nitro', 'fort'];

// Lackfarben für Menschen ohne eigene Farbe (Nummer 1–4), gut unterscheidbar von den KI-Farben
export const MENSCH_FARBEN = [0xa3120e, 0x1d6fd8, 0x18a058, 0xe0a100];

// Namensschild: Name + Fahrhilfe-Symbol (jeder fährt mit eigener Stufe)
export function schildName(info) {
  const A = ASSISTS[info && info.stufe];
  return ((info && info.name) || 'Gast').slice(0, 16) + (A ? ' ' + A.icon : '');
}

// Fremdes Auto als kinematischer Körper (Schnittstelle wie physics/car.js für autoauto.stoss mit festB und für
// gfx/gegnervis.js sync): Lage aus dem Netz, Räder für die Optik nachgebildet.
export class FremdAuto {
  constructor() {
    this.pos = { x: 0, y: -1000, z: 0 }; this.q = { x: 0, y: 0, z: 0, w: 1 }; this.v = { x: 0, y: 0, z: 0 }; this.w = { x: 0, y: 0, z: 0 };
    this.frame = { r: { x: 1, y: 0, z: 0 }, u: { x: 0, y: 1, z: 0 }, f: { x: 0, y: 0, z: -1 } };
    this.def = CAR_DEF;
    this.wheels = CAR_DEF.wheels.map((w) => ({ front: w.front, comp: CAR_DEF.rest * 0.35, contact: true, spin: 0, steer: 0 }));
    this.onGround = 4; this.surfaceKind = 0; this.crash = null; this.boost = 0;
    this.fort = 0; this.flags = {}; this.sprung = 0; this.geistBis = 0; this.gueltig = false; this.art = 'leer';
    this.lastImpact = 0;
  }
  // o = Ausgabe von FremdPuffer.abtasten; dt = s seit dem letzten Setzen (Drehrate, Radspin)
  setze(o, dt, jetztS) {
    if (!o) { this.gueltig = false; return; }
    const sprung = o.sprung !== this.sprung;
    if (sprung && this.gueltig) this.geistBis = jetztS + ONLINE.geist;
    // Drehrate aus der Lageänderung (für den Punkt-Impuls im Stoß), nicht über einen Sprung
    if (this.gueltig && !sprung && dt > 1e-4) {
      const dq = qmul([o.q.x, o.q.y, o.q.z, o.q.w], qkonj([this.q.x, this.q.y, this.q.z, this.q.w]));
      const s = dq[3] < 0 ? -2 / dt : 2 / dt;
      this.w.x = dq[0] * s; this.w.y = dq[1] * s; this.w.z = dq[2] * s;
    } else { this.w.x = this.w.y = this.w.z = 0; }
    this.pos.x = o.px; this.pos.y = o.py; this.pos.z = o.pz;
    this.q.x = o.q.x; this.q.y = o.q.y; this.q.z = o.q.z; this.q.w = o.q.w;
    this.v.x = o.vx; this.v.y = o.vy; this.v.z = o.vz;
    this.sprung = o.sprung; this.fort = o.fort || 0; this.flags = o.f || {}; this.boost = o.nitro || 0;
    this.crash = this.flags.crash ? 'netz' : null;
    const luft = !!this.flags.luft;
    this.onGround = luft ? 0 : 4;
    rahmen(this.q, this.frame);
    const vF = this.v.x * this.frame.f.x + this.v.y * this.frame.f.y + this.v.z * this.frame.f.z;
    for (const w of this.wheels) { w.steer = w.front ? (o.lenk || 0) : 0; w.spin += (vF / CAR_DEF.wheelR) * dt; w.contact = !luft; w.comp = luft ? 0.02 : CAR_DEF.rest * 0.35; }
    this.gueltig = true;
  }
  geist(jetztS) { return !this.gueltig || jetztS < this.geistBis || !!this.flags.geist || !!this.flags.crash || this.art === 'halt'; }
  fwdSpeed() { const f = this.frame.f; return this.v.x * f.x + this.v.y * f.y + this.v.z * f.z; }
  speed() { return Math.hypot(this.v.x, this.v.y, this.v.z); }
  _pointVel(px, py, pz, out) {
    const rx = px - this.pos.x, ry = py - this.pos.y, rz = pz - this.pos.z, w = this.w;
    out.x = this.v.x + (w.y * rz - w.z * ry); out.y = this.v.y + (w.z * rx - w.x * rz); out.z = this.v.z + (w.x * ry - w.y * rx);
    return out;
  }
  // festB: werden nie aufgerufen; zur Sicherheit „unendlich schwer“
  _kEff() { return 0; }
  _impulse() {}
}
// Achsen aus der Quaternion (wie car.js updateFrame: r = +x, u = +y, f = −z); v' = v + w·t + q×t mit t = 2·(q×v)
function rahmen(q, F) {
  const rot = (x, y, z, o) => {
    const tx = 2 * (q.y * z - q.z * y), ty = 2 * (q.z * x - q.x * z), tz = 2 * (q.x * y - q.y * x);
    o.x = x + q.w * tx + (q.y * tz - q.z * ty); o.y = y + q.w * ty + (q.z * tx - q.x * tz); o.z = z + q.w * tz + (q.x * ty - q.y * tx);
  };
  rot(1, 0, 0, F.r); rot(0, 1, 0, F.u); rot(0, 0, -1, F.f);
}

// Eigener Zustand aus dem Rennen
export function zustandEigen(race, sprung, geist = false) {
  const c = race.car;
  return {
    px: c.pos.x, py: c.pos.y, pz: c.pos.z, q: c.q, vx: c.v.x, vy: c.v.y, vz: c.v.z,
    lenk: c.wheels[0].steer || 0, gas: c.input.throttle || 0, nitro: c.boost || 0,
    f: { crash: race.state === 'wreck' || race.state === 'reset' || !!c.crash, luft: c.onGround === 0, bremse: (c.input.brake || 0) > 0.3, ziel: race.state === 'finished', geist, hupf: race.hopState === 'air' },
    sprung: sprung & 255, fort: race.tracker.progress(),
  };
}
// Zustand eines KI-Gegners (ai/gegner.js GegnerFahrer)
export function zustandKi(g, platz) {
  const c = g.car;
  return {
    platz, px: c.pos.x, py: c.pos.y, pz: c.pos.z, q: c.q, vx: c.v.x, vy: c.v.y, vz: c.v.z,
    lenk: (c.wheels && c.wheels[0].steer) || 0, gas: (c.input && c.input.throttle) || 0, nitro: c.boost || 0,
    f: { crash: g.zustand === 'crash', luft: c.onGround === 0, ziel: !!g.fertig, geist: (g.geistT || 0) > 0 },
    sprung: (g.resets || 0) & 255, fort: g.fortschritt(),
  };
}

// Startaufstellung: Menschen nach Beitrittsnummer vorn, KI dahinter. Liefert { n, slotVon(sid), kiPlaetze }
export function aufstellung(fahrerSids, nummerVon, kiAnzahl) {
  const menschen = fahrerSids.slice().sort((a, b) => (nummerVon(a) || 99) - (nummerVon(b) || 99) || (a < b ? -1 : 1));
  const n = menschen.length + kiAnzahl;
  return { n, menschen, slotVon: (sid) => menschen.indexOf(sid), kiPlaetze: Array.from({ length: kiAnzahl }, (_, k) => menschen.length + k) };
}
// Auto auf einen Rasterplatz stellen (wie GegnerFeld.spielerAufstellen)
export function aufRaster(race, r) {
  race.car.place([r.px, r.py, r.pz], [r.tx, r.ty, r.tz], [r.nx, r.ny, r.nz], 0);
  race.tracker.reset(r.idx); race.tracker.lap = r.lapDelta;
  race.ap.tr.reset(r.idx); race.ap.tr.lap = r.lapDelta;
  if (race.jumpAssist) race.jumpAssist.reset();
  race.chargeLap = race.tracker.lap;
}

// Gastgeber vor dem Start: Daten fürs Rennen (Einstellungen + KI-Liste). einst: { ki (Anzahl), staerke, seed, tempo }
// Liefert { extra (in lobby.einst), kiIds } für sitzung.starten(extra, kiIds). Gesamt höchstens ONLINE.maxAutos Autos.
export function startDaten(sitzung, einst = {}) {
  const menschen = sitzung.liste().length;
  const anzahl = Math.max(0, Math.min(ONLINE.maxAutos - menschen, einst.ki | 0, 5));
  const seed = (einst.seed ?? ((Math.random() * 1e9) >>> 0)) >>> 0, staerke = einst.staerke || STAERKE_STD;
  const kiInfo = gegnerListe(anzahl, staerke, seed).map((g, k) => ({ id: 'ki-' + g.id, name: g.name, farbe: g.farbe, nummer: menschen + k + 1 }));
  return { extra: { kiInfo, seed, staerke, tempo: einst.tempo ?? GAME_SPEED_STD }, kiIds: kiInfo.map((k) => k.id) };
}
// Gastgeber: KI-Feld für das Online-Rennen (gleiche Fahrer wie startDaten, Raster nach aufstellung)
export function kiFeld(env, O, assist, opt = {}) {
  const E = O.S.lobby.einst;
  if (!O.kiInfo.length) return null;
  const F = new GegnerFeld(env, { anzahl: O.kiInfo.length, staerke: E.staerke, seed: E.seed, assist, online: true, wreckOn: false, aufholhilfe: false,
    rasterN: O.A.n, plaetze: O.A.kiPlaetze, spielerPlatz: O.slot, ...opt });
  F.fahrer.forEach((g, k) => { g.nummer = O.kiInfo[k].nummer; g.info.nummer = O.kiInfo[k].nummer; });
  O.feld = F;
  return F;
}

// Ein Online-Rennen auf einem Gerät. sitzung: net/sitzung.js (schema AUTO_SCHEMA, lin LIN); race: game/race.js (vom
// Spiel gebaut, countdown sehr groß); feld: ai/gegner.js GegnerFeld (nur Gastgeber mit KI, opt.plaetze/rasterN) oder null.
export class OnlineRennen {
  constructor(sitzung, env, race, opt = {}) {
    this.S = sitzung; this.env = env; this.race = race; this.feld = opt.feld || null;
    this.L = env.track.line;
    const LB = sitzung.lobby;
    this.rennId = LB.rennId; this.startAt = LB.startAt;
    this.tempo = opt.tempo ?? LB.einst.tempo ?? GAME_SPEED_STD;
    this.haerte = HAERTE[HAERTE_JE_STUFE[race.assistKey] || 'mittel'];
    this.kiInfo = LB.einst.kiInfo || [];
    this.A = aufstellung(LB.fahrer || [], (s) => sitzung.mitglieder.get(s)?.nummer, this.kiInfo.length);
    this.raster = startRaster(this.L, env.track.start.idx, Math.max(1, this.A.n));
    this.slot = Math.max(0, this.A.slotVon(sitzung.sid));
    this.ziel = zielFortschritt(this.L, env.track.start.idx);
    this.p0 = Math.min(...this.raster.map((r) => (r.lapDelta * this.L.total + this.L.s[r.idx]))) - 5;
    this.autos = new Map();       // key ('pid:platz') → { auto: FremdAuto, sid, platz, ki, info, zn, prev, rempelT }
    this.sprung = 0; this.geistBis = 0;
    this.tSim = null; this.letztSend = -1e9; this.letztKi = -1e9;
    this.events = [];             // für main.js: { type: 'rempler'|'weg'|'neu'|'gastgeber'|'emoji'|'p2p'|'ergebnis', … }
    this.zielGemeldet = false; this.version = 0;
    this.eigenZn = new Zeitnahme(this.p0);
    this.kiGemeldet = new Set();
    this._abo = [];
    const an = (art, fn) => { sitzung.on(art, fn); this._abo.push([art, fn]); };
    an('ereignis', (art, d, von, sz) => this._ereignis(art, d, von, sz));
    an('weg', (m) => { this._wegMit(m.pid); this.events.push({ type: 'weg', name: m.info && m.info.name }); });
    an('gastgeber', (neu) => this.events.push({ type: 'gastgeber', name: neu.info && neu.info.name, ich: neu.sid === sitzung.sid }));
    an('ergebnis', (E) => this.events.push({ type: 'ergebnis', liste: E }));
    an('fehler', (e) => { if (e.art === 'p2p') this.events.push({ type: 'p2p', peer: e.peer }); });
    sitzung.opt.rest = () => this.rest();
  }
  beenden() { for (const [a, f] of this._abo) { const L = this.S.h[a]; if (L) { const i = L.indexOf(f); if (i >= 0) L.splice(i, 1); } } this._abo = []; }

  // vor dem Countdown: eigenes Auto auf seinen Platz; Gastgeber-KI steht schon (GegnerFeld mit plaetze)
  aufstellen() {
    if (this.feld) this.feld.spielerAufstellen(this.race); else aufRaster(this.race, this.raster[this.slot]);
    this.prevEigen = { ...this.race.car.pos };
  }
  // Rennuhr (Spiel-s seit „Los!“) aus der Sitzungsuhr
  rennUhr(z = this.S.zeit) { return (z - this.startAt) / 1000 * this.tempo; }

  // je Bild vor den Physikschritten: Countdown nach Sitzungsuhr, Ziel-Zeit der Abtastung
  frame() {
    const R = this.race, z = this.S.zeit;
    if (R.state === 'countdown') {
      const soll = Math.max(0, -this.rennUhr(z));
      R.countdown = Math.min(R.countdown, soll);
    } else if (R.state !== 'finished') {
      // eigene Uhr nur vorwärts an die Sitzungsuhr (Ruckler: kein Zeitverlust/-gewinn)
      const soll = this.rennUhr(z) + R.penalties * PENALTY;
      if (soll > R.time) R.time = soll;
    }
    this.tZiel = z;
    if (this.tSim == null || this.tZiel - this.tSim > 120 || this.tSim > this.tZiel) this.tSim = this.tZiel - 1;
  }

  // je Physikschritt nach race.step (und feld.step): fremde Autos auf den Stand dieses Schritts, Kollision mit dem eigenen
  // Auto (fremdes Auto fest), Rempler-Ereignis. dtSpiel = Physikschritt (Spiel-s)
  schritt(dtSpiel) {
    const dtEcht = dtSpiel / this.tempo * 1000;
    this.tSim = Math.min(this.tZiel ?? this.S.zeit, (this.tSim ?? this.S.zeit) + dtEcht);
    const jetztS = this.tSim / 1000;
    this._fremdeAbgleichen();
    const R = this.race, ich = R.car;
    const aktiv = R.state === 'running' || R.state === 'finished';
    if (!aktiv) this.geistBis = jetztS + 0.3;
    for (const [key, X] of this.autos) {
      const o = this.S.lage(key, this.tSim, ONLINE.voraus);
      X.auto.art = this.S.fremde.get(key)?.puffer.art || 'leer';
      X.prev = X.auto.gueltig ? { ...X.auto.pos } : null;
      X.auto.setze(o, dtEcht / 1000, jetztS);
      if (!aktiv || jetztS < this.geistBis || X.auto.geist(jetztS)) continue;
      const r = stoss(ich, X.auto, this.haerte, this.prevEigen, X.prev, { festB: true });
      if (r && r.vn > ONLINE.rempler.vMin && jetztS - (X.rempelT || -1e9) > ONLINE.rempler.abstand) {
        X.rempelT = jetztS;
        this.events.push({ type: 'rempler', p: r.p, n: r.n, v: r.vn, crash: r.crash, wer: X.info.name, lokal: true });
        if (!X.ki) this.S.ereignis('rempler', { an: X.sid, v: +r.vn.toFixed(1), p: r.p.map((x) => +x.toFixed(2)), n: r.n.map((x) => +x.toFixed(3)) });
      }
    }
    // Gastgeber: KI ↔ fremde Menschen (KI weicht im Verkehr aus, ai/gegner.js fremde); Schiene nur fern von allen Menschen
    if (this.feld) { this.feld.fremde = this.fremdeFuerFeld(); this.feld.sichtPunkte = this.feld.fremde.map((f) => f.car.pos); }
    this.prevEigen = { ...ich.pos };
  }

  // je Bild nach den Schritten: Zustand senden (25 Hz), KI (15 Hz), Zeitnahme, Ziel melden, Ereignisse aus dem Rennen
  nachFrame(raceEvents = []) {
    const R = this.race, z = this.S.zeit;
    for (const e of raceEvents) {
      if (e.type === 'reset' || e.type === 'skip' || e.type === 'rewind') this.sprung++;
      if (e.type === 'finish' && !this.zielGemeldet) { this.zielGemeldet = true; this.S.zielMelden(R.finalTime, { strafen: R.penalties, stufe: R.assistKey }); }
    }
    if (z - this.letztSend >= 1000 / ONLINE.hz - 2) {
      this.letztSend = z;
      this.S.sendeZustand(zustandEigen(R, this.sprung, R.state === 'countdown'));
    }
    if (this.feld && this.S.istGastgeber && z - this.letztKi >= 1000 / ONLINE.kiHz - 2) {
      this.letztKi = z;
      this.S.sendeSammel(this.feld.fahrer.map((g, k) => zustandKi(g, k + 1)));
      // KI im Ziel → beim Gastgeber eintragen (Rennuhr der KI = feld.uhr, Spiel-s ab „Los!“)
      this.feld.fahrer.forEach((g, k) => { const id = this.kiInfo[k] && this.kiInfo[k].id; if (g.fertig && id && !this.kiGemeldet.has(id)) { this.kiGemeldet.add(id); this.S.zielEintragen(id, g.zeit, { hoch: !!g.hochgerechnet, name: g.info.name }); } });
    }
    if (R.state !== 'countdown') {
      const u = this.rennUhr(z);
      this.eigenZn.melde(R.tracker.progress(), u);
      for (const X of this.autos.values()) if (X.auto.gueltig) X.zn.melde(X.auto.fort, u);
    }
  }

  // fremde Autos zu den Puffern der Sitzung (neu/weg)
  _fremdeAbgleichen() {
    const da = new Set();
    for (const [key, f] of this.S.fremde) {
      if (f.ki && f.pid !== this.S._pidVon(this.S.lobby.host)) continue;   // KI nur vom (aktuellen) Gastgeber
      if (f.ki && !this.S.lobby.kiAktiv) continue;
      if (!f.ki && this.S.lobby.fahrer && !this.S.lobby.fahrer.includes(f.sid)) continue;   // Zuschauer
      da.add(key);
      if (!this.autos.has(key)) {
        const m = f.sid && this.S.mitglieder.get(f.sid);
        const ki = f.ki ? this.kiInfo[f.platz - 1] : null;
        const info = ki ? { name: ki.name, farbe: ki.farbe, nummer: ki.nummer, ki: true } : { name: schildName(m && m.info), farbe: (m && m.info && m.info.farbe) ?? MENSCH_FARBEN[((m && m.nummer) || 1) - 1 & 3], nummer: (m && m.nummer) || 0 };
        this.autos.set(key, { auto: new FremdAuto(), sid: f.sid, pid: f.pid, platz: f.platz, ki: !!f.ki, info, zn: new Zeitnahme(this.p0), prev: null });
        this.version++;
      }
    }
    for (const key of this.autos.keys()) if (!da.has(key)) { this.autos.delete(key); this.version++; }
  }
  _wegMit(pid) { for (const [k, X] of this.autos) if (X.pid === pid) { this.autos.delete(k); this.version++; } }

  _ereignis(art, d, von) {
    if (art === 'rempler' && d.an === this.S.sid) {
      // Gegenseite hat den Stoß gesehen: Funken/Ton auch hier (eigene Erkennung kurz davor zählt schon)
      const X = [...this.autos.values()].find((x) => x.pid === von.pid);
      const t = (this.tSim || this.S.zeit) / 1000;
      if (X && t - (X.rempelT || -1e9) < ONLINE.rempler.abstand * 2) return;
      if (X) X.rempelT = t;
      this.events.push({ type: 'rempler', p: d.p, n: d.n, v: d.v, wer: X ? X.info.name : '', lokal: false });
    } else if (art === 'emoji') this.events.push({ type: 'emoji', e: String(d.e || '').slice(0, 8), von: von.info ? von.info.name : '', pid: von.pid });
  }
  emoji(e) { this.S.ereignis('emoji', { e }); this.events.push({ type: 'emoji', e, von: 'Du', ich: true }); }

  // Gastgeber-KI: fremde Menschen als feste Körper für Verkehr und Kollision (ai/gegner.js opt fremde)
  fremdeFuerFeld() {
    const out = [], I = this.env.ideal || this.L;
    for (const X of this.autos.values()) {
      if (X.ki || !X.auto.gueltig) continue;
      const a = X.auto, i = naechsterIdx(I, a.pos, X.idx ?? 0); X.idx = i;
      const lat = (a.pos.x - I.px[i]) * I.bx[i] + (a.pos.y - I.py[i]) * I.by[i] + (a.pos.z - I.pz[i]) * I.bz[i];
      out.push({ id: X.sid, car: a, prev: X.prev, p: a.fort, lat, v: a.fwdSpeed(), idx: i, crash: !!a.flags.crash, geist: a.geist((this.tSim || 0) / 1000) });
    }
    return out;
  }

  // Rangliste fürs HUD (Format wie GegnerFeld.stand: ui.hudGegner)
  stand() {
    const R = this.race, LB = this.S.lobby, e = [], zn = new Map();
    e.push({ id: this.S.sid, name: 'Du', nummer: this.S.ich()?.nummer || 1, spieler: true, fortschritt: R.tracker.progress(), fertig: R.state === 'finished', zeit: R.state === 'finished' ? R.finalTime : null });
    zn.set(this.S.sid, this.eigenZn);
    // KI des Gastgebers (Gastgeber selbst: aus dem Feld)
    if (this.feld) this.feld.fahrer.forEach((g, k) => { const id = this.kiInfo[k]?.id || g.id; e.push({ id, name: g.info.name, nummer: g.nummer, farbe: g.info.farbe, fortschritt: g.fortschritt(), fertig: !!g.fertig, zeit: g.zeit }); zn.set(id, g.zn); });
    for (const X of this.autos.values()) {
      const id = X.ki ? this.kiInfo[X.platz - 1]?.id || 'ki' + X.platz : X.sid;
      const zl = LB.ziel && LB.ziel[id];
      e.push({ id, name: X.info.name, nummer: X.info.nummer, farbe: X.info.farbe, fortschritt: zl ? this.ziel : X.auto.fort, fertig: !!zl || !!X.auto.flags.ziel, zeit: zl ? zl.zeit : null });
      zn.set(id, X.zn);
    }
    return abstaende(rangliste(e), zn, this.rennUhr());
  }
  // noch Fahrende für die Zieltabelle des Gastgebers (Sitzung.opt.rest)
  rest() { return this.stand().filter((x) => !x.fertig).map((x) => ({ id: x.id, fortschritt: x.fortschritt, ki: !this.S.mitglieder.has(x.id), name: x.spieler ? (this.S.info.name || 'Du') : x.name })); }

  // Darstellung (gfx/gegnervis.js): Liste im Format von GegnerFeld.fahrer (car, info, nummer, zustand, schaden)
  visFeld() {
    const fahrer = [];
    if (this.feld) for (const g of this.feld.fahrer) fahrer.push(g);
    // (Liste nur neu, wenn sich die Autos ändern – version; Zustand daher als Getter)
    for (const X of this.autos.values()) fahrer.push({ car: X.auto, info: X.info, nummer: X.info.nummer, get zustand() { return X.auto.flags.crash ? 'crash' : 'fahrt'; }, schaden: null, id: X.sid || X.platz });
    return { fahrer };
  }
}

// nächster Linienpunkt (lokale Suche ab start, Fallback ganz)
export function naechsterIdx(L, p, start = 0) {
  let best = start, bd = Infinity;
  const d = (i) => (L.px[i] - p.x) ** 2 + (L.py[i] - p.y) ** 2 + (L.pz[i] - p.z) ** 2;
  for (let k = -30; k <= 60; k++) { const i = ((start + k) % L.n + L.n) % L.n, v = d(i); if (v < bd) { bd = v; best = i; } }
  if (bd > 40 * 40) for (let i = 0; i < L.n; i++) { const v = d(i); if (v < bd) { bd = v; best = i; } }
  return best;
}
