// n42 „Ruckeln + langsamer Start“ (Peter 26.10.2026): Schalter der einzelnen Maßnahmen. Standard alles an; jede ist per
// URL einzeln abschaltbar (A/B, Messung tests/n42_mess.py), ?glatt=0 schaltet alle zusammen ab (Stand 0.14).
//   ?einseitig=0    durchsichtige beidseitige Flächen (Reifenabrieb, Ideallinie, Funken, Flammen, Feuerwerk, Minikarte)
//                   wieder in zwei Durchgängen – three.js wechselt dabei je Bild zweimal das Shader-Programm (GC-Druck)
//   ?programmfest=0 Materialien dürfen wie bisher zugleich an einfachen und instanzierten Objekten hängen (z. B. Lack an der
//                   nahen Kulisse und an Reifenstapeln) – three.js wechselt dann je Bild mehrmals das Programm (GC-Druck)
//   ?vorwaermen=0   Bild-Effekt-Varianten (Unschärfe, Hitze, Action, Kantenglättung je Grafikstufe) und Feuerwerk nicht im
//                   Voraus übersetzen (sonst ~0,2 s Hänger beim ersten Auftauchen im Rennen)
//   ?schattenfix=0  Auto-Schatten der Grafik-Automatik wie bisher per castShadow schalten (alle Materialien neu übersetzt,
//                   gemessen 1,7 s Standbild)
//   ?pruefung=alt   Autopilot-Prüfung der Zufallsstrecke wie bisher vor dem Menü im Hauptthread (statt Worker nebenher)
//   ?swfrueh=1      Service Worker wie bisher sofort registrieren (Vorab-Cache lädt dann parallel zum Spielstart alles doppelt)
//   ?tonfrueh=1     Ton-Aufnahmen (274 kB + Dekodieren) wie bisher schon beim Laden der Seite statt nach dem Menü
//   ?filmhaeppchen=0 Highlight-Film am Ende der Zielshow in einem Stück bauen (statt in Häppchen während der Show)
const q = globalThis.location && globalThis.location.search ? new URLSearchParams(globalThis.location.search) : null;
const alt = !!q && q.get('glatt') === '0';
const an = (k, aus = '0') => !alt && !(q && q.get(k) === aus);
export const GLATT = {
  einseitig: an('einseitig'),
  programmfest: an('programmfest'),
  vorwaermen: an('vorwaermen'),
  schattenfix: an('schattenfix'),
  pruefungWorker: an('pruefung', 'alt'),
  swSpaet: an('swfrueh', '1'),
  filmHaeppchen: an('filmhaeppchen'),
  tonSpaet: an('tonfrueh', '1'),
};
// für durchsichtige, beidseitige, flache Flächen: ein Durchgang (Bild gleich, s. o.)
export const einseitig = () => GLATT.einseitig;
