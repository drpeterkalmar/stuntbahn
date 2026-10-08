// Grafik-Kern, Baustein 3 (n30): Qualitäts-Autopilot – reine Logik, ohne three.js, ohne DOM. Kopierbar in andere Spiele
// (Bandenkick, Schmetterlingswiese): Datei nach src/gfx/kern/ legen, im Spiel ein paar Zeilen Anschluss (siehe unten).
//
// Was er anders macht als die alte Automatik (fps-Mittel alle 1,5 s):
//   • misst ARBEITSZEIT je Bild: CPU-Zeit (Bildanfang bis Ende des Zeichnens) und, wenn der Browser es kann, die GPU-Zeit
//     (EXT_disjoint_timer_query_webgl2, Klasse GpuZeit). Damit sieht er auch LUFT nach oben, nicht nur Ruckeln.
//     Ohne GPU-Zeit bleibt nur der Bildabstand (rAF) – dann tastet er sich vorsichtig nach oben (Probe mit Sperre).
//   • regelt in festen Schritten: Renderskala stufenlos (gerastert auf 0,02) → registrierte Dinge der Reihe nach
//     (z. B. teure Deko → Auto-Schatten → Stufe), und mit Hysterese auch wieder AUFWÄRTS (rückwärts, zuletzt Abgeschaltetes
//     zuerst wieder an).
//   • pendelt nicht: Runter erst nach 2 schlechten Fenstern in Folge (≈ 1 s), rauf erst nach 6 guten (≈ 3 s). Scheitert ein
//     Schritt nach oben (innerhalb von 4 s wieder runter), wird „rauf“ gesperrt – 8 s, dann 16, 32 … bis 120 s.
//   • CPU-gebunden (GPU-Zeit bekannt und klein)? Dann bringt die Renderskala nichts – er überspringt sie und nimmt gleich
//     das nächste registrierte Ding.
//   • Schonzeit nach Start/Szenenwechsel (Shader-Übersetzen, Texturen hochladen): diese Bilder zählen nicht.
//
// Anschluss (Beispiel):
//   const ap = new GrafikAutopilot({ skala: { min: 0.7, max: 1, start: 0.85, setzen: (s) => { kino.renderScale = s; } } });
//   ap.register('deko', 0.08, (stufe) => { decoLite = stufe === 0; });                 // 1 = an, 0 = aus
//   ap.register('schatten', 0.06, (stufe) => { sun.castShadow = stufe > 0; });
//   ap.register('stufe', 0.3, (stufe, richtung) => { setTier(stufe); return { skala: [lo, hi, start] }; },
//     { stufen: 2, start: 2, raufBeiSkalaMax: true });
//   je Bild: ap.bild(abstandSek, cpuMs, gpu.ms)      (gpu = new GpuZeit(gl); gpu.anfang() … gpu.ende() um das Zeichnen)
//   Szenenwechsel/Laden: ap.schonen(1.5);   Spiel-eigenes „zuerst opfern“: new GrafikAutopilot({ vorRunter: () => … })
//   Zustand für Tests/Bericht: ap.zustand(), letzte Entscheidungen: ap.log
//
// Einheiten: Sekunden für Zeitspannen, Millisekunden für Arbeitszeiten. Zeit läuft über die übergebenen Bildabstände
// (kein performance.now() im Kern) → in Node mit künstlicher Last testbar (tests/node/test_autopilot.mjs).

export const AP_STANDARD = {
  zielFps: 60,
  fenster: 0.5,        // s je Messfenster
  runterNach: 2,       // schlechte Fenster in Folge bis „runter“
  raufNach: 6,         // gute Fenster in Folge bis „rauf“
  ruhe: 1,             // Fenster nach jeder Änderung, die nicht zählen (Render-Target neu, Wirkung abwarten)
  arbeitRunter: 0.92,  // Arbeitszeit > 92 % des Bildtakts → zu langsam (mit GPU-Zeit)
  arbeitLuft: 0.68,    // Arbeitszeit < 68 % → Luft nach oben (mit GPU-Zeit)
  arbeitZiel: 0.82,    // Ziel beim Nachführen der Renderskala nach unten
  arbeitRauf: 0.88,    // nach oben nur, wenn die Vorhersage darunter bleibt (Abstand zu „runter“ = Hysterese)
  fpsRunter: 52,       // Bildrate darunter → zu langsam (immer, auch ohne GPU-Zeit; wie die alte Automatik)
  fpsLuft: 58.5,       // Bildrate darüber → ohne GPU-Zeit „vielleicht Luft“ (Probe)
  fpsStufe: 45,        // ohne GPU-Zeit: Stufe erst unter dieser Bildrate opfern (wie bisher)
  skalaRaster: 0.02,
  skalaRunterMax: 0.12, skalaRunterMin: 0.04, skalaRaufMax: 0.06, skalaRaufMin: 0.02,
  probeZeit: 4,        // s: fällt es so kurz nach einem Schritt nach oben wieder, war der Schritt zu viel
  sperreBasis: 8, sperreMax: 120,
  schonStart: 1.5,     // s Schonzeit beim Start
  trim: 0.1,           // obere 10 % je Fenster verwerfen (einzelne Hänger sind kein Dauerzustand)
  cpuGebunden: 1.25,   // CPU-Zeit > 1,25 × GPU-Zeit → CPU ist der Engpass
};

// Mittelwert ohne die oberen trim-Anteile (robust gegen Einzelhänger, sieht aber Dauerlast)
export function gestutztesMittel(werte, trim = 0.1) {
  if (!werte.length) return NaN;
  const a = werte.slice().sort((x, y) => x - y);
  const n = Math.max(1, Math.ceil(a.length * (1 - trim)));
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i];
  return s / n;
}

const raster = (s, r) => Math.round(s / r) * r;
const klemme = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class GrafikAutopilot {
  constructor(opts = {}) {
    this.o = { ...AP_STANDARD, ...(opts.einstellungen || {}) };
    const sk = opts.skala || {};
    this.skalaMin = sk.min ?? 0.6; this.skalaMax = sk.max ?? 1;
    this.skala = klemme(sk.start ?? this.skalaMax, this.skalaMin, this.skalaMax);
    this.skalaSetzen = sk.setzen || null;
    this.dinge = [];              // registrierte Stellschrauben in Abschalt-Reihenfolge
    this.stapel = [];             // abgeschaltete Schritte (zuletzt oben) → rauf in umgekehrter Reihenfolge
    this.t = 0;                   // Uhr aus den Bildabständen
    this.schonBis = this.o.schonStart;
    this.puffer = { abstand: [], arbeit: [], cpu: [], gpu: [], zeit: 0 };
    this.schlecht = 0; this.gut = 0; this.ruheRest = 0;
    // Sperre nach gescheitertem Schritt nach oben gilt nur für DIESEN Schritt: Renderskala darunter bleibt erlaubt
    // (sperreSkala = die zu hohe Skala), ein Ding (sperreDing) bleibt aus; anderes darf weiter rauf
    this.sperreBis = 0; this.sperreDauer = this.o.sperreBasis; this.letzterRauf = -1e9; this.letzteSperre = -1e9;
    this.letzterRaufWas = null; this.sperreSkala = Infinity; this.sperreDing = null;
    this.fps = this.o.zielFps; this.arbeit = null; this.engpass = null;
    // Kostenmodell der GPU-Arbeit: A(s) = fest + pix · s² (aus zwei Messungen bei verschiedener Renderskala gelernt;
    // vorher rein pixelabhängig angenommen → vorsichtig). ref = letzte gültige Messung { s, A }
    this.modell = { fest: 0, pix: null }; this.ref = null;
    this.aenderungen = 0; this.log = [];
    this.aktiv = opts.aktiv !== false;
    this.onAenderung = opts.onAenderung || null;
    // vorRunter(): Spiel-eigenes „zuerst opfern“ (z. B. Bewegungsunschärfe). true = erledigt, kein eigener Schritt
    this.vorRunter = opts.vorRunter || null;
  }

  // Stellschraube anmelden. kosten = geschätzter Anteil an der Bildzeit (0…1; für die Entscheidung „passt das wieder rein?“).
  // setzer(stufe, richtung) bekommt die neue Stufe (0 = aus … stufen = voll) und −1/+1; darf { skala: [min, max, start] }
  // zurückgeben (z. B. eine Grafikstufe mit eigenem Renderskalen-Bereich).
  // opts: stufen (Standard 1 = an/aus), start (Standard = stufen), min (tiefste erlaubte Stufe, Standard 0),
  //       raufBeiSkalaMax (erst wieder hoch, wenn die Renderskala am Maximum ist – für die Grafikstufe)
  register(name, kosten, setzer, opts = {}) {
    const stufen = opts.stufen ?? 1;
    const d = { name, kosten: +kosten || 0, setzer, stufen, stufe: opts.start ?? stufen, min: opts.min ?? 0, raufBeiSkalaMax: !!opts.raufBeiSkalaMax };
    this.dinge.push(d);
    return d;
  }
  ding(name) { return this.dinge.find((d) => d.name === name) || null; }
  setSkalaBereich(min, max, start) {
    this.skalaMin = min; this.skalaMax = max;
    this.setzeSkala(start ?? this.skala, true);
  }
  // Schonzeit (Szenenwechsel, Laden): Bilder zählen nicht, Fenster beginnt neu
  schonen(sek = 1.5) { this.schonBis = Math.max(this.schonBis, this.t + sek); this.leeren(); this.schlecht = this.gut = 0; }
  leeren() { const p = this.puffer; p.abstand.length = p.arbeit.length = p.cpu.length = p.gpu.length = 0; p.zeit = 0; }

  // Ein Bild: abstand = rAF-Abstand in s, cpuMs = Arbeitszeit der CPU für dieses Bild, gpuMs = letzte gemessene GPU-Zeit
  // (oder null). Liefert true, wenn sich etwas geändert hat.
  bild(abstand, cpuMs = null, gpuMs = null) {
    if (!(abstand > 0) || abstand > 0.5) return false;   // Tab im Hintergrund, Haltepunkt, Pause
    this.t += abstand;
    if (this.t < this.schonBis) return false;
    const p = this.puffer;
    p.abstand.push(abstand * 1000);
    if (cpuMs != null && cpuMs >= 0) p.cpu.push(cpuMs);
    if (gpuMs != null && gpuMs > 0 && gpuMs < 250) p.gpu.push(gpuMs);
    p.zeit += abstand;
    if (p.zeit < this.o.fenster) return false;
    const r = this.auswerten();
    this.leeren();
    return r;
  }

  // Fenster auswerten → höchstens ein Schritt
  auswerten() {
    const o = this.o, p = this.puffer, takt = 1000 / o.zielFps;
    const ab = gestutztesMittel(p.abstand, o.trim);
    this.fps = 1000 / ab;
    const cpu = p.cpu.length ? gestutztesMittel(p.cpu, o.trim) : null;
    // GPU-Zeit nur, wenn genug Messwerte im Fenster (Ergebnisse kommen 1–3 Bilder verspätet)
    const gpu = p.gpu.length >= p.abstand.length * 0.4 ? gestutztesMittel(p.gpu, o.trim) : null;
    this.cpu = cpu; this.gpu = gpu;
    this.arbeit = gpu != null ? Math.max(gpu, cpu ?? 0) : null;
    this.engpass = gpu != null && cpu != null ? (cpu > gpu * o.cpuGebunden ? 'cpu' : 'gpu') : null;
    if (!this.aktiv) return false;
    if (this.ruheRest > 0) { this.ruheRest--; return false; }
    const A = this.arbeit;
    if (A != null) this.lerne(A);
    const zuLangsam = this.fps < o.fpsRunter || (A != null && A > takt * o.arbeitRunter);
    // Luft: mit GPU-Zeit echt gemessen (der nächste Schritt passt laut Vorhersage); ohne nur „Bildrate voll“ → Probe
    // (die Sperre fängt Fehlversuche)
    const luft = !zuLangsam && this.fps >= o.fpsLuft && (A == null || A < takt * o.arbeitLuft || this.raufPasst());
    if (zuLangsam) { this.schlecht++; this.gut = 0; } else if (luft) { this.gut++; this.schlecht = 0; } else { this.schlecht = 0; this.gut = 0; }
    if (this.schlecht >= o.runterNach) {
      this.schlecht = 0;
      // Fiel es kurz nach einem Schritt nach oben? → rauf sperren (doppelt so lange wie zuletzt)
      if (this.t - this.letzterRauf < o.probeZeit) {
        // erster Fehlversuch (oder lange her): Grundsperre; sonst doppelt so lange wie zuletzt
        this.sperreDauer = this.t - this.letzteSperre < o.sperreMax * 2 ? Math.min(o.sperreMax, this.sperreDauer * 2) : o.sperreBasis;
        this.sperreBis = this.t + this.sperreDauer; this.letzteSperre = this.t;
        this.letzterRauf = -1e9;
        // zurück auf den letzten guten Stand (statt weiter unten zu landen) und genau diesen Schritt sperren
        if (this.letzterRaufWas === 'skala') {
          this.sperreSkala = this.vorRaufSkala + this.o.skalaRaster; this.sperreDing = null;
          if (this.setzeSkala(this.vorRaufSkala)) return this.geaendert('skala', -1);
        } else {
          this.sperreSkala = Infinity; this.sperreDing = this.letzterRaufWas;
          const d = this.ding(this.letzterRaufWas);
          if (d && d.stufe > d.min) { this.stapel.push({ d, skala: this.skala }); this.setzeDing(d, d.stufe - 1, -1); return this.geaendert(d.name, -1); }
        }
      }
      if (this.vorRunter && this.vorRunter()) return this.geaendert('vorab', -1);
      return this.runter();
    }
    if (this.gut >= o.raufNach) {
      this.gut = 0;
      if (this.t >= this.sperreBis) { this.sperreSkala = Infinity; this.sperreDing = null; }
      return this.rauf();
    }
    return false;
  }

  // ---------- Kostenmodell ----------
  // pix aus zwei Messungen bei verschiedener Skala (ohne andere Änderung dazwischen), fest laufend nachgeführt
  lerne(A) {
    const M = this.modell, s = this.skala, r = this.ref;
    if (r && Math.abs(r.s * r.s - s * s) > 0.02) {
      const pix = (r.A - A) / (r.s * r.s - s * s);
      if (pix > 0 && Number.isFinite(pix)) M.pix = pix;
    }
    if (M.pix != null) {
      M.fest = A - M.pix * s * s;
      if (M.fest < 0) { M.pix = A / (s * s); M.fest = 0; }   // Modell passt nicht mehr → rein pixelabhängig
    }
    this.ref = { s, A };
  }
  vorhersage(s) {
    const M = this.modell, A = this.arbeit;
    if (A == null) return null;
    if (M.pix == null) return A * (s * s) / (this.skala * this.skala);
    return M.fest + M.pix * s * s;
  }
  // Skala, bei der die Vorhersage `ziel` ms ergibt
  skalaFuer(ziel) {
    const M = this.modell, A = this.arbeit, s = this.skala;
    if (M.pix == null) return s * Math.sqrt(ziel / A);
    const rest = ziel - M.fest;
    return rest > 0 ? Math.sqrt(rest / M.pix) : 0;
  }
  raufPasst() {
    const o = this.o, takt = 1000 / o.zielFps, A = this.arbeit;
    const oben = this.stapel[this.stapel.length - 1];
    if (oben && oben.d.name !== this.sperreDing && this.skalaOkFuer(oben) && A * (1 + oben.d.kosten) < takt * o.arbeitRauf) return true;
    if (this.skala < this.obergrenze() - 1e-6) return this.vorhersage(Math.min(this.skalaMax, this.skala + o.skalaRaufMin)) < takt * o.arbeitRauf;
    return false;
  }
  obergrenze() { return Math.min(this.skalaMax, this.sperreSkala - this.o.skalaRaster + 1e-6); }
  skalaOkFuer(e) { return e.d.raufBeiSkalaMax ? this.skala >= this.skalaMax - 1e-6 : this.skala >= e.skala - 1e-6; }

  // ---------- Schritte ----------
  runter() {
    const o = this.o, takt = 1000 / o.zielFps, A = this.arbeit;
    // 1. Renderskala (außer CPU-gebunden: dann hilft weniger Pixel nichts)
    if (this.skala > this.skalaMin + 1e-6 && this.engpass !== 'cpu') {
      // Ziel-Skala aus dem Kostenmodell (Arbeitszeit) bzw. aus der Bildrate (Pixelkosten ~ Skala²)
      let neu = A != null ? this.skalaFuer(takt * o.arbeitZiel) : this.skala * Math.sqrt(this.fps / o.zielFps);
      neu = Math.min(this.skala - o.skalaRunterMin, Math.max(this.skala - o.skalaRunterMax, neu));
      if (this.setzeSkala(neu)) return this.geaendert('skala', -1);
    }
    // 2. registrierte Dinge der Reihe nach (eine Stufe je Schritt)
    for (const d of this.dinge) {
      if (d.stufe <= d.min) continue;
      // Grafikstufe ohne GPU-Zeit erst bei deutlichem Ruckeln opfern (wie die alte Automatik: < 45 fps)
      if (d.raufBeiSkalaMax && A == null && this.fps >= o.fpsStufe) continue;
      this.stapel.push({ d, skala: this.skala });
      this.setzeDing(d, d.stufe - 1, -1);
      return this.geaendert(d.name, -1);
    }
    return false;
  }
  rauf() {
    const o = this.o, takt = 1000 / o.zielFps, A = this.arbeit;
    const oben = this.stapel[this.stapel.length - 1];
    if (oben) {
      const d = oben.d;
      // passt es (geschätzt) wieder ins Budget? Ohne GPU-Zeit: Probe
      const passt = A == null || A * (1 + d.kosten) < takt * o.arbeitRauf;
      if (d.name !== this.sperreDing && this.skalaOkFuer(oben) && passt) {
        this.stapel.pop();
        this.setzeDing(d, d.stufe + 1, +1);
        this.letzterRauf = this.t; this.letzterRaufWas = d.name;
        return this.geaendert(d.name, +1);
      }
    }
    const grenze = this.obergrenze();
    if (this.skala < grenze - 1e-6) {
      let neu = A != null ? this.skalaFuer(takt * o.arbeitRauf) : this.skala * (1 + o.skalaRaufMax);
      neu = Math.min(grenze, Math.max(this.skala + o.skalaRaufMin, Math.min(this.skala + o.skalaRaufMax, neu)));
      const vor = this.skala;
      if (this.setzeSkala(neu)) { this.letzterRauf = this.t; this.letzterRaufWas = 'skala'; this.vorRaufSkala = vor; return this.geaendert('skala', +1); }
    }
    return false;
  }
  setzeSkala(s, still = false) {
    const neu = klemme(raster(s, this.o.skalaRaster), this.skalaMin, this.skalaMax);
    const alt = this.skala;
    this.skala = +neu.toFixed(4);
    if (this.skalaSetzen && (still || Math.abs(neu - alt) > 1e-6)) this.skalaSetzen(this.skala);
    return Math.abs(neu - alt) > 1e-6;
  }
  setzeDing(d, stufe, richtung) {
    d.stufe = stufe;
    // andere Kosten → Festanteil neu lernen; neue Grafikstufe (MSAA, AO …) → ganzes Modell neu
    this.ref = null;
    if (d.raufBeiSkalaMax) this.modell = { fest: 0, pix: null };
    const r = d.setzer ? d.setzer(stufe, richtung) : null;
    if (r && r.skala) {
      const [lo, hi, st] = r.skala;
      this.setSkalaBereich(lo, hi, st ?? (richtung > 0 ? lo : hi));
    }
  }
  geaendert(was, richtung) {
    this.aenderungen++;
    this.ruheRest = this.o.ruhe;
    this.gut = this.schlecht = 0;
    const e = { t: +this.t.toFixed(2), was, richtung, skala: this.skala, fps: +this.fps.toFixed(1), arbeit: this.arbeit != null ? +this.arbeit.toFixed(2) : null };
    this.log.push(e); if (this.log.length > 40) this.log.shift();
    if (this.onAenderung) this.onAenderung(e);
    return true;
  }
  // Ein Ding von außen festsetzen (z. B. Nutzerwahl), ohne Schritt-Logik
  festsetzen(name, stufe) { const d = this.ding(name); if (d) { d.stufe = stufe; this.stapel = this.stapel.filter((x) => x.d !== d); } }
  zustand() {
    const st = {};
    for (const d of this.dinge) st[d.name] = d.stufe;
    return { skala: this.skala, bereich: [this.skalaMin, this.skalaMax], stufen: st, fps: +this.fps.toFixed(1), arbeit: this.arbeit != null ? +this.arbeit.toFixed(2) : null,
      cpu: this.cpu != null ? +this.cpu.toFixed(2) : null, gpu: this.gpu != null ? +this.gpu.toFixed(2) : null, engpass: this.engpass,
      gesperrtBis: this.sperreBis > this.t ? +(this.sperreBis - this.t).toFixed(1) : 0, aenderungen: this.aenderungen, t: +this.t.toFixed(1) };
  }
}

// GPU-Zeit je Bild über EXT_disjoint_timer_query_webgl2 (WebGL2). Ergebnisse kommen 1–3 Bilder später; bei „disjoint“
// (Taktwechsel, Kontext gestört) wird verworfen. Ohne Erweiterung: ok = false, ms bleibt null.
// Hinweis: auf vielen Android-Geräten ist die Erweiterung aus Sicherheitsgründen nicht freigegeben → Autopilot fällt dann
// auf Bildabstand + Probe zurück.
export class GpuZeit {
  constructor(gl) {
    this.gl = gl || null;
    this.ext = gl && gl.getExtension ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
    this.frei = []; this.offen = []; this.aktiv = null; this.ms = null; this.verworfen = 0;
  }
  get ok() { return !!this.ext; }
  anfang() {
    if (!this.ext || this.aktiv) return;
    const gl = this.gl;
    const q = this.frei.pop() || gl.createQuery();
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.aktiv = q;
  }
  ende() {
    if (!this.ext || !this.aktiv) return;
    const gl = this.gl;
    gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.offen.push(this.aktiv); this.aktiv = null;
    this.abholen();
  }
  abholen() {
    const gl = this.gl;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.offen.length) {
      const q = this.offen[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.offen.shift();
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      if (disjoint) this.verworfen++; else this.ms = ns / 1e6;
      this.frei.push(q);
    }
    // hängt die GPU weit hinterher, nicht unbegrenzt Abfragen stapeln
    while (this.offen.length > 6) { const q = this.offen.shift(); gl.deleteQuery(q); this.verworfen++; }
  }
}
