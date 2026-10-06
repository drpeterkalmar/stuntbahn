// Grundmaße der Strecke (Meter). Raster wie beim Vorbild: 30×30 Felder.
export const GRID = 30;

// Weltmaßstab (27.09.2026, Peter: „Welt im Verhältnis zum Auto vergrößern“, damit das doppelt so schnelle Auto
// sein Tempo auf die Strecke bringt). Ein Regler für alles Welt-Bezogene: Felder, Radien, Geraden, Gelände,
// Sichtweite, Szenerie. Auto-Bezogenes bleibt: Auto, Physik, Kamera-Abstand, Cockpit – und die Stunt-Bauwerke,
// deren Maße an der Fahrphysik hängen (Looping, Schanze, Röhren-Querschnitt, Korkenzieher-Rolle, Slalom).
// Übersteuern: URL ?welt=1 (alter Maßstab, A/B-Vergleich), in Node STUNT_WELT=1. Bis 27.09.2026: 1.
export const WORLD_SCALE_DEFAULT = 2;
export const WORLD_SCALE = (() => {
  const q = globalThis.location && globalThis.location.search;
  let v = q ? parseFloat(new URLSearchParams(q).get('welt')) : NaN;
  if (!(v > 0) && globalThis.process && globalThis.process.env) v = parseFloat(globalThis.process.env.STUNT_WELT);
  // 1 … 2,5 in Schritten von 0,05 (Feldmaß ganzzahlig; darüber stoßen Looping-Platte und Stützen aneinander)
  return v >= 1 && v <= 2.5 ? Math.round(v * 20) / 20 : WORLD_SCALE_DEFAULT;
})();
const S = WORLD_SCALE;
// Bestzeiten/Geister/geprüfte Strecken je Maßstab getrennt (store.js): alter Maßstab ohne Zusatz
export const WORLD_TAG = S === 1 ? '' : '@w' + S;

export const TILE = 20 * S;      // Feldgröße (bis 27.09.2026: 20 m)
export const LEVEL_H = 6;        // Höhe einer Hochstraßen-Ebene: bleibt (Durchfahrtshöhe hängt am Auto)
// halbe Fahrbahnbreite: moderat breiter, damit die Straße in der großen Welt kein dünnes Band ist (4,5 → 5,6 m)
// n23 (Peter 02.10.2026: „die Strecke ist zu schmal“): Rennstrecke statt Landstraße – Faktor ROAD_WIDEN (5,6 → 7,3 m
// halbe Breite, 14,6 m Fahrbahn). URL ?breit=alt (A/B, wertet nicht) bzw. in Node STUNT_BREIT=alt = Breite bis n22;
// ?breit=1.2 o. ä. für Versuche (1 … 1,5). Layout und Seeds bleiben, nur die Fahrbahn (und was an ihr hängt: Randsteine,
// Leitplanken, Brücken, Tunnel, Tore, Gelände-Anpassung, Toleranzen) wird breiter. Stunt-Spuren (Looping, Röhre,
// Korkenzieher) und die Autobahn (ROAD_HW_ALT, schon zweispurig) behalten ihr Maß.
export const ROAD_WIDEN = (() => {
  const q = globalThis.location && globalThis.location.search;
  let b = q ? new URLSearchParams(q).get('breit') : null;
  if (b == null && globalThis.process && globalThis.process.env) b = globalThis.process.env.STUNT_BREIT ?? null;
  if (b === 'alt') return 1;
  const v = parseFloat(b);
  return v >= 1 && v <= 1.5 ? v : 1.3;
})();
export const ROAD_HW_ALT = 4.5 * (1 + 0.25 * (S - 1));
export const ROAD_HW = ROAD_HW_ALT * ROAD_WIDEN;
// Stunt-Maßstab (n26, Peter 03.10.2026: „Und die Stunteinlagen ebenfalls vergrößern, passend zu den Strecken“): Die
// Stunt-Bauwerke behielten beim Weltmaßstab (n12) und der breiteren Fahrbahn (n23) ihr Auto-Maß – in der großen Welt mit
// 14,6 m breiter Straße wirkten Looping & Co. klein, die Fahrbahn verengte sich am Stunt. Ein Regler für alle Bauwerke:
// Looping (Bogenlänge, Höhe, Spurbreite, Spurversatz), Röhren-Querschnitt, Korkenzieher-Rolle, Slalom-Blöcke ×STUNT_SCALE;
// Schanze höher (Lippe, Landerampe, Scheitel), Wellen/Bodenwellen/Kuppe, Steilwand, Halfpipe, Schlucht gedämpft (je Teil,
// siehe stuntK). Standard 1,6 = Verhältnis Fahrbahn n23 zu Spur bis n22 (7,3 / 4,5 m). Alles bleibt in seinen Feldern.
// URL ?stunt=1 (Bauwerke wie bis n25, A/B, wertet nicht), ?stunt=1.4 o. ä. für Versuche (1 … 2); Node: STUNT_STUNT=1.
export const STUNT_SCALE_DEFAULT = 1.6;
export const STUNT_SCALE = (() => {
  const q = globalThis.location && globalThis.location.search;
  let v = q ? parseFloat(new URLSearchParams(q).get('stunt')) : NaN;
  if (!(v > 0) && globalThis.process && globalThis.process.env) v = parseFloat(globalThis.process.env.STUNT_STUNT);
  return v >= 1 && v <= 2 ? Math.round(v * 20) / 20 : STUNT_SCALE_DEFAULT;
})();
// Zwischenspeicher geprüfter Strecken je Stunt-Maßstab getrennt (main.js); Standard ohne Zusatz
export const STUNT_TAG = STUNT_SCALE === STUNT_SCALE_DEFAULT ? '' : '@st' + STUNT_SCALE;
// Wachstum je Bauwerk bei Stunt-Maßstab k: voll (Looping, Röhre, Korkenzieher) oder gedämpft um den Anteil a
// (k = 1,6, a = 0,5 → 1,3). k = 1 → 1 (Bauwerke exakt wie bis n25)
export const stuntK = (k, a = 1) => 1 + (k - 1) * a;
// Röhre mit Hindernis (n29, Peter 05.10.2026: „Röhre hat normalerweise ein Hindernis in der Mitte am Boden“): die Röhre
// der generierten Strecken (flach, 3D, Gelände) bekommt in der Mitte einen Buckel quer über den Boden (pieces.js
// TUBE_HUMP). URL ?roehre=glatt = glatte Röhre wie bis n28 (A/B, wertet nicht); Node: STUNT_ROEHRE=glatt. ?stunt=1
// („Bauwerke wie bis n25“, bitgleich) baut ebenfalls die glatte Röhre (mit ?roehre=buckel trotzdem mit Buckel).
export const TUBE_OBST = (() => {
  const q = globalThis.location && globalThis.location.search;
  let v = q ? new URLSearchParams(q).get('roehre') : null;
  if (v == null && globalThis.process && globalThis.process.env) v = globalThis.process.env.STUNT_ROEHRE ?? null;
  if (v == null && STUNT_SCALE === 1) return false;
  return v !== 'glatt';
})();
// Zwischenspeicher geprüfter Strecken: glatte Röhre getrennt (main.js VBUILD)
export const TUBE_TAG = TUBE_OBST ? '' : '@rg';
export const ROAD_Y = 0.06;      // Fahrbahn liegt knapp über dem Gelände
export const WORLD_HALF = GRID * TILE / 2;   // halbe Kantenlänge des Rasters (m)

// Richtungen: 0 = Ost (+X), 1 = Süd (+Z), 2 = West (−X), 3 = Nord (−Z). Rechts = d+1.
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// Weltkoordinate der Feldmitte (Raster zentriert um den Ursprung)
export const tileX = (i) => (i - GRID / 2) * TILE + TILE / 2;
export const tileZ = (j) => (j - GRID / 2) * TILE + TILE / 2;

// Material-/Oberflächen-IDs (Physik + Grafik)
export const MAT = {
  ROAD: 0,      // Asphalt
  KERB: 1,      // Randstein rot/weiß
  CONCRETE: 2,  // Beton (Bauwerke)
  METAL: 3,     // Stahl (Schanzen)
  WALL: 4,      // Leitwand (Beton, hell)
  PAD: 5,       // Betonplatte am Boden
  LINE: 6,      // Start/Ziel-Markierung (auf Asphalt)
  STEEL: 7,     // Stahlträger/Geländer (nur Grafik)
  GRASS: 8,     // Gelände (Physik)
  WATER: 9,     // Wasser (Absturz)
  BANNER: 10,   // Banner/Portale (Grafik)
  DIRT: 11,     // Schotterstraße (Import)
  ICE: 12,      // Eisstraße (Import)
  PAINT: 13,    // Szenerie mit Vertexfarben (Häuser, Palmen …)
  GLASS: 14,    // Fenster/Glas (Szenerie)
};
// Fahrbahn-Materialien (bekommen Markierungs-Attribut aRoad)
export const ROAD_MATS = new Set([MAT.ROAD, MAT.DIRT, MAT.ICE]);
export const SURF_MAT = { paved: MAT.ROAD, dirt: MAT.DIRT, icy: MAT.ICE };

// Haftung je Oberfläche (Reifen)
export const GRIP = { 0: 1.25, 1: 1.1, 2: 1.05, 3: 1.0, 4: 0.9, 5: 1.0, 6: 1.25, 7: 0.9, 8: 0.72, 9: 0.2, 10: 1, 11: 0.95, 12: 0.5, 13: 0.9, 14: 0.9 };
// Rollwiderstand je Oberfläche
export const ROLL = { 0: 0.015, 1: 0.02, 2: 0.016, 3: 0.018, 4: 0.02, 5: 0.02, 6: 0.015, 7: 0.02, 8: 0.09, 9: 0.5, 10: 0.02, 11: 0.03, 12: 0.012, 13: 0.02, 14: 0.02 };
// Wiese = Wiese (Peter 30.09.2026: „Die Wiese darf nicht schneller sein als 30 km/h. Es ist eine Wiese!“, n21).
// Bis n19 bremste das Gelände nur über den Rollwiderstand (ROLL 0,09 gegen 2,2 MW): Vollgas auf der Wiese 390 km/h.
// Jetzt, gleitend nach Anteil der Räder mit Graskontakt (car.js):
// - Antrieb der Gras-Räder ohne Aero-Last-Verstärkung, ab driveFrom linear weniger, 0 ab vMax (Räder drehen durch);
//   Nitro genauso.
// - Gras-Widerstand am Schwerpunkt (kein Nicken, kein Überschlag) gegen die Fahrt längs des Bodens: k·(v − v0) oberhalb
//   v0, höchstens aMax m/s² – wer mit 200 km/h abkommt, ist nach ~1,7 s bei 30 km/h.
// - Haftung (GRIP[8] 0,72) bleibt: Lenken geht.
// URL ?wiese=alt = Verhalten bis n19 (A/B). Messung: tools/wiese_probe.mjs, HAFTUNG_BERICHT.md.
export const WIESE = {
  on: !((globalThis.location && globalThis.location.search && new URLSearchParams(globalThis.location.search).get('wiese') === 'alt')
    || (globalThis.process && globalThis.process.env && globalThis.process.env.STUNT_WIESE === 'alt')),   // Node: STUNT_WIESE=alt
  v0: 25 / 3.6, vMax: 30 / 3.6, driveFrom: 20 / 3.6, k: 5, aMax: 30,
};
