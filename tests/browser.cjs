// BelegKit im echten Browser: node tests/browser.cjs chromium
// Archivordner mit einem Projekt wird im Origin Private File System nachgebildet (LabelKit-Datei, Fotos, Bericht als .docx und .pdf).
process.env.TZ = 'Europe/Berlin';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const playwright = require('playwright');

const name = 'chromium';
const root = path.join(__dirname, '..');
const PROJ = '26.0389 Riedelsbach Köln & Süd + 50% #Hof';

/** Kleine .docx-Attrappe wie aus Word: app.xml deflate-komprimiert (Word meldet 1 Seite bei 2412 Wörtern – veraltet). */
function docx(){
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const teile = [['word/document.xml', Buffer.from('<w:document/>'), 0], ['docProps/app.xml', Buffer.from('<Properties><Pages>1</Pages><Words>2412</Words></Properties>'), 8]];
  const lok = [], zen = []; let off = 0;
  for (const [n, roh, m] of teile){
    const daten = m ? zlib.deflateRawSync(roh) : roh, nb = Buffer.from(n), h = Buffer.alloc(30), c = Buffer.alloc(46);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(m, 8); h.writeUInt32LE(crc(roh), 14); h.writeUInt32LE(daten.length, 18); h.writeUInt32LE(roh.length, 22); h.writeUInt16LE(nb.length, 26);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(m, 10); c.writeUInt32LE(crc(roh), 16); c.writeUInt32LE(daten.length, 20); c.writeUInt32LE(roh.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42);
    lok.push(h, nb, daten); zen.push(c, nb); off += 30 + nb.length + daten.length;
  }
  const z = Buffer.concat(zen), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(teile.length, 8); e.writeUInt16LE(teile.length, 10); e.writeUInt32LE(z.length, 12); e.writeUInt32LE(off, 16);
  return [...Buffer.concat([...lok, z, e])];
}
const pdf = [...Buffer.from('%PDF-1.7\n1 0 obj<</Type /Pages /Count 3>>endobj 2 0 obj<</Type /Page>>endobj 3 0 obj<</Type /Page>>endobj 4 0 obj<</Type /Page>>endobj\n%%EOF')];
const n = (k, o) => Array.from({ length: k }, (_, i) => Object.assign({ id: i, z2: 'P' + i, matrix: 'Wischprobe' }, o));
const labelkit = { version: '4.27.0', proben: n(56), chloridProben: n(25), asbestProben: n(2, { matrix: 'Putz' }) };

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await playwright[name].launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  ctx.setDefaultTimeout(60000);   // CI-Läufer sind manchmal langsam: Wartezeiten großzügig, damit kein falscher Alarm entsteht
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => document.getElementById('ver').textContent.startsWith('v1'));

  // Kürzel wird mit LabelKit geteilt („mosaik-kuerzel“): gemeinsamer Wert zuerst, eigener alter Wert als Rückfall (wird übernommen), Änderungen gehen in beide
  const kz = async () => ({ feld: await page.locator('#kz').inputValue(), gemeinsam: await page.evaluate(() => localStorage.getItem('mosaik-kuerzel')), eigen: await page.evaluate(() => localStorage.getItem('aufwandkit-kuerzel')) });
  const neuLaden = async () => { await page.reload(); await page.waitForFunction(() => document.getElementById('ver').textContent.startsWith('v1')); };
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mosaik-kuerzel', 'ab'); localStorage.setItem('aufwandkit-kuerzel', 'XY'); });
  await neuLaden();
  assert.equal((await kz()).feld, 'AB', 'gemeinsames Kürzel hat Vorrang');
  await page.evaluate(() => { localStorage.removeItem('mosaik-kuerzel'); localStorage.setItem('aufwandkit-kuerzel', 'xy'); });
  await neuLaden();
  assert.deepEqual(await kz(), { feld: 'XY', gemeinsam: 'XY', eigen: 'xy' }, 'bisheriges eigenes Kürzel wird übernommen und geteilt');
  await page.evaluate(() => { localStorage.setItem('mosaik-kuerzel', 'S.K-LabelKit'); });
  await neuLaden();
  assert.equal((await kz()).feld, 'XY', 'ungültiges (zu langes) Kürzel aus LabelKit wird nicht übernommen');
  await page.locator('#kz').fill('mk'); await page.locator('#kz').dispatchEvent('change');
  await page.waitForFunction(() => localStorage.getItem('mosaik-kuerzel') === 'MK');
  assert.equal((await kz()).eigen, 'MK');
  await page.evaluate(() => localStorage.clear());
  await neuLaden();

  // Archiv mit Projekt anlegen und als gemeinsamen Archivordner hinterlegen (wie die Projektzentrale)
  await page.evaluate(async ({ PROJ, labelkit, docx, pdf }) => {
    const r = await navigator.storage.getDirectory();
    for await (const [x] of r.entries()) await r.removeEntry(x, { recursive: true });
    const archiv = await r.getDirectoryHandle('Mosaik Archivordner', { create: true });
    await archiv.getDirectoryHandle('26.0101 Anderswo', { create: true });
    const p = await archiv.getDirectoryHandle(PROJ, { create: true });
    const schreibe = async (dir, nm, data) => { const w = await (await dir.getFileHandle(nm, { create: true })).createWritable(); await w.write(data); await w.close(); };
    await schreibe(await p.getDirectoryHandle('Laboraufträge', { create: true }), '26.0389_16.09.2026_Daten.json', JSON.stringify(labelkit));
    await schreibe(p, '_Projekt.json', JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: 'EFH, Musterweg 7, 52525 Heinsberg', auftraggeber: 'Beispiel Versicherung AG', schadennummer: 'S-2026-4711', ortstermin: '2026-07-28' }));
    const fo = await p.getDirectoryHandle('Fotos', { create: true });
    for (let i = 1; i <= 6; i++) await schreibe(fo, `26.0389_${String(i).padStart(3, '0')}.jpg`, 'x');
    await schreibe(fo, '_Bildumbenenner.json', JSON.stringify({ bilder: { '26.0389_006.jpg': { aussortiert: true } } }));
    await (await fo.getDirectoryHandle('_aussortiert', { create: true }));
    const mi = await p.getDirectoryHandle('Mitteilungen', { create: true });
    await schreibe(mi, '1__Mitteilung.docx', new Uint8Array(docx)); await schreibe(mi, '1__Mitteilung.pdf', new Uint8Array(pdf));
    await schreibe(mi, '~$_Mitteilung.docx', 'lock'); await schreibe(mi, '_Anlagen-Protokoll.txt', 'x');
    await new Promise((res, rej) => { const q = indexedDB.open('mosaik-suite', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => { const t = q.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(archiv, 'archiv'); t.oncomplete = res; t.onerror = rej; }; });
  }, { PROJ, labelkit, docx: docx(), pdf });

  // Ohne Projekt: Auswahl, neueste zuerst
  await page.goto(base);
  await page.locator('.pz').first().waitFor();
  assert.deepEqual(await page.locator('.pz').allTextContents(), [PROJ, '26.0101 Anderswo']);
  await page.locator('#pSuche').fill('riedel');
  assert.equal(await page.locator('.pz').count(), 1);
  await page.locator('.pz').click();
  await page.locator('nav.tabs').waitFor();
  assert.equal(new URL(page.url()).searchParams.has('projekt'), false, 'Projektwahl erzeugt keinen Query-Link');
  assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('projekt'), PROJ);
  await page.goto(base + '?projekt=' + encodeURIComponent(PROJ));
  await page.locator('nav.tabs').waitFor();
  assert.equal(new URL(page.url()).searchParams.has('projekt'), false, 'alter Query-Link bereinigt');
  assert.equal(await page.evaluate(() => A.proj.name), PROJ);
  await page.goto(base + '?ansicht=liste#zeiten&projekt=' + encodeURIComponent(PROJ));
  await page.locator('nav.tabs').waitFor();
  assert.equal(await page.evaluate(() => A.proj.name), PROJ, 'Fragment öffnet exakten Sonderzeichen-Ordner');
  await page.goto(base + '?projekt=falsch&ansicht=liste#zeiten&projekt=' + encodeURIComponent(PROJ));
  await page.locator('nav.tabs').waitFor();
  const projektUrl = new URL(page.url());
  assert.equal(projektUrl.searchParams.has('projekt'), false, 'Fragment gewinnt vor Query');
  assert.equal(projektUrl.searchParams.get('ansicht'), 'liste');assert.ok(projektUrl.hash.startsWith('#zeiten&'));
  assert.equal(await page.evaluate(() => A.proj.name), PROJ);


  // Kürzel, zwei Einträge
  await page.locator('button[data-tab="zeiten"]').click();
  await page.locator('#kzEin').fill('sk'); await page.locator('#kzOk').click();
  await page.locator('#zNeu').click();
  const z = (i, f) => page.locator(`#zRows tr[data-i="${i}"] [data-f="${f}"]`);
  await z(0, 'datum').fill('2026-07-28'); await z(0, 'stunden').fill('17'); await z(0, 'km').fill('1425'); await z(0, 'spesen').fill('1');
  await page.locator('#zNeuB').click();
  await z(1, 'stunden').fill('7');
  await page.waitForFunction(() => /gespeichert in „Abrechnung\/Aufwand_SK\.json“/.test(document.getElementById('status').textContent));
  const lies = (pfad) => page.evaluate(async ({ PROJ, pfad }) => {
    let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner');
    const teile = pfad.split('/'); for (const t of teile.slice(0, -1)) d = await d.getDirectoryHandle(t === '§' ? PROJ : t);
    return (await (await d.getFileHandle(teile[teile.length - 1])).getFile()).text();
  }, { PROJ, pfad });
  let mein = JSON.parse(await lies('§/Abrechnung/Aufwand_SK.json'));
  assert.equal(mein.kuerzel, 'SK');
  assert.deepEqual(mein.eintraege.map(e => [e.datum, e.art, e.stunden, e.km]), [['2026-07-28', 'ort', '17', '1425'], ['2026-07-28', 'buero', '7', '']]);
  assert.match(await page.locator('#kollegen').textContent(), /SK\s*17\s*7\s*1\.425/);

  const bisDatei = async (ok) => { for (let k = 0; k < 100; k++){ try{ if (ok(JSON.parse(await lies('§/Abrechnung/Aufwand_SK.json')))) return; }catch(e){} await page.waitForTimeout(100); } throw new Error('Aufwand_SK.json nicht wie erwartet gespeichert'); };
  // Gespeicherter Routenlink bleibt Teil des Zeitdateiformats.
  await page.locator('#zRows tr[data-i="0"] button[data-route]').click();
  await page.locator('#rLink').fill('https://maps.app.goo.gl/AbC123xyz');
  await page.locator('#rOk').click();
  await page.locator('#dlgBack.show').waitFor({ state: 'detached' }).catch(() => {});
  assert.equal(await page.locator('#dlgBack').evaluate(e => e.classList.contains('show')), false);
  assert.equal(await page.locator('#zRows tr[data-i="0"] button[data-route]').evaluate(e => e.classList.contains('hat')), true);
  await page.waitForFunction(() => /gespeichert in „Abrechnung\/Aufwand_SK\.json“/.test(document.getElementById('status').textContent));
  await bisDatei(j => j.eintraege[0].route === 'https://maps.app.goo.gl/AbC123xyz');
  mein = JSON.parse(await lies('§/Abrechnung/Aufwand_SK.json'));
  assert.deepEqual([mein.eintraege[0].km, mein.eintraege[0].routeZiel, mein.eintraege[0].routeRund], ['1425', 'EFH, Musterweg 7, 52525 Heinsberg', true]);
  // Proben: Kategorien und Zuordnung (Asbest → nicht abrechnen) – landet in den gemeinsamen Einstellungen
  await page.locator('button[data-tab="proben"]').click();
  assert.match(await page.locator('#seite').textContent(), /PAK – Wischproben\s*56[\s\S]*Chlorid – Wischproben\s*25[\s\S]*Asbest – Materialproben\s*2/);
  await page.locator('select[data-kat="asbest-material"]').selectOption('-');
  await page.waitForFunction(() => /Zuordnung gespeichert|Einstellungen gespeichert/.test(document.getElementById('status').textContent));
  const einst = JSON.parse(await lies('_AufwandKit-Einstellungen.json'));
  assert.equal(einst.zuordnung['asbest-material'], '-');
  assert.equal(einst.geaendertVon, 'SK');

  // Bericht & Fotos: Lockdateien und Protokolle ausgeblendet, Word-Angabe als veraltet erkannt, PDF gezählt
  await page.locator('button[data-tab="bericht"]').click();
  assert.match(await page.locator('#seite').textContent(), /5 Fotos \(6 Bilder im Ordner „Fotos“, davon 1 in FotoKit aussortiert\)/);
  assert.equal(await page.locator('#bRows tr').count(), 1, 'nur der Bericht, keine ~$- oder _-Dateien');
  assert.match(await page.locator('#bRows').textContent(), /Word meldet 1 Seite bei 2412 Wörtern – veraltet/);
  await page.locator('#bRows input[data-ab="0"]').check();
  await page.waitForFunction(() => /✓ gespeichert/.test(document.getElementById('status').textContent));
  await page.locator('#bRows button', { hasText: 'PDF: 3 Seiten übernehmen' }).click();
  await page.waitForFunction(() => document.querySelector('#bRows input[data-seiten="0"]')?.value === '3');
  const pdat = JSON.parse(await lies('§/Abrechnung/_Abrechnung.json'));
  assert.deepEqual([pdat.berichte['1__Mitteilung'].abrechnen, pdat.berichte['1__Mitteilung'].seiten, pdat.berichte['1__Mitteilung'].seitenQuelle], [true, '3', 'PDF gezählt']);

  // Abrechnung: Positionen wie in der Rechnung, Hinweis zu 3.002-Sätzen, Kopieren, Stand speichern
  await page.locator('button[data-tab="abrechnung"]').click();
  const txt = await page.locator('#seite').textContent();
  assert.match(txt, /chemischen Untersuchungen am 28\.07\.2026/);
  assert.match(txt, /1\.007\s*Sachverständiger[\s\S]*?17\s*Std\./);
  assert.match(txt, /1\.004\s*Fahrkosten[\s\S]*?1\.425\s*km/);
  assert.match(txt, /2\.001\s*Analyse\(n\) auf PAK n\. EPA[\s\S]*?56/);
  assert.match(txt, /2\.008[\s\S]*?25/);
  assert.match(txt, /3\.002[\s\S]*?3 Berichtsseiten, 5 Fotos/);
  assert.match(txt, /Sätze für 3\.002/);
  assert.doesNotMatch(txt, /Asbest/, 'nicht abzurechnen');
  await page.locator('#aPreise').check();
  assert.match(await page.locator('#seite').textContent(), /2\.465,00 €/, '17 × 145');
  if (name === 'chromium'){
    await page.locator('#aKopie').click();
    await page.waitForFunction(() => /Zwischenablage/.test(document.getElementById('status').textContent));
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /\r\n2\.001\tAnalyse\(n\) auf PAK n\. EPA\t56\t\r\n/);
  }
  // Projektdaten aus der Projektzentrale: oben auf jeder Seite, nur zur Ansicht
  const band = (await page.locator('#pjBand').textContent()).replace(/\s+/g, ' ');
  assert.match(band, /Objekt EFH, Musterweg 7, 52525 Heinsberg/); assert.match(band, /Auftraggeber Beispiel Versicherung AG/); assert.match(band, /Schaden-Nr\. S-2026-4711/);
  assert.equal(await page.locator('#pjBand input, #pjBand textarea').count(), 0, 'keine Eingabefelder – geändert wird in der Projektzentrale');
  await page.locator('button[data-tab="zeiten"]').click(); assert.ok(await page.locator('#pjBand').count(), 'auch auf den anderen Seiten'); await page.locator('button[data-tab="abrechnung"]').click();
  await page.locator('#aStand').click();
  await page.waitForFunction(() => /Stand gespeichert/.test(document.getElementById('status').textContent));
  const heute = await page.evaluate(() => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; });
  const stand = JSON.parse(await lies(`§/Abrechnung/26-0389_Aufwand_${heute}.json`));
  assert.equal(stand.von, 'SK');
  assert.deepEqual(stand.quellen.map(q => q.datei).sort(), ['Abrechnung/Aufwand_SK.json', 'Abrechnung/_Abrechnung.json', '_Projekt.json', 'Fotos/_Bildumbenenner.json', 'Laboraufträge/26.0389_16.09.2026_Daten.json', 'Mitteilungen/1__Mitteilung.docx', 'Mitteilungen/1__Mitteilung.pdf', '_AufwandKit-Einstellungen.json (Archivordner)'].sort());
  assert.ok(stand.quellen.every(q => /^[0-9a-f]{64}$/.test(q.sha256)));
  assert.deepEqual(stand.projektdaten, { objekt: 'EFH, Musterweg 7, 52525 Heinsberg', auftraggeber: 'Beispiel Versicherung AG', schadennummer: 'S-2026-4711' });
  const standCsv = (await lies(`§/Abrechnung/26-0389_Aufwand_${heute}.csv`)).replace(/^\ufeff/, '');
  assert.equal(standCsv.split('\r\n')[0], 'Projekt;' + PROJ);
  assert.match(standCsv, /\r\nObjekt;EFH, Musterweg 7, 52525 Heinsberg\r\nAuftraggeber;Beispiel Versicherung AG\r\nSchaden-Nr\. des Auftraggebers;S-2026-4711\r\nStand;/);
  await page.locator('#aStand').click();
  await page.waitForFunction(h => document.getElementById('status').textContent.includes('Aufwand_' + h + '_2.json'), heute);

  // Ohne Projektdaten: freundlicher Hinweis auf der Abrechnung (statt leerer Zeile)
  await page.evaluate(async PROJ => { const p = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(PROJ); const x = await (await p.getFileHandle('_Projekt.json')).getFile(); window.__pj = await x.text(); await p.removeEntry('_Projekt.json'); }, PROJ);
  await page.locator('#bNeu').click(); await page.locator('#pjBand .hint').waitFor();
  assert.match(await page.locator('#pjBand').textContent(), /Noch keine Projektdaten .* in der Projektzentrale ergänzen/);
  await page.evaluate(async PROJ => { const p = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(PROJ); const w = await (await p.getFileHandle('_Projekt.json', { create: true })).createWritable(); await w.write(window.__pj); await w.close(); }, PROJ);
  await page.locator('#bNeu').click(); await page.locator('#pjBand b').first().waitFor();
  // Zweiter Kollege: eigene Datei, SK bleibt unberührt; km am selben Tag → Hinweis
  await page.locator('#kz').fill('AB');
  await page.locator('button[data-tab="zeiten"]').click();   // Kürzel wird beim Verlassen übernommen, der Klick auf den Reiter darf nicht verloren gehen
  await page.locator('#zNeu').waitFor();
  assert.match(await page.locator('#seite h2').first().textContent(), /Meine Zeiten · AB/);
  assert.equal(await page.locator('#zRows tr').count(), 0);
  await page.locator('#zNeu').click();
  await z(0, 'datum').fill('2026-07-28'); await z(0, 'rolle').selectOption('Probenehmer'); await z(0, 'stunden').fill('4'); await z(0, 'km').fill('1425');
  await page.waitForFunction(() => /Aufwand_AB\.json/.test(document.getElementById('status').textContent));
  mein = JSON.parse(await lies('§/Abrechnung/Aufwand_SK.json'));
  assert.equal(mein.eintraege.length, 2, 'SK unverändert');
  await page.locator('button[data-tab="abrechnung"]').click();
  assert.match(await page.locator('#seite').textContent(), /28\.07\.2026: km von (SK und AB|AB und SK) – zwei Fahrzeuge\?/);
  assert.match(await page.locator('#seite').textContent(), /1\.006\s*Probenehmer[\s\S]*?4\s*Std\./);

  // Eingabe und sofort „Neu einlesen“ (vor Ablauf der Speicherverzögerung): die Eingabe muss in der Datei landen, nicht verloren gehen
  await page.locator('button[data-tab="zeiten"]').click();
  await z(0, 'notiz').fill('Fahrgemeinschaft geklärt');
  await page.locator('#bNeu').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('✓ gespeichert in'));
  await page.locator('#zRows').waitFor();
  assert.equal(await z(0, 'notiz').inputValue(), 'Fahrgemeinschaft geklärt', 'Eingabe bleibt nach „Neu einlesen“ sichtbar');
  assert.equal(JSON.parse(await lies('§/Abrechnung/Aufwand_AB.json')).eintraege[0].notiz, 'Fahrgemeinschaft geklärt', 'Eingabe vor dem Neueinlesen gespeichert');
  // Regression A: Schreibfehler blockiert Kürzel-/Projektwechsel und Neueinlesen; danach erneut speichern.
  await page.evaluate(() => {
    window.__createWritable = FileSystemFileHandle.prototype.createWritable;
    FileSystemFileHandle.prototype.createWritable = function(...args){
      if (this.name === 'Aufwand_AB.json') throw new DOMException('Kein Schreibzugriff', 'NotAllowedError');
      return window.__createWritable.apply(this, args);
    };
  });
  await z(0, 'notiz').fill('Noch nicht gespeichert');
  await page.locator('#kz').fill('SK'); await page.locator('#kz').dispatchEvent('change');
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Nicht gespeichert:'));
  assert.equal((await kz()).feld, 'AB', 'Kürzelfeld zurückgesetzt');
  assert.equal((await kz()).gemeinsam, 'AB', 'gemeinsames Kürzel bleibt erhalten');
  assert.equal((await kz()).eigen, 'AB', 'eigenes Kürzel bleibt erhalten');
  assert.equal(await z(0, 'notiz').inputValue(), 'Noch nicht gespeichert');
  assert.match(await page.locator('#seite h2').first().textContent(), /Meine Zeiten · AB/);
  assert.equal(JSON.parse(await lies('§/Abrechnung/Aufwand_AB.json')).eintraege[0].notiz, 'Fahrgemeinschaft geklärt', 'Datei unverändert');
  // Auch ein bereits fehlgeschlagener automatischer Speicherversuch muss den Wechsel verhindern.
  await z(0, 'notiz').fill('Weiterhin ungespeichert');
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Nicht gespeichert:'));
  for (const id of ['bNeu', 'bWechsel']){
    await page.locator('#' + id).click();
    await page.evaluate(() => A.schreib.catch(() => {}));
    assert.equal(await z(0, 'notiz').inputValue(), 'Weiterhin ungespeichert', id + ': Eingabe erhalten');
    assert.match(page.url(), /projekt=26\.0389/);
  }
  await page.evaluate(() => { FileSystemFileHandle.prototype.createWritable = window.__createWritable; delete window.__createWritable; });
  await page.locator('#bNeu').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('✓ gespeichert in'));
  await page.locator('#zRows').waitFor();
  assert.equal(await z(0, 'notiz').inputValue(), 'Weiterhin ungespeichert', 'Wiederholung erfolgreich');
  assert.equal(JSON.parse(await lies('§/Abrechnung/Aufwand_AB.json')).eintraege[0].notiz, 'Weiterhin ungespeichert');

  // Eingabe und sofort Kürzel wechseln: die Eingabe gehört in die Datei des bisherigen Kürzels
  await z(0, 'stunden').fill('4,5');
  await page.locator('#kz').fill('SK'); await page.locator('#kz').dispatchEvent('change');
  await page.waitForFunction(() => /Meine Zeiten · SK/.test(document.querySelector('#seite h2')?.textContent || ''));
  assert.equal(JSON.parse(await lies('§/Abrechnung/Aufwand_AB.json')).eintraege[0].stunden, '4,5', 'Eingabe von AB in Aufwand_AB.json');
  assert.equal(JSON.parse(await lies('§/Abrechnung/Aufwand_SK.json')).eintraege.length, 2, 'SK unverändert');
  await page.locator('#kz').fill('AB'); await page.locator('#kz').dispatchEvent('change');
  await page.waitForFunction(() => /Meine Zeiten · AB/.test(document.querySelector('#seite h2')?.textContent || ''));
  assert.equal(await z(0, 'stunden').inputValue(), '4,5');
  await z(0, 'stunden').fill('4');
  await page.waitForFunction(() => /gespeichert in „Abrechnung\/Aufwand_AB\.json“/.test(document.getElementById('status').textContent));

  // Neu laden: alles kommt aus den Dateien zurück
  await page.reload();
  await page.locator('nav.tabs').waitFor();
  await page.locator('button[data-tab="abrechnung"]').click();
  assert.match(await page.locator('#seite').textContent(), /1\.004\s*Fahrkosten[\s\S]*?2\.850\s*km/);

  // Einstellungen: Laborposition anlegen, speichern
  await page.locator('button[data-tab="einst"]').click();
  await page.locator('#eLab').click();
  const letzte = page.locator('#ePos tr').last();
  await letzte.locator('[data-p="nr"]').fill('2.010'); await letzte.locator('[data-p="text"]').fill('Asbestanalyse(n)');
  await page.locator('#eSpeichern').click();
  await page.waitForFunction(() => /Einstellungen gespeichert/.test(document.getElementById('status').textContent));
  assert.ok(JSON.parse(await lies('_AufwandKit-Einstellungen.json')).positionen.some(p => p.nr === '2.010' && p.text === 'Asbestanalyse(n)'));

  // ---------- 1.3.2: nichts fällt still aus der Abrechnung ----------
  const schreibeIn = (pfad, inhalt) => page.evaluate(async ({ PROJ, pfad, inhalt }) => {
    let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner');
    const teile = pfad.split('/'); for (const t of teile.slice(0, -1)) d = await d.getDirectoryHandle(t === '§' ? PROJ : t, { create: true });
    const w = await (await d.getFileHandle(teile[teile.length - 1], { create: true })).createWritable(); await w.write(inhalt); await w.close();
  }, { PROJ, pfad, inhalt });
  const loesche = pfad => page.evaluate(async ({ PROJ, pfad }) => {
    let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner');
    const teile = pfad.split('/'); for (const t of teile.slice(0, -1)) d = await d.getDirectoryHandle(t === '§' ? PROJ : t);
    await d.removeEntry(teile[teile.length - 1], { recursive: true });
  }, { PROJ, pfad });
  // Wiederherstellung: eigene Datei zeitweise unlesbar, neue Eingaben sicher mit Originalen vereinen.
  await page.locator('button[data-tab="zeiten"]').click();
  const zeitPfad = '§/Abrechnung/Aufwand_AB.json', zeitOriginal = await lies(zeitPfad);
  const original = JSON.parse(zeitOriginal);
  assert.equal(original.eintraege.length, 1);
  await page.evaluate(() => {
    window.__zeitGetFile = FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile = function(...args){
      if (this.name === 'Aufwand_AB.json') throw new DOMException('Vorübergehend nicht lesbar', 'NotReadableError');
      return window.__zeitGetFile.apply(this, args);
    };
  });
  await page.evaluate(() => ladeAlles());
  assert.equal(await page.locator('#zRows tr').count(), 0, 'Original konnte nicht geladen werden');
  await page.locator('#zNeu').click();
  await z(0, 'stunden').fill('2'); await z(0, 'notiz').fill('Während des Lesefehlers erfasst');
  const speichernVersuch = () => page.evaluate(() => sichereMeine().then(() => null, e => e.message));
  assert.match(await speichernVersuch(), /nicht lesbar/);
  assert.match(await page.locator('#status').textContent(), /Nicht gespeichert:/);
  await page.evaluate(() => { FileSystemFileHandle.prototype.getFile = window.__zeitGetFile; delete window.__zeitGetFile; });
  assert.equal(await lies(zeitPfad), zeitOriginal, 'bei fortbestehendem Lesefehler Original bytegenau erhalten');
  const neuerEintrag = await page.evaluate(() => ({ ...A.meine[0] }));
  assert.equal(await z(0, 'notiz').inputValue(), neuerEintrag.notiz);
  // Eine verschwundene Datei und nicht eindeutig zuordenbare Daten bleiben gesperrt.
  await loesche(zeitPfad);
  assert.match(await speichernVersuch(), /fehlt nach dem Lesefehler/);
  await assert.rejects(() => lies(zeitPfad), /NotFoundError/, 'fehlende Datei nicht neu angelegt');
  for (const eintraege of [{}, [original.eintraege[0], original.eintraege[0]], [{ ...original.eintraege[0], id: '' }], [{ ...neuerEintrag, stunden: '99' }]]){
    const unklar = JSON.stringify({ ...original, eintraege });
    await schreibeIn(zeitPfad, unklar);
    assert.match(await speichernVersuch(), /Struktur|IDs|Widersprüchliche/);
    assert.equal(await lies(zeitPfad), unklar, 'unklare Daten nicht überschrieben');
    assert.equal(await z(0, 'notiz').inputValue(), neuerEintrag.notiz, 'neue Eingabe erhalten');
  }
  // Externe Reparatur, Wiederholung über denselben Speicherablauf.
  await schreibeIn(zeitPfad, zeitOriginal);
  assert.equal(await speichernVersuch(), null);
  const gerettet = JSON.parse(await lies(zeitPfad));
  assert.equal(gerettet.eintraege.length, 2);
  assert.equal(new Set(gerettet.eintraege.map(e => e.id)).size, 2, 'keine doppelten IDs');
  assert.deepEqual(gerettet.eintraege.find(e => e.id === original.eintraege[0].id), original.eintraege[0], 'Originaleintrag vollständig erhalten');
  assert.deepEqual(gerettet.eintraege.find(e => e.id === neuerEintrag.id), neuerEintrag, 'neuer Eintrag vollständig erhalten');
  assert.equal(await page.locator('#zRows tr').count(), 2, 'beide Einträge sichtbar');
  await page.evaluate(() => setzeKuerzel('SK'));
  assert.equal((await kz()).feld, 'SK', 'Kürzelwechsel nach Wiederherstellung möglich');
  await page.evaluate(() => setzeKuerzel('AB'));
  await page.evaluate(() => ladeAlles());
  assert.equal(await page.locator('#zRows tr').count(), 2, 'Neueinlesen nach Wiederherstellung möglich');
  assert.deepEqual(JSON.parse(await lies(zeitPfad)).eintraege, gerettet.eintraege, 'auch nach Wechsel keine Duplikate');
  await schreibeIn(zeitPfad, zeitOriginal);
  await page.evaluate(() => ladeAlles());

  // Regression B: Vorhandene Abrechnung bei Lesefehler niemals durch einen neuen Bestand ersetzen.
  const abrechnungOriginal = await lies('§/Abrechnung/_Abrechnung.json');
  await page.locator('button[data-tab="bericht"]').click();
  await page.evaluate(() => {
    window.__getFile = FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile = function(...args){
      if (this.name === '_Abrechnung.json') throw new DOMException('Kein Lesezugriff', 'NotAllowedError');
      return window.__getFile.apply(this, args);
    };
  });
  await page.evaluate(() => document.getElementById('bRows').onchange({ target: document.querySelector('[data-ab="0"]') }));
  await page.waitForFunction(() => /Nicht gespeichert:.*_Abrechnung\.json.*nicht lesbar/.test(document.getElementById('status').textContent));
  await page.evaluate(() => { FileSystemFileHandle.prototype.getFile = window.__getFile; delete window.__getFile; });
  assert.equal(await lies('§/Abrechnung/_Abrechnung.json'), abrechnungOriginal, 'Originaldatei bytegenau erhalten');
  await page.evaluate(() => document.getElementById('bRows').onchange({ target: document.querySelector('[data-ab="0"]') }));
  await page.waitForFunction(() => document.getElementById('status').textContent === '✓ gespeichert');
  // Nur tatsächlich fehlende Dateien werden neu angelegt.
  await loesche('§/Abrechnung/_Abrechnung.json');
  await page.evaluate(() => document.getElementById('bRows').onchange({ target: document.querySelector('[data-ab="0"]') }));
  await page.waitForFunction(() => document.getElementById('status').textContent === '✓ gespeichert');
  assert.equal(JSON.parse(await lies('§/Abrechnung/_Abrechnung.json')).format, 'aufwandkit-projekt');
  await schreibeIn('§/Abrechnung/_Abrechnung.json', abrechnungOriginal);

  // Ein Kollege speichert inzwischen einen anderen Preis: Zuordnung ändern darf ihn nicht zurückschreiben
  { const e = JSON.parse(await lies('_AufwandKit-Einstellungen.json')); e.positionen.find(x => x.key === 'sv1').preis = '150,00'; e.geaendert = '2030-01-01T00:00:00.000Z'; e.geaendertVon = 'XY';
    await schreibeIn('_AufwandKit-Einstellungen.json', JSON.stringify(e)); }
  await page.locator('button[data-tab="proben"]').click();
  await page.locator('select[data-kat="asbest-material"]').selectOption('');
  await page.waitForFunction(() => /Zuordnung gespeichert/.test(document.getElementById('status').textContent));
  { const e = JSON.parse(await lies('_AufwandKit-Einstellungen.json'));
    assert.equal(e.positionen.find(x => x.key === 'sv1').preis, '150,00', 'Preis des Kollegen bleibt');
    assert.equal(e.zuordnung['asbest-material'], undefined); assert.equal(e.zuordnung['pak-wisch'], 'lab-pak'); }
  // … und „Einstellungen speichern“ fragt, statt den neueren Stand still zu überschreiben
  await page.locator('button[data-tab="einst"]').click();
  let gefragt = '';
  page.once('dialog', d => { gefragt = d.message(); d.dismiss(); });
  await page.locator('#eSpeichern').click();
  await page.waitForTimeout(500);
  assert.match(gefragt, /Einstellungen wurden inzwischen gespeichert/);
  assert.equal(JSON.parse(await lies('_AufwandKit-Einstellungen.json')).positionen.find(x => x.key === 'sv1').preis, '150,00', 'abgebrochen: nichts überschrieben');

  // Unlesbare Zeiten-Datei, umbenannter Bericht, Fotos im Unterordner, Mac-Begleitdatei
  await schreibeIn('§/Abrechnung/Aufwand_ZZ.json', '{ kaputt');
  for (const x of ['docx', 'pdf']){ await schreibeIn('§/Mitteilungen/2__Mitteilung_final.' + x, await page.evaluate(() => 'x')); await loesche('§/Mitteilungen/1__Mitteilung.' + x); }
  await schreibeIn('§/Fotos/Ortstermin 2/IMG_1.jpg', 'x'); await schreibeIn('§/Fotos/Ortstermin 2/IMG_2.jpg', 'x'); await schreibeIn('§/Fotos/._26.0389_001.jpg', 'x');
  await page.locator('#bNeu').click(); await page.locator('nav.tabs').waitFor();
  await page.locator('button[data-tab="abrechnung"]').click();
  const t2 = await page.locator('#seite').textContent();
  assert.match(t2, /„Aufwand_ZZ\.json“ ist nicht lesbar – die Zeiten von ZZ fehlen in der Abrechnung/);
  assert.match(t2, /Bericht „1__Mitteilung“ ist zur Abrechnung angekreuzt, liegt aber nicht mehr in „Mitteilungen“/);
  assert.match(t2, /Bilder in Unterordnern \(Ortstermin 2 \(2\)\)/);
  assert.doesNotMatch(t2, /3 Berichtsseiten/, 'Seiten des verschwundenen Berichts nicht still mitgezählt');
  await page.locator('button[data-tab="bericht"]').click();
  assert.match(await page.locator('#seite').textContent(), /5 Fotos \(6 Bilder im Ordner „Fotos“, davon 1 in FotoKit aussortiert\)/, 'Mac-Begleitdatei nicht gezählt');

  assert.deepEqual(errors, [], 'keine Fehler in der Konsole');
  await browser.close(); server.close();
  console.log(`OK (${name})`);
})().catch(e => {
  console.error(e);
  const text = String(e && e.stack || e).slice(0, 1500).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A');
  console.log(`::error title=Browsertest BelegKit ${name}::${text}`);
  process.exit(1);
});
