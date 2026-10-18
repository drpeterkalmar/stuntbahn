// Strecke fürs Online-Rennen als Daten (n35): der Gastgeber beschreibt die geladene Strecke, die Gäste bauen daraus
// dieselbe Strecke – ohne eigene Autopilot-Prüfung (die hat der Gastgeber gemacht; Ergebnis und Entschärfungen stecken im
// Layout). Formen:
//   { art: 'layout', layout, apTime, fixes }   Zufallsstrecke (flach/3D/Gelände, ~3 kB JSON)
//   { art: 'sam', id } | { art: 'demo', id }    Sammlung bzw. Beispielstrecke (liegt jedem Spiel bei)
//   { art: 'trk', id, name, b64 }               importierte .TRK-Datei (Bytes, ~2,4 kB Base64)
// Landschaft/Wetter/Tageszeit gehen getrennt in den Lobby-Einstellungen mit. Node-Test: tests/node/test_online.mjs.

export function beschreibe(env, trkBytes = null) {
  const key = env.meta && env.meta.key;
  if (key && key.startsWith('sam-')) return { art: 'sam', id: key, name: env.meta.name };
  if (key && key.startsWith('demo-')) return { art: 'demo', id: key, name: env.meta.name };
  if (key && key.startsWith('trk-')) {
    const b = trkBytes ? trkBytes(key) : null;
    if (!b) return null;
    return { art: 'trk', id: key, name: env.meta.name, b64: zuB64(b) };
  }
  return { art: 'layout', layout: JSON.parse(JSON.stringify(env.layout)), apTime: env.meta.apTime ?? null, fixes: env.meta.fixes ?? 0, name: env.meta.name };
}

// kurze Kennung (für lobby.einst.strecke: Gäste merken, ob sie die passende Strecke geladen haben)
export function streckenKennung(d) {
  if (!d) return '';
  if (d.art === 'sam' || d.art === 'demo' || d.art === 'trk') return d.id;
  return 'L' + fnv(JSON.stringify(d.layout.pieces) + JSON.stringify(d.layout.gel || null)).toString(36);
}

export function zuB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return btoa(s);
}
export function ausB64(b64) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
