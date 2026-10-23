// n40 Optionen „Zuschauer“ (Tiere/Menschen, Standard Tiere) und „Zieljubel“ (Stunt/Dreher/aus, Standard Stunt) – eigenes Modul,
// damit ui.js nur wenige Zeilen braucht (n41 baut dort parallel um). Dazu die Tier-Ohren für die Fan-Cam-Silhouetten.
import { zuschauerModus, ZUSCHAUER } from '../gfx/tierform.js';
import { ZIELJUBEL } from '../game/zielstunt.js';

// Zieljubel: URL ?zieljubel=stunt|dreher|aus hat Vorrang vor der Option; Standard Stunt
export function zieljubelArt(search, S = {}) {
  const u = new URLSearchParams(search || '').get('zieljubel');
  if (ZIELJUBEL.includes(u)) return u;
  return ZIELJUBEL.includes(S.zieljubel) ? S.zieljubel : 'stunt';
}

// Optionen-Blatt: zwei Umschalter mit Hinweis (data-a „zuschauer“ / „zieljubel“, ui.js leitet weiter)
export function n40OptionenHtml(S, search) {
  const zu = zuschauerModus(search, S), zj = zieljubelArt(search, S), q = new URLSearchParams(search || '');
  const seg = (a, cur, list) => `<div class="seg" data-g="${a}">${list.map(([k, n]) => `<button data-a="${a}" data-v="${k}" class="${cur === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  return `
      <div class="lbl">Zuschauer</div>
      ${seg('zuschauer', zu, [['tiere', '🐻 Tiere'], ['mensch', '🧑 Menschen']])}
      <p class="hint">${zu === 'tiere' ? '<b>Tiere</b> (Standard): Bärchen, Häschen, Füchse, Pinguine, Kätzchen und Kühe jubeln am Rand und auf den Tribünen.' : '<b>Menschen:</b> Zuschauer wie bis Oktober 2026.'}${q.has('zuschauer') ? ' (Link-Zusatz <code>?zuschauer=</code> gilt vorrangig.)' : ''}</p>
      <div class="lbl">Zieljubel</div>
      ${seg('zieljubel', zj, [['stunt', '🤸 Stunt'], ['dreher', '🌀 Dreher'], ['aus', 'Aus']])}
      <p class="hint">${{ stunt: '<b>Stunt</b> (Standard): Nach der Ziellinie zündet dein Auto den Nitro, springt und zeigt eine Schraube, einen Front- oder Backflip – wenn hinter dem Ziel genug Platz ist, sonst wie „Dreher“.', dreher: '<b>Dreher:</b> wie bisher – auf Leicht mit Fahrstil Brachial ab und zu ein Jubel-Dreher, sonst ausrollen.', aus: '<b>Aus:</b> nach dem Ziel einfach ausrollen.' }[zj]} Nur Show: Zeit, Bestzeit und Geisterauto enden an der Linie.${q.has('zieljubel') ? ' (Link-Zusatz <code>?zieljubel=</code> gilt vorrangig.)' : ''}</p>`;
}

// Fan-Cam (ui.js drawFans): bei Tier-Zuschauern Ohren an die Kopf-Silhouette (Kopf-Mitte x, y, Radius r; Art aus fx)
export function fanOhren(g, x, y, r, fx) {
  if (!ZUSCHAUER.tiere) return;
  const art = Math.floor(fx * 10) % 3;
  g.beginPath();
  if (art === 0) { g.ellipse(x - r * 0.45, y - r * 1.35, r * 0.24, r * 0.75, -0.15, 0, Math.PI * 2); g.ellipse(x + r * 0.45, y - r * 1.35, r * 0.24, r * 0.75, 0.15, 0, Math.PI * 2); }   // Hase
  else if (art === 1) { g.ellipse(x - r * 0.68, y - r * 0.72, r * 0.32, r * 0.32, 0, 0, Math.PI * 2); g.ellipse(x + r * 0.68, y - r * 0.72, r * 0.32, r * 0.32, 0, 0, Math.PI * 2); }   // Bär
  else for (const s of [-1, 1]) { g.moveTo(x + s * r * 0.25, y - r * 0.8); g.lineTo(x + s * r * 0.85, y - r * 0.45); g.lineTo(x + s * r * 0.7, y - r * 1.45); g.closePath(); }   // Fuchs/Katze
  g.fill();
}
