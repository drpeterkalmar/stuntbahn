// Bedienoberfläche (DOM): Laden, Menü, HUD, Touch-Steuerung, Pause, Ergebnis, Replay, Kino-Replay, Credits.
import { fmtTime, daySeed } from '../core/util.js';
import { ASSISTS, PENALTY, BRAKE_HELP_MODES } from '../game/race.js';
import { DIFFS } from '../track/generator.js';
import { PAINTS } from '../gfx/carmesh.js';
import { PIECES } from '../track/pieces.js';
import { LINE_LEVELS } from '../gfx/lineviz.js';
import { NITRO } from '../physics/extras.js';
import { BLUR_LEVELS } from '../gfx/post.js';
import { parseTrk } from '../track/trk.js';
import { trkToLayout } from '../track/trkimport.js';
import { drawMinimap, drawLayoutMap } from './minimap.js';
import { clipMime, shareClip } from './cliprec.js';
import { SAM_STUNTS, SAM_DIFF, SAM_SORTS, DEFAULT_VIEW, filterSort, lengthClass } from '../game/sammlung.js';
import { HORIZONS } from '../track/trk.js';

const $ = (s, r = document) => r.querySelector(s);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const ICON = { loop: '➰', jump: '🛫', tube: '🕳️', bank: '↪️', crest: '⛰️', bumps: '〰️', chicane: '🔀', bridge: '🌉',
  // 3D-Teile (n19)
  spiral: '🌀', cliff: '🪂', cliff2: '🪂', wall: '🧱', waves: '🎢', slope3: '🎿', slope4: '🎿', tr_corklr: '🍥', tr_corkud: '🌀', tr_bankC: '↪️',
  // Gelände-Teile (n22)
  halfpipe: '🛹', gorge: '🏞️', kuppe: '🐪', tunnel: '🚇', tilt: '📐', serp: '〽️', drop: '🪂' };
const ICON_NAME = { gorge: 'Schluchtsprung', kuppe: 'Kuppe mit Luftphase', tunnel: 'Tunnel', tilt: 'Hang-Querfahrt', serp: 'Serpentine', drop: 'Plateau-Abfahrt', bridge: 'Brücke' };
// Streckenarten (n22): flach (bis n18), Hochstraße (n19, „3D“), Gelände (Standard ab n22)
const MODES = [['flat', '▭', 'flach', 'Flache Strecken wie bis n18'], ['3d', '🏗️', 'Hochstraße', 'Hochstraßen-Ebenen, Brücken, Spiralen, Klippensprünge (n19)'], ['gel', '⛰️', 'Gelände', 'Strecke durch Hügel und Täler: Kuppen, Serpentinen, Hänge, Tunnel, Schluchtsprung']];
// Symbole für importierte Strecken (Elementart → Symbol, Name)
const TICON = { loop: ['➰', 'Looping'], corklr: ['🌀', 'Korkenzieher'], corkud: ['🌀', 'Wendel'], gap: ['🛫', 'Sprung'], pipe: ['🕳️', 'Röhre'], bankC: ['↪️', 'Steilkurve'], chicane: ['🔀', 'Schikane'], elev: ['🌉', 'Hochstraße'], tunnel: ['🚇', 'Tunnel'], hwy: ['🛣️', 'Autobahn'], slalom: ['🚧', 'Slalom'] };
// Höhenunterschied der Fahrbahn einer Gelände-Strecke (m)
function hDiff(env) { const L = env.track.line; let a = 1e9, b = -1e9; for (let i = 0; i < L.n; i++) if (!L.loop[i] && !L.air[i]) { a = Math.min(a, L.py[i]); b = Math.max(b, L.py[i]); } return b - a; }
function stuntSummary(pieces) {
  const c = {};
  for (const p of pieces) { const k = p.kind === 'pobst' ? 'pipe' : p.kind === 'span' || p.kind === 'solid' ? 'elev' : p.kind; if (TICON[k]) c[k] = (c[k] || 0) + 1; }
  return Object.entries(c).map(([k, n]) => `<span title="${TICON[k][1]}">${TICON[k][0]}${n > 1 ? '×' + n : ''}</span>`).join(' ');
}

export class UI {
  constructor(app, store) {
    this.app = app; this.store = store;
    this.root = $('#ui');
    this.a = {};
    this.screen = null;
    this.touchIds = new Map();
    document.body.dataset.tbsize = store.settings.tbsize || 'gross';
    this.build();
  }
  build() {
    this.root.innerHTML = `
      <div id="loading" class="screen show"><div class="logo">STUNT<b>BAHN</b></div><div class="bar"><i></i></div><p>Laden …</p></div>
      <div id="menu" class="screen"></div>
      <div id="hud">
        <div class="tl"><div class="time">0:00,00</div><div class="pen"></div><div class="best"></div></div>
        <div class="tc"><div class="cp"></div></div>
        <div class="hint2" aria-live="polite"></div>
        <div class="tr"><div class="rbs">
          <button class="rb line" data-a="linetoggle" aria-label="Ideallinie ein/aus" title="Ideallinie ein/aus (L)"><svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3bdc55"/><stop offset=".55" stop-color="#ffd21a"/><stop offset="1" stop-color="#ff4a2a"/></linearGradient></defs><path d="M4 21C6 13 18 15 20 3" fill="none" stroke="url(#lg)" stroke-width="3.2" stroke-linecap="round"/><path class="x" d="M4 4L20 20" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg></button>
          <button class="rb" data-a="rewind" aria-label="Zurückspulen" title="Zurückspulen (R)">⏪</button>
          <button class="rb" data-a="cam" aria-label="Kamera wechseln" title="Kamera (C)">🎥</button>
          <button class="rb" data-a="pause" aria-label="Pause" title="Pause (Esc)">⏸</button>
        </div><div class="assistTag"></div></div>
        <div class="speed"><b>0</b><span>km/h</span><i class="gear">1</i></div>
        <button class="xb hop" data-x="hop" aria-label="Hüpfer" title="Hüpfer (Leertaste, Gamepad B)"><i>🦘</i><kbd>Leer</kbd></button>
        <button class="xb nitro" data-x="nitro" aria-label="Nitro" title="Nitro (Shift oder N, Gamepad RB)"><i>🔥</i><kbd>N</kbd></button>
      </div>
      <div id="boostfx"><i></i></div>
      <div id="wipe"></div>
      <div id="big"></div>
      <div id="toast"></div>
      <div id="touch">
        <div class="half l" data-t="L"><span>◀</span></div><div class="half r" data-t="R"><span>▶</span></div>
        <div class="pad left"><div class="tb" data-t="L">◀</div><div class="tb" data-t="R">▶</div></div>
        <div class="pad right"><div class="tb brake" data-t="B">BREMSE</div><div class="tb gas" data-t="G">GAS</div></div>
      </div>
      <div id="cpgear" aria-hidden="true"></div>
      <div id="pause" class="screen"></div>
      <div id="result" class="screen"></div>
      <div id="replayui"><div class="rinfo"></div><div class="bar"><i></i></div><div class="btns"></div></div>
      <div id="cine" aria-label="Kino-Replay"><div class="lb top"></div><div class="lb bot"></div>
        <div class="ctag">🎬 Highlights</div><div class="cbar"><i></i></div>
        <div class="cap" aria-live="polite"></div>
        <button class="cskip" data-a="cineskip" aria-label="Kino-Replay überspringen">Überspringen ⏭</button></div>
      <div id="sheet" class="screen"></div>
      <div id="drop"><div>📂 Strecken hier ablegen<small>.TRK, .RPL oder .ZIP</small></div></div>`;
    // Datei-Auswahl (Handy + Desktop); wird per Knopf im Nutzer-Klick geöffnet
    this.fileInput = h('input');
    this.fileInput.type = 'file'; this.fileInput.multiple = true; this.fileInput.accept = '.trk,.TRK,.rpl,.RPL,.zip,.ZIP,application/zip,application/octet-stream';
    this.fileInput.style.display = 'none';
    this.fileInput.addEventListener('change', () => { const f = [...this.fileInput.files]; this.fileInput.value = ''; if (f.length && this.a.importFiles) this.a.importFiles(f); });
    document.body.appendChild(this.fileInput);
    // Extras-Knöpfe: sofort beim Antippen (pointerdown), nicht erst beim Loslassen – auch mit der Maus
    this.root.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      e.preventDefault();
      if (b.dataset.x === 'hop' && this.a.hop) this.a.hop();
      if (b.dataset.x === 'nitro' && this.a.nitro) this.a.nitro();
      b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 160);
    });
    // Kino-Replay: ein neuer Tipp irgendwo überspringt (ein Finger, der noch vom Rennen liegt, löst kein pointerdown aus)
    $('#cine').addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      if (performance.now() - (this._cineT0 || 0) < 600) return;
      e.preventDefault();
      if (this.a.skipCine) this.a.skipCine();
    });
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      e.preventDefault();
      this.action(b.dataset.a, b.dataset.v, b);
    });
    this.initTouch();
    this.noZoom();
  }
  // iOS Safari ignoriert user-scalable=no (seit iOS 10): Zwei-Finger-Zoom (gesture*) und Doppeltipp-Zoom (dblclick)
  // abfangen. Bewusst KEIN preventDefault auf touchstart/touchend – das bräche Klicks und die Ton-Freischaltung;
  // zwei schnelle Taps auf eine Touch-Taste bleiben zwei Auslösungen (Tasten reagieren auf pointerdown).
  noZoom() {
    const stop = (e) => e.preventDefault();
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, stop, { passive: false });
    document.addEventListener('dblclick', stop, { passive: false });
  }
  bind(actions) { this.a = actions; }
  show(id) {
    for (const s of this.root.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id);
    this.screen = id;
    document.body.dataset.screen = id || 'none';
  }
  loading(p, text) {
    const L = $('#loading');
    if (p >= 1) { L.classList.remove('show'); return; }
    L.classList.add('show');
    $('#loading .bar i').style.width = Math.round(p * 100) + '%';
    if (text) $('#loading p').textContent = text;
  }
  fatal(e) {
    const L = $('#loading'); L.classList.add('show');
    $('#loading p').textContent = 'Fehler beim Start: ' + (e && e.message || e) + ' – bitte neu laden.';
  }
  toast(t, ms = 1400) {
    const T = $('#toast'); T.textContent = t; T.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => T.classList.remove('show'), ms);
  }
  big(t, cls = '', ms = 900) {
    const B = $('#big'); B.innerHTML = t; B.className = 'show ' + cls;
    clearTimeout(this._bt); this._bt = setTimeout(() => { B.className = ''; }, ms);
  }
  // Aufblitzen/Wisch-Überblendung beim Fahrbahn-Reset: an beim Crash, aus beim Versetzen
  wipe(on) {
    const W = $('#wipe'); W.style.opacity = ''; W.style.transition = ''; W.style.background = '';
    W.classList.toggle('in', !!on);
  }
  flash() { this.wipe(true); clearTimeout(this._wt); this._wt = setTimeout(() => this.wipe(false), 90); }
  // Bestzeiten je Fahrhilfe (Mittel und Original; Leicht hat seit n15 keine) + Zeile mit der Liste der anderen
  // Extras-Einstellung; dazu (Menü) die letzte Leicht-Zeit. Die Zeilen „alte Physik“/„alte Welt“/„erste Physik“ sind
  // seit n21 weg (Bestzeiten einmalig gelöscht, keine Versions-Schachtelung mehr, store.js)
  bestsHtml(id) {
    const ks = Object.keys(ASSISTS).filter((k) => k !== 'easy');
    const now = ks.map((k) => { const b = this.store.bestFor(id, k); return `<span>${ASSISTS[k].icon} ${b ? fmtTime(b.time) : '–'}</span>`; }).join('');
    const row = (fn, label, title) => {
      const l = ks.map((k) => [k, fn(k)]).filter(([, b]) => b);
      return l.length ? `<span class="oldp" title="${title}">${label}: ${l.map(([k, b]) => ASSISTS[k].icon + ' ' + fmtTime(b.time)).join(' ')}</span>` : '';
    };
    const xOn = this.store.settings.extras;
    const old = row((k) => this.store.otherExtrasBestFor(id, k), xOn ? 'ohne Extras' : 'mit Extras', xOn ? 'Bestzeiten ohne Hüpfer & Nitro (eigene Liste, Option aus)' : 'Bestzeiten mit Hüpfer & Nitro (eigene Liste)');
    const last = this.store.timesFor(id)[0];
    const lastEasy = last ? `<span class="lastt" title="Leicht: keine Bestzeit, nur die letzte Zeit">${ASSISTS.easy.icon} zuletzt ${fmtTime(last.t)}</span>` : '';
    return { now, old, lastEasy };
  }
  // Leicht: Liste der letzten Zeiten (neueste zuerst, mit Datum); cur = gerade gefahrene (oberste) hervorheben
  timesHtml(list, cur) {
    if (!list || !list.length) return '';
    const day = (d) => d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' : '';
    return `<div class="lbl">Deine letzten Zeiten hier</div><ol class="times">${list.map((e, i) => `<li class="${cur && i === 0 ? 'cur' : ''}"><b>${fmtTime(e.t)}</b><span>${day(e.d)}${e.pen ? ' · 💥 ' + e.pen + '×' : ''}${e.old ? ' · früher' : ''}</span></li>`).join('')}</ol>`;
  }
  // ---------- Menü ----------
  showMenu(env) {
    this.env = env;
    document.body.dataset.mode = 'menu';
    const S = this.store.settings, m = env.meta, lay = env.layout;
    const stunts = {};
    for (const p of lay.pieces) { const t = p.g === 'gorge' ? 'gorge' : p.g === 'drop' ? 'drop' : { tr_bankC: 'bank', cliff2: 'cliff', slope4: 'slope3', tr_corkud: 'spiral' }[p.type] || p.type; if (ICON[t] && (t !== 'straight')) stunts[t] = (stunts[t] || 0) + 1; }
    if (lay.pieces.some((p) => p.type === 'rampUp')) stunts.bridge = lay.pieces.filter((p) => p.type === 'bridge').length;
    if (m.crossings) stunts.bridge = m.crossings;   // 3D: Überführungen
    // Gelände (n22): Elemente aus dem Plan (Tunnel, Brücken entstehen auch von selbst) und den Stück-Markierungen
    if (m.gel && env.track.gel) {
      const pl = env.track.gel.plan.pieces, runs = (f) => pl.filter((q, k) => f(q) && !f(pl[(k - 1 + pl.length) % pl.length] || {})).length;
      const nt = runs((q) => q.tunnel), nb = runs((q) => q.bridge);
      if (nt) stunts.tunnel = nt; if (nb) stunts.bridge = nb;
      const nk = lay.pieces.filter((p) => p.g === 'kuppe').length; if (nk) stunts.kuppe = nk;
      const ntl = lay.pieces.filter((p, k) => p.tilt0 === 0 && p.tilt1).length; if (ntl) stunts.tilt = ntl;
      if (lay.gel && lay.gel.serp && lay.gel.serp.length) stunts.serp = lay.gel.serp.length;
      delete stunts.cliff;
    }
    const stuntTxt = Object.entries(stunts).map(([t, n]) => `<span title="${t === 'bridge' && m.d3 ? 'Überführung' : ICON_NAME[t] || (PIECES[t] ? PIECES[t].name : t)}">${ICON[t]}${n > 1 ? '×' + n : ''}</span>`).join(' ');
    const bests = this.bestsHtml(m.key);
    const today = daySeed();
    const isDay = m.seed === today && m.diff === 2 && !m.imported && !m.sam && (m.gel ? 'gel' : m.d3 ? '3d' : 'flat') === S.trackMode;
    const km = (env.ideal.total / 1000).toFixed(2);
    const metaLine = m.sam
      ? `⭐ Sammlung · ${SAM_DIFF[m.sam.d][0]} ${SAM_DIFF[m.sam.d][1]}${m.diffName ? ' · ' + m.diffName : ''} · ${(m.sam.m / 1000).toFixed(2).replace('.', ',')} km`
      : m.imported
      ? `📂 Importiert${m.diffName ? ' · ' + m.diffName : ''} · ${km} km${m.closed === false ? ' · offen' : ''}`
      : `Code <b>${m.key}</b> · ${m.diffName || ''} · ${km} km${m.d3 ? ` · 3D, ${m.levels} ${m.levels === 1 ? 'Ebene' : 'Ebenen'} hoch` : ''}${m.gel ? ` · <span title="Gelände-Strecke: Höhenunterschied der Fahrbahn">⛰️ ${Math.round(hDiff(env))} m</span>` : ''}`;
    const stuntsHtml = m.imported ? stuntSummary(lay.pieces) : stuntTxt;
    const apLine = m.apTime ? `<div class="tmeta">🤖 Autopilot-Referenz ${fmtTime(m.apTime)}${m.fixes ? ' · ' + m.fixes + '× entschärft' : ''}</div>`
      : m.apFail ? `<div class="tmeta">🤖 Probefahrt ohne Hilfen: ${m.apFail} – Fahrhilfe Leicht hilft</div>` : '';
    $('#menu').innerHTML = `
      <div class="col left">
        <div class="logo">STUNT<b>BAHN</b></div>
        <div class="card track">
          ${!m.imported && !m.sam && env.layout.pieces.length ? '<canvas class="tmap" width="320" height="320" aria-label="Streckenkarte"></canvas>' : ''}
          <div class="tname">${isDay || m.samDay ? '📅 Strecke des Tages<br>' : ''}${m.name || 'Strecke'}</div>
          <div class="tmeta">${metaLine}</div>
          <div class="stunts">${stuntsHtml || 'ohne Stunts'}</div>
          ${apLine}
          <div class="bests">${bests.now}${S.assist === 'easy' ? bests.lastEasy : ''}<span class="bmode">${S.wreck ? '💥 mit Totalschaden' : '↺ Reset +' + PENALTY + ' s'}${S.extras ? ' · 🦘🔥 mit Extras' : ' · ohne Extras'}</span>${bests.old}</div>
        </div>
        <button class="big go" data-a="start">▶ Losfahren</button>
      </div>
      <div class="col right">
        <div class="lbl">Fahrhilfe</div>
        <div class="seg" data-g="assist">${Object.entries(ASSISTS).map(([k, A]) => `<button data-a="assist" data-v="${k}" class="${S.assist === k ? 'on' : ''}">${A.icon} ${A.name}</button>`).join('')}</div>
        <div class="hint">${this.assistHint(S.assist)}</div>
        <div class="lbl">Neue Strecke</div>
        <div class="segrow"><div class="seg" data-g="diff">${[1, 2, 3].map((d) => `<button data-a="diff" data-v="${d}" class="${(S.diff || 2) === d ? 'on' : ''}">${DIFFS[d].name}</button>`).join('')}</div><div class="seg mode" data-g="mode">${MODES.map(([k, ic, nm, tt]) => `<button data-a="mode" data-v="${k}" class="${S.trackMode === k ? 'on' : ''}" aria-pressed="${S.trackMode === k}" aria-label="${nm}" title="${nm}: ${tt}">${ic}</button>`).join('')}</div></div>
        <div class="row">
          <button data-a="random">🎲 Zufall</button>
          <button data-a="today">📅 Tages-Strecke</button>
          <button data-a="code">🔢 Code</button>
        </div>
        <div class="row"><button data-a="trklib">📂 Strecke laden (.TRK)</button></div>
        <div class="row">
          <button data-a="settings">⚙️ Optionen</button>
          <button data-a="help">🎮 Steuerung</button>
          <button data-a="credits">ℹ️ Credits</button>
        </div>
      </div>`;
    this.show('menu');
    const tmap = document.querySelector('#menu canvas.tmap');
    if (tmap) drawLayoutMap(tmap, env.layout, env.track);
    this.wipe(false);
    this.setTouchMode(false);
    $('#hud').classList.remove('show');
    $('#replayui').classList.remove('show');
  }
  assistHint(k) {
    const wreck = this.store.settings.wreck;
    const crash = wreck
      ? { easy: 'Crash? Wrack, dann automatisch 3 s zurück.', medium: 'Crash heißt Wrack, dann 3 s zurück.', original: 'Crash heißt Wrack.' }[k]
      : `Crash? Sofort zurück auf die Fahrbahn, +${PENALTY} s.`;
    return {
      easy: 'Ohne Bestzeit-Wertung – deine Zeit wird nur notiert. Gas und Stunts macht das Auto selbst, deine Bremse geht immer vor. Die Hilfe hält dich auf der Fahrbahn und lenkt einen Teil der Kurven – die Ideallinie triffst du, wenn du etwas mitlenkst (ohne Lenken driftet das Auto in Kurven nach außen und wird langsamer). Drückst du deutlich über den Rand hinaus, hast du Vorrang – auch quer durchs Gelände. Loslassen führt sanft zurück. Abkürzen zählt nicht (zurück an die Stelle). ',
      medium: 'Du lenkst und bremst selbst – die farbige Ideallinie (grün Gas, gelb vom Gas, rot bremsen) und ein kurzer Hinweis „Bremsen!“ mit Ton zeigen, wo. Kein Zug zur Linie, dafür mehr Bodenhaftung als Original. Im Looping und in der Röhre hält eine Spurhilfe die Fahrbahnmitte (deutlich lenken schaltet sie ab). Stabilitätshilfe beim Rutschen, Rückspul-Knopf. ',
      original: 'Keine Hilfen – wie 1990. ',
    }[k] + crash;
  }
  refresh() { if (this.screen === 'menu' && this.env) this.showMenu(this.env); }
  action(a, v) {
    const A = this.a, S = this.store.settings;
    switch (a) {
      case 'start': A.startRace(); break;
      case 'assist': A.setAssist(v); if (this.screen === 'pause') this.showPause(true); break;
      case 'diff': S.diff = +v; this.store.save(); this.refresh(); break;
      case 'random': A.newTrack((Math.random() * 90000 + 1000) | 0, S.diff || 2); break;
      case 'today': A.newTrack(daySeed(), 2); break;
      case 'flat': S.trackMode = v === '1' ? 'flat' : 'gel'; this.store.save(); this.refresh(); break;
      case 'mode': { S.trackMode = v; this.store.save(); this.refresh(); const md = MODES.find((q) => q[0] === v); if (md) this.toast(`${md[1]} ${md[2]}: ${md[3]}`, 2800); break; }
      case 'code': {
        // „4711-2“ = die bisherige (flache) Strecke wie immer, „4711-2-3d“ = Hochstraße (n19), „4711-2-g“ = Gelände (n22);
        // ohne Stufe die gewählte
        const c = prompt('Strecken-Code (z. B. 4711-2-g, 4711-2-3d oder 4711-2):', this.env && !this.env.meta.imported ? this.env.meta.key : '');
        if (c) { const m = /^\s*(\d+)(?:\s*-\s*([123]))?(?:\s*-?\s*(3d|g))?\s*$/i.exec(c); if (m) A.newTrack(+m[1], +(m[2] || S.diff || 2), m[3] ? (m[3].toLowerCase() === 'g' ? 'gel' : '3d') : 'flat'); else this.toast('Ungültiger Code'); }
        break;
      }
      case 'settings': this.showSettings(); break;
      case 'trklib': this.showLibrary(); break;
      case 'trkpick': this.fileInput.click(); break;
      case 'trkplay': A.playImported(v); break;
      case 'samtoggle': this.samToggle(); break;
      case 'samchip': this.samChip(v); break;
      case 'samfilter': this.samSave({ fo: !this.samView().fo }); this.samRender(true); break;
      case 'samreset': { const o = this.samView(); this.store.settings.sam = { ...DEFAULT_VIEW, open: o.open, fo: o.fo, sort: o.sort }; this.store.save(); this.samRender(); break; }
      case 'trkdel': {
        const t = A.trkLib.get(v);
        if (t && confirm(`„${t.name}“ löschen? Bestzeiten und Geisterautos dieser Strecke gehen verloren.`)) A.deleteImported(v);
        break;
      }
      case 'help': this.showHelp(); break;
      case 'credits': this.showCredits(); break;
      case 'close': this.showMenu(this.env); break;
      case 'toggle': S[v] = !S[v]; this.store.save(); if (v === 'sound' && S.sound) A.sound.unlock(); if (v === 'sound' && !S.sound) A.sound.stop(); if (v === 'tilt') A.input.enableTilt(S.tilt); this.showSettings(); break;
      case 'paint': A.setPaint(PAINTS[+v].color); this.showSettings(); break;
      case 'rewind': A.rewind(); break;
      case 'linetoggle': A.toggleLine(); break;
      case 'line': if (S.assist !== 'original') A.setLine(v); if (this.screen === 'pause') this.showPause(true); else this.showSettings(); break;
      case 'cam': A.cycleCam(); break;
      case 'pause': A.pause(); break;
      case 'resume': A.pause(); break;
      case 'restart': this.show(null); A.retry(); break;
      case 'menu': A.toMenu(); break;
      case 'retry': A.retry(); break;
      case 'replay': A.startReplay(); break;
      case 'next': A.newTrack((Math.random() * 90000 + 1000) | 0, S.diff || 2); break;
      case 'rcam': this.replayCam(v); break;
      case 'rplay': this.replay.paused = !this.replay.paused; break;
      case 'rslow': this.replay.speedMul = this.replay.speedMul === 1 ? 0.3 : 1; this.toast(this.replay.speedMul === 1 ? 'Normal' : 'Zeitlupe'); break;
      case 'rend': this.showResult(this.lastRace, this.lastRes, this.env); break;
      case 'cineskip': if (A.skipCine) A.skipCine(); break;
      case 'cine': if (A.replayCine) A.replayCine(); break;
      case 'cliprec': this.lastClip = null; if (A.recordCine) A.recordCine(); break;
      case 'clipshare': if (this.lastClip) shareClip(this.lastClip.blob, this.lastClip.name).then((r) => this.toast(r === 'geteilt' ? '📤 Geteilt' : r === 'gespeichert' ? '💾 Video gespeichert' : 'Abgebrochen')); break;
      case 'tbsize': S.tbsize = v; document.body.dataset.tbsize = v; this.store.save(); this.showSettings(); break;
      case 'blur': S.blur = v; this.store.save(); if (A.quality.post) A.quality.post.autoOff = false; this.showSettings(); break;
      case 'brakehelp': S.brakeHelp = v; this.store.save(); if (window.__game && window.__game.race) window.__game.race.brakeHelp = v; this.showSettings(); break;
      case 'quality': S.quality = v; this.store.save(); A.quality.forced = v === 'auto' ? null : v; if (v !== 'auto') A.quality.tier = +v; dispatchEvent(new Event('resize')); this.showSettings(); break;
      default: break;
    }
  }
  sheet(title, html) {
    $('#sheet').innerHTML = `<div class="card sheetc"><h2>${title}</h2><div class="scroll">${html}</div><button class="big" data-a="close">Zurück</button></div>`;
    this.show('sheet');
  }
  // ---------- Importierte Strecken ----------
  showLibrary(results) {
    const A = this.a, lib = A.trkLib;
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const bests = (id) => { const b = this.bestsHtml(id); return b.now + b.old; };
    let res = '';
    if (results && results.length) {
      const ok = results.filter((r) => r.ok && !r.dup).length, dup = results.filter((r) => r.dup).length, bad = results.filter((r) => r.err);
      res = `<div class="impres${ok || dup ? '' : ' bad'}">${ok ? `✅ ${ok} Strecke${ok > 1 ? 'n' : ''} importiert` : ''}${dup ? ` · ${dup} schon vorhanden` : ''}${bad.map((r) => `<div class="err">⚠️ ${esc(r.name)}: ${esc(r.err)}</div>`).join('')}</div>`;
    }
    const entry = (id, name, sub, del) => `<div class="trk${results && results.some((r) => r.id === id && r.ok) ? ' new' : ''}">
        <canvas width="120" height="120" data-mm="${esc(id)}"></canvas>
        <div class="ti"><b>${esc(name)}</b><small>${sub}</small><div class="tbests">${bests(id)}</div></div>
        <div class="tbtn"><button class="go" data-a="trkplay" data-v="${esc(id)}" aria-label="Fahren">▶ Fahren</button>${del ? `<button data-a="trkdel" data-v="${esc(id)}" aria-label="Löschen">🗑</button>` : ''}</div>
      </div>`;
    const mine = lib.list.map((t) => entry(t.id, t.name, `${esc(t.file || '')} · ${t.added}${t.meta && t.meta.author ? ' · von ' + esc(t.meta.author) : ''}`, true)).join('');
    const demos = A.showcase.map((d) => entry(d.id, d.name, 'eigene Beispielstrecke', false)).join('');
    this._samEntry = (t) => entry(t.id, t.name, this.samSub(t), false).replace('<div class="tbests">', `<div class="tst">${this.samStunts(t)}</div><div class="tbests">`);
    // Sammlung (eigene Strecken, eingeklappt; lädt erst beim Aufklappen). Paket fehlt → Abschnitt weg, ohne Meldung
    const sam = A.sammlung, V = this.samView();
    const samHtml = !sam || sam.failed ? '' : `<div class="sam" id="sam">
        <button class="samhead" data-a="samtoggle" aria-expanded="${V.open ? 'true' : 'false'}"><span><b>⭐ Sammlung (${sam.meta ? sam.meta.count : 250})</b><small>Neue Strecken im Stil der beliebtesten Stunts-Wettbewerbe</small></span><i>${V.open ? '▾' : '▸'}</i></button>
        <div class="sambody"${V.open ? '' : ' hidden'}></div></div>`;
    this.sheet('Strecken laden (.TRK)', `
      ${res}
      <div class="row"><button class="big go" data-a="trkpick">📂 Datei wählen …</button></div>
      <p class="hint">Strecken des Stunt-Klassikers (.TRK), Replays (.RPL, enthalten die Strecke) oder ganze ZIP-Archive.
      <span class="desk">Am Computer auch einfach ins Fenster ziehen.</span> Die Strecken bleiben nur in diesem Browser.
      Quellen: <b>zak.stunts.hu</b> → Downloads (Track-Pack), <b>archive.org</b> → „stunts tracks“.</p>
      <div class="lbl">Meine Strecken (${lib.list.length})</div>
      ${mine || '<p class="hint">Noch keine importiert.</p>'}
      ${samHtml}
      <div class="lbl">Beispiele</div>
      ${demos}`);
    if (V.open && samHtml) this.samRender();
    // nach einem Import den (ersten) neuen Eintrag zeigen
    const fresh = document.querySelector('#sheet .trk.new');
    if (fresh) fresh.scrollIntoView({ block: 'center' });
    // Minikarten erst zeichnen, wenn sie ins Bild scrollen (Bibliothek bis 400 Strecken)
    const draw = (cv) => {
      if (cv.dataset.done) return;
      cv.dataset.done = '1';
      const id = cv.dataset.mm;
      try {
        const bytes = id.startsWith('demo-') ? A.showcaseBytes(id) : id.startsWith('sam-') ? A.sammlung.bytes(id) : lib.bytes(id);
        const trk = parseTrk(bytes, id);
        drawMinimap(cv, trk, trkToLayout(trk).layout);
      } catch (e) {
        const g = cv.getContext('2d'); g.fillStyle = '#402020'; g.fillRect(0, 0, cv.width, cv.height);
        g.fillStyle = '#fff'; g.font = '14px sans-serif'; g.fillText('⚠️ Fehler', 20, 64);
        cv.title = e.message;
      }
    };
    this._mmDraw = draw;
    this.observeMinimaps();
  }
  // Minikarten erst zeichnen, wenn sie ins Bild scrollen (auch nach dem Neuaufbau der Sammlungs-Liste)
  observeMinimaps() {
    const cvs = [...document.querySelectorAll('#sheet canvas[data-mm]:not([data-done])')];
    if (typeof IntersectionObserver === 'undefined') { cvs.forEach(this._mmDraw); return; }
    if (!this._mmObs || this._mmRoot !== document.querySelector('#sheet .scroll')) {
      if (this._mmObs) this._mmObs.disconnect();
      this._mmRoot = document.querySelector('#sheet .scroll');
      this._mmObs = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { this._mmDraw(e.target); this._mmObs.unobserve(e.target); } }, { root: this._mmRoot, rootMargin: '200px' });
    }
    cvs.forEach((cv) => this._mmObs.observe(cv));
  }
  // ---------- Sammlung ----------
  samView() { return { ...DEFAULT_VIEW, ...(this.store.settings.sam || {}) }; }
  samSave(patch) { this.store.settings.sam = { ...this.samView(), ...patch }; this.store.save(); }
  samSub(t) {
    const m = this.a.sammlung.meta;
    return `${SAM_DIFF[t.d][0]} ${SAM_DIFF[t.d][1]} · ${(t.m / 1000).toFixed(2).replace('.', ',')} km (${lengthClass(t.m, m.lengthBounds)}) · ${HORIZONS[t.h]}`;
  }
  samStunts(t) { return Object.entries(t.st || {}).filter(([k]) => SAM_STUNTS[k]).map(([k, n]) => `<span title="${SAM_STUNTS[k][1]}">${SAM_STUNTS[k][0]}${n > 1 ? '×' + n : ''}</span>`).join(' '); }
  samCtx() {
    const S = this.store.settings;
    return {
      // Leicht hat keine Bestzeit (n15) → Sortierung „eigene Bestzeit“ nimmt dort die bessere aus Mittel/Original
      best: (id) => S.assist !== 'easy' ? this.store.bestFor(id, S.assist) : [this.store.bestFor(id, 'medium'), this.store.bestFor(id, 'original')].filter(Boolean).sort((a, b) => a.time - b.time)[0] || null,
      hasBest: (id) => ['medium', 'original'].some((k) => this.store.bestFor(id, k)),
      played: S.samPlayed || {}, lengthBounds: this.a.sammlung.meta.lengthBounds,
    };
  }
  async samToggle() {
    const open = !this.samView().open;
    this.samSave({ open });
    const box = document.getElementById('sam');
    if (!box) return;
    box.querySelector('.samhead').setAttribute('aria-expanded', open ? 'true' : 'false');
    box.querySelector('.samhead i').textContent = open ? '▾' : '▸';
    box.querySelector('.sambody').hidden = !open;
    if (open) this.samRender();
  }
  samChip(v) {
    const [g, x] = v.split(':');
    const V = this.samView();
    if (g === 'never' || g === 'mine') this.samSave({ [g]: !V[g] });
    else {
      const val = g === 'd' || g === 'h' ? +x : x;
      const arr = V[g].includes(val) ? V[g].filter((y) => y !== val) : [...V[g], val];
      this.samSave({ [g]: arr });
    }
    this.samRender(true);
  }
  // Inhalt des aufgeklappten Abschnitts (lädt das Paket beim ersten Mal); listOnly: nur Chips + Liste neu
  async samRender(listOnly = false) {
    const sam = this.a.sammlung, box = document.getElementById('sam');
    if (!box) return;
    const body = box.querySelector('.sambody');
    if (!sam.ready) {
      body.innerHTML = '<p class="hint">Sammlung wird geladen …</p>';
      await sam.load();
      if (!sam.ready) { box.remove(); return; }          // Paket fehlt: Abschnitt ausblenden, keine Meldung
      if (!document.getElementById('sam')) return;
      box.querySelector('.samhead b').textContent = `⭐ Sammlung (${sam.meta.count})`;
    }
    const V = this.samView(), ctx = this.samCtx(), meta = sam.meta;
    const list = filterSort(sam.list, V, ctx);
    const chip = (g, val, label, on, title = '') => `<button class="chip${on ? ' on' : ''}" data-a="samchip" data-v="${g}:${val}" aria-pressed="${on ? 'true' : 'false'}"${title ? ` title="${title}"` : ''}>${label}</button>`;
    const km = (x) => (x / 1000).toFixed(1).replace('.', ',');
    const hs = [...new Set(sam.list.map((t) => t.h))].sort((a, b) => a - b);
    const nOn = V.d.length + V.len.length + V.st.length + V.h.length + (V.never ? 1 : 0) + (V.mine ? 1 : 0);
    const head = `<div class="samcount"><button class="samfbtn${nOn ? ' on' : ''}" data-a="samfilter" aria-expanded="${V.fo ? 'true' : 'false'}">⚙️ Filter${nOn ? ` (${nOn})` : ''} ${V.fo ? '▾' : '▸'}</button><span>${list.length} von ${sam.list.length}</span>${V.q || nOn ? '<button data-a="samreset">Zurücksetzen</button>' : ''}</div>`;
    const chips = head + `<div class="chips"${V.fo ? '' : ' hidden'}>
        <div class="cg"><span>Schwierigkeit</span>${[1, 2, 3].map((d) => chip('d', d, SAM_DIFF[d][0] + ' ' + SAM_DIFF[d][1], V.d.includes(d))).join('')}</div>
        <div class="cg"><span>Länge</span>${chip('len', 'kurz', 'kurz', V.len.includes('kurz'), `unter ${km(meta.lengthBounds[0])} km`)}${chip('len', 'mittel', 'mittel', V.len.includes('mittel'), `${km(meta.lengthBounds[0])}–${km(meta.lengthBounds[1])} km`)}${chip('len', 'lang', 'lang', V.len.includes('lang'), `ab ${km(meta.lengthBounds[1])} km`)}</div>
        <div class="cg"><span>Enthält</span>${Object.entries(SAM_STUNTS).map(([k, [ic, n]]) => chip('st', k, ic + ' ' + n, V.st.includes(k))).join('')}</div>
        <div class="cg"><span>Landschaft</span>${hs.map((h) => chip('h', h, HORIZONS[h], V.h.includes(h))).join('')}</div>
        <div class="cg"><span>Meine</span>${chip('never', 1, 'noch nie gefahren', V.never)}${chip('mine', 1, 'mit meiner Bestzeit', V.mine)}</div>
      </div>`;
    const rows = list.length ? list.map(this._samEntry).join('') : '<p class="hint">Keine Strecke passt – Filter lockern.</p>';
    if (listOnly && body.querySelector('.samres')) {
      body.querySelector('.samres').innerHTML = chips + `<div class="samlist">${rows}</div>`;
    } else {
      const day = sam.today();
      body.innerHTML = `
        <div class="samday"><div class="lbl">📅 Strecke des Tages</div>${this._samEntry(day)}</div>
        <p class="hint samlink">Original-Strecken der Community: auf <a href="https://zak.stunts.hu/tracks" target="_blank" rel="noopener">zak.stunts.hu</a> laden und hier importieren (.TRK oder .ZIP)</p>
        <div class="samctl">
          <input type="search" class="samq" placeholder="🔍 Name suchen" value="${String(V.q).replace(/"/g, '&quot;')}" enterkeyhint="search" autocomplete="off" aria-label="Sammlung nach Namen durchsuchen">
          <label class="samsort"><span>Sortieren</span><select class="samsel" aria-label="Sortierung">${Object.entries(SAM_SORTS).map(([k, n]) => `<option value="${k}"${V.sort === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>
        <div class="samres">${chips}<div class="samlist">${rows}</div></div>`;
      const qi = body.querySelector('.samq');
      qi.addEventListener('input', () => { this.samSave({ q: qi.value }); clearTimeout(this._samT); this._samT = setTimeout(() => this.samRender(true), 120); });
      qi.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') qi.blur(); });
      body.querySelector('.samsel').addEventListener('change', (e) => { this.samSave({ sort: e.target.value }); this.samRender(true); });
    }
    this.observeMinimaps();
  }
  showSettings() {
    const S = this.store.settings;
    const onoff = (k, label) => `<button data-a="toggle" data-v="${k}" class="${S[k] ? 'on' : ''}">${S[k] ? '✅' : '⬜'} ${label}</button>`;
    this.sheet('Optionen', `
      <div class="row">${onoff('sound', 'Ton')}${onoff('ghost', 'Geisterauto')}${onoff('tilt', 'Lenken durch Neigen')}</div>
      <div class="lbl">Tastengröße (Handy, Mittel/Original)</div>
      <div class="seg" data-g="tbsize">${[['normal', 'Normal'], ['gross', 'Groß'], ['riesig', 'Riesig']].map(([k, n]) => `<button data-a="tbsize" data-v="${k}" class="${(S.tbsize || 'gross') === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="lbl">Extras</div>
      <div class="row">${onoff('extras', '🦘🔥 Hüpfer & Nitro')}${S.extras ? onoff('autoExtras', '🤖 Extras automatisch (Leicht)') : ''}</div>
      <p class="hint">${S.extras
        ? `Je Runde <b>1× Hüpfer</b> (🦘, ~3,5 m hoch, nur mit Bodenkontakt, nicht in Looping/Röhre/Korkenzieher/an Schanzen) und <b>1× Nitro</b> (🔥, ${NITRO.dur} s kräftiger Schub). An Start/Ziel wieder voll. <span class="desk">Leertaste / Shift oder N, </span>Gamepad B / RB.${S.autoExtras ? ' Auf <b>Leicht</b> zündet der Autopilot den Nitro auf der längsten Geraden und hüpft nur, wo es sicher ist (über Bodenwellen) – du kannst jederzeit selbst drücken.' : ''}`
        : '<b>Aus:</b> ohne Hüpfer und Nitro wie im Original. Bestzeiten mit und ohne Extras werden getrennt gezählt.'}</p>
      <div class="lbl">Bremshilfe (Mittel)</div>
      <div class="seg" data-g="brakehelp">${Object.entries(BRAKE_HELP_MODES).map(([k, n]) => `<button data-a="brakehelp" data-v="${k}" class="${(S.brakeHelp || 'hint') === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <p class="hint">${{ off: '<b>Aus:</b> keine Anzeige, kein Eingriff – nur die farbige Ideallinie.', hint: '<b>Hinweis</b> (Standard): Kurz „Bremsen!“ mit Ton, wenn du vor einer Kurve oder einem Stunt zu schnell bist. Die Hilfe bremst nie selbst.', soft: '<b>Sanft:</b> wie Hinweis; zusätzlich bremst die Hilfe leicht mit, wenn du deutlich zu schnell bist (> 15 %) und nicht Vollgas gibst. Vollgas gibt sie sofort frei.' }[S.brakeHelp || 'hint']}</p>
      <div class="lbl">Replay</div>
      <div class="row">${onoff('cine', '🎬 Kino-Replay nach dem Ziel')}</div>
      <p class="hint">${S.cine ? '<b>An</b> (Standard): Nach dem Zieleinlauf läuft ein kurzer Highlight-Film (15–30 s) mit den besten Momenten deiner Fahrt – Zeitlupe, Drohne, Action-Cam, Tele. Antippen überspringt ihn, danach kommt das Ergebnis.' : '<b>Aus:</b> Nach dem Ziel gleich das Ergebnis. Den Film gibt es dort weiter über „🎬 Highlights“.'} Das Replay der ganzen Fahrt (📼) bleibt.</p>
      <div class="lbl">Crash</div>
      <div class="row">${onoff('wreck', '💥 Totalschaden')}</div>
      <p class="hint">${S.wreck
        ? '<b>An:</b> Crash heißt Wrack wie im Original (Leicht/Mittel: danach 3 s zurückgespult).'
        : `<b>Aus</b> (empfohlen): Crash → sofort zurück auf die Fahrbahn vor dem Stunt, mit Schwung, <b>+${PENALTY} s</b> Zeitstrafe.`}
      Gilt für alle Fahrhilfen; Bestzeiten und Geisterautos werden getrennt gezählt.</p>
      <div class="lbl">Ideallinie</div>
      ${this.lineSeg()}
      <p class="hint">${S.assist === 'original'
        ? 'Auf <b>Original</b> gibt es keine Ideallinie – die Einstellung gilt für Leicht und Mittel.'
        : 'Farbiges Band auf der Fahrbahn wie bei Forza (grün Gas, gelb Gas weg, orange bis rot bremsen – je dunkler, desto stärker –, blau Luft; berechnet aus dem Tempo-Profil): außen anfahren, innen am Scheitel, außen raus. Keile am Innenrand markieren die Scheitelpunkte. Nur die Anzeige – die Lenkhilfe bleibt gleich.'}
      Im Rennen umschalten: Knopf oben rechts, <span class="desk">Taste <b>L</b>, </span>Gamepad <b>Back</b>.</p>
      <div class="lbl">Lackfarbe</div>
      <div class="row">${PAINTS.map((p, i) => `<button data-a="paint" data-v="${i}" class="sw ${S.paint === p.color ? 'on' : ''}" style="--c:#${p.color.toString(16).padStart(6, '0')}">${p.name}</button>`).join('')}</div>
      <div class="lbl">Grafik</div>
      <div class="row">${[['auto', 'Automatisch'], ['0', 'Einfach'], ['1', 'Standard'], ['2', 'Kino']].map(([v, n]) => `<button data-a="quality" data-v="${v}" class="${String(S.quality || 'auto') === v ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="lbl">Bewegungsunschärfe</div>
      <div class="seg" data-g="blur">${Object.entries(BLUR_LEVELS).map(([k, L]) => `<button data-a="blur" data-v="${k}" class="${(S.blur || 'light') === k ? 'on' : ''}">${L.name}</button>`).join('')}</div>
      <p class="hint">Verwischt die Umgebung ab ~80 km/h (mit Nitro stärker), das Auto bleibt scharf. Nicht auf Grafik „Einfach“ – dort nur Tempo-Streifen am Rand. Ruckelt es, schaltet die Automatik sie zuerst ab.</p>
      <p class="hint"><b>Grafik:</b> Einfach = schlank wie früher · Standard = Kino-Look fürs Handy (Licht, Farbe, Glanz, Dunst, schärferes Hochrechnen) · Kino = dazu Schattentiefe, Kantenglättung, Hitzeflimmern. Automatisch passt Auflösung und Stufe der Bildrate an.</p>`);
  }
  showHelp() {
    this.sheet('Steuerung', `
      <p><b>Handy (quer oder hochkant):</b> Fahrhilfe <i>Leicht</i>: linke/rechte Bildschirmhälfte halten zum Lenken – Gas macht das Auto. Oder in den Optionen „Lenken durch Neigen“ (hochkant: seitlich kippen oder wie ein Lenkrad drehen). Drehst du das Handy im Rennen, pausiert es kurz – weiter mit „▶ Weiter“.</p>
      <p><b>Leicht:</b> Die Hilfe hält das Auto sicher auf der Fahrbahn und lenkt einen Teil jeder Kurve. Die Ideallinie triffst du, wenn du in Kurven etwas mitlenkst – ohne Lenken driftet das Auto nach außen und verliert Zeit. Drückst du deutlich über den Rand hinaus (kurz halten), hast <b>du Vorrang</b>: Die Hilfe lässt los, du kannst die Fahrbahn verlassen und durchs Gelände fahren. Loslassen – die Hilfe blendet weich ein und führt dich sanft zurück. Deine Bremse geht immer vor. Loopings, Röhren, Korkenzieher und Sprünge lenkt weiter das Auto; vorher steht oben „… voraus – Autopilot lenkt“. Gilt für Tastatur, Gamepad, Touch und Neigen.</p>
      <p><b>Mittel:</b> Du lenkst selbst – kein Zug zur Ideallinie. Das Auto hat mehr Bodenhaftung als auf Original, rutscht aber, wenn du zu schnell in die Kurve fährst. Im Looping und in der Röhre hält eine Spurhilfe die Fahrbahnmitte (oben „Looping – Spurhilfe“); deutliches Lenken schaltet sie sofort ab.</p>
      <p><i>Mittel/Original</i>: links ◀ ▶ lenken, rechts GAS und BREMSE (hochkant alle unten in einer Reihe). Bremse im Stand = Rückwärtsgang.</p>
      <p><b>Tastatur:</b> Pfeile oder WASD (bremsen: Pfeil runter/S), <b>Leertaste</b> Hüpfer, <b>Shift</b> oder <b>N</b> Nitro, <b>R</b> zurückspulen, <b>C</b> Kamera (Verfolger, Cockpit, Hubschrauber, Stoßstange, Strecke), <b>L</b> Ideallinie ein/aus, <b>Esc</b> Pause.</p>
      <p><b>Gamepad:</b> linker Stick lenken, RT/A Gas, LT/X Bremse, <b>B</b> Hüpfer, <b>RB</b> Nitro, Y zurückspulen, LB Kamera, Back Ideallinie, Start Pause.</p>
      <p><b>Extras 🦘 🔥</b> (je 1 pro Runde, an Start/Ziel wieder voll): <b>Hüpfer</b> – das Auto springt aus der Fahrt ~3,5 m hoch und bleibt dabei waagrecht; nur mit Bodenkontakt, in Looping, Röhre, Korkenzieher und an Schanzen gesperrt (Knopf ausgegraut). <b>Nitro</b> – ${NITRO.dur} s lang deutlich mehr Schub (+70–80 % Beschleunigung, bis ~700 km/h), danach sanft zurück. Handy: runde Knöpfe über den Daumen (links 🦘, rechts 🔥). Abschaltbar in den Optionen.</p>
      <p><b>Crash:</b> Standardmäßig kein Totalschaden – das Auto steht sofort wieder auf der Fahrbahn vor dem Stunt, mit Schwung, und du bekommst <b>+${PENALTY} s</b> auf die Zeit. Klappt ein Stunt mehrmals nicht, wirst du dahinter gesetzt (auch dann je +${PENALTY} s). Wer es hart mag: Optionen → <b>💥 Totalschaden</b> (Wrack wie im Original).</p>
      <p><b>⏪ Zurückspulen</b> (Leicht/Mittel): 3 s zurück, um einen Crash zu vermeiden. Ohne Totalschaden läuft die Uhr dabei weiter – es kostet die Zeit, die du neu fährst, aber keine Strafe.</p>
      <p><b>Ziel:</b> Alle Checkpoints der Reihe nach, dann über die Ziellinie. Bestzeiten und Geisterautos gibt es auf <i>Mittel</i> und <i>Original</i>, getrennt je Fahrhilfe und Totalschaden-Einstellung. Auf <i>Leicht</i> wird nur deine Zeit notiert (die letzten 5 je Strecke, mit Datum) – ohne Bestzeit und Geisterauto.</p>
      <p><b>Abkürzen</b> lohnt nicht (alle Stufen): Wer quer durchs Gelände Strecke spart, wird an die Stelle zurückgesetzt, an der er die Fahrbahn verlassen hat – die Uhr läuft weiter. Herumfahren im Gelände ist erlaubt; wer sich zu weit entfernt, sieht „Zurück zur Strecke ↺“ und wird nach einigen Sekunden zurückgesetzt.</p>`);
  }
  showCredits() {
    this.sheet('Credits', `
      <p><b>Stuntbahn</b> – ein Stunt-Rennspiel als Hommage an die Klassiker der frühen 90er. Eigener Code, eigene Strecken-Bausteine.</p>
      <p><b>Auto:</b> „Fictional supercar – V12 Goblin“ von <b>Olli Teittinen (ollitei)</b>, Lizenz <b>CC-BY 4.0</b>, sketchfab.com/3d-models/fictional-supercar-v12-goblin-0a20e49ad5774d778567cb5c3f345786 (für das Spiel optimiert: Materialien umgewandelt, Geometrie vereinfacht).</p>
      <p><b>Himmel & Licht:</b> „Kloofendal 48d Partly Cloudy (Pure Sky)“ von Greg Zaal & Jarod Guest – Poly Haven, CC0.</p>
      <p><b>Texturen (Poly Haven, CC0):</b> Asphalt 02, Concrete Floor 02, Metal Plate (Rob Tuytel) · Leafy Grass, Gravel Concrete 03 (Charlotte Baglioni) · Fir Tree 01 (Rob Tuytel, Rico Cilliers) → daraus zusammengesetzte Baumkarten.</p>
      <p><b>Umgebung (Poly Haven, CC0):</b> Tree Small 02 (Rico Cilliers) · Island Tree 01, Celandine 01, Grass Medium 01, Dandelion 01 (Rob Tuytel, Rico Cilliers) · Searsia Lucida (James Ray Cock, Jenelle van Heerden) · Rock Moss Set 01 (Kless Gyzen) · Gravel Floor 02 (Jenelle van Heerden, Dimitrios Savva). Werbebanner zeigen erfundene Marken.</p>
      <p><b>Technik:</b> three.js (MIT). Physik, Strecken, Generator, Ton: eigener Code.</p>
      <p>Build ${this.app.build}</p>`);
  }
  // ---------- Rennen ----------
  showHud(race, env) {
    this.env = env;
    this.lastClip = null;
    document.body.dataset.mode = 'race';
    this.show(null);
    $('#hud').classList.add('show');
    $('#replayui').classList.remove('show');
    const A = ASSISTS[this.store.settings.assist];
    $('#hud .assistTag').textContent = A.icon + ' ' + A.name;
    $('#hud [data-a=rewind]').style.display = this.store.settings.assist === 'original' ? 'none' : '';
    this.lineChanged();
    this.hudBest(race, env);
    $('#hud .pen').textContent = '';
    this._pen = 0;
    this._x = null;
    $('#hud').classList.toggle('noextras', !race.extrasOn);
    this.wipe(false);
    this.setTouchMode(true);
    this.lastCd = null;
  }
  // Leicht: keine Bestzeit, stattdessen die letzte Zeit auf dieser Strecke
  hudBest(race, env) {
    const k = this.store.settings.assist;
    if (k === 'easy') { const l = this.store.timesFor(env.meta.key)[0]; $('#hud .best').textContent = l ? 'Zuletzt ' + fmtTime(l.t) : ''; return; }
    const b = this.store.bestFor(env.meta.key, k, race.wreckOn);
    $('#hud .best').textContent = b ? 'Beste ' + fmtTime(b.time) : '';
  }
  hud(race, env, ghost) {
    // Hinweis-Zeile: Stunt-Ansage (Leicht: „Looping voraus – Autopilot lenkt“) bzw. „Zurück zur Strecke ↺“
    const hd = race.state === 'running' && race.hud ? race.hud : null, ht = hd ? hd.text : '';
    if (ht !== this._hint) {
      this._hint = ht;
      const E = $('#hud .hint2');
      if (ht) E.textContent = (hd.kind === 'stunt' ? '🤖 ' : hd.kind === 'brake' ? '▼ ' : hd.kind === 'lane' ? '🛣️ ' : '') + ht;
      E.className = 'hint2' + (ht ? ' show ' + hd.kind : '');
    }
    const t = race.state === 'countdown' ? 0 : race.time;
    if (this._ht !== Math.floor(t * 20)) {
      this._ht = Math.floor(t * 20);
      $('#hud .time').textContent = fmtTime(t);
      const kmh = Math.round(Math.abs(race.car.fwdSpeed()) * 3.6);
      $('#hud .speed b').textContent = kmh;
      $('#hud .gear').textContent = race.car.fwdSpeed() < -0.5 ? 'R' : race.car.gear;
      $('#hud .cp').textContent = race.cps.length ? `CP ${Math.min(race.cpNext, race.cps.length)}/${race.cps.length}` : '';
    }
    // Extras-Knöpfe: voll / verbraucht (grau) / gerade gesperrt (grau) / Nitro brennt (Ring = Restzeit)
    const X = race.xstate();
    const hs = X.hop === 'off' ? 'off' : X.hop === 'empty' ? 'empty' : X.hop && X.hop !== 'wait' ? 'lock' : 'ok';
    const key = hs + '|' + X.nitro + '|' + (X.nitro === 'on' ? Math.round(X.left * 40) : 0);
    if (key !== this._x) {
      this._x = key;
      const H = $('#hud .xb.hop'), N = $('#hud .xb.nitro');
      H.className = 'xb hop ' + hs + (H.classList.contains('glow') ? ' glow' : '') + (H.classList.contains('press') ? ' press' : '');
      N.className = 'xb nitro ' + X.nitro + (N.classList.contains('glow') ? ' glow' : '') + (N.classList.contains('press') ? ' press' : '');
      N.style.setProperty('--p', X.nitro === 'on' ? X.left.toFixed(3) : '0');
      H.setAttribute('aria-disabled', hs === 'ok' ? 'false' : 'true');
      N.setAttribute('aria-disabled', X.nitro === 'ok' ? 'false' : 'true');
    }
    if (this._pen !== race.penalties) {
      this._pen = race.penalties;
      $('#hud .pen').textContent = race.penalties ? `inkl. +${race.penalties * PENALTY} s Strafe` : '';
    }
    if (race.state === 'countdown') {
      const n = Math.ceil(race.countdown);
      if (n !== this.lastCd && n <= 3 && n > 0) { this.lastCd = n; this.big(String(n), 'count', 800); }
    }
  }
  event(e, race) {
    if (e.type === 'go') this.big('LOS!', 'go', 800);
    else if (e.type === 'checkpoint') this.big(`Checkpoint ${e.n}/${e.of}<small>${fmtTime(e.t)}</small>`, 'cp', 1100);
    else if (e.type === 'crash' && e.penalty) { this.big(`+${e.penalty} s<small>💥 ${e.reason}</small>`, 'pen', 1600); this.wipe(true); }
    else if (e.type === 'crash') this.big(`💥 ${e.reason}`, 'crash', 1400);
    else if (e.type === 'rewind') { this.toast(e.keepClock ? '⏪ Zurückgespult – Uhr läuft weiter' : '⏪ Zurückgespult'); if (e.keepClock) this.flash(); }
    else if (e.type === 'reset') { this.wipe(false); if (!race.wreckOn) return; this.toast('Zurück auf die Strecke'); }
    else if (e.type === 'skip') { this.wipe(false); this.toast('⏭ Stelle übersprungen', 1800); }
    else if (e.type === 'shortcut') { this.wipe(false); this.big('Abkürzung ↺<small>zurück an die Stelle, wo du die Strecke verlassen hast</small>', 'crash', 1800); }
    else if (e.type === 'nitro') this.big('🔥 NITRO', 'nitro', 900);
    else if (e.type === 'refill') {
      this.toast('🦘 🔥 wieder voll');
      for (const b of document.querySelectorAll('#hud .xb')) { b.classList.remove('glow'); void b.offsetWidth; b.classList.add('glow'); }
      clearTimeout(this._gt); this._gt = setTimeout(() => { for (const b of document.querySelectorAll('#hud .xb')) b.classList.remove('glow'); this._x = null; }, 1300);
    } else if (e.type === 'xdenied') {
      const T = {
        empty: e.k === 'hop' ? '🦘 Hüpfer verbraucht – an Start/Ziel wieder voll' : '🔥 Nitro verbraucht – an Start/Ziel wieder voll',
        lock: '🦘 Nicht in Looping, Röhre, Korkenzieher oder an der Schanze', air: '🦘 Hüpfer nur mit Bodenkontakt', roof: '🦘 Zu wenig Platz nach oben', tilt: '🦘 Fahrbahn zu schräg',
      };
      if (T[e.why]) this.toast(T[e.why], 1600);
    }
  }
  // Nitro-Effekt über dem Bild (Tempo-Streifen statt teurer Bewegungsunschärfe), 0 … 1
  // lines: reine Tempo-Streifen ohne Nitro-Glut (Grafik „Einfach“ statt Bewegungsunschärfe), 0 … 1
  boost(level, lines = 0) {
    const v = Math.max(level > 0.01 ? Math.round(level * 20) / 20 : 0, lines > 0.02 ? Math.round(lines * 20) / 20 : 0);
    const pure = level <= 0.01 && v > 0;
    if (v === this._boost && pure === this._pure) return;
    this._boost = v; this._pure = pure;
    const B = $('#boostfx');
    B.style.opacity = (v * 0.85).toFixed(2);
    B.classList.toggle('on', v > 0);
    B.classList.toggle('pure', pure);
  }
  // Fahrhilfe im Rennen gewechselt: HUD + Touch-Modus anpassen
  assistChanged() {
    const k = this.store.settings.assist, A = ASSISTS[k];
    $('#hud .assistTag').textContent = A.icon + ' ' + A.name;
    $('#hud [data-a=rewind]').style.display = k === 'original' ? 'none' : '';
    this.lineChanged();
    if (document.body.dataset.mode === 'race') { this.setTouchMode(true); if (window.__game && window.__game.race) this.hudBest(window.__game.race, this.env); }
  }
  // Auswahl „Ideallinie“ (Optionen + Pause); auf Original ausgegraut
  lineSeg() {
    const S = this.store.settings, off = S.assist === 'original';
    return `<div class="seg${off ? ' dis' : ''}" data-g="line">${Object.entries(LINE_LEVELS).map(([k, L]) => `<button data-a="line" data-v="${k}" class="${S.line === k ? 'on' : ''}"${off ? ' disabled' : ''}>${L.name}</button>`).join('')}</div>`;
  }
  // HUD-Knopf: auf Original weg, sonst „an/aus“ nach aktueller Stufe
  lineChanged() {
    const S = this.store.settings, B = $('#hud [data-a=linetoggle]');
    B.style.display = S.assist === 'original' ? 'none' : '';
    B.classList.toggle('off', S.line === 'off');
    B.setAttribute('aria-pressed', S.line === 'off' ? 'false' : 'true');
  }
  showPause(on) {
    if (!on) { this.show(null); return; }
    const S = this.store.settings;
    $('#pause').innerHTML = `<div class="card"><h2>Pause</h2>
      <button class="big go" data-a="resume">▶ Weiter</button>
      <div class="lbl">Fahrhilfe (wirkt sofort)</div>
      <div class="seg">${Object.entries(ASSISTS).map(([k, A]) => `<button data-a="assist" data-v="${k}" class="${S.assist === k ? 'on' : ''}">${A.icon} ${A.name}</button>`).join('')}</div>
      <div class="lbl">Ideallinie${S.assist === 'original' ? ' (nicht auf Original)' : ''}</div>
      ${this.lineSeg()}
      <div class="row"><button data-a="restart">🔁 Neustart</button><button data-a="menu">☰ Menü</button></div></div>`;
    this.show('pause');
  }
  showResult(race, res, env) {
    this.lastRace = race; this.lastRes = res; this.env = env;
    document.body.dataset.mode = 'result';
    this.setTouchMode(false);
    $('#hud').classList.remove('show');
    $('#replayui').classList.remove('show');
    const A = ASSISTS[race.assistKey];
    this.wipe(false);
    const pen = race.penalties ? `<div class="rpen">💥 ${race.penalties} Strafe${race.penalties > 1 ? 'n' : ''} × ${PENALTY} s = +${race.penalties * PENALTY} s</div>` : (race.wreckOn ? '' : '<div class="rpen ok">✨ Ohne Crash – keine Strafzeit</div>');
    // Leicht (n15): keine Bestzeit-Wertung – „Deine Zeit“ und die letzten Zeiten auf dieser Strecke
    // A/B-Vergleich per URL (n21): keine Wertung
    const best = res.easy ? this.timesHtml(res.list, true) : res.ab ? '<div class="prev">A/B-Vergleich (Link-Zusatz) – keine Bestzeit</div>' : res.isBest ? '<div class="rec">🏆 Neue Bestzeit!</div>' : (res.prev ? `<div class="prev">Bestzeit ${fmtTime(res.prev)} (${(res.time - res.prev >= 0 ? '+' : '') + (res.time - res.prev).toFixed(2).replace('.', ',')} s)</div>` : '');
    $('#result').innerHTML = `<div class="card"><h2>🏁 Ziel!</h2>${res.easy ? '<div class="ryour">Deine Zeit</div>' : ''}
      <div class="rtime">${fmtTime(res.time)}</div>${pen}${best}
      <div class="rmeta">${A.icon} ${A.name} · ${race.wreckOn ? '💥 Totalschaden an' : 'Totalschaden aus'} · ${race.extrasOn ? `Extras: 🦘 ${race.used.hop ? '✓' : '–'} 🔥 ${race.used.nitro ? '✓' : '–'}` : 'ohne Extras'} · ${env.meta.name} (${env.meta.key}) · Crashs ${race.crashes}${race.rewinds ? ' · Rückspulen ' + race.rewinds : ''}</div>
      <div class="row"><button class="big go" data-a="retry">🔁 Nochmal</button><button data-a="replay">📼 Replay</button>${race.film ? '<button data-a="cine">🎬 Highlights</button>' : ''}</div>
      <div class="row">${race.film && clipMime() ? (this.lastClip ? `<button data-a="clipshare">📤 Video (${(this.lastClip.blob.size / 1e6).toFixed(1).replace('.', ',')} MB)</button>` : '<button data-a="cliprec">🎥 Als Video</button>') : ''}<button data-a="next">🎲 Neue Strecke</button><button data-a="menu">☰ Menü</button></div></div>`;
    this.show('result');
  }
  showReplay(replay) {
    this.replay = replay;
    document.body.dataset.mode = 'replay';
    this.show(null);
    $('#hud').classList.remove('show');
    const R = $('#replayui');
    R.classList.add('show');
    this._rpen = 0; this._rsec = 0; this._rtxt = '';
    $('.btns', R).innerHTML = [['chase', '🚗 Ver&shy;folger'], ['cockpit', '🏁 Cockpit'], ['far', '🚁 Hub&shy;schrauber'], ['track', '📹 Strecke'], ['bumper', '🎯 Stoß&shy;stange']]
      .map(([m, n]) => { const [ic, ...w] = n.split(' '); return `<button data-a="rcam" data-v="${m}"><i>${ic}</i> <span>${w.join(' ')}</span></button>`; }).join('')
      + '<button data-a="rplay" aria-label="Pause/Weiter">⏯</button><button data-a="rslow" aria-label="Zeitlupe">🐢</button><button data-a="rend" aria-label="Replay beenden">✕</button>';
    this.replayCamMark('chase');
  }
  // ---------- Kino-Replay (n18) ----------
  showCine(c) {
    this.cineObj = c; this._cineT0 = performance.now(); this._capClip = -1;
    document.body.dataset.mode = 'cine';
    this.show(null);
    this.setTouchMode(false);
    $('#hud').classList.remove('show');
    $('#replayui').classList.remove('show');
    this.wipe(false);
    const C = $('#cine');
    C.querySelector('.cap').className = 'cap';
    C.querySelector('.ctag').textContent = c.rec ? '● REC · Highlights' : '🎬 Highlights';
    C.classList.toggle('rec', !!c.rec);
    this._capShow = 0; this._capText = '';
    C.classList.add('show');
    requestAnimationFrame(() => C.classList.add('on'));   // Balken fahren ein
  }
  // Einblendung fürs Video (cliprec.js): Text und Deckkraft wie im CSS (0,35 s ein, 2,8 s stehen, 0,35 s aus)
  capState() {
    const t = (performance.now() - (this._capShow || 0)) / 1000;
    const a = !this._capShow ? 0 : t < 0.35 ? t / 0.35 : t < 2.8 ? 1 : Math.max(0, 1 - (t - 2.8) / 0.35);
    return { text: this._capText, a, fin: this._capFin, center: innerHeight > innerWidth };
  }
  hideCine() { const C = $('#cine'); C.classList.remove('show', 'on'); const W = $('#wipe'); W.style.opacity = '0'; W.style.background = ''; this.cineObj = null; }
  // je Bild: Fortschritt, Einblendung zum Beginn der Zeitlupe, kurze Abblende an den Schnitten
  cineHud(c) {
    const P = c.player, C = $('#cine');
    const pr = (P.progress() * 100).toFixed(1) + '%';
    if (pr !== this._cpr) { this._cpr = pr; C.querySelector('.cbar i').style.width = pr; }
    const cl = P.clip;
    if (cl && P.ci !== this._capClip && P.t >= cl.c0 - 0.35) {
      this._capClip = P.ci;
      const E = C.querySelector('.cap');
      E.textContent = cl.kind === 'finish' && c.res ? `🏁 Ziel · ${fmtTime(c.res.time)}` : cl.label;
      E.className = 'cap'; void E.offsetWidth; E.className = 'cap show' + (cl.kind === 'finish' ? ' fin' : '');
      this._capShow = performance.now(); this._capText = E.textContent; this._capFin = cl.kind === 'finish';
      clearTimeout(this._capT); this._capT = setTimeout(() => { E.className = 'cap'; }, 2800);
    }
    // Schwarzblende: 0,15 s vor/nach jedem Clip-Wechsel (Filmzeit, aus der Aufzeichnungszeit des Clips grob geschätzt)
    const W = $('#wipe'), a = cl ? Math.max(0, 1 - (P.t - cl.a) / 0.12, cl === c.film.clips[c.film.clips.length - 1] ? 0 : 1 - (cl.b - P.t) / 0.1) : 0;
    W.style.transition = 'none'; W.style.background = '#000'; W.style.opacity = a > 0 ? Math.min(0.85, a).toFixed(2) : '0';
  }
  replayCam(m) { window.__game.cam(m); this.replayCamMark(m); }
  replayCamMark(m) { for (const b of document.querySelectorAll('#replayui [data-a=rcam]')) b.classList.toggle('on', b.dataset.v === m); }
  replayHud(r) {
    $('#replayui .bar i').style.width = (100 * r.t / r.duration).toFixed(1) + '%';
    // Schnitt beim Fahrbahn-Reset: Überblendung statt Sprung
    const W = $('#wipe'), f = r.fade();
    W.style.transition = 'none'; W.style.opacity = f > 0 ? Math.min(1, f * 1.4).toFixed(2) : '0';
    const P = r.penaltiesSoFar();
    if (P.n > (this._rpen ?? 0)) this.big(`+${P.sec - (this._rsec || 0)} s<small>Strafe</small>`, 'pen', 1200);
    this._rpen = P.n; this._rsec = P.sec;
    const txt = `⏱ ${fmtTime(r.raceTime())}${P.n ? ` · 💥 ${P.n}× +${PENALTY} s` : ''}`;
    if (txt !== this._rtxt) { this._rtxt = txt; $('#replayui .rinfo').textContent = txt; }
  }
  // Cockpit-Instrumente (n15): „full“ / „compact“ (Gang als Schild zwischen den Rundinstrumenten) /
  // „hud“ (keine Rundinstrumente, digitales Tempo im HUD) – per data-cpi für das CSS
  cockpitMode(px, gear) {
    const B = document.body, m = px ? px.mode : 'full';
    if (B.dataset.cpi !== m) B.dataset.cpi = m;
    if (m !== 'compact') return;
    const G = $('#cpgear'), [x, y, d] = px.gear, k = x.toFixed(0) + '|' + y.toFixed(0) + '|' + d.toFixed(0);
    if (this._cpk !== k) { this._cpk = k; Object.assign(G.style, { left: x + 'px', top: y + 'px', width: d + 'px', height: d + 'px', fontSize: (d * 0.6).toFixed(0) + 'px' }); }
    if (G.textContent !== String(gear)) G.textContent = String(gear);
  }
  // ---------- Touch ----------
  isTouchDevice() { return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; }
  // Gestenleiste/Home-Indikator unten in CSS-Pixeln (safe-area, per Mess-Element aufgelöst)
  safeBottom() {
    if (!this._sab) { this._sab = h('div'); this._sab.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;height:0;padding-bottom:var(--sab)'; document.body.appendChild(this._sab); }
    return parseFloat(getComputedStyle(this._sab).paddingBottom) || 0;
  }
  // Alle Finger als losgelassen werten (Drehen, App im Hintergrund) – keine hängenden Eingaben
  releaseTouch() {
    this.touchIds.clear();
    if (this._touchUpdate) this._touchUpdate();
  }
  setTouchMode(on) {
    const T = $('#touch');
    const touchDev = this.isTouchDevice();
    const easy = this.store.settings.assist === 'easy';
    T.className = on && touchDev ? (easy ? 'show halves' : 'show pads') : '';
    document.body.dataset.touch = on && touchDev ? (easy ? 'halves' : 'pads') : 'none';
    if (on && this.store.settings.tilt) T.classList.add('tilt');
    if (!on) this.touchIds.clear();
    if (this._touchUpdate) this._touchUpdate();
  }
  initTouch() {
    const T = $('#touch');
    const update = () => {
      const t = window.__touchState || (window.__touchState = { steer: 0, throttle: 0, brake: 0, active: false });
      let L = 0, R = 0, G = 0, B = 0;
      for (const v of this.touchIds.values()) { if (v === 'L') L = 1; if (v === 'R') R = 1; if (v === 'G') G = 1; if (v === 'B') B = 1; }
      t.steer = R - L; t.throttle = G; t.brake = B; t.active = this.touchIds.size > 0;
      for (const el of T.querySelectorAll('[data-t]')) el.classList.toggle('down', [...this.touchIds.values()].includes(el.dataset.t));
      if (this.a.input) Object.assign(this.a.input.touch, t);
    };
    const zoneAt = (x, y) => {
      if (T.classList.contains('halves')) return x < innerWidth / 2 ? 'L' : 'R';
      const el = document.elementFromPoint(x, y);
      const z = el && el.closest && el.closest('#touch [data-t]');
      return z ? z.dataset.t : null;
    };
    T.addEventListener('pointerdown', (e) => {
      const z = zoneAt(e.clientX, e.clientY);
      if (z) { this.touchIds.set(e.pointerId, z); try { T.setPointerCapture(e.pointerId); } catch { /* synthetisch/alt */ } }
      update(); e.preventDefault();
    });
    T.addEventListener('pointermove', (e) => { if (!this.touchIds.has(e.pointerId)) return; const z = zoneAt(e.clientX, e.clientY); if (z) this.touchIds.set(e.pointerId, z); update(); });
    const up = (e) => { this.touchIds.delete(e.pointerId); update(); };
    T.addEventListener('pointerup', up); T.addEventListener('pointercancel', up); T.addEventListener('lostpointercapture', up);
    this._touchUpdate = update;
    addEventListener('blur', () => this.releaseTouch());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseTouch(); });
  }
}
