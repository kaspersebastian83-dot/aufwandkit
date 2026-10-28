// Ort ohne Kürzel und „Ihr Kürzel“ aus der Projektzentrale: node tests/ort-kuerzel-browser.cjs [chromium|webkit]
//  • Mit der Mitarbeiterliste im Archivordner steht der Ort ohne Kürzel (Projektauswahl, Abrechnung).
//  • Ohne gespeichertes Kürzel wird das App-Kürzel zu „Ich bin …“ der Projektzentrale übernommen; ein vorhandenes nie überschrieben.
//  • Ohne Mitarbeiterliste unverändert. Nur erfundene Kürzel und Namen.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');

const name = process.argv[2] || 'chromium';
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PROJ = '26.0150 Teststadt Abc';
const LISTE = {format: 'spektron-mitarbeiter', version: 1, personen: [
  {ordnerKuerzel: 'Abc', appKuerzel: 'AB', name: 'Anna Beispiel', aktiv: true},
  {ordnerKuerzel: 'Dr. Te', appKuerzel: 'TE', name: 'Dr. Tea Test', aktiv: true},
  {ordnerKuerzel: 'Alt', appKuerzel: 'ALT', name: 'Ehemalig', aktiv: false}]};

(async () => {
  const server = http.createServer((req, res) => {
    if (['/time-store.js','/spektron-ordner.js'].includes(new URL(req.url,'http://x').pathname)){ res.writeHead(200, {'content-type': 'application/javascript'}); res.end(fs.readFileSync(path.join(__dirname,'..',new URL(req.url,'http://x').pathname.slice(1)))); return; }
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(html);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await playwright[name].launch();
  try {
    const page = await (await browser.newContext({viewport: {width: 1400, height: 900}})).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('dialog', d => d.accept());
    await page.goto(url);
    const kann = await page.evaluate(async () => {
      try { const r = await navigator.storage.getDirectory(); const h = await r.getFileHandle('probe.txt', {create: true}); if (!h.createWritable) return false; await r.removeEntry('probe.txt'); return 'showDirectoryPicker' in window; } catch (e) { return false; }
    });
    if (!kann) { assert.deepEqual(errors, []); console.log(`OK (${name}, ohne Ordnerzugriff: nur Laden geprüft)`); return; }

    const seed = (liste, speicher) => page.evaluate(async ([proj, liste, speicher]) => {
      const r = await navigator.storage.getDirectory();
      for await (const [n] of r.entries()) await r.removeEntry(n, {recursive: true});
      const archiv = await r.getDirectoryHandle('Mosaik Archivordner', {create: true});
      await archiv.getDirectoryHandle(proj, {create: true});
      if (liste){ const w = await (await archiv.getFileHandle('_Spektron-Mitarbeiter.json', {create: true})).createWritable(); await w.write(JSON.stringify(liste)); await w.close(); }
      await new Promise((res, rej) => { const q = indexedDB.open('mosaik-suite', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv');
        q.onsuccess = () => { const t = q.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(archiv, 'archiv'); t.objectStore('kv').delete('zuletzt'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }; q.onerror = () => rej(q.error); });
      for (const k of ['mosaik-kuerzel', 'aufwandkit-kuerzel', 'spektron-ich']) localStorage.removeItem(k);
      for (const [k, v] of Object.entries(speicher)) localStorage.setItem(k, v);
    }, [PROJ, liste, speicher]);
    const oeffnen = async () => { await page.goto(url + '?projekt=' + encodeURIComponent(PROJ)); await page.waitForFunction(() => /›/.test(document.getElementById('projekt').textContent), null, {timeout: 8000}); };
    const auswahl = async () => { await page.goto(url); await page.locator('#pListe .pz').first().waitFor({timeout: 8000}); return (await page.locator('#pListe .pz').first().textContent()).replace(/\s+/g, ' ').trim(); };

    // 1) Liste + „Ich bin“ Abc, noch kein Kürzel → AB übernommen, Ort ohne Kürzel in der Auswahl
    await seed(LISTE, {'spektron-ich': 'Abc'});
    await oeffnen();
    await page.locator('#status', {hasText: 'Ihr Kürzel „AB“ aus der Projektzentrale'}).waitFor({timeout: 8000});
    assert.equal(await page.inputValue('#kz'), 'AB');
    assert.equal(await page.evaluate(() => localStorage.getItem('mosaik-kuerzel')), 'AB');
    assert.equal(await page.getAttribute('#kz', 'list'), 'ma-kuerzel');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#ma-kuerzel option')].map(o => o.value)), ['AB', 'TE']);
    assert.equal(await auswahl(), '26.0150 Teststadt');

    // 2) vorhandenes Kürzel wird nie überschrieben
    await seed(LISTE, {'spektron-ich': 'Abc', 'mosaik-kuerzel': 'ZZ'});
    await oeffnen();
    assert.equal(await page.inputValue('#kz'), 'ZZ');
    assert.equal(await page.evaluate(() => localStorage.getItem('mosaik-kuerzel')), 'ZZ');

    // 2b) „Ich bin“ zeigt auf eine inzwischen inaktive Person: kein automatisches Kürzel
    await seed(LISTE, {'spektron-ich': 'Alt'});
    await oeffnen();
    assert.equal(await page.evaluate(() => localStorage.getItem('mosaik-kuerzel')), null);

    // 3) ohne Mitarbeiterliste: Ort wie bisher, kein Kürzel gesetzt
    await seed(null, {'spektron-ich': 'Abc'});
    assert.equal(await auswahl(), '26.0150 Teststadt Abc');
    await oeffnen();
    assert.equal(await page.evaluate(() => localStorage.getItem('mosaik-kuerzel')), null);

    assert.deepEqual(errors, []);
    console.log(`OK Ort/Kürzel (${name}): Kürzel übernommen, nie überschrieben, Ort ohne Kürzel, ohne Liste unverändert`);
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
