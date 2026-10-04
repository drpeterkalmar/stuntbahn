// Kulissen (n20): Landschafts-Themen laden und anwenden – Himmel (Poly-Haven-HDRI), Umgebungslicht, Sonne (Richtung, Farbe,
// Stärke), Nebel, Farbkorrektur/Dunst des Kino-Looks, Boden- und Fels-Texturen (ambientCG, KTX2), Pflanzen-Atlas.
// Immer nur das aktuelle Thema liegt im Speicher: beim Wechsel werden die Texturen des vorigen freigegeben (Land nutzt die
// Grund-Dateien, die ohnehin geladen sind). Scheitert ein Paket (offline, nie besucht), bleibt es beim Land-Paket.
// Thema-Daten (rein rechnend): track/themes.js.
import * as THREE from 'three';
import { THEMES } from '../track/themes.js';
import { loadSkyInfo, loadSkyTexture, makeEnvironment, sunDirFromUV } from './env.js';
import { loadKtx2, setGround, themeUniforms } from './materials.js';
import { WORLD_SCALE } from '../track/defs.js';

const T = 'assets/themes/';
const FOG = [260 * WORLD_SCALE, 1500 * WORLD_SCALE];
const SUN_LAND = new THREE.Color(0xfff1dc);

export class ThemeManager {
  // ctx: { renderer, scene, sky (Mesh), sun (DirectionalLight), kino, M, getCockpit, params }
  constructor(ctx) {
    this.c = ctx;
    this.cur = null;          // { id, def, ... } angewandt
    this.packs = new Map();   // id → Promise<pack> (höchstens aktuelles + gerade ladendes)
    this.groundLand = null;   // Gras-Texturen von „Land“ (aus M.grass)
    this.stats = { loads: 0, failed: [] };
  }
  // Paket laden (Promise, mehrfach aufrufbar: Vorab-Laden während der Autopilot prüft)
  prefetch(id) {
    if (!THEMES[id]) id = 'land';
    if (!this.packs.has(id)) {
      const p = this.load(id).catch((e) => { console.warn('Thema nicht geladen', id, e); this.stats.failed.push(id); this.packs.delete(id); return null; });
      this.packs.set(id, p);
    }
    return this.packs.get(id);
  }
  async load(id) {
    const def = THEMES[id], P = def.pack, r = this.c.renderer;
    const base = P ? T + P.sky + '/' : null;
    const tl = new THREE.TextureLoader();
    const tex = (url, srgb) => loadKtx2(r, url).then((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = Math.min(8, r.capabilities.getMaxAnisotropy()); return t; });
    const jobs = {
      info: loadSkyInfo(base ? base + 'sky.json' : undefined),
      sky: loadSkyTexture(base ? base + 'sky.jpg' : undefined),
      env: makeEnvironment(r, base ? base + 'env.hdr' : undefined),
    };
    // Boden/Fels als KTX2; ohne KTX2 (?ktx=0, kein WASM) bleibt der Gras-Boden mit der Palette des Themas
    const opt = (p) => p.catch((e) => { console.warn('Thema-Textur fehlt', e && e.message); return null; });
    if (P && P.ground) for (const k of ['diff', 'nor', 'arm']) jobs['g_' + k] = opt(tex(`${T}tex/${P.ground}_${k}.ktx2`, k === 'diff'));
    if (P && P.rock) jobs.rock = opt(tex(`${T}tex/${P.rock}_diff.ktx2`, true));
    if (P && P.veg) {
      jobs.vegTex = tl.loadAsync(`${T}veg/${P.veg}.webp`).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; });
      jobs.vegMeta = fetch(`${T}veg/${P.veg}.json`).then((x) => x.json());
    }
    const keys = Object.keys(jobs), vals = await Promise.all(Object.values(jobs));
    const pack = { id, def };
    keys.forEach((k, i) => { pack[k] = vals[i]; });
    this.stats.loads++;
    return pack;
  }
  // Thema anwenden (lädt bei Bedarf). Liefert das angewandte Thema (bei Fehler „Land“)
  async use(id) {
    if (this.cur && this.cur.id === id) return this.cur;
    let pack = await this.prefetch(id);
    if (!pack) { id = 'land'; pack = await this.prefetch('land'); }
    if (this.cur && this.cur.id === id) return this.cur;
    this.apply(pack);
    // vorheriges Paket freigeben (nur eins im Speicher)
    for (const [k, p] of this.packs) if (k !== id) { this.packs.delete(k); p.then((q) => q && this.dispose(q)); }
    return this.cur;
  }
  dispose(q) {
    for (const k of ['sky', 'env', 'g_diff', 'g_nor', 'g_arm', 'rock', 'vegTex']) if (q[k] && q[k].dispose) q[k].dispose();
    for (const c of q._clones || []) c.dispose();
  }
  apply(pack) {
    const { scene, sky, sun, kino, M, params } = this.c;
    const def = pack.def, L = def.light, info = pack.info;
    // Himmel
    const U = sky.material.uniforms;
    U.sky.value = pack.sky; U.cutV.value = info.cutV;
    const hz = new THREE.Color().setRGB(...info.horizon, THREE.SRGBColorSpace);
    U.horizon.value.copy(hz);
    // Umgebungslicht
    scene.environment = pack.env;
    scene.environmentIntensity = +(params.get('env') || L.envI);
    const cp = this.c.getCockpit && this.c.getCockpit();
    if (cp && cp.scene) cp.scene.environment = pack.env;
    // Nebel: Horizontfarbe des Himmels, Reichweite je Thema
    scene.fog.color.copy(hz);
    scene.fog.near = FOG[0] * L.fog[0]; scene.fog.far = FOG[1] * L.fog[1];
    // Sonne: Richtung aus dem Himmel, Farbe aus der Sonnenscheibe (Land wie bisher), Stärke je Thema
    const dir = sunDirFromUV(info.u, info.v);
    sun.userData.dir.copy(dir);
    sun.position.copy(sun.target.position).addScaledVector(dir, 60);
    if (info.sunColor) sun.color.setRGB(...info.sunColor).lerp(SUN_LAND, 0.35); else sun.color.copy(SUN_LAND);
    sun.intensity = +(params.get('sun') || L.sunI);
    // Kino-Look: Farbkorrektur, Dunst- und Sonnenfarbe
    if (kino) {
      kino.grade = L.grade;
      if (L.haze) kino.hazeCol.setRGB(...L.haze); else kino.hazeCol.set(0xa9bbd0);
      kino.sunCol.set(0xfff0d8); if (info.sunColor) kino.sunCol.setRGB(...info.sunColor).lerp(new THREE.Color(0xfff0d8), 0.4);
    }
    // Boden: Texturen des Themas (Land: die bisherigen), Palette, Fels
    const g = M.grass;
    if (!this.groundLand) this.groundLand = { map: g.map, normalMap: g.normalMap, roughnessMap: g.roughnessMap, aoMap: g.aoMap };
    if (pack.g_diff && pack.g_nor && pack.g_arm) {
      const rep = g.map.repeat.x;
      for (const [k, t] of [['map', pack.g_diff], ['normalMap', pack.g_nor], ['roughnessMap', pack.g_arm], ['aoMap', pack.g_arm]]) {
        const c = t.clone(); c.repeat.set(rep, rep); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.needsUpdate = true; g[k] = c;
        (pack._clones || (pack._clones = [])).push(c);
      }
    } else Object.assign(g, this.groundLand);
    if (!this.rockDummy) this.rockDummy = themeUniforms.tRockMap.value;
    themeUniforms.tRockMap.value = pack.rock || this.rockDummy;
    setGround({ ...def.ground, rockTex: pack.rock ? def.ground.rockTex : 0 });
    themeUniforms.tTreeSnow.value = def.trees.snow ? 1 : 0;
    themeUniforms.tTreeTint.value.set(...(def.trees.tint || [1, 1, 1]));
    this.cur = { id: pack.id, def, veg: pack.vegTex ? { tex: pack.vegTex, meta: pack.vegMeta } : null, horizon: hz, info };
  }
}
