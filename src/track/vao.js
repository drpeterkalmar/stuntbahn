// n30 (Grafik-Kern, Schatten-Strategie): gebackene Umgebungsverdeckung (Vertex-AO) für die Strecken-Batches – Fahrbahn,
// Banden, Wände, Tunnel/Röhre, Brücken, Loopings. Wie das Gelände-AO (gfx/world.js, Vorlage n22): je Eckpunkt ein paar kurze
// Strahlen in die Halbkugel um die Normale gegen die Kollisionswelt; je früher ein Strahl trifft, desto dunkler.
// Ergebnis: b.occ (Float32Array, 0 = frei … 1 = ganz verdeckt) – als Attribut „aOcc“ im Material (materials.js
// patchVertexAO): dämpft nur das Umgebungslicht (Himmel/IBL), nicht die Sonne (die hat die gebackene Schattenkarte).
// Damit kann SAO auf Kino aus, und Standard bekommt AO ohne Zusatz-Pass. Reine Rechnung (Node-testbar: tests/node/test_vao.mjs).
//
// Kosten: Strahlen = Eckpunkte × strahlen. Budget maxStrahlen; darüber werden Eckpunkte an gleicher Stelle (Nähte,
// Querschnitt-Ringe) nur einmal gerechnet und notfalls weniger Strahlen genommen (strahlenMin).

export const VAO = {
  strahlen: 6, strahlenMin: 3,
  laenge: 4.5,          // m (Auto-Maßstab: Ecke Wand/Fahrbahn, Tunnel, Brücke darüber)
  versatz: 0.06,        // m entlang der Normale (nicht die eigene Fläche treffen)
  staerke: 0.75,        // größte Verdeckung (Ecke/Tunnel); TODO n30-Heavy: am Bild abstimmen, mit SAO an/aus vergleichen
  maxStrahlen: 900000,  // TODO n30-Heavy: Bauzeit am Handy messen (env.buildMs), ggf. senken
};

// feste Richtungen in der Halbkugel um +Z (cosinus-ähnlich, goldener Winkel), je Anzahl einmal
const DIRS = new Map();
export function halbkugel(n) {
  if (DIRS.has(n)) return DIRS.get(n);
  const d = [];
  for (let k = 0; k < n; k++) {
    const a = k * 2.39996323, z = Math.sqrt(1 - (k + 0.5) / n) * 0.92 + 0.08;   // nicht ganz flach (Streifschüsse)
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    d.push([Math.cos(a) * r, Math.sin(a) * r, z]);
  }
  DIRS.set(n, d);
  return d;
}

// Tangenten-Basis zur Normale (n darf beliebig zeigen)
function basis(nx, ny, nz) {
  const ax = Math.abs(nx) < 0.9 ? 1 : 0, ay = ax ? 0 : 1;
  let tx = ay * nz - 0 * ny, ty = 0 * nx - ax * nz, tz = ax * ny - ay * nx;   // t = a × n
  const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
  const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
  return [tx, ty, tz, bx, by, bz];
}

// Verdeckung eines Punkts (0…1) aus `dirs` Strahlen der Länge L
export function verdeckung(world, x, y, z, nx, ny, nz, dirs, L, versatz) {
  const [tx, ty, tz, bx, by, bz] = basis(nx, ny, nz);
  const ox = x + nx * versatz, oy = y + ny * versatz, oz = z + nz * versatz;
  let occ = 0;
  for (const [a, b, c] of dirs) {
    const dx = tx * a + bx * b + nx * c, dy = ty * a + by * b + ny * c, dz = tz * a + bz * b + nz * c;
    const h = world.rayTrack(ox, oy, oz, dx, dy, dz, L, false);
    if (h) occ += 1 - Math.sqrt(h.t / L) * 0.6;   // nahe Treffer zählen voll, ferne weniger
  }
  return occ / dirs.length;
}

// Schrittweise (Generator): rechnet `je` Eckpunkte, dann yield { fertig, anteil }. So kann das Spiel die Arbeit über die
// ersten Bilder verteilen (gfx/world.js vaoAuftrag: ~6 ms je Bild) statt den Streckenbau zu verlängern
// (gemessen Mac/Node: 0,2–0,5 s je Strecke, am Handy das 4–6-Fache). Am Ende hat jeder Batch b.occ.
export function* bakeVertexAOSchritte(batches, world, opts = {}) {
  const o = { ...VAO, ...opts };
  const t0 = Date.now();
  let ecken = 0;
  for (const b of batches) ecken += b.pos.length / 3;
  // gleiche Stelle + ähnliche Normale nur einmal rechnen (Nähte, Querschnitte mit doppelten Eckpunkten)
  const cache = new Map();
  const key = (P, N, i) => `${Math.round(P[i] * 20)},${Math.round(P[i + 1] * 20)},${Math.round(P[i + 2] * 20)},${Math.round(N[i] * 4)},${Math.round(N[i + 1] * 4)},${Math.round(N[i + 2] * 4)}`;
  let einzig = 0;
  for (const b of batches) {
    const P = b.pos, N = b.nrm;
    for (let i = 0; i < P.length; i += 3) { const k = key(P, N, i); if (!cache.has(k)) { cache.set(k, -1); einzig++; } }
  }
  const n = Math.max(o.strahlenMin, Math.min(o.strahlen, Math.floor(o.maxStrahlen / Math.max(1, einzig))));
  const dirs = halbkugel(n), je = o.je || 64;   // 64 Eckpunkte ≈ 0,8 ms (Mac) bzw. ~4 ms (Handy)
  let strahlen = 0, gerechnet = 0, fertigEcken = 0, seit = 0;
  for (const b of batches) {
    const P = b.pos, N = b.nrm, nv = P.length / 3;
    const occ = new Float32Array(nv);
    for (let v = 0; v < nv; v++) {
      const i = v * 3;
      const k = key(P, N, i);
      let a = cache.get(k);
      if (a < 0) {
        a = verdeckung(world, P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2], dirs, o.laenge, o.versatz);
        cache.set(k, a); strahlen += n; gerechnet++;
        if (++seit >= je) { seit = 0; yield { fertig: false, anteil: (fertigEcken + v) / ecken }; }
      }
      occ[v] = Math.min(1, a * o.staerke);
    }
    b.occ = occ;
    fertigEcken += nv;
  }
  return { ecken, gerechnet, strahlen, strahlenJe: n, ms: Date.now() - t0 };
}
// Alles auf einmal (Tests, ?vao=sync). Liefert Statistik { ecken, gerechnet, strahlen, strahlenJe, ms }.
export function bakeVertexAO(batches, world, opts = {}) {
  const g = bakeVertexAOSchritte(batches, world, opts);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}
