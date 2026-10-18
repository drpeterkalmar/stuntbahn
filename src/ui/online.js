// Online-Menü (n35, Grundgerüst ohne Feinschliff): „👥 Online“ → Name + Raum erstellen / Beitreten per Code; Lobby mit
// Raumcode (vorlesbar), Teilen-Link (Web-Share am Handy, sonst Kopieren), QR-Code, Mitgliederliste (Stufe, Bereit,
// Gastgeber, Ping, wackelt, Strecke geladen), Gastgeber: Strecke aus dem Menü übernehmen, KI auffüllen + Stärke, Start;
// alle: Fahrhilfe, Bereit; Zieltabelle mit Revanche. Die HTML-Bausteine sind reine Funktionen (Node-Test
// tests/node/test_online_ui.mjs), OnlineAnsicht verdrahtet sie mit ui.js (sheet, toast, data-a-Aktionen „on…“).
// Browser-Abnahme (Layout hoch/quer, Handy-Tastatur, Teilen) macht der Heavy-Job.
import { fmtTime } from '../core/util.js';
import { ASSISTS } from '../game/race.js';
import { STAERKEN } from '../ai/gegner.js';
import { ONLINE } from '../game/online.js';
import { qrSvg } from './qr.js';
import { codeAusUrl } from '../net/code.js';

export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function startHtml(name, code = '') {
  return `<div class="onl">
    <p>Mit Freunden fahren: einer erstellt einen Raum, die anderen treten mit dem Code bei (2–${ONLINE.maxMenschen} Spieler, KI füllt bis ${ONLINE.maxAutos} Autos auf). Ohne Konto, die Autos fahren direkt von Gerät zu Gerät.</p>
    <label class="onlab">Dein Name <input id="onname" maxlength="16" autocomplete="nickname" value="${esc(name)}" placeholder="Name"></label>
    <button class="big go" data-a="onerstellen">➕ Raum erstellen</button>
    <div class="row onjoin"><input id="oncode" maxlength="7" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="Code, z. B. AB-CD" value="${esc(code)}" aria-label="Raumcode"><button data-a="onbeitreten">➜ Beitreten</button></div>
    <p class="hint">Alle Geräte brauchen Internet. Manche Mobilfunk- oder Firmennetze lassen keine direkte Verbindung zu – dann WLAN probieren.</p>
  </div>`;
}

const stufeIcon = (k) => (ASSISTS[k] ? ASSISTS[k].icon : '');
export function mitgliederHtml(z) {
  return `<table class="gtab onlist">${z.mitglieder.map((m) => `<tr class="${m.ich ? 'me' : ''}">
      <td>${m.nummer || ''}.</td>
      <td>${m.host ? '👑 ' : ''}${esc(m.name)}${m.ich ? ' (du)' : ''}</td>
      <td title="Fahrhilfe">${stufeIcon(m.stufe)}</td>
      <td>${m.still ? '<span title="Verbindung wackelt">⚠️</span>' : m.rtt != null ? `<small>${Math.round(m.rtt)} ms</small>` : ''}</td>
      <td>${!m.strecke && !m.host ? '<span title="lädt die Strecke">⏳</span>' : m.bereit ? '✅' : '⬜'}</td></tr>`).join('')}</table>`;
}

export function lobbyHtml(z, opt = {}) {
  const E = z.einst || {}, frei = Math.max(0, ONLINE.maxAutos - z.mitglieder.length);
  const ich = z.mitglieder.find((m) => m.ich) || {};
  const qr = opt.qr !== false ? `<div class="onqr" aria-label="QR-Code zum Beitreten">${opt.qrSvg || qrSvg(z.link)}</div>` : '';
  const host = z.gastgeber ? `
      <div class="lbl">Strecke</div>
      <div class="onstr">${esc(E.streckeName || 'keine')}${opt.menueStrecke && opt.menueStrecke !== E.streckeName ? `<button data-a="onstrecke">↻ „${esc(opt.menueStrecke)}“ nehmen</button>` : ''}</div>
      <div class="row"><button data-a="onmenue">🗺️ Andere Strecke im Menü wählen</button></div>
      <div class="lbl">KI-Gegner auffüllen</div>
      <div class="seg">${[0, 1, 2, 3, 4, 5].filter((n) => n <= frei).map((n) => `<button data-a="onki" data-v="${n}" class="${(E.ki | 0) === n ? 'on' : ''}">${n ? n : 'Aus'}</button>`).join('')}</div>
      ${(E.ki | 0) > 0 ? `<div class="seg">${Object.entries(STAERKEN).map(([k, S]) => `<button data-a="onstaerke" data-v="${k}" class="${E.staerke === k ? 'on' : ''}">${S.name}</button>`).join('')}</div>` : ''}
      <button class="big go${z.start && z.start.ok ? '' : ' aus'}" data-a="onstart" ${z.start && z.start.ok ? '' : `title="${esc(z.start && z.start.grund)}"`}>▶ Rennen starten</button>
      ${z.start && !z.start.ok ? `<div class="hint">${esc(z.start.grund)}</div>` : ''}`
    : `
      <div class="lbl">Strecke</div><div class="onstr">${esc(E.streckeName || '…')}${z.laedt ? ' ⏳ lädt …' : z.geladen && z.geladen === E.strecke ? ' ✓' : ''}</div>
      ${E.ki ? `<div class="hint">+ ${E.ki} KI-Gegner (${esc(STAERKEN[E.staerke] ? STAERKEN[E.staerke].name : '')})</div>` : ''}
      <button class="big${ich.bereit ? ' on' : ' go'}" data-a="onbereit">${ich.bereit ? '✅ Bereit – warte auf Start' : '✋ Bereit'}</button>`;
  return `<div class="onl">
    <div class="oncode">Raum <b>${esc(z.vorlesbar)}</b></div>
    ${qr}
    <div class="row"><button data-a="onteilen">📤 Link teilen</button><button data-a="onkopie">📋 Kopieren</button></div>
    ${mitgliederHtml(z)}
    <div class="lbl">Deine Fahrhilfe</div>
    <div class="seg">${Object.entries(ASSISTS).map(([k, A]) => `<button data-a="onstufe" data-v="${k}" class="${ich.stufe === k ? 'on' : ''}">${A.icon} ${A.name}</button>`).join('')}</div>
    ${host}
    ${z.wartet ? '<div class="hint">Rennen läuft – du fährst beim nächsten mit.</div>' : ''}
    ${(z.hinweise || []).map((h) => `<div class="onhin">${esc(h)}</div>`).join('')}
    <div class="row"><button data-a="onverlassen">🚪 Raum verlassen</button></div>
  </div>`;
}

// Zieltabelle (für alle gleich, vom Gastgeber): Platz, Name, Zeit, Abstand; „weg“ = Verbindung verloren
export function ergebnisHtml(z, E, ichSid) {
  const sieg = E && E.length && E[0].zeit != null ? E[0].zeit : null;
  const rows = (E || []).map((e) => `<tr class="${e.id === ichSid ? 'me' : ''}"><td>${e.platz}.</td><td>${e.ki ? '🤖 ' : ''}${esc(e.name || '?')}</td><td>${e.zeit != null ? fmtTime(e.zeit) + (e.daten && e.daten.hoch ? '*' : '') : e.weg ? 'weg' : '–'}</td><td>${e.platz > 1 && e.zeit != null && sieg != null ? '+' + (e.zeit - sieg).toFixed(2).replace('.', ',') : ''}</td></tr>`).join('');
  const offen = !E;
  return `<div class="onl">
    ${offen ? '<p>🏁 Im Ziel – warte auf die anderen …</p>' : ''}
    <table class="gtab">${rows}</table>
    ${(E || []).some((e) => e.daten && e.daten.hoch) ? '<div class="gnote">* hochgerechnet</div>' : ''}
    <div class="row">${z.gastgeber ? '<button class="go" data-a="onrevanche">🔁 Revanche</button><button data-a="onlobby">👥 Zur Lobby</button>' : '<button class="go" data-a="onrevanche">🔁 Revanche wünschen</button>'}</div>
    <div class="row"><button data-a="onverlassen">🚪 Raum verlassen</button></div>
  </div>`;
}

// Verdrahtung mit ui.js. spiel: game/onlinespiel.js; ui: UI (sheet, toast, show, store); app: Aktionen aus main.js
// ({ menueStrecke(), zeigeMenue() })
export class OnlineAnsicht {
  constructor(ui, spiel, app = {}) { this.ui = ui; this.spiel = spiel; this.app = app; this.ansicht = null; }
  offen() { return this.ui.screen === 'sheet' && !!this.ansicht; }
  zeigeStart(code = codeAusUrl() || '') { this.ansicht = 'start'; this.ui.sheet('👥 Online', startHtml(this.spiel.name() === 'Gast' ? '' : this.spiel.name(), code)); }
  zeigeLobby() {
    const z = this.spiel.zustand();
    if (!z.aktiv) return this.zeigeStart();
    this.ansicht = 'lobby';
    this.ui.sheet(`👥 Lobby`, lobbyHtml(z, { menueStrecke: this.app.menueStrecke ? this.app.menueStrecke() : null }), 'onzurueck');
  }
  zeigeErgebnis() { const z = this.spiel.zustand(); if (!z.aktiv) return; this.ansicht = 'ergebnis'; this.ui.sheet('🏁 Ergebnis', ergebnisHtml(z, z.phase === 'ergebnis' ? z.ergebnis : null, z.ich), 'onzurueck'); }
  // Spiel meldet Änderung: offene Ansicht neu zeichnen (Eingabefelder nicht überschreiben, solange getippt wird)
  aktualisieren(art, daten) {
    if (art === 'hinweis' && daten) this.ui.toast(daten, 2600);
    if (!this.offen()) return;
    const fokus = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (this.ansicht === 'lobby' && !fokus) this.zeigeLobby();
    else if (this.ansicht === 'ergebnis') this.zeigeErgebnis();
  }
  async action(a, v) {
    const S = this.spiel;
    const name = () => { const el = document.getElementById('onname'); if (el) S.setzeName(el.value); };
    switch (a) {
      case 'online': if (S.aktiv) this.zeigeLobby(); else this.zeigeStart(); break;
      case 'onerstellen': name(); this.ui.toast('Raum wird erstellt …', 1500); try { await S.erstellen(); this.zeigeLobby(); } catch (e) { this.ui.toast('Fehler: ' + (e.message || e), 4000); } break;
      case 'onbeitreten': { name(); const c = (document.getElementById('oncode') || {}).value || ''; this.ui.toast('Verbinde …', 1500); try { if (await S.beitreten(c)) this.zeigeLobby(); } catch (e) { this.ui.toast('Fehler: ' + (e.message || e), 4000); } break; }
      case 'onteilen': {
        const url = S.link(), text = `Fahr mit mir Stuntbahn! Raum ${S.zustand().vorlesbar}`;
        if (navigator.share) navigator.share({ title: 'Stuntbahn', text, url }).catch(() => {});
        else this.kopieren(url);
        break;
      }
      case 'onkopie': this.kopieren(S.link()); break;
      case 'onstufe': if (this.app.setAssist) this.app.setAssist(v); S.stufeGeaendert(); this.zeigeLobby(); break;
      case 'onbereit': S.setzeBereit(!S.zustand().mitglieder.find((m) => m.ich).bereit); setTimeout(() => this.zeigeLobby(), 50); break;
      case 'onki': S.setzeKi(+v); break;
      case 'onstaerke': S.setzeKi(S.zustand().einst.ki, v); break;
      case 'onstrecke': S.waehleAktuelleStrecke(); break;
      case 'onmenue': this.ansicht = null; if (this.app.zeigeMenue) this.app.zeigeMenue(); this.ui.toast('Strecke wählen, dann „👥 Lobby“ → übernehmen', 3200); break;
      case 'onstart': if (!S.starten()) this.zeigeLobby(); else { this.ansicht = null; this.ui.toast('Start!', 1200); } break;
      case 'onrevanche': S.revanche(); break;
      case 'onlobby': this.ansicht = 'lobby'; S.zurLobby(); this.zeigeLobby(); break;
      case 'onverlassen': S.verlassen(); this.ansicht = null; if (this.app.verlassen) this.app.verlassen(); break;
      case 'onzurueck': this.ansicht = null; if (this.app.zurueck) this.app.zurueck(); else this.ui.showMenu(this.ui.env); break;
      default: break;
    }
  }
  kopieren(url) {
    const ok = () => this.ui.toast('📋 Link kopiert', 1600);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, () => prompt('Link kopieren:', url));
    else prompt('Link kopieren:', url);
  }
}
