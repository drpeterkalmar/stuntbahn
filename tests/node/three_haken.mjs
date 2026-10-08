// Lade-Haken für Node-Tests: 'three' → lib/three.module.min.js (wie die Importmap in index.html), damit three.js-Module
// (z. B. gfx/kinolook.js) ohne Browser geladen werden können. Einbinden: import './three_haken.mjs'; dann dynamisch importieren.
import { register } from 'node:module';
const ZIEL = new URL('../../lib/three.module.min.js', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(ZIEL)}, shortCircuit: true }; return n(s, c); }`));
