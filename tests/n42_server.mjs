// n42 Mess-Server: liefert das Spiel wie GitHub Pages (HTTPS + HTTP/2, gzip für Text, ETag, max-age=600) und drosselt das
// Netz auf dem Server – so trifft die Drossel auch den Service Worker (die CDP-Netzdrossel gilt nur für die Seite).
//   node tests/n42_server.mjs <wurzel> <port> [--rtt 165] [--kbit 9000] [--log datei.jsonl]
//   Fast 4G wie Chrome DevTools: 9 Mbit/s × 0,9 Durchsatz, 60 ms × 2,75 Latenz = 165 ms je Anfrage.
//   --rtt 0 --kbit 0 = ungedrosselt. Jede Antwort wird (optional) mit Zeitstempel/Größe protokolliert (Wasserfall).
// Zertifikat: selbst signiert, beim ersten Start mit openssl erzeugt (tests/.n42_cert/, nicht im Repo). Chrome braucht
// --ignore-certificate-errors (macht tests/n42_mess.py).
import http2 from 'node:http2';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const wurzel = path.resolve(args[0] || path.join(HIER, '..'));
const port = +(args[1] || 8443);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const RTT = +opt('rtt', 165), KBIT = +opt('kbit', 9000), LOG = opt('log', null);
const BPS = KBIT > 0 ? KBIT * 1000 / 8 * 0.9 : 0;   // Bytes/s (DevTools: × 0,9)

const certDir = path.join(HIER, '.n42_cert');
if (!fs.existsSync(path.join(certDir, 'key.pem'))) {
  fs.mkdirSync(certDir, { recursive: true });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
    '-keyout', path.join(certDir, 'key.pem'), '-out', path.join(certDir, 'cert.pem')], { stdio: 'ignore' });
}
if (args.includes('--nur-zertifikat')) process.exit(0);
const TYP = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm', '.bin': 'application/octet-stream',
  '.m4a': 'audio/mp4', '.txt': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg' };
const GZIP = /\.(html|js|mjs|css|json|webmanifest|svg|txt|hdr|bin|wasm)$/;   // Pages gzipt Text (hdr/bin/wasm: Pages-Fastly ebenfalls)
const cache = new Map();
function lies(f) {
  const st = fs.statSync(f);
  const c = cache.get(f);
  if (c && c.mtime === st.mtimeMs) return c;
  const roh = fs.readFileSync(f);
  const e = { mtime: st.mtimeMs, roh, gz: GZIP.test(f) ? zlib.gzipSync(roh, { level: 6 }) : null, etag: '"' + crypto.createHash('md5').update(roh).digest('hex').slice(0, 16) + '"' };
  cache.set(f, e);
  return e;
}
// gemeinsame Leitung: alle Antworten teilen sich BPS (Token-Eimer in 10-ms-Scheiben)
let frei = Date.now();
function sende(stream, buf, fertig) {
  if (!BPS) { stream.end(buf); fertig(); return; }
  let o = 0;
  const stueck = () => {
    if (stream.destroyed) { fertig(); return; }
    const n = Math.min(buf.length - o, Math.max(1024, Math.round(BPS * 0.01)));
    const jetzt = Date.now();
    frei = Math.max(frei, jetzt) + n / BPS * 1000;
    const warte = Math.max(0, frei - jetzt - 10);
    setTimeout(() => {
      if (stream.destroyed) { fertig(); return; }
      const teil = buf.subarray(o, o + n); o += n;
      if (o >= buf.length) { stream.end(teil); fertig(); } else stream.write(teil, stueck);
    }, warte);
  };
  stueck();
}
const logF = LOG ? fs.openSync(LOG, 'a') : null;
const T0 = Date.now();
const srv = http2.createSecureServer({ key: fs.readFileSync(path.join(certDir, 'key.pem')), cert: fs.readFileSync(path.join(certDir, 'cert.pem')) });
srv.on('stream', (stream, h) => {
  const tAn = Date.now();
  let p = decodeURIComponent((h[':path'] || '/').split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(wurzel, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  setTimeout(() => {
    let e;
    try { if (!f.startsWith(wurzel) || !fs.statSync(f).isFile()) throw 0; e = lies(f); } catch {
      if (!stream.destroyed) { stream.respond({ ':status': 404 }); stream.end('404'); }
      return;
    }
    if (stream.destroyed) return;
    const ext = path.extname(f).toLowerCase();
    const head = { 'content-type': TYP[ext] || 'application/octet-stream', 'cache-control': 'max-age=600', etag: e.etag, 'access-control-allow-origin': '*' };
    if (ext === '.html') head['document-policy'] = 'js-profiling';   // n42: JS-Self-Profiling für die Hänger-Ursachen
    if (h['if-none-match'] === e.etag) { stream.respond({ ':status': 304, ...head }); stream.end(); log(p, 304, 0, tAn); return; }
    const gz = e.gz && /gzip/.test(h['accept-encoding'] || '');
    const body = gz ? e.gz : e.roh;
    stream.respond({ ':status': 200, ...head, ...(gz ? { 'content-encoding': 'gzip', vary: 'Accept-Encoding' } : {}), 'content-length': body.length });
    sende(stream, body, () => log(p, 200, body.length, tAn));
  }, RTT);
  stream.on('error', () => {});
});
function log(p, st, n, tAn) {
  if (logF) fs.writeSync(logF, JSON.stringify({ p, st, n, an: tAn - T0, ende: Date.now() - T0 }) + '\n');
}
srv.listen(port, '127.0.0.1', () => console.log(`n42-Server https://127.0.0.1:${port}/ (${wurzel}) rtt ${RTT} ms, ${KBIT} kbit/s`));
