// KI-Gegner (n34, Peter 08.10.2026: „stuntbahn mit optionalem multiplayer oder npc-gegnern“): 0–5 Autos im selben Rennen.
// Jeder Gegner fährt mit derselben Physik wie der Spieler (physics/car.js), gesteuert vom Autopiloten (ai/autopilot.js)
// mit menschlichen Fehlern: Stärke-Profil (Tempo-Faktor auf das Profil, Brems-Reaktionszeit, Linien-Streuung, seltene
// Fehler: zu spät gebremst, Stunt verpatzt → Crash + Reset wie beim Spieler), Persönlichkeit (aggressiv/sauber), eigener
// Name, Lack, Startnummer. Außer Sichtweite (> SCHIENE.weg m vom Spieler) fährt ein Gegner vereinfacht auf der Ideallinie
// mit dem Tempo-Profil („Schiene“, ohne Raycasts) und wechselt nahtlos zurück (Lage/Tempo übernommen).
// Auto-Auto-Kollision: physics/autoauto.js; Raster, Rangliste, Abstände, Hochrechnung: game/rennfeld.js.
// Reine Logik ohne Grafik (Node + Browser), deterministisch je Seed. Port-Notiz: GEGNER.md. Node-Tests:
// tests/node/test_gegner.mjs, Messung 60 Strecken × 3 Stärken: tools/gegner_mess.mjs.
import { Car, driveAccel } from '../physics/car.js';
import { Autopilot } from './autopilot.js';
import { haftOffAt, zigMask, PENALTY, RESET_DELAY, OFF, FALL } from '../game/race.js';
import { stoss, HAERTE, HAERTE_JE_STUFE } from '../physics/autoauto.js';
import { startRaster, spielerSlot, rangliste, Zeitnahme, abstaende, restzeit, fortschritt, zielFortschritt } from '../game/rennfeld.js';

// ---------- Einstellungen ----------
export const GEGNER_ANZAHLEN = [0, 1, 3, 5];   // Menü „🏁 Gegner“: Aus · 1 · 3 · 5 (URL ?gegner= nimmt 0 … 5)
export const GEGNER_MAX = 5;
// Stärke-Profile. tempo = Faktor auf das Profil-Tempo außerhalb der Stunts (Stunts selbst immer mit Profil-Tempo, sonst
// Sprung zu kurz/Looping zu langsam), reaktion = s bis zum Bremsen, wenn das Profil Bremsen verlangt (vorher Gas weg),
// streu = Linien-Streuung (m, langsames Rauschen um die Ideallinie), pSpaet = Anteil der Bremszonen mit „zu spät
// gebremst“ (Reaktion + spaet s), pPatzer = Anteil der Stunts mit „verpatzt“ (Anfahrt zu langsam oder zu schnell),
// start = Startplatz des Spielers bei 'auto' (Locker: hinten – man fährt durchs Feld nach vorn).
// Startwerte, abgestimmt mit tools/gegner_mess.mjs (Ziel: Locker > Ebenbürtig > Profi, Profi ≈ Autopilot ± 5 %).
export const STAERKEN = {
  locker: { name: 'Locker', tempo: 0.58, reaktion: 0.35, streu: 1.2, pSpaet: 0.08, spaet: [0.4, 0.8], pPatzer: 0.12, start: 'hinten' },
  ebenbuertig: { name: 'Ebenbürtig', tempo: 0.76, reaktion: 0.2, streu: 0.7, pSpaet: 0.04, spaet: [0.3, 0.6], pPatzer: 0.05, start: 'mitte' },
  profi: { name: 'Profi', tempo: 0.975, reaktion: 0.08, streu: 0.3, pSpaet: 0.01, spaet: [0.2, 0.4], pPatzer: 0.01, start: 'mitte' },
};
export const STAERKE_STD = 'ebenbuertig';
// Persönlichkeit: abstand = Folge-Abstand (s) hinter einem Auto, das man nicht überholen kann/darf, luecke = seitlicher
// Abstand (m, Mitte zu Mitte) beim Überholen, seitV = wie schnell der Seitenversatz wechselt (m/s), tempo = kleiner
// Zuschlag (höchstens bis Profil-Tempo), mut = überholt auch bei knappem Platz (Rest-Breite in m)
export const CHARAKTERE = {
  aggressiv: { name: 'aggressiv', abstand: 0.28, luecke: 2.25, seitV: 3.2, tempo: 1.015, mut: 0.4 },
  sauber: { name: 'sauber', abstand: 0.6, luecke: 2.7, seitV: 1.8, tempo: 1.0, mut: 0 },
};
// Fiktive Fahrer (Name, Lack sRGB, Persönlichkeit). Startnummern: Spieler 1, Gegner 2 … 6.
export const FAHRER = [
  { name: 'Rita Rasant', farbe: 0x1f6fd1, charakter: 'aggressiv' },
  { name: 'Kalle Kurve', farbe: 0x2fa84f, charakter: 'sauber' },
  { name: 'Lotte Looping', farbe: 0xf2b705, charakter: 'sauber' },
  { name: 'Bruno Blech', farbe: 0x8e44ad, charakter: 'aggressiv' },
  { name: 'Nina Nitro', farbe: 0xf06b1d, charakter: 'aggressiv' },
  { name: 'Paul Piste', farbe: 0x18a8b8, charakter: 'sauber' },
  { name: 'Hugo Haarnadel', farbe: 0x6b6f78, charakter: 'sauber' },
  { name: 'Svenja Schikane', farbe: 0xe84393, charakter: 'aggressiv' },
];
// Schiene außerhalb der Sicht: weg ab so viel m Abstand zum Spieler (bzw. zur Kamera), zurück zur Physik unter nah m
// (Hysterese). k = Beschleunigungs-Anteil (Physik-Autopilot erreicht das Volllast-Beschleunigen nicht ganz – Wert aus
// dem Vergleich Schiene ↔ Physik in tools/gegner_mess.mjs, Startwert). verlustPatzer/verlustSpaet: Zeit (s), die ein
// Fehler auf der Schiene kostet (Physik: Crash + Reset bzw. Verbremser).
export const SCHIENE = { weg: 170, nah: 150, k: 0.9, verlustPatzer: 3.5, verlustSpaet: 0.8, pCrash: 0.5 };
// Verkehr: vorausschauen (m Fortschritt), Breite eines Autos mit Rand (m, Mitte zu Mitte), Zone ohne Überholen vor und
// hinter Looping/Röhre/Korkenzieher/Sprung/Zickzack (m), Rand zur Fahrbahn-/Spurgrenze (m)
export const VERKEHR = { blick: 45, breite: 2.3, vorStunt: 70, nachStunt: 25, rand: 1.15, neben: 5.5, folgeK: 1.2, folgeMin: 7 };
// Streuung: neues Ziel alle 1,5 … 4 s, Seitenversatz folgt mit höchstens 0,6 m/s
export const STREU = { tMin: 1.5, tMax: 4, v: 0.6 };
// Tempo-Faktor ab MUSS_RAMPE[0] m vor Looping/Röhre/Korkenzieher/Schanze weich bis 1 bei [1] m davor, danach über [2] m zurück
export const MUSS_RAMPE = [60, 20, 30];
// Gummiband („Aufholhilfe“, Option, Standard aus): Gegner mehr als hinten m hinter dem Spieler fahren × (1 + k) (höchstens
// Profil-Tempo), mehr als vorn m davor × (1 − k)
export const AUFHOL = { hinten: 120, vorn: 160, k: 0.05 };
// Nach dem Zieleinlauf des Spielers fahren die Gegner höchstens so lange weiter (s), dann Hochrechnung
export const NACHLAUF = 10;
// Aufzeichnung fürs Replay: 15 Hz, 8 Floats je Bild (x, y, z, qx, qy, qz, qw, Flags) – gleiches Format wie das Geisterauto
// (game/ghost.js sample()), Flags: 1 = Crash, 2 = Schiene
export const REC = { hz: 15, stride: 8 };

const urlQ = globalThis.location && globalThis.location.search ? new URLSearchParams(globalThis.location.search) : null;

// Einstellungen aus URL und gespeicherten Einstellungen: ?gegner=0…5&staerke=locker|ebenbuertig|profi&startplatz=…
// &schilder=0&aufholhilfe=1. URL hat Vorrang (A/B-Links), sonst settings.gegner/gegnerStaerke/…; Standard: Aus.
export function gegnerOptionen(search = urlQ ? globalThis.location.search : '', settings = {}) {
  const q = new URLSearchParams(search || '');
  let anzahl = q.has('gegner') ? parseInt(q.get('gegner'), 10) : settings.gegner ?? 0;
  if (!Number.isFinite(anzahl)) anzahl = 0;
  anzahl = Math.max(0, Math.min(GEGNER_MAX, anzahl | 0));
  const norm = (s) => String(s || '').toLowerCase().replace('ü', 'ue');
  let staerke = norm(q.get('staerke') || q.get('stärke'));
  if (!STAERKEN[staerke]) staerke = STAERKEN[settings.gegnerStaerke] ? settings.gegnerStaerke : STAERKE_STD;
  let startplatz = q.get('startplatz') || settings.gegnerStart || 'auto';
  if (!['auto', 'vorne', 'mitte', 'hinten'].includes(startplatz)) startplatz = 'auto';
  const schilder = q.has('schilder') ? q.get('schilder') !== '0' : settings.gegnerSchilder !== false;
  const aufholhilfe = q.has('aufholhilfe') ? q.get('aufholhilfe') === '1' : !!settings.aufholhilfe;
  // Schiene außerhalb der Sicht (A/B, Messung): ?schiene=0 = alle Gegner immer volle Physik
  const schiene = q.has('schiene') ? (q.get('schiene') === '0' ? 'nie' : q.get('schiene') === 'immer' ? 'immer' : 'auto') : 'auto';
  return { anzahl, staerke, startplatz, schilder, aufholhilfe, schiene, url: q.has('gegner') };
}

// Startaufstellung der Gegner (Fahrer, Persönlichkeit, Nummer, Tempo-Abweichung ±1,5 %) – deterministisch je Seed
export function gegnerListe(anzahl, staerke = STAERKE_STD, seed = 1) {
  const r = mulberry(seed * 7919 + 17);
  const pool = FAHRER.map((f, i) => ({ ...f, i }));
  for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
  const out = [];
  for (let k = 0; k < anzahl; k++) {
    const f = pool[k % pool.length];
    out.push({ id: 'g' + (k + 1), name: f.name, farbe: f.farbe, charakter: f.charakter, nummer: k + 2, staerke, tempoK: 1 + (r() - 0.5) * 0.03, seed: (seed * 131 + k * 977 + 5) >>> 0 });
  }
  return out;
}

// Kleiner Zufallsgenerator (wie core/util.js rng; hier ohne Import, damit der Port eigenständig bleibt)
export function mulberry(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Zahl 0 … 1 aus (Seed, k) ohne Zustand – Streuung bleibt beim Rückspulen gleich
export function hash01(seed, k) {
  let h = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k | 0, 0xc2b2ae35);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------- Strecken-Masken (einmal je Strecke, für alle Gegner) ----------
// stunt: Looping/Röhre/Korkenzieher/Luft/Schanzen-Zone/Zickzack; kein: kein Überholen, keine Streuung (vorStunt m davor bis
// nachStunt m dahinter); muss: dort braucht das Auto das volle Profil-Tempo (Looping/Röhre/Korkenzieher: Anpressdruck,
// Schanze: Tempo-Fenster; Zickzack nicht – langsamer geht dort immer); nahe: 0 … 1 (Tempo-Faktor wird zu 1: in muss und
// MUSS_RAMPE m davor/danach); haft: Bodenhaftung aus
// (wie haftOffAt); lo/hi: Seitengrenzen für den Versatz (Ideallinie, kleinste Breite der nächsten 30 m)
export function streckenMasken(env) {
  const T = env.track, L = T.line, I = env.ideal || L, n = L.n;
  const zig = zigMask(T);
  const stunt = new Uint8Array(n), kein = new Uint8Array(n), haft = new Uint8Array(n), nahe = new Float32Array(n), muss = new Uint8Array(n);
  const jz = (i) => { for (const j of T.jumps) if (i >= j.lipIdx - 30 && i <= (j.endIdx ?? j.landIdx + 12)) return true; return false; };
  for (let i = 0; i < n; i++) {
    if (L.loop[i] || L.tube[i] || L.air[i] || zig[i] || jz(i)) stunt[i] = 1;
    if (L.loop[i] || L.tube[i] || L.air[i] || jz(i)) muss[i] = 1;
    haft[i] = haftOffAt(T, i) ? 1 : 0;
  }
  // Abstand (m) zur nächsten markierten Stelle voraus bzw. seit der letzten (Rundkurs: zweimal herum)
  const abstand = (mask) => {
    const vor = new Float32Array(n).fill(1e9), nach = new Float32Array(n).fill(1e9);
    const ds = (i) => (i + 1 < n ? L.s[i + 1] - L.s[i] : 0);
    for (let pass = 0; pass < (L.closed ? 2 : 1); pass++) {
      let d = pass ? vor[0] : 1e9;
      for (let i = n - 1; i >= 0; i--) { d = mask[i] ? 0 : d + ds(i); vor[i] = Math.min(vor[i], d); }
      if (L.closed) vor[n - 1] = Math.min(vor[n - 1], vor[0]);
      let e = pass ? nach[n - 1] : 1e9;
      for (let i = 0; i < n; i++) { e = mask[i] ? 0 : e + (i ? L.s[i] - L.s[i - 1] : 0); nach[i] = Math.min(nach[i], e); }
      if (L.closed) nach[0] = Math.min(nach[0], nach[n - 1]);
    }
    return { vor, nach };
  };
  const { vor, nach } = abstand(stunt), mu = abstand(muss);
  for (let i = 0; i < n; i++) {
    if (vor[i] < VERKEHR.vorStunt || nach[i] < VERKEHR.nachStunt) kein[i] = 1;
    // Tempo-Faktor: in muss voll 1, davor ab MUSS_RAMPE[0] m weich bis 1 bei MUSS_RAMPE[1] m, danach über MUSS_RAMPE[2] m zurück
    const R = MUSS_RAMPE;
    const a = Math.max(0, Math.min(1, (R[0] - mu.vor[i]) / (R[0] - R[1]))), b = Math.max(0, Math.min(1, 1 - mu.nach[i] / R[2]));
    nahe[i] = Math.max(a, b);
  }
  // Seitengrenzen relativ zur Ideallinie (blo/bhi: dort bleibt auch die Ideallinie, Spur in Stunts), kleinste der nächsten 30 m
  const blo = I.blo || I.lo, bhi = I.bhi || I.hi;
  const lo = new Float32Array(n), hi = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let a = -1e9, b = 1e9;
    for (let j = i, acc = 0, g = 0; g < 40 && acc < 30; g++) {
      a = Math.max(a, blo[j] + VERKEHR.rand); b = Math.min(b, bhi[j] - VERKEHR.rand);
      const k = j + 1 >= n ? (L.closed ? 1 : -1) : j + 1;
      if (k < 0) break;
      acc += Math.max(0, L.s[k] - L.s[j]); j = k;
    }
    if (a > b) a = b = (a + b) / 2;
    lo[i] = Math.min(0, a); hi[i] = Math.max(0, b);
  }
  return { stunt, kein, haft, nahe, muss, mussVor: mu.vor, lo, hi, vor };
}

// Tempo-Profil eines Gegners: vt × Faktor außerhalb der Stunts, in Stunt-Nähe weich bis 1 (nahe). Danach Rückwärtslauf:
// wo das Auto vom langsameren Tempo die Stunt-Anfahrt nicht mehr erreichen könnte (Volllast-Beschleunigung driveAccel),
// früher schneller fahren – nie über das Original-Profil.
export function gegnerProfil(P, L, nahe, faktor, def) {
  const n = P.vt.length, vt = new Float32Array(n);
  const f = Math.min(1, faktor);
  for (let i = 0; i < n; i++) vt[i] = P.vt[i] * (f + (1 - f) * nahe[i]);
  for (let pass = 0; pass < (L.closed ? 2 : 1); pass++) {
    for (let i = n - 2; i >= 0; i--) {
      const ds = Math.max(0, L.s[i + 1] - L.s[i]), v1 = vt[i + 1];
      const a = Math.max(0.5, driveAccel(def, vt[i]) * SCHIENE.k);
      const need = Math.sqrt(Math.max(0, v1 * v1 - 2 * a * ds));
      if (need > vt[i]) vt[i] = Math.min(P.vt[i], need);
    }
    if (L.closed) vt[n - 1] = vt[0];
  }
  return { ...P, vt, faktor: f };
}

// Fehler-Plan (deterministisch je Seed): Bremszonen (Profil fällt in 100 m um ≥ 20 % von über 25 m/s) und Stunts.
// Liefert [{ p (Fortschritt m, Runde 0), art: 'spaet' | 'patzer', extra (s) | k (Tempo-Faktor), bis (m) }]
export function fehlerPlan(env, M, P, staerke, seed) {
  const S = STAERKEN[staerke] || STAERKEN[STAERKE_STD];
  const L = env.track.line, n = L.n, r = mulberry(seed ^ 0x5bd1e995), out = [];
  // Bremszonen: lokales Maximum, danach Abfall
  let last = -1e9;
  for (let i = 1; i < n - 1; i++) {
    const v = P.vt[i];
    if (v < 25 || !(v >= P.vt[i - 1] && v > P.vt[i + 1]) || M.stunt[i]) continue;
    let vmin = v;
    for (let j = i; j < n && L.s[j] - L.s[i] < 100; j++) vmin = Math.min(vmin, P.vt[j]);
    if (vmin > v * 0.8 || L.s[i] - last < 120) continue;
    last = L.s[i];
    if (r() < S.pSpaet) out.push({ p: L.s[i], art: 'spaet', extra: S.spaet[0] + r() * (S.spaet[1] - S.spaet[0]), bis: L.s[i] + 80 });
  }
  // Stunts: Anfang jeder Stunt-Zone
  for (let i = 1; i < n; i++) {
    if (!M.stunt[i] || M.stunt[i - 1]) continue;
    let e = i; while (e + 1 < n && M.stunt[e + 1]) e++;
    if (r() < S.pPatzer) out.push({ p: L.s[i] - 120, art: 'patzer', k: r() < 0.5 ? 0.55 : 1.28, bis: L.s[e] });
  }
  // nicht in den ersten 50 m nach dem Start (dort fährt das Feld noch dicht – ein Fehler wäre ein Start-Unfall)
  const s0 = L.s[env.track.start.idx] + 50;
  return out.filter((e) => e.p >= s0).sort((a, b) => a.p - b.p);
}

// ---------- ein Gegner ----------
export class GegnerFahrer {
  constructor(feld, info) {
    const env = feld.env;
    this.feld = feld; this.info = info; this.id = info.id; this.nummer = info.nummer;
    this.S = STAERKEN[info.staerke] || STAERKEN[STAERKE_STD];
    this.C = CHARAKTERE[info.charakter] || CHARAKTERE.sauber;
    this.car = new Car();
    this.P = gegnerProfil(env.prof, env.track.line, feld.M.nahe, this.S.tempo * this.C.tempo * info.tempoK, this.car.def);
    this.ap = new Autopilot(feld.I, this.P);
    this.fehler = feld.opt.fehler === false ? [] : fehlerPlan(env, feld.M, this.P, info.staerke, info.seed);
    this.zustand = 'start';      // start · fahrt · crash · ziel
    this.modus = 'physik';       // physik · schiene
    this.sch = { s: 0, idx: 0, lap: 0, v: 0, stand: 0 };
    this.versatz = 0; this.streuZiel = 0; this.vCap = Infinity; this.tempoMod = 1;
    this.bremst = false; this.bremsT = 0; this.loesT = 0;
    this.crashT = 0; this.crashes = 0; this.strafen = 0; this.failS = -1e9; this.failN = 0;
    this.offT = 0; this.stuckP = -1e9; this.stuckT = 0;
    this.fertig = false; this.zeit = null; this.hochgerechnet = false; this.finT = 0; this.finV = 0;
    this.fe = 0;                 // nächster Fehler im Plan
    this.aktiv = null;           // laufender Fehler
    this.prev = null;            // Lage nach dem letzten Schritt (Swept-Test)
    this.rec = new Float32Array(REC.stride * 64); this.recN = 0;
    this.zn = null;
  }

  // auf den Rasterplatz stellen (Fahrbahnpunkt mit Seitenversatz, im Stand)
  aufstellen(platz) {
    this.car.place([platz.px, platz.py, platz.pz], [platz.tx, platz.ty, platz.tz], [platz.nx, platz.ny, platz.nz], 0);
    this.ap.tr.reset(platz.idx); this.ap.tr.lap = platz.lapDelta;
    // Seitenlage zur Ideallinie (die Mittellinie liegt dort meist nicht auf der Ideallinie)
    this.versatz = this.latJetzt();
    this.streuZiel = this.versatz;
    this.prev = { ...this.car.pos };
    this.zn = new Zeitnahme(this.feld.p0);
  }

  idx() { return this.modus === 'schiene' ? this.sch.idx : this.ap.tr.idx; }
  lap() { return this.modus === 'schiene' ? this.sch.lap : this.ap.tr.lap; }
  fortschritt() { return fortschritt(this.feld.L, this.idx(), this.lap()); }
  tempo() { return this.modus === 'schiene' ? this.sch.v : this.car.fwdSpeed(); }
  // Seitenlage der Wagenmitte zur Ideallinie (m, + = rechts/B-Richtung)
  latJetzt() {
    const I = this.feld.I, i = this.idx(), c = this.car.pos;
    return (c.x - I.px[i]) * I.bx[i] + (c.y - I.py[i]) * I.by[i] + (c.z - I.pz[i]) * I.bz[i];
  }

  // ein Physik-/Schienenschritt
  schritt(dt, F) {
    if (this.zustand === 'start') {
      const c = this.car;
      c.input.steer = 0; c.input.throttle = 0; c.input.brake = 1; c.input.hold = true;
      if (this.modus === 'physik') c.step(dt, F.world);
      return;
    }
    this.fehlerAktualisieren();
    if (this.modus === 'schiene') this.schrittSchiene(dt, F);
    else this.schrittPhysik(dt, F);
    if (!this.fertig && this.fortschritt() >= F.ziel) this.insZiel(F);
    if (this.fertig) this.finT += dt;
    this.zn.melde(this.fortschritt(), F.uhr);
  }

  // Fehler-Plan: aktiver Fehler zwischen p und bis (Runde 0; Rennen sind eine Runde)
  fehlerAktualisieren() {
    const p = this.fortschritt(), E = this.fehler;
    if (this.aktiv && p > this.aktiv.bis) this.aktiv = null;
    while (this.fe < E.length && p > E[this.fe].bis) this.fe++;
    if (!this.aktiv && this.fe < E.length && p >= E[this.fe].p) {
      this.aktiv = E[this.fe++];
      // auf der Schiene kostet ein Fehler pauschal Zeit (Physik: Crash + Reset bzw. Verbremser)
      // (Patzer: mit Anteil pCrash ein Crash + Reset, sonst nur ein Verbremser – Anteil aus der Physik-Messung)
      if (this.modus === 'schiene') {
        const crash = this.aktiv.art === 'patzer' && hash01(this.info.seed, 1000 + this.fe) < SCHIENE.pCrash;
        this.sch.stand += crash ? SCHIENE.verlustPatzer : SCHIENE.verlustSpaet;
        if (crash) { this.crashes++; if (!this.feld.wreckOn) this.strafen += PENALTY; }
      }
    }
  }

  schrittPhysik(dt, F) {
    const car = this.car, ap = this.ap, L = F.L, M = F.M;
    if (this.zustand === 'crash') {
      car.input.steer = 0; car.input.throttle = 0; car.input.brake = 0.4; car.input.hold = true;
      car.step(dt, F.world);
      this.crashT += dt;
      if (this.crashT >= (F.wreckOn ? 2.6 : Math.max(RESET_DELAY, 0.6))) this.zuruecksetzen(F);
      return;
    }
    ap.shift = this.versatz;
    ap.vCap = this.vCap;
    const patzer = this.aktiv && this.aktiv.art === 'patzer' ? this.aktiv.k : 1;
    ap.speedScale = this.tempoMod * patzer;
    const c = ap.control(car);
    const idx = ap.tr.idx;
    let thr = c.throttle, brk = c.brake;
    // Brems-Reaktion: verlangt das Profil Bremsen, erst nach reaktion s (bei „zu spät gebremst“ länger) – bis dahin Gas weg
    const reaktion = this.S.reaktion + (this.aktiv && this.aktiv.art === 'spaet' ? this.aktiv.extra : 0);
    if (brk > 0.05) {
      this.loesT = 0;
      if (!this.bremst) { this.bremsT += dt; if (this.bremsT < reaktion) { brk = 0; thr = 0; } else this.bremst = true; }
    } else if (this.bremst) { this.loesT += dt; if (this.loesT > 0.2) { this.bremst = false; this.bremsT = 0; } }
    else this.bremsT = 0;
    car.input.steer = c.steer; car.input.throttle = thr; car.input.brake = brk; car.input.hold = this.fertig; car.input.hand = 0;
    car.surfaceKind = L.loop[idx] || L.tube[idx] ? 1 : 0;
    car.haftOff = !!M.haft[idx];
    car.step(dt, F.world);
    // Wächter wie beim Spieler (vereinfacht): Crash, Abseits, festgefahren, von der Hochstraße gefallen
    const p = this.fortschritt();
    if (!car.crash) {
      if (ap.tr.dist > OFF.far) { this.offT += dt; if (this.offT > OFF.sec) car.setCrash('Abseits'); } else this.offT = 0;
      if (p > this.stuckP + 2) { this.stuckP = p; this.stuckT = 0; } else if ((this.stuckT += dt) > 5) { this.stuckT = 0; car.setCrash('Festgefahren'); }
      if (car.onGround > 0 && !L.air[idx] && car.pos.y < L.py[idx] - FALL.drop && ap.tr.dist > 2) car.setCrash('Abgestürzt');
    }
    if (car.crash) this.crash(F);
  }

  crash(F) {
    this.zustand = 'crash'; this.crashT = 0; this.crashes++;
    if (!F.wreckOn && !this.fertig) this.strafen += PENALTY;
    F.ereignis({ type: 'gegnerCrash', id: this.id, reason: this.car.crash.reason, v: this.car.speed() });
  }

  // Zurück auf die Ideallinie: vor Stunts ~45 m zurück, sonst ~12 m; zum zweiten Mal an derselben Stelle (80 m) →
  // hinter das Stück (wie Race.recover auf Leicht: nie festhängen). Tempo aus dem Profil.
  zuruecksetzen(F) {
    const L = F.L, T = F.env.track, I = F.I;
    let idx = this.ap.tr.idx, lap = this.ap.tr.lap;
    const prog = fortschritt(L, idx, lap);
    if (Math.abs(prog - this.failS) < 80) this.failN++; else { this.failS = prog; this.failN = 1; }
    const pc = T.pieces[L.piece[idx]];
    let j;
    if (this.failN >= 2) {
      j = pc ? pc.lineEnd + 1 : idx + 20;
      for (let g = 0; g < 400 && L.air[((j % L.n) + L.n) % L.n]; g++) j++;
      j += 6;
      if (L.closed && j >= L.n) { j -= L.n - 1; lap++; }
      j = Math.min(L.n - 3, j);
      this.failN = 0;
    } else {
      if (pc && pc.stunt) idx = pc.lineStart;
      const back = pc && pc.stunt ? 45 : 12;
      j = idx; let acc = 0;
      while (acc < back) {
        const pj = j - 1 < 0 ? (L.closed ? L.n - 2 : 0) : j - 1;
        if (pj === j) break;
        acc += Math.abs(L.s[j] - L.s[pj]) || 0;
        if (pj > j) lap--;
        j = pj;
        if (L.air[j]) acc = Math.min(acc, back - 5);
      }
    }
    // nicht in ein anderes Auto setzen: bis zu 3 × 10 m weiter zurück
    for (let k = 0; k < 3 && F.belegt(I.px[j], I.py[j], I.pz[j], this); k++) {
      const pj = j - 5 < 0 ? (L.closed ? L.n - 2 - (5 - j) : 0) : j - 5;
      if (pj > j) lap--;
      j = Math.max(0, pj);
    }
    const v = Math.min(this.P.vt[j] || 10, 26) * 0.95;
    this.car.place([I.px[j], I.py[j], I.pz[j]], [I.tx[j], I.ty[j], I.tz[j]], [I.nx[j], I.ny[j], I.nz[j]], v);
    this.ap.tr.reset(j); this.ap.tr.lap = lap;
    this.versatz = 0; this.aktiv = null; this.bremst = false; this.bremsT = 0;
    this.offT = 0; this.stuckT = 0; this.stuckP = fortschritt(L, j, lap);
    this.zustand = this.fertig ? 'ziel' : 'fahrt';
    this.prev = null;
    F.ereignis({ type: 'gegnerReset', id: this.id });
  }

  // Schiene: Ideallinie + Seitenversatz, Tempo nach Profil (× Stärke, Verkehr, Fehler), Beschleunigung driveAccel × k.
  // Pose über car.place (keine Raycasts) – so übernimmt die Physik beim Zurückwechseln Lage und Tempo direkt.
  schrittSchiene(dt, F) {
    const I = F.I, Sc = this.sch, n = I.n;
    if (Sc.stand > 0) { Sc.stand -= dt; Sc.v = Math.max(0, Sc.v - 30 * dt); }
    else {
      const i1 = Math.min(n - 1, Sc.idx + 1);
      const u = I.s[i1] > I.s[Sc.idx] ? Math.max(0, Math.min(1, (Sc.s - I.s[Sc.idx]) / (I.s[i1] - I.s[Sc.idx]))) : 0;
      let vMax = (this.P.vt[Sc.idx] + (this.P.vt[i1] - this.P.vt[Sc.idx]) * u) * this.tempoMod;
      vMax = Math.min(vMax, this.vCap);
      const a = driveAccel(this.car.def, Sc.v) * SCHIENE.k;
      Sc.v = Math.min(vMax, Sc.v + Math.max(0, a) * dt);
      if (this.fertig) Sc.v = Math.max(0, Sc.v - 6 * dt);
    }
    Sc.s += Sc.v * dt;
    for (let g = 0; g < 200; g++) {
      const j = Sc.idx + 1;
      if (j >= n) { if (!I.closed) { Sc.s = Math.min(Sc.s, I.s[n - 1]); break; } Sc.idx = 0; Sc.s -= I.s[n - 1]; Sc.lap++; continue; }
      if (I.s[j] > Sc.s) break;
      Sc.idx = j;
    }
    this.schienePose();
  }
  schienePose() {
    const I = this.feld.I, Sc = this.sch, i = Sc.idx, j = Math.min(I.n - 1, i + 1);
    const u = I.s[j] > I.s[i] ? Math.max(0, Math.min(1, (Sc.s - I.s[i]) / (I.s[j] - I.s[i]))) : 0;
    const l = (a) => a[i] + (a[j] - a[i]) * u, o = this.versatz;
    const p = [l(I.px) + l(I.bx) * o, l(I.py) + l(I.by) * o, l(I.pz) + l(I.bz) * o];
    this.car.place(p, [l(I.tx), l(I.ty), l(I.tz)], [l(I.nx), l(I.ny), l(I.nz)], Sc.v);
  }
  // Wechsel Physik → Schiene: nur ruhig auf der Fahrbahn (4 Räder, kein Stunt, kein Crash)
  zurSchiene() {
    const car = this.car, i = this.ap.tr.idx;
    if (this.zustand === 'crash' || car.onGround < 4 || this.feld.M.stunt[i]) return false;
    const I = this.feld.I;
    this.sch.idx = i; this.sch.lap = this.ap.tr.lap; this.sch.v = Math.max(0, car.fwdSpeed()); this.sch.stand = 0;
    // Bogenlänge auf der Ideallinie: Lot der Wagenmitte auf das Teilstück i → i+1
    const j = Math.min(I.n - 1, i + 1);
    const tx = I.px[j] - I.px[i], ty = I.py[j] - I.py[i], tz = I.pz[j] - I.pz[i], tl = Math.hypot(tx, ty, tz) || 1;
    const u = ((car.pos.x - I.px[i]) * tx + (car.pos.y - I.py[i]) * ty + (car.pos.z - I.pz[i]) * tz) / tl;
    this.sch.s = I.s[i] + Math.max(0, Math.min(I.s[j] - I.s[i], u));
    this.versatz = Math.max(this.feld.M.lo[i], Math.min(this.feld.M.hi[i], this.latJetzt()));
    this.modus = 'schiene';
    this.schienePose();
    return true;
  }
  // Wechsel Schiene → Physik: Auto steht schon richtig (schienePose), nur der Tracker übernimmt Index und Runde
  zurPhysik() {
    const I = this.feld.I, i = this.sch.idx;
    if (I.air[i] || I.loop[i] || I.tube[i]) return false;
    this.ap.tr.reset(this.sch.idx); this.ap.tr.lap = this.sch.lap;
    this.modus = 'physik'; this.prev = null; this.bremst = false; this.bremsT = 0;
    this.stuckP = this.fortschritt(); this.stuckT = 0; this.offT = 0;
    return true;
  }

  insZiel(F) {
    this.fertig = true; this.zeit = F.uhr + this.strafen; this.finV = Math.max(0, this.tempo());
    if (this.zustand !== 'crash') this.zustand = 'ziel';
    F.ereignis({ type: 'gegnerZiel', id: this.id, zeit: this.zeit });
  }

  aufzeichnen(uhr) {
    const f = Math.floor(uhr * REC.hz + 1e-6);
    if (f < this.recN) { this.recN = Math.max(0, f); }       // nach Rückspulen
    while (this.recN <= f) {
      const o = this.recN * REC.stride;
      if (o + REC.stride > this.rec.length) { const a = new Float32Array(this.rec.length * 2); a.set(this.rec); this.rec = a; }
      const c = this.car;
      this.rec[o] = c.pos.x; this.rec[o + 1] = c.pos.y; this.rec[o + 2] = c.pos.z;
      this.rec[o + 3] = c.q.x; this.rec[o + 4] = c.q.y; this.rec[o + 5] = c.q.z; this.rec[o + 6] = c.q.w;
      this.rec[o + 7] = (this.zustand === 'crash' ? 1 : 0) | (this.modus === 'schiene' ? 2 : 0);
      this.recN++;
    }
  }
  // Aufzeichnung im Format des Geisterautos (game/ghost.js): { hz, frames, data } – Zeit 0 = Start („Los!“)
  aufnahme() { return { hz: REC.hz, frames: this.recN, data: this.rec.subarray(0, this.recN * REC.stride), name: this.info.name, farbe: this.info.farbe, nummer: this.nummer }; }

  // Zustand fürs Rückspulen (Totalschaden an: Uhr läuft mit zurück)
  sichern() {
    return {
      s: this.car.snapshot(), idx: this.ap.tr.idx, lap: this.ap.tr.lap, sch: { ...this.sch }, modus: this.modus, zustand: this.zustand,
      crashT: this.crashT, crash: this.car.crash, versatz: this.versatz, strafen: this.strafen, crashes: this.crashes, fe: this.fe, aktiv: this.aktiv,
      fertig: this.fertig, zeit: this.zeit, failS: this.failS, failN: this.failN,
    };
  }
  laden(z) {
    this.car.restore(z.s); this.car.crash = z.crash;
    this.ap.tr.reset(z.idx); this.ap.tr.lap = z.lap;
    Object.assign(this.sch, z.sch);
    Object.assign(this, { modus: z.modus, zustand: z.zustand, crashT: z.crashT, versatz: z.versatz, strafen: z.strafen, crashes: z.crashes, fe: z.fe, aktiv: z.aktiv, fertig: z.fertig, zeit: z.zeit, failS: z.failS, failN: z.failN });
    this.bremst = false; this.bremsT = 0; this.prev = null; this.stuckT = 0; this.offT = 0; this.stuckP = this.fortschritt();
  }
}

// ---------- das ganze Feld ----------
// env = { track, world, ideal, prof }. opt: { anzahl, staerke, seed, startplatz, wreckOn, assist ('easy'|'medium'|'original'
// → Härte der Kollision), aufholhilfe, schiene ('auto'|'nie'|'immer'), kollision (Standard an), fehler (Standard an; aus = ohne
// Fehler-Plan, für Messungen) }.
// Ablauf je Physikschritt (nach race.step): feld.step(dt, race). Ohne race (Node-Messung): feld.step(dt, null, sicht).
export class GegnerFeld {
  constructor(env, opt = {}) {
    this.env = env; this.L = env.track.line; this.I = env.ideal || env.track.line; this.world = env.world;
    this.opt = { anzahl: 3, staerke: STAERKE_STD, seed: 1, startplatz: 'auto', wreckOn: false, assist: 'medium', aufholhilfe: false, schiene: 'auto', kollision: true, ...opt };
    this.wreckOn = !!this.opt.wreckOn;
    this.haerte = HAERTE[HAERTE_JE_STUFE[this.opt.assist] || 'mittel'];
    this.M = streckenMasken(env);
    this.startIdx = env.track.start.idx;
    this.ziel = zielFortschritt(this.L, this.startIdx);
    this.uhr = 0; this.laeuft = false; this.events = [];
    this.fahrer = gegnerListe(this.opt.anzahl, this.opt.staerke, this.opt.seed).map((g) => new GegnerFahrer(this, g));
    this.spielerZn = null; this.spielerZiel = null; this.nachT = 0; this.abgeschlossen = false;
    this.snaps = []; this.snapT = 0; this.rewinds = 0; this.recT = 0;
    this.stoesse = 0;
    const raster = this.raster = startRaster(this.L, this.startIdx, this.fahrer.length + 1);
    const st = this.opt.startplatz === 'auto' ? (STAERKEN[this.opt.staerke] || STAERKEN[STAERKE_STD]).start : this.opt.startplatz;
    this.spielerPlatz = spielerSlot(raster.length, st);
    this.p0 = Math.min(...raster.map((r) => fortschritt(this.L, r.idx, r.lapDelta))) - 5;
    let k = 0;
    for (let s = 0; s < raster.length; s++) if (s !== this.spielerPlatz) this.fahrer[k++].aufstellen(raster[s]);
  }

  // Spieler-Auto auf seinen Rasterplatz (Race nach dem Bau, vor dem Countdown)
  spielerAufstellen(race) {
    const r = this.raster[this.spielerPlatz];
    race.car.place([r.px, r.py, r.pz], [r.tx, r.ty, r.tz], [r.nx, r.ny, r.nz], 0);
    race.tracker.reset(r.idx); race.tracker.lap = r.lapDelta;
    race.ap.tr.reset(r.idx); race.ap.tr.lap = r.lapDelta;
    if (race.jumpAssist) race.jumpAssist.reset();
    // Rundenzähler der Extras: der Spieler startet ggf. eine Runde „vorher“ (Rundkurs, hinter der Startlinie)
    race.chargeLap = race.tracker.lap;
    this.spielerZn = new Zeitnahme(this.p0);
    this.spielerPrev = { ...race.car.pos };
  }

  ereignis(e) { this.events.push({ t: this.uhr, ...e }); }
  // steht an diesem Punkt (≤ 6 m) schon ein Auto (außer `ich`)?
  belegt(x, y, z, ich) {
    for (const g of this.fahrer) if (g !== ich && Math.hypot(g.car.pos.x - x, g.car.pos.y - y, g.car.pos.z - z) < 6) return true;
    if (this.spielerCar && Math.hypot(this.spielerCar.pos.x - x, this.spielerCar.pos.y - y, this.spielerCar.pos.z - z) < 6) return true;
    return false;
  }

  // Ein Schritt. race: Spieler-Rennen (game/race.js) oder null; sicht: Punkt {x,y,z} für die Schiene (Standard: Spieler-Auto)
  step(dt, race = null, sicht = null) {
    const car0 = race ? race.car : null;
    this.spielerCar = car0;
    // Uhr: ab „Los!“; Totalschaden an + Rückspulen des Spielers → Gegner spulen mit
    if (race) {
      if (race.state === 'countdown') { for (const g of this.fahrer) g.schritt(dt, this); return; }
      if (race.rewinds !== this.rewinds) {
        this.rewinds = race.rewinds;
        if (race.wreckOn) this.zurueck(race.time - race.penalties * PENALTY);
      }
    }
    if (!this.laeuft) { this.laeuft = true; for (const g of this.fahrer) if (g.zustand === 'start') g.zustand = 'fahrt'; }
    this.uhr += dt;
    // Sicht (Schiene): Spieler-Auto bzw. übergebener Punkt
    const sp = sicht || (car0 ? car0.pos : null);
    // Verkehr: Lage aller Autos (Fortschritt, Seitenlage, Tempo)
    const autos = this.lage(race);
    for (const g of this.fahrer) this.verkehr(g, autos, dt);
    if (race && this.opt.aufholhilfe) this.aufholen(race);
    for (const g of this.fahrer) {
      if (sp && this.opt.schiene !== 'nie') {
        const d = Math.hypot(g.car.pos.x - sp.x, g.car.pos.y - sp.y, g.car.pos.z - sp.z);
        if (g.modus === 'physik' && (d > SCHIENE.weg || this.opt.schiene === 'immer')) g.zurSchiene();
        else if (g.modus === 'schiene' && d < SCHIENE.nah && this.opt.schiene !== 'immer') g.zurPhysik();
      } else if (g.modus === 'schiene' && this.opt.schiene === 'nie') g.zurPhysik();
      if (!sp && this.opt.schiene === 'immer' && g.modus === 'physik') g.zurSchiene();
      g.schritt(dt, this);
    }
    if (this.opt.kollision) this.kollisionen(race);
    // Spieler: Zeitnahme, Ziel
    if (race && this.spielerZn) {
      this.spielerZn.melde(race.tracker.progress(), this.uhr);
      if (race.state === 'finished' && this.spielerZiel == null) this.spielerZiel = race.finalTime;
    }
    if (this.spielerZiel != null && !this.abgeschlossen) {
      this.nachT += dt;
      if (this.nachT >= NACHLAUF || this.fahrer.every((g) => g.fertig)) this.abschliessen();
    }
    // Rückspul-Puffer (10 Hz, 8 s) und Aufzeichnung (15 Hz)
    this.snapT += dt;
    if (this.snapT >= 0.1) {
      this.snapT = 0;
      this.snaps.push({ uhr: this.uhr, g: this.fahrer.map((g) => g.sichern()) });
      if (this.snaps.length > 80) this.snaps.shift();
    }
    for (const g of this.fahrer) g.aufzeichnen(this.uhr);
  }

  // Lage aller Autos für den Verkehr: { ich, p (Fortschritt), lat (zur Ideallinie), v, idx }
  lage(race) {
    const out = [];
    for (const g of this.fahrer) {
      if (g.zustand === 'crash') { out.push({ ich: g, p: g.fortschritt(), lat: g.modus === 'schiene' ? g.versatz : g.latJetzt(), v: 0, idx: g.idx(), crash: true }); continue; }
      out.push({ ich: g, p: g.fortschritt(), lat: g.modus === 'schiene' ? g.versatz : g.latJetzt(), v: g.tempo(), idx: g.idx() });
    }
    if (race && race.state !== 'countdown') {
      const I = this.I, i = race.ap.tr.idx, c = race.car.pos;
      const lat = (c.x - I.px[i]) * I.bx[i] + (c.y - I.py[i]) * I.by[i] + (c.z - I.pz[i]) * I.bz[i];
      out.push({ ich: null, spieler: true, p: race.tracker.progress(), lat, v: race.car.fwdSpeed(), idx: i, crash: race.state === 'wreck' || race.state === 'reset' });
    }
    return out;
  }

  // Verkehr für Gegner g: Streuung, Überholen (Seitenversatz), Folgen (vCap), Ausweichen neben einem Auto
  verkehr(g, autos, dt) {
    const M = this.M, i = g.idx(), C = g.C, V = VERKEHR;
    const me = autos.find((a) => a.ich === g);
    // Streuung: neues Ziel alle STREU.tMin … tMax s (aus Seed und Zeitfenster, ohne Zustand)
    const per = STREU.tMin + (STREU.tMax - STREU.tMin) * hash01(g.info.seed, 1);
    const k = Math.floor(this.uhr / per);
    let ziel = M.kein[i] ? 0 : (hash01(g.info.seed, k + 7) * 2 - 1) * g.S.streu;
    let vCap = Infinity;
    if (!g.fertig) {
      // nächstes Auto voraus mit seitlicher Überdeckung
      let vor = null, dpMin = Infinity;
      for (const a of autos) {
        if (a === me) continue;
        const dp = a.p - me.p;
        if (dp > 0 && dp < V.blick && Math.abs(a.lat - me.lat) < V.breite && dp < dpMin) { dpMin = dp; vor = a; }
      }
      if (vor) {
        const lo = M.lo[i], hi = M.hi[i];
        const links = vor.lat - C.luecke, rechts = vor.lat + C.luecke;
        const okL = links >= lo - C.mut, okR = rechts <= hi + C.mut;
        const darf = !M.kein[i] && !M.kein[vor.idx] && !vor.crash;
        if (darf && (okL || okR)) {
          // Seite: wo schon mehr Platz ist bzw. wohin man ohnehin steht
          const seite = okL && okR ? (me.lat <= vor.lat ? -1 : 1) : okL ? -1 : 1;
          ziel = seite < 0 ? links : rechts;
          // noch nicht daneben: beim Spurwechsel nicht auffahren
          if (Math.abs(vor.lat - me.lat) < V.breite) vCap = Math.max(0, vor.v + (dpMin - V.folgeMin * 0.6) * 1.5);
        } else {
          // folgen: Abstand halten (Wunsch: folgeMin m + abstand s × Tempo)
          const want = V.folgeMin + Math.max(0, me.v) * C.abstand;
          vCap = Math.max(0, vor.v + (dpMin - want) * V.folgeK);
        }
      }
      // daneben (Fortschritt ± neben m, seitlich enger als die Breite): zur eigenen Seite ausweichen
      for (const a of autos) {
        if (a === me || a.crash) continue;
        const dp = a.p - me.p;
        if (Math.abs(dp) < V.neben && Math.abs(a.lat - me.lat) < V.breite) {
          ziel = me.lat <= a.lat ? Math.min(ziel, a.lat - V.breite) : Math.max(ziel, a.lat + V.breite);
        }
      }
    } else {
      // nach dem Ziel: ausrollen (wie die Zielshow, sanft); vor Looping/Schanze rechtzeitig anhalten – reicht der Weg nicht,
      // mit Profil-Tempo hindurch (nie zu kurz springen, wie Race.runout)
      vCap = Math.max(g.finV * 0.35, g.finV - 5 * g.finT);
      const dm = M.mussVor[i], v = Math.max(0, me.v);
      if (dm < 400) {
        if (g.durch == null || g.durchBei !== Math.round(dm + this.L.s[i])) { g.durchBei = Math.round(dm + this.L.s[i]); g.durch = M.muss[i] || v * v / (2 * 6 * 0.75) > dm - 15; }
        vCap = g.durch ? Infinity : Math.min(vCap, Math.sqrt(2 * 6 * Math.max(0, dm - 15)));
      }
    }
    // in Looping/Röhre/Schanze und ihrer Anfahrt kein Folge-Deckel: dort braucht jedes Auto sein Profil-Tempo (hinter einem
    // Vordermann zu langsam an der Lippe → Sprung zu kurz). Den Abstand stellt das Folgen davor her.
    if (M.nahe[i] > 0 && !g.fertig) vCap = Infinity;
    ziel = Math.max(M.lo[i], Math.min(M.hi[i], ziel));
    // in Stunt-Spuren (Looping/Röhre) kein Versatz – dort ist die Spur so schmal wie die Ideallinie
    if (M.stunt[i]) ziel = 0;
    const vmax = (M.kein[i] && !M.stunt[i] ? 1.2 : C.seitV) * dt;
    g.versatz += Math.max(-vmax, Math.min(vmax, ziel - g.versatz));
    if (M.stunt[i]) g.versatz += (0 - g.versatz) * Math.min(1, 4 * dt);
    g.vCap = vCap;
  }

  // Gummiband (Option): weit hinter dem Spieler etwas schneller, weit davor etwas langsamer
  aufholen(race) {
    const p = race.tracker.progress();
    for (const g of this.fahrer) {
      const d = g.fortschritt() - p;
      g.tempoMod = d < -AUFHOL.hinten ? 1 + AUFHOL.k : d > AUFHOL.vorn ? 1 - AUFHOL.k : 1;
    }
  }

  // Auto-Auto-Kollisionen: alle Paare der Autos mit voller Physik (Spieler eingeschlossen, wenn er fährt)
  kollisionen(race) {
    const list = [];
    for (const g of this.fahrer) if (g.modus === 'physik' && g.zustand !== 'start') list.push({ car: g.car, prev: g.prev, g });
    const spielerAktiv = race && (race.state === 'running' || race.state === 'finished' || race.state === 'wreck');
    if (spielerAktiv) list.push({ car: race.car, prev: this.spielerPrev, spieler: true });
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const A = list[a], B = list[b];
      const r = stoss(A.car, B.car, this.haerte, A.prev, B.prev);
      if (!r) continue;
      this.stoesse++;
      if (r.vn > 1.5) this.ereignis({ type: 'stoss', v: r.vn, p: r.p, n: r.n, spieler: !!(A.spieler || B.spieler), crash: r.crash });
      for (const X of [A, B]) if (X.g && X.car.crash && X.g.zustand !== 'crash') X.g.crash(this);
    }
    for (const g of this.fahrer) g.prev = g.modus === 'physik' ? { ...g.car.pos } : null;
    if (race) this.spielerPrev = { ...race.car.pos };
  }

  // Rückspulen auf Uhrzeit uhr (Totalschaden an): letzter Stand davor
  zurueck(uhr) {
    let k = this.snaps.length - 1;
    while (k > 0 && this.snaps[k].uhr > uhr + 1e-6) k--;
    if (k < 0 || !this.snaps.length) return;
    const sn = this.snaps[k];
    this.snaps.length = k + 1;
    this.fahrer.forEach((g, i) => { g.laden(sn.g[i]); g.zn.zurueck(sn.uhr); });
    if (this.spielerZn) this.spielerZn.zurueck(sn.uhr);
    this.uhr = sn.uhr;
  }

  // Nach dem Spieler-Ziel (NACHLAUF s oder alle im Ziel): Zeiten der Übrigen hochrechnen (Profil-Restzeit ab jetzt)
  abschliessen() {
    this.abgeschlossen = true;
    for (const g of this.fahrer) {
      if (g.fertig) continue;
      const aD = (v) => driveAccel(g.car.def, v) * SCHIENE.k;
      const rest = restzeit(this.L, g.P.vt, g.idx(), g.lap(), Math.max(0, g.tempo()), this.ziel, aD) + (g.zustand === 'crash' ? 2 : 0);
      g.zeit = this.uhr + rest + g.strafen; g.hochgerechnet = true;
    }
    this.ereignis({ type: 'gegnerAbschluss' });
  }

  // Rangliste jetzt (Spieler eingeschlossen, wenn race übergeben): [{ id, name, nummer, farbe, platz, fertig, zeit,
  // vor, hinter (s), spieler, hochgerechnet }]
  stand(race = null) {
    const e = this.fahrer.map((g) => ({ id: g.id, name: g.info.name, nummer: g.nummer, farbe: g.info.farbe, fortschritt: g.fortschritt(), fertig: g.fertig || g.hochgerechnet, zeit: g.zeit, hochgerechnet: g.hochgerechnet, crashes: g.crashes }));
    const zn = new Map(this.fahrer.map((g) => [g.id, g.zn]));
    if (race) {
      e.push({ id: 'spieler', name: 'Du', nummer: 1, spieler: true, fortschritt: race.tracker.progress(), fertig: race.state === 'finished', zeit: race.state === 'finished' ? race.finalTime : null });
      if (this.spielerZn) zn.set('spieler', this.spielerZn);
    }
    return abstaende(rangliste(e), zn, this.uhr);
  }

  // Leicht-Mitlenken weicht Gegnern aus (Spieler): Seitenversatz (m) zur Ideallinie für race.ap.avoid – 0 ohne Auto voraus,
  // im Stunt und in der Zone ohne Überholen
  ausweichen(race) {
    const M = this.M, i = race.ap.tr.idx, V = VERKEHR;
    if (M.kein[i] || race.state !== 'running') return 0;
    const I = this.I, c = race.car.pos;
    const lat = (c.x - I.px[i]) * I.bx[i] + (c.y - I.py[i]) * I.by[i] + (c.z - I.pz[i]) * I.bz[i];
    const p = race.tracker.progress();
    let vor = null, dpMin = Infinity;
    for (const g of this.fahrer) {
      if (g.zustand === 'start') continue;
      const dp = g.fortschritt() - p, gl = g.modus === 'schiene' ? g.versatz : g.latJetzt();
      if (dp > -2 && dp < V.blick && Math.abs(gl - lat) < V.breite && dp < dpMin) { dpMin = dp; vor = { lat: gl }; }
    }
    if (!vor) return 0;
    const links = vor.lat - 2.6, rechts = vor.lat + 2.6;
    const okL = links >= M.lo[i], okR = rechts <= M.hi[i];
    if (!okL && !okR) return 0;
    const ziel = okL && okR ? (lat <= vor.lat ? links : rechts) : okL ? links : rechts;
    return ziel;
  }
}
