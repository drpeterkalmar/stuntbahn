// Kleiner Strecken-Designer für eigene .TRK-Strecken (Beispiele im Spiel, Tests): eine „Schildkröte“
// fährt über das Raster und legt Elemente in Fahrtrichtung ab; der passende Byte-Code und die
// Füllfelder ergeben sich aus der Elementtabelle. Gelände (Hügel, Hänge, Wasser) wird separat gesetzt.
import { DIRS } from './defs.js';
import { CODES, KINDS, placeElement } from './trkelems.js';
import { pieceCells } from './pieces.js';
import './pieces_trk.js';
import { writeTrk } from './trk.js';

const FILL = { '1,0': 0xFF, '0,1': 0xFE, '1,1': 0xFD };   // Lage relativ zum NW-Anker

export class TrackDesigner {
  constructor(i, j, d, surf = 'paved') {
    this.elem = new Uint8Array(900); this.terr = new Uint8Array(900);
    this.i = i; this.j = j; this.d = d; this.lvl = 0; this.surf = surf;
    this.log = [];
  }
  // Element der Art `kind` in Fahrtrichtung ablegen. o: { turn: 'R'|'L', up: true|false (Rampe/Wendel),
  // chir: 'R'|'L', surf, lane: 'a'|'b' (Abzweig: Gerade/Kurve) }
  put(kind, o = {}) {
    const surf = o.surf || (KINDS[kind].routes && ['road', 'sf', 'cross', 'sharp', 'large', 'ssplit'].includes(kind) ? this.surf : 'paved');
    let found = null;
    for (const e of CODES.values()) {
      if (e.kind !== kind || (e.surf !== surf && ['road', 'sf', 'cross', 'sharp', 'large', 'ssplit'].includes(kind))) continue;
      if (o.chir && e.chir !== (o.chir === 'L' ? -1 : 1)) continue;
      const pe = placeElement(e.code, 0, 0);
      for (const r of pe.routes) {
        if (r.d !== this.d) continue;
        if (o.turn && pieceTurn(r) !== o.turn) continue;
        if (o.up !== undefined && (r.h1 > r.h0) !== o.up) continue;
        if (o.lane && r.lane !== o.lane) continue;
        if (o.match && Object.entries(o.match).some(([k, v]) => r[k] !== v)) continue;
        if (!o.turn && pieceTurn(r) && kind !== 'ssplit' && kind !== 'lsplit') continue;
        found = { e, pe, r };
        break;
      }
      if (found) break;
    }
    if (!found) throw new Error(`Kein Element ${kind} ${JSON.stringify(o)} für Richtung ${this.d}`);
    const { e, pe, r } = found;
    const ai = this.i - r.i, aj = this.j - r.j;
    for (const [ci, cj] of pe.cells) {
      const x = ci + ai, y = cj + aj;
      if (x < 0 || y < 0 || x > 29 || y > 29) throw new Error(`Element ${kind} ragt aus dem Raster (${x},${y})`);
      const k = y * 30 + x;
      if (this.elem[k]) throw new Error(`Feld (${x},${y}) schon belegt – ${kind}`);
      this.elem[k] = (ci === 0 && cj === 0) ? e.code : FILL[ci + ',' + cj];
    }
    const nx = pieceCells(r.t, r.i + ai, r.j + aj, r.d, r.m).next;
    this.log.push({ kind, code: e.code, i: ai, j: aj });
    this.i = nx[0]; this.j = nx[1]; this.d = nx[2];
    this.lvl += (r.h1 - r.h0);
    return this;
  }
  // mehrere gerade Straßen
  road(n = 1, kind = 'road') { for (let k = 0; k < n; k++) this.put(kind); return this; }
  // freie Felder überspringen (Sprunglücke)
  gap(n = 1) { this.i += DIRS[this.d][0] * n; this.j += DIRS[this.d][1] * n; return this; }
  // Gelände-Rechteck setzen (Code), z. B. Hügel 0x06, Wasser 0x01
  terrain(i0, j0, i1, j1, code) { for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.terr[j * 30 + i] = code; return this; }
  // Szenerie (Code direkt), nur auf freie Felder
  deco(i, j, code) { if (!this.elem[j * 30 + i]) this.elem[j * 30 + i] = code; return this; }
  bytes(horizon = 4) { return writeTrk(this.elem, this.terr, horizon); }
}

function pieceTurn(r) {
  const nx = pieceCells(r.t, 0, 0, r.d, r.m).next;
  const dd = (nx[2] - r.d + 4) % 4;
  return dd === 1 ? 'R' : dd === 3 ? 'L' : null;
}
