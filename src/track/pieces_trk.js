// Bausteine für importierte .TRK-Strecken (Präfix tr_). Gleiche Konventionen wie pieces.js:
// lokale Koordinaten f = vorwärts ab Einfahrtskante, r = rechts, y = hoch relativ zur Einfahrtshöhe.
// Optionen aus dem Layout-Stück (pb.pc): surf (Belag), lvl/h1 (Ebenen an Ein-/Ausfahrt), sup (Unterbau:
// pillars/solid/span/truss), deco (tunnel/slalom), kick/land (Sprungschanze/Landung an offener Rampe),
// side/b0/b1 (Überhöhung), into (Röhre/Autobahn hinein/hinaus), sub (abgesenkte Deko-Spur), start, cp.
import { TILE, ROAD_HW, MAT } from './defs.js';
import { PIECES, LOOP } from './pieces.js';

const T = TILE, PI = Math.PI, HW = ROAD_HW;
const lin = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const cs = (t) => 0.5 - 0.5 * Math.cos(PI * clamp01(t));      // Kosinus-Übergang (= Hang-Profil)
export const BANK = 28 * PI / 180;                                  // Überhöhung Steilstraße/-kurve
export const KICK_DEG = 18;                                         // Abwurfwinkel offener Rampen

// Aufsteigende Schanze der Höhe H auf Länge L: flach → Kreisbogen → Gerade mit KICK_DEG an der Lippe
export function kickY(x, L, H) {
  const th = KICK_DEG * PI / 180, t1 = Math.tan(th), t2 = Math.tan(th / 2);
  const a = (L * t1 - H) / (t1 - t2);
  if (a <= 0.5 || a >= L) return H * cs(x / L);
  const R = a / Math.sin(th);
  if (x <= a) return R - Math.sqrt(Math.max(0, R * R - x * x));
  return R * (1 - Math.cos(th)) + (x - a) * t1;
}
// Höhe (m, relativ zur Einfahrt) an Stelle f eines Stücks der Länge L
function heightAt(pc, LH, f, L) {
  const dy = ((pc.h1 ?? pc.lvl ?? 0) - (pc.lvl || 0)) * LH;
  if (Math.abs(dy) < 1e-6) return 0;
  if (pc.kick && dy > 0) return kickY(f, L, dy);
  if (pc.land && dy < 0) return kickY(L - f, L, -dy) + dy;
  return dy * cs(f / L);
}

// Pfeilerpaar unter einer Fahrbahn bei (f, r) mit Fahrbahnhöhe y (lokal) und Kurswinkel phi
function pillars(pb, f, r, y, phi = 0, w = 2.6) {
  const sn = Math.sin(phi), c = Math.cos(phi), top = y - 1.0;
  let placed = 0;
  for (const s of [-w, w]) {
    const pf = f - sn * s, pr = r + c * s;
    const g = pb.ground(pf, pr) - pb.base - 0.4;
    const h = top - g;
    if (h < 1.3) continue;
    pb.box(pf, (top + g) / 2, pr, 1.1, h, 1.1, MAT.CONCRETE, { collide: true, rotY: phi });
    placed++;
  }
  if (placed) pb.box(f, top - 0.45, r, 1.6, 0.9, 2 * w + 2.4, MAT.CONCRETE, { collide: true, rotY: phi });
}

// Stahlfachwerk seitlich einer (geneigten) Brückenrampe
function truss(pb, S) {
  const off = HW + 0.62, hTop = 2.0;
  for (const sg of [-1, 1]) {
    for (let k = 0; k < S.length - 1; k++) {
      const a = S[k], b = S[k + 1];
      const fm = (a.f + b.f) / 2, ym = (a.y + b.y) / 2 + hTop, L = Math.hypot(b.f - a.f, b.y - a.y);
      pb.box(fm, ym, sg * off, L + 0.08, 0.28, 0.28, MAT.STEEL, { pitch: Math.atan2(b.y - a.y, b.f - a.f) });
      if (k % 2 === 0) {
        pb.box(a.f, a.y + 0.95 + hTop / 2 - 0.05, sg * off, 0.16, hTop - 0.9, 0.16, MAT.STEEL, {});
        const dL = Math.hypot(b.f - a.f, hTop - 0.9);
        pb.box(fm, (a.y + b.y) / 2 + 0.9 + (hTop - 0.9) / 2, sg * off, dL, 0.12, 0.12, MAT.STEEL, { pitch: Math.atan2(hTop - 0.9 + (b.y - a.y), b.f - a.f) });
      }
    }
  }
}

// Tunnelröhre (Kastenprofil) über [f0, f1] mit Portalen
function tunnelShell(pb, f0, f1, portalIn, portalOut) {
  const H = 5.4, w = HW + 0.5, th = 0.6, L = f1 - f0, fm = (f0 + f1) / 2;
  for (const s of [-1, 1]) pb.box(fm, H / 2 - 0.3, s * (w + th / 2), L, H + 0.6, th, MAT.CONCRETE, { collide: true });
  pb.box(fm, H + th / 2, 0, L, th, 2 * w + 2 * th, MAT.CONCRETE, { collide: true });
  const fac = (f, dir) => {
    for (const s of [-1, 1]) pb.box(f + dir * 0.35, (H + 1.4) / 2 - 0.3, s * (w + th + 0.7), 0.7, H + 1.6, 1.6, MAT.WALL, { collide: true });
    pb.box(f + dir * 0.35, H + 0.95, 0, 0.7, 1.3, 2 * (w + th + 1.5), MAT.WALL, {});
  };
  if (portalIn) fac(f0, 1);
  if (portalOut) fac(f1, -1);
}

const kerbs = (pc) => !pc.sub && !pc.noKerb;
// Offenes Ende einer erhöhten Fahrbahn (Sprunglücke, Deko ohne Anschluss): Stirnfläche statt hohlem Profil
const openEnd = (k) => k == null || k === 'gap';
function endCap(pb, f, y, r, prof, rotY = 0) {
  if (prof === 'road') return;
  const g = pb.ground(f, r) - pb.base;
  if (y - g < 0.4) return;
  const w = 2 * (HW + 0.35), d = HW + 0.175;
  // Brüstungen links/rechts entlang der (gedrehten) Querachse
  const parapets = () => { for (const s of [-1, 1]) pb.box(f - s * d * Math.sin(rotY), y + 0.45, r + s * d * Math.cos(rotY), 0.12, 0.9, 0.35, MAT.WALL, { rotY }); };
  if (prof === 'deck') {
    pb.box(f, y - 0.5, r, 0.12, 1.0, w, MAT.CONCRETE, { rotY, collide: true });
    parapets();
  } else {
    pb.box(f, (y + g) / 2, r, 0.12, y - g, w + (prof === 'causeway' ? 1.2 : 0), MAT.CONCRETE, { rotY, collide: true });
    if (prof === 'rampwall') parapets();
  }
}
const profFor = (pc, pb, L) => {
  if (pc.sup === 'solid') return 'rampwall';
  if (pc.sup === 'pillars' || pc.sup === 'truss' || pc.sup === 'span') return 'deck';
  // Straße über Wasser/Senke: Damm statt schwebender Fahrbahn
  for (const f of [0.15 * L, 0.5 * L, 0.85 * L]) if (heightAt(pc, pb.LH, f, L) + pb.base - pb.ground(f, 0) > 1.0) return 'causeway';
  return 'road';
};

// Gerade (1 oder 2 Felder) inkl. Rampen, Hochstraße, Damm, Tunnel, Slalom, Kreuzung, Überführung
function buildStraight(pb, L) {
  const pc = pb.pc;
  const n = Math.round(L / 1.6);
  const prof = profFor(pc, pb, L);
  // Waagrechte Fahrbahn vor einer Sprunglücke: kleine Absprungkante (sonst flacher Abflug, nicht schaffbar)
  const lipH = pc.lipEnd && Math.abs(heightAt(pc, pb.LH, L, L)) < 0.01 ? 0.9 : 0, lipL = 7;
  const lip = (f) => (lipH && f > L - lipL ? lipH * (1 - Math.cos(PI * 0.5 * (f - L + lipL) / lipL)) : 0);
  const S = lin(0, L, n).map((f) => ({ f, y: heightAt(pc, pb.LH, f, L) + lip(f), r: 0 }));
  // Slalom: zwei Betonblöcke auf gegenüberliegenden Spuren (rechts zuerst, links weiter hinten). Wie im
  // Original bleibt in der Mitte genau Platz für ein gerade ausgerichtetes Auto: die Linie fährt mittig durch.
  if (pc.deco === 'slalom') {
    const A = [4, 6.6], B = [L - 6.6, L - 4], gap = 1.3;
    for (const s of S) if (s.f > A[0] - 3 && s.f < B[1] + 3) { s.lo = -0.25; s.hi = 0.25; }
    if (!pc.sub) {
      pb.box((A[0] + A[1]) / 2, 0.65, (gap + HW) / 2, A[1] - A[0], 1.3, HW - gap, MAT.WALL, { collide: true });
      pb.box((B[0] + B[1]) / 2, 0.65, -(gap + HW) / 2, B[1] - B[0], 1.3, HW - gap, MAT.WALL, { collide: true });
    }
  }
  const start = pb.pc.start && pb.pc.type === 'tr_sf';
  const mark = pc.type === 'tr_sf' ? 'start' : pc.cp ? 'cp' : undefined;
  pb.path(S, { profile: prof, mark, markAt: pc.type === 'tr_sf' ? 12 : L / 2 });
  if (start) { pb.startLine(12); pb.gate('start', 12); }
  if (openEnd(pc.pk)) endCap(pb, 0.06, S[0].y, 0, prof);
  if (openEnd(pc.nk)) endCap(pb, L - 0.06, S[S.length - 1].y, 0, prof);
  if (pc.deco === 'tunnel' && !pc.sub) tunnelShell(pb, 0, L, pc.pk !== 'tunnel', pc.nk !== 'tunnel');
  if (pc.sup === 'pillars') for (let f = L / 4; f < L; f += L / 2) pillars(pb, f, 0, heightAt(pc, pb.LH, f, L));
  if (pc.sup === 'truss') {
    truss(pb, S.filter((_, k) => k % 2 === 0 || k === S.length - 1));
    const hi = S[0].y > S[S.length - 1].y ? 0 : S.length - 1;
    pillars(pb, S[hi].f + (hi ? -1.5 : 1.5), 0, S[hi].y, 0, 3.4);
  }
  if (pc.sup === 'span' && !pc.over) {
    // Brückenfeld: Stahlträger unter dem Deck (ohne Pfeiler)
    for (const s of [-2.2, 2.2]) pb.box(L / 2, S[0].y - 1.45, s, L, 0.9, 0.5, MAT.STEEL, {});
  }
  if (pc.over) {
    // Überführung: Widerlager seitlich der unterquerten Straße
    for (const s of [-1, 1]) {
      const g = pb.ground(L / 2, s * 8.2) - pb.base;
      const top = S[0].y - 1.0;
      if (top - g > 1) for (const f of [2.5, L - 2.5]) pb.box(f, (top + g) / 2, s * 8.2, 1.4, top - g, 2.6, MAT.CONCRETE, { collide: true });
    }
  }
}

function buildCorner(pb, radius) {
  const pc = pb.pc, m = pb.m;
  const len = radius * PI / 2, n = Math.max(10, Math.round(len / 1.2));
  const deck = pc.sup === 'pillars';
  const S = lin(0, PI / 2, n).map((th) => ({ f: radius * Math.sin(th), y: 0, r: m * (radius - radius * Math.cos(th)), th }));
  pb.path(S, { profile: deck ? 'deck' : 'road', kerbIn: !deck && kerbs(pc), kerbOut: !deck && kerbs(pc), turn: m });
  if (deck && openEnd(pc.pk)) endCap(pb, 0.06, 0, 0, 'deck');
  if (deck && openEnd(pc.nk)) endCap(pb, radius, 0, m * (radius - 0.06), 'deck', m * PI / 2);
  if (deck) for (const th of [PI / 8, 3 * PI / 8]) pillars(pb, radius * Math.sin(th), m * (radius - radius * Math.cos(th)), 0, m * th);
}

function buildBankCorner(pb) {
  const pc = pb.pc, m = pb.m, radius = 1.5 * T, hw = HW + 0.5;
  const bIn = pc.pk === 'bankR' || pc.pk === 'bankT' || pc.pk === 'bankC';
  const bOut = pc.nk === 'bankR' || pc.nk === 'bankT' || pc.nk === 'bankC';
  const n = Math.round(radius * PI / 2);
  const S = lin(0, PI / 2, n).map((th) => {
    const u = th / (PI / 2);
    const b = BANK * (bIn ? 1 : smooth5(u / 0.3)) * (bOut ? 1 : smooth5((1 - u) / 0.3));
    return { f: radius * Math.sin(th), y: hw * Math.sin(b), r: m * (radius - radius * Math.cos(th)), bank: -m * b, hw };
  });
  pb.path(S, { profile: 'banked', turn: m, hw });
}
const smooth5 = (t) => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };

// Steilstraße (gerade) und Übergang: Überhöhung b0 → b1 (Anteil), hohe Seite side (+1 rechts)
function buildBankStraight(pb) {
  const pc = pb.pc, hw = HW + 0.5, side = pc.side || 1;
  const S = lin(0, T, 14).map((f) => {
    const b = BANK * ((pc.b0 ?? 1) + ((pc.b1 ?? 1) - (pc.b0 ?? 1)) * cs(f / T));
    return { f, y: hw * Math.sin(b), r: 0, bank: side * b, hw };
  });
  pb.path(S, { profile: 'banked', turn: -side, hw });
}

// Schikane: S aus zwei Kreisbögen (R 25 m), Versatz um ein Feld; Asphalt-Vorfeld („schnelles Gras“)
function buildChicane(pb) {
  const pc = pb.pc, m = pb.m, R = 25, th = Math.asin(T / R);
  const S = [];
  for (const a of lin(0, th, 18)) S.push({ f: R * Math.sin(a), y: 0, r: m * R * (1 - Math.cos(a)) });
  for (const a of lin(th, 0, 18).slice(1)) S.push({ f: 2 * T - R * Math.sin(a), y: 0, r: m * (T - R * (1 - Math.cos(a))) });
  pb.path(S, { profile: 'road', kerbIn: kerbs(pc), kerbOut: kerbs(pc) });
  if (!pc.sub) pb.pad(0.5, 2 * T - 0.5, m > 0 ? -T / 2 + 0.5 : -1.5 * T + 0.5, m > 0 ? 1.5 * T - 0.5 : T / 2 - 0.5);
}

// Röhre (1 Feld) mit optionalem Hindernis (Buckel quer im Boden)
function buildPipe(pb) {
  const pc = pb.pc;
  const S = lin(0, T, 10).map((f) => ({ f, y: 0, r: 0, tube: 1, lo: -1.2, hi: 1.2 }));
  if (pc.obst) {
    // Buckel: Linie darüber, Röhre bleibt gerade (Rohrmantel als eigener Lauf ohne Linie)
    const bump = (f) => (f > 4 && f < 16 ? 0.95 * Math.sin(PI * (f - 4) / 12) ** 2 : 0);
    pb.ribbon(lin(0, T, 10).map((f) => ({ f, y: 0, r: 0 })), { profile: 'tube' });
    pb.path(lin(0, T, 30).map((f) => ({ f, y: bump(f) + 0.02, r: 0, tube: 1, lo: -1.2, hi: 1.2, hw: 2.15 })), { profile: 'hump', kind: 'tube' });
  } else pb.path(S, { profile: 'tube', kind: 'tube' });
  const pipeK = (k) => k === 'pipe' || k === 'pobst' || k === 'pipeT';
  if (!pipeK(pc.pk) && !pc.sub) pb.portal(0.2, -1);
  if (!pipeK(pc.nk) && !pc.sub) pb.portal(T - 0.2, 1);
}
// Röhren-Übergang: Straße ↔ Röhre mit Portal
function buildPipeT(pb) {
  const pc = pb.pc, into = !!pc.into, fp = into ? 7 : 13;
  const S = [];
  for (const f of lin(0, T, 20)) {
    const inTube = into ? f > fp : f < fp;
    const d = Math.abs(f - fp);
    const lim = inTube ? 1.2 : Math.min(3.2, 1.2 + d * 0.35);
    S.push({ f, y: 0, r: 0, tube: inTube ? 1 : 0, lo: -lim, hi: lim, prof: inTube ? 'tube' : 'road' });
  }
  pb.path(S, { profile: 'road', kind: 'tube' });
  if (!pc.sub) pb.portal(fp, into ? -1 : 1);
}

// Autobahn: zwei Richtungsfahrbahnen + Mittelleitwand; Linie auf der rechten Fahrbahn
const HWY_W = 9.6, HWY_R = 4.9;
function buildHighway(pb) {
  const pc = pb.pc;
  pb.ribbon(lin(0, T, 8).map((f) => ({ f, y: 0, r: 0, hw: HWY_W })), { profile: 'road' });
  pb.path(lin(0, T, 10).map((f) => ({ f, y: 0, r: HWY_R, lo: -3.2, hi: 3.2, prof: 'none' })), { profile: 'none' });
  if (!pc.sub) pb.box(T / 2, 0.4, 0, T, 0.8, 0.6, MAT.WALL, { collide: true });
}
function buildHighwayT(pb) {
  const pc = pb.pc, into = !!pc.into;
  const k = (f) => (into ? cs(f / T) : 1 - cs(f / T));
  pb.ribbon(lin(0, T, 10).map((f) => ({ f, y: 0, r: 0, hw: HW + (HWY_W - HW) * k(f) })), { profile: 'road' });
  pb.path(lin(0, T, 12).map((f) => ({ f, y: 0, r: HWY_R * k(f), lo: -3.2, hi: 3.2, prof: 'none' })), { profile: 'none' });
  if (!pc.sub) {
    const [a, b] = into ? [11, T] : [0, T - 11];
    pb.box((a + b) / 2, 0.4, 0, b - a, 0.8, 0.6, MAT.WALL, { collide: true });
  }
}

// Korkenzieher (Rolle): 360° um die Fahrtrichtung, rechts hinauf, oben kopfüber über der Mittelwand,
// links wieder herunter (Einfahrt rechte Spur, Ausfahrt linke Spur)
export const CORK = { R: 3.6, hw: 2.3, f0: 7, f1: 33, a0: 2.2 };
function buildCorkLR(pb) {
  const { R, hw, f0, f1, a0 } = CORK, L = 2 * T, M = 1.3;
  const s = [];
  const road = (f, r) => ({ f, y: 0, r, hw: HW, prof: 'none', lo: -HW + M - r, hi: HW - M - r });
  for (const f of lin(0, f0, 6)) s.push(road(f, a0 * smooth5(f / f0)));
  const N = 140;
  for (let k = 1; k <= N; k++) {
    const u = k / N, ph = 2 * PI * u;
    const a = a0 - 2 * a0 * smooth5((u - 0.15) / 0.7);
    s.push({ f: f0 + (f1 - f0) * u, y: R * (1 - Math.cos(ph)), r: a + R * Math.sin(ph), up: [0, Math.cos(ph), -Math.sin(ph)], hw, loop: 1, prof: 'loopLane' });
  }
  for (const f of lin(f1, L, 6).slice(1)) s.push(road(f, -a0 * (1 - smooth5((f - f1) / (L - f1)))));
  pb.path(s, { profile: 'loop', kind: 'loop' });
  pb.ribbon(lin(0, f0 + 1, 4).map((f) => ({ f, y: 0, r: 0 })), { profile: 'road' });
  pb.ribbon(lin(f1 - 1, L, 4).map((f) => ({ f, y: 0, r: 0 })), { profile: 'road' });
  pb.pad(f0, f1, -HW - 1.2, HW + 1.2);
  // diagonale Mittelwand unter der Rolle (von links vorn nach rechts hinten)
  const wa = [f0 + 2, -HW + 0.4], wb = [f1 - 2, HW - 0.4];
  const wl = Math.hypot(wb[0] - wa[0], wb[1] - wa[1]);
  pb.box((wa[0] + wb[0]) / 2, 0.6, (wa[1] + wb[1]) / 2, wl, 1.2, 0.4, MAT.WALL, { collide: true, rotY: Math.atan2(wb[1] - wa[1], wb[0] - wa[0]) });
  // Stahlbügel um die Rolle (nicht unter Sprüngen – dort fliegt man darüber)
  const fc = (f0 + f1) / 2, top = 2 * R + 0.8;
  if (!pb.pc.underJump) for (const fq of [fc - 9, fc + 9]) {
    for (const sg of [-1, 1]) pb.box(fq, top / 2, sg * 8.4, 0.5, top, 0.5, MAT.STEEL, { collide: true });
    pb.box(fq, top, 0, 0.5, 0.5, 17.3, MAT.STEEL, {});
  }
}

// Korkenzieher auf/ab (Wendel): Gerade → voller Kreis (Radius ½ Feld) mit Anstieg um eine Ebene → Gerade
function buildCorkUD(pb) {
  const pc = pb.pc, m = pb.m, Rc = T / 2;
  const up = (pc.h1 ?? pc.lvl) > pc.lvl;           // hinauf oder hinunter
  const H = ((pc.h1 ?? pc.lvl) - pc.lvl) * pb.LH;
  const s = [];
  // Hinauf: unten Gerade, Kreis steigt, oben Gerade. Hinunter: oben Gerade, Kreis fällt, unten Gerade.
  for (const f of lin(0, T, 10)) s.push({ f, y: 0, r: 0 });
  const N = 64;
  for (let k = 1; k <= N; k++) {
    const psi = 2 * PI * k / N;
    s.push({ f: T + Rc * Math.sin(psi), y: H * cs(k / N), r: m * (Rc - Rc * Math.cos(psi)), hw: HW - 0.6 });
  }
  for (const f of lin(T, 2 * T, 10).slice(1)) s.push({ f, y: H, r: 0 });
  pb.path(s, { profile: 'deck', hw: HW - 0.6 });
  // Pfeiler: oberes Geradenstück + Kreis (wo hoch genug)
  const yTop = Math.max(0, H);
  if (up) pillars(pb, 1.5 * T, 0, H);
  else pillars(pb, 0.5 * T, 0, 0);
  for (const psi of [PI / 2, PI, 1.5 * PI]) {
    const y = H * cs(psi / (2 * PI));
    pillars(pb, T + Rc * Math.sin(psi), m * (Rc - Rc * Math.cos(psi)), y, m * psi, 2.2);
  }
  void yTop;
}

// Sprung über freie Felder: nur Fahrlinie (Flugbahn-Schätzung für Kamera/Anzeige)
function buildGap(pb) {
  const pc = pb.pc, k = PIECES[pc.type].gap, Lg = k * T;
  const last = pb.lastLine();
  const th = last ? Math.atan2(last.T[1], Math.hypot(last.T[0], last.T[2])) : 0;
  const s0 = Math.tan(Math.max(-0.4, Math.min(0.6, th)));
  const y1 = ((pc.h1 ?? pc.lvl) - pc.lvl) * pb.LH;
  const y0 = last ? last.p[1] - pb.base : 0;          // Flugkurve beginnt exakt an der Lippe
  const a = (y1 - y0 - s0 * Lg) / (Lg * Lg);
  const S = lin(0, Lg, Math.max(6, k * 8)).map((f) => ({ f, y: y0 + s0 * f + a * f * f, r: 0, surf: 0, air: 1, lo: 0, hi: 0 }));
  pb.path(S, { profile: 'none', kind: 'jump' });
  pb.jumpInfo({ gen: 1, lipF: 0, landF: Lg });
}

const B = {
  tr_sf: (pb) => buildStraight(pb, T),
  tr_road: (pb) => buildStraight(pb, T),
  tr_road2: (pb) => buildStraight(pb, 2 * T),
  tr_sharp: (pb) => buildCorner(pb, T / 2),
  tr_large: (pb) => buildCorner(pb, 1.5 * T),
  tr_bankC: buildBankCorner,
  tr_bank: buildBankStraight,
  tr_chicane: buildChicane,
  tr_pipe: buildPipe,
  tr_pipeT: buildPipeT,
  tr_hwy: buildHighway,
  tr_hwyT: buildHighwayT,
  tr_loop: (pb) => PIECES.loop.build(pb),
  tr_corklr: buildCorkLR,
  tr_corkud: buildCorkUD,
};

const C1 = [[0, 0]], C2 = [[0, 0], [1, 0]], C4 = [[0, 0], [1, 0], [0, 1], [1, 1]];
export const TR_PIECES = {
  tr_sf: { name: 'Start/Ziel', cells: C1, next: [1, 0], turn: 0 },
  tr_road: { name: 'Straße', cells: C1, next: [1, 0], turn: 0 },
  tr_road2: { name: 'Straße (2 Felder)', cells: C2, next: [2, 0], turn: 0 },
  tr_pipe: { name: 'Röhre', cells: C1, next: [1, 0], turn: 0, stunt: 1 },
  tr_pipeT: { name: 'Röhren-Einfahrt', cells: C1, next: [1, 0], turn: 0, stunt: 1 },
  tr_hwy: { name: 'Autobahn', cells: C1, next: [1, 0], turn: 0 },
  tr_hwyT: { name: 'Autobahn-Anfang', cells: C1, next: [1, 0], turn: 0 },
  tr_bank: { name: 'Steilstraße', cells: C1, next: [1, 0], turn: 0 },
  tr_sharp: { name: 'Kurve eng', cells: C1, next: [0, 1], turn: 1 },
  tr_large: { name: 'Kurve weit', cells: C4, next: [1, 2], turn: 1 },
  tr_bankC: { name: 'Steilkurve', cells: C4, next: [1, 2], turn: 1, stunt: 1 },
  tr_chicane: { name: 'Schikane', cells: C4, next: [2, 1], turn: 0 },
  tr_loop: { name: 'Looping', cells: C2, next: [2, 0], turn: 0, stunt: 1 },
  tr_corklr: { name: 'Korkenzieher', cells: C2, next: [2, 0], turn: 0, stunt: 1 },
  tr_corkud: { name: 'Wendel', cells: C4, next: [2, 0], turn: 0, stunt: 1 },
};
// Lücken (Sprung über freie Felder): Linie ohne Fahrbahn über k Felder
for (let k = 1; k <= 6; k++) TR_PIECES['tr_gap' + k] = { name: 'Sprung', cells: [], next: [k, 0], turn: 0, stunt: 1, gap: k };

for (const [k, v] of Object.entries(TR_PIECES)) {
  v.build = B[k] || (k.startsWith('tr_gap') ? buildGap : () => {});
  PIECES[k] = v;
}
export { LOOP };
