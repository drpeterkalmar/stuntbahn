// Eigene Beispiel-Strecken im .TRK-Format (mit dem Designer gebaut, dürfen ins Repo).
// Zeigen alle Sonderteile des Imports; dienen auch als Tests und für Bildschirmfotos.
import { TrackDesigner } from './trkdesign.js';

function rundkurs() {
  const t = new TrackDesigner(5, 5, 0);
  // Norden: Start → Looping → Schikane → Slalom → Tunnel → Korkenzieher → Röhre
  t.put('sf').road(1).put('loop').road(1).put('chicane', { chir: 'R' }).road(1).put('slalom').road(1)
    .put('tunnel').put('tunnel').road(1).put('corklr').road(1)
    .put('pipeT', { match: { into: 1 } }).put('pipe').put('pobst').put('pipe').put('pipeT', { match: { into: 0 } }).road(1)
    .put('large', { turn: 'R' });
  // Osten: Autobahn → Steilkurve mit Übergängen
  t.road(1).put('hwyT', { match: { into: 1 } }).put('hwy').put('hwy').put('hwyT', { match: { into: 0 } }).road(1)
    .put('bankT', { match: { side: -1, b0: 0 } }).put('bankC', { turn: 'R' }).put('bankT', { match: { side: -1, b0: 1 } });
  // Süden: Sprung über die Scheune → Hochstraße → Wendel hinunter
  t.road(2).put('bramp', { up: true }).gap(1).put('bramp', { up: false }).road(2)
    .put('elramp', { up: true }).put('elev').put('elev').put('corkud', { up: false, chir: 'R' }).road(8)
    .put('large', { turn: 'R' });
  // Westen: über den Hügel zurück zum Start
  t.road(9).put('sharp', { turn: 'R' });
  // Gelände: Hügel mit Hängen am Westrand, See in der Mitte
  t.terrain(2, 10, 6, 11, 0x06).terrain(2, 9, 6, 9, 0x09).terrain(2, 12, 6, 12, 0x07)
    .terrain(1, 10, 1, 11, 0x0A).terrain(7, 10, 7, 11, 0x08)
    .terrain(1, 9, 1, 9, 0x0D).terrain(7, 9, 7, 9, 0x0C).terrain(1, 12, 1, 12, 0x0E).terrain(7, 12, 7, 12, 0x0B);
  t.terrain(11, 9, 19, 12, 0x01);
  // Szenerie
  t.deco(22, 16, 0x9F).deco(15, 11, 0xAC).deco(22, 11, 0xA9).deco(9, 3, 0xA5).deco(12, 3, 0xA3).deco(24, 3, 0x9D)
    .deco(17, 3, 0xB1).deco(8, 8, 0x9A).deco(25, 9, 0x97).deco(25, 10, 0x97).deco(25, 12, 0x98).deco(9, 12, 0x99)
    .deco(9, 13, 0x99).deco(10, 14, 0x99).deco(3, 3, 0x99).deco(2, 7, 0x99).deco(20, 8, 0x97).deco(26, 18, 0x99);
  return t;
}

export const SHOWCASE = [
  { id: 'demo-rundkurs', name: 'Beispiel: Stunt-Rundkurs', make: rundkurs, horizon: 4 },
];

const cache = new Map();
export function showcaseBytes(id) {
  if (cache.has(id)) return cache.get(id);
  const s = SHOWCASE.find((x) => x.id === id);
  if (!s) return null;
  const b = s.make().bytes(s.horizon);
  cache.set(id, b);
  return b;
}
