// n42: Autopilot-Prüfung der Zufallsstrecke im Worker (Modul-Worker). Der Hauptthread zeigt Strecke und Menü schon vorher; das
// Ergebnis (Entschärfungen, Variante, Referenzzeit) kommt nach. Die URL des Workers trägt die Suche der Seite, damit alle
// Regler (?welt=, ?stunt=, ?roehre=, ?hindernis= …) hier genauso gelten wie im Spiel.
import { pruefeZufall } from './pruefung.js';

self.onmessage = async (e) => {
  const { id, seed, diff, mode, gv } = e.data;
  try {
    let letzt = -1;
    const r = await pruefeZufall(seed, diff, mode, gv, (p, f, variant) => {
      if (p - letzt >= 0.04 || p >= 1) { letzt = p; self.postMessage({ id, fortschritt: p, fixes: f, variant }); }
    });
    self.postMessage({ id, fertig: true, ok: r.ok, variant: r.variant, pieces: r.layout.pieces, apTime: r.apTime, fixes: r.fixes, reason: r.reason || null });
  } catch (err) {
    self.postMessage({ id, fehler: String((err && err.stack) || err) });
  }
};
