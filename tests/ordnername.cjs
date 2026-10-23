// Ordnername „JJ.Nummer Ort Kürzel“ von hinten lesen: node tests/ordnername.cjs
// Prüft den Block SPEKTRON-ORDNERNAME aus index.html (in allen Apps identisch zu halten) mit erfundenen Kürzeln.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('const PROJ_RE'), b = html.indexOf('/* SPEKTRON-ORDNERNAME-ENDE */');
assert.ok(a > 0 && b > a, 'Block SPEKTRON-ORDNERNAME gefunden');
const ctx = {};
vm.runInNewContext(html.slice(a, b) + '\nthis.lese = leseProjektordner; this.maNorm = maNorm;', ctx);
const { lese } = ctx;

// Erfundene Personen – echte Namen stehen nur in der Datei im Archivordner, nie im Repository.
const personen = [
  { ordnerKuerzel: 'Abc', name: 'Anna Beispiel' },
  { ordnerKuerzel: 'Dr. Te', name: 'Dr. Tea Test' },
  { ordnerKuerzel: 'Xy', name: 'Xaver Ypsilon', aktiv: false },
];
const faelle = [
  // Ordnername                                   Nr.        Ort                              Kürzel    Hinweis?
  ['26.0123 Musterstraße Musterstadt Dr. Te',     '26.0123', 'Musterstraße Musterstadt',      'Dr. Te', false],
  ['26.0124 Musterstraße 12 Köln-Porz Abc',       '26.0124', 'Musterstraße 12 Köln-Porz',     'Abc',    false],
  ['26.0127 Aachen Dr.Te',                        '26.0127', 'Aachen',                        'Dr. Te', false],
  ['26.0128 Aachen dr te',                        '26.0128', 'Aachen',                        'Dr. Te', false],
  ['26.0129 Aachen ABC',                          '26.0129', 'Aachen',                        'Abc',    false],
  ['26.0130_Aachen_Abc',                          '26.0130', 'Aachen',                        'Abc',    false],
  ['26.0131 Aachen Xy',                           '26.0131', 'Aachen',                        'Xy',     false],   // inaktiv: alte Projekte erkennen weiterhin
  ['26.0125 Aachen',                              '26.0125', 'Aachen',                        '',       true],
  ['26.0126 Aachen Qrs',                          '26.0126', 'Aachen Qrs',                    '',       true],
  ['26.0132 Abc',                                 '26.0132', '',                              'Abc',    true],
  ['26.0133',                                     '26.0133', '',                              '',       true],
  ['26.0134 Abcdorf',                             '26.0134', 'Abcdorf',                       '',       true],    // nur ganze Wörter
];
for (const [name, nr, ort, kuerzel, hinweis] of faelle){
  const r = lese(name, personen);
  assert.ok(r, name);
  assert.equal(r.nr, nr, name + ' → Nr.');
  assert.equal(r.ort, ort, name + ' → Ort');
  assert.equal(r.kuerzel, kuerzel, name + ' → Kürzel');
  assert.equal(!!r.hinweis, hinweis, name + ' → Hinweis: ' + r.hinweis);
}
// Ohne Mitarbeiterliste: nichts abtrennen, kein Hinweis (Verhalten wie vor 1.12)
for (const liste of [undefined, null, []]){
  const r = lese('26.0123 Musterstadt Abc', liste);
  assert.equal(r.ort, 'Musterstadt Abc'); assert.equal(r.kuerzel, ''); assert.equal(r.hinweis, '');
}
// Keine Projektordner
for (const name of ['Mosaik Archivordner', '_Rückmeldungen', 'Fotos', '2026 Altprojekte']) assert.equal(lese(name, personen), null, name);
// Sortierschlüssel unverändert
assert.ok(lese('26.0200 A Abc', personen).key > lese('26.0123 B Abc', personen).key);
assert.ok(lese('26.0001 A', personen).key > lese('25.9999 B', personen).key);
console.log(`OK Ordnername: ${faelle.length} Fälle, ohne Liste, keine Projektordner, Sortierung`);
