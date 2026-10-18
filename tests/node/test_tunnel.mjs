// n33 Tunnel-Einfahrt (Nachtrag Peter 09.10.2026: „Tunneleinfahrt sieht aus wie eine Wand“) – nur Optik (track/tunnel.js)
//   A  Tunnel-Läufe der Gelände-Strecken: gerade, Portalwand genau dort, wo die Kollision der alten Portalwand liegt
//   B  Gelände am Portal (feines Netz): kein Dreieck in der Öffnung (vor der Wand unter der Fahrbahn, dahinter über dem
//      Gewölbe), Rand des Netzes = Höhe der Nachbarzellen (keine Risse), vorher lag Gelände quer in der Öffnung
//   C  Maske der Strecken-Batches: innen 1, vor dem Portal 0, weicher Verlauf; Fahrbahn, Wände, Decke erfasst
//   D  Portal-Front: Vorderfläche vor der alten Wand, deckt sie ganz ab, Warnstreifen gelb/schwarz
//   E  .TRK-Kastentunnel (Sammlung): Läufe gefunden, Maske innen; Bau unverändert (nur Optik, Schalter STUNT_TUNNELALT)
//   F  Röhre mit Mittelwand (n33 Etappe 3): Lauf mit Röhrenachse, Lichtringe (Attribut w = 5), Maske in der Rolle, Kamera
//      wird auf den Röhrenkreis begrenzt (Rr − 1,3 m)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
const { generate } = await import('../../src/track/generator.js');
const { buildTrack } = await import('../../src/track/build.js');
const { MAT, ROAD_HW } = await import('../../src/track/defs.js');
const { triLerp } = await import('../../src/track/terrgrid.js');
const { TUNNEL_LOOK, tunnelLaeufe, tunnelAttr, portalGelaende, portalFront, portale, lageIm, hoeheAuf, maskeAm, PORTAL_FARBE, roehreKamera } = await import('../../src/track/tunnel.js');
const { parseTrk, TRK_BYTES } = await import('../../src/track/trk.js');
const { trkToLayout } = await import('../../src/track/trkimport.js');
const { tracksOf } = await import('../../src/game/sammlung.js');

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const f2 = (x) => x.toFixed(2).replace('.', ',');

check(TUNNEL_LOOK.an, 'Standard: neuer Tunnel-Look an (STUNT_TUNNELALT=1 / ?tunnelalt=1 = alt)');

// Gelände-Strecken mit Tunnel sammeln
const strecken = [];
for (let seed = 1000; seed < 1600 && strecken.length < 10; seed += 7) {
  for (const d of [2, 3]) {
    const t = buildTrack(generate(seed, d, { gel: true }), { treeCount: 0 });
    if (t.gel && t.gel.plan.pieces.some((p) => p && p.tunnel)) { strecken.push({ seed, d, t }); break; }
  }
}
check(strecken.length >= 4, `${strecken.length} Gelände-Strecken mit Tunnel gefunden`);

console.log('--- A: Läufe und Portale ---');
let nLauf = 0, nPortal = 0, faceOk = 0, faceN = 0;
for (const { t } of strecken) {
  const tl = tunnelLaeufe(t);
  nLauf += tl.length;
  const ps = portale(tl);
  nPortal += ps.length;
  // alte Portalwand: senkrechte Beton-Kollisionsflächen mit Normale nach außen in der Ebene der Portalwand
  const P = t.col.pos, N = t.col.nrm, M = t.col.mat;
  for (const p of ps) {
    faceN++;
    let hit = 0;
    for (let k = 0; k < M.length; k++) {
      if (M[k] !== MAT.CONCRETE) continue;
      const o = k * 9, dn = N[o] * p.ox + N[o + 2] * p.oz;
      if (dn < 0.95) continue;
      const cx = (P[o] + P[o + 3] + P[o + 6]) / 3, cz = (P[o + 2] + P[o + 5] + P[o + 8]) / 3;
      const oo = (cx - p.x) * p.ox + (cz - p.z) * p.oz, rr = (cx - p.x) * p.R.B[0] + (cz - p.z) * p.R.B[1];
      if (Math.abs(oo) < 0.05 && Math.abs(rr) < p.Wx + 0.5) hit++;
    }
    if (hit >= 20) faceOk++;
  }
}
check(nLauf >= strecken.length && nPortal === 2 * nLauf, `${nLauf} Tunnel-Läufe, ${nPortal} Portale (je Lauf Ein- und Ausfahrt)`);
check(faceOk === faceN, `Portalwand liegt auf der Kollisionsfläche der alten Wand (${faceOk}/${faceN}, ±5 cm)`);

console.log('--- B: Gelände am Portal ---');
let vorher = 0, inOeffnung = 0, rasterImRohr = 0, nTri = 0, rand = 0, randMax = 0, zuuntief = 0, ueberStrasse = 0;
for (const { t } of strecken) {
  const T = t.terrain, HH = T.Hr || T.Hv || T.H, tl = tunnelLaeufe(t);
  const nat = (x, z) => { const fx = (x + T.ext) / T.step, fz = (z + T.ext) / T.step, i = Math.min(T.nx - 2, Math.floor(fx)), j = Math.min(T.nx - 2, Math.floor(fz)), k = j * T.nx + i; return triLerp(HH[k], HH[k + 1], HH[k + T.nx], HH[k + T.nx + 1], fx - i, fz - j); };
  // vorher: Gelände im Querschnitt der Öffnung 0,5 … 3 m hinter der Portalwand
  for (const p of portale(tl)) {
    for (let o = -3; o <= -0.5; o += 0.5) for (let r = -p.R.tw + 1; r <= p.R.tw - 1; r += 1) {
      const x = p.x + p.ox * o + p.R.B[0] * r, z = p.z + p.oz * o + p.R.B[1] * r, h = nat(x, z) - hoeheAuf(p.R, p.t + o * p.s);
      if (h > 0.3 && h < p.R.H - 0.3) { vorher++; break; }
    }
  }
  const pg = portalGelaende(T, tl, HH);
  check(pg.portale.length === portale(tl).length && pg.n > 0, `Strecke ${t.layout.seed}: ${pg.portale.length} Portale mit feinem Netz (${pg.n} Punkte, ${pg.skip.size} Rasterzellen ersetzt)`);
  const Pp = pg.pos;
  // jedes Dreieck: an 7 Punkten (Ecken, Kantenmitten, Mitte) prüfen, ob es im Öffnungs-Quader liegt
  for (let q = 0; q < pg.idx.length; q += 3) {
    nTri++;
    const v = [0, 1, 2].map((k) => [Pp[pg.idx[q + k] * 3], Pp[pg.idx[q + k] * 3 + 1], Pp[pg.idx[q + k] * 3 + 2]]);
    const pts = [...v, ...[[0, 1], [1, 2], [2, 0]].map(([a, b]) => v[a].map((c, k) => (c + v[b][k]) / 2)), v[0].map((c, k) => (c + v[1][k] + v[2][k]) / 3)];
    let bad = false;
    for (const R of tl) for (const [x, y, z] of pts) {
      const [tt, r, h] = lageIm(R, x, y, z);
      // in der Röhre (zwischen den Portalwänden) und davor bis 4 m über der Fahrbahn
      if (tt > R.faceIn - 4 && tt < R.faceOut + 4 && Math.abs(r) < R.tw - 0.05 && h > 0.05 && h < R.H - 0.05) bad = true;
    }
    if (bad) inOeffnung++;
  }
  // übriges Raster-Gelände (nicht ersetzte Zellen) im ganzen Rohr: nirgends zwischen Fahrbahn und Gewölbe
  for (const R of tl) for (let tt = R.faceIn; tt <= R.faceOut; tt += 1) for (let r = -R.tw + 0.5; r <= R.tw - 0.5; r += 1) {
    const x = R.A[0] + R.D[0] * tt + R.B[0] * r, z = R.A[2] + R.D[1] * tt + R.B[1] * r;
    const i = Math.floor((x + T.ext) / T.step), j = Math.floor((z + T.ext) / T.step);
    if (pg.skip.has(j * T.nx + i)) continue;
    const h = nat(x, z) - hoeheAuf(R, tt);
    if (h > 0.05 && h < R.H - 0.05) rasterImRohr++;
  }
  // Randpunkte des feinen Netzes = natürliche Höhe (gleiche Dreiecksteilung wie die Nachbarzellen)
  const ex = T.ext, st = T.step;
  for (let k = 0; k < pg.n; k++) {
    const x = Pp[k * 3], y = Pp[k * 3 + 1], z = Pp[k * 3 + 2];
    const i = Math.round((x + ex) / st), j = Math.round((z + ex) / st), onX = Math.abs((x + ex) / st - i) < 1e-4, onZ = Math.abs((z + ex) / st - j) < 1e-4;
    if (!onX && !onZ) continue;
    // Kante einer ersetzten Zelle, deren Nachbar nicht ersetzt ist?
    const ci = Math.floor((x + ex) / st + 1e-6), cj = Math.floor((z + ex) / st + 1e-6);
    const nb = onX ? [[ci - 1, cj], [ci, cj]] : [[ci, cj - 1], [ci, cj]];
    const inn = nb.map(([a, b]) => pg.skip.has(b * T.nx + a));
    if (inn[0] && inn[1]) continue;
    rand++;
    randMax = Math.max(randMax, Math.abs(y - nat(x, z)));
  }
  // Zufahrt: Gelände über der Fahrbahn vor dem Portal (vorher: Hang ragte über die Straße) / nicht tiefer als nötig abgesenkt
  for (const p of portale(tl)) for (let o = 0.5; o <= 4; o += 0.5) for (const r of [-ROAD_HW + 0.5, 0, ROAD_HW - 0.5]) {
    const x = p.x + p.ox * o + p.R.B[0] * r, z = p.z + p.oz * o + p.R.B[1] * r;
    let best = null;
    for (let q = 0; q < pg.idx.length && best == null; q += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => pg.idx[q + k] * 3);
      const det = (Pp[b + 2] - Pp[c + 2]) * (Pp[a] - Pp[c]) + (Pp[c] - Pp[b]) * (Pp[a + 2] - Pp[c + 2]);
      if (Math.abs(det) < 1e-9) continue;
      const l1 = ((Pp[b + 2] - Pp[c + 2]) * (x - Pp[c]) + (Pp[c] - Pp[b]) * (z - Pp[c + 2])) / det, l2 = ((Pp[c + 2] - Pp[a + 2]) * (x - Pp[c]) + (Pp[a] - Pp[c]) * (z - Pp[c + 2])) / det;
      if (l1 >= -1e-6 && l2 >= -1e-6 && 1 - l1 - l2 >= -1e-6) best = Pp[a + 1] * l1 + Pp[b + 1] * l2 + Pp[c + 1] * (1 - l1 - l2);
    }
    if (best == null) continue;
    const yR = hoeheAuf(p.R, p.t + o * p.s);
    if (best > yR + 0.05) ueberStrasse++;
    if (best < Math.min(nat(x, z), yR - 0.3) - 0.15) zuuntief++;   // abgesenkt nur bis knapp unter die Fahrbahn
  }
}
check(vorher > 0, `vorher (Höhenfeld): Gelände quer in der Öffnung an ${vorher} Portalen`);
check(inOeffnung === 0, `nachher: kein Gelände-Dreieck in der Öffnung oder bis 4 m davor über der Fahrbahn (${nTri} Dreiecke geprüft)`);
check(rasterImRohr === 0, `übriges Raster-Gelände nirgends im Tunnelrohr (${rasterImRohr} Treffer)`);
check(ueberStrasse === 0 && zuuntief === 0, `Zufahrt: Gelände 0,5 … 4 m vor dem Portal nicht über der Fahrbahn (${ueberStrasse}) und höchstens bis 0,3 m darunter abgesenkt (${zuuntief})`);
check(rand > 100 && randMax < 1e-3, `Rand des feinen Netzes = Nachbarzellen: ${rand} Randpunkte, größte Abweichung ${randMax.toExponential(1)} m (keine Risse)`);

console.log('--- C: Maske der Strecken-Batches ---');
{
  let innen = 0, innen1 = 0, davor = 0, davor0 = 0, wand = 0, decke = 0, mono = true;
  for (const { t } of strecken) {
    const tl = tunnelLaeufe(t), at = tunnelAttr(t.batches, tl);
    t.batches.forEach((b, k) => {
      const a = at[k]; if (!a) return;
      for (let v = 0; v < b.pos.length / 3; v++) {
        if (!a[v * 4] && !a[v * 4 + 1]) continue;
        const m = a[v * 4], tt = a[v * 4 + 1], dc = a[v * 4 + 3], R = tl.find((q) => tt >= -0.7 && tt <= q.len + 0.7) || tl[0];
        if (tt > R.faceIn + 14 && tt < R.faceOut - 14) { innen++; if (m > 0.999) innen1++; }
        if (tt < R.faceIn) { davor++; if (m === 0) davor0++; }
        if (b.mat === MAT.WALL && dc > -0.3) decke++;
        if (b.mat === MAT.WALL && dc < -2) wand++;
      }
    });
    // Verlauf: Maske steigt hinter dem Portal stetig
    const R = tl[0]; let prev = -1;
    for (let tt = R.faceIn - 2; tt < R.faceIn + 14; tt += 0.5) { const m = maskeAm([R], R.A[0] + R.D[0] * tt, hoeheAuf(R, tt) + 1, R.A[2] + R.D[1] * tt); if (m < prev - 1e-9) mono = false; prev = m; }
  }
  check(innen > 500 && innen1 === innen, `innen (14 m hinter den Portalen): Maske 1 an ${innen1}/${innen} Punkten`);
  check(davor0 === davor, `vor der Portalwand: Maske 0 (${davor0}/${davor})`);
  check(wand > 50 && decke > 50, `Wände (${wand}) und Gewölbe (${decke} Punkte an der Decke) erfasst`);
  check(mono, 'Maske steigt hinter dem Portal stetig an (weicher Verlauf, TUNNEL_LOOK.rampe ' + TUNNEL_LOOK.rampe + ' m)');
  const R = tunnelLaeufe(strecken[0].t)[0], mid = R.len / 2;
  check(maskeAm([R], R.A[0] + R.D[0] * mid, hoeheAuf(R, mid) + 0.5, R.A[2] + R.D[1] * mid) === 1 && maskeAm([R], R.A[0] - R.D[0] * 6, hoeheAuf(R, -6) + 0.5, R.A[2] - R.D[1] * 6) === 0, 'Auto-Maske: Tunnelmitte 1, 6 m vor dem Portal 0');
}

console.log('--- D: Portal-Front ---');
{
  const { t } = strecken[0], tl = tunnelLaeufe(t), pf = portalFront(tl), ps = portale(tl);
  const n = pf.pos.length / 3;
  check(pf.idx.length > 300 && pf.col.length === pf.pos.length && pf.nrm.length === pf.pos.length, `${pf.idx.length / 3} Dreiecke, Vertex-Farben und Normalen je Punkt`);
  let vorn = 0, gelb = 0, schwarz = 0, minO = 1e9, maxO = -1e9, wx = 0;
  for (let v = 0; v < n; v++) {
    const x = pf.pos[v * 3], z = pf.pos[v * 3 + 2];
    const p = ps.reduce((a, q) => (Math.hypot(q.x - x, q.z - z) < Math.hypot(a.x - x, a.z - z) ? q : a));
    const o = (x - p.x) * p.ox + (z - p.z) * p.oz, r = Math.abs((x - p.x) * p.R.B[0] + (z - p.z) * p.R.B[1]);
    if (pf.nrm[v * 3] * p.ox + pf.nrm[v * 3 + 2] * p.oz > 0.99) { vorn++; minO = Math.min(minO, o); maxO = Math.max(maxO, o); wx = Math.max(wx, r); }
    const c = [pf.col[v * 3], pf.col[v * 3 + 1], pf.col[v * 3 + 2]];
    if (c.every((q, k) => Math.abs(q - PORTAL_FARBE.gelb[k]) < 1e-6)) gelb++;
    if (c.every((q, k) => Math.abs(q - PORTAL_FARBE.schwarz[k]) < 1e-6)) schwarz++;
  }
  check(minO > 0.9 && maxO < 1.4, `Vorderfläche ${f2(minO)} … ${f2(maxO)} m vor der alten Wand (deren Kästen reichen bis 0,9 m)`);
  check(wx >= ps[0].Wx, `deckt die alte Wand in der Breite ab (± ${f2(wx)} m ≥ ${f2(ps[0].Wx)} m)`);
  check(gelb > 0 && schwarz > 0, `Warnstreifen gelb (${gelb}) / schwarz (${schwarz} Punkte)`);
}

console.log('--- E: .TRK-Kastentunnel ---');
{
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sammlung.json'), 'utf8'));
  const bin = new Uint8Array(fs.readFileSync(path.join(ROOT, 'assets/sammlung.bin')));
  const T = tracksOf(meta);
  let n = 0, mitLauf = 0, innen = 0, innen1 = 0;
  for (let k = 0; k < T.length && n < 6; k++) {
    const { layout } = trkToLayout(parseTrk(bin.subarray(k * TRK_BYTES, (k + 1) * TRK_BYTES), T[k].id + '.trk'));
    if (!layout.pieces.some((p) => p.deco === 'tunnel' && !p.sub)) continue;
    n++;
    const t = buildTrack(layout, { treeCount: 0 }), tl = tunnelLaeufe(t);
    if (tl.length) mitLauf++;
    for (const R of tl) {
      const L = t.line;
      for (let i = R.i0; i <= R.i1; i++) { const tt = lageIm(R, L.px[i], L.py[i], L.pz[i])[0]; if (tt > 12 && tt < R.len - 12) { innen++; if (maskeAm(tl, L.px[i], L.py[i] + 0.5, L.pz[i]) > 0.999) innen1++; } }
    }
  }
  check(n > 0 && mitLauf === n, `${n} Sammlungs-Strecken mit Tunnel: Läufe erkannt (${mitLauf}/${n})`);
  check(innen === 0 || innen1 === innen, `Fahrlinie in den .TRK-Tunneln (ab 12 m hinter dem Portal): Maske 1 (${innen1}/${innen})`);
}

console.log('--- F: Röhre mit Mittelwand ---');
{
  const t = buildTrack(generate(3194, 3, { gv: 2 }), { treeCount: 0 }), tl = tunnelLaeufe(t), R = tl.find((q) => q.art === 'roehre');
  check(!!R && Math.abs(R.Rr - 5.6) < 0.01 && R.faceIn === 4, `3194-3-h: Röhren-Lauf erkannt (Radius ${R ? f2(R.Rr) : '-'} m, Portal bei ${R ? R.faceIn : '-'} m)`);
  const L = t.line; let rolle = 0, rolle1 = 0;
  for (let i = R.i0; i <= R.i1; i++) { const [tt] = lageIm(R, L.px[i], L.py[i], L.pz[i]); if (tt > Math.max(R.fr0, R.faceIn + TUNNEL_LOOK.rampe) && tt < Math.min(R.fr1, R.faceOut - TUNNEL_LOOK.rampe)) { rolle++; if (maskeAm(tl, L.px[i] + L.nx[i] * 0.5, L.py[i] + L.ny[i] * 0.5, L.pz[i] + L.nz[i] * 0.5) > 0.99) rolle1++; } }
  check(rolle > 50 && rolle1 === rolle, `Maske 1 an der Fahrlinie in der Rolle ab 11 m hinter den Portalen (auch kopfüber): ${rolle1}/${rolle}`);
  const at = tunnelAttr(t.batches, tl); let ring = 0;
  t.batches.forEach((b, k) => { const a = at[k]; if (a) for (let v = 0; v < a.length / 4; v++) if (a[v * 4 + 3] === 5 && a[v * 4] > 0.99) ring++; });
  check(ring > 200, `Röhren-Wand mit Lichtring-Kennung (${ring} Punkte)`);
  // Kamera: Punkt 0,2 m vor der Wand → auf Rr − 1,3 gezogen; Punkt nahe der Achse bleibt
  const tm = (R.fr0 + R.fr1) / 2, ax = (r, h) => ({ x: R.A[0] + R.D[0] * tm + R.B[0] * r, y: hoeheAuf(R, tm) + h, z: R.A[2] + R.D[1] * tm + R.B[1] * r });
  const p1 = ax(0, 2 * R.Rr - 0.2), p2 = ax(1, R.Rr + 1);
  const m1 = roehreKamera(tl, p1), m2 = roehreKamera(tl, p2);
  const d1 = Math.hypot(lageIm(R, p1.x, p1.y, p1.z)[1], lageIm(R, p1.x, p1.y, p1.z)[2] - R.Rr);
  check(m1 && Math.abs(d1 - (R.Rr - 1.3)) < 1e-6 && !m2, `Kamera an der Decke (0,2 m vor der Wand) → ${f2(d1)} m von der Achse; nahe der Achse unverändert`);
}

console.log(fails ? `\n${fails} FEHLER` : '\nalles OK');
process.exit(fails ? 1 : 0);
