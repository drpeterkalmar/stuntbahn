#!/usr/bin/env python3
"""Trystero ins Repo legen (n35 Online-Mehrspieler): gepinnte Versionen per `npm pack` holen (nur Download, keine
Installation, kein Bundler), die fertigen ESM-Dateien nach vendor/trystero/ kopieren und die Paket-Importe
("@trystero-p2p/core", "@noble/secp256k1", "mqtt") auf relative Pfade umschreiben. So lädt der Browser die Dateien
ohne Import-Map und ohne CDN; Node kann sie für Tests importieren.

Aufruf:  python3 tools/vendor_trystero.py          (holt und schreibt neu)
         python3 tools/vendor_trystero.py --pruefen (nur prüfen, ob vendor/ zur Pin-Liste passt: Prüfsummen)

Geprüft (Quellcode 0.26.0, 18.10.2026): Nostr nutzt 5 von 29 fest eingetragenen Relays (Auswahl gemischt nach appId,
`getRelays(config, defaultRelayUrls, 5, true)`), MQTT alle 4 Broker (emqx, shiftr, hivemq, mosquitto). STUN: stun.l.google.com,
stun1/stun2.l.google.com:19302, stun.cloudflare.com:3478. Kein TURN. Ein zuverlässiger, geordneter Datenkanal je Peer.
"""
import hashlib, json, os, re, shutil, subprocess, sys, tarfile, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'vendor', 'trystero')
# Pin-Liste: Paket → Version (alle Abhängigkeiten der Strategien Nostr + MQTT, nichts sonst)
PINS = {
    '@trystero-p2p/core': '0.26.0',
    '@trystero-p2p/nostr': '0.26.0',
    '@trystero-p2p/mqtt': '0.26.0',
    '@noble/secp256k1': '3.2.0',
    'mqtt': '5.16.1',
}
# Ersetzungen der Paket-Importe (je Zieldatei relativ)
UMBAU = {
    'nostr.mjs': {'@noble/secp256k1': './noble-secp256k1.js', '@trystero-p2p/core': './core/index.mjs'},
    'mqtt.mjs': {'mqtt': './mqtt.esm.js', '@trystero-p2p/core': './core/index.mjs'},
}
MAP_RE = re.compile(r'\n?//# sourceMappingURL=\S+\s*$')


def pack(tmp, name, ver):
    r = subprocess.run(['npm', 'pack', f'{name}@{ver}', '--silent', '--pack-destination', tmp], capture_output=True, text=True, timeout=120)
    if r.returncode:
        sys.exit(f'npm pack {name}@{ver} fehlgeschlagen: {r.stderr}')
    tgz = os.path.join(tmp, r.stdout.strip().splitlines()[-1])
    d = os.path.join(tmp, name.replace('/', '_'))
    with tarfile.open(tgz) as t:
        t.extractall(d, filter='data')
    return os.path.join(d, 'package')


def umschreiben(text, ersatz):
    for alt, neu in ersatz.items():
        text = text.replace(f'from "{alt}"', f'from "{neu}"').replace(f"from '{alt}'", f"from '{neu}'")
    return MAP_RE.sub('\n', text)


def schreiben(pfad, text):
    os.makedirs(os.path.dirname(pfad), exist_ok=True)
    with open(pfad, 'w', encoding='utf-8') as f:
        f.write(text)


def sha(pfad):
    with open(pfad, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def holen():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    with tempfile.TemporaryDirectory() as tmp:
        P = {n: pack(tmp, n, v) for n, v in PINS.items()}
        core = os.path.join(P['@trystero-p2p/core'], 'dist')
        for f in sorted(os.listdir(core)):
            if f.endswith('.mjs'):
                with open(os.path.join(core, f), encoding='utf-8') as h:
                    t = h.read()
                bare = [m for m in re.findall(r'from\s+["\']([^"\']+)["\']', t) if not m.startswith('.')]
                if bare:
                    sys.exit(f'core/{f} importiert unerwartet {bare}')
                schreiben(os.path.join(OUT, 'core', f), MAP_RE.sub('\n', t))
        for name, ziel in (('@trystero-p2p/nostr', 'nostr.mjs'), ('@trystero-p2p/mqtt', 'mqtt.mjs')):
            with open(os.path.join(P[name], 'dist', 'index.mjs'), encoding='utf-8') as h:
                t = umschreiben(h.read(), UMBAU[ziel])
            bare = [m for m in re.findall(r'from\s+["\']([^"\']+)["\']', t) if not m.startswith('.')]
            if bare:
                sys.exit(f'{ziel}: Import nicht umgeschrieben: {bare}')
            schreiben(os.path.join(OUT, ziel), t)
        shutil.copy(os.path.join(P['@noble/secp256k1'], 'index.js'), os.path.join(OUT, 'noble-secp256k1.js'))
        with open(os.path.join(P['mqtt'], 'dist', 'mqtt.esm.js'), encoding='utf-8') as h:
            schreiben(os.path.join(OUT, 'mqtt.esm.js'), MAP_RE.sub('\n', h.read()))
        shutil.copy(os.path.join(P['@trystero-p2p/core'], 'LICENSE'), os.path.join(OUT, 'LICENSE'))
        shutil.copy(os.path.join(P['@noble/secp256k1'], 'LICENSE'), os.path.join(OUT, 'LICENSE-noble-secp256k1'))
        shutil.copy(os.path.join(P['mqtt'], 'LICENSE.md') if os.path.exists(os.path.join(P['mqtt'], 'LICENSE.md')) else os.path.join(P['mqtt'], 'LICENSE'), os.path.join(OUT, 'LICENSE-mqtt'))
    dateien = {}
    for d, _, fs in os.walk(OUT):
        for f in sorted(fs):
            p = os.path.join(d, f)
            dateien[os.path.relpath(p, OUT)] = sha(p)
    schreiben(os.path.join(OUT, 'VERSION.json'), json.dumps({'pins': PINS, 'sha256': dict(sorted(dateien.items()))}, indent=1, ensure_ascii=False) + '\n')
    print(f'vendor/trystero: {len(dateien)} Dateien, {sum(os.path.getsize(os.path.join(OUT, k)) for k in dateien) // 1024} kB')


def pruefen():
    with open(os.path.join(OUT, 'VERSION.json'), encoding='utf-8') as f:
        V = json.load(f)
    if V['pins'] != PINS:
        sys.exit('Pin-Liste weicht ab')
    bad = [k for k, h in V['sha256'].items() if not os.path.exists(os.path.join(OUT, k)) or sha(os.path.join(OUT, k)) != h]
    if bad:
        sys.exit(f'geändert/fehlt: {bad}')
    print(f'vendor/trystero ok ({len(V["sha256"])} Dateien, Pins {PINS["@trystero-p2p/core"]})')


if __name__ == '__main__':
    pruefen() if '--pruefen' in sys.argv else holen()
