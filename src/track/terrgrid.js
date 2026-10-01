// Adaptives Gelände-Raster (27.09.2026, Weltmaßstab): Das 5-m-Raster wächst mit dem Quadrat des Maßstabs
// (Maßstab 2: 83 000 statt 21 000 Punkte, als Mesh 166 000 Dreiecke). Nur nahe der Strecke und wo das Gelände
// stark gekrümmt ist, braucht die Grafik 5 m. Das Raster ist in Blöcke zu TB × TB Zellen (20 m) geteilt:
//  – feine Blöcke: alle Punkte (nahe der Strecke, oder wo zwei Dreiecke über den Block um mehr als COARSE_ERR
//    vom exakten Gelände abweichen würden – Seeufer, Hänge, Rasterrand),
//  – grobe Blöcke: nur die Blockecken; die Grafik zeichnet sie als zwei Dreiecke (world.js).
// H = exaktes Höhenraster (generierte Strecken: die Physik fährt darauf; Importe: Physik nutzt die Funktion).
// Hv = Grafik-Höhen: wie H, aber Punkte, die einen groben Block berühren, liegen genau auf dessen Kante
// (linear zwischen den Ecken) – so hat das Mesh an der Grenze fein/grob keine Risse.
export const TB = 4;
// Feine Blöcke bis so viele Felder um die Strecke = Abseits-Grenze (race.js OFF.far = 1,5 Felder): überall, wo
// man fahren darf, ist die Grafik exakt (auch die Teiche unter Brücken, ~1,5 Felder).
export const FINE_DT = 1.5;
// Größte erlaubte Abweichung der groben Darstellung (m); Bäume stehen auf der gezeichneten Fläche (world.js)
export const COARSE_ERR = 0.5;

// ext so wählen, dass (nx − 1) ein Vielfaches von TB ist (bei 5-m-Schritt: ext auf 10 m aufrunden)
export function gridExt(want, step) { const q = step * TB / 2; return Math.ceil(want / q - 1e-9) * q; }

// Höhe auf den zwei Dreiecken eines Vierecks (Ecken a = (0,0), b = (1,0), c = (0,1), d = (1,1); Teilung b–c wie
// im Mesh von world.js)
export function triLerp(a, b, c, d, u, v) {
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

// heightFn(x, z) exakt; nearTrack(x0, z0, x1, z1) → true = Block wegen Streckennähe fein
export function adaptiveGrid(ext, step, heightFn, nearTrack, coarseErr = COARSE_ERR) {
  const nx = Math.round(2 * ext / step) + 1, nb = (nx - 1) / TB;
  if (nb !== Math.floor(nb)) throw new Error('Gelände-Raster: (nx − 1) muss Vielfaches von ' + TB + ' sein');
  const BS = TB * step;
  const H = new Float32Array(nx * nx);
  for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = heightFn(-ext + i * step, -ext + j * step);
  const fine = new Uint8Array(nb * nb);
  for (let bj = 0; bj < nb; bj++) for (let bi = 0; bi < nb; bi++) {
    const x0 = -ext + bi * BS, z0 = -ext + bj * BS;
    let f = nearTrack(x0, z0, x0 + BS, z0 + BS);
    if (!f) {
      const k0 = bj * TB * nx + bi * TB, a = H[k0], b = H[k0 + TB], c = H[k0 + TB * nx], d = H[k0 + TB * nx + TB];
      const ce = typeof coarseErr === 'function' ? coarseErr(x0 + BS / 2, z0 + BS / 2) : coarseErr;   // n22: je Block
      for (let q = 0; q <= TB && !f; q++) for (let p = 0; p <= TB; p++) if (Math.abs(H[k0 + q * nx + p] - triLerp(a, b, c, d, p / TB, q / TB)) > ce) { f = true; break; }
    }
    fine[bj * nb + bi] = f ? 1 : 0;
  }
  return { nx, nb, H, Hv: projectCoarse(H, nx, nb, fine), fine };
}

// Kopie von Hsrc, in der jeder Punkt, der einen groben Block berührt, auf dessen Kante bzw. Fläche liegt
// (Kanten: linear zwischen den Ecken; innen: wie die gezeichneten Dreiecke). Auch nach dem Absenken unter
// Fahrbahnen (trkterrain.js carveUnderRoads) erneut anwenden, sonst öffnen sich Schlitze am Übergang.
export function projectCoarse(Hsrc, nx, nb, fine) {
  const Hv = Float32Array.from(Hsrc);
  const span = (i) => { const q = Math.floor(i / TB); return i % TB ? [q, q] : [Math.max(0, q - 1), Math.min(nb - 1, q)]; };
  for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) {
    if (!(i % TB) && !(j % TB)) continue;
    const [bi0, bi1] = span(i), [bj0, bj1] = span(j);
    let cb = -1;
    for (let bj = bj0; bj <= bj1 && cb < 0; bj++) for (let bi = bi0; bi <= bi1; bi++) if (!fine[bj * nb + bi]) { cb = bj * nb + bi; break; }
    if (cb < 0) continue;
    const bi = cb % nb, bj = (cb / nb) | 0, k0 = bj * TB * nx + bi * TB;
    Hv[j * nx + i] = triLerp(Hsrc[k0], Hsrc[k0 + TB], Hsrc[k0 + TB * nx], Hsrc[k0 + TB * nx + TB], (i - bi * TB) / TB, (j - bj * TB) / TB);
  }
  return Hv;
}
