// Schadensmodell darstellen (n34-Nachtrag; Logik: physics/schaden.js). Für ein Auto aus gfx/carmesh.js makeCar:
// - Teile: die Karosserie-Meshes (Karosserie, Lack, Glas – alle LOD-Stufen) werden einmal nach den Bereichen TEILE in „Rumpf“
//   und „Teile“ zerlegt (gleiche Attribute, zweiter Index; +1 Draw-Call je Mesh). Fällt ein Teil ab, verschwinden seine
//   Dreiecke aus dem Teile-Index und fliegen als Trümmer (Kopie mit eigenem Index, Starrkörper light, nach 6 s weg).
// - Dellen: nur auf LOD 0 (Heldenauto; Gegner nur nah, gfx/gegnervis.js), CPU: neue Lage/Normale nur für Punkte im Umkreis
//   alter und neuer Dellen (Raster 0,3 m) – nicht je Bild, nur wenn sich der Schaden ändert (Treffer, Rückspulen, Replay).
// Kein Shader-Wechsel (keine Neu-Übersetzung mitten im Rennen). Kratzer, abgeplatzter Lack, Ruß und gesprungene Scheibe: im Shader
// (gfx/schadenlook.js, n34-Heavy), Uniforms hier bei jeder neuen Version gesetzt.
import * as THREE from 'three';
import { TEILE, teilVon, verschiebung, normale, Truemmer } from '../physics/schaden.js';
import { lookSetzen } from './schadenlook.js';

export const ZELLE = 0.3;              // m: Raster für die Dellen-Suche
export const SCHADEN_NAH = 45;         // m: Gegner zeigen Dellen nur so nah (LOD 0), weiter weg nur fehlende Teile
// Rechenzeit je Aufruf (Bild, ms): ein schwerer Treffer betrifft ~2000–6000 Punkte (Desktop ~6–8 ms am Stück, Handy ×4) → über
// ein paar Bilder verteilt (Zeit-Budget passt sich dem Gerät an; Prüfung alle 128 Punkte). Startwert, am Handy abstimmen
// (TODO n34-Heavy, Mess-Gate Schaden ≤ 5 % p95)
export const DELLEN_BUDGET = 1.0;
const jetzt = () => (globalThis.performance ? performance.now() : Date.now());
const o3 = [0, 0, 0], n3 = [0, 0, 0];
const zKey = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);   // Raster-Schlüssel als Zahl (schneller als Text)

function istKarosserie(mesh, cv) { for (let p = mesh.parent; p; p = p.parent) { if (p === cv.body) return true; if (p === cv.root) return false; } return false; }
const neuerIndex = (arr, nVert) => new THREE.BufferAttribute(nVert > 65535 ? Uint32Array.from(arr) : Uint16Array.from(arr), 1);

// Auto vorbereiten (einmal; neue LOD-Stufen beim nächsten Aufruf). Liefert cv.schadenVis
export function schadenVorbereiten(cv) {
  const V = cv.schadenVis || (cv.schadenVis = { teile: [], dellen: [], version: -1, teileBits: 0, alt: [], fertig: new Set(), warte: [] });
  cv.lodMeshes.forEach((list, lod) => {
    for (const m of list.slice()) {
      if (V.fertig.has(m) || m.userData.schadenTeil || !istKarosserie(m, cv)) continue;
      V.fertig.add(m);
      const g = m.geometry, pos = g.attributes.position, idx = g.index;
      if (!idx || !pos) continue;
      const I = idx.array, rumpf = [], jeTeil = TEILE.map(() => []);
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, P = pos.array;
        const k = teilVon((P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3);
        (k < 0 ? rumpf : jeTeil[k]).push(I[t], I[t + 1], I[t + 2]);
      }
      if (jeTeil.every((x) => !x.length)) continue;
      g.setIndex(neuerIndex(rumpf, pos.count));
      const gT = new THREE.BufferGeometry();
      for (const [name, att] of Object.entries(g.attributes)) gT.setAttribute(name, att);   // gleiche Puffer (Dellen wirken mit)
      const T = new THREE.Mesh(gT, m.material);
      T.castShadow = m.castShadow; T.receiveShadow = m.receiveShadow; T.visible = m.visible;
      T.userData.lod = lod; T.userData.schadenTeil = true; T.name = (m.name || 'karosserie') + '-teile';
      // (abgehängte LOD-Stufe, gfx/carmesh.js abhaengen: Teile-Mesh ebenfalls nur merken)
      const par = m.parent || m.userData.lodParent;
      if (m.parent) par.add(T); else T.userData.lodParent = par;
      list.push(T);
      const E = { m, T, jeTeil, lod, nVert: pos.count };
      V.teile.push(E);
      // Dellen nur auf LOD 0: Ursprungslage/-normale und Raster
      if (lod === 0 && g.attributes.normal) {
        const nor = g.attributes.normal, P = pos.array, grid = new Map();
        for (let i = 0; i < pos.count; i++) {
          const key = zKey(Math.floor(P[i * 3] / ZELLE), Math.floor(P[i * 3 + 1] / ZELLE), Math.floor(P[i * 3 + 2] / ZELLE));
          let L = grid.get(key); if (!L) grid.set(key, (L = [])); L.push(i);
        }
        V.dellen.push({ pos, nor, orig: Float32Array.from(P), origN: Float32Array.from(nor.array), grid });
      }
      teileIndex(V, E);
    }
  });
  return V;
}
function teileIndex(V, E) {
  const arr = [];
  E.jeTeil.forEach((L, k) => { if (!(V.teileBits & (1 << k))) for (const x of L) arr.push(x); });
  E.T.geometry.setIndex(neuerIndex(arr, E.nVert));
  E.T.geometry.index.needsUpdate = true;
}

// Schadens-Zustand S (physics/schaden.js) auf das Auto bringen. version: nur bei Änderung neu planen. dellen = false: Dellen nicht
// anfassen (Gegner fern). budget: höchstens so viele ms je Aufruf rechnen (Rest in den nächsten Bildern; Infinity = alle sofort). Liefert die neu abgefallenen Teile (Indizes) – für Trümmer. S muss bis zum Ende der Arbeit derselbe Zustand bleiben
// (SchadenAuto.S bzw. ein fester Replay-Zustand) – kommt vorher eine neue Version, wird neu geplant (Rest eingeschlossen).
export function schadenZeigen(cv, S, version, dellen = true, budget = DELLEN_BUDGET) {
  const V = schadenVorbereiten(cv);
  const neu = [];
  if (V.version !== version) {
    V.version = version;
    lookSetzen(cv.sbU, S);   // Kratzer/Lack ab/Ruß/Scheibe im Shader (gfx/schadenlook.js)
    const bits = S.teile;
    if (bits !== V.teileBits) {
      for (let k = 0; k < TEILE.length; k++) if ((bits & (1 << k)) && !(V.teileBits & (1 << k))) neu.push(k);
      V.teileBits = bits;
      for (const E of V.teile) teileIndex(V, E);
    }
  }
  if (dellen && V.dellenVersion !== version) {
    V.dellenVersion = version;
    // betroffene Punkte: im Umkreis der alten und der neuen Dellen, dazu der unerledigte Rest der letzten Planung
    const kugeln = V.alt.concat(S.dellen.map((d) => ({ p: d.p.slice(), r: d.r })));
    V.alt = S.dellen.map((d) => ({ p: d.p.slice(), r: d.r }));
    const rest = new Map(V.warte.map((J) => [J.D, J.idx.subarray(J.pos)]));
    V.warte = [];
    for (const D of V.dellen) {
      const seen = new Set(rest.get(D) || []);
      for (const k of kugeln) {
        const r = k.r + 1e-3;
        for (let x = Math.floor((k.p[0] - r) / ZELLE); x <= Math.floor((k.p[0] + r) / ZELLE); x++)
          for (let y = Math.floor((k.p[1] - r) / ZELLE); y <= Math.floor((k.p[1] + r) / ZELLE); y++)
            for (let z = Math.floor((k.p[2] - r) / ZELLE); z <= Math.floor((k.p[2] + r) / ZELLE); z++) {
              const L = D.grid.get(zKey(x, y, z)); if (!L) continue;
              for (const i of L) seen.add(i);
            }
      }
      if (seen.size) V.warte.push({ D, idx: Int32Array.from(seen), pos: 0 });
    }
  }
  if (dellen && V.warte.length) abarbeiten(V, S, budget);
  return neu;
}
// geplante Punkte neu rechnen (bis das Zeit-Budget in ms verbraucht ist; mindestens 128 Punkte), Lage + Normale aus der Ursprungslage
function abarbeiten(V, S, budget) {
  const t0 = jetzt();
  while (V.warte.length) {
    const J = V.warte[0], D = J.D, P = D.pos.array, N = D.nor.array, O = D.orig, ON = D.origN;
    let aus = false;
    while (J.pos < J.idx.length) {
      const ende = Math.min(J.idx.length, J.pos + 128);
      for (let q = J.pos; q < ende; q++) {
        const a = J.idx[q] * 3;
        verschiebung(S, O[a], O[a + 1], O[a + 2], o3);
        P[a] = O[a] + o3[0]; P[a + 1] = O[a + 1] + o3[1]; P[a + 2] = O[a + 2] + o3[2];
        normale(S, O[a], O[a + 1], O[a + 2], ON[a], ON[a + 1], ON[a + 2], n3);
        N[a] = n3[0]; N[a + 1] = n3[1]; N[a + 2] = n3[2];
      }
      J.pos = ende;
      if (jetzt() - t0 >= budget) { aus = true; break; }
    }
    D.pos.needsUpdate = true; D.nor.needsUpdate = true;
    if (J.pos >= J.idx.length) V.warte.shift();
    if (aus) return;
  }
}

// Trümmer: fliegende Kopie eines abgefallenen Teils (alle Karosserie-Meshes der LOD-0-Stufe), Lage aus Truemmer (physics)
export class TruemmerVis {
  constructor(scene) { this.scene = scene; this.liste = []; }
  // cv: Auto-Darstellung, k: Teil, car: Physik-Auto (Lage/Tempo beim Abfallen), seed: Zufall
  wirf(cv, k, car, seed = 1) {
    const V = schadenVorbereiten(cv), grp = new THREE.Group(), [a, b] = TEILE[k].box;
    const c = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    for (const E of V.teile) {
      if (E.lod !== 0 || !E.jeTeil[k].length) continue;
      const g = new THREE.BufferGeometry();
      for (const [name, att] of Object.entries(E.T.geometry.attributes)) g.setAttribute(name, att.clone());   // Lage mit Dellen einfrieren
      g.setIndex(neuerIndex(E.jeTeil[k], E.nVert));
      const m = new THREE.Mesh(g, E.T.material); m.position.copy(c).negate(); m.castShadow = true;
      grp.add(m);
    }
    if (!grp.children.length) return null;
    const q0 = new THREE.Quaternion(car.q.x, car.q.y, car.q.z, car.q.w);
    const wc = c.clone().applyQuaternion(q0).add(new THREE.Vector3(car.pos.x, car.pos.y, car.pos.z));
    const T = new Truemmer(k, [wc.x, wc.y, wc.z], [car.v.x, car.v.y, car.v.z], seed);
    grp.position.copy(wc); grp.quaternion.copy(q0); grp.name = 'truemmer';
    this.scene.add(grp);
    this.liste.push({ T, grp, q0 });
    return T;
  }
  schritt(dt, world) {
    const e = new THREE.Euler();
    for (let i = this.liste.length - 1; i >= 0; i--) {
      const X = this.liste[i];
      const lebt = X.T.schritt(dt, world);
      X.grp.position.set(X.T.p[0], X.T.p[1], X.T.p[2]);
      e.set(X.T.rot[0], X.T.rot[1], X.T.rot[2]); X.grp.quaternion.copy(X.q0).multiply(new THREE.Quaternion().setFromEuler(e));
      if (!lebt) { this.scene.remove(X.grp); for (const m of X.grp.children) m.geometry.dispose(); this.liste.splice(i, 1); }
    }
  }
  leeren() { for (const X of this.liste) { this.scene.remove(X.grp); for (const m of X.grp.children) m.geometry.dispose(); } this.liste.length = 0; }
}
