// n42 Etappe 2 (Peter 26.10.2026: „Zufallsstrecken vergessen Hindernisse“): Pflicht-Liste einer Zufallsstrecke gegen das fertige
// Layout zählen. Je Pflicht-Element wird ein passendes Teil im Layout verbraucht (zweimal „jump“ braucht zwei Schanzen).
//   sbridge  = Brücke mit Spirale davor oder danach (Spiralen-Hochstraße), sbridgeC = Brücke, danach Klippensprung
//   zigzag   = 3-Felder-Zickzack; fehlt er, zählt ein 2-Felder-Zickzack (zigzag2) als sichtbarer Ersatz
//   tr_corklr = Korkenzieher; Ersatz (3D „Irre“, wenn kein Anlauf Platz auf Ebene 0 hat): Wendel (Überkopf-Rolle als
//               Ebenenwechsel)
// Ergebnis: { soll, fehlt: [...], ersatz: [[soll, ist] …], ok } – ok = nichts fehlt (Ersatz erlaubt)
export const PFLICHT_ERSATZ = { zigzag: 'zigzag2', sbridge: 'bridge', sbridgeC: 'sbridge', tr_corklr: 'tr_corkud' };

export function pflichtTeile(pieces) {
  const n = {};
  const add = (k) => { n[k] = (n[k] || 0) + 1; };
  pieces.forEach((p, i) => {
    const t = p.type;
    if (t === 'bridge') {
      const a = pieces[i - 1], b = pieces[i + 1];
      if (b && /^cliff/.test(b.type)) add('sbridgeC');
      else if ((a && a.type === 'spiral') || (b && b.type === 'spiral')) add('sbridge');
      else add('bridge');
      return;
    }
    add(t);
  });
  return n;
}

export function pflichtStatus(pieces, must) {
  const hat = pflichtTeile(pieces), fehlt = [], ersatz = [];
  const nimm = (k) => { if ((hat[k] || 0) > 0) { hat[k]--; return true; } return false; };
  // erst alle genauen Treffer, dann Ersatz (sonst nähme ein Ersatz einem späteren genauen Treffer das Teil weg)
  const rest = [];
  for (const t of must) if (!nimm(t)) rest.push(t);
  for (const t of rest) {
    let e = PFLICHT_ERSATZ[t], ok = false;
    while (e && !ok) { if (nimm(e)) { ersatz.push([t, e]); ok = true; } else e = PFLICHT_ERSATZ[e]; }
    if (!ok) fehlt.push(t);
  }
  return { soll: must.slice(), fehlt, ersatz, ok: !fehlt.length };
}

// Generator-Version 3: Anläufe a = 0, 1, … bauen (build(a) → Layout oder null), bis die Pflicht-Liste ohne Ersatz erfüllt
// ist; sonst das beste (wenigste Fehlende, dann wenigste Ersatz-Teile). Deterministisch je Code.
// ersatzAb: ab diesem Anlauf reicht „erfüllt mit Ersatz“ (begrenzt die Bauzeit – der Generator läuft beim Laden)
export function pflichtSuche(build, must, n = 160, ersatzAb = n) {
  let best = null, bs = Infinity;
  for (let a = 0; a < n; a++) {
    const lay = build(a);
    if (!lay) continue;
    const st = pflichtStatus(lay.pieces, must);
    const score = st.fehlt.length * 100 + st.ersatz.length;
    if (score < bs) { bs = score; best = { lay, st, a }; }
    if (bs === 0 || (bs < 100 && a >= ersatzAb)) break;
  }
  return best;
}
// Pflicht-Elemente nach Platzbedarf (lange zuerst – sonst zerstückeln kurze die Geraden), gleiche Länge in Listen-Reihenfolge
export const nachLaenge = (must, len) => must.map((t, k) => [t, k]).sort((x, y) => (len[y[0]] || 1) - (len[x[0]] || 1) || x[1] - y[1]).map((x) => x[0]);
