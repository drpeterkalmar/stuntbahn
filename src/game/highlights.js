// Kino-Replay nach dem Ziel (n18, Peter 28.09.2026: „Nachdem man durchs Ziel ist: Cinematic Replay mit Slow-Mo-
// Drohnen-Action-Cam der besten Stunteinlagen“). Dieses Modul findet die Momente einer Fahrt – nur aus der Aufzeichnung
// (60 Hz, REC_STRIDE Werte je Bild) und den Marken des Rennens (Schnitte, Crashs, Extras), ohne Neu-Simulation – und
// baut daraus den Film: 3–5 Momente, zeitlich sortiert, ohne Überlappung, je mit Zeitlupen-Kurve und Kamera-Einstellungen,
// dazu der Zieleinlauf. Rein rechnerisch (kein three.js) → in Node testbar (tests/node/test_kinoreplay.mjs).
//
// Aufzeichnung je Bild: 0–2 Position, 3–6 Lage (Quaternion), 7 Lenkwinkel, 8/9 Raddrehung, 10–13 Einfederung der vier
// Räder (alle 0 = in der Luft), 14 Tempo vorwärts (m/s), 15 Drehzahl.
import { REC_HZ, REC_STRIDE } from './race.js';
import { Tracker } from '../ai/autopilot.js';
import { showKmhMs } from '../core/showspeed.js';
import { gTrack, gPeak, fmtG, G_ON } from '../core/gforce.js';

// ---------- Punkte-Formel (alle Regler an einer Stelle) ----------
export const HL = {
  airMin: 0.35,            // s: kürzere Luftphasen zählen nicht
  // Sprung: Punkte = k · Flugzeit (s) · (1 + Höhe/h0) · (1 + Weite/w0) · Faktor der Art
  // Höhe = Steigen über den Absprung + halbe Fallhöhe (Klippe); Weite = waagrecht vom Absprung bis zum Aufsetzen
  jump: { k: 10, h0: 4, w0: 60 },
  kindF: { jump: 1, gorge: 1.25, cliff: 1.2, drop: 1.1, air: 0.7, hop: 0.6, waves: 0.6, kuppe: 0.55 },
  // harte Landung: Aufsetz-Tempo senkrecht zur Fahrbahn ab vn m/s → base + k · (vn − Schwelle); bei Sprüngen als Zuschlag
  // (Schanze n21 setzt regulär mit ~8–9 m/s auf, Crash ab ~13 m/s)
  hard: { vn: 10.5, k: 4, base: 18 },
  // knapp gelandet: Neigung gegen die Fahrbahn beim Aufsetzen ab tilt° ohne Crash → Zuschlag
  land: { tilt: 28, bonus: 10 },
  // Looping & Co.: base · (0,6 + 0,4 · min(1,5, mittleres Tempo / v0)); Looping nur, wenn das Auto wirklich kopfüber war
  loop: { base: 42, v0: 40 }, cork: { base: 48, v0: 40 }, wendel: { base: 36, v0: 35 }, tube: { base: 28, v0: 40 },
  spiral: { base: 18, dh: 1.2 },            // Spirale/Wendel: base + dh · Höhenunterschied (m)
  waves: { base: 14, air: 25 },             // Achterbahn-Wellen (n19) befahren: base + air · Summe der Luftzeit (s)
  slope: { base: 10, dv: 1 / 4, min: 25 },  // Steilabfahrt (n19): base + Tempo-Gewinn (km/h) · dv, ab min km/h Gewinn
  wall: { base: 24, perS: 14, upY: 0.5 },   // Steilwand: base + perS · Zeit mit > 60° Neigung (s)
  halfpipe: { base: 26, perS: 10, upY: 0.8 },
  // Nitro: base + Tempo-Zuwachs (km/h) · dv + Spitze (km/h) · v
  nitro: { base: 16, dv: 1 / 5, v: 1 / 40, look: 1.2 },
  // Spitzentempo: ab min km/h, (km/h − 200) · k
  top: { min: 250, k: 1 / 6 },
  // Kurve mit Max-G (n24): größte Querbeschleunigung (angezeigte G) am Boden außerhalb von Bauwerken, mindestens minS s
  // über lat G → base + k · (G − lat). Nur ein Kandidat je Fahrt (die stärkste Kurve), Lückenfüller mit wenig Punkten
  curve: { lat: 2.6, minS: 0.4, base: 8, k: 8 },
  // Drift (n25, Leicht „Brachial“ bzw. jeder Spieler, der quer kommt): Schwimmwinkel (Bewegungsrichtung gegen die
  // Fahrzeug-Längsachse, driftTrack) ab deg Grad mindestens minS s am Boden auf normaler Fahrbahn, ohne Crash danach
  // (Lücken bis gap s zählen mit) → base + perS · Dauer + perDeg · (größter Winkel − deg). Nur der längste und der
  // stärkste Drift werden Kandidaten; ab spin Grad ein Beinahe-Dreher (eigene Art, + spinBonus)
  drift: { deg: 12, minS: 0.6, gap: 0.12, base: 16, perS: 7, perDeg: 0.35, spin: 58, spinBonus: 14 },
  // Beinahe-Unfall: am Boden (nicht in Stunt-Bauwerken) mehr als tilt° gegen die Fahrbahn geneigt, mindestens minS s,
  // ohne Crash in den folgenden safe s → base + k · (Neigung − tilt); auf zwei Rädern ab wheelsS s
  near: { tilt: 38, minS: 0.15, safe: 2, base: 28, k: 0.8, wheelsS: 0.3, wheelsBase: 26 },
  // Crash mit Überschlag: nur spektakulär (Überschlag, Absturz oder Zu-kurz, Tempo ≥ minV m/s) und nicht frustrierend
  // (höchstens maxCrashes Crashs in der Fahrt, höchstens ein Crash im Film; Festgefahren/Abseits nie)
  crash: { base: 34, maxCrashes: 3, minV: 15 },
  // Auswahl: höchstens max, mindestens min Momente (wenn vorhanden); ab dem (min+1)-ten nur ab minScore Punkten, die
  // ersten min ab lowScore; Abstand gap s; gleiche Art mehrfach: Punkte × same[n]
  pick: { max: 5, min: 3, minScore: 14, lowScore: 6, gap: 0.6, same: [1, 0.7, 0.5, 0.35, 0.25] },
  // Film (s): Länge höchstens max (Richtwert 15–30 s), Vorlauf pre und Nachlauf post in Echtzeit, Tempo-Rampen ramp
  // (Aufzeichnungszeit), Zeitlupe smin am Höhepunkt (Kern core s Aufzeichnung), Zieleinlauf finish s
  film: { max: 30, min: 15, pre: 0.8, post: 0.5, tail: 0.8, ramp: 0.4, smin: 0.25, core: [0.5, 0.9], finish: 3.2, finishSlow: 0.45 },
  // Zielshow (n27, Aufzeichnung mit Auslaufen, marks.fin): Zieleinlauf pre s vor der Linie bis post s danach (Feuerwerk,
  // Auslaufen), Zeitlupe slow von core[0] bis core[1] s um die Linie, Schnitt Tele → Zielbogen tele s nach der Linie; der
  // Zieleinlauf kommt zum Film dazu (Momente weiter höchstens film.max s)
  zshow: { pre: 2.4, post: 4.6, core: [-0.45, 0.5], slow: 0.4, tele: 0.6 },
};

// Einblendung je Art (Emoji + Text); n = Zahl (m, km/h …). km/h als Show-Tacho (core/showspeed.js, wie der Tacho), dazu
// die G-Spitze des Moments (n24, m.g = angezeigte G, core/gforce.js; ?g=0 → ohne)
const R = (x) => Math.round(x);
const gx = (g) => (G_ON && g > 0.05 ? ` · ${fmtG(g)}` : '');
export const LABEL = {
  jump: (m) => `🚀 ${R(m.w)} m Sprung${gx(m.g)}`,
  gorge: (m) => `🏞️ Schluchtsprung · ${R(m.w)} m${gx(m.g)}`,
  cliff: (m) => `🪂 Klippensprung · ${R(Math.max(m.drop, m.h))} m tief${gx(m.g)}`,
  drop: (m) => `🪂 Plateau-Sprung · ${R(Math.max(m.drop, m.h))} m tief${gx(m.g)}`,
  air: (m) => `✈️ ${m.dur.toFixed(1).replace('.', ',')} s in der Luft`,
  hop: (m) => `🦘 Hüpfer · ${m.h.toFixed(1).replace('.', ',')} m hoch`,
  waves: (m) => (m.n ? `🎢 Achterbahn-Wellen · ${m.n}× Luft` : '🎢 Achterbahn-Wellen'),
  slope: (m) => `⬇️ Steilabfahrt · +${R(m.dvShow ?? m.dv)} km/h`,
  kuppe: (m) => `⛰️ Kuppe · ${m.dur.toFixed(1).replace('.', ',')} s Luft`,
  hard: (m) => (G_ON && m.g > 0.05 ? `💥 Harte Landung · ${fmtG(m.g)}` : `💥 Harte Landung · ${R(showKmhMs(m.vn))} km/h Aufprall`),
  loop: (m) => `🌀 Looping${gx(m.g)}`,
  cork: (m) => `🍥 Korkenzieher${gx(m.g)}`,
  wendel: (m) => (m.dh ? `🌀 Wendel · ${R(m.dh)} m ${m.up ? 'hinauf' : 'hinunter'}` : `🌀 Wendel${gx(m.g)}`),
  tube: (m) => `🕳️ Röhre${gx(m.g)}`,
  spiral: (m) => `🌀 Spirale · ${R(m.dh)} m ${m.up ? 'hinauf' : 'hinunter'}`,
  wall: (m) => `🧱 Steilwand · ${R(m.deg)}°${gx(m.g)}`,
  halfpipe: (m) => `🛹 Halfpipe${gx(m.g)}`,
  nitro: (m) => `🔥 Nitro · ${R(showKmhMs(m.vmax))} km/h${gx(m.gLon)}`,
  top: (m) => `⚡ ${R(showKmhMs(m.vmax))} km/h Spitze`,
  curve: (m) => `🏁 Kurve · ${fmtG(m.g)} quer`,
  drift: (m) => `🔥 ${m.longest && !m.strongest ? 'Längster Drift' : m.strongest && !m.longest ? 'Stärkster Drift' : 'Drift'} · ${R(m.deg)}° · ${m.dur.toFixed(1).replace('.', ',')} s${gx(m.g)}`,
  spin: (m) => `🌪️ Beinahe-Dreher · ${R(m.deg)}° quer`,
  near: (m) => `😱 Beinahe-Unfall · ${R(m.deg)}° Schräglage`,
  wheels2: () => '😱 Auf zwei Rädern',
  crash: (m) => `💥 ${m.reason === 'Abgestürzt' ? 'Absturz' : m.reason === 'Zu kurz' ? 'Zu kurz gesprungen' : 'Überschlag'}`,
  finish: () => '🏁 Ziel',
};

// Kameras je Art: Folge von [Kamera, bis] – bis = 'peak' (Höhepunkt), 'end' (Ende des Clips) oder Sekunden ab Clip-Anfang.
// drone = Drohne (seitlich oben, weich, Kreisfahrt), action = Action-Cam (tief am Auto, Wackeln), tele = Stativ/Tele an
// der Landestelle (Zoom + Schwenk), heli = Hubschrauber (weit), onboard = auf dem Dach (kurz)
export const SHOTS = {
  jump: [['drone', 'peak'], ['tele', 'end']], gorge: [['heli', 'peak'], ['tele', 'end']], cliff: [['drone', 'peak'], ['action', 'end']],
  drop: [['drone', 'end']], air: [['drone', 'end']], hop: [['drone', 'end']], waves: [['action', 'end']], kuppe: [['action', 'end']],
  hard: [['tele', 'end']], loop: [['onboard', 0.9], ['tele', 'end']], cork: [['action', 'end']], wendel: [['heli', 'end']],
  tube: [['action', 'end']], spiral: [['heli', 'end']], slope: [['onboard', 0.9], ['drone', 'end']], wall: [['drone', 'end']], halfpipe: [['drone', 'end']],
  nitro: [['action', 1.6], ['onboard', 2.5], ['drone', 'end']], top: [['onboard', 1.0], ['drone', 'end']],
  near: [['action', 'end']], curve: [['action', 'peak'], ['drone', 'end']], drift: [['drone', 'peak'], ['action', 'end']], spin: [['drone', 'end']], wheels2: [['action', 'end']], crash: [['tele', 'end']], finish: [['tele', 'end']],
};
// Ausweich-Kamera, wenn derselbe Blick direkt hintereinander käme
const ALT = { drone: 'heli', heli: 'drone', tele: 'drone', action: 'drone', onboard: 'action' };

// ---------- Hilfen ----------
function rotQ(qx, qy, qz, qw, x, y, z, out) {
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + (qy * tz - qz * ty); out[1] = y + qw * ty + (qz * tx - qx * tz); out[2] = z + qw * tz + (qx * ty - qy * tx);
  return out;
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Lage an Zeit t (Aufzeichnung, s): Position, Vorwärts, Oben – linear zwischen den Bildern (für Kamera-Planung)
export function poseAt(rec, t, out = { p: [0, 0, 0], f: [0, 0, -1], u: [0, 1, 0] }) {
  const n = Math.floor(rec.length / REC_STRIDE);
  const x = clamp(t * REC_HZ, 0, n - 1.001), i = Math.floor(x), a = x - i, o = i * REC_STRIDE, p = Math.min(n - 1, i + 1) * REC_STRIDE;
  for (let k = 0; k < 3; k++) out.p[k] = rec[o + k] + (rec[p + k] - rec[o + k]) * a;
  const q = a < 0.5 ? o : p;
  rotQ(rec[q + 3], rec[q + 4], rec[q + 5], rec[q + 6], 0, 0, -1, out.f);
  rotQ(rec[q + 3], rec[q + 4], rec[q + 5], rec[q + 6], 0, 1, 0, out.u);
  return out;
}

// Schwimmwinkel je Bild (rad, n25): Bewegungsrichtung (Positionen ±1 Bild) gegen die Fahrzeug-Längsachse, in der Ebene
// quer zur Hochachse; + = Heck nach rechts (Linksdrift). 0 in der Luft, an Schnitten und unter minV m/s. Leicht geglättet
// (5 Bilder). Für Drift-Momente, Reifenqualm und -quietschen im Replay (wie car.js/drift.js im Rennen).
export function driftTrack(rec, cuts = [], minV = 8) {
  const F = Math.floor(rec.length / REC_STRIDE), raw = new Float32Array(F), out = new Float32Array(F), cut = new Set(cuts);
  const f = [0, 0, 0], u = [0, 0, 0], S = REC_STRIDE;
  for (let i = 1; i < F - 1; i++) {
    const o = i * S;
    if (cut.has(i) || cut.has(i + 1) || (rec[o + 10] === 0 && rec[o + 11] === 0 && rec[o + 12] === 0 && rec[o + 13] === 0)) continue;
    let vx = (rec[o + S] - rec[o - S]) * REC_HZ / 2, vy = (rec[o + S + 1] - rec[o - S + 1]) * REC_HZ / 2, vz = (rec[o + S + 2] - rec[o - S + 2]) * REC_HZ / 2;
    rotQ(rec[o + 3], rec[o + 4], rec[o + 5], rec[o + 6], 0, 0, -1, f);
    rotQ(rec[o + 3], rec[o + 4], rec[o + 5], rec[o + 6], 0, 1, 0, u);
    const vu = vx * u[0] + vy * u[1] + vz * u[2];
    vx -= vu * u[0]; vy -= vu * u[1]; vz -= vu * u[2];
    const rx = f[1] * u[2] - f[2] * u[1], ry = f[2] * u[0] - f[0] * u[2], rz = f[0] * u[1] - f[1] * u[0];
    const vf = vx * f[0] + vy * f[1] + vz * f[2], vr = vx * rx + vy * ry + vz * rz;
    if (Math.hypot(vf, vr) < minV) continue;
    raw[i] = Math.atan2(vr, vf);
  }
  for (let i = 0; i < F; i++) {
    if (raw[i] === 0) continue;
    let s = 0, n = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(F - 1, i + 2); k++) if (raw[k] !== 0) { s += raw[k]; n++; }
    out[i] = s / n;
  }
  return out;
}

// ---------- Auswertung je Bild ----------
// env = { track, layout? }, marks = { cuts, pens, xev, crashes }
export function frameData(rec, env, marks = {}) {
  const F = Math.floor(rec.length / REC_STRIDE), L = env.track.line;
  const D = {
    F, px: new Float32Array(F), py: new Float32Array(F), pz: new Float32Array(F), upY: new Float32Array(F), sp: new Float32Array(F),
    tilt: new Float32Array(F), air: new Uint8Array(F), idx: new Int32Array(F), bad: new Uint8Array(F), cut: new Uint8Array(F), side2: new Uint8Array(F),
    ux: new Float32Array(F), uz: new Float32Array(F), fx: new Float32Array(F), fy: new Float32Array(F), fz: new Float32Array(F),
  };
  for (const c of marks.cuts || []) if (c.f >= 0 && c.f < F) D.cut[c.f] = 1;
  // G-Kräfte je Bild (n24, angezeigte Werte wie im Cockpit/Replay)
  D.G = gTrack(rec, (marks.cuts || []).map((c) => c.f));
  // Crash-Fenster (Crash bis zum nächsten Schnitt, mit Totalschaden bis Ende des Wracks) zählen für keinen anderen Moment
  const cutsF = (marks.cuts || []).map((c) => c.f).sort((a, b) => a - b);
  const crashes = crashList(marks);
  for (const c of crashes) {
    const e = cutsF.find((f) => f > c.f) ?? F;
    for (let i = Math.max(0, c.f - 6); i < Math.min(F, e); i++) D.bad[i] = 1;
  }
  const tr = new Tracker(L), u = [0, 0, 0], f = [0, 0, 0];
  for (let i = 0; i < F; i++) {
    const o = i * REC_STRIDE;
    D.px[i] = rec[o]; D.py[i] = rec[o + 1]; D.pz[i] = rec[o + 2];
    rotQ(rec[o + 3], rec[o + 4], rec[o + 5], rec[o + 6], 0, 1, 0, u);
    rotQ(rec[o + 3], rec[o + 4], rec[o + 5], rec[o + 6], 0, 0, -1, f);
    D.upY[i] = u[1]; D.ux[i] = u[0]; D.uz[i] = u[2]; D.fx[i] = f[0]; D.fy[i] = f[1]; D.fz[i] = f[2];
    D.sp[i] = rec[o + 14];
    const c0 = rec[o + 10], c1 = rec[o + 11], c2 = rec[o + 12], c3 = rec[o + 13];
    D.air[i] = c0 === 0 && c1 === 0 && c2 === 0 && c3 === 0 ? 1 : 0;
    // auf zwei Rädern: eine Seite ganz frei, die andere trägt (Räder 0/2 links, 1/3 rechts)
    D.side2[i] = !D.air[i] && ((c0 === 0 && c2 === 0) || (c1 === 0 && c3 === 0)) ? 1 : 0;
    D.idx[i] = tr.update(D.px[i], D.py[i], D.pz[i], i === 0 || D.cut[i] === 1);
    const j = D.idx[i];
    D.tilt[i] = Math.acos(clamp(u[0] * L.nx[j] + u[1] * L.ny[j] + u[2] * L.nz[j], -1, 1)) * 180 / Math.PI;
  }
  return D;
}

// Crashs: neue Marke race.crashLog (n18); ältere Aufzeichnungen ohne sie: Zeitstrafen als Crash-Stellen
function crashList(marks) {
  if (marks.crashes && marks.crashes.length) return marks.crashes;
  return (marks.pens || []).map((p) => ({ f: p.f, reason: '', v: 0 }));
}

// Art des Stücks an Linienpunkt i: Typ (layout/track) + Gelände-Marke (g: gorge, drop, kuppe …)
function pieceAt(env, i) {
  const L = env.track.line, k = L.piece[i], pc = env.track.pieces[k] || {}, lp = env.layout && env.layout.pieces ? env.layout.pieces[k] || {} : {};
  return { type: pc.type || lp.type || '', g: lp.g || '' };
}
const isCork = (t) => /cork/.test(t);
const STRUCT = /^(loop|tube|tr_loop|tr_pipe|tr_pipeT|tr_corklr|tr_corkud|wall|halfpipe|bank|tr_bankC|tr_bank|spiral)$/;

// ---------- Kandidaten ----------
export function findMoments(rec, env, marks = {}) {
  const D = frameData(rec, env, marks), F = D.F, L = env.track.line, dt = 1 / REC_HZ;
  const out = [];
  const crashes = crashList(marks);
  const crashNear = (i0, i1) => crashes.some((c) => c.f >= i0 && c.f <= i1);
  const hops = (marks.xev || []).filter((e) => e.k === 'hop').map((e) => e.f);
  const T = (i) => i / REC_HZ;
  const plainAt = (i) => { const j = D.idx[i]; return !D.bad[i] && !D.air[i] && !L.loop[j] && !L.tube[j] && !L.air[j] && !STRUCT.test(pieceAt(env, j).type); };
  const plain = plainAt;

  // 1. Luftphasen → Sprünge, Klippen, Hüpfer, Wellen, Kuppen, harte/knappe Landungen
  const airs = [];
  for (let i = 0; i < F;) {
    if (!D.air[i] || D.bad[i]) { i++; continue; }
    let j = i;
    while (j + 1 < F && D.air[j + 1] && !D.bad[j + 1] && !D.cut[j + 1]) j++;
    const dur = (j - i + 1) * dt;
    if (dur >= HL.airMin && j + 1 < F) airs.push([i, j + 1]);   // j + 1 = erstes Bild mit Bodenkontakt
    i = j + 1;
  }
  const waveGroups = new Map();
  for (const [i0, i1] of airs) {
    let ymax = -1e9, ia = i0, hasAir = false, wave = 0, cliffT = null, gorge = false, drop = false, bumps = false;
    for (let i = i0; i <= i1; i++) {
        if (D.py[i] > ymax) { ymax = D.py[i]; ia = i; }
      const j = D.idx[i];
      if (L.air[j]) hasAir = true;
      if (L.wave && L.wave[j]) wave = L.wave[j];
      const P = pieceAt(env, j);
      if (P.type === 'cliff' || P.type === 'cliff2') cliffT = P.type;
      if (P.g === 'gorge') gorge = true;
      if (P.g === 'drop') drop = true;
      if (P.type === 'bumps' || P.type === 'crest') bumps = true;
    }
    const y0 = D.py[i0], y1 = D.py[i1], hUp = Math.max(0, ymax - y0), dropH = Math.max(0, y0 - y1);
    let w = 0;
    for (let i = i0 + 1; i <= i1; i++) w += Math.hypot(D.px[i] - D.px[i - 1], D.pz[i] - D.pz[i - 1]);
    const dur = (i1 - i0) * dt;
    // Aufsetzen: Tempo senkrecht zur Fahrbahn (Mittel über die letzten 2 Flugbilder), Neigung gegen die Fahrbahn
    const jl = D.idx[i1], k0 = Math.max(i0, i1 - 3), k1 = Math.max(i0, i1 - 1), sdt = Math.max(1, k1 - k0) * dt;
    const vx = (D.px[k1] - D.px[k0]) / sdt, vy = (D.py[k1] - D.py[k0]) / sdt, vz = (D.pz[k1] - D.pz[k0]) / sdt;
    const vn = Math.max(0, -(vx * L.nx[jl] + vy * L.ny[jl] + vz * L.nz[jl]));
    let tiltL = 0;
    for (let i = i1; i < Math.min(F, i1 + 8); i++) tiltL = Math.max(tiltL, D.tilt[i]);
    const crashed = crashNear(i0, Math.min(F - 1, i1 + REC_HZ));
    if (crashed) continue;   // misslungen → ggf. als Crash-Moment
    const hop = hops.some((f) => f >= i0 - 20 && f <= i0 + 6);
    const kind = hop ? 'hop' : gorge ? 'gorge' : drop ? 'drop' : cliffT ? 'cliff' : hasAir ? 'jump' : wave === 1 ? 'waves' : wave === 3 ? 'kuppe' : 'air';
    const h = hUp + 0.5 * dropH;
    const m = { kind, i0, i1, ip: ia, dur, h, hUp, drop: dropH, w, vn, tiltL, v: D.sp[i0] };
    m.score = HL.jump.k * dur * (1 + h / HL.jump.h0) * (1 + w / HL.jump.w0) * (HL.kindF[kind] ?? 0.7);
    const hard = vn > HL.hard.vn ? HL.hard.base + HL.hard.k * (vn - HL.hard.vn) : 0;
    if (hard && hard > m.score) { m.kind = 'hard'; m.score = hard; m.ip = i1; }
    else if (hard) { m.score += hard * 0.4; m.hard = true; }
    if (tiltL > HL.land.tilt) { m.score += HL.land.bonus; m.close = true; }
    // Höhepunkt: Sprünge am Scheitel (bei flachen Sprüngen eher Richtung Landung), harte Landung beim Aufsetzen
    if (m.kind !== 'hard') m.ip = Math.round(ia + (i1 - ia) * (kind === 'cliff' || kind === 'drop' ? 0.55 : 0.25));
    if (kind === 'waves') {
      // Achterbahn-Wellen: alle Luftphasen desselben Stücks zusammen
      const key = env.track.line.piece[D.idx[i0]];
      const g = waveGroups.get(key);
      if (g && i0 - g.i1 < 2 * REC_HZ) { g.i1 = i1; g.n++; g.dur += dur; g.score += m.score; g.w += w; continue; }
      m.n = 1; waveGroups.set(key, m);
    }
    out.push(m);
  }

  // 2. Bauwerke: Looping, Korkenzieher, Wendel, Röhre, Spirale, Steilwand, Halfpipe (zusammenhängende Bilder je Stück)
  const runs = [];
  let cur = null;
  for (let i = 0; i < F; i++) {
    const j = D.idx[i], P = pieceAt(env, j);
    let k = null;
    if (P.type === 'tr_corkud') k = 'wendel';
    else if (L.loop[j]) k = isCork(P.type) ? 'cork' : 'loop';
    else if (L.tube[j]) k = 'tube';
    else if (P.type === 'spiral') k = 'spiral';
    else if (P.type === 'waves') k = 'waves';
    else if (P.type === 'slope3' || P.type === 'slope4') k = 'slope';
    else if (P.type === 'wall') k = 'wall';
    else if (P.type === 'halfpipe') k = 'halfpipe';
    if (D.bad[i] || D.cut[i]) k = null;
    const pk = k ? L.piece[j] : -1;
    if (k && cur && cur.kind === k && cur.piece === pk && i === cur.i1 + 1) { cur.i1 = i; continue; }
    if (k) { cur = { kind: k, piece: pk, i0: i, i1: i }; runs.push(cur); } else cur = null;
  }
  for (const r of runs) {
    const { i0, i1 } = r, dur = (i1 - i0 + 1) * dt;
    if (dur < 0.5 || crashNear(i0, Math.min(F - 1, i1 + REC_HZ))) continue;
    let vs = 0, mn = 1, imn = i0;
    for (let i = i0; i <= i1; i++) { vs += Math.abs(D.sp[i]); if (D.upY[i] < mn) { mn = D.upY[i]; imn = i; } }
    const v = vs / (i1 - i0 + 1), m = { kind: r.kind, i0, i1, ip: imn, dur, v };
    if (r.kind === 'loop' || r.kind === 'cork' || r.kind === 'tube') {
      if (r.kind === 'loop' && mn > -0.2) continue;   // nicht wirklich über Kopf (z. B. abgebrochen)
      const H = HL[r.kind];
      m.score = H.base * (0.6 + 0.4 * Math.min(1.5, v / H.v0));
      if (r.kind === 'tube') m.ip = (i0 + i1) >> 1;
    } else if (r.kind === 'spiral' || r.kind === 'wendel') {
      m.dh = Math.abs(D.py[i1] - D.py[i0]); m.up = D.py[i1] > D.py[i0];
      m.score = r.kind === 'wendel' ? HL.wendel.base * (0.6 + 0.4 * Math.min(1.5, v / HL.wendel.v0)) + HL.spiral.dh * m.dh : HL.spiral.base + HL.spiral.dh * m.dh;
      m.ip = (i0 + i1) >> 1;
    } else if (r.kind === 'waves') {
      let na = 0, n = 0; for (let i = i0; i <= i1; i++) { if (D.air[i]) na++; if (D.air[i] && (i === i0 || !D.air[i - 1])) n++; }
      m.n = n; m.score = HL.waves.base + HL.waves.air * na * dt; m.ip = (i0 + i1) >> 1;
      if (out.some((x) => x.kind === 'waves' && x.i0 <= i1 && x.i1 >= i0)) continue;   // schon als Luftphasen erfasst
    } else if (r.kind === 'slope') {
      m.dv = (D.sp[i1] - D.sp[i0]) * 3.6;
      if (m.dv < HL.slope.min) continue;
      m.dvShow = showKmhMs(D.sp[i1]) - showKmhMs(D.sp[i0]);
      m.score = HL.slope.base + HL.slope.dv * m.dv; m.ip = Math.round(i0 + (i1 - i0) * 0.7);
    } else {
      const H = HL[r.kind];
      let n = 0; for (let i = i0; i <= i1; i++) if (D.upY[i] < H.upY) n++;
      if (n * dt < 0.25) continue;
      m.deg = Math.acos(clamp(mn, -1, 1)) * 180 / Math.PI;
      m.score = H.base + H.perS * n * dt;
    }
    out.push(m);
  }

  // 3. Nitro-Schübe
  for (const e of (marks.xev || []).filter((x) => x.k === 'nitro')) {
    const i0 = e.f, i1 = Math.min(F - 1, (e.end ?? F) + REC_HZ);
    if (i0 >= F - REC_HZ || D.bad[i0]) continue;
    let vmax = 0, im = i0;
    for (let i = i0; i <= i1; i++) { if (D.bad[i]) break; if (D.sp[i] > vmax) { vmax = D.sp[i]; im = i; } }
    const dv = (vmax - D.sp[i0]) * 3.6;
    out.push({ kind: 'nitro', i0, i1: Math.min(i1, im + 20), ip: Math.min(im, i0 + Math.round(HL.nitro.look * REC_HZ)), v0: D.sp[i0], vmax, dur: (im - i0) * dt, score: HL.nitro.base + dv * HL.nitro.dv + vmax * 3.6 * HL.nitro.v });
  }

  // 4. Spitzentempo (am Boden, außerhalb von Crashs)
  {
    let vmax = 0, im = -1;
    for (let i = 0; i < F; i++) if (!D.bad[i] && !D.air[i] && D.sp[i] > vmax) { vmax = D.sp[i]; im = i; }
    if (im >= 0 && vmax * 3.6 > HL.top.min) out.push({ kind: 'top', i0: Math.max(0, im - REC_HZ), i1: Math.min(F - 1, im + 30), ip: im, vmax, score: (vmax * 3.6 - 200) * HL.top.k });
  }

  // 4b. Kurve mit der größten Querbeschleunigung (am Boden, normale Fahrbahn, ohne Crash danach)
  {
    const C = HL.curve, G = D.G;
    let best = null;
    for (let i = 0; i < F;) {
      const ok = (k) => plainAt(k) && Math.abs(G.lat[k]) >= C.lat;
      if (!ok(i)) { i++; continue; }
      let j = i, mx = 0, im = i;
      while (j + 1 < F && ok(j + 1)) j++;
      for (let k = i; k <= j; k++) if (Math.abs(G.lat[k]) > mx) { mx = Math.abs(G.lat[k]); im = k; }
      if ((j - i + 1) * dt >= C.minS && (!best || mx > best.g) && !crashNear(i, Math.min(F - 1, j + 2 * REC_HZ))) best = { kind: 'curve', i0: Math.max(0, i - 30), i1: Math.min(F - 1, j + 20), ip: im, g: mx };
      i = j + 1;
    }
    if (best) { best.score = C.base + C.k * (best.g - C.lat); out.push(best); }
  }

  // 4c. Drifts (n25): längster und stärkster Drift, Beinahe-Dreher
  {
    const DR = HL.drift, Bt = driftTrack(rec, (marks.cuts || []).map((c) => c.f)), lim = DR.deg * Math.PI / 180, gapN = Math.round(DR.gap * REC_HZ);
    D.beta = Bt;
    const eps = [];
    for (let i = 0; i < F;) {
      const ok = (k) => plainAt(k) && Math.abs(Bt[k]) >= lim;
      if (!ok(i)) { i++; continue; }
      let j = i;
      for (;;) { let k = j + 1; while (k < F && k - j <= gapN && !ok(k) && !D.cut[k]) k++; if (k < F && k - j <= gapN && ok(k)) j = k; else break; }
      let mx = 0, im = i;
      for (let k = i; k <= j; k++) if (Math.abs(Bt[k]) > mx) { mx = Math.abs(Bt[k]); im = k; }
      const dur = (j - i + 1) * dt;
      if (dur >= DR.minS && !crashNear(i, Math.min(F - 1, j + 2 * REC_HZ))) eps.push({ i0: i, i1: j, ip: im, dur, deg: mx * 180 / Math.PI });
      i = j + 1;
    }
    const mk = (e, kind) => ({ kind, i0: Math.max(0, e.i0 - 20), i1: Math.min(F - 1, e.i1 + 20), ip: e.ip, dur: e.dur, deg: e.deg, score: DR.base + DR.perS * e.dur + DR.perDeg * Math.max(0, e.deg - DR.deg) + (kind === 'spin' ? DR.spinBonus : 0) });
    const spin = eps.filter((e) => e.deg >= DR.spin).sort((a, b) => b.deg - a.deg)[0];
    const rest = eps.filter((e) => e !== spin);
    const longest = rest.slice().sort((a, b) => b.dur - a.dur)[0], strongest = rest.slice().sort((a, b) => b.deg - a.deg)[0];
    if (spin) out.push(mk(spin, 'spin'));
    if (longest) { const m = mk(longest, 'drift'); m.longest = true; m.strongest = longest === strongest; out.push(m); }
    if (strongest && strongest !== longest) { const m = mk(strongest, 'drift'); m.strongest = true; out.push(m); }
  }

  // 5. Beinahe-Unfälle: starke Schräglage gegen die Fahrbahn bzw. auf zwei Rädern, am Boden, ohne Crash danach
  const nearRun = (test, minS, make) => {
    for (let i = 0; i < F;) {
      if (!test(i)) { i++; continue; }
      let j = i, mx = 0, imx = i;
      while (j + 1 < F && test(j + 1)) j++;
      for (let k = i; k <= j; k++) if (D.tilt[k] > mx) { mx = D.tilt[k]; imx = k; }
      if ((j - i + 1) * dt >= minS && !crashNear(i, Math.min(F - 1, j + HL.near.safe * REC_HZ))) out.push(make(i, j, imx, mx));
      i = j + 1;
    }
  };
  nearRun((i) => plain(i) && D.tilt[i] > HL.near.tilt, HL.near.minS, (i0, i1, ip, deg) => ({ kind: 'near', i0, i1, ip, deg, score: HL.near.base + HL.near.k * (deg - HL.near.tilt) }));
  nearRun((i) => plain(i) && D.side2[i] && D.sp[i] > 8, HL.near.wheelsS, (i0, i1, ip) => ({ kind: 'wheels2', i0, i1, ip, score: HL.near.wheelsBase + 10 * (i1 - i0) * dt }));

  // 6. Crash mit Überschlag (nur spektakulär, nicht frustrierend)
  if (crashes.length <= HL.crash.maxCrashes) {
    const cutsF = (marks.cuts || []).map((c) => c.f).sort((a, b) => a - b);
    for (const c of crashes) {
      if (/Festgefahren|Abseits/.test(c.reason || '')) continue;
      const i0 = Math.max(0, c.f - 2 * REC_HZ), e = Math.min(F - 1, (cutsF.find((f) => f > c.f) ?? F) - 1);
      if (e - c.f < 0) continue;
      let mn = 1, vmx = 0, prevCut = false;
      for (let i = i0; i <= e; i++) {
        if (i > i0 && D.cut[i] && i <= c.f) prevCut = true;
        const j = D.idx[i];
        if (!L.loop[j] && !L.tube[j] && D.upY[i] < mn) mn = D.upY[i];
        if (i <= c.f) vmx = Math.max(vmx, Math.abs(D.sp[i]));
      }
      if (prevCut) continue;
      const roll = mn < -0.1, fall = /Abgestürzt|Zu kurz/.test(c.reason || '');
      if (!(roll || fall) || vmx < HL.crash.minV) continue;
      out.push({ kind: 'crash', reason: c.reason || '', i0, i1: e, ip: Math.max(i0, c.f - 18), crash: true, end: e, score: HL.crash.base * (roll ? 1 : 0.7) * (0.7 + 0.3 * Math.min(1.5, vmx / 30)) });
    }
  }

  // G-Spitzen je Moment (angezeigte G): Sprünge/harte Landung im Landungs-Fenster, Bauwerke über das Stück, Nitro längs
  for (const m of out) {
    if (m.kind === 'curve') continue;
    const land = /^(jump|gorge|cliff|drop|hard)$/.test(m.kind);
    const p = land ? gPeak(D.G, m.i1, Math.min(F - 1, m.i1 + 24)) : gPeak(D.G, m.i0, m.i1);
    m.g = p.g;
    if (m.kind === 'nitro') { let lo = 0; for (let i = m.i0; i <= Math.min(m.i1, m.ip + REC_HZ); i++) lo = Math.max(lo, D.G.lon[i]); m.gLon = lo; }
  }
  for (const m of out) { m.t0 = T(m.i0); m.t1 = T(m.i1); m.tp = T(m.ip); m.label = LABEL[m.kind](m); }
  return { D, cands: out.filter((m) => m.score > 0).sort((a, b) => a.t0 - b.t0) };
}

// ---------- Zeitlupe ----------
// Tempo-Kurve eines Clips an Aufzeichnungszeit t: 1 außerhalb, smin im Kern [c0, c1], weiche Rampen dazwischen
export function clipSpeed(c, t) {
  if (c.smin >= 0.999) return 1;
  const r = HL.film.ramp;
  const w = t < c.c0 ? sstep(c.c0 - r, c.c0, t) : t > c.c1 ? 1 - sstep(c.c1, c.c1 + r, t) : 1;
  return 1 - (1 - c.smin) * w;
}
// Filmdauer (Echtzeit-s bei Spieltempo 1) eines Clips
export function clipFilmTime(c) {
  let ft = 0;
  const h = 1 / 240;
  for (let t = c.a; t < c.b; t += h) ft += Math.min(h, c.b - t) / clipSpeed(c, t);
  return ft;
}

// Clip um einen Moment: Kern um den Höhepunkt (Zeitlupe), Vor-/Nachlauf, nie über einen Schnitt (Reset) hinweg
function makeClip(m, D, cutT, opt) {
  const Fm = HL.film, dur = Math.min(D.F / REC_HZ, opt.endT ?? Infinity);
  const coreLen = clamp(opt.core ?? Fm.core[1], Fm.core[0], Fm.core[1]);
  let c0 = m.tp - coreLen * 0.45, c1 = m.tp + coreLen * 0.55;
  if (m.kind === 'crash') { c1 = Math.min(c1, m.t1); c0 = Math.min(c0, c1 - coreLen); }
  // Vorlauf: ab Beginn des Moments, bei langen Stücken (Wendel, Wellen) höchstens 1 s vor der Rampe
  let a = Math.max(c0 - Fm.ramp - 1, Math.min(m.t0, c0 - Fm.ramp)) - (opt.pre ?? Fm.pre), b = Math.max(c1 + Fm.ramp, Math.min(m.t1, c1 + Fm.ramp + Fm.tail)) + (opt.post ?? Fm.post);
  if (m.kind === 'crash') b = Math.min(b, m.t1 + 1 / REC_HZ);
  // Schnitte: Clip endet vor dem nächsten bzw. beginnt nach dem letzten Schnitt um den Höhepunkt
  for (const tc of cutT) {
    if (tc > m.tp && tc < b) b = tc - 1 / REC_HZ;
    if (tc <= m.tp && tc > a) a = tc;
  }
  a = Math.max(0, a); b = Math.min(dur - 1 / REC_HZ, b);
  c0 = Math.max(a, c0); c1 = Math.min(b, c1);
  if (c1 - c0 < 0.3 || b - a < 1) return null;
  return { kind: m.kind, label: m.label, score: m.score, m, a, b, c0, c1, tp: clamp(m.tp, a, b), smin: opt.smin ?? Fm.smin };
}

// Kamera-Einstellungen eines Clips (Aufzeichnungszeit)
function makeShots(c, prevCam) {
  // Zieleinlauf mit Zielshow (n27): Tele an der Linie (Zeitlupe), dann Schwenk der Zielbogen-Kamera aufs Feuerwerk
  if (c.kind === 'finish' && c.fin != null) {
    const tz = Math.min(c.b - 0.5, Math.max(c.a + 0.3, c.fin + HL.zshow.tele));
    const shots = [{ cam: 'tele', t0: c.a, t1: tz }, { cam: 'arch', t0: tz, t1: c.b }];
    if (prevCam === 'tele') shots[0].cam = 'drone';
    return shots;
  }
  const plan = SHOTS[c.kind] || [['drone', 'end']], shots = [];
  let t = c.a;
  for (let k = 0; k < plan.length; k++) {
    const [cam, until] = plan[k];
    let e = until === 'end' ? c.b : until === 'peak' ? c.tp : c.a + until;
    if (k === plan.length - 1) e = c.b;
    e = Math.min(c.b, e);
    if (e - t < 0.25) continue;
    shots.push({ cam, t0: t, t1: e });
    t = e;
  }
  if (!shots.length) shots.push({ cam: 'drone', t0: c.a, t1: c.b });
  shots[shots.length - 1].t1 = c.b;
  if (shots[0].cam === prevCam) shots[0].cam = ALT[prevCam] || 'drone';
  for (let k = 1; k < shots.length; k++) if (shots[k].cam === shots[k - 1].cam) shots[k].cam = ALT[shots[k].cam] || 'drone';
  return shots;
}

// ---------- Film bauen ----------
// Liefert { clips: [{ kind, label, a, b, c0, c1, tp, smin, shots, film }], duration, cands } oder null (zu kurz)
export function buildFilm(rec, env, marks = {}, opt = {}) {
  const F = Math.floor(rec.length / REC_STRIDE);
  if (F < 5 * REC_HZ) return null;
  const { D, cands: all } = findMoments(rec, env, marks);
  const cutT = (marks.cuts || []).map((c) => c.f / REC_HZ);
  const P = HL.pick, Fm = HL.film, Zs = HL.zshow;
  // n27: Aufzeichnung mit Auslaufen hinter dem Ziel (marks.fin) – Momente nur bis zur Linie, Zieleinlauf mit Zielshow
  const finT = marks.fin && marks.fin.f > 0 && marks.fin.f < F ? marks.fin.f / REC_HZ : null;
  const cands = finT != null ? all.filter((m) => m.tp < finT - 0.3) : all;
  const mOpt = finT != null ? { ...opt, endT: finT - 0.1 } : opt;
  // Zieleinlauf (am Ende, wenn Platz): Tele an der Ziellinie, leichte Zeitlupe kurz vor dem Ende. Ein Moment kurz vor dem
  // Ziel hat Vorrang – der Zieleinlauf wird dann kürzer oder entfällt
  const end = (F - 1) / REC_HZ;
  const finClip = (a0) => {
    let fa = Math.max(0, a0);
    for (const tc of cutT) if (tc > fa && tc < (finT ?? end)) fa = tc;
    let f;
    if (finT != null) {
      // Zielshow: über die Linie hinweg bis ins Auslaufen (Feuerwerk), Zeitlupe um die Linie
      const b = Math.min(end, finT + Zs.post);
      if (finT - fa < 0.6 || b - fa < 2) return null;
      f = { kind: 'finish', label: LABEL.finish(), score: 0, m: { kind: 'finish' }, a: fa, b, c0: Math.max(fa, finT + Zs.core[0]), c1: Math.min(b, finT + Zs.core[1]), tp: finT, fin: finT, smin: Zs.slow };
    } else {
      if (end - fa < 1.5) return null;
      f = { kind: 'finish', label: LABEL.finish(), score: 0, m: { kind: 'finish' }, a: fa, b: end, c0: Math.max(fa, end - 1.1), c1: end, tp: end - 0.3, smin: Fm.finishSlow };
    }
    f.film = clipFilmTime(f);
    return f;
  };
  const fin0 = finClip(finT != null ? finT - Zs.pre : end - Fm.finish);
  const budget = (opt.max ?? Fm.max) - (fin0 && finT == null ? fin0.film : 0);
  // gierige Auswahl nach Punkten (gleiche Art mehrfach abgewertet), ohne Überlappung, im Zeitbudget
  const chosen = [], used = {};
  const overlaps = (c) => chosen.some((x) => c.a < x.b + P.gap && c.b > x.a - P.gap);
  const pool = cands.slice();
  let filmT = 0;
  while (chosen.length < (opt.maxN ?? P.max) && pool.length) {
    let best = null, bs = -1, bi = -1;
    for (let k = 0; k < pool.length; k++) {
      const m = pool[k], s = m.score * P.same[Math.min(P.same.length - 1, used[m.kind] || 0)];
      if (s > bs) { bs = s; best = m; bi = k; }
    }
    pool.splice(bi, 1);
    if (bs < (chosen.length < P.min ? P.lowScore : P.minScore)) { if (chosen.length >= P.min) break; else continue; }
    if (best.kind === 'crash' && chosen.some((x) => x.kind === 'crash')) continue;
    const c = makeClip(best, D, cutT, mOpt);
    if (!c || overlaps(c)) continue;
    c.film = clipFilmTime(c);
    // Budget: zu lang → mit kürzerem Kern versuchen, sonst weglassen
    if (filmT + c.film > budget) {
      const c2 = makeClip(best, D, cutT, { ...mOpt, core: Fm.core[0], pre: 0.5, post: 0.3 });
      if (!c2 || overlaps(c2)) continue;
      c2.film = clipFilmTime(c2);
      if (filmT + c2.film > budget) continue;
      chosen.push(c2); filmT += c2.film;
    } else { chosen.push(c); filmT += c.film; }
    used[best.kind] = (used[best.kind] || 0) + 1;
  }
  chosen.sort((x, y) => x.a - y.a);
  const last = chosen[chosen.length - 1];
  const finish = finClip(Math.max(finT != null ? finT - Zs.pre : end - Fm.finish, last ? last.b + P.gap : 0));
  const clips = finish ? [...chosen, finish] : chosen;
  if (!clips.length) return null;
  let prev = null;
  for (const c of clips) { c.shots = makeShots(c, prev); prev = c.shots[c.shots.length - 1].cam; }
  const duration = clips.reduce((s, c) => s + c.film, 0);
  return { clips, duration, cands, moments: chosen.length, finT, momentsT: filmT };
}

// ---------- Abspielen ----------
// Film-Uhr: advance(dtFilm) rückt die Aufzeichnungszeit t mit der Zeitlupen-Kurve vor; am Clip-Ende Schnitt zum nächsten
export class FilmPlayer {
  constructor(film) {
    this.film = film; this.ci = 0; this.t = film.clips[0].a; this.ft = 0; this.done = false; this.cut = true; this.speed = 1;
  }
  get clip() { return this.film.clips[this.ci]; }
  get shot() { const c = this.clip; if (!c) return null; for (const s of c.shots) if (this.t < s.t1) return s; return c.shots[c.shots.length - 1]; }
  advance(dt) {
    if (this.done) return;
    this.cut = false;
    const prevShot = this.shot;
    let left = dt;
    // in kleinen Schritten (die Kurve ändert sich in einem Bild kaum, an den Rampen genauer)
    while (left > 1e-6 && !this.done) {
      const h = Math.min(left, 1 / 120), c = this.clip;
      const s = clipSpeed(c, this.t);
      this.t += h * s; this.ft += h; left -= h; this.speed = s;
      if (this.t >= c.b) {
        this.ci++;
        if (this.ci >= this.film.clips.length) { this.done = true; this.ci = this.film.clips.length - 1; this.t = c.b; break; }
        this.t = this.clip.a; this.cut = true;
      }
    }
    if (this.shot !== prevShot) this.cut = true;
  }
  // Fortschritt 0 … 1 (Filmzeit)
  progress() { return Math.min(1, this.ft / Math.max(0.1, this.film.duration)); }
}
