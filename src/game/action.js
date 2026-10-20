// Action-Momente (n36, Peter 09.10.2026: „Schnelle Zoom-ins auf die Szene mit Effekten und Speed-Ramps … oder Bullet-Time!“)
// Kurze Kino-Momente LIVE im Rennen – bisher gab es Zeitlupe nur im Highlight-Film nach dem Ziel.
//   Speed-Ramp  Abspieltempo fließend langsamer/schneller (1× → min → 1,5× → 1×), Kamera: Zoom-Punch
//   Zoom-Punch  schneller Ran-Zoom (Sichtfeld × punch.fov in punch.ein s) mit Radial-Unschärfe, am Ende zurück
//   Bullet-Time Zeit fast eingefroren (≤ 0,05×), Kamera fährt in ≈ 1 s im Halbkreis um das Auto (wie Matrix), dann
//               ruckartig zurück ins normale Tempo mit kurzem Wackeln
// Auslöser (Gewichte nach dem Vorlagen-Datenblatt ~/.hermes/plans/vorlagen/stuntbahn.md §3, „Für n36“: Spektakel-Faktor
// Luft ×2, Dreher ×2, Frontal ×2, Deckel ×8; Bullet-Time bevorzugt bei „ruhiger Hand“ + Luft ≥ 2,0 s; dazu Stunt-Ketten,
// Takedowns/Beinahe-Treffer, Landeschub aus n38):
//   bullet   großer Sprung: am Scheitel, erwartete Flugzeit ≥ sprung.luft s → Bullet-Time
//   kopf     Looping-Scheitel/Korkenzieher/Röhre mit Wand kopfüber → Speed-Ramp + Zoom-Punch
//   vorbei   knappes Überholen eines Gegners (n34) → Speed-Ramp, Blick zum Überholten
//   takedown Gegner crasht ≤ takedown.t s nach deinem Rempler → Speed-Ramp, Blick aufs Wrack
//   crash    Crash/Überschlag (n34-Schaden: abfallende Teile zählen mit) → Bullet-Time um das Wrack, dann normal weiter
//   landung  Landung nach dem bisher längsten Sprung des Rennens → Speed-Ramp + Zoom-Punch (Landeschub n38 ×1,5)
//   kette    Stunt-Kette ab kette.glieder Gliedern (n38) → kurzer Zoom-Punch
//   ziel     Foto-Finish: knapp vor/hinter einem Gegner bzw. knapp an der Bestzeit über die Linie → Zeitlupe + Fotoblitz
// Dosierung: Abkühlzeit (Echtzeit) je Stufe, Zufall × Spektakel-Wertung entscheidet (p = min(1, s / sRef) × chance).
// Fair: die Physik läuft in der Zeitlupe nur langsamer (feste Schritte, gleiche Ergebnisse, Rennuhr = Spielzeit), Eingaben
// gelten weiter (main.js hält kurze Tipps bis zum nächsten Schritt fest); nie, wenn gleich gebremst/gelenkt werden muss
// (Brems-Profil voraus, „Bremsen!“), Bullet-Time am Sprung nur mit genug Fallzeit danach.
// Online (n35): keine echte Zeitlupe (die anderen fahren in Echtzeit weiter) – nur Schein: Zoom-Punch und Bild-Effekte,
// Physik in Echtzeit; die Bullet-Time gibt es dort im Highlight-Film (main.js gibt die Momente als Marken weiter).
// Reine Rechnung (kein three.js): Node prüft Auslöser, Kurven und Dosierung (tests/node/test_action.mjs).

export const ACTION = {
  stufen: ['aus', 'selten', 'oft'],
  chance: { selten: 0.55, oft: 1 },
  cool: { selten: 20, oft: 8 },        // s Echtzeit zwischen zwei Momenten (Brief: ≥ 8 s; Messung tools/action_mess.mjs)
  sRef: 6,                             // Spektakel-Wertung, ab der die Chance voll gilt
  deckel: 8,                           // Faktoren zusammen höchstens × 8 (Vorlage C)
  // je Art: Dauer (Echtzeit-s, Brief: Live-Moment ≤ 1,2 s, Bullet-Time ≤ 1,5 s), Tempo-Tiefpunkt, Kamera, Grundwertung
  arten: {
    bullet: { dur: 1.4, min: 0.03, cam: 'kreis', base: 4 },
    crash: { dur: 1.2, min: 0.04, cam: 'kreis', base: 3 },
    kopf: { dur: 1.1, min: 0.15, cam: 'punch', base: 4, fov: 0.84, blick: 0.8 },   // im Looping ist die Kamera schon dicht dran
    vorbei: { dur: 1.0, min: 0.2, cam: 'punch', base: 3 },
    takedown: { dur: 1.2, min: 0.12, cam: 'punch', base: 3.5 },
    landung: { dur: 0.9, min: 0.2, cam: 'punch', base: 3 },
    kette: { dur: 0.8, min: 0.3, cam: 'punch', base: 1.5 },
    ziel: { dur: 1.2, min: 0.15, cam: 'punch', base: 4 },
  },
  ramp: { ein: 0.12, aus: 0.32, schnell: 1.5, schnellT: 0.16 },   // Speed-Ramp: hinein, zurück (über 1,5× auf 1×)
  kreis: { ein: 0.1, fahrt: 1.0, winkel: Math.PI, r: [4.5, 7.5], hoch: 0.9, fov: 0.9 },   // Bullet-Time-Kamera
  punch: { fov: 0.68, ein: 0.1, aus: 0.25 },
  nach: 0.28,                          // s Nachlauf (Wackeln nach der Rückkehr, Tempo schon 1×)
  shake: 0.14,                         // m Wackeln beim Zurückspringen
  // Effekte: Weißblitz am Anfang, Sättigung/Vignette in der Zeitlupe, Farbsäume in der Bullet-Time, Radial-Unschärfe beim Punch
  fx: { white: 0.5, whiteT: 0.2, whiteArm: 0.08, sat: 0.3, vig: 0.38, ca: 0.0022, radial: 0.075, radialT: 0.32 },
  gefahr: { t: 1.7, min: 30, vt: 0.85 },   // Brems-Profil: in den nächsten max(min m, t s) unter vt × Tempo → keine Zeitlupe
  sprung: { luft: 1.5, minAuf: 0.45, minFall: 0.6, ruhig: 2.0 },
  vorbei: { abstand: 3.4, vMin: 15, sperr: 1.0 },
  takedown: { t: 3 },
  landung: { luft: 1.3 },
  kette: { glieder: 3 },
  ziel: { vor: 0.4, gegner: 0.8, best: 0.4 },
  crash: { vMin: 15, max: 3 },
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const q = clamp((x - a) / (b - a), 0, 1); return q * q * (3 - 2 * q); };

// Stufe aus URL (?action=0/aus, 1/selten, 2/oft) bzw. Einstellung
export function actionStufe(search = '', settings = {}) {
  const v = new URLSearchParams(search).get('action');
  if (v != null && v !== '') return ({ 0: 'aus', aus: 'aus', off: 'aus', 1: 'selten', selten: 'selten', 2: 'oft', oft: 'oft' })[v] || 'selten';
  return ACTION.stufen.includes(settings.action) ? settings.action : 'selten';
}

// Tempo-Faktor (Abspieltempo der Spielzeit) zur Echtzeit u seit Beginn des Moments
export function tempoBei(M, u) {
  const A = ACTION.arten[M.art], R = ACTION.ramp, K = ACTION.kreis, d = M.dur;
  if (u >= d || u < 0) return 1;
  if (A.cam === 'kreis') return u < K.ein ? 1 + (A.min - 1) * sstep(0, K.ein, u) : A.min;   // am Ende ruckartig 1×
  if (u < R.ein) return 1 + (A.min - 1) * sstep(0, R.ein, u);
  const h = d - R.aus;
  if (u < h) return A.min;
  if (u < h + R.schnellT) return A.min + (R.schnell - A.min) * sstep(h, h + R.schnellT, u);
  return R.schnell + (1 - R.schnell) * sstep(h + R.schnellT, d, u);
}

// Bild-Effekte zur Zeit u: { white, sat, vig, ca, radial, fovK, shake 0…1, bars 0…1 }
export function fxBei(M, u, arm = false) {
  const A = ACTION.arten[M.art], F = ACTION.fx, P = ACTION.punch, d = M.dur;
  const o = { white: 0, sat: 0, vig: 0, ca: 0, radial: 0, fovK: 1, shake: 0, bars: 0 };
  if (u < 0) return o;
  if (u >= d) { const q = (u - d) / ACTION.nach; if (q < 1) o.shake = (1 - q) * (1 - q); return o; }
  // Weißblitz (Blitze reduzieren: nur leichtes Aufhellen)
  const w = Math.max(0, 1 - u / F.whiteT);
  o.white = (arm ? F.whiteArm : F.white) * w * w * (M.schein && !arm ? 0.7 : 1);
  // Zeitlupen-Anteil (0 … 1) für Sättigung und Vignette
  const ein = sstep(0, 0.15, u), aus = A.cam === 'kreis' ? 1 : 1 - sstep(d - ACTION.ramp.aus, d - ACTION.ramp.aus + 0.12, u);
  const z = ein * aus;
  o.sat = F.sat * z; o.vig = F.vig * z;
  if (A.cam === 'kreis') {
    o.ca = F.ca * z * (arm ? 0.5 : 1);
    o.bars = sstep(0, 0.18, u);
    o.fovK = 1 + (ACTION.kreis.fov - 1) * sstep(0, 0.2, u);
    o.radial = F.radial * 0.6 * Math.max(0, 1 - u / 0.2);
  } else {
    const pin = sstep(0, P.ein, u), pout = 1 - sstep(d - P.aus, d, u);
    o.fovK = 1 + ((A.fov ?? P.fov) - 1) * pin * pout;
    o.radial = F.radial * Math.max(0, 1 - u / F.radialT) + F.radial * 0.6 * sstep(d - ACTION.ramp.aus, d - ACTION.ramp.aus + 0.1, u) * (1 - sstep(d - 0.12, d, u));
    o.bars = M.art === 'ziel' ? sstep(0, 0.2, u) * 0.6 : 0;
  }
  return o;
}

// Spektakel-Wertung: Grundwert × Faktoren (zusammen höchstens × deckel)
export function spektakel(art, f = {}) {
  const A = ACTION.arten[art];
  let k = 1;
  if (f.luft) k *= 2;            // Vorlage C: in der Luft × 2
  if (f.dreher) k *= 2;          // dreht sich (Salto/Schraube/Überschlag) × 2
  if (f.frontal) k *= 2;         // frontal × 2
  if (f.ruhig) k *= 1.5;         // ruhige Hand (n38)
  if (f.schub) k *= 1.5;         // Landeschub (n38)
  if (f.teile) k *= 1.5;         // abfallende Teile (n34-Schaden)
  if (f.k) k *= f.k;             // freie Gewichtung (Flugzeit, Kettenlänge, Knappheit)
  return A.base * Math.min(ACTION.deckel, k);
}

// Gefahr voraus? (Brems-Profil: muss man in den nächsten Sekunden deutlich langsamer werden, bzw. „Bremsen!“ steht an)
export function gefahrVoraus(race, env) {
  if (!race || !env || !env.prof) return false;
  if (race.bhOn) return true;
  const L = env.track.line, vt = env.prof.vt, G = ACTION.gefahr, car = race.car;
  const v = Math.abs(car.fwdSpeed ? car.fwdSpeed() : 0);
  if (v < 5) return false;
  let i = race.tracker ? race.tracker.idx : 0, s = 0;
  const reach = Math.max(G.min, G.t * v);
  for (let c = 0; c < 2000 && s < reach; c++) {
    const j = i + 1 >= L.n ? (L.closed ? 1 : -1) : i + 1;
    if (j < 0) break;
    const d = L.s[j] - L.s[i];
    s += d >= 0 ? d : L.s[j];   // Umlauf (geschlossen: letzter Punkt = erster)
    if (vt[j] < G.vt * v && !L.air[j]) return true;
    i = j;
  }
  return false;
}

// Restweg bis zur Ziellinie (m) – wie race.js finish(): geschlossen ab Runde 1 bis startIdx, offen bis n − 2
export function restZumZiel(race, env) {
  const L = env.track.line, T = race.tracker, i = T.idx;
  if (race.cpNext < race.cps.length) return Infinity;
  if (L.closed) return T.lap >= 1 ? L.s[race.startIdx] - L.s[i] : L.total - L.s[i] + L.s[race.startIdx];
  return L.s[L.n - 2] - L.s[i];
}

// Kamera-Rechnung (Bullet-Time-Kreis, Zoom-Punch, Wackeln) – Vektoren als [x, y, z]
const V = (x = 0, y = 0, z = 0) => [x, y, z];

export class ActionRegie {
  // opt = { stufe, online, rnd, arm (Blitze reduzieren) }
  constructor(opt = {}) {
    this.stufe = opt.stufe || 'selten'; this.online = !!opt.online; this.rnd = opt.rnd || Math.random; this.arm = !!opt.arm;
    this.M = null; this.uhr = 0; this.letzt = -1e9; this.log = []; this.n = {};
    this.vyPrev = 0; this.luftRekord = 0; this.warLuft = false; this.luftT = 0; this.kopfStueck = -1;
    this.rempler = new Map(); this.vorbeiT = new Map(); this.dp = new Map(); this.zielGeprueft = false;
    this.cam = { pos: V(), look: V(), fovK: 1, an: false };
    this.out = fxBei({ art: 'kopf', dur: 1 }, -1);
  }
  get aktiv() { return !!this.M; }
  // Faktor für die Spielzeit (Physik, Teilchen, Trümmer, Welt-Uhr); online immer 1 (Schein-Variante)
  get physK() { return this.M && !this.M.schein ? this.M.k : 1; }
  get kreis() { return !!(this.M && this.M.cam === 'kreis' && this.M.u < this.M.dur); }

  // Kandidat prüfen: Dosierung (Abkühlzeit, Zufall × Wertung), Sicherheit. Liefert den gestarteten Moment oder null
  versuch(art, s, info = {}, W = {}) {
    const e = { t: +this.uhr.toFixed(2), art, s: +s.toFixed(2), recT: W.recT ?? null, ok: false, grund: '' };
    this.log.push(e);
    if (this.stufe === 'aus') { e.grund = 'aus'; return null; }
    if (this.M) { e.grund = 'läuft'; return null; }
    const cool = ACTION.cool[this.stufe] || 8;
    if (this.uhr - this.letzt < cool) { e.grund = 'abkühlen'; return null; }
    if (info.gefahr) { e.grund = 'gefahr'; return null; }
    const p = Math.min(1, s / ACTION.sRef) * (ACTION.chance[this.stufe] ?? 0.5);
    e.p = +p.toFixed(2);
    if (!(this.rnd() < p)) { e.grund = 'zufall'; return null; }
    e.ok = true;
    return this.starte(art, info);
  }
  starte(art, info = {}) {
    const A = ACTION.arten[art];
    let cam = A.cam;
    const schein = this.online;
    if (schein && cam === 'kreis') cam = 'punch';   // online: kein Kameraflug um das Auto (die Fahrt läuft echt weiter)
    this.M = { art, dur: A.dur, u: 0, k: 1, cam, schein, fokus: info.fokus || null, start: null, seite: 0, r: 0, frei: 1 };
    this.n[art] = (this.n[art] || 0) + 1;
    this.letzt = this.uhr;
    return this.M;
  }
  stop() { if (this.M) { this.M = null; this.letzt = this.uhr; } }

  // je Bild (Echtzeit rdt), vor den Physikschritten: Moment vorrücken, Tempo-Faktor
  takt(rdt) {
    this.uhr += rdt;
    const M = this.M;
    if (!M) { this.out = fxBei({ art: 'kopf', dur: 1 }, -1); return; }
    M.u += rdt;
    M.k = tempoBei(M, M.u);
    this.out = fxBei(M, M.u, this.arm);
    if (M.u >= M.dur + ACTION.nach) { this.M = null; this.letzt = this.uhr; }
  }

  // ---------- Auslöser aus dem Zustand (je Bild, nach den Physikschritten) ----------
  // W = { race, env, gegner (GegnerFeld oder null), boden(x, y, z) → Höhe der Fläche darunter, recT }
  beobachte(W) {
    const race = W.race, car = race.car;
    if (race.state !== 'running' && race.state !== 'finished') { this.vyPrev = 0; this.warLuft = false; return; }
    const air = car.onGround === 0 && !car.surfaceKind && !car.crash;
    const live = race.stunts && race.stunts.cur && race.stunts.cur.land < 0 ? race.stunts.cur : null;
    // großer Sprung: Scheitel (Steigen → Fallen), erwartete Flugzeit aus der Höhe über der Fläche darunter
    if (air && live && this.vyPrev > 0 && car.v.y <= 0 && live.t >= ACTION.sprung.minAuf && W.boden) {
      const g = W.g || 9.81 * 0.7, yB = W.boden(car.pos.x, car.pos.y, car.pos.z);
      const h = yB == null ? 0 : Math.max(0, car.pos.y - yB);
      const fall = Math.sqrt(2 * h / g), tot = live.t + fall;
      if (tot >= ACTION.sprung.luft && fall >= ACTION.sprung.minFall) {
        const L = race.stunts.live ? race.stunts.live() : null;
        const ruhig = !!(L && L.calm && tot >= ACTION.sprung.ruhig);
        const dreh = Math.hypot(car.w.x, car.w.y, car.w.z) > 2.5 || !!(L && (L.flips || L.rolls || L.spins));
        this.versuch('bullet', spektakel('bullet', { luft: true, dreher: dreh, ruhig, k: clamp(tot / ACTION.sprung.luft, 1, 2) }), {}, W);
      }
    }
    // Landung nach dem längsten Sprung des Rennens (Aufsetzen)
    if (this.warLuft && !air && !car.crash && car.onGround > 0) {
      const t = this.luftT;
      if (t >= Math.max(ACTION.landung.luft, this.luftRekord - 1e-3)) this.versuch('landung', spektakel('landung', { k: clamp(t / 1.5, 1, 2) }), { gefahr: gefahrVoraus(race, W.env) }, W);
      this.luftRekord = Math.max(this.luftRekord, t);
    }
    if (air && live) this.luftT = live.t;
    this.warLuft = air && !!live; this.vyPrev = air ? car.v.y : 0;
    // Looping-Scheitel / Korkenzieher / Röhre mit Wand: kopfüber im Bauwerk (je Stück einmal)
    const i = race.tracker.idx, bau = race.bauK ? race.bauK[i] : null;
    if (bau && /loop|cork|tubewall|wendel/.test(bau) && car.frame.u.y < -0.6) {
      const st = W.env.track.line.piece[i] * 8 + race.tracker.lap;
      if (st !== this.kopfStueck) {
        this.kopfStueck = st;
        this.versuch('kopf', spektakel('kopf', { k: bau === 'cork' || bau === 'tubewall' ? 1.4 : 1 }), { gefahr: false }, W);
      }
    }
    // knappes Überholen (Fortschritt Gegner − Spieler wechselt von + nach −, dicht daneben, beide schnell)
    if (W.gegner && race.state === 'running') {
      const p0 = race.tracker.progress(), V0 = ACTION.vorbei;
      for (const g of W.gegner.fahrer) {
        const dp = g.fortschritt() - p0, prev = this.dp.get(g.id);
        this.dp.set(g.id, dp);
        if (prev == null || !(prev > 0 && dp <= 0) || Math.abs(dp) > 15) continue;
        const c = g.car, d = Math.hypot(c.pos.x - car.pos.x, c.pos.y - car.pos.y, c.pos.z - car.pos.z);
        if (d > V0.abstand || car.speed() < V0.vMin || g.zustand === 'crash') continue;
        if (this.uhr - (this.vorbeiT.get(g.id) ?? -99) < 3) continue;
        this.vorbeiT.set(g.id, this.uhr);
        const knapp = clamp(V0.abstand / Math.max(1.2, d), 1, 2.5);
        this.versuch('vorbei', spektakel('vorbei', { luft: air, k: knapp }), { gefahr: gefahrVoraus(race, W.env), fokus: () => [c.pos.x, c.pos.y + 0.5, c.pos.z] }, W);
      }
    }
    // Foto-Finish: kurz vor der Linie, ein Gegner knapp dran bzw. knapp an der Bestzeit
    if (race.state === 'running' && !this.zielGeprueft) {
      const rest = restZumZiel(race, W.env), v = Math.max(5, car.speed());
      if (rest < Infinity && rest / v < ACTION.ziel.vor) {
        this.zielGeprueft = true;
        let knapp = 0;
        if (W.gegner) {
          const p0 = race.tracker.progress();
          for (const g of W.gegner.fahrer) { if (g.fertig && g.zeit != null && race.time - g.zeit > ACTION.ziel.gegner) continue; const dt = Math.abs(g.fortschritt() - p0) / v; if (dt < ACTION.ziel.gegner) knapp = Math.max(knapp, 1 + (ACTION.ziel.gegner - dt) / ACTION.ziel.gegner); }
        }
        if (W.best != null) { const dt = Math.abs(race.time + rest / v - W.best); if (dt < ACTION.ziel.best) knapp = Math.max(knapp, 1 + (ACTION.ziel.best - dt) / ACTION.ziel.best); }
        if (knapp > 0) this.versuch('ziel', spektakel('ziel', { k: knapp }), {}, W);
      }
    }
  }

  // ---------- Auslöser aus Ereignissen ----------
  // Rennen (race.events): Crash, Stunt (Kette)
  ereignis(e, W) {
    const race = W.race;
    if (e.type === 'crash') {
      if (/Festgefahren|Abseits|Falschfahrer/.test(e.reason || '')) return;
      if ((e.v || 0) < ACTION.crash.vMin || race.crashes > ACTION.crash.max) return;
      const roll = race.car.frame.u.y < 0.3, fall = /Abgestürzt|Zu kurz/.test(e.reason || '');
      this.versuch('crash', spektakel('crash', { luft: race.car.onGround === 0 || fall, dreher: roll || Math.hypot(race.car.w.x, race.car.w.y, race.car.w.z) > 4, teile: !!W.teile, frontal: (e.imp || 0) > 14 }), {}, W);
    } else if (e.type === 'stunt' && !e.hop && e.landing !== 'crash' && (e.chain || 0) >= ACTION.kette.glieder) {
      this.versuch('kette', spektakel('kette', { schub: !!e.schub, ruhig: !!e.calm, k: clamp((e.chain || 0) / ACTION.kette.glieder, 1, 2) }), { gefahr: gefahrVoraus(race, W.env) }, W);
    }
  }
  // Gegner (n34, gegner.events je Schritt): Rempler des Spielers merken, Takedown, wenn der Gegner danach crasht
  gegnerEreignis(e, W) {
    if (e.type === 'stoss' && e.spieler && e.id != null) this.rempler.set(e.id, { t: this.uhr, v: e.v, frontal: !!e.frontal });
    else if (e.type === 'gegnerCrash') {
      const r = this.rempler.get(e.id);
      if (!r || this.uhr - r.t > ACTION.takedown.t) return;
      this.rempler.delete(e.id);
      const g = W.gegner && W.gegner.fahrer.find((x) => x.id === e.id);
      const luft = !!(g && g.car && g.car.onGround === 0);
      this.versuch('takedown', spektakel('takedown', { luft, frontal: r.frontal, k: clamp((e.v || 10) / 25, 1, 2) }), { fokus: g ? () => [g.car.pos.x, g.car.pos.y + 0.5, g.car.pos.z] : null, gefahr: gefahrVoraus(W.race, W.env) }, W);
    }
  }

  // ---------- Kamera ----------
  // rig = { pos, look, fov } der normalen Kamera in diesem Bild; car = Mittelpunkt [x, y, z]; frei(a, b) → freier Anteil
  // der Strecke a → b (1 = frei); boden(x, z) → Mindesthöhe. Ergebnis in this.cam (an = übernimmt die Kamera)
  kamera(rig, car, frei, boden, rdt = 1 / 60) {
    const M = this.M, C = this.cam;
    C.an = false;
    if (!M) return C;
    const u = M.u, o = this.out;
    C.fovK = o.fovK;
    for (let k = 0; k < 3; k++) { C.pos[k] = rig.pos[k]; C.look[k] = rig.look[k]; }
    if (M.cam === 'kreis' && u < M.dur) {
      const K = ACTION.kreis;
      if (!M.start) {
        // Start: Vektor Auto → Kamera waagrecht; Halbmesser aus dem Abstand (begrenzt); Drehsinn zur freieren Seite
        const dx = rig.pos[0] - car[0], dz = rig.pos[2] - car[2], l = Math.hypot(dx, dz) || 1;
        M.r = clamp(l, K.r[0], K.r[1]); M.a0 = Math.atan2(dz, dx); M.h = clamp(rig.pos[1] - car[1], 0.8, 3.5);
        let best = -1;
        for (const sg of [1, -1]) {
          let f = 0;
          for (const q of [0.35, 0.65, 1]) { const a = M.a0 + sg * K.winkel * q; f += frei ? frei(car, [car[0] + Math.cos(a) * M.r, car[1] + M.h + K.hoch * Math.sin(Math.PI * q), car[2] + Math.sin(a) * M.r]) : 1; }
          if (f > best + 1e-3) { best = f; M.seite = sg; }
        }
        M.start = true; M.frei = 1;
      }
      const q = sstep(K.ein, K.ein + K.fahrt, u), a = M.a0 + M.seite * K.winkel * q;
      const want = [car[0] + Math.cos(a) * M.r, car[1] + M.h + K.hoch * Math.sin(Math.PI * q), car[2] + Math.sin(a) * M.r];
      // verdeckt (Bauteil, Hang) → heranziehen (schnell hinein, langsam hinaus), nie unter den Boden
      const fr = frei ? frei(car, want) : 1, ziel = fr >= 0.999 ? 1 : Math.max(0.35, fr - 0.08);
      M.frei = ziel < M.frei ? ziel : M.frei + (ziel - M.frei) * Math.min(1, rdt * 3);
      for (let k = 0; k < 3; k++) C.pos[k] = car[k] + (want[k] - car[k]) * M.frei;
      const g = boden ? boden(C.pos[0], C.pos[2]) : -1e9;
      if (C.pos[1] < g) C.pos[1] = g;
      // Übergang von der normalen Kamera in den Kreis (erste 0,1 s) – weich, dann fest aufs Auto
      const w = sstep(0, K.ein + 0.05, u);
      for (let k = 0; k < 3; k++) { C.pos[k] = rig.pos[k] + (C.pos[k] - rig.pos[k]) * w; C.look[k] = rig.look[k] + (car[k] - rig.look[k]) * w; }
      C.an = true;
    } else if (M.cam === 'punch' && u < M.dur) {
      // Ran-Zoom auf die Szene: Blick ein Stück zum Auto (sonst rutscht es beim engeren Sichtfeld unten aus dem Bild) bzw. zum
      // Fokus (Überholter, Takedown-Wrack) – zwischen Auto und Fokus
      const w = sstep(0, 0.12, u) * (1 - sstep(M.dur - 0.25, M.dur, u));
      const f = M.fokus ? M.fokus() : null;
      for (let k = 0; k < 3; k++) {
        const z = f ? (car[k] + f[k]) / 2 : car[k];
        C.look[k] = rig.look[k] + (z - rig.look[k]) * w * (ACTION.arten[M.art].blick ?? 0.6);
      }
      C.an = true;
    }
    // Rückkehr: kurzes Wackeln
    if (o.shake > 0) {
      const a = ACTION.shake * o.shake, t = this.uhr;
      C.pos[0] += a * Math.sin(t * 61); C.pos[1] += a * Math.sin(t * 47 + 1); C.pos[2] += a * Math.sin(t * 53 + 2);
      C.an = true;
    }
    if (o.fovK !== 1) C.an = true;
    return C;
  }

  // Zahlen für Bericht/Tests
  stats() {
    const ok = this.log.filter((e) => e.ok), by = {};
    for (const e of this.log) { const b = by[e.art] || (by[e.art] = { kand: 0, ok: 0 }); b.kand++; if (e.ok) b.ok++; }
    return { stufe: this.stufe, online: this.online, kandidaten: this.log.length, momente: ok.length, je: by, uhr: +this.uhr.toFixed(1) };
  }
}
