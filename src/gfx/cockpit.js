// Cockpit-Ansicht: eigenes Low-Poly-Interieur. goblin.glb hat keins, das man zeigen könnte (offener Boden,
// Räder von innen sichtbar, kein Lenkrad). Das Cockpit hängt fest an der Kamera und wird in einem zweiten
// Durchgang mit gelöschtem Tiefenpuffer gezeichnet → nie Clipping mit Strecke, Wänden oder Röhren.
// Layout in Bildschirm-Pixeln: Rundinstrumente + Schaltkulisse mittig unten zwischen den Touch-Tasten,
// Lenkrad darunter (Nabe unter dem Bildrand), A-Säulen, Dachrahmen und Innenspiegel an den Rändern.
// Seit n15 tief: Das Armaturenbrett beginnt bei ~68 % der Bildhöhe, darüber ist die Fahrbahn frei.
// Skalen werden einmal auf ein Canvas gezeichnet; bewegt werden nur Zeiger, Knauf und Lenkrad (Meshes).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SPEEDO, TACHO, Needle, GateKnob, gateSlot, speedAngle, rpmAngle, valueAngle } from './gauges.js';

const DEG = Math.PI / 180;
const WHEEL_RATIO = 4.2;    // Lenkrad-Umdrehung je Radeinschlag (0,6 rad Einschlag → ~145° am Lenkrad)
const FACE_PX = 512;        // Kantenlänge je Zifferblatt im Canvas (Atlas 2×1)

// ---------- Zifferblätter (Canvas, einmal gezeichnet) ----------
function drawDial(g, ox, kind) {
  const S = FACE_PX, cx = ox + S / 2, cy = S / 2, R = S / 2 - 6;
  const isT = kind === 'tacho', max = isT ? TACHO.max : SPEEDO.max, sweep = isT ? TACHO.sweep : SPEEDO.sweep;
  const at = (v, r) => { const a = valueAngle(v, max, sweep); return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; };
  // Grund: mattschwarz mit leichtem Verlauf, feiner Silberrand
  const bg = g.createRadialGradient(cx, cy - R * 0.25, R * 0.1, cx, cy, R);
  bg.addColorStop(0, '#24272c'); bg.addColorStop(0.75, '#141619'); bg.addColorStop(1, '#0a0b0d');
  g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#8d939b'; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, R - 3, 0, Math.PI * 2); g.stroke();
  // roter Bereich (Drehzahl) als Band am Rand
  const arc = (v0, v1, r, w, col) => {
    const a0 = valueAngle(v0, max, sweep) - Math.PI / 2, a1 = valueAngle(v1, max, sweep) - Math.PI / 2;
    g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
  };
  if (isT) arc(TACHO.red, max, R * 0.86, R * 0.1, '#d42a1c');
  // Striche
  const minor = isT ? 0.25 : SPEEDO.minor, major = isT ? 1 : SPEEDO.major;
  const n = Math.round(max / minor);
  for (let i = 0; i <= n; i++) {
    const v = i * minor, isMaj = Math.abs(v / major - Math.round(v / major)) < 1e-6, half = !isMaj && Math.abs((v / major) * 2 - Math.round((v / major) * 2)) < 1e-6;
    const r0 = R * (isMaj ? 0.74 : half ? 0.8 : 0.84), r1 = R * 0.92;
    const [x0, y0] = at(v, r0), [x1, y1] = at(v, r1);
    g.strokeStyle = isT && v >= TACHO.red ? '#ff5a40' : '#eef0f2';
    g.lineWidth = isMaj ? 9 : half ? 5 : 3;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  // Zahlen
  g.fillStyle = '#f4f5f6'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 ${isT ? 64 : 50}px "Helvetica Neue", Arial, sans-serif`;
  for (let v = 0; v <= max + 1e-6; v += major) {
    const [x, y] = at(v, R * (isT ? 0.56 : 0.555));
    g.fillStyle = isT && v >= TACHO.red ? '#ff6a4a' : '#f4f5f6';
    g.fillText(String(v), x, y);
  }
  // Beschriftung unten
  g.fillStyle = '#b9bec6'; g.font = '600 34px "Helvetica Neue", Arial, sans-serif';
  g.fillText(isT ? 'U/min' : 'km/h', cx, cy + R * 0.42);
  g.font = '600 26px "Helvetica Neue", Arial, sans-serif';
  if (isT) g.fillText('×1000', cx, cy + R * 0.6);
  else { g.fillStyle = '#ff6a2a'; g.font = '800 26px "Helvetica Neue", Arial, sans-serif'; g.fillText('STUNTBAHN', cx, cy + R * 0.6); }
}

// Schaltkulisse: gebürstetes Blech mit eingefrästen Gassen, aktueller Gang orange
function drawGate(cv, gear) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height;
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, '#5d636b'); grd.addColorStop(0.5, '#8c939c'); grd.addColorStop(1, '#4f555c');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.18;
  for (let y = 0; y < h; y += 2) { g.fillStyle = (y * 7919) % 5 < 2 ? '#fff' : '#000'; g.fillRect(0, y, w, 1); }
  g.globalAlpha = 1;
  g.strokeStyle = '#2a2d31'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  const X = (x) => w / 2 + x * w * 0.33, Y = (y) => h / 2 - y * h * 0.22;
  g.strokeStyle = '#0c0d0f'; g.lineCap = 'round'; g.lineWidth = w * 0.075;
  g.beginPath(); g.moveTo(X(-1), Y(0)); g.lineTo(X(1), Y(0));
  for (const x of [-1, -1 / 3, 1 / 3, 1]) { g.moveTo(X(x), Y(1)); g.lineTo(X(x), x === -1 ? Y(0) : Y(-1)); }
  g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${Math.round(h * 0.17)}px "Helvetica Neue", Arial, sans-serif`;
  for (const k of ['R', 1, 2, 3, 4, 5, 6]) {
    const s = gateSlot(k);
    g.fillStyle = String(k) === String(gear) ? '#ff7a2a' : '#15171a';
    g.fillText(String(k), X(s.x), s.y > 0 ? h * 0.1 + h * 0.02 : h * 0.9 - h * 0.02);
  }
}

// ---------- Geometrie-Helfer ----------
// Streifen aus zwei Punktreihen (gleich lang) → Dreiecke, Normalen berechnet
function strip(a, b) {
  const pos = [], idx = [];
  for (let i = 0; i < a.length; i++) pos.push(a[i].x, a[i].y, a[i].z, b[i].x, b[i].y, b[i].z);
  for (let i = 0; i < a.length - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function quad(p0, p1, p2, p3) { return strip([p0, p1], [p3, p2]); }
// Vertex-Farbe (fürs Zusammenfassen: alle Teile brauchen dieselben Attribute); c2 = Verlauf nach unten
function tint(g, c, c2 = c) {
  const n = g.attributes.position.count, col = new Float32Array(n * 3), P = g.attributes.position;
  g.computeBoundingBox();
  const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y;
  for (let i = 0; i < n; i++) {
    const k = y1 > y0 ? (P.getY(i) - y0) / (y1 - y0) : 1;
    for (let j = 0; j < 3; j++) col[i * 3 + j] = c2[j] + (c[j] - c2[j]) * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  return g;
}

export class Cockpit {
  constructor(envMap, paint) {
    this.scene = new THREE.Scene();
    this.scene.environment = envMap;
    this.scene.environmentIntensity = 0.5;
    this.cam = new THREE.PerspectiveCamera(50, 1, 0.05, 20);
    this.scene.add(this.cam);
    this.root = new THREE.Group();
    this.cam.add(this.root);
    // Sonnenlicht durch die Frontscheibe (Richtung = Weltsonne, Stärke je nach Einfallswinkel)
    this.sun = new THREE.DirectionalLight(0xfff1dc, 1.4);
    this.scene.add(this.sun, this.sun.target);
    this.visible = false;
    const M = this.mats = {
      dash: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide }),
      // Kotflügel: flach angeschaut spiegelt voller Klarlack nur den Himmel (wirkt lila) → matter als außen
      paint: new THREE.MeshPhysicalMaterial({ color: 0xa3120e, metalness: 0.2, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.2 }),
      leather: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.52, metalness: 0 }),
      alu: new THREE.MeshStandardMaterial({ color: 0xc3c8cf, roughness: 0.28, metalness: 1 }),
      marker: new THREE.MeshStandardMaterial({ color: 0xf0a800, roughness: 0.45, metalness: 0, emissive: 0x3a2200 }),
      needle: new THREE.MeshBasicMaterial({ color: 0xff4d1a }),
      knob: new THREE.MeshStandardMaterial({ color: 0xb01a12, roughness: 0.22, metalness: 0.1, emissive: 0x3a0503 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.18, depthWrite: false }),
      mirror: new THREE.MeshStandardMaterial({ color: 0x6d737a, roughness: 0.18, metalness: 1 }),
    };
    if (paint) M.paint.color = paint.color;   // gleiche Farbe wie der Lack (Optionen → Lackfarbe wirkt sofort)
    // Zifferblätter: Atlas 2×1, scharf dank Mipmaps + Anisotropie
    const cv = document.createElement('canvas');
    cv.width = FACE_PX * 2; cv.height = FACE_PX;
    const g = cv.getContext('2d');
    drawDial(g, 0, 'tacho'); drawDial(g, FACE_PX, 'speedo');
    this.faceTex = new THREE.CanvasTexture(cv);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceTex.anisotropy = 4;
    M.face = new THREE.MeshStandardMaterial({ map: this.faceTex, emissiveMap: this.faceTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6, metalness: 0 });
    this.gateCv = document.createElement('canvas');
    this.gateCv.width = 256; this.gateCv.height = 320;
    this.gateGear = null;
    drawGate(this.gateCv, 1);
    this.gateTex = new THREE.CanvasTexture(this.gateCv);
    this.gateTex.colorSpace = THREE.SRGBColorSpace;
    this.gateTex.anisotropy = 4;
    M.gate = new THREE.MeshStandardMaterial({ map: this.gateTex, emissiveMap: this.gateTex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.4, metalness: 0.6 });
    this.nS = new Needle(15, 0.85);   // Tacho: ruhig
    this.nT = new Needle(26, 0.42);   // Drehzahl: flink, schwingt leicht nach
    this.knob = new GateKnob(11);
    this.parts = null;
    this.key = '';
  }

  // Layout aus Bildschirmmaßen (CSS-Pixel), vertikalem Sichtfeld und freier Zone zwischen den Touch-Tasten.
  // n15: Das Armaturenbrett beginnt erst bei o.dash (Anteil der Bildhöhe, Standard ~0,68), die Instrumente sitzen
  // darunter. Drei Stufen je nach Platz zwischen den Tasten: „full“ (2 Rundinstrumente + Schaltkulisse),
  // „compact“ (nur die Rundinstrumente, Gang als kleines Schild darunter, s. main.js) und „hud“ (keine
  // Rundinstrumente – Tempo und Gang stehen digital im HUD); das Armaturenbrett bleibt immer tief.
  layout(o) {
    const key = [o.W, o.H, o.vfov.toFixed(2), Math.round(o.zl), Math.round(o.zr), Math.round(o.bottom), o.dash || 0].join('|');
    if (key === this.key) return false;
    this.key = key;
    if (this.parts) { this.root.remove(this.parts); this.parts.traverse((x) => { if (x.geometry) x.geometry.dispose(); }); }
    const { W, H } = o, cx = W / 2, t = Math.tan(o.vfov * DEG / 2);
    const U = Math.min(H, 0.75 * W);                         // Maßstab für Ränder/Wülste (hochkant nicht die Höhe)
    const mpp = (D) => 2 * D * t / H;                       // Meter je Pixel in Tiefe D
    const P = (x, y, D) => new THREE.Vector3((x - cx) * mpp(D), (H / 2 - y) * mpp(D), -D);
    const M = this.mats, grp = new THREE.Group();
    // --- Maße in Pixeln ---
    const half = Math.max(40, Math.min(cx - o.zl, o.zr - cx));  // symmetrisch um die Mitte (Fahrer blickt geradeaus)
    const yB = H - o.bottom;                                    // „Unterkante“ (über der Replay-Leiste / den Tasten)
    const mB = Math.min(0.055 * H, 14);                         // Abstand Instrumente – Unterkante
    const yT = (o.dash || 0.68) * H;                            // gewünschte Oberkante des Armaturenbretts
    let mode = 'full', gd = Math.min(0.36 * H, (2 * half) / 2.62, 0.3 * W);
    if (gd < 90) { mode = 'compact'; gd = Math.min(0.36 * H, (2 * half) / 2.2, 0.3 * W); if (gd < 80) mode = 'hud'; }
    // Platz unter der Oberkante (Instrumente + Hutze ≈ 1,14 gd); reicht er nicht, rückt das Brett etwas höher
    gd = Math.min(gd, Math.max((yB - mB - yT) / 1.14, mode === 'full' ? 90 : 80));
    if (mode === 'hud') gd = 0;
    const gap = 0.07 * gd, gw = 0.5 * gd, gh = 0.62 * gd;       // Schaltkulisse
    const off = mode === 'full' ? gw / 2 + gap + gd / 2 : 0.56 * gd;
    const yc = yB - mB - gd / 2;                                // Mitte der Rundinstrumente
    const DG = 0.72, DF = 0.84, DW = 0.46;                      // Tiefen: Instrumente, Armaturenbrett, Lenkrad
    this.mode = mode;
    this.gaugePx = { mode, gd, yc, xs: gd ? [cx - off, cx + off] : [], gate: mode === 'full' ? [cx, yc + 0.12 * gd, gw, gh] : null, gear: mode === 'compact' ? [cx, yc + 0.46 * gd, 0.28 * gd] : null };
    const dark = [], alu = [];
    const shade = (k) => [0.085 * k, 0.072 * k, 0.06 * k];   // Anthrazit, leicht warm (Himmelslicht färbt sonst blau)
    // Armaturenbrett: Oberseite (vorne tiefer, zur Scheibe hin flacher) + Stirnwand
    const yD = gd ? Math.min(yT, yc - 0.64 * gd) : yT;          // Oberkante (Mitte)
    this.dashPx = yD;
    const xs = []; for (let i = 0; i <= 24; i++) xs.push(-0.2 * W + (1.4 * W) * i / 24);
    const yDx = (x) => yD + 0.05 * U * Math.pow((x - cx) / (0.7 * W), 2);
    const near = xs.map((x) => P(x, yDx(x), DF)), far = xs.map((x) => P(x, yDx(x) - 0.045 * U, 1.35));
    dark.push(tint(strip(far, near), shade(1.35)));
    const low = xs.map((x) => P(x, H * 1.25, DF - 0.1));
    dark.push(tint(strip(near, low), shade(1.15), shade(0.35)));
    // Hutze über den Instrumenten: Halbschale (vorne Lippe, hinten an der Stirnwand), physisch ausgedehnt
    if (gd) {
      const rx = off + gd * 0.62, ry = gd * 0.7, D0 = DG - 0.1, D1 = DF + 0.02;
      const front = [], back = [];
      for (let i = 0; i <= 20; i++) {
        const a = Math.PI * i / 20;
        // hintere Kante in Bildschirm-Pixeln knapp über der vorderen (tiefer liegend, sonst ragt sie als Kuppel
        // weit ins Bild – bis n14 per Metern skaliert)
        front.push(P(cx + rx * Math.cos(a), yc + 0.08 * gd - ry * Math.sin(a), D0));
        back.push(P(cx + rx * 1.02 * Math.cos(a), yc + 0.06 * gd - ry * 1.03 * Math.sin(a), D1));
      }
      dark.push(tint(strip(back, front), shade(1.1)));
      // Lippe (dicker Wulst an der Vorderkante)
      const lip = front.map((p) => new THREE.Vector3(p.x * 0.985, p.y - 0.004, p.z + 0.012));
      dark.push(tint(strip(front, lip), shade(1.6)));
    }
    // Instrumentenrohre + Chromringe
    const mG = mpp(DG), Rg = gd / 2 * mG;
    this.gauges = [];
    for (let k = 0; k < this.gaugePx.xs.length; k++) {
      const c = P(this.gaugePx.xs[k], yc, DG);
      // Rohr: Ränder über Bildschirm-Pixel definiert → der vordere Rand liegt auch weit unten im Bild
      // (Hochformat, starke Perspektive) immer außerhalb des Zifferblatts, nie davor
      const back = [], front = [];
      for (let i = 0; i <= 40; i++) {
        const a = Math.PI * 2 * i / 40, [x, y] = [this.gaugePx.xs[k], yc];
        back.push(P(x + Math.cos(a) * gd * 0.53, y + Math.sin(a) * gd * 0.53, DG + 0.004));
        front.push(P(x + Math.cos(a) * gd * 0.6, y + Math.sin(a) * gd * 0.6, DG - 0.045));
      }
      dark.push(tint(strip(back, front), shade(0.9), shade(0.45)));
      const ring = new THREE.TorusGeometry(Rg * 1.045, Rg * 0.045, 8, 48);
      ring.translate(c.x, c.y, c.z + 0.008);
      alu.push(ring);
      this.gauges.push({ c, R: Rg });
    }
    // Dachrahmen, A-Säulen (Fahrer links: linke Säule nah und breit, rechte weiter weg und schmal)
    const roofY = 0.075 * H;
    const roofA = [], roofB = [], roofC = [];
    for (let i = 0; i <= 12; i++) {
      const x = -0.1 * W + 1.2 * W * i / 12, sag = 0.02 * H * (1 - Math.pow((x - cx) / (0.6 * W), 2));
      roofA.push(P(x, -0.1 * H, 0.75)); roofB.push(P(x, roofY + sag, 0.75)); roofC.push(P(x, roofY + sag - 0.012 * H, 1.3));
    }
    dark.push(tint(strip(roofA, roofB), shade(1.5)), tint(strip(roofB, roofC), shade(2.1)));
    const yBase = yDx(0) - 0.045 * U;
    const pillar = (xb0, xb1, xt0, xt1, D, inner) => {
      const b0 = P(xb0, yBase + 0.06 * U, D), b1 = P(xb1, yBase + 0.06 * U, D), t0 = P(xt0, roofY, D), t1 = P(xt1, roofY, D);
      dark.push(tint(quad(b0, b1, t1, t0), shade(1.25)));
      // Innenkante (Tiefe) → Lichtkante
      const e0 = inner > 0 ? b1 : b0, e1 = inner > 0 ? t1 : t0;
      const f0 = e0.clone().add(new THREE.Vector3(0, 0, -0.12)), f1 = e1.clone().add(new THREE.Vector3(0, 0, -0.12));
      dark.push(tint(quad(e0, f0, f1, e1), shade(1.7)));
    };
    pillar(-0.05 * W, 0.045 * W, 0.075 * W, 0.155 * W, 0.8, 1);
    pillar(0.955 * W, 1.02 * W, 0.86 * W, 0.9 * W, 1.05, -1);
    // Kotflügel-Buckel in Wagenfarbe (Mittelmotor-Sportwagen: vorne links/rechts über dem Armaturenbrett sichtbar)
    {
      const fen = [];
      for (const [x0, x1] of [[0.03 * W, 0.3 * W], [0.7 * W, 0.975 * W]]) {
        const r0 = [], r1 = [], r2 = [];
        for (let i = 0; i <= 14; i++) {
          const k = i / 14, x = x0 + (x1 - x0) * k, bump = 0.035 * U * Math.pow(Math.sin(Math.PI * k), 0.7);
          r0.push(P(x, yBase + 0.03 * U, 1.7)); r1.push(P(x, yBase - bump, 2.2)); r2.push(P(x, yBase - bump * 0.85, 2.9));
        }
        fen.push(strip(r1, r0), strip(r2, r1));
      }
      grp.add(new THREE.Mesh(mergeGeometries(fen), M.paint));
    }
    // Innenspiegel (reflektiert den Himmel/Umgebung), rechts der Mitte wie im Linkslenker
    {
      const mx = cx + 0.16 * W, my = roofY + 0.07 * H, mw = Math.min(0.15 * W, 0.34 * H), mh = mw * 0.32, D = 0.62;
      const s = mpp(D), c = P(mx, my, D);
      const body = new THREE.BoxGeometry(mw * s, mh * s, 0.03);
      body.translate(c.x, c.y, c.z);
      dark.push(tint(body, shade(0.8)));
      const stem = new THREE.BoxGeometry(0.012, (my - roofY) * s + 0.03, 0.012);
      stem.translate(c.x, c.y + ((my - roofY) * s) / 2, c.z - 0.02);
      dark.push(tint(stem, shade(0.8)));
      const glass = new THREE.PlaneGeometry(mw * s * 0.92, mh * s * 0.8);
      glass.rotateX(-6 * DEG); glass.translate(c.x, c.y, c.z + 0.016);
      grp.add(new THREE.Mesh(glass, M.mirror));
    }
    grp.add(new THREE.Mesh(mergeGeometries(dark), M.dash));
    if (alu.length) grp.add(new THREE.Mesh(mergeGeometries(alu.map((a) => { a.deleteAttribute('uv'); return a; })), M.alu));
    // Zifferblätter (ein Mesh, Atlas-UVs), Glas, Zeiger
    this.needles = [];
    if (this.gauges.length) {
      const faces = [];
      for (let k = 0; k < 2; k++) {
        const { c, R } = this.gauges[k];
        const f = new THREE.CircleGeometry(R, 48);
        const uv = f.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + k * 0.5);
        f.translate(c.x, c.y, c.z);
        faces.push(f);
      }
      grp.add(new THREE.Mesh(mergeGeometries(faces), M.face));
      const gl = mergeGeometries(this.gauges.map(({ c, R }) => new THREE.CircleGeometry(R * 1.01, 40).translate(c.x, c.y, c.z + 0.02)));
      const glass = new THREE.Mesh(gl, M.glass);
      glass.renderOrder = 2;
      grp.add(glass);
      this.needles = this.gauges.map(({ c, R }) => {
        const s = new THREE.Shape();
        s.moveTo(-R * 0.03, -R * 0.2); s.lineTo(R * 0.03, -R * 0.2); s.lineTo(R * 0.012, R * 0.86); s.lineTo(0, R * 0.9); s.lineTo(-R * 0.012, R * 0.86); s.closePath();
        const ng = new THREE.ShapeGeometry(s);
        const pivot = new THREE.Group();
        pivot.position.set(c.x, c.y, c.z + 0.006);
        pivot.add(new THREE.Mesh(ng, M.needle));
        const cap = new THREE.CylinderGeometry(R * 0.085, R * 0.1, 0.01, 20);
        cap.rotateX(Math.PI / 2); cap.translate(0, 0, 0.005);
        pivot.add(new THREE.Mesh(cap, M.alu));
        grp.add(pivot);
        return pivot;
      });
    }
    // Schaltkulisse + Knauf (nur „full“)
    this.gateGeo = null; this.knobMesh = null;
    if (this.gaugePx.gate) {
      const [gx, gy, w, h] = this.gaugePx.gate, D = DG - 0.02, s = mpp(D), c = P(gx, gy, D);
      const plate = new THREE.PlaneGeometry(w * s, h * s);
      plate.translate(c.x, c.y, c.z);
      grp.add(new THREE.Mesh(plate, M.gate));
      const frame = new THREE.BoxGeometry(w * s * 1.08, h * s * 1.06, 0.01);
      frame.translate(c.x, c.y, c.z - 0.006);
      grp.add(new THREE.Mesh(frame, M.alu));
      this.gateGeo = { c, w: w * s, h: h * s };
      const kb = new THREE.Mesh(new THREE.SphereGeometry(w * s * 0.1, 16, 12), M.knob);
      grp.add(kb);
      this.knobMesh = kb;
    }
    // Lenkrad: Nabe unter dem Bildrand, Kranz umrahmt die Instrumente (ohne Instrumente: knapp unter der
    // Oberkante des Armaturenbretts); 3 Speichen, Griffmulden, Markierung oben
    {
      const hubY = yB + 0.3 * U;
      const rimPx = 0.03 * U, s = mpp(DW);
      const reach = gd ? Math.hypot(off, hubY - yc) + gd / 2 + 0.012 * U : Math.max(0.15 * W, hubY - yD - rimPx + 0.02 * U);
      const R = (reach + rimPx) * s, r = rimPx * s;
      const wheel = new THREE.Group();
      wheel.position.copy(P(cx, hubY, DW));
      const tilt = new THREE.Group();
      tilt.rotation.x = -6 * DEG;   // n15: flacher (bis n14 −14°, der Kranz ragte oben weit ins Bild)
      wheel.add(tilt);
      const spin = new THREE.Group();
      tilt.add(spin);
      spin.add(new THREE.Mesh(new THREE.TorusGeometry(R, r, 14, 96), M.leather));
      for (const a of [48, 132]) {           // Griffwülste bei 10 und 2 Uhr
        const tg = new THREE.TorusGeometry(R, r * 1.22, 12, 20, 34 * DEG);
        const m = new THREE.Mesh(tg, M.leather);
        m.rotation.z = a * DEG - 17 * DEG;
        spin.add(m);
      }
      const mk = new THREE.Mesh(new THREE.TorusGeometry(R, r * 1.07, 10, 8, 7 * DEG), M.marker);
      mk.rotation.z = 90 * DEG - 3.5 * DEG;
      spin.add(mk);
      for (const a of [-12, 192, 270]) {       // Speichen (leicht hängend) + Alu-Einlage
        const sp = new THREE.BoxGeometry(R * 0.86, r * 1.5, r * 0.9);
        sp.translate(R * 0.5, 0, -r * 0.2);
        const m = new THREE.Mesh(sp, M.leather); m.rotation.z = a * DEG; spin.add(m);
        const inl = new THREE.BoxGeometry(R * 0.6, r * 0.45, r * 0.2);
        inl.translate(R * 0.5, 0, r * 0.3);
        const m2 = new THREE.Mesh(inl, M.alu); m2.rotation.z = a * DEG; spin.add(m2);
      }
      const hub = new THREE.CylinderGeometry(R * 0.2, R * 0.23, r * 2.2, 28);
      hub.rotateX(Math.PI / 2);
      spin.add(new THREE.Mesh(hub, M.leather));
      grp.add(wheel);
      this.wheelSpin = spin;
      this.wheelPx = { hubY, R: reach + rimPx };
    }
    this.root.add(grp);
    this.parts = grp;
    return true;
  }

  // Werte setzen + Zeiger bewegen. v: { kmh, rpm, gear ('R' | 1…6), steer (rad Radeinschlag) }
  update(dt, v, camera, sunDir) {
    const c = this.cam;
    c.position.copy(camera.position); c.quaternion.copy(camera.quaternion);
    if (c.fov !== camera.fov || c.aspect !== camera.aspect) { c.fov = camera.fov; c.aspect = camera.aspect; c.updateProjectionMatrix(); }
    c.updateMatrixWorld(true);
    if (!this.parts) return;
    const aS = this.nS.update(dt, speedAngle(v.kmh)), aT = this.nT.update(dt, rpmAngle(v.rpm));
    if (this.needles.length) { this.needles[0].rotation.z = -aT; this.needles[1].rotation.z = -aS; }
    this.wheelSpin.rotation.z = -v.steer * WHEEL_RATIO;
    const k = this.knob.update(dt, v.gear), G = this.gateGeo;
    if (G) this.knobMesh.position.set(G.c.x + k.x * G.w * 0.33, G.c.y + k.y * G.h * 0.22, G.c.z + G.w * 0.06);
    if (String(v.gear) !== String(this.gateGear)) { this.gateGear = v.gear; if (G) { drawGate(this.gateCv, v.gear); this.gateTex.needsUpdate = true; } }
    // Sonne: steht sie vor dem Auto, fällt Licht durch die Scheibe aufs Armaturenbrett
    if (sunDir) {
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
      const k2 = Math.max(0.2, Math.min(1, 0.45 + f.dot(sunDir) * 0.8));
      this.sun.intensity = 1.6 * k2;
      this.sun.target.position.copy(c.position);
      this.sun.position.copy(c.position).addScaledVector(sunDir, 5);
      this.sun.target.updateMatrixWorld();
    }
  }
  // Zeiger sofort auf die Werte (Kamerawechsel, Replay-Schnitt)
  snap(v) { this.nS.snap(speedAngle(v.kmh)); this.nT.snap(rpmAngle(v.rpm)); this.knob.init = false; }
  render(renderer) {
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.cam);
    renderer.autoClear = ac;
  }
  // Debug/Tests: Zeigerwinkel in Grad
  readout() { return { speedDeg: this.nS.a / DEG, rpmDeg: this.nT.a / DEG, knob: [this.knob.x, this.knob.y], gear: this.gateGear, px: this.gaugePx, wheel: this.wheelPx, dash: this.dashPx, mode: this.mode }; }
}
