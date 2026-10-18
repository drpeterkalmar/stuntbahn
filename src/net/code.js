// Raumcode (n35 Netz-Schicht, spielunabhängig): kurz, gut vorlesbar, ohne verwechselbare Zeichen (0/O, 1/I/l).
// 31 Zeichen, 4 Stellen ≈ 920 000 Codes, 5 Stellen ≈ 28 Mio. Der Code ist zugleich Raum-Name und Passwort der
// Partnersuche (Trystero verschlüsselt die Verbindungsdaten damit). Node-Test: tests/node/test_netz.mjs.

export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LAENGE = 4;

// Neuer Code aus einer Zufallsquelle rnd() ∈ [0,1) (Browser: crypto, Test: fester Seed)
export function neuerCode(rnd = zufall, n = CODE_LAENGE) {
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[Math.min(ALPHABET.length - 1, Math.floor(rnd() * ALPHABET.length))];
  return s;
}

function zufall() {
  const c = globalThis.crypto;
  if (c && c.getRandomValues) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] / 2 ** 32; }
  return Math.random();
}

// Eingabe säubern (tolerant: Kleinbuchstaben, Leerzeichen, Bindestriche): null, wenn kein gültiger Code (4 oder 5
// Stellen aus dem Alphabet). 0/O/1/I/L lassen sich nicht eindeutig zurückbilden – sie gelten als Tippfehler.
export function normalisieren(eingabe) {
  if (typeof eingabe !== 'string') return null;
  const s = eingabe.toUpperCase().replace(/[\s\-_.]/g, '');
  if (s.length < 4 || s.length > 5) return null;
  for (const ch of s) if (!ALPHABET.includes(ch)) return null;
  return s;
}

// Code aus der Adresse (?raum=ABCD); null ohne bzw. bei ungültigem Code
export function codeAusUrl(search = globalThis.location ? globalThis.location.search : '') {
  const q = new URLSearchParams(search);
  return q.has('raum') ? normalisieren(q.get('raum')) : null;
}

// Teilen-Link: aktuelle Seite ohne andere Raum-/Test-Parameter, plus ?raum=CODE
export function teilenLink(code, href = globalThis.location ? globalThis.location.href : 'https://example.org/') {
  const u = new URL(href);
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (k === 'raum') u.searchParams.delete(k);
  u.searchParams.set('raum', code);
  return u.toString();
}

// Zum Vorlesen: „AB-CD“ bzw. „ABC-DE“
export function vorlesbar(code) { return code.length > 4 ? code.slice(0, 3) + '-' + code.slice(3) : code.slice(0, 2) + '-' + code.slice(2); }
