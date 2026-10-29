// „Stand speichern“ (Prüfbericht 29.10., F15) und Berichtsangaben (F10): ein angezeigter Stand mit 1 Stunde darf nie mit der
// Prüfsumme einer inzwischen geänderten Zeitdatei (7 Stunden) abgelegt werden; zwei Sitzungen verlieren keine Berichtsangabe.
// Echte ladeAlles()/standSpeichern()/jsonAendern() in einer V8-Sitzung, synthetischer Projektordner auf der Platte.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), vm = require('node:vm'), { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const fehlt = () => Object.assign(Error('fehlt'), { name: 'NotFoundError' });
class Dir {
  constructor(dir, io = {}){ this.dir = dir; this.io = io; this.name = path.basename(dir); this.kind = 'directory'; }
  async getDirectoryHandle(n, o = {}){ const p = path.join(this.dir, n); if (o.create) await fs.mkdir(p, { recursive: true }); try{ if (!(await fs.stat(p)).isDirectory()) throw Error('kein Ordner'); }catch(e){ if (e.code === 'ENOENT') throw fehlt(); throw e; } return new Dir(p, this.io); }
  async getFileHandle(n, o = {}){
    const p = path.join(this.dir, n), io = this.io;
    if (o.create) await fs.appendFile(p, ''); try{ await fs.access(p); }catch(e){ if (e.code === 'ENOENT') throw fehlt(); throw e; }
    return { name: n, kind: 'file',
      getFile: async () => { if (io.lesen) await io.lesen(n, p); const b = await fs.readFile(p), s = await fs.stat(p); return { name: n, lastModified: s.mtimeMs, size: b.length, arrayBuffer: async () => Uint8Array.from(b).buffer, text: async () => b.toString() }; },
      createWritable: async () => { if (io.oeffnen) await io.oeffnen(n, p); let t = ''; return { write: async v => { t += typeof v === 'string' ? v : Buffer.from(await v.arrayBuffer()); }, close: async () => { await fs.writeFile(p, t); }, abort: async () => {} }; } };
  }
  async *values(){ for (const e of await fs.readdir(this.dir, { withFileTypes: true })) yield e.isDirectory() ? new Dir(path.join(this.dir, e.name), this.io) : await this.getFileHandle(e.name); }
}
const pdf = n => `%PDF-1.7\n1 0 obj<</Type /Pages /Count ${n}>>endobj\ntrailer<</Root 2 0 R>>\n2 0 obj<</Type /Catalog /Pages 1 0 R>>endobj`;
async function projekt(archiv, name, nr, stunden){
  const P = path.join(archiv, name);
  await fs.mkdir(path.join(P, 'Abrechnung'), { recursive: true }); await fs.mkdir(path.join(P, 'Mitteilungen'));
  await fs.writeFile(path.join(P, 'Abrechnung', 'Aufwand_SK.json'), JSON.stringify({ format: 'aufwandkit-zeiten', version: 1, projekt: nr, kuerzel: 'SK', eintraege: [{ id: 'a', datum: '2026-10-01', art: 'ort', rolle: 'Sachverständiger', stunden }] }));
  await fs.writeFile(path.join(P, 'Mitteilungen', '1__Bericht.pdf'), pdf(10)); await fs.writeFile(path.join(P, 'Mitteilungen', '2__Entwurf.pdf'), pdf(3));
  await fs.writeFile(path.join(P, 'Abrechnung', '_Abrechnung.json'), JSON.stringify({ berichte: { '1__Bericht': { abrechnen: true, seiten: '10' } } }));
  return P;
}
async function sitzung(archiv, P, nr, io = {}){
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8'), teil = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));
  const c = vm.createContext({ crypto: webcrypto, Uint8Array, TextEncoder, TextDecoder, console, navigator: {}, setTimeout, clearTimeout, window: {}, Date });
  vm.runInContext(await fs.readFile(path.join(root, 'time-store.js'), 'utf8'), c);
  vm.runInContext(teil('/* AUFWAND-LOGIK-START */', '/* AUFWAND-LOGIK-ENDE */') + '\nglobalThis.AW=AW;', c);
  c.APP_NAME = 'BelegKit'; c.APP_VERSION = 'test';
  c.A = { archiv: new Dir(archiv, io), proj: { name: path.basename(P), nr, dir: new Dir(P, io) }, kz: 'SK', alle: [], meine: [], schreib: Promise.resolve(), laden: 0, tab: 'abrechnung', einst: null, pdatei: { berichte: {} } };
  c.ORDNER = { abr: 'Abrechnung', lab: 'Laboraufträge', fotos: 'Fotos', mitteil: 'Mitteilungen' }; c.EINST_DATEI = '_AufwandKit-Einstellungen.json'; c.PROJ_DATEI = '_Abrechnung.json'; c.norm = s => s.toLowerCase(); c.esc = s => s;
  const el = { innerHTML: '', textContent: '' }; c.$ = () => el; c.zeichne = () => {}; c.meldung = () => {}; c.versteckeMeldung = () => {}; c.meldungen = []; c.status = (t, art) => c.meldungen.push([art, t]);
  c.sichereMeine = async () => {}; c.zeichneAbrechnung = () => {};
  vm.runInContext(teil('const heuteIso =', '\n') + '\n' + teil('const zeitDe =', '\n'), c);
  vm.runInContext(teil('async function unter(', '/** Einen Eintrag einer ZIP-Datei'), c);
  vm.runInContext(teil('async function ladeAlles(){', '/* ---------- Speichern ---------- */'), c);
  vm.runInContext(teil('function uebernehmeMeineDatei(){', '/** Projektdatei:'), c);
  vm.runInContext(teil('function projektdaten(){', 'function pjBand(){'), c);
  vm.runInContext(teil('function abrechnungJetzt(){', 'function zeichneAbrechnung(){'), c);
  vm.runInContext(teil('async function speichereBericht(', '/** Zuordnung einer Probenart'), c);
  vm.runInContext(teil('async function standSpeichern(a){', 'function zeichneEinst(){'), c);
  return c;
}
const staende = async P => (await fs.readdir(path.join(P, 'Abrechnung'))).filter(n => /_Aufwand_/.test(n)).sort();

(async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'belegkit-stand-'));
  try{
    // 1. Nichts geändert → Stand + CSV werden abgelegt; Prüfsummen: Zeiten, Berichtsangaben, nur der abgerechnete Bericht
    {
      const P = await projekt(tmp, '99.9001 Synthetisch A', '99.9001', '1'), c = await sitzung(tmp, P, '99.9001');
      await c.ladeAlles(); await c.standSpeichern(c.abrechnungJetzt());
      const n = await staende(P); assert.equal(n.length, 2, 'JSON + CSV: ' + n);
      const s = JSON.parse(await fs.readFile(path.join(P, 'Abrechnung', n.find(x => x.endsWith('.json'))), 'utf8'));
      assert.deepEqual(s.quellen.map(q => q.datei).sort(), ['Abrechnung/Aufwand_SK.json', 'Abrechnung/_Abrechnung.json', 'Mitteilungen/1__Bericht.pdf'].sort());
      const zeiten = s.quellen.find(q => q.datei === 'Abrechnung/Aufwand_SK.json'), b = await fs.readFile(path.join(P, 'Abrechnung', 'Aufwand_SK.json'));
      assert.equal(zeiten.sha256, Buffer.from(await webcrypto.subtle.digest('SHA-256', b)).toString('hex'));
    }
    // 2. Angezeigt: 1 Stunde – ein Kollege ändert auf 7 → nichts abgelegt, neue Menge steht zur Prüfung da; zweiter Klick speichert 7
    {
      const P = await projekt(tmp, '99.9002 Synthetisch B', '99.9002', '1'), c = await sitzung(tmp, P, '99.9002');
      await c.ladeAlles(); const angezeigt = c.abrechnungJetzt(); assert.equal(angezeigt.sum.sv1, 1);
      const datei = path.join(P, 'Abrechnung', 'Aufwand_SK.json'), d = JSON.parse(await fs.readFile(datei, 'utf8')); d.eintraege[0].stunden = '7'; await fs.writeFile(datei, JSON.stringify(d));
      await assert.rejects(c.standSpeichern(angezeigt), /seit der Anzeige geändert/);
      assert.deepEqual(await staende(P), [], 'kein Stand abgelegt'); assert.equal(c.abrechnungJetzt().sum.sv1, 7, 'neue Menge angezeigt');
      await c.standSpeichern(c.abrechnungJetzt());
      const s = JSON.parse(await fs.readFile(path.join(P, 'Abrechnung', (await staende(P)).find(x => x.endsWith('.json'))), 'utf8'));
      assert.equal(s.quellen.find(q => q.datei === 'Abrechnung/Aufwand_SK.json').sha256, Buffer.from(await webcrypto.subtle.digest('SHA-256', await fs.readFile(datei))).toString('hex'));
    }
    // 3. Berichtsangaben: eine andere Sitzung schreibt _Abrechnung.json genau zwischen Lesen und Schreiben → beide Angaben bleiben
    {
      const P = await projekt(tmp, '99.9003 Synthetisch C', '99.9003', '1'); let einmal = true;
      const datei = path.join(P, 'Abrechnung', '_Abrechnung.json');
      const c = await sitzung(tmp, P, '99.9003', { oeffnen: async n => { if (n === '_Abrechnung.json' && einmal){ einmal = false; const o = JSON.parse(await fs.readFile(datei, 'utf8')); o.berichte['3__Kollege'] = { abrechnen: true, seiten: '4' }; await fs.writeFile(datei, JSON.stringify(o)); } } });
      await c.ladeAlles(); await c.speichereBericht('1__Bericht', { seiten: '12' });
      const o = JSON.parse(await fs.readFile(datei, 'utf8'));
      assert.equal(o.berichte['1__Bericht'].seiten, '12', 'eigene Angabe'); assert.equal(o.berichte['3__Kollege'].seiten, '4', 'Angabe der anderen Sitzung bleibt');
    }
    // 4. Leere _Abrechnung.json (abgebrochenes Anlegen) blockiert nichts: gilt als nicht vorhanden, Angabe und Stand werden gespeichert
    {
      const P = await projekt(tmp, '99.9004 Synthetisch D', '99.9004', '1'), datei = path.join(P, 'Abrechnung', '_Abrechnung.json'); await fs.writeFile(datei, '');
      const c = await sitzung(tmp, P, '99.9004'); await c.ladeAlles(); assert.equal(c.A.pdateiGesperrt, false, 'nicht gesperrt');
      await c.speichereBericht('1__Bericht', { abrechnen: true, seiten: '10' }); assert.equal(JSON.parse(await fs.readFile(datei, 'utf8')).berichte['1__Bericht'].seiten, '10');
      await c.ladeAlles(); await c.standSpeichern(c.abrechnungJetzt()); assert.equal((await staende(P)).length, 2);
    }
    // 5. Ein nicht abgerechneter Entwurf in „Mitteilungen“ ändert sich beim Speichern → stört nicht
    {
      const P = await projekt(tmp, '99.9005 Synthetisch E', '99.9005', '1'); let n = 0;
      // 3. Lesen des abgerechneten Berichts = Prüfschleife von „Stand speichern“ – genau dann speichert jemand den Entwurf
      const c = await sitzung(tmp, P, '99.9005', { lesen: async name => { if (name === '1__Bericht.pdf' && ++n === 3) await fs.writeFile(path.join(P, 'Mitteilungen', '2__Entwurf.pdf'), pdf(4)); } });
      await c.ladeAlles();
      await c.standSpeichern(c.abrechnungJetzt()); assert.ok(n >= 3, 'Entwurf wurde während der Prüfung geändert'); assert.equal((await staende(P)).length, 2);
    }
    // 6. Ein Kollege speichert zum ersten Mal (neue Zeitdatei), während die Prüfsummen laufen → nichts abgelegt
    {
      const P = await projekt(tmp, '99.9006 Synthetisch F', '99.9006', '1'); let n = 0;
      const neu = path.join(P, 'Abrechnung', 'Aufwand_BEN.json');
      const c = await sitzung(tmp, P, '99.9006', { lesen: async name => { if (name === '1__Bericht.pdf' && ++n === 3) await fs.writeFile(neu, JSON.stringify({ format: 'aufwandkit-zeiten', version: 1, projekt: '99.9006', kuerzel: 'BEN', eintraege: [{ id: 'b', datum: '2026-10-02', art: 'ort', rolle: 'Probenehmer', stunden: '4' }] })); } });
      await c.ladeAlles(); await assert.rejects(c.standSpeichern(c.abrechnungJetzt()), /neu dazugekommen/); assert.deepEqual(await staende(P), []);
    }
    console.log('OK Stand speichern: geänderte Mengen erst prüfen, Prüfsummen vom gelesenen Stand; Berichtsangaben ohne Verlust (6 Fälle)');
  }finally{ await fs.rm(tmp, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
