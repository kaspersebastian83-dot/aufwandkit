// BelegKit – Logik ohne Browser: Kategorien aus LabelKit, Zeiten, Positionen wie in Rechnung 202600542, Hinweise, Seiten, Ausgabe.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('/* AUFWAND-LOGIK-START */'), b = html.indexOf('/* AUFWAND-LOGIK-ENDE */');
assert.ok(a > 0 && b > a, 'Logik gefunden');
const ctx = {};
vm.runInNewContext(html.slice(a, b) + '\nthis.AW = AW;', ctx);
const AW = ctx.AW;
const plain = x => JSON.parse(JSON.stringify(x));

// LabelKit-Daten: 56 PAK-Wischproben, 25 Chlorid-Wischproben (wie in der Rechnung), dazu weitere Arten
const n = (k, o) => Array.from({ length: k }, (_, i) => Object.assign({ id: i, z2: 'Probe ' + i, matrix: 'Wischprobe' }, o));
const daten = {
  proben: [...n(56), ...n(2, { matrix: 'Bauschutt' })],
  chloridProben: [...n(25), ...n(1, { matrix: 'Material (mineralisch)' }), ...n(3, { loeschpulverparameter: true })],
  asbestProben: [...n(4, { matrix: 'Putz' }), ...n(1, { matrix: 'Luft (Raumluft)' })],
  sonstigeProben: [...n(2, { matrix: 'Mischprobe', notiz: 'DepV' }), ...n(1, { matrix: 'Material (mineralisch)', notiz: 'PCB, Schwermetalle' }), ...n(1, { matrix: 'Bauschutt', notiz: 'Schwermetalle + PCB' }), ...n(1, { notiz: '', z2: '' })],
  brandgeruchProben: n(5),
};
const K = AW.kategorien(daten), k = key => (K.find(x => x.key === key) || {}).anzahl;
assert.equal(k('pak-wisch'), 56);
assert.equal(k('pak-material'), 2);
assert.equal(k('chlorid-wisch'), 28, 'Löschpulver-Proben sind auch Chlorid-Wischproben');
assert.equal(k('chlorid-loeschpulver'), 3, 'Zusatzparameter eigens gezählt');
assert.equal(k('chlorid-material'), 1);
assert.equal(k('asbest-material'), 4);
assert.equal(k('asbest-sonstige'), 1);
assert.equal(k('sonstige:depv:misch'), 2, 'DepV-Mischprobe eigene Kategorie');
assert.equal(k('sonstige:pcb + schwermetalle'), 2, 'gleiche Parameter in anderer Reihenfolge = eine Kategorie');
assert.equal(k('sonstige-ohne'), 1);
assert.equal(K.find(x => x.key === 'sonstige-ohne').ohneBezeichnung, 1);
assert.equal(k('brandgeruch'), 5);
assert.deepEqual(plain(AW.kategorien(null)), []);

// Zeiten wie in der Rechnung: 38 Std. SV, 4 Std. Probenehmer, 2850 km, 3 Tage Spesen, 1 Übernachtung 95,33 €, 7 Std. Auswertung
const zeiten = [
  { kuerzel: 'SK', eintraege: [
    { datum: '2026-07-28', art: 'ort', rolle: 'Sachverständiger', stunden: '17', km: '1425', spesen: '1' },
    { datum: '2026-08-21', art: 'ort', rolle: 'Sachverständiger', stunden: '21', km: '1425', spesen: '2', hotelAnzahl: '1', hotelBetrag: '95,33' },
    { datum: '2026-09-10', art: 'buero', rolle: 'Sachverständiger', stunden: '4,5' },
    { datum: '2026-09-11', art: 'buero', rolle: 'Sachverständiger', stunden: '2,5' }] },
  { kuerzel: 'AB', eintraege: [{ datum: '2026-07-28', art: 'ort', rolle: 'Probenehmer', stunden: '4', km: '', spesen: '' }] },
];
const E = AW.STANDARD();
const r = AW.abrechnung({ einstellungen: E, zeiten, kategorien: AW.kategorien({ proben: n(56), chloridProben: n(25) }), berichte: [{ datei: 'Mitteilung', abrechnen: true, seiten: '24' }], fotos: { anzahl: 60 } });
const pos = r.titel.flatMap(t => t.zeilen.map(z => [t.nr, z.nr, AW.fmt(z.menge), z.einheit, z.gesamt == null ? null : AW.fmt(z.gesamt, 2)]));
assert.deepEqual(plain(pos), [
  [1, '1.007', '38', 'Std.', '5.510,00'], [1, '1.006', '4', 'Std.', '340,00'], [1, '1.004', '2.850', 'km', '2.137,50'], [1, '1.005', '3', 'Tage', '84,00'], [1, '1.002', '1', 'psch', '95,33'],
  [2, '2.001', '56', '', '5.320,00'], [2, '2.008', '25', '', '1.250,00'],
  [3, '3.001', '7', 'Std.', '1.015,00'], [3, '3.002', '1', 'psch', null]]);
assert.equal(AW.fmt(r.titel[0].summe, 2), '8.166,83', 'Summe Titel 1 wie in der Rechnung');
assert.equal(AW.fmt(r.titel[1].summe, 2), '6.570,00', 'Summe Titel 2 wie in der Rechnung');
assert.equal(r.titel[2].summe, null, '3.002 ohne Sätze → keine Summe vortäuschen');
assert.equal(r.netto, null);
assert.match(r.titel[0].text, /chemischen Untersuchungen am 28\.07\. und 21\.08\.2026\nZeitaufwand$/);
assert.match(r.hinweise.join(' '), /Sätze für 3\.002/);
assert.equal(r.titel[2].zeilen[1].quelle, '24 Berichtsseiten, 60 Fotos');
assert.equal(r.titel[0].zeilen[4].zusatz, '1 Übernachtung');

// Mit Sätzen: 24 Seiten × 7,50 + 60 Fotos × 0,94 = 236,40 (Beispiel) → Netto
const E2 = AW.einstellungen(Object.assign(AW.STANDARD(), { saetze: { seite: '7,50', foto: '0,94', pauschale: '' } }));
const r2 = AW.abrechnung({ einstellungen: E2, zeiten, kategorien: AW.kategorien({ proben: n(56), chloridProben: n(25) }), berichte: [{ datei: 'Mitteilung', abrechnen: true, seiten: '24' }], fotos: { anzahl: 60 } });
assert.equal(AW.fmt(r2.titel[2].zeilen[1].gesamt, 2), '236,40');
assert.equal(AW.fmt(r2.netto, 2), '15.988,23', 'Netto wie in der Rechnung');

// Hinweise: unzugeordnete Proben, zwei Fahrer am selben Tag, Ortstermin ohne Stunden, Bericht ohne Seitenzahl, keine Zahl
const z3 = [{ kuerzel: 'SK', eintraege: [{ datum: '2026-07-28', art: 'ort', rolle: 'Sachverständiger', stunden: '', km: '100' }, { datum: '2026-07-29', art: 'ort', stunden: 'acht' }, { datum: '2026-07-30', art: 'buero', stunden: '2', km: '50' }] },
  { kuerzel: 'AB', eintraege: [{ datum: '2026-07-28', art: 'ort', rolle: 'Probenehmer', stunden: '6', km: '100', hotelAnzahl: '1' }] }];
const r3 = AW.abrechnung({ einstellungen: E, zeiten: z3, kategorien: K, berichte: [{ datei: 'Bericht A', abrechnen: true, seiten: '' }, { datei: 'Bericht B', abrechnen: false }], fotos: { anzahl: 0 } });
const h = r3.hinweise.join('\n');
assert.match(h, /28\.07\.2026: km von SK und AB – zwei Fahrzeuge\?/);
assert.match(h, /SK 28\.07\.2026: Ortstermin ohne Stunden/);
assert.match(h, /SK 29\.07\.2026: Stunden „acht“ ist keine Zahl/);
assert.match(h, /SK 30\.07\.2026: km\/Spesen\/Übernachtung bei „Auswertung \/ Bericht“/);
assert.match(h, /AB 28\.07\.2026: Übernachtung ohne Betrag/);
assert.match(h, /Bericht „Bericht A“: Seitenzahl noch nicht bestätigt/);
assert.doesNotMatch(h, /Bericht B/);
assert.match(h, /Asbest – Materialproben: 4 Proben keiner Position zugeordnet/);
assert.match(h, /DepV-Mischprobe – DepV: 2 Proben keiner Position/);
assert.doesNotMatch(h, /Brandgeruch/, 'Brandgeruch ist standardmäßig „nicht abrechnen“');
const r4 = AW.abrechnung({ einstellungen: E, zeiten: [{ kuerzel: 'AB', eintraege: [{ datum: '2026-09-01', art: 'buero', rolle: 'Probenehmer', stunden: '1' }] }], kategorien: [], berichte: [] });
assert.match(r4.hinweise.join(' '), /„Probenehmer“ \(Titel 3\) hat keine Positionsnummer/);
assert.match(r4.hinweise.join(' '), /Kein Bericht zur Abrechnung ausgewählt/);
// Zuordnung mehrerer Kategorien auf eine Position addiert (PAK Wisch + Material → 2.001)
const r5 = AW.abrechnung({ einstellungen: E, zeiten: [], kategorien: AW.kategorien({ proben: [...n(3), ...n(2, { matrix: 'Bauschutt' })] }), berichte: [] });
assert.equal(r5.titel[0].zeilen[0].menge, 5);
assert.match(r5.titel[0].zeilen[0].quelle, /3 PAK – Wischproben, 2 PAK – Material \(Bauschutt\)/);

// Einstellungen: gespeicherte bleiben, neue feste Positionen kommen dazu
const alt = { positionen: [{ key: 'sv1', titel: 1, nr: '9.999', text: 'SV', einheit: 'h', preis: '1' }, { key: 'lab-asbest', titel: 2, nr: '2.010', text: 'Asbest', einheit: '', preis: '' }], zuordnung: { 'asbest-material': 'lab-asbest' }, saetze: { seite: '2' } };
const e = AW.einstellungen(alt);
assert.equal(e.positionen.find(p => p.key === 'sv1').nr, '9.999');
assert.ok(e.positionen.find(p => p.key === 'neben'), 'fehlende feste Position ergänzt');
assert.equal(e.zuordnung['asbest-material'], 'lab-asbest');
assert.equal(e.saetze.seite, '2'); assert.equal(e.saetze.foto, '');

// Termintext
assert.equal(AW.terminText(['2026-08-21', '2026-07-28', '2026-07-28']), 'am 28.07. und 21.08.2026');
assert.equal(AW.terminText(['2026-07-28']), 'am 28.07.2026');
assert.equal(AW.terminText(['2025-12-30', '2026-01-02', '2026-01-05']), 'am 30.12.2025, 02.01.2026 und 05.01.2026');
assert.equal(AW.terminText([]), '');

// Seiten: Word-Angabe und PDF
assert.deepEqual(plain(AW.appXml('<Properties><Pages>1</Pages><Words>2412</Words></Properties>')), { seiten: 1, woerter: 2412 });
assert.equal(AW.wordSeitenPlausibel({ seiten: 1, woerter: 2412 }), false, 'echter Bericht: Word meldet 1 Seite bei 2412 Wörtern');
assert.equal(AW.wordSeitenPlausibel({ seiten: 9, woerter: 2412 }), true);
assert.equal(AW.wordSeitenPlausibel(AW.appXml(null)), false);
const pdf = '%PDF-1.7\n1 0 obj<</Type /Pages /Count 3 /Kids[2 0 R 3 0 R 4 0 R]>>endobj 2 0 obj<</Type /Page>>endobj 3 0 obj<</Type/Page/Parent 1 0 R>>endobj 4 0 obj<< /Type /Page >>endobj';
assert.equal(AW.pdfSeiten(pdf), 3);
assert.equal(AW.pdfSeiten('%PDF-1.7 nur Objektströme'), null);
assert.equal(AW.pdfSeiten('kein pdf'), null);

// Ausgabe: TSV zum Einfügen, CSV für Excel, Dateinamen
const tsv = AW.tsv(r2);
assert.match(tsv, /^Position\tText\tMenge\tEinheit\r\n/);
assert.match(tsv, /\r\n1\.004\tFahrkosten\t2\.850\tkm\r\n/);
assert.match(tsv, /Titel 2\tUntersuchung der am Schadenort/);
const csv = AW.csv(r2, [['Projekt', '26.0389 Riedelsbach; Neureichenau']]);
assert.ok(csv.startsWith('\ufeffProjekt;"26.0389 Riedelsbach; Neureichenau"\r\n'), 'BOM für Excel, Kopf je Zelle maskiert');
assert.match(csv, /3;3\.002;Schreib-, Versand- und Nebenkosten, Fotos etc\.;1;psch;236,40;236,40;24 Berichtsseiten, 60 Fotos/);
assert.equal(AW.dateiname('26.0389', 'Aufwand', '2026-09-16', 'json', []), '26-0389_Aufwand_2026-09-16.json');
assert.equal(AW.dateiname('26.0389', 'Aufwand', '2026-09-16', 'json', ['26-0389_Aufwand_2026-09-16.JSON']), '26-0389_Aufwand_2026-09-16_2.json');
assert.equal(AW.zahl('7,5'), 7.5); assert.equal(AW.zahl(''), 0); assert.ok(Number.isNaN(AW.zahl('1.000,5')));
// Tausenderpunkt: mehrdeutig → keine Zahl (Hinweis), nicht still 1,25
assert.ok(Number.isNaN(AW.zahl('1.250'))); assert.ok(Number.isNaN(AW.zahl('12.500'))); assert.equal(AW.zahl('1.5'), 1.5); assert.equal(AW.zahl('0,75'), 0.75); assert.equal(AW.zahl('1250'), 1250);
// Preis und Satz, die keine Zahl sind: Hinweis, kein stiller Teilbetrag
{
  const E4 = AW.einstellungen(Object.assign(AW.STANDARD(), { saetze: { seite: '7,50', foto: '1.250', pauschale: '' } }));
  E4.positionen.find(x => x.key === 'sv1').preis = '1.450,00';
  const r4 = AW.abrechnung({ einstellungen: E4, zeiten, kategorien: AW.kategorien({ proben: n(1) }), berichte: [{ datei: 'Mitteilung', abrechnen: true, seiten: '24' }], fotos: { anzahl: 60 } });
  const h4 = r4.hinweise.join('\n');
  assert.match(h4, /Preis für „Sachverständiger“ \(Titel 1\) „1\.450,00“ ist keine Zahl/);
  assert.match(h4, /Satz „€ je Foto“ ist keine Zahl/);
  assert.doesNotMatch(h4, /Sätze für 3\.002 .* fehlen/);
  const neben = r4.titel.find(x => x.nr === 3).zeilen.find(x => x.key === 'neben');
  assert.equal(neben.gesamt, null, '3.002 ohne Betrag statt nur mit dem gültigen Teil');
  assert.equal(r4.netto, null);
}
assert.equal(AW.kuerzelOk('SK'), true); assert.equal(AW.kuerzelOk('S K'), false); assert.equal(AW.kuerzelOk('../x'), false);

console.log('BelegKit Logik: alle Prüfungen bestanden');
