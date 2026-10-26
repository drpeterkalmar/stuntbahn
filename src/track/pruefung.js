// n42: Autopilot-Prüfung einer Zufallsstrecke (Generator-Variante + Entschärfen) – eine Stelle für den Worker
// (track/pruefung_worker.js, Standard: läuft nebenher, während der Hauptthread schon die Welt baut) und den bisherigen Weg im
// Hauptthread (?pruefung=alt bzw. ohne Modul-Worker). 3D/Gelände (n19/n22): scheitert der Autopilot auch nach dem Entschärfen,
// nimmt der Generator die nächste Variante desselben Codes (deterministisch – alle bekommen dieselbe Strecke), höchstens 4.
import { generate } from './generator.js';
import { verify } from './verify.js';

// Generator-Optionen je Streckenart/Variante/Generator-Version (gv: n33 = 2 mit den Hindernissen)
export const genOpt = (mode, variant, gv) => ({ ...(mode === '3d' ? { d3: true, variant } : mode === 'gel' ? { gel: true, variant } : {}), ...(gv >= 2 ? { gv } : {}) });

// lay0 = schon erzeugte Variante 0 (wird beim Entschärfen verändert); onProgress(p 0…1, Entschärfungen, Variante)
export async function pruefeZufall(seed, diff, mode, gv, onProgress = null, lay0 = null) {
  for (let variant = 0; ; variant++) {
    const lay = variant === 0 && lay0 ? lay0 : generate(seed, diff, genOpt(mode, variant, gv));
    const res = await verify(lay, (p, f) => onProgress && onProgress(p, f, variant));
    if (res.ok || mode === 'flat' || variant >= 3) return { ...res, variant };
  }
}
