// SPEKTRON-ORDNER: gemeinsames Modul spektron-ordner.js – diese Testdatei ist in allen Apps gleich.
// Prüft die Ortsregel an einem Ordnermodell im Speicher und vergleicht das Modul byte-genau mit der Vorlage
// der Projektzentrale (../projektzentrale). In CI holt der Workflow die Projektzentrale daneben und setzt
// SPEKTRON_ORDNER_PFLICHT – dort wird der Vergleich nie übersprungen.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const datei = ['spektron-ordner.js', 'src/spektron-ordner.js'].map(f => path.join(root, f)).find(f => fs.existsSync(f));
assert.ok(datei, 'spektron-ordner.js fehlt (im Repo-Hauptordner oder in src/)');
const text = fs.readFileSync(datei, 'utf8');
assert.match(text, /^\/\* SPEKTRON-ORDNER v1 /, 'Kopf des gemeinsamen Moduls');
assert.match(text, /\/\* SPEKTRON-ORDNER-ENDE \*\/\n?$/, 'Ende des gemeinsamen Moduls');
let S = require(datei);
if (!S || typeof S.ort !== 'function') S = globalThis.SpektronOrdner;   // Repos mit "type": "module"
assert.equal(typeof S.ort, 'function');

/* ---------- Ordnermodell wie File System Access API ---------- */
const fehler = (name, msg) => Object.assign(new Error(msg), { name });
class Datei { constructor(name, inhalt = ''){ this.name = name; this.kind = 'file'; this.inhalt = inhalt; }
  async getFile(){ const t = this.inhalt; return { text: async () => t, size: t.length }; }
  async createWritable(){ let neu = ''; return { write: async v => { neu += v; }, close: async () => { this.inhalt = neu; }, abort: async () => {} }; } }
class Ordner { constructor(name){ this.name = name; this.kind = 'directory'; this.k = new Map(); }
  async *values(){ for (const h of [...this.k.values()]) yield h; }
  holen(name, art, create){ const h = this.k.get(name);
    if (h){ if (h.kind !== art) throw fehler('TypeMismatchError', name); return h; }
    if (!create) throw fehler('NotFoundError', name);
    const n = art === 'file' ? new Datei(name) : new Ordner(name); this.k.set(name, n); return n; }
  async getDirectoryHandle(name, o){ return this.holen(name, 'directory', o && o.create); }
  async getFileHandle(name, o){ return this.holen(name, 'file', o && o.create); } }
/** Baum aus { 'a/b.json': 'inhalt', 'c/': null } */
function baue(name, eintraege){
  const r = new Ordner(name);
  for (const [p, inhalt] of Object.entries(eintraege || {})){
    const teile = p.split('/'), ordner = p.endsWith('/'); if (ordner) teile.pop();
    let d = r; for (const t of ordner ? teile : teile.slice(0, -1)) d = d.holen(t, 'directory', true);
    if (!ordner) d.k.set(teile[teile.length - 1], new Datei(teile[teile.length - 1], inhalt == null ? '' : inhalt));
  }
  return r;
}
const hat = (d, ...pfad) => { let x = d; for (const t of pfad){ x = x.kind === 'directory' && x.k.get(t); if (!x) return false; } return true; };

(async () => {
  const ok = async (titel, fn) => { await fn(); console.log('OK ' + titel); };

  await ok('Projektnummer und Grenze 26.0560', async () => {
    assert.equal(S.projektKey('26.0560 Stollenstr. Gladbeck Dr.Ka'), 26000560);
    assert.equal(S.projektKey('26.0560'), 26000560);
    assert.ok(S.projektKey('26.0559 Köln Nad') < S.projektKey(S.AB));
    assert.ok(S.projektKey('27.0001 Aachen Ben') > S.projektKey(S.AB));
    assert.equal(S.projektKey('Mitteilungen'), null);
    assert.equal(S.projektKey('26.05601x'), null);
    assert.equal(await S.istSpektronProjekt(baue('26.0560 Stollenstr. Gladbeck Dr. Ka')), true);
    assert.equal(await S.istSpektronProjekt(baue('26.0400 Köln Nad')), false);
    assert.equal(await S.istSpektronProjekt(baue('25.0100 Köln Nad', { '_Spektron/': null })), true);
  });

  await ok('Vor Spektron: immer der frühere Ort, nie ein _Spektron-Ordner', async () => {
    const p = baue('26.0400 Köln Nad', { 'Fotos/_Bildumbenenner.json': '{}', '_Projekt.json': '{}' });
    const f = await S.ort(p, 'fotokit');
    assert.equal(f.wo, 'alt'); assert.equal(f.pfad, 'Fotos'); assert.equal(f.dir.name, 'Fotos');
    const l = await S.ort(p, 'labelkit', { anlegen: true });
    assert.equal(l.wo, 'alt'); assert.equal(l.dir.name, 'Laboraufträge');
    assert.equal((await S.ort(p, 'projekt')).dir, p);
    assert.deepEqual(await S.umzugListe(p), []);
    assert.equal(hat(p, '_Spektron'), false);
  });

  const altprojekt = () => baue('26.0560 Stollenstr. Gladbeck Dr.Ka', {
    '_Projekt.json': '{}', '_Projekt_Sicherungen/vorher_x.json': '{}',
    'Fotos/_Bildumbenenner.json': '{}', 'Fotos/IMG_1.jpg': 'x', 'Fotos/_aussortiert/IMG_2.jpg': 'x', 'Fotos/Pruefsummen_Originale_2026-10-28_1200.sha256': 'h',
    'Laboraufträge/26.0560_2026-10-28_Daten.json': '{}', 'Laboraufträge/26.0560_PAK_2026-10-28_Laborübergabe.xls': 'x',
    'Feldprotokolle/_Ablage-Protokoll.txt': 'p', 'Feldprotokolle/scan.pdf': 'x',
    'Laborergebnisse/_Ergebnisse.json': '{}', 'Laborergebnisse/AR-26-1.xml': 'x',
    'Pläne/Probenplan 26.0560 Stollenstr. Gladbeck Dr.Ka.probenplan': '{}', 'Pläne/Plan EG.png': 'x',
    'Abrechnung/Aufwand_DRKA.json': '{}', 'Abrechnung/26.0560_Aufwand_2026-10-28.json': '{}', 'Abrechnung/26.0560_Aufwand_2026-10-28.csv': 'x',
    'Abrechnung/_BelegKit_Sicherungen/a.json': '{}',
    '_Buero/aufgaben/a1.json': '{}', 'Mitteilungen/_Anlagen-Protokoll.txt': 'p', 'Mitteilungen/_BerichtKit.json': '{}', 'Mitteilungen/Anlage.docx': 'x'
  });

  await ok('Spektron-Projekt mit Dateien am früheren Ort: bleibt dort, bis umgezogen wird', async () => {
    const p = altprojekt();
    for (const id of Object.keys(S.BEREICHE)){ const o = await S.ort(p, id); assert.equal(o.wo, 'alt', id); assert.equal(o.konflikt, false, id); }
    assert.equal(hat(p, '_Spektron'), false, 'Lesen legt nichts an');
  });

  await ok('Umzugsliste: nur App-Dateien, keine Fotos, Excel, PDF, Word oder CSV', async () => {
    const liste = await S.umzugListe(altprojekt()), je = Object.fromEntries(liste.map(x => [x.bereich, x.eintraege.map(e => e.name).sort()]));
    assert.deepEqual(Object.keys(je).sort(), Object.keys(S.BEREICHE).sort());
    assert.deepEqual(je.projekt, ['_Projekt.json', '_Projekt_Sicherungen']);
    assert.deepEqual(je.fotokit, ['_Bildumbenenner.json']);
    assert.deepEqual(je.fotokitPruefsummen, ['Pruefsummen_Originale_2026-10-28_1200.sha256']);
    assert.deepEqual(je.labelkit, ['26.0560_2026-10-28_Daten.json']);
    assert.deepEqual(je.labelkitAblage, ['_Ablage-Protokoll.txt']);
    assert.deepEqual(je.resultkit, ['_Ergebnisse.json']);
    assert.deepEqual(je.plankit, ['Probenplan 26.0560 Stollenstr. Gladbeck Dr.Ka.probenplan']);
    assert.deepEqual(je.belegkit, ['26.0560_Aufwand_2026-10-28.json', 'Aufwand_DRKA.json', '_BelegKit_Sicherungen']);
    assert.deepEqual(je.buero, ['aufgaben']);
    assert.deepEqual(je.anlagenProtokoll, ['_Anlagen-Protokoll.txt']);
    assert.deepEqual(je.berichtkit, ['_BerichtKit.json']);
    assert.equal(liste.find(x => x.bereich === 'belegkit').nach, '_Spektron/BelegKit');
  });

  await ok(`Neues Spektron-Projekt ohne _Spektron, UMSTELLUNG ${S.UMSTELLUNG ? 'an: neuer' : 'aus: früherer'} Ort`, async () => {
    const p = baue('26.0561 Köln Nad');
    const o = await S.ort(p, 'resultkit', { anlegen: true });
    if (S.UMSTELLUNG){ assert.equal(o.wo, 'neu'); assert.ok(hat(p, '_Spektron', 'ResultKit')); }
    else { assert.equal(o.wo, 'alt'); assert.equal(o.dir.name, 'Laborergebnisse'); assert.equal(hat(p, '_Spektron'), false); }
  });

  await ok('_Spektron vorhanden (übernommenes Projekt): neuer Ort, mit Hinweisdatei', async () => {
    const p = baue('25.0100 Aachen Ben', { '_Spektron/': null });
    const o = await S.ort(p, 'resultkit', { anlegen: true });
    assert.equal(o.wo, 'neu'); assert.equal(o.pfad, '_Spektron/ResultKit'); assert.equal(o.dir.name, 'ResultKit');
    assert.ok(hat(p, '_Spektron', S.HINWEIS_DATEI));
    assert.match(p.k.get('_Spektron').k.get(S.HINWEIS_DATEI).inhalt, /nichts löschen/);
    const pj = await S.ort(p, 'projekt'); assert.equal(pj.wo, 'neu'); assert.equal(pj.dir.name, '_Spektron');
    const ohne = await S.ort(baue('25.0101 Aachen Ben', { '_Spektron/': null }), 'plankit');
    assert.equal(ohne.wo, 'neu'); assert.equal(ohne.dir, null, 'ohne anlegen kein Ordner');
  });

  await ok('Nur am neuen Ort: neu', async () => {
    const p = baue('26.0562 Köln Ric', { '_Spektron/PlanKit/Probenplan 26.0562 Köln Ric.probenplan': '{}', 'Pläne/Plan.png': 'x' });
    const o = await S.ort(p, 'plankit'); assert.equal(o.wo, 'neu'); assert.equal(o.konflikt, false);
  });

  await ok('An beiden Orten: der neue Ort gilt (K1) – immer als Konflikt gemeldet; nur ein laufender Umzug lässt den früheren gelten', async () => {
    const zwei = vermerk => baue('26.0563 Köln Ste', Object.assign({ 'Laborergebnisse/_Ergebnisse.json': 'alt', '_Spektron/ResultKit/_Ergebnisse.json': 'neu' },
      vermerk ? { '_Spektron/_Umzug.json': vermerk } : {}));
    let o = await S.ort(zwei(), 'resultkit'); assert.equal(o.wo, 'neu', 'ohne Vermerk: eine Datei am früheren Ort schaltet nicht zurück'); assert.equal(o.konflikt, true); assert.equal(o.umgezogen, false);
    assert.equal(o.dir.name, 'ResultKit');
    o = await S.ort(zwei(JSON.stringify({ format: 'spektron-umzug', version: 1, bereiche: { resultkit: { am: '2026-10-28' } } })), 'resultkit');
    assert.equal(o.wo, 'neu'); assert.equal(o.konflikt, true); assert.equal(o.umgezogen, true, 'Nachzügler am früheren Ort erkennbar');
    o = await S.ort(zwei(JSON.stringify({ format: 'spektron-umzug', version: 1, bereiche: { plankit: {} } })), 'resultkit');
    assert.equal(o.wo, 'neu', 'Vermerk eines anderen Bereichs ändert nichts');
    o = await S.ort(zwei('kaputt{'), 'resultkit'); assert.equal(o.wo, 'neu', 'unlesbarer Vermerk = kein Vermerk');
    // Umzug dieses Bereichs läuft / wurde unterbrochen: die Originale gelten, die Kopien können unvollständig sein
    o = await S.ort(zwei(JSON.stringify({ format: 'spektron-umzug', version: 1, bereiche: {}, laeuft: { resultkit: '2026-11-10' } })), 'resultkit');
    assert.equal(o.wo, 'alt'); assert.equal(o.unterbrochen, true); assert.equal(o.konflikt, true); assert.equal(o.dir.name, 'Laborergebnisse');
    o = await S.ort(zwei(JSON.stringify({ format: 'spektron-umzug', version: 1, bereiche: {}, laeuft: { plankit: '2026-11-10' } })), 'resultkit');
    assert.equal(o.wo, 'neu', '„laeuft“ gilt nur für den genannten Bereich');
    o = await S.ort(zwei(JSON.stringify({ format: 'spektron-umzug', version: 1, bereiche: { resultkit: {} }, laeuft: { resultkit: 'x' } })), 'resultkit');
    assert.equal(o.wo, 'neu', 'vermerkt geht vor „laeuft“');
    const nurNeu = baue('26.0563 Köln Ste', { '_Spektron/ResultKit/_Ergebnisse.json': 'neu', '_Spektron/_Umzug.json': JSON.stringify({ format: 'spektron-umzug', version: 1, bereiche: {}, laeuft: { resultkit: 'x' } }) });
    assert.equal((await S.ort(nurNeu, 'resultkit')).wo, 'neu', 'ohne Originale am früheren Ort: neuer Ort');
  });

  await ok('Nur die Hauptdatei am neuen Ort zählt gegen den früheren Ort – Sicherungen, Vorher-Kopien, leere Ordner nicht (Codex)', async () => {
    const t = async (dateien, bereich) => (await S.ort(baue('26.0603 Testweg Testort Ric', dateien), bereich)).wo;
    assert.equal(await t({ 'Laborergebnisse/_Ergebnisse.json': 'a', '_Spektron/ResultKit/_Ergebnisse.vorher.json': 'v' }, 'resultkit'), 'alt', 'nur _Ergebnisse.vorher.json');
    assert.equal(await t({ 'Laborergebnisse/_Ergebnisse.json': 'a', '_Spektron/ResultKit/_Ergebnisse.json': 'n' }, 'resultkit'), 'neu');
    assert.equal(await t({ '_Projekt.json': 'a', '_Spektron/_Projekt_Sicherungen/s.json': 's' }, 'projekt'), 'alt', 'nur _Projekt_Sicherungen');
    assert.equal(await t({ 'Fotos/_Bildumbenenner.json': 'a', '_Spektron/FotoKit/_FotoKit_Fassungen/k.json': 'k' }, 'fotokit'), 'alt', 'nur _FotoKit_Fassungen');
    assert.equal(await t({ 'Pläne/Probenplan a.probenplan': 'a', '_Spektron/PlanKit/Probenplan a (Speicherkandidat x).probenplan': 'k' }, 'plankit'), 'alt', 'nur Speicherkandidat');
    assert.equal(await t({ 'Pläne/Probenplan a Notfallkopie.probenplan': 'a', '_Spektron/PlanKit/Probenplan a.probenplan': 'n' }, 'plankit'), 'neu');
    assert.equal(await t({ 'Abrechnung/Aufwand_DRKA.json': 'a', '_Spektron/BelegKit/_BelegKit_Sicherungen/x.json': 's' }, 'belegkit'), 'alt', 'nur Sicherungsordner');
    assert.equal(await t({ '_Buero/aufgaben/a.json': 'a', '_Spektron/Buero/aufgaben/': null }, 'buero'), 'alt', 'leerer Ordner zählt nicht');
    assert.equal(await t({ '_Buero/aufgaben/a.json': 'a', '_Spektron/Buero/aufgaben/b.json': 'b' }, 'buero'), 'neu');
    // vermerkter Umzug: neuer Ort, auch wenn dort nur eine Sicherung liegt (wie bisher)
    assert.equal(await t({ '_Projekt.json': 'a', '_Spektron/_Projekt_Sicherungen/s.json': 's', '_Spektron/_Umzug.json': JSON.stringify({ format: 'spektron-umzug', version: 1, bereiche: { projekt: {} } }) }, 'projekt'), 'neu');
    // ohne Einträge am früheren Ort: neuer Ort wie bisher, auch nur mit Sicherung
    assert.equal(await t({ '_Spektron/_Projekt_Sicherungen/s.json': 's' }, 'projekt'), 'neu');
  });

  await ok('Codex 2. Runde: leere Hauptdatei zählt nicht; Zeile nennt und datiert die Hauptdatei, nicht die Sicherung', async () => {
    const zeit = (wurzel, pfad, ms) => { let d = wurzel; const t = pfad.split('/'); for (const x of t.slice(0, -1)) d = d.k.get(x); const f = d.k.get(t[t.length - 1]), g = f.getFile.bind(f); f.getFile = async () => Object.assign(await g(), { lastModified: ms }); };
    // leere _Ergebnisse.json in _Spektron (abgebrochenes Kopieren) → früherer Ort
    const leer = baue('26.0612 Leerweg Testort Ric', { 'Laborergebnisse/_Ergebnisse.json': '{"e":1}', '_Spektron/ResultKit/_Ergebnisse.json': '' });
    assert.equal((await S.ort(leer, 'resultkit')).wo, 'alt', 'leere Hauptdatei zählt nicht');
    // nur Sicherung in _Spektron, kein „laeuft“: früherer Ort, Zeile ohne „wurde unterbrochen“
    const sich = baue('26.0613 Sicherweg Testort Ric', { 'Laborergebnisse/_Ergebnisse.json': '{"e":1}', '_Spektron/ResultKit/_Ergebnisse.vorher.json': '{"e":0}' });
    let t = S.zweiOrteText((await S.zweiOrte(sich, ['resultkit']))[0]);
    assert.doesNotMatch(t, /wurde unterbrochen/); assert.match(t, /Es gilt noch „Laborergebnisse\/_Ergebnisse\.json“ – in „_Spektron“ liegt nur eine Sicherung/);
    // beide Seiten mit Haupt- und Sicherungsdatei; die neueste Datei überhaupt ist eine Sicherung in _Spektron
    const p = baue('26.0614 Beideweg Testort Ric', { 'Laborergebnisse/_Ergebnisse.json': 'A', 'Laborergebnisse/_Ergebnisse.vorher.json': 'Av',
      '_Spektron/ResultKit/_Ergebnisse.json': 'N', '_Spektron/ResultKit/_Ergebnisse.vorher.json': 'Nv' });
    zeit(p, '_Spektron/ResultKit/_Ergebnisse.json', new Date(2026, 10, 5, 10, 0).getTime());
    zeit(p, 'Laborergebnisse/_Ergebnisse.json', new Date(2026, 10, 7, 10, 0).getTime());
    zeit(p, 'Laborergebnisse/_Ergebnisse.vorher.json', new Date(2026, 10, 8, 10, 0).getTime());
    zeit(p, '_Spektron/ResultKit/_Ergebnisse.vorher.json', new Date(2026, 10, 9, 10, 0).getTime());
    const z = (await S.zweiOrte(p, ['resultkit']))[0]; t = S.zweiOrteText(z);
    assert.equal(z.altNeuer, true, 'nach den Hauptdateien: die am früheren Ort ist neuer');
    assert.match(t, /Es gilt „_Spektron\/ResultKit\/_Ergebnisse\.json“ \(05\.11\.2026, 10:00\) und 1 weitere\. Nicht verwendet: „Laborergebnisse\/_Ergebnisse\.json“ \(07\.11\.2026, 10:00\) und 1 weitere\./);
    assert.match(t, /Die Datei in „Laborergebnisse“ ist neuer/);
  });

  await ok('Eine sichtbare Zeile: zweiOrte() nennt beide Dateien mit Datum, zweiOrteText() sagt, welche gilt', async () => {
    const p = baue('26.0604 Musterstr. Testort Dr. Ka', { '_Spektron/LabelKit/26.0604_Daten.json': '{"neu":1}', 'Laboraufträge/26.0604_Daten.json': '{"alt":1}', 'Laboraufträge/x.xls': 'x', '_Spektron/PlanKit/a.probenplan': '{}' });
    const lk = p.k.get('_Spektron').k.get('LabelKit').k.get('26.0604_Daten.json'), la = p.k.get('Laboraufträge').k.get('26.0604_Daten.json');
    const zeit = (d, ms) => { const g = d.getFile.bind(d); d.getFile = async () => Object.assign(await g(), { lastModified: ms }); };
    zeit(lk, new Date(2026, 10, 9, 14, 32).getTime()); zeit(la, new Date(2026, 10, 8, 10, 5).getTime());
    const z = await S.zweiOrte(p, ['labelkit', 'plankit', 'resultkit']);
    assert.equal(z.length, 1); assert.equal(z[0].bereich, 'labelkit'); assert.equal(z[0].wo, 'neu'); assert.equal(z[0].altNeuer, false);
    assert.deepEqual(z[0].neu.map(e => e.name), ['26.0604_Daten.json']); assert.deepEqual(z[0].alt.map(e => e.name), ['26.0604_Daten.json'], 'nur App-Dateien, keine XLS');
    let t = S.zweiOrteText(z[0]);
    assert.match(t, /LabelKit: Dateien an zwei Orten/);
    assert.match(t, /Es gilt „_Spektron\/LabelKit\/26\.0604_Daten\.json“ \(09\.11\.2026, 14:32\)/);
    assert.match(t, /Nicht verwendet: „Laboraufträge\/26\.0604_Daten\.json“ \(08\.11\.2026, 10:05\)/);
    assert.match(t, /Gelöscht wird nichts/); assert.doesNotMatch(t, /ist neuer/);
    zeit(la, new Date(2026, 10, 10, 9, 0).getTime());   // alte App-Fassung hat am früheren Ort gespeichert
    t = S.zweiOrteText((await S.zweiOrte(p, ['labelkit']))[0]);
    assert.match(t, /Die Datei in „Laboraufträge“ ist neuer/); assert.match(t, /Schließ alle Spektron-Tabs/);
    // _Projekt.json: früherer Ort ist der Projektordner selbst
    const q = baue('26.0605 Musterweg Testort Ste', { '_Projekt.json': '{}', '_Spektron/_Projekt.json': '{}', '_Spektron/_Projekt_Sicherungen/a.json': '{}' });
    t = S.zweiOrteText((await S.zweiOrte(q, ['projekt']))[0]);
    assert.match(t, /Es gilt „_Spektron\/_Projekt\.json“ und 1 weitere\./); assert.match(t, /Nicht verwendet: „_Projekt\.json“/); assert.match(t, /im Projektordner/);
    // gleichnamige Datei wird genannt, auch wenn daneben eine neuere liegt (z. B. Speicherkandidat in PlanKit)
    const k = baue('26.0608 Z Ric', { '_Spektron/PlanKit/Probenplan a (Speicherkandidat x).probenplan': '{}', '_Spektron/PlanKit/Probenplan a.probenplan': '{}', 'Pläne/Probenplan a.probenplan': '{}' });
    t = S.zweiOrteText((await S.zweiOrte(k, ['plankit']))[0]);
    assert.match(t, /Es gilt „_Spektron\/PlanKit\/Probenplan a\.probenplan“ und 1 weitere\. Nicht verwendet: „Pläne\/Probenplan a\.probenplan“\./);
    // unterbrochener Umzug: früherer Ort gilt, Zeile sagt das
    const u = baue('26.0606 X Ste', { '_Projekt.json': '{}', '_Spektron/_Projekt_Sicherungen/a.json': '{}', '_Spektron/_Umzug.json': JSON.stringify({ format: 'spektron-umzug', version: 1, bereiche: {}, laeuft: { projekt: 'x' } }) });
    t = S.zweiOrteText((await S.zweiOrte(u, ['projekt']))[0]); assert.match(t, /unterbrochen/); assert.match(t, /Es gilt noch „_Projekt\.json“/);
    assert.deepEqual(await S.zweiOrte(baue('26.0400 Köln Nad', { 'Laboraufträge/a_Daten.json': '{}' })), [], 'Vor Spektron: nie');
    assert.deepEqual(await S.zweiOrte(baue('26.0607 Y Nad', { '_Spektron/LabelKit/a_Daten.json': '{}' })), [], 'nur ein Ort: keine Zeile');
  });

  await ok('Ordnernamen ohne Groß-/Kleinschreibung und Unicode-Form (Pläne als NFD)', async () => {
    const p = baue('26.0564 Köln Luc', { ['pläne/Probenplan x.probenplan']: '{}', 'LABORAUFTRÄGE/x_Daten.json': '{}' });
    assert.equal((await S.ort(p, 'plankit')).dir.name, 'pläne');
    assert.equal((await S.ort(p, 'labelkit')).dir.name, 'LABORAUFTRÄGE');
  });

  await ok('Name allein reicht nicht: Ordner „_Ergebnisse.json“ oder Datei „_Projekt_Sicherungen“ zählen nicht', async () => {
    const p = baue('26.0567 Köln Nad', { 'Laborergebnisse/_Ergebnisse.json/': null, '_Projekt_Sicherungen': 'x', 'Abrechnung/_BelegKit_Sicherungen': 'x',
      'Fotos/_Bildumbenenner.json/': null, '_Spektron/ResultKit/_Ergebnisse.json': '{}' });
    const r = await S.ort(p, 'resultkit'); assert.equal(r.wo, 'neu'); assert.equal(r.konflikt, false);
    assert.deepEqual((await S.umzugListe(p)).map(x => x.bereich), [], 'nichts Falsches im Umzug');
  });

  await ok('Hinweisdatei wird ergänzt, wenn _Spektron und Bereichsordner schon da sind (nur mit anlegen)', async () => {
    const p = baue('25.0102 Aachen Ben', { '_Spektron/ResultKit/': null });
    await S.ort(p, 'resultkit'); assert.equal(hat(p, '_Spektron', S.HINWEIS_DATEI), false, 'Lesen schreibt nichts');
    const o = await S.ort(p, 'resultkit', { anlegen: true }); assert.equal(o.dir.name, 'ResultKit');
    assert.ok(hat(p, '_Spektron', S.HINWEIS_DATEI));
  });

  await ok('Datei namens _Spektron blockiert das Anlegen', async () => {
    const p = baue('26.0565 Köln Nad', { '_Spektron': 'x' });
    await assert.rejects(S.spektronDir(p, true), /Datei „_Spektron“/);
    assert.equal(await S.istSpektronProjekt(baue('25.0001 X', { '_Spektron': 'x' })), false);
  });

  await ok('Ordner ohne Auflistung (Testobjekt) gilt als leer: bisheriger Ort', async () => {
    const lab = new Ordner('Laboraufträge'), p = { name: '26.0999 Testort', kind: 'directory', getDirectoryHandle: async () => lab, getFileHandle: async () => { throw fehler('NotFoundError', 'x'); } };
    const o = await S.ort(p, 'labelkit'); assert.equal(o.wo, 'alt'); assert.equal(o.dir, lab);
    assert.equal(await S.istSpektronProjekt({ name: '25.0001 X', getDirectoryHandle: async () => lab }), false);
  });

  await ok('Unbekannter Bereich wird abgelehnt', async () => {
    await assert.rejects(S.ort(baue('26.0566 X'), 'gibtsnicht'), /Unbekannter Spektron-Bereich/);
  });

  /* ---------- byte-gleich mit der Vorlage ---------- */
  const vorlage = path.join(root, '..', 'projektzentrale', 'spektron-ordner.js');
  if (fs.existsSync(vorlage)){
    assert.ok(fs.readFileSync(datei).equals(fs.readFileSync(vorlage)), 'spektron-ordner.js weicht von der Projektzentrale ab – bitte byte-gleich kopieren');
    console.log('OK spektron-ordner.js: byte-gleich mit der Projektzentrale');
  } else if (process.env.SPEKTRON_ORDNER_PFLICHT) assert.fail('Projektzentrale liegt nicht daneben (../projektzentrale) – in CI muss der Vergleich laufen');
  else console.log('OK spektron-ordner.js: Modul geprüft (Projektzentrale liegt nicht daneben – Vergleich übersprungen)');
})().catch(e => { console.error(e); process.exit(1); });
