// Auto-Auto-Kollision (n34): Karosserie als Quader (OBB) gegen Quader, Trennachsen-Test (15 Achsen), Impuls + Drehmoment
// über die Starrkörper-Helfer von car.js (_kEff, _impulse), Reibung, Lagekorrektur. Gegen Durchrutschen bei hohem Tempo:
// liegen die Autos am Ende des Schritts weit auseinander bewegt, wird der Weg seit dem letzten Schritt in Teilstücken
// abgetastet (Swept-Test) und am ersten Überlapp aufgelöst. Deterministisch, ohne Abhängigkeiten (Node + Browser).
// Gilt für Spieler ↔ Gegner und Gegner ↔ Gegner (ai/gegner.js), später für Online-Mitspieler (n35).
// Node-Test: tests/node/test_autoauto.mjs (Auffahren, Seitenkontakt, Gegenverkehr, sehr schnell, kein NaN).

// Karosserie-Quader in Körperachsen (x rechts, y oben, z hinten): Mitte über dem Schwerpunkt, halbe Kantenlängen.
// Aus den Karosserie-Sonden in car.js (Seite ±0,98, Front/Heck ±2,35, Boden −0,26, Dach 0,78), etwas schmaler und
// kürzer, damit sich Spiegel/Stoßstange nur berühren, wenn die Sonden der Welt es auch täten.
export const BOX = { cy: 0.26, h: [0.95, 0.52, 2.28] };
// Härte je Fahrhilfe-Stufe: rest = Stoßzahl, fric = Reibung, dreh = Hebel-Anteil fürs Drehmoment (0 = nur schieben,
// 1 = voller Starrkörper), korr = Anteil der Lagekorrektur je Schritt, dvMax = größte Tempo-Änderung je Stoß (m/s,
// „anstupsen“), crash = Stoß-Tempo (m/s senkrecht), ab dem beide Autos crashen (Infinity = nie).
// Leicht weich (anstupsen), Original hart (Brief Peter 08.10.: „Auf Leicht weich, auf Original hart“).
export const HAERTE = {
  weich: { rest: 0.05, fric: 0.08, dreh: 0.25, korr: 0.5, dvMax: 6, crash: Infinity },
  mittel: { rest: 0.15, fric: 0.18, dreh: 0.6, korr: 0.6, dvMax: 14, crash: 16 },
  hart: { rest: 0.3, fric: 0.3, dreh: 1, korr: 0.7, dvMax: Infinity, crash: 9.5 },
};
export const HAERTE_JE_STUFE = { easy: 'weich', medium: 'mittel', original: 'hart' };
// Swept-Test ab so viel relativer Bewegung je Schritt (m), Teilstücke höchstens so lang
export const SWEPT = { ab: 0.5, stueck: 0.35 };

// Quader eines Autos in Weltkoordinaten: Mitte c, Achsen a[0..2] (rechts, oben, hinten), halbe Kanten h
export function quader(car, out = { c: [0, 0, 0], a: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], h: BOX.h }) {
  const F = car.frame;
  out.a[0][0] = F.r.x; out.a[0][1] = F.r.y; out.a[0][2] = F.r.z;
  out.a[1][0] = F.u.x; out.a[1][1] = F.u.y; out.a[1][2] = F.u.z;
  out.a[2][0] = -F.f.x; out.a[2][1] = -F.f.y; out.a[2][2] = -F.f.z;
  out.c[0] = car.pos.x + F.u.x * BOX.cy; out.c[1] = car.pos.y + F.u.y * BOX.cy; out.c[2] = car.pos.z + F.u.z * BOX.cy;
  return out;
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// Projektionsradius eines Quaders auf Achse n
function radius(Q, n) { return Q.h[0] * Math.abs(dot(Q.a[0], n)) + Q.h[1] * Math.abs(dot(Q.a[1], n)) + Q.h[2] * Math.abs(dot(Q.a[2], n)); }

// Trennachsen-Test. Liefert null (getrennt) oder { n (Normale von A nach B), pen (Eindringtiefe), p (Kontaktpunkt) }.
// Kantenachsen nur, wenn sie deutlich weniger Tiefe ergeben als die beste Flächenachse (sonst zittert die Normale
// zwischen fast parallelen Kanten).
export function ueberlapp(A, B) {
  const T = [B.c[0] - A.c[0], B.c[1] - A.c[1], B.c[2] - A.c[2]];
  let best = Infinity, bn = null, face = true;
  const n = [0, 0, 0];
  const test = (x, y, z, isFace) => {
    const l = Math.hypot(x, y, z);
    if (l < 1e-6) return true;           // fast parallele Kanten: Achse entartet, überspringen
    n[0] = x / l; n[1] = y / l; n[2] = z / l;
    const d = dot(T, n), o = radius(A, n) + radius(B, n) - Math.abs(d);
    if (o < 0) return false;
    const w = isFace ? o : o * 1.05 + 0.01;
    if (w < best) { best = w; bn = d < 0 ? [-n[0], -n[1], -n[2]] : [n[0], n[1], n[2]]; face = isFace; bn.o = o; }
    return true;
  };
  for (let i = 0; i < 3; i++) if (!test(A.a[i][0], A.a[i][1], A.a[i][2], true)) return null;
  for (let i = 0; i < 3; i++) if (!test(B.a[i][0], B.a[i][1], B.a[i][2], true)) return null;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const a = A.a[i], b = B.a[j];
    if (!test(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], false)) return null;
  }
  const pen = bn.o;
  // Kontaktpunkt: Mittel der Ecken von B, die (entlang n) in A stecken, und der Ecken von A, die in B stecken –
  // Flächenkontakt → Mitte der Berührfläche (wenig Drehmoment), Ecke → Ecke
  const p = [0, 0, 0];
  let cnt = 0;
  const rA = radius(A, bn), rB = radius(B, bn);
  const ecken = (Q, sg, cRef, rRef) => {
    for (let k = 0; k < 8; k++) {
      const s0 = k & 1 ? 1 : -1, s1 = k & 2 ? 1 : -1, s2 = k & 4 ? 1 : -1;
      const x = Q.c[0] + Q.a[0][0] * Q.h[0] * s0 + Q.a[1][0] * Q.h[1] * s1 + Q.a[2][0] * Q.h[2] * s2;
      const y = Q.c[1] + Q.a[0][1] * Q.h[0] * s0 + Q.a[1][1] * Q.h[1] * s1 + Q.a[2][1] * Q.h[2] * s2;
      const z = Q.c[2] + Q.a[0][2] * Q.h[0] * s0 + Q.a[1][2] * Q.h[1] * s1 + Q.a[2][2] * Q.h[2] * s2;
      // Abstand entlang sg·n von der Mitte des anderen Quaders – kleiner als dessen Radius: steckt drin (entlang n)
      const d = ((x - cRef[0]) * bn[0] + (y - cRef[1]) * bn[1] + (z - cRef[2]) * bn[2]) * sg;
      if (d < rRef + 1e-4 && d > -rRef - 1e-4) { p[0] += x; p[1] += y; p[2] += z; cnt++; }
    }
  };
  ecken(B, 1, A.c, rA);    // Ecken von B auf der Seite zu A
  ecken(A, -1, B.c, rB);
  if (cnt) { p[0] /= cnt; p[1] /= cnt; p[2] /= cnt; }
  else { p[0] = (A.c[0] + B.c[0]) / 2; p[1] = (A.c[1] + B.c[1]) / 2; p[2] = (A.c[2] + B.c[2]) / 2; }
  return { n: bn, pen, p, face };
}

const _qa = { c: [0, 0, 0], a: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], h: BOX.h };
const _qb = { c: [0, 0, 0], a: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], h: BOX.h };

// Stoß zwischen zwei Autos (Car aus physics/car.js) nach ihrem Physikschritt. prevA/prevB = Lage {x,y,z} nach dem
// vorigen Aufruf (oder null: kein Swept-Test, etwa nach einem Reset). Ändert v/w/pos beider Autos; liefert null oder
// { vn (Stoß-Tempo m/s, > 0), j (Impuls N·s), p (Kontaktpunkt), n, crash (bool), swept (bool) }.
// Ein Auto mit fest = true (z. B. Gegner auf der Schiene, Auto im Countdown) bewegt sich nicht: unendlich schwer.
export function stoss(A, B, haerte = HAERTE.hart, prevA = null, prevB = null, opt = {}) {
  const H = typeof haerte === 'string' ? HAERTE[haerte] : haerte;
  // Grobtest: Mittelpunkte weiter als 2 × halbe Diagonale + Weg dieses Schritts
  const dx = B.pos.x - A.pos.x, dy = B.pos.y - A.pos.y, dz = B.pos.z - A.pos.z;
  const diag = 2 * Math.hypot(BOX.h[0], BOX.h[1], BOX.h[2]);
  let weg = 0, mx = 0, my = 0, mz = 0;
  if (prevA && prevB) {
    mx = (B.pos.x - prevB.x) - (A.pos.x - prevA.x); my = (B.pos.y - prevB.y) - (A.pos.y - prevA.y); mz = (B.pos.z - prevB.z) - (A.pos.z - prevA.z);
    weg = Math.hypot(mx, my, mz);
    if (weg > 25) weg = 0;          // versetzt (Reset/Schiene): kein Swept-Test
  }
  if (Math.hypot(dx, dy, dz) > diag + weg) return null;
  const QA = quader(A, _qa), QB = quader(B, _qb);
  let c = ueberlapp(QA, QB), swept = false;
  // Swept-Test: relativer Weg groß → vom vorigen Stand aus abtasten (Lage der Achsen wie jetzt), erster Überlapp zählt
  if (weg > SWEPT.ab) {
    const k = Math.ceil(weg / SWEPT.stueck);
    const cA = QA.c.slice(), cB = QB.c.slice();
    const vA = [A.pos.x - prevA.x, A.pos.y - prevA.y, A.pos.z - prevA.z], vB = [B.pos.x - prevB.x, B.pos.y - prevB.y, B.pos.z - prevB.z];
    for (let s = 1; s <= k; s++) {
      const u = s / k - 1;   // −1 … 0 (0 = jetzt)
      for (let a = 0; a < 3; a++) { QA.c[a] = cA[a] + vA[a] * u; QB.c[a] = cB[a] + vB[a] * u; }
      const ci = ueberlapp(QA, QB);
      if (ci) {
        if (s < k) {
          // Autos auf den Stand des ersten Überlapps zurücksetzen (Tempo bleibt, der Stoß unten trennt sie)
          A.pos.x += vA[0] * u; A.pos.y += vA[1] * u; A.pos.z += vA[2] * u;
          B.pos.x += vB[0] * u; B.pos.y += vB[1] * u; B.pos.z += vB[2] * u;
          swept = true;
        }
        c = ci; break;
      }
    }
    if (!swept) { for (let a = 0; a < 3; a++) { QA.c[a] = cA[a]; QB.c[a] = cB[a]; } }
  }
  if (!c) return null;
  const n = c.n, p = c.p;
  const festA = !!opt.festA, festB = !!opt.festB;
  // Hebel je Auto auf den Anteil H.dreh verkürzt (weich: mehr schieben als drehen)
  const pA = [A.pos.x + (p[0] - A.pos.x) * H.dreh, A.pos.y + (p[1] - A.pos.y) * H.dreh, A.pos.z + (p[2] - A.pos.z) * H.dreh];
  const pB = [B.pos.x + (p[0] - B.pos.x) * H.dreh, B.pos.y + (p[1] - B.pos.y) * H.dreh, B.pos.z + (p[2] - B.pos.z) * H.dreh];
  const va = A._pointVel(pA[0], pA[1], pA[2], { x: 0, y: 0, z: 0 }), vb = B._pointVel(pB[0], pB[1], pB[2], { x: 0, y: 0, z: 0 });
  const rv = [vb.x - va.x, vb.y - va.y, vb.z - va.z];
  const vn = dot(rv, n);   // < 0: aufeinander zu
  let j = 0, crash = false;
  if (vn < 0) {
    const kA = festA ? 0 : A._kEff(pA[0], pA[1], pA[2], n[0], n[1], n[2]);
    const kB = festB ? 0 : B._kEff(pB[0], pB[1], pB[2], n[0], n[1], n[2]);
    j = -(1 + H.rest) * vn / Math.max(1e-9, kA + kB);
    // „anstupsen“: Tempo-Änderung je Auto höchstens dvMax (Masse × dvMax)
    if (Number.isFinite(H.dvMax)) j = Math.min(j, H.dvMax * Math.min(festA ? Infinity : A.def.mass, festB ? Infinity : B.def.mass));
    if (!festA) A._impulse(pA[0], pA[1], pA[2], -n[0] * j, -n[1] * j, -n[2] * j);
    if (!festB) B._impulse(pB[0], pB[1], pB[2], n[0] * j, n[1] * j, n[2] * j);
    // Reibung quer zur Normale (Karosserie schrammt aneinander)
    const va2 = A._pointVel(pA[0], pA[1], pA[2], { x: 0, y: 0, z: 0 }), vb2 = B._pointVel(pB[0], pB[1], pB[2], { x: 0, y: 0, z: 0 });
    const r2 = [vb2.x - va2.x, vb2.y - va2.y, vb2.z - va2.z], vn2 = dot(r2, n);
    const t = [r2[0] - vn2 * n[0], r2[1] - vn2 * n[1], r2[2] - vn2 * n[2]], vt = Math.hypot(t[0], t[1], t[2]);
    if (vt > 1e-4 && H.fric > 0) {
      t[0] /= vt; t[1] /= vt; t[2] /= vt;
      const ktA = festA ? 0 : A._kEff(pA[0], pA[1], pA[2], t[0], t[1], t[2]), ktB = festB ? 0 : B._kEff(pB[0], pB[1], pB[2], t[0], t[1], t[2]);
      const jt = Math.min(vt / Math.max(1e-9, ktA + ktB), H.fric * j);
      if (!festA) A._impulse(pA[0], pA[1], pA[2], t[0] * jt, t[1] * jt, t[2] * jt);
      if (!festB) B._impulse(pB[0], pB[1], pB[2], -t[0] * jt, -t[1] * jt, -t[2] * jt);
    }
    if (-vn > H.crash) {
      crash = true;
      if (!festA && A.setCrash) A.setCrash('Zusammenstoß', { kind: 5, vn: +vn.toFixed(1) });
      if (!festB && B.setCrash) B.setCrash('Zusammenstoß', { kind: 5, vn: +vn.toFixed(1) });
    }
  }
  // Lagekorrektur: auseinanderschieben (je zur Hälfte; ein festes Auto schiebt das andere ganz), gedeckelt
  const corr = Math.min(c.pen, 0.3) * H.korr;
  if (corr > 1e-4) {
    const wA = festA ? 0 : festB ? 1 : 0.5, wB = festB ? 0 : festA ? 1 : 0.5;
    A.pos.x -= n[0] * corr * wA; A.pos.y -= n[1] * corr * wA; A.pos.z -= n[2] * corr * wA;
    B.pos.x += n[0] * corr * wB; B.pos.y += n[1] * corr * wB; B.pos.z += n[2] * corr * wB;
  }
  // Ort/Stärke für Funken und Crash-Ton (wie car.scrapeP / lastImpact)
  const imp = Math.max(0, -vn);
  if (!festA) A.lastImpact = Math.max(A.lastImpact || 0, imp);
  if (!festB) B.lastImpact = Math.max(B.lastImpact || 0, imp);
  return { vn: imp, j, p: p.slice(), n: n.slice(), pen: c.pen, crash, swept };
}
