// Grundmaße der Strecke (Meter). Raster wie beim Vorbild: 30×30 Felder.
export const GRID = 30;
export const TILE = 20;          // Feldgröße
export const LEVEL_H = 6;        // Höhe einer Hochstraßen-Ebene
export const ROAD_HW = 4.5;      // halbe Fahrbahnbreite
export const ROAD_Y = 0.06;      // Fahrbahn liegt knapp über dem Gelände

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
};

// Haftung je Oberfläche (Reifen)
export const GRIP = { 0: 1.25, 1: 1.1, 2: 1.05, 3: 1.0, 4: 0.9, 5: 1.0, 6: 1.25, 7: 0.9, 8: 0.72, 9: 0.2, 10: 1 };
// Rollwiderstand je Oberfläche
export const ROLL = { 0: 0.015, 1: 0.02, 2: 0.016, 3: 0.018, 4: 0.02, 5: 0.02, 6: 0.015, 7: 0.02, 8: 0.09, 9: 0.5, 10: 0.02 };
