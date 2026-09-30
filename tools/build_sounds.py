# Baut aus den CC0-Aufnahmen in assets_src/snd/ (tools/fetch_sounds.py) die Tondatei des Spiels:
#   assets/snd/sfx.m4a  – alle Klänge hintereinander, mono, 44,1 kHz, AAC 96 kbit/s (iOS + Android)
#   assets/snd/sfx.json – Lage jedes Klangs (Samples), Loop-Überblendung, Drehzahl der Motor-Loops
# Motor: aus einem Prüfstandslauf (Hochlauf unter Last, danach Schiebebetrieb) werden kurze Stücke geschnitten und
# „geglättet“: Die Tonhöhe wird mit der gemessenen Grundfrequenz (Harmonischen-Kamm) Schritt für Schritt auf einen
# festen Wert gezogen (Phase = ∫f dt, gleichmäßig neu abgetastet). So entsteht je Stück ein Loop mit exakt ganzzahlig
# vielen Arbeitsspielen, der sich ohne Knacken wiederholt. Im Spiel wird zwischen benachbarten Loops überblendet und
# die Tonhöhe per Abspielrate der Drehzahl nachgeführt (src/audio/sound.js).
# Aufruf: python3 tools/build_sounds.py   (braucht ffmpeg + numpy)
import json, os, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets_src', 'snd')
OUT = os.path.join(ROOT, 'assets', 'snd')
SR = 44100
REDLINE, F_RED = 7600, 405.0   # Drehzahl der Spielphysik ↔ Grundfrequenz (hohe Oktave) der Aufnahme am Begrenzer

def load(sid, start=0.0, dur=None, af=None):
    cmd = ['ffmpeg', '-v', 'error', '-ss', f'{start}', '-i', os.path.join(SRC, f'{sid}.mp3')]
    if dur: cmd += ['-t', f'{dur}']
    if af: cmd += ['-af', af]
    cmd += ['-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32).astype(np.float64)

# ---------- Motor ----------
def fine_f0(x, t, lo, hi, win=4096, nh=12):
    i = int(t * SR - win / 2); seg = x[max(0, i):max(0, i) + win]
    if len(seg) < win: seg = np.pad(seg, (0, win - len(seg)))
    m = np.abs(np.fft.rfft(seg * np.hanning(win), 4 * win)); fr = np.fft.rfftfreq(4 * win, 1 / SR)
    lm = np.log(m + 1e-6 * m.max() + 1e-12)
    c = np.arange(lo, hi, 0.25)
    return c[np.argmax(sum(np.interp(c * h, fr, lm) for h in range(1, nh + 1)))]

# Führung der Tonhöhe (hohe Oktave, Hz) über die Aufnahme 496171: Leerlauf, Hochlauf unter Last, Schiebebetrieb
GUIDE = [(0.3, 104), (1.8, 104), (12.6, 162), (16, 175), (20, 199), (21, 222), (22, 251), (23, 305), (24.3, 374), (25.4, 416),
         (26.4, 298), (27.0, 250), (27.3, 222)]
ENGINE = {   # Name: (Zeitfenster zum Suchen, Ziel-Grundfrequenz hohe Oktave) – Last, Schiebebetrieb, Leerlauf
    'idle': ((0.4, 1.7), None),
    'on1': ((12.6, 25.4), 175), 'on2': ((12.6, 25.4), 205), 'on3': ((12.6, 25.4), 245),
    'on4': ((12.6, 25.4), 295), 'on5': ((12.6, 25.4), 350), 'on6': ((12.6, 25.4), 405),
    'off1': ((25.5, 27.25), 255), 'off2': ((25.5, 27.25), 320), 'off3': ((25.5, 27.25), 385),
}

def engine_loop(x, win, target, loop_s=0.36, xcyc=3):
    gt, gf = np.array(GUIDE).T
    ts = np.arange(win[0], win[1], 0.01)
    fs = np.array([fine_f0(x, t, np.interp(t, gt, gf) * 0.9, np.interp(t, gt, gf) * 1.1) for t in ts])
    # glätten (gleitendes Mittel 7) – der Hochlauf ist stetig
    k = 7; fsm = np.convolve(np.pad(fs, k // 2, mode='edge'), np.ones(k) / k, mode='valid')
    if target is None: tc = (win[0] + win[1]) / 2; target = float(np.median(fsm))
    else: tc = float(ts[np.argmin(np.abs(fsm - target))])
    flo = target / 2                                   # Arbeitsspiel (tiefe Oktave)
    ncyc = max(4, int(round(loop_s * flo)))
    # Phase (in Arbeitsspielen) über ein feines Zeitgitter
    tg = np.arange(ts[0], ts[-1], 1 / 2000); fg = np.interp(tg, ts, fsm) / 2
    ph = np.concatenate([[0], np.cumsum((fg[1:] + fg[:-1]) / 2 / 2000)])
    pc = np.interp(tc, tg, ph); p0 = pc - (ncyc + xcyc) / 2
    n = int(round(ncyc / flo * SR)); nx = int(round(xcyc / flo * SR))
    j = np.arange(n + nx)
    tsrc = np.interp(p0 + j * flo / SR, ph, tg)        # Quellzeit je Ausgabe-Sample (Tonhöhe fest)
    y = np.interp(tsrc * SR, np.arange(len(x)), x)
    rpm = target / F_RED * REDLINE
    return y, n, nx, rpm, target, tc

# ---------- Einzelklänge (Quelle, Start s, Dauer s, ffmpeg-Filter, Loop-Überblendung s) ----------
# Handy-Lautsprecher (n16-Nachtrag): Körper bei 300–700 Hz betont, oben sanft gekappt – sonst bleibt am Handy nur
# Zischeln übrig („Bratenfett“). Glas nur bei schweren Crashs, darf heller bleiben.
BODY = 'highpass=f=45,equalizer=f=480:t=q:w=1.2:g=3,lowpass=f=4200'
CLIPS = {
    'tireA': (614627, 28.0, 2.0, 'highpass=f=250,lowpass=f=3200', 0.15),
    'tireB': (178889, 4.4, 2.0, 'highpass=f=250,lowpass=f=3200', 0.15),
    'scrape': (534853, 2.8, 2.6, 'highpass=f=120,equalizer=f=450:t=q:w=1:g=3,lowpass=f=2800', 0.2),
    'crunchA': (237375, 0.36, 1.4, BODY, 0),
    'crunchB': (420356, 0.0, 1.5, BODY, 0),
    'thud': (386798, 0.0, 0.7, 'highpass=f=35,equalizer=f=400:t=q:w=1:g=4,lowpass=f=3500', 0),
    'hood': (329516, 0.1, 1.1, BODY, 0),
    'landA': (467230, 0.03, 0.37, BODY, 0),
    'landB': (467230, 0.42, 0.30, BODY, 0),
    'landC': (467230, 0.70, 0.29, BODY, 0),
    'debris': (703248, 0.0, 2.3, 'highpass=f=80,equalizer=f=600:t=q:w=1:g=2,lowpass=f=3800', 0),
    'glass': (221528, 0.25, 1.1, 'highpass=f=300,lowpass=f=6000', 0),
    'popA': (105351, 0.0, 0.35, 'highpass=f=60,equalizer=f=500:t=q:w=1:g=3,lowpass=f=3500', 0),
    'popB': (385935, 0.12, 0.33, 'highpass=f=60,lowpass=f=3500', 0),
}

def trim_onset(y, pre=0.004):
    pk = np.max(np.abs(y)) or 1
    i = int(np.argmax(np.abs(y) > pk * 0.03))
    return y[max(0, i - int(pre * SR)):]

def fade(y, fin=0.003, fout=0.08):
    y = y.copy(); a = int(fin * SR); b = min(len(y), int(fout * SR))
    if a: y[:a] *= np.linspace(0, 1, a)
    if b: y[-b:] *= np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    return y

def rms_db(y): return 20 * np.log10(np.sqrt(np.mean(y ** 2)) + 1e-12)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    parts, items = [], {}
    pos = 0
    def put(name, y, n=None, x=0, **extra):
        global pos
        items[name] = {'o': pos, 'n': int(n if n is not None else len(y)), 'x': int(x), **extra}
        parts.append(y); parts.append(np.zeros(int(0.03 * SR))); pos += len(y) + int(0.03 * SR)
    # Marke: einzelner Impuls bei 0,05 s → Versatz des Decoders (AAC-Vorlauf) wird im Spiel gemessen
    head = np.zeros(int(0.15 * SR)); head[int(0.05 * SR)] = 0.9
    parts.append(head); pos = len(head)
    x = load(496171, af='highpass=f=30')
    for name, (win, target) in ENGINE.items():
        y, n, nx, rpm, f, tc = engine_loop(x, win, target)
        y = y * 10 ** ((-17 - rms_db(y[:n])) / 20)          # alle Motor-Loops gleich laut (−17 dBFS RMS)
        put(name, y, n, nx, rpm=round(rpm), f=round(f, 1), t=round(tc, 2))
        print(f'{name:5s} f {f:6.1f} Hz  rpm {rpm:5.0f}  bei {tc:5.2f} s  {n / SR:.3f} s  (+{nx / SR:.3f} s Überblendung)')
    for name, (sid, st, dur, af, xf) in CLIPS.items():
        if xf:
            y = load(sid, st, dur + xf, af); n = len(y) - int(xf * SR)
            y = y * 10 ** ((-20 - rms_db(y)) / 20)
            put(name, y, n, int(xf * SR))
        else:
            y = fade(trim_onset(load(sid, st, dur, af)))
            y = y * 10 ** (-1 / 20) / (np.max(np.abs(y)) or 1)   # Spitze −1 dBFS
            put(name, y)
        print(f'{name:7s} {items[name]["n"] / SR:.2f} s  RMS {rms_db(y):6.1f} dBFS')
    wav = np.concatenate(parts).astype(np.float32)
    assert np.max(np.abs(wav)) <= 1.0, 'Übersteuerung'
    tmp = os.path.join(OUT, '_sfx.f32')
    wav.tofile(tmp)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', tmp, '-c:a', 'aac', '-b:a', '96k',
                    '-movflags', '+faststart', os.path.join(OUT, 'sfx.m4a')], check=True)
    os.remove(tmp)
    json.dump({'sr': SR, 'marker': int(0.05 * SR), 'redline': REDLINE, 'items': items}, open(os.path.join(OUT, 'sfx.json'), 'w'), indent=0)
    print('sfx.m4a', os.path.getsize(os.path.join(OUT, 'sfx.m4a')), 'Byte,', round(len(wav) / SR, 1), 's')
