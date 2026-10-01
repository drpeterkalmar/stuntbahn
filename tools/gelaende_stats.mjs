// n22: Kennzahlen der Gelände-Strecken über viele Seeds (Höhenunterschied der Fahrbahn, größte Steigung, Kuppen-/Senken-
// Radien, Tunnel, Brücken, Elemente, Bauzeit). Aufruf: node tools/gelaende_stats.mjs [anzahl] [stufe]
import { generate } from '../src/track/generator.js';
import { buildTrack } from '../src/track/build.js';
const N = +(process.argv[2] || 20), diffs = process.argv[3] ? [+process.argv[3]] : [1, 2, 3];
for (const d of diffs) {
  const rows = [];
  for (let k = 0; k < N; k++) {
    const seed = 1000 + k * 7919 % 90000;
    const lay = generate(seed, d, { gel: true });
    const t0 = performance.now();
    const tr = buildTrack(lay);
    const ms = performance.now() - t0;
    const L = tr.line; let a = 1e9, b = -1e9, g = 0, kc = 0, ks = 0;
    const pl = tr.gel.plan;
    for (let i = 2; i < L.n - 2; i++) {
      if (L.loop[i] || L.air[i]) continue;
      a = Math.min(a, L.py[i]); b = Math.max(b, L.py[i]);
      const pc = lay.pieces[L.piece[i]];
      if (pl.pieces[L.piece[i]].rigid || L.wave[i]) continue;
      const ds = L.s[i + 2] - L.s[i - 2]; if (ds < 1) continue;
      g = Math.max(g, Math.abs(L.py[i + 2] - L.py[i - 2]) / ds);
      const s1 = (L.py[i + 2] - L.py[i]) / (L.s[i + 2] - L.s[i]), s0 = (L.py[i] - L.py[i - 2]) / (L.s[i] - L.s[i - 2]);
      const kap = (s1 - s0) / (ds / 2); kc = Math.min(kc, kap); ks = Math.max(ks, kap);
      void pc;
    }
    const runs = (f) => pl.pieces.filter((q, k2) => f(q) && !f(pl.pieces[(k2 - 1 + pl.pieces.length) % pl.pieces.length])).length;
    rows.push({ seed, h: b - a, g, Rc: kc < 0 ? -1 / kc : 1e9, Rs: ks > 0 ? 1 / ks : 1e9, tun: runs((q) => q.tunnel), br: runs((q) => q.bridge), scale: pl.scale, ms, el: Object.keys(lay.meta.elems).join(',') });
  }
  const med = (f) => { const v = rows.map(f).sort((x, y) => x - y); return v[v.length >> 1]; };
  const mn = (f) => Math.min(...rows.map(f)), mx = (f) => Math.max(...rows.map(f));
  console.log(`Stufe ${d}: Höhe ${mn((r) => r.h).toFixed(0)}–${med((r) => r.h).toFixed(0)}–${mx((r) => r.h).toFixed(0)} m, Steigung max med ${(med((r) => r.g) * 100).toFixed(0)}% max ${(mx((r) => r.g) * 100).toFixed(0)}%, Kuppe Rmin med ${med((r) => r.Rc).toFixed(0)} min ${mn((r) => r.Rc).toFixed(0)}, Senke Rmin min ${mn((r) => r.Rs).toFixed(0)}, Tunnel ${rows.filter((r) => r.tun).length}/${N}, Brücken ${rows.filter((r) => r.br).length}/${N}, scale med ${med((r) => r.scale).toFixed(2)}, Bau med ${med((r) => r.ms).toFixed(0)} ms`);
  if (process.argv.includes('-v')) for (const r of rows) console.log(' ', r.seed, r.h.toFixed(0), (r.g * 100).toFixed(0) + '%', r.Rc.toFixed(0), r.Rs.toFixed(0), r.tun, r.br, r.scale.toFixed(2), r.el);
}
