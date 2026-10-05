// Zielshow (n27, Peter 03.10.2026: „Pyro-Effekte bei Zieleinfahrt, ein paar Sekunden weiterfahren nach dem Ziel-
// Durchfahren (auch im Replay und Highlight)“). Dieses Modul plant das Feuerwerk rein rechnerisch (kein three.js, in Node
// prüfbar: tests/node/test_zielshow.mjs): jede Partikel bekommt Startort, Startzeit, Anfangsgeschwindigkeit, Lebensdauer,
// Größe, Luftwiderstand und Farbe. Die Bahn rechnet der Grafikchip aus der Zeit seit dem Zieldurchgang (gfx/pyro.js) –
// dadurch ist das Feuerwerk im Rennen, im Replay und im Highlight-Film Bild für Bild gleich (deterministisch aus dem
// Zielzeitpunkt und dem Strecken-Seed), egal wie schnell oder in welcher Zeitlupe abgespielt wird.
//
// Bestandteile (Zeiten in Spielsekunden ab der Ziellinie):
//   Funkenfontänen links und rechts am Fahrbahnrand unter dem Zielbogen, Flammensäulen (drei „Wusch“), Raketen mit
//   Schweif und Bursts über dem Ziel, Konfetti aus zwei Kanonen, Bodenschein unter den Fontänen und unter dem Bogen
//   (falsches Licht aufs Umfeld – billig statt echter Lichtquellen), Lichtblitze je Burst (Bloom-Verstärkung im Kino-Look).
//   Bestzeit: mehr Raketen, goldene Bursts mit Glitzer; Leicht/normale Zeit: kleiner. Budget nach Grafikstufe.
import { rng, hashStr } from '../core/util.js';

// Partikel-Arten (Shader in gfx/pyro.js): Funke (Strich entlang der Flugrichtung), Glut (weicher Ball, wächst),
// Konfetti (deckend, flattert), Bodenschein (flach auf der Fahrbahn), Glitzer (Funke, der funkelt)
export const KIND = { spark: 0, glow: 1, confetti: 2, ground: 3, glitter: 4, smoke: 5 };

export const ZIEL = {
  // Ablauf live (Spielsekunden ab der Ziellinie): Schnitt auf die Zielbogen-Kamera, Schwenk vom Auto auf den Bogen,
  // Ergebnis-Karte bzw. Highlight-Film ab end; Tippen überspringt ab tap
  cut: 0.7, pan: 1.5, end: 4.6, tap: 0.35,
  // Auslaufen: Aufzeichnung läuft rec s weiter (Replay, Highlight-Film); hold s Tempo halten, dann höchstens decel m/s²
  // sanft ausrollen bis auf vEnd des Ziel-Tempos; vor Sprüngen/Loopings hinter dem Ziel stopGap m davor anhalten (höchstens
  // stopDecel m/s²) – reicht der Weg nicht: Profil-Tempo hindurch (nie zu kurz springen)
  rec: 5.0, hold: 0.9, decel: 6.5, vEnd: 0.3, ramp: 0.6, stopDecel: 8, stopGap: 25,
  // Jubel-Dreher (Leicht + Fahrstil Brachial, wenn Platz ist): mit decel m/s² auf v m/s (spätestens bis latest s), dann
  // Soll-Schwimmwinkel bis deg Grad in tIn s (Handbremse hand s); Fahrbahn gerade über len m, keine Stunts, keine Hochstraße
  spin: { v: 26, decel: 14, latest: 3.6, deg: 150, tIn: 1.0, hand: 0.25, len: 45, kMax: 1 / 110, latMax: 2.5, edge: 1.4, lock: 0.62, rearGrip: 0.55, thr: 0.35 },
  // Budget je Grafikstufe (0 Einfach, 1 Standard, 2 Kino): Faktor auf die Partikelzahlen, Raketen, Flammen/Konfetti
  tiers: [
    { k: 0.3, rockets: 3, flames: false, confetti: false, max: 800 },
    { k: 0.62, rockets: 5, flames: true, confetti: true, max: 2300 },
    { k: 1, rockets: 7, flames: true, confetti: true, max: 4096 },
  ],
  // Bestzeit: mehr Raketen, mehr Funken je Burst, Gold; sonst (Leicht oder normale Zeit) etwas kleiner
  best: { rockets: 3, burst: 1.3 }, normal: { rockets: -1, burst: 0.85, fountain: 0.85 },
  // Fontänen: Funken je s und Seite (×k), Dauer s, Tempo m/s, Lebensdauer s
  fountain: { rate: 210, dur: 3.0, v: [11, 16.5], life: [0.8, 1.25], size: [0.06, 0.1], drag: 0.55, cone: 0.16 },
  flames: { at: [0, 0.38, 0.8], n: 44, v: [14, 21], life: [0.45, 0.75], size: [0.9, 1.6], drag: 2.4, grav: -0.25 },
  rocket: { t0: 0.12, gap: 0.42, apex: [1.1, 1.4], h: [20, 30], spread: 14, ahead: [-6, 12], trail: 26 },
  burst: { n: 120, v: [15, 21], life: [1.4, 2.2], size: [0.24, 0.34], drag: 1.3, grav: 0.45, glitter: 40, smoke: 5 },
  confetti: { t0: 0.15, n: 160, v: [14, 20], life: [3.6, 4.8], size: [0.13, 0.2], drag: 2.5, grav: 0.5 },
  // Lichtblitz je Burst: Stärke (0 … 1), Abklingzeit s
  flash: { amp: 0.22, ampBest: 0.32, tau: 0.13 },
};

// Farben (linear, Glut/Funken dürfen über 1 – der Bloom lässt sie glühen)
const PAL = {
  normal: [[1.0, 0.25, 0.18], [0.3, 0.55, 1.0], [0.35, 1.0, 0.4], [1.0, 0.95, 0.85], [0.95, 0.4, 1.0]],
  gold: [[1.0, 0.7, 0.15], [1.0, 0.8, 0.3], [1.0, 0.55, 0.1], [1.0, 0.62, 0.2]],
  confetti: [[0.95, 0.15, 0.12], [0.1, 0.45, 0.95], [1.0, 0.8, 0.1], [0.15, 0.75, 0.3], [0.95, 0.95, 0.95], [0.85, 0.2, 0.75]],
  confettiBest: [[1.0, 0.78, 0.25], [0.92, 0.92, 0.95], [1.0, 0.62, 0.15], [0.95, 0.95, 0.85]],
};

// Zielbogen-Geometrie aus der Strecke: Mitte der Ziellinie, waagrechte Fahrtrichtung t, rechts b, halbe Fahrbahnbreite
export function pyroGeo(track) {
  const L = track.line, i = Math.max(0, Math.min(L.n - 1, track.start ? track.start.idx : 0));
  const l = Math.hypot(L.tx[i], L.tz[i]) || 1, tx = L.tx[i] / l, tz = L.tz[i] / l;
  return { p: [L.px[i], L.py[i], L.pz[i]], t: [tx, 0, tz], b: [-tz, 0, tx], hw: L.hw ? L.hw[i] : 7.3, idx: i };
}

// Plan: geo = pyroGeo(track), opt = { tier 0|1|2, best, easy, seed }. Liefert { n, data: Float32Array(n·16), end, flashes,
// sounds, glows } – je Partikel 16 Werte: Ort (3) + Startzeit, Geschwindigkeit (3) + Lebensdauer, Größe, Luftwiderstand,
// Schwerkraft-Anteil, Art, Farbe (3) + Zufallswert
export function pyroPlan(geo, opt = {}) {
  const Z = ZIEL, T = Z.tiers[Math.max(0, Math.min(2, opt.tier ?? 2))], best = !!opt.best && !opt.easy;
  const mod = best ? { rockets: Z.best.rockets, burst: Z.best.burst, fountain: 1 } : Z.normal;
  const r = rng((hashStr(String(opt.seed ?? 'ziel')) ^ 0x51e1) >>> 0);
  const R = (a, b) => a + (b - a) * r();
  const pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
  const out = [], flashes = [], sounds = [], glows = [];
  const [px, py, pz] = geo.p, [tx, , tz] = geo.t, [bx, , bz] = geo.b, hw = geo.hw;
  const at = (side, off, along = 0, up = 0) => [px + bx * side * off + tx * along, py + up, pz + bz * side * off + tz * along];
  const push = (p, t0, v, life, size, drag, grav, kind, c) => {
    out.push(p[0], p[1], p[2], t0, v[0], v[1], v[2], life, size, drag, grav, kind, c[0], c[1], c[2], r());
  };
  // Richtung im Kegel um Oben, leicht nach außen (side) geneigt
  const coneDir = (side, cone, lean) => {
    const a = r() * Math.PI * 2, c = Math.sqrt(r()) * cone;
    const s = Math.sin(c);
    return [Math.cos(a) * s + bx * side * lean, Math.cos(c), Math.sin(a) * s + bz * side * lean];
  };
  // ---- Funkenfontänen (beide Seiten am Fahrbahnrand unter dem Bogen) ----
  const F = Z.fountain, fOff = Math.max(2.5, hw - 0.6), fK = T.k * (mod.fountain ?? 1);
  const nF = Math.round(F.rate * F.dur * fK);
  for (const side of [-1, 1]) {
    const base = at(side, fOff, 0, 0.15);
    glows.push({ p: at(side, fOff, 0, 0.05), r: 6.5, t0: 0, t1: F.dur + 0.4, k: 0.55 });
    for (let i = 0; i < nF; i++) {
      const t0 = (i + r()) / nF * F.dur;
      // zwei Schübe: stark bis 1,3 s, kurz schwächer, dann wieder hoch (Fontäne „atmet“)
      const pulse = t0 < 1.3 ? 1 : t0 < 1.7 ? 0.7 : 0.95;
      const d = coneDir(side, F.cone, 0.05), v = R(F.v[0], F.v[1]) * pulse;
      const hot = r();
      push(base, t0, [d[0] * v, d[1] * v, d[2] * v], R(F.life[0], F.life[1]), R(F.size[0], F.size[1]), F.drag, 1, KIND.spark, hot < 0.3 ? [1.0, 0.95, 0.75] : [1.0, 0.68, 0.28]);
    }
    sounds.push({ t: 0, kind: 'fountain', side, dur: F.dur });
  }
  // ---- Flammensäulen (drei Wusch) ----
  if (T.flames) {
    const FL = Z.flames, n = Math.round(FL.n * T.k);
    for (const side of [-1, 1]) for (const ta of FL.at) {
      const base = at(side, fOff + 0.9, 0, 0.3);
      for (let i = 0; i < n; i++) {
        const d = coneDir(side, 0.12, 0.03), v = R(FL.v[0], FL.v[1]);
        push(base, ta + r() * 0.16, [d[0] * v, d[1] * v, d[2] * v], R(FL.life[0], FL.life[1]), R(FL.size[0], FL.size[1]), FL.drag, FL.grav, KIND.glow, r() < 0.5 ? [1.0, 0.42, 0.1] : [1.0, 0.62, 0.18]);
      }
      if (side === 1) sounds.push({ t: ta, kind: 'whoosh' });
    }
  }
  // ---- Raketen + Bursts ----
  const RK = Z.rocket, B = Z.burst, nR = Math.max(2, T.rockets + mod.rockets), g = 9.81;
  for (let k = 0; k < nR; k++) {
    const side = k % 2 ? 1 : -1, tl = RK.t0 + k * RK.gap + r() * 0.12;
    const L0 = at(side, hw + 3.5, -5, 0.4);
    const T1 = R(RK.apex[0], RK.apex[1]), H = R(RK.h[0], RK.h[1]) * (best ? 1.08 : 1);
    const P1 = at(1, R(-RK.spread, RK.spread), R(RK.ahead[0], RK.ahead[1]), H);
    // ohne Luftwiderstand: v0 = (P1 − L0 − ½ g T²) / T (Schwerkraft voll)
    const v0 = [(P1[0] - L0[0]) / T1, (P1[1] - L0[1] + 0.5 * g * T1 * T1) / T1, (P1[2] - L0[2]) / T1];
    push(L0, tl, v0, T1, 0.42, 0, 1, KIND.glow, [1.0, 0.85, 0.55]);
    sounds.push({ t: tl, kind: 'launch', p: L0 });
    // Schweif: Funken entlang der Bahn, fallen langsam
    const nT = Math.round(RK.trail * Math.max(0.5, T.k));
    for (let i = 0; i < nT; i++) {
      const s = (i + r()) / nT * T1 * 0.97;
      const pp = [L0[0] + v0[0] * s, L0[1] + v0[1] * s - 0.5 * g * s * s, L0[2] + v0[2] * s];
      push(pp, tl + s, [R(-0.8, 0.8), R(-1.5, 0.3), R(-0.8, 0.8)], R(0.35, 0.65), 0.07, 1.2, 0.6, KIND.spark, [1.0, 0.6, 0.25]);
    }
    // Burst am Scheitel
    const tb = tl + T1, gold = best && (k % 3 !== 2);
    const col = gold ? pick(PAL.gold) : pick(PAL.normal), col2 = gold ? [1.0, 0.9, 0.55] : pick(PAL.normal);
    // Rauchwolke (am Taghimmel sieht man Feuerwerk auch am Qualm), ab Standard
    if (T.k > 0.5) for (let i = 0; i < B.smoke; i++) push([P1[0] + R(-3, 3), P1[1] + R(-2, 3), P1[2] + R(-3, 3)], tb + 0.1 + r() * 0.3, [R(-1, 1), R(-0.4, 0.6), R(-1, 1)], R(2.8, 3.8), R(9, 14), 0.6, -0.02, KIND.smoke, [0.55, 0.55, 0.57]);
    const nB = Math.round(B.n * T.k * mod.burst), ring = k % 4 === 3;
    const vB = R(B.v[0], B.v[1]);
    for (let i = 0; i < nB; i++) {
      // Fibonacci-Kugel (gleichmäßig) mit etwas Zufall; jede vierte Rakete ein Ring (Scheibe schräg im Raum)
      let dx, dy, dz;
      if (ring) { const a = (i + r() * 0.3) / nB * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a) * 0.55 + 0.25; dz = Math.sin(a) * 0.8; }
      else { const yy = 1 - 2 * (i + 0.5) / nB, rr = Math.sqrt(Math.max(0, 1 - yy * yy)), a = i * 2.39996 + r() * 0.3; dx = Math.cos(a) * rr; dy = yy; dz = Math.sin(a) * rr; }
      const l = Math.hypot(dx, dy, dz) || 1, v = vB * (0.85 + 0.25 * r());
      push(P1, tb, [dx / l * v, dy / l * v, dz / l * v], R(B.life[0], B.life[1]), R(B.size[0], B.size[1]), B.drag, B.grav, KIND.spark, i % 3 === 0 ? col2 : col);
    }
    // Glitzer (Bestzeit/Gold, ab Standard): kleinere, langsamere Funken, die nachglühend funkeln
    if (gold && T.k > 0.5) {
      const nG = Math.round(B.glitter * T.k);
      for (let i = 0; i < nG; i++) {
        const a = r() * Math.PI * 2, c = Math.acos(2 * r() - 1), v = vB * R(0.35, 0.7);
        push(P1, tb + R(0.15, 0.4), [Math.cos(a) * Math.sin(c) * v, Math.cos(c) * v, Math.sin(a) * Math.sin(c) * v], R(1.8, 2.6), 0.18, 1.1, 0.35, KIND.glitter, [1.0, 0.9, 0.6]);
      }
    }
    // Lichtblitz (Glut-Ball am Burst) + Bloom-Verstärkung
    push(P1, tb, [0, 0, 0], 0.32, gold ? 9 : 7, 1, 0, KIND.glow, gold ? [1.0, 0.85, 0.5] : [col[0] * 0.7 + 0.3, col[1] * 0.7 + 0.3, col[2] * 0.7 + 0.3]);
    flashes.push({ t: tb, amp: best ? Z.flash.ampBest : Z.flash.amp, col: gold ? [1.0, 0.85, 0.55] : col, p: P1 });
    sounds.push({ t: tb, kind: 'bang', p: P1, big: gold });
    if (T.k > 0.5) sounds.push({ t: tb + 0.35, kind: 'crackle', p: P1 });
  }
  // Bodenschein unter dem Bogen (folgt den Blitzen)
  glows.push({ p: at(1, 0, 0, 0.05), r: Math.max(10, hw + 3), t0: 0, t1: 0, k: 0, flash: true });
  // ---- Konfetti (zwei Kanonen an den Fontänen, schießen schräg über die Fahrbahn) ----
  if (T.confetti) {
    const C = Z.confetti, n = Math.round(C.n * T.k), pal = best ? PAL.confettiBest : PAL.confetti;
    for (const side of [-1, 1]) {
      const base = at(side, fOff + 0.5, 1.5, 0.6);
      for (let i = 0; i < n; i++) {
        const inward = R(0.25, 0.55), a = R(-0.5, 0.5);
        const d = [-bx * side * inward + tx * a * 0.4, 1, -bz * side * inward + tz * a * 0.4], l = Math.hypot(d[0], d[1], d[2]), v = R(C.v[0], C.v[1]);
        push(base, C.t0 + r() * 0.35, [d[0] / l * v, d[1] / l * v, d[2] / l * v], R(C.life[0], C.life[1]), R(C.size[0], C.size[1]), C.drag, C.grav, KIND.confetti, pick(pal));
      }
    }
    sounds.push({ t: Z.confetti.t0, kind: 'pop' });
  }
  // Bodenschein-Partikel (flach), Stärke im Shader aus Hülle (Fontäne) bzw. Blitz
  for (const G of glows) push(G.p, G.t0, [0, 0, 0], G.flash ? 99 : G.t1 - G.t0, G.r, G.flash ? 1 : 0, 0, KIND.ground, G.flash ? [1.0, 0.75, 0.45] : [1.0, 0.6, 0.25]);
  let n = out.length / 16;
  // Budget: notfalls hinten kürzen (sollte nie greifen – der Test prüft die Zahlen je Stufe)
  if (n > T.max) { out.length = T.max * 16; n = T.max; }
  let end = 0;
  for (let i = 0; i < n; i++) { const o = i * 16; if (out[o + 11] !== KIND.ground || out[o + 7] < 50) end = Math.max(end, out[o + 3] + out[o + 7]); }
  sounds.sort((a, b) => a.t - b.t);
  return { n, data: Float32Array.from(out), end, flashes, sounds, best, tier: opt.tier ?? 2 };
}

// Lichtblitz-Stärke zur Zeit tau (Summe der abklingenden Blitze), dazu die Farbe des stärksten
export function flashAt(plan, tau, out = { k: 0, col: [1, 1, 1] }) {
  out.k = 0;
  let mx = 0;
  if (!plan) return out;
  const tc = ZIEL.flash.tau;
  for (const f of plan.flashes) {
    const a = tau - f.t;
    if (a < -0.02 || a > tc * 6) continue;
    const k = f.amp * (a < 0 ? (a + 0.02) / 0.02 : Math.exp(-a / tc));
    out.k += k;
    if (k > mx) { mx = k; out.col = f.col; }
  }
  out.k = Math.min(0.6, out.k);
  return out;
}

// Bahn einer Partikel zur Zeit tau (wie der Shader; für Tests/Kamera): null, solange sie nicht lebt
export function particleAt(plan, i, tau, out = [0, 0, 0]) {
  const d = plan.data, o = i * 16, age = tau - d[o + 3];
  if (age < 0 || age > d[o + 7]) return null;
  const { f1, h2 } = dragTerms(d[o + 9], age), gy = -9.81 * d[o + 10];
  out[0] = d[o] + d[o + 4] * f1;
  out[1] = d[o + 1] + d[o + 5] * f1 + gy * h2;
  out[2] = d[o + 2] + d[o + 6] * f1;
  return out;
}
// Bahn mit linearem Luftwiderstand k: p = p0 + v0·f1 + g·h2 mit f1 = (1 − e^−ka)/k, h2 = (a − f1)/k; für kleine k·a als
// Reihe (sonst Auslöschung in 32 bit – der Shader rechnet genauso)
export function dragTerms(k, a) {
  const ka = k * a;
  if (ka < 0.01) return { f1: a * (1 - ka / 2 + ka * ka / 6), h2: a * a * (0.5 - ka / 6) };
  const f1 = (1 - Math.exp(-ka)) / k;
  return { f1, h2: (a - f1) / k };
}
