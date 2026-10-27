// n42 Etappe 2 (Generator-Version 3, Code-Zusatz „p“): seltene Original-Stunts-Elemente in Zufallsstrecken. Die Generatoren
// setzen dafür einen Platzhalter (ein Stück über mehrere gerade Felder); nach dem Bau des Layouts wird er hier in die
// .TRK-Teile zerlegt, wie sie der Import erzeugt (track/trkimport.js):
//   n42_pipe  Röhre:     Röhren-Einfahrt → Röhre → Röhren-Ausfahrt (3 Felder)
//   n42_hwy   Autobahn:  Anfang → Autobahn (zwei Richtungsfahrbahnen, Mittelwand) → Ende (3 Felder)
//   n42_gapK  Lücken-Sprung über K freie Felder: Schanze (Ebene 0 → 1, offene Rampe) → Lücke → Landerampe (K + 2 Felder)
// Ein Crash des Autopiloten entschärft das ganze Element zu Geraden (defuseSelten).
import { PIECES } from './pieces.js';
import './pieces_trk.js';

const gerade = (n) => Array.from({ length: n }, (_, k) => [k, 0]);
export const SELTEN = { n42_pipe: 3, n42_hwy: 3, n42_gap1: 3, n42_gap2: 4, n42_gap3: 5 };
for (const [t, n] of Object.entries(SELTEN)) {
  if (!PIECES[t]) PIECES[t] = { name: 'Platzhalter ' + t, cells: gerade(n), next: [n, 0], turn: 0, stunt: 1, build: () => {} };
}
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// Platzhalter → .TRK-Teile (Reihenfolge und Lage wie im Layout; Ebene des Platzhalters bleibt die Grundebene)
export function zerlegeSelten(pieces) {
  const out = [];
  for (const p of pieces) {
    if (!SELTEN[p.type]) { out.push(p); continue; }
    const F = DIRS[p.d], at = (k) => ({ i: p.i + F[0] * k, j: p.j + F[1] * k });
    const b = { d: p.d, m: 1, lvl: p.lvl || 0, sel: p.type };
    if (p.type === 'n42_pipe') {
      out.push({ ...b, ...at(0), type: 'tr_pipeT', into: 1, nk: 'pipe' }, { ...b, ...at(1), type: 'tr_pipe', pk: 'pipeT', nk: 'pipeT' }, { ...b, ...at(2), type: 'tr_pipeT', pk: 'pipe' });
    } else if (p.type === 'n42_hwy') {
      out.push({ ...b, ...at(0), type: 'tr_hwyT', into: 1, nk: 'hwy' }, { ...b, ...at(1), type: 'tr_hwy', pk: 'hwyT', nk: 'hwyT' }, { ...b, ...at(2), type: 'tr_hwyT', pk: 'hwy' });
    } else {
      const k = +p.type.slice(-1), L = b.lvl;
      out.push({ ...b, ...at(0), type: 'tr_road', lvl: L, h1: L + 1, kick: 1, nk: 'gap' },
        { ...b, ...at(1), type: 'tr_gap' + k, lvl: L + 1, h1: L + 1, kind: 'gap' },
        { ...b, ...at(1 + k), type: 'tr_road', lvl: L + 1, h1: L, land: 1, gapK: k, pk: 'gap' });
    }
  }
  return out;
}

// Autopilot crasht an Stück k eines seltenen Elements → das ganze Element wird zu Geraden (gleiche Felder, Grundebene)
export function defuseSelten(layout, k) {
  const P = layout.pieces, p = P[k];
  if (!p || !p.sel) return false;
  let a = k, e = k;
  while (!isAnfang(P[a]) && a > 0 && P[a - 1].sel === p.sel) a--;
  while (e < P.length - 1 && P[e + 1].sel === p.sel && !isAnfang(P[e + 1])) e++;
  const L = P[a].lvl || 0, n = SELTEN[p.sel], F = DIRS[P[a].d];
  const rep = Array.from({ length: n }, (_, q) => ({ type: 'straight', i: P[a].i + F[0] * q, j: P[a].j + F[1] * q, d: P[a].d, m: 1, lvl: L }));
  P.splice(a, e - a + 1, ...rep);
  return true;
}
// erstes Stück eines Elements (Einfahrt, Schanze, Anfang)
const isAnfang = (q) => (q.type === 'tr_pipeT' && q.into) || (q.type === 'tr_hwyT' && q.into) || (q.type === 'tr_road' && q.kick);
