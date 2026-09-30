# Lädt die Ton-Quellen (freesound.org, nur CC0) reproduzierbar nach assets_src/snd/ (nicht im Repo) und prüft dabei
# auf der Seite jedes Klangs die Lizenz (Creative Commons 0). Geladen wird die öffentliche HQ-Vorschau (MP3 128 kbit/s,
# ohne Anmeldung) – für das Spiel wird ohnehin neu nach AAC kodiert. Danach: python3 tools/build_sounds.py
# Aufruf: python3 tools/fetch_sounds.py
import html, json, os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(ROOT, 'assets_src', 'snd')
UA = {'User-Agent': 'Mozilla/5.0 (stuntbahn-sound-fetch)'}
# freesound-ID: wofür
SOURCES = {
    496171: 'Motor: Prüfstandslauf (Last-Hochlauf + Schiebebetrieb), Leerlauf',
    237375: 'Crash: Blech-Knirschen',
    420356: 'Crash: Blech-Knirschen (zweite Variante)',
    386798: 'Crash: Aufprall-Wumms (Metallkörper)',
    329516: 'Aufprall/Landung: Motorhaube',
    467230: 'Landungen: Sprünge auf eine Motorhaube',
    703248: 'Crash: rieselnde Trümmer',
    221528: 'Crash (schwer): Glas',
    534853: 'Schleifen an Leitplanke/Wand',
    614627: 'Reifenquietschen',
    178889: 'Reifenquietschen (zweite Variante)',
    105351: 'Fehlzündung (tief)',
    385935: 'Fehlzündung (hell)',
}

def fetch(sid):
    r = urllib.request.urlopen(urllib.request.Request(f'https://freesound.org/s/{sid}/', headers=UA), timeout=60)
    page, url = r.read().decode(), r.geturl()
    lic = sorted(set(re.findall(r'creativecommons\.org/(publicdomain/zero/1\.0|licenses/[a-z-]+/[0-9.]+)', page)))
    if not lic or any(not l.startswith('publicdomain/zero') for l in lic):
        sys.exit(f'{sid}: Lizenz nicht CC0 ({lic}) – abgebrochen')
    mp3 = re.search(r'data-mp3="([^"]+)"', page).group(1).replace('-lq.', '-hq.')
    user = re.search(r'/people/([^/]+)/sounds/', url).group(1)
    title = html.unescape(re.search(r'data-title="([^"]*)"', page).group(1))
    dest = os.path.join(DST, f'{sid}.mp3')
    if not os.path.exists(dest):
        data = urllib.request.urlopen(urllib.request.Request(mp3, headers=UA), timeout=120).read()
        open(dest, 'wb').write(data)
    return {'id': sid, 'title': title, 'user': urllib.parse.unquote(user), 'page': url, 'license': 'CC0 1.0', 'use': SOURCES[sid]}

if __name__ == '__main__':
    import urllib.parse
    os.makedirs(DST, exist_ok=True)
    meta = []
    for sid in SOURCES:
        for i in range(4):
            try: meta.append(fetch(sid)); break
            except Exception as e:
                if i == 3: raise
                print('nochmal', sid, e); time.sleep(2 * (i + 1))
        print('ok', sid, meta[-1]['user'], '|', meta[-1]['title'])
    json.dump(meta, open(os.path.join(DST, 'quellen.json'), 'w'), indent=1, ensure_ascii=False)
