// Arcade-Fahrgefühl (n37, Peter 10.10.2026: „nicht Stunts-Fahrgefühl, das war mies“ → Vorbild klassische Arcade-Stunt-Racer,
// Datenblatt ARCADE_FEEL.md, Clean-Room – eigene Umsetzung, eigene Zahlen). EINE Parametergruppe für alle Zutaten:
//   Luft    – Luftsteuerung ohne Flügel-Taste: Gas = Nase runter (Salto vorwärts), Bremse = Nase hoch (rückwärts), Lenken =
//             Rollen (Schraube). Original: halten = drehen (Drehraten-Regler im Auto-System, Stärke wächst mit dem Tempo wie
//             Ruder im Fahrtwind), loslassen = Schwung bleibt – voll manuell. Mittel: ANTIPPEN = ein ganzer Trick (Salto bzw.
//             Schraube 360°, mehrmals tippen = mehrere), nur wenn die restliche Flugzeit reicht (sonst „zu spät“), danach fängt
//             die Landehilfe ab. Halten tut auf Mittel nichts: wer Gas hält oder in der Luft wieder Gas gibt, schlägt keinen
//             ungewollten Salto (gemessen mit menschenähnlichen Bots: mit „halten = drehen“ 16 statt 3 Crashs an 40 Sprüngen).
//             Eingaben, die beim Absprung schon gehalten werden, zählen erst nach dem Loslassen (race.js airInput).
//             Die Flugbahn ändert sich durch das Drehen nicht (Schwerkraft im Flug bleibt AIR.factor) → Tempo-Fenster,
//             Generator und Prüffahrt bleiben gültig.
//   Landung – Mittel: sanfte Landehilfe, sobald nach eigener Luftsteuerung die Lage höchstens land.ang vom Ziel abweicht
//             (Ziel wie bisher: Dach oben, Nase längs der Flugbahn); ohne eigene Eingabe die Lagehilfe wie bis n36.
//             Original: keine Hilfe. Beide: Crash erst, wenn das Dach bei mehr als crash.roof Schräglage aufsetzt oder das Auto
//             crash.sideT s lang auf der Seite liegt (bis n36 schon bei jeder Dachberührung).
//   Wand    – Leitwände: kein Rückprall, wenig Reibung längs, das Auto dreht sich parallel zur Wand (schrammt statt stoppt);
//             Crash nur bei steilem Aufprall (senkrechtes Tempo > wand.vn UND Winkel > wand.ang) oder sehr hart (> wand.vnMax).
//   Boden   – Mittel: knackiger (Antrieb, Höchsttempo), direkter einlenken (Lenkgeschwindigkeit), etwas mehr Rutschen zulassen
//             (Schleuderschutz greift später). Original behält Motor und Reifen (580 km/h), lenkt aber genauso direkt.
//   Wrack   – Wiedereinstieg mit Totalschaden auf allen Stufen nach respawn s (Original bis n36 2,6 s).
// Leicht: Wand und Crash-Schwellen wie Mittel (der Autopilot fliegt, keine Luftsteuerung). Prüffahrt/Generator (reine
// Autopilot-Fahrt): unverändert (alte Codes bitgleich).
// URL: ?physik=alt = Fahrgefühl bis n36 (A/B, wertet nicht), ?luft=<0…3> Stärke der Luftsteuerung (0 aus), ?wand=<0…2>
// (0 = Wand wie bis n36, 2 = glatter), ?grip=<0,5…2> Reifenhaftung Mittel/Original (?grip=1 bleibt die Abstimmung bis n13, car.js).
const q = globalThis.location && globalThis.location.search ? new URLSearchParams(globalThis.location.search) : null;
const num = (k, lo, hi) => { if (!q) return null; const v = q.get(k); return v !== null && v !== '' && Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : null; };
const gripUrl = q && q.get('grip') !== '1' ? num('grip', 0.5, 2) : null;

export const ARCADE = {
  on: !(q && q.get('physik') === 'alt'),
  luft: {
    k: num('luft', 0, 3) ?? 1,   // Stärke (Faktor auf Drehraten und Drehbeschleunigung)
    pitch: 4.6,       // rad/s größte Nickrate (~265°/s): Salto in ~1,5 s
    roll: 5.6,        // rad/s größte Rollrate (~320°/s)
    accP: 14,         // rad/s² Drehbeschleunigung Nicken
    accR: 18,         // rad/s² Rollen
    vFull: 22,        // m/s: ab diesem Tempo volle Wirkung (Fahrtwind), darunter linear bis vMin-Anteil
    vMin: 0.5,
    dead: 0.2,        // Totzone der Eingabe
    hold: 0.08,       // s ohne Eingabe, dann fängt die Landehilfe die Drehung ab (nur Mittel, nahe am Ziel)
  },
  trick: {            // Mittel: Trick auf Antippen
    tap: 0.4,         // s: länger gehalten = kein Tipp
    pitch: 6.0,       // rad/s Salto (~345°/s)
    roll: 7.0,        // rad/s Schraube (~400°/s)
    acc: 26,          // rad/s²
    capture: 0.55,    // rad vor dem Ende übergibt der Trick an die Landehilfe
    margin: 0.2,      // s Reserve zur vorausgesagten Landung
    settle: 0.3,      // s nach dem Absprung zählt noch kein Tipp (späte Reaktion auf „Bremsen!“ an der Lippe ist kein Trick)
  },
  land: {
    ang: 50 * Math.PI / 180,   // Mittel: Landehilfe, wenn die Lage höchstens so weit vom Ziel abweicht
    k: 5,             // 1/s: Soll-Drehrate = k × Lagefehler
    acc: 16,          // rad/s²: so schnell folgt die Drehrate
    pre: 0.35,        // s Flugweg vor dem Aufsetzen: ab dann keine Luft-Eingabe mehr, Landehilfe richtet aus (nur Mittel)
    snap: 35 * Math.PI / 180,  // Mittel: beim Aufsetzen bis zu dieser Schräglage Dreh-Schwung quer zur Fahrbahn wegnehmen
    snapK: 0.7,
    right: 6,         // Mittel: Aufrichten am Boden (rad/s²), wenn das Auto auf der Seite liegt (25 … 110°)
  },
  crash: {
    roof: 115 * Math.PI / 180,  // Dach setzt auf: Crash erst ab dieser Schräglage zur Fläche (bis n36: immer)
    side: 70 * Math.PI / 180,   // … sonst Crash, wenn das Auto so schief crash.sideT s lang ohne 2 Räder am Boden liegt
    sideT: 1.2,
    floor: 16,        // m/s Aufprall Wagenboden (bis n36 13)
    wheel: 18,        // m/s Federbein-Anschlag (bis n36 15)
  },
  wand: {
    k: num('wand', 0, 2) ?? 1,
    fric: 0.06,       // Reibung längs der Wand (bis n36 0,22)
    rest: 0,          // Rückprall (bis n36 0,12)
    vn: 14,           // m/s senkrecht zur Wand: darunter nie Crash
    ang: 40 * Math.PI / 180,    // … darüber Crash nur bei steilem Winkel
    vnMax: 30,        // m/s senkrecht: immer Crash
    align: 3,         // 1/s: Gierrate weg von der Wand = align × Winkel zur Wand
    alignMax: 1.6,    // rad/s
    up: 0.5,          // |Normale · Auto-Oben| darunter = Wand (sonst Boden/Rampe: wie bis n36)
  },
  boden: {
    steerSpeed: 4.8,  // rad/s Lenkgeschwindigkeit (bis n36 3)
    // Mittel: Antrieb × maxDrive (n24: 0,7), ab vSoft weicher, 0 bei vTop (n24: 100 / 350 km/h) → 0–100 2,5 statt 3,1 s, darüber
    // wie n24 (Höchsttempo ~260 km/h): mit mehr Durchzug (vSoft 120, vTop 400: 296 km/h) flogen Vollgas-Bots an 4–7 von 24
    // Schanzen hinter die Landerampe (Peter n24: „Sprünge gehen zu weit“)
    drive: 0.92,
    vSoft: 60 / 3.6, vTop: 350 / 3.6,
    escDead: 0.2,     // Mittel: Totband des Schleuderschutzes (rad/s, n23: 0,12) – rutscht etwas mehr, fängt Dreher
    grip: gripUrl ?? 1,
  },
  respawn: 1.4,       // s Wrack bis zum Wiedereinstieg (Totalschaden an), alle Stufen
};
export function setArcade(o) {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object' && ARCADE[k] && typeof ARCADE[k] === 'object') Object.assign(ARCADE[k], v); else ARCADE[k] = v;
  }
}

// Auto-Einstellungen (car.assist) der Arcade-Physik je Fahrhilfe-Stufe; null = Physik bis n36. Die Rennlogik mischt sie über
// die Werte der Stufe (race.js carAssist). Reine Autopilot-Fahrt (Prüffahrt, Generator): nie.
export function arcadeAssist(key) {
  if (!ARCADE.on) return null;
  const B = ARCADE.boden, wand = ARCADE.wand.k > 0;
  const common = { arcade: 1, wall: wand ? ARCADE.wand.k : 0 };
  if (key === 'easy') return common;
  const ground = { steerSpeed: B.steerSpeed, airCtl: ARCADE.luft.k };
  if (key === 'medium') return { ...common, ...ground, airCtl: 0, airTap: ARCADE.luft.k, drive: B.drive, vSoft: B.vSoft, vTop: B.vTop, escDead: B.escDead, gripK: B.grip, landHelp: 1 };
  return { ...common, ...ground, gripK: B.grip, landHelp: 0 };
}
