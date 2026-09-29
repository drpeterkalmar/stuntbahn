# Hilfen für die Hochformat-Tests: Handy-Profile (hoch + quer), simulierte sichere Ränder (Notch/Gestenleiste),
# Layout-Prüfung im Browser (Überlappung, abgeschnitten, Knopfgröße, sichere Ränder, Cockpit-Instrumente).
from util import PIXEL7_LAND

ANDROID = PIXEL7_LAND['user_agent']
IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
def _dev(w, h, dpr, ua):
    return dict(viewport={"width": w, "height": h}, device_scale_factor=dpr, is_mobile=True, has_touch=True, user_agent=ua)
# safe: sichere Ränder in CSS-px (oben, rechts, unten, links) – Chromium kennt keine Notch, daher per CSS-Variable
DEVICES = {
    'pixel7':   dict(ctx=_dev(412, 915, 2.625, ANDROID), safe=(24, 0, 16, 0)),
    'iphone14': dict(ctx=_dev(390, 844, 3, IPHONE), safe=(47, 0, 34, 0), shot_dpr=2),
    'klein':    dict(ctx=_dev(360, 740, 3, ANDROID), safe=(0, 0, 0, 0), shot_dpr=2),
    'pixel7q':  dict(ctx=_dev(915, 412, 2.625, ANDROID), safe=(0, 24, 16, 24)),
    'iphone14q': dict(ctx=_dev(844, 390, 3, IPHONE), safe=(0, 47, 21, 47), shot_dpr=2),
    'kleinq':   dict(ctx=_dev(740, 360, 3, ANDROID), safe=(0, 0, 0, 0), shot_dpr=2),
}

def set_safe(s, safe):
    if not safe: return
    t, r, b, l = safe
    s.ev(f"(() => {{ const d = document.documentElement.style; d.setProperty('--sat', '{t}px'); d.setProperty('--sar', '{r}px'); d.setProperty('--sab', '{b}px'); d.setProperty('--sal', '{l}px'); }})()")

# Alle HUD-Teile gleichzeitig befüllen (ungünstigster Fall): Bestzeit, Strafe, Checkpoint, Stunt-Hinweis
def fake_hud_worst(s):
    s.ev("""(() => { const q = (x) => document.querySelector(x);
      q('#hud .best').textContent = 'Beste 1:23,45'; q('#hud .pen').textContent = 'inkl. +15 s Strafe';
      q('#hud .cp').textContent = 'CP 2/3'; const G = window.__game; G.freeze(true);
      G.race.hud = { kind: 'stunt', text: 'Korkenzieher voraus – Autopilot lenkt' }; G.race.penalties = 3; })()""")
    s.frames(2)

JS_CHECK = r"""(groups) => {
  const W = innerWidth, H = innerHeight;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding:var(--sat) var(--sar) var(--sab) var(--sal)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe), sa = { t: parseFloat(cs.paddingTop), r: parseFloat(cs.paddingRight), b: parseFloat(cs.paddingBottom), l: parseFloat(cs.paddingLeft) };
  probe.remove();
  const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    for (let x = e; x && x !== document.body; x = x.parentElement) { const st = getComputedStyle(x); if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity === 0) return false; } return true; };
  const scrollParent = (e) => { for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) { const st = getComputedStyle(x); if (/(auto|scroll)/.test(st.overflowY) && x.scrollHeight > x.clientHeight + 1) return x; } return null; };
  const R = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  const name = (e) => (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').join('.') : '') + ' „' + (e.textContent || '').trim().slice(0, 18) + '“';
  const out = [], small = [], overlap = [], clipped = [];
  const inter = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 1 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 1;
  const items = [];
  const race = document.getElementById('hud').classList.contains('show');
  const scr = document.querySelector('.screen.show:not(#loading)');
  // Knöpfe (sichtbar, oberste Ebene)
  const btns = [...document.querySelectorAll('#ui button, #touch .tb')].filter(vis).filter((b) => !scr || scr.contains(b) || !race);
  for (const b of btns) {
    const r = R(b), sp = scrollParent(b);
    if (r[2] - r[0] < 47.5 || r[3] - r[1] < 47.5) small.push(name(b) + ' ' + Math.round(r[2] - r[0]) + '×' + Math.round(r[3] - r[1]));
    if (b.scrollWidth > b.clientWidth + 2) clipped.push(name(b) + ' Text ' + b.scrollWidth + '>' + b.clientWidth);
    if (sp) { const pr = R(sp); if (pr[0] < -1 || pr[1] < -1 || pr[2] > W + 1 || pr[3] > H + 1) out.push('Scrollbereich ' + name(sp)); }
    else if (r[0] < sa.l - 1 || r[1] < sa.t - 1 || r[2] > W - sa.r + 1 || r[3] > H - sa.b + 1) out.push(name(b) + ' ' + r.map(Math.round));
  }
  // Karten (Pause/Ergebnis/Sheet) vollständig im Bild
  for (const c of document.querySelectorAll('.screen.show .card')) { if (!vis(c) || scrollParent(c)) continue; const r = R(c); if (r[1] < sa.t - 1 || r[3] > H - sa.b + 1 || r[0] < -1 || r[2] > W + 1) out.push('Karte ' + name(c) + ' ' + r.map(Math.round)); }
  if (race && !scr) {
    const sel = ['#hud .time', '#hud .pen', '#hud .best', '#hud .tc', '#hud .assistTag', '#hud .speed', '#hud .hint2.show', '#touch.show .half span'];
    for (const q of sel) for (const e of document.querySelectorAll(q)) if (vis(e) && (e.textContent || '').trim()) items.push(e);
    for (const b of btns) items.push(b);
    for (const e of items) { const r = R(e); if (r[0] < sa.l - 1 || r[1] < sa.t - 1 || r[2] > W - sa.r + 1 || r[3] > H - sa.b + 1) out.push('HUD ' + name(e) + ' ' + r.map(Math.round)); }
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.contains(b) || b.contains(a)) continue;
      if (inter(R(a), R(b))) overlap.push(name(a) + ' ⟷ ' + name(b));
    }
  }
  const rep = document.getElementById('replayui');
  if (rep.classList.contains('show')) {
    const rb = [...rep.querySelectorAll('button')].filter(vis);
    for (let i = 0; i < rb.length; i++) for (let j = i + 1; j < rb.length; j++) if (inter(R(rb[i]), R(rb[j]))) overlap.push(name(rb[i]) + ' ⟷ ' + name(rb[j]));
    const r = R(rep); if (r[1] < -1 || r[3] > H + 1) out.push('Replay-Leiste ' + r.map(Math.round));
  }
  // Cockpit: Rundinstrumente im Bild, über der Gestenleiste, nicht unter Knöpfen/Pfeilen/HUD
  if ((groups || []).includes('cockpit') && window.__game.rig.view === 'cockpit') {
    const px = window.__game.cockpit.readout().px;
    const others = [...document.querySelectorAll('#touch.show .half span, #touch.show .tb, #hud.show .speed, #hud.show .tl, #hud.show .tr, #hud.show .xb, #replayui.show .btns, #replayui.show .rinfo')].filter(vis);
    for (const gx of px.xs) {
      const c = [gx - px.gd / 2, px.yc - px.gd / 2, gx + px.gd / 2, px.yc + px.gd / 2];
      if (c[0] < -1 || c[2] > W + 1 || c[3] > H - sa.b + 1 || c[1] < 0) out.push('Instrument ' + c.map(Math.round));
      for (const o of others) { const r = R(o); const dx = Math.max(r[0] - gx, 0, gx - r[2]), dy = Math.max(r[1] - px.yc, 0, px.yc - r[3]); if (Math.hypot(dx, dy) < px.gd / 2 - 1) overlap.push('Instrument@' + Math.round(gx) + ' ⟷ ' + name(o)); }
    }
    // n15: Stufen – „full“ ≥ 90 px, „compact“ ≥ 80 px (Gang-Schild), „hud“ ohne Rundinstrumente (Tempo digital sichtbar)
    if (px.mode === 'hud') { const sp = document.querySelector('#hud.show .speed'); if (sp && !vis(sp)) small.push('Cockpit hud: Digital-Tempo fehlt'); }
    else if (px.gd < (px.mode === 'compact' ? 79.5 : 89.5)) small.push('Instrument nur ' + Math.round(px.gd) + ' px (' + px.mode + ')');
    if (px.mode === 'compact') { const g = document.getElementById('cpgear'); if (!vis(g)) small.push('Gang-Schild fehlt');
      else for (const o of others) if (inter(R(g), R(o))) overlap.push('Gang-Schild ⟷ ' + name(o)); }
  }
  return { out, small, overlap, clipped, n: items.length + btns.length, W, H, sa };
}"""

def layout_check(s, groups=None):
    r = s.pg.evaluate(JS_CHECK, groups or [])
    return {'overlap': r['overlap'], 'out': r['out'], 'small': r['small'] + r['clipped'], 'n': r['n']}
