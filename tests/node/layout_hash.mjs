// Layout-Hash einer generierten Strecke (Typ, Feld, Richtung, Spiegelung, Ebene je Stück) – für den Test
// „alte Codes bleiben gültig“ (n19): generate(seed, diff) ohne 3D-Option muss exakt dieselben Hashes liefern.
import crypto from 'crypto';
export function layoutHash(lay) {
  const s = lay.pieces.map((p) => [p.type, p.i, p.j, p.d, p.m || 1, p.lvl || 0].join(':')).join('|') + '#' + lay.meta.key + '#' + lay.meta.name;
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
}
export const HASH_SEEDS = [4711, 20260929, 20260930, ...Array.from({ length: 60 }, (_, k) => 1000 + k * 7919 % 90000), ...Array.from({ length: 20 }, (_, k) => k * 1013 + 17)];
