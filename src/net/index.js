// Netz-Schicht (n35), spielunabhängig – Einstieg. Port-Notiz: NETZ.md. Tests: tests/node/test_netz*.mjs.
export { ALPHABET, CODE_LAENGE, neuerCode, normalisieren, codeAusUrl, teilenLink, vorlesbar } from './code.js';
export { TYP, schema, packeEinzel, packeSammel, entpacke, neuer, zeitVoll } from './paket.js';
export { UHR, UhrAbgleich } from './uhr.js';
export { PUFFER, FremdPuffer, qslerp, qmul, qkonj, qnorm, qpow, qwinkel } from './puffer.js';
export { PROTOKOLL, SITZUNG, Sitzung, vorrang } from './sitzung.js';
export { FakeNetz } from './fake.js';

// Transport-Wahl aus der Adresse: ?netz=bc (Tabs im selben Browser, Test) | nostr | mqtt | beide | auto (Standard);
// künstliche Laufzeit nur für bc: ?netzlag= ms je Richtung, ?netzjitter= ms, ?netzverlust= 0…1
export function netzOptionen(search = globalThis.location ? globalThis.location.search : '') {
  const q = new URLSearchParams(search), n = (k, d) => (q.has(k) && Number.isFinite(+q.get(k)) ? +q.get(k) : d);
  const art = q.get('netz') || 'auto';
  return { art: art === 'bc' ? 'bc' : 'trystero', strategie: ['nostr', 'mqtt', 'beide'].includes(art) ? art : 'auto', latenz: n('netzlag', 0), jitter: n('netzjitter', 0), verlust: Math.min(0.5, Math.max(0, n('netzverlust', 0))) };
}

// Transport für einen Raumcode öffnen (async; Trystero wird erst hier geladen)
export async function verbinden(code, opt = netzOptionen()) {
  if (opt.art === 'bc') { const { bcTransport } = await import('./bc.js'); return bcTransport(code, opt); }
  const { trysteroTransport } = await import('./trystero.js');
  return trysteroTransport(code, opt);
}
