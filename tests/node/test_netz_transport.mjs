// n35 Transporte: Trystero-Anschluss mit nachgebautem joinRoom (Nostr + MQTT zusammengeführt, kein Peer doppelt,
// Abgang erst wenn in beiden Räumen weg, Ausweich auf MQTT nach 6 s ohne Partner, Fehler „p2p“), echtes
// BroadcastChannel (Node) mit Sitzung: zwei „Tabs“ finden sich, Lobby + Zustand, geordneter Abgang.
// Außerdem: vendor/trystero lädt in Node (Version, Relays) – ohne Netzverbindung.
import { TrysteroTransport, AUSWEICH, APP_ID } from '../../src/net/trystero.js';
import { BcTransport, BC } from '../../src/net/bc.js';
import { Sitzung } from '../../src/net/sitzung.js';
import { schema } from '../../src/net/paket.js';
import fs from 'fs';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- nachgebautes Trystero (gleiche Schnittstelle wie 0.26: makeAction → { send, onMessage }) ----------
function fakeStrategie(name, bus) {
  const raeume = bus[name] ||= new Map();   // roomId → Map(selfId → room)
  return (selfId) => ({
    selfId,
    joinRoom(cfg, roomId, cb) {
      const R = raeume.get(roomId) || new Map(); raeume.set(roomId, R);
      const actions = new Map();
      const room = {
        cfg, cb, onPeerJoin: null, onPeerLeave: null, _id: selfId,
        makeAction(n) { const a = { onMessage: null, send: async (d, o = {}) => { const ziele = o.target == null ? [...R.keys()].filter((k) => k !== selfId) : [].concat(o.target); for (const z of ziele) { const r = R.get(z); const ra = r && r._a.get(n); if (ra && ra.onMessage) ra.onMessage(d instanceof Uint8Array ? d.slice() : structuredClone(d), { peerId: selfId }); } bus.log.push([name, n, selfId, ziele.join('+')]); } }; actions.set(n, a); return a; },
        leave() { R.delete(selfId); for (const r of R.values()) r.onPeerLeave && r.onPeerLeave(selfId); },
        _a: actions,
      };
      for (const r of R.values()) { setTimeout(() => { r.onPeerJoin && r.onPeerJoin(selfId); room.onPeerJoin && room.onPeerJoin(r._id); }, 5); }
      R.set(selfId, room);
      bus.joins.push([name, selfId, roomId, cfg.appId, cfg.password]);
      return room;
    },
  });
}
{
  const bus = { log: [], joins: [] };
  const nostr = fakeStrategie('nostr', bus), mqtt = fakeStrategie('mqtt', bus);
  const mod = (id) => ({ nostr: nostr(id), mqtt: mqtt(id) });
  AUSWEICH.nach = 120;
  const A = new TrysteroTransport('ABCD', { module: mod('A'), strategie: 'auto' });
  const B = new TrysteroTransport('ABCD', { module: mod('B'), strategie: 'beide' });
  await A.start(); await B.start();
  const joinsA = [], leavesA = [], rein = [];
  A.beiBeitritt((p) => joinsA.push(p)); A.beiAbgang((p) => leavesA.push(p));
  B.bei('m', (d, v) => rein.push(['m', d.x, v])); B.bei('z', (d, v) => rein.push(['z', d instanceof Uint8Array ? d.length : -1, v]));
  await warte(30);
  ok(joinsA.join() === 'B' && A.peers().join() === 'B', 'Nostr: A findet B (einmal)');
  ok(bus.joins.every((j) => j[3] === APP_ID && j[2] === 'raum-ABCD' && j[4] === 'sb-ABCD'), `appId ${APP_ID}, Raum „raum-ABCD“, Passwort aus dem Code`);
  await warte(200);   // Ausweich: A war schon verbunden → kein MQTT
  ok(!bus.joins.some((j) => j[0] === 'mqtt' && j[1] === 'A'), 'Ausweich MQTT nur ohne Partner (A hatte B schon über Nostr)');
  // C kommt dazu: über Nostr direkt zu A und B
  const C = new TrysteroTransport('ABCD', { module: mod('C'), strategie: 'auto' });
  const joinsC = []; C.beiBeitritt((p) => joinsC.push(p));
  await C.start();
  await warte(30);
  ok(joinsC.sort().join() === 'A,B', 'C über Nostr: A und B je einmal');
  bus.log.length = 0;
  B.senden('m', { x: 1 }); B.senden('z', new Uint8Array(40), 'A');
  await warte(10);
  ok(bus.log.filter((l) => l[2] === 'B' && l[1] === 'sb-m').length === 1 && bus.log.filter((l) => l[1] === 'sb-z').length === 1, `B sendet über einen Raum je Ziel (${bus.log.map((l) => l.join(':')).join(', ')})`);
  A.senden('z', new Uint8Array([1, 2, 3]), 'B'); A.senden('m', { x: 7 });
  await warte(10);
  ok(rein.some((r) => r[0] === 'z' && r[1] === 3 && r[2] === 'A') && rein.some((r) => r[0] === 'm' && r[1] === 7), 'binär (Uint8Array) und JSON kommen an');
  // Peer in beiden Räumen: Abgang erst, wenn er aus beiden weg ist
  const D = new TrysteroTransport('ABCD', { module: mod('D'), strategie: 'beide' });
  await D.start(); await warte(30);
  const wegB = []; D.beiAbgang((p) => wegB.push(p));
  ok(D.peers().sort().join() === 'A,B,C' && D.peerRaum.get('B').length === 2, 'D (beide Räume) sieht B in Nostr und MQTT, zählt ihn einmal');
  bus.nostr.get('raum-ABCD').get('B').leave();
  ok(!wegB.length && D.peers().includes('B'), 'B verlässt Nostr → über MQTT noch da (kein Abgang)');
  bus.mqtt.get('raum-ABCD').get('B').leave();
  ok(wegB.join() === 'B', 'B auch aus MQTT weg → Abgang');
  // Ausweich: E (auto) im Raum WXYZ, dort ist nur F über MQTT → nach AUSWEICH.nach tritt E auch MQTT bei und findet F
  const F = new TrysteroTransport('WXYZ', { module: mod('F'), strategie: 'mqtt' }); await F.start();
  const E = new TrysteroTransport('WXYZ', { module: mod('E'), strategie: 'auto' }); await E.start();
  await warte(60);
  const vorher = E.peers().length;
  await warte(200);
  ok(vorher === 0 && E.peers().join() === 'F' && E.peerRaum.get('F')[0] === 'mqtt', 'Ausweich: ohne Partner auf Nostr nach 6 s (Test: 0,12 s) zusätzlich MQTT → findet F');
  E.verlassen(); F.verlassen();
  // Fehler „keine direkte Verbindung“
  const fe = []; A.beiFehler((e) => fe.push(e));
  A.raeume[0].room.cb.onJoinError({ peerId: 'X', error: new Error('connection failed') });
  ok(fe.length === 1 && fe[0].art === 'p2p' && fe[0].peer === 'X', 'onJoinError → Fehler p2p mit Peer');
  for (const t of [A, B, C, D]) t.verlassen();
  ok(!A.aktiv && A.peers().length === 0, 'verlassen räumt auf');
}

// ---------- vendor/trystero lädt in Node ----------
{
  const V = JSON.parse(fs.readFileSync(new URL('../../vendor/trystero/VERSION.json', import.meta.url)));
  const n = await import('../../vendor/trystero/nostr.mjs');
  ok(V.pins['@trystero-p2p/core'] === '0.26.0' && typeof n.joinRoom === 'function' && typeof n.selfId === 'string' && n.defaultRelayUrls.length === 29, `vendor/trystero 0.26.0 lädt: joinRoom, selfId, ${n.defaultRelayUrls.length} Nostr-Relays`);
  // welche 5 Relays nimmt Trystero für unsere appId? (gleiche Rechnung wie core/utils.mjs getRelays)
  const u = await import('../../vendor/trystero/core/utils.mjs');
  const fuenf = u.shuffle(n.defaultRelayUrls, u.strToNum(APP_ID)).slice(0, 5);
  ok(fuenf.length === 5 && fuenf.every((x) => x.startsWith('wss://')), 'Nostr-Relays für Stuntbahn: ' + fuenf.map((x) => x.slice(6)).join(', '));
}

// ---------- BroadcastChannel (echt, Node) + Sitzung ----------
{
  BC.herz = 100; BC.still = 400;
  const S = schema([['px', 'f32'], ['py', 'f32'], ['pz', 'f32'], ['q', 'quat'], ['vx', 'i16', 0.01], ['vy', 'i16', 0.01], ['vz', 'i16', 0.01], ['sprung', 'u8']]);
  const tA = new BcTransport('TEST', { id: 'tabA' }), tB = new BcTransport('TEST', { id: 'tabB', latenz: 20, jitter: 5 });
  const A = new Sitzung(tA, { sid: 'sA', info: { name: 'Tab A' }, gastgeber: true, schema: S });
  const B = new Sitzung(tB, { sid: 'sB', info: { name: 'Tab B' }, schema: S });
  const iv = setInterval(() => { A.takt(); B.takt(); }, 20);
  await warte(600);
  ok(A.liste().length === 2 && B.liste().length === 2 && B.lobby.host === 'sA' && B.uhr.gueltig, `BroadcastChannel: zwei Tabs in einer Lobby, Uhr-Versatz ${(B.zeit - A.zeit).toFixed(1)} ms`);
  for (let i = 0; i < 10; i++) { A.sendeZustand({ px: i, py: 0, pz: 0, q: { x: 0, y: 0, z: 0, w: 1 }, vx: 20, vy: 0, vz: 0, sprung: 0 }); await warte(50); }
  await warte(100);
  const f = B.fremdeListe();
  ok(f.length === 1 && f[0].sid === 'sA' && f[0].puffer.s.length >= 8, `Zustand A → B (${f[0] && f[0].puffer.s.length} Pakete im Puffer)`);
  let weg = null; A.on('weg', (m) => { weg = m.sid; });
  B.verlassen();
  await warte(100);
  ok(weg === 'sB' && A.liste().length === 1, 'Tab B schließt → A meldet „weg“');
  clearInterval(iv); A.verlassen();
}

console.log(bad ? `${bad} FEHLER` : 'alle Transport-Tests OK');
process.exit(bad ? 1 : 0);
