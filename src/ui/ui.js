// Bedienoberfläche (DOM): Laden, Menü, HUD, Touch-Steuerung, Pause, Ergebnis, Replay, Credits.
import { fmtTime, daySeed } from '../core/util.js';
import { ASSISTS, PENALTY } from '../game/race.js';
import { DIFFS } from '../track/generator.js';
import { PAINTS } from '../gfx/carmesh.js';
import { PIECES } from '../track/pieces.js';
import { LINE_LEVELS } from '../gfx/lineviz.js';
import { parseTrk } from '../track/trk.js';
import { trkToLayout } from '../track/trkimport.js';
import { drawMinimap } from './minimap.js';

const $ = (s, r = document) => r.querySelector(s);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const ICON = { loop: '➰', jump: '🛫', tube: '🕳️', bank: '↪️', crest: '⛰️', bumps: '〰️', chicane: '🔀', bridge: '🌉' };
// Symbole für importierte Strecken (Elementart → Symbol, Name)
const TICON = { loop: ['➰', 'Looping'], corklr: ['🌀', 'Korkenzieher'], corkud: ['🌀', 'Wendel'], gap: ['🛫', 'Sprung'], pipe: ['🕳️', 'Röhre'], bankC: ['↪️', 'Steilkurve'], chicane: ['🔀', 'Schikane'], elev: ['🌉', 'Hochstraße'], tunnel: ['🚇', 'Tunnel'], hwy: ['🛣️', 'Autobahn'], slalom: ['🚧', 'Slalom'] };
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
    this.build();
  }
  build() {
    this.root.innerHTML = `
      <div id="loading" class="screen show"><div class="logo">STUNT<b>BAHN</b></div><div class="bar"><i></i></div><p>Laden …</p></div>
      <div id="menu" class="screen"></div>
      <div id="hud">
        <div class="tl"><div class="time">0:00,00</div><div class="pen"></div><div class="best"></div></div>
        <div class="tc"><div class="cp"></div></div>
        <div class="tr">
          <button class="rb line" data-a="linetoggle" aria-label="Ideallinie ein/aus" title="Ideallinie ein/aus (L)"><svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3bdc55"/><stop offset=".55" stop-color="#ffd21a"/><stop offset="1" stop-color="#ff4a2a"/></linearGradient></defs><path d="M4 21C6 13 18 15 20 3" fill="none" stroke="url(#lg)" stroke-width="3.2" stroke-linecap="round"/><path class="x" d="M4 4L20 20" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg></button>
          <button class="rb" data-a="rewind" aria-label="Zurückspulen" title="Zurückspulen (R)">⏪</button>
          <button class="rb" data-a="cam" aria-label="Kamera wechseln" title="Kamera (C)">🎥</button>
          <button class="rb" data-a="pause" aria-label="Pause" title="Pause (Esc)">⏸</button>
        </div>
        <div class="speed"><b>0</b><span>km/h</span><i class="gear">1</i></div>
        <div class="assistTag"></div>
      </div>
      <div id="wipe"></div>
      <div id="big"></div>
      <div id="toast"></div>
      <div id="touch">
        <div class="half l" data-t="L"><span>◀</span></div><div class="half r" data-t="R"><span>▶</span></div>
        <div class="pad left"><div class="tb" data-t="L">◀</div><div class="tb" data-t="R">▶</div></div>
        <div class="pad right"><div class="tb brake" data-t="B">BREMSE</div><div class="tb gas" data-t="G">GAS</div></div>
      </div>
      <div id="pause" class="screen"></div>
      <div id="result" class="screen"></div>
      <div id="replayui"><div class="rinfo"></div><div class="bar"><i></i></div><div class="btns"></div></div>
      <div id="sheet" class="screen"></div>
      <div id="drop"><div>📂 Strecken hier ablegen<small>.TRK, .RPL oder .ZIP</small></div></div>`;
    // Datei-Auswahl (Handy + Desktop); wird per Knopf im Nutzer-Klick geöffnet
    this.fileInput = h('input');
    this.fileInput.type = 'file'; this.fileInput.multiple = true; this.fileInput.accept = '.trk,.TRK,.rpl,.RPL,.zip,.ZIP,application/zip,application/octet-stream';
    this.fileInput.style.display = 'none';
    this.fileInput.addEventListener('change', () => { const f = [...this.fileInput.files]; this.fileInput.value = ''; if (f.length && this.a.importFiles) this.a.importFiles(f); });
    document.body.appendChild(this.fileInput);
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      e.preventDefault();
      this.action(b.dataset.a, b.dataset.v, b);
    });
    this.initTouch();
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
    const W = $('#wipe'); W.style.opacity = ''; W.style.transition = '';
    W.classList.toggle('in', !!on);
  }
  flash() { this.wipe(true); clearTimeout(this._wt); this._wt = setTimeout(() => this.wipe(false), 90); }
  // ---------- Menü ----------
  showMenu(env) {
    this.env = env;
    document.body.dataset.mode = 'menu';
    const S = this.store.settings, m = env.meta, lay = env.layout;
    const stunts = {};
    for (const p of lay.pieces) if (ICON[p.type]) stunts[p.type] = (stunts[p.type] || 0) + 1;
    if (lay.pieces.some((p) => p.type === 'rampUp')) stunts.bridge = lay.pieces.filter((p) => p.type === 'bridge').length;
    const stuntTxt = Object.entries(stunts).map(([t, n]) => `<span title="${PIECES[t] ? PIECES[t].name : t}">${ICON[t]}${n > 1 ? '×' + n : ''}</span>`).join(' ');
    const bests = Object.keys(ASSISTS).map((k) => { const b = this.store.bestFor(m.key, k); return `<span>${ASSISTS[k].icon} ${b ? fmtTime(b.time) : '–'}</span>`; }).join('');
    const today = daySeed();
    const isDay = m.seed === today && m.diff === 2 && !m.imported;
    const km = (env.ideal.total / 1000).toFixed(2);
    const metaLine = m.imported
      ? `📂 Importiert${m.diffName ? ' · ' + m.diffName : ''} · ${km} km${m.closed === false ? ' · offen' : ''}`
      : `Code <b>${m.seed}-${m.diff}</b> · ${m.diffName || ''} · ${km} km`;
    const stuntsHtml = m.imported ? stuntSummary(lay.pieces) : stuntTxt;
    const apLine = m.apTime ? `<div class="tmeta">🤖 Autopilot-Referenz ${fmtTime(m.apTime)}${m.fixes ? ' · ' + m.fixes + '× entschärft' : ''}</div>`
      : m.apFail ? `<div class="tmeta">🤖 Probefahrt ohne Hilfen: ${m.apFail} – Fahrhilfe Leicht hilft</div>` : '';
    $('#menu').innerHTML = `
      <div class="col left">
        <div class="logo">STUNT<b>BAHN</b></div>
        <div class="card track">
          <div class="tname">${isDay ? '📅 Strecke des Tages<br>' : ''}${m.name || 'Strecke'}</div>
          <div class="tmeta">${metaLine}</div>
          <div class="stunts">${stuntsHtml || 'ohne Stunts'}</div>
          ${apLine}
          <div class="bests">${bests}<span class="bmode">${S.wreck ? '💥 mit Totalschaden' : '↺ Reset +' + PENALTY + ' s'}</span></div>
        </div>
        <button class="big go" data-a="start">▶ Losfahren</button>
      </div>
      <div class="col right">
        <div class="lbl">Fahrhilfe</div>
        <div class="seg" data-g="assist">${Object.entries(ASSISTS).map(([k, A]) => `<button data-a="assist" data-v="${k}" class="${S.assist === k ? 'on' : ''}">${A.icon} ${A.name}</button>`).join('')}</div>
        <div class="hint">${this.assistHint(S.assist)}</div>
        <div class="lbl">Neue Strecke</div>
        <div class="seg" data-g="diff">${[1, 2, 3].map((d) => `<button data-a="diff" data-v="${d}" class="${(S.diff || 2) === d ? 'on' : ''}">${DIFFS[d].name}</button>`).join('')}</div>
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
      easy: 'Gas, Bremse und Stunts macht das Auto selbst. Du lenkst grob – die Linie zieht dich. ',
      medium: 'Bremsassistent, leichter Zug zur Linie, farbige Ideallinie (grün Gas, gelb vom Gas, rot bremsen), Rückspul-Knopf. ',
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
      case 'code': {
        const c = prompt('Strecken-Code (z. B. 4711-2):', this.env ? this.env.meta.key : '');
        if (c) { const m = /^\s*(\d+)(?:\s*-\s*([123]))?\s*$/.exec(c); if (m) A.newTrack(+m[1], +(m[2] || S.diff || 2)); else this.toast('Ungültiger Code'); }
        break;
      }
      case 'settings': this.showSettings(); break;
      case 'trklib': this.showLibrary(); break;
      case 'trkpick': this.fileInput.click(); break;
      case 'trkplay': A.playImported(v); break;
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
    const bests = (id) => Object.keys(ASSISTS).map((k) => { const b = this.store.bestFor(id, k); return `<span>${ASSISTS[k].icon} ${b ? fmtTime(b.time) : '–'}</span>`; }).join('');
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
    this.sheet('Strecken laden (.TRK)', `
      ${res}
      <div class="row"><button class="big go" data-a="trkpick">📂 Datei wählen …</button></div>
      <p class="hint">Strecken des Stunt-Klassikers (.TRK), Replays (.RPL, enthalten die Strecke) oder ganze ZIP-Archive.
      <span class="desk">Am Computer auch einfach ins Fenster ziehen.</span> Die Strecken bleiben nur in diesem Browser.
      Quellen: <b>zak.stunts.hu</b> → Downloads (Track-Pack), <b>archive.org</b> → „stunts tracks“.</p>
      <div class="lbl">Meine Strecken (${lib.list.length})</div>
      ${mine || '<p class="hint">Noch keine importiert.</p>'}
      <div class="lbl">Beispiele</div>
      ${demos}`);
    // nach einem Import den (ersten) neuen Eintrag zeigen
    const fresh = document.querySelector('#sheet .trk.new');
    if (fresh) fresh.scrollIntoView({ block: 'center' });
    // Minikarten erst zeichnen, wenn sie ins Bild scrollen (Bibliothek bis 400 Strecken)
    const draw = (cv) => {
      if (cv.dataset.done) return;
      cv.dataset.done = '1';
      const id = cv.dataset.mm;
      try {
        const bytes = id.startsWith('demo-') ? A.showcaseBytes(id) : lib.bytes(id);
        const trk = parseTrk(bytes, id);
        drawMinimap(cv, trk, trkToLayout(trk).layout);
      } catch (e) {
        const g = cv.getContext('2d'); g.fillStyle = '#402020'; g.fillRect(0, 0, cv.width, cv.height);
        g.fillStyle = '#fff'; g.font = '14px sans-serif'; g.fillText('⚠️ Fehler', 20, 64);
        cv.title = e.message;
      }
    };
    const cvs = [...document.querySelectorAll('#sheet canvas[data-mm]')];
    if (typeof IntersectionObserver === 'undefined') cvs.forEach(draw);
    else {
      if (this._mmObs) this._mmObs.disconnect();
      this._mmObs = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) draw(e.target); }, { root: document.querySelector('#sheet .scroll'), rootMargin: '200px' });
      cvs.forEach((cv) => this._mmObs.observe(cv));
    }
  }
  showSettings() {
    const S = this.store.settings;
    const onoff = (k, label) => `<button data-a="toggle" data-v="${k}" class="${S[k] ? 'on' : ''}">${S[k] ? '✅' : '⬜'} ${label}</button>`;
    this.sheet('Optionen', `
      <div class="row">${onoff('sound', 'Ton')}${onoff('ghost', 'Geisterauto')}${onoff('tilt', 'Lenken durch Neigen')}</div>
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
        : 'Farbiges Band auf der Fahrbahn (grün Gas, gelb vom Gas, rot bremsen, blau Luft). Nur die Anzeige – die Lenkhilfe bleibt gleich.'}
      Im Rennen umschalten: Knopf oben rechts, <span class="desk">Taste <b>L</b>, </span>Gamepad <b>Back</b>.</p>
      <div class="lbl">Lackfarbe</div>
      <div class="row">${PAINTS.map((p, i) => `<button data-a="paint" data-v="${i}" class="sw ${S.paint === p.color ? 'on' : ''}" style="--c:#${p.color.toString(16).padStart(6, '0')}">${p.name}</button>`).join('')}</div>
      <div class="lbl">Grafik</div>
      <div class="row">${[['auto', 'Automatisch'], ['0', 'Sparsam'], ['1', 'Mittel'], ['2', 'Hoch']].map(([v, n]) => `<button data-a="quality" data-v="${v}" class="${String(S.quality || 'auto') === v ? 'on' : ''}">${n}</button>`).join('')}</div>`);
  }
  showHelp() {
    this.sheet('Steuerung', `
      <p><b>Handy (quer halten):</b> Fahrhilfe <i>Leicht</i>: linke/rechte Bildschirmhälfte halten zum Lenken – Gas und Bremse macht das Auto. Oder in den Optionen „Lenken durch Neigen“.</p>
      <p><i>Mittel/Original</i>: links ◀ ▶ lenken, rechts GAS und BREMSE. Bremse im Stand = Rückwärtsgang.</p>
      <p><b>Tastatur:</b> Pfeile oder WASD, Leertaste bremsen, <b>R</b> zurückspulen, <b>C</b> Kamera, <b>L</b> Ideallinie ein/aus, <b>Esc</b> Pause.</p>
      <p><b>Gamepad:</b> linker Stick lenken, RT/A Gas, LT/X Bremse, Y zurückspulen, LB Kamera, Back Ideallinie, Start Pause.</p>
      <p><b>Crash:</b> Standardmäßig kein Totalschaden – das Auto steht sofort wieder auf der Fahrbahn vor dem Stunt, mit Schwung, und du bekommst <b>+${PENALTY} s</b> auf die Zeit. Klappt ein Stunt mehrmals nicht, wirst du dahinter gesetzt (auch dann je +${PENALTY} s). Wer es hart mag: Optionen → <b>💥 Totalschaden</b> (Wrack wie im Original).</p>
      <p><b>⏪ Zurückspulen</b> (Leicht/Mittel): 3 s zurück, um einen Crash zu vermeiden. Ohne Totalschaden läuft die Uhr dabei weiter – es kostet die Zeit, die du neu fährst, aber keine Strafe.</p>
      <p><b>Ziel:</b> Alle Checkpoints der Reihe nach, dann über die Ziellinie. Bestzeiten und Geisterautos gibt es getrennt je Fahrhilfe und Totalschaden-Einstellung.</p>`);
  }
  showCredits() {
    this.sheet('Credits', `
      <p><b>Stuntbahn</b> – ein Stunt-Rennspiel als Hommage an die Klassiker der frühen 90er. Eigener Code, eigene Strecken-Bausteine.</p>
      <p><b>Auto:</b> „Fictional supercar – V12 Goblin“ von <b>Olli Teittinen (ollitei)</b>, Lizenz <b>CC-BY 4.0</b>, sketchfab.com/3d-models/fictional-supercar-v12-goblin-0a20e49ad5774d778567cb5c3f345786 (für das Spiel optimiert: Materialien umgewandelt, Geometrie vereinfacht).</p>
      <p><b>Himmel & Licht:</b> „Kloofendal 48d Partly Cloudy (Pure Sky)“ von Greg Zaal & Jarod Guest – Poly Haven, CC0.</p>
      <p><b>Texturen (Poly Haven, CC0):</b> Asphalt 02, Concrete Floor 02, Metal Plate (Rob Tuytel) · Leafy Grass, Gravel Concrete 03 (Charlotte Baglioni) · Fir Tree 01 (Rob Tuytel, Rico Cilliers) → daraus zusammengesetzte Baumkarten.</p>
      <p><b>Technik:</b> three.js (MIT). Physik, Strecken, Generator, Ton: eigener Code.</p>
      <p>Build ${this.app.build}</p>`);
  }
  // ---------- Rennen ----------
  showHud(race, env) {
    this.env = env;
    document.body.dataset.mode = 'race';
    this.show(null);
    $('#hud').classList.add('show');
    $('#replayui').classList.remove('show');
    const A = ASSISTS[this.store.settings.assist];
    $('#hud .assistTag').textContent = A.icon + ' ' + A.name;
    $('#hud [data-a=rewind]').style.display = this.store.settings.assist === 'original' ? 'none' : '';
    this.lineChanged();
    const b = this.store.bestFor(env.meta.key, this.store.settings.assist, race.wreckOn);
    $('#hud .best').textContent = b ? 'Beste ' + fmtTime(b.time) : '';
    $('#hud .pen').textContent = '';
    this._pen = 0;
    this.wipe(false);
    this.setTouchMode(true);
    this.lastCd = null;
  }
  hud(race, env, ghost) {
    const t = race.state === 'countdown' ? 0 : race.time;
    if (this._ht !== Math.floor(t * 20)) {
      this._ht = Math.floor(t * 20);
      $('#hud .time').textContent = fmtTime(t);
      const kmh = Math.round(Math.abs(race.car.fwdSpeed()) * 3.6);
      $('#hud .speed b').textContent = kmh;
      $('#hud .gear').textContent = race.car.fwdSpeed() < -0.5 ? 'R' : race.car.gear;
      $('#hud .cp').textContent = race.cps.length ? `CP ${Math.min(race.cpNext, race.cps.length)}/${race.cps.length}` : '';
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
  }
  // Fahrhilfe im Rennen gewechselt: HUD + Touch-Modus anpassen
  assistChanged() {
    const k = this.store.settings.assist, A = ASSISTS[k];
    $('#hud .assistTag').textContent = A.icon + ' ' + A.name;
    $('#hud [data-a=rewind]').style.display = k === 'original' ? 'none' : '';
    this.lineChanged();
    if (document.body.dataset.mode === 'race') this.setTouchMode(true);
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
    const best = res.isBest ? '<div class="rec">🏆 Neue Bestzeit!</div>' : (res.prev ? `<div class="prev">Bestzeit ${fmtTime(res.prev)} (${(res.time - res.prev >= 0 ? '+' : '') + (res.time - res.prev).toFixed(2).replace('.', ',')} s)</div>` : '');
    $('#result').innerHTML = `<div class="card"><h2>🏁 Ziel!</h2>
      <div class="rtime">${fmtTime(res.time)}</div>${pen}${best}
      <div class="rmeta">${A.icon} ${A.name} · ${race.wreckOn ? '💥 Totalschaden an' : 'Totalschaden aus'} · ${env.meta.name} (${env.meta.key}) · Crashs ${race.crashes}${race.rewinds ? ' · Rückspulen ' + race.rewinds : ''}</div>
      <div class="row"><button class="big go" data-a="retry">🔁 Nochmal</button><button data-a="replay">🎬 Replay</button></div>
      <div class="row"><button data-a="next">🎲 Neue Strecke</button><button data-a="menu">☰ Menü</button></div></div>`;
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
    $('.btns', R).innerHTML = [['chase', '🚗 Verfolger'], ['far', '🚁 Hubschrauber'], ['track', '📹 Strecke'], ['bumper', '🎯 Stoßstange']]
      .map(([m, n]) => `<button data-a="rcam" data-v="${m}">${n}</button>`).join('') + '<button data-a="rplay">⏯</button><button data-a="rslow">🐢</button><button data-a="rend">✕</button>';
  }
  replayCam(m) { window.__game.cam(m); for (const b of document.querySelectorAll('#replayui [data-a=rcam]')) b.classList.toggle('on', b.dataset.v === m); }
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
  // ---------- Touch ----------
  setTouchMode(on) {
    const T = $('#touch');
    const touchDev = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    const easy = this.store.settings.assist === 'easy';
    T.className = on && touchDev ? (easy ? 'show halves' : 'show pads') : '';
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
  }
}
