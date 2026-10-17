// Mosaik-Leiste (Projekt, Arbeitsschritte, „Weiter“, zuletzt geöffnet) im echten Browser: node tests/leiste-browser.cjs [chromium|webkit]
// Gleicher Test in allen Apps der Familie; nur APP unterscheidet sich. Der Archivordner wird im Origin Private File System nachgebildet;
// WebKit kann dort nicht schreiben – dann wird nur geprüft, dass die Leiste ohne Ordnerzugriff erscheint (ohne Haken).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');

const APP = 'beleg';                                  // label | fotos | plan | beleg
const name = process.argv[2] || 'chromium';
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const A = '26.0142 Teststadt', B = '26.0150 Köln';

(async () => {
  const server = http.createServer((req, res) => { res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(html); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await playwright[name].launch();
  const ctx = await browser.newContext({viewport: {width: 1400, height: 900}});
  await ctx.addInitScript(() => { try { localStorage.setItem('willkommen-gelesen', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(url);
  const kann = await page.evaluate(async () => {
    try { const r = await navigator.storage.getDirectory(); const h = await r.getFileHandle('probe.txt', {create: true}); if (!h.createWritable) return false; const w = await h.createWritable(); await w.write('x'); await w.close(); await r.removeEntry('probe.txt'); return true; } catch (e) { return false; }
  });
  const leiste = page.locator('#mosaikLeiste');
  await leiste.waitFor({timeout: 8000});
  if (!kann) {
    assert.match(await leiste.textContent(), /Projektzentrale/);
    assert.deepEqual(errors, []);
    await browser.close(); server.close();
    console.log(`OK (${name}, ohne Ordnerzugriff: nur Leiste geprüft)`);
    return;
  }

  // Archiv mit zwei Projekten: A hat Probenerfassung (LabelKit) und bearbeitete Fotos (FotoKit); B ist leer
  await page.evaluate(async ([a, b]) => {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, {recursive: true});
    const archiv = await r.getDirectoryHandle('Mosaik Archivordner', {create: true});
    const put = async (dir, n, t) => { const w = await (await dir.getFileHandle(n, {create: true})).createWritable(); await w.write(t); await w.close(); };
    const pa = await archiv.getDirectoryHandle(a, {create: true}); await archiv.getDirectoryHandle(b, {create: true});
    await put(pa, '_Projekt.json', JSON.stringify({format: 'mosaik-projekt', version: 1, daten: {objekt: 'EFH, Musterweg 7, 52525 Heinsberg'}}));
    await put(await pa.getDirectoryHandle('Laboraufträge', {create: true}), '26.0142_Daten.json', '{}');
    await put(await pa.getDirectoryHandle('Fotos', {create: true}), '_Bildumbenenner.json', '{}');
    await new Promise((res, rej) => { const q = indexedDB.open('mosaik-suite', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv');
      q.onsuccess = () => { const t = q.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(archiv, 'archiv'); t.objectStore('kv').put([a, b], 'zuletzt'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }; q.onerror = () => rej(q.error); });
  }, [A, B]);

  // 1) ohne Projekt: „Weiter mit <zuletzt>“ öffnet dieses Projekt in dieser App
  await page.goto(url);
  const weiterOhne = page.locator('#mosaikLeiste .ml-weiter');
  await weiterOhne.waitFor();
  assert.match(await weiterOhne.textContent(), /Weiter mit 26\.0142 Teststadt/);
  assert.equal(await weiterOhne.getAttribute('href'), '?projekt=' + encodeURIComponent(A));

  // 2) mit Projekt: Name, Objekt, vier Schritte mit Haken, nächster Schritt
  await page.goto(url + '?projekt=' + encodeURIComponent(A));
  await page.waitForSelector('#mosaikLeiste .ml-obj', {timeout: 8000});
  const txt = (await leiste.textContent()).replace(/\s+/g, ' ');
  assert.match(txt, /26\.0142 Teststadt/); assert.match(txt, /EFH, Musterweg 7, 52525 Heinsberg/);
  for (const n of ['LabelKit', 'FotoKit', 'PlanKit', 'BelegKit']) assert.match(txt, new RegExp(n));
  const schritt = id => leiste.locator('.ml-step', {hasText: {label: 'LabelKit', fotos: 'FotoKit', plan: 'PlanKit', beleg: 'BelegKit'}[id]});
  assert.ok(await schritt('label').evaluate(e => e.classList.contains('done')), 'LabelKit erledigt');
  assert.ok(await schritt('fotos').evaluate(e => e.classList.contains('done')), 'FotoKit erledigt');
  assert.ok(!(await schritt('plan').evaluate(e => e.classList.contains('done'))), 'PlanKit offen');
  assert.ok(await schritt(APP).evaluate(e => e.classList.contains('hier')), 'diese App ist markiert');
  assert.equal(await leiste.locator('.ml-step.hier').getAttribute('aria-current'), 'page');
  const naechster = APP === 'plan' ? /Weiter: BelegKit/ : /Weiter: PlanKit/;
  assert.match(await leiste.locator('.ml-weiter').textContent(), naechster);
  assert.match(await leiste.locator('.ml-weiter').getAttribute('href'), /\?projekt=26\.0142%20Teststadt$/);
  assert.equal(await leiste.locator('.ml-weiter').getAttribute('target'), APP === 'plan' ? 'aufwandkit' : 'plankit');
  // Schritte der anderen Apps sind Links mit demselben Projekt, die eigene App ist keiner
  assert.equal(await leiste.locator('a.ml-step').count(), 3);
  assert.equal(await leiste.locator('input, textarea').count(), 0);

  // 3) Projektwechsel: zuletzt benutzte Projekte, Wechsel bleibt in dieser App
  await leiste.locator('.ml-proj').click();
  const pop = page.locator('#mosaikLeistePop');
  assert.match(await pop.textContent(), /26\.0150 Köln/); assert.match(await pop.textContent(), /Alle Projekte/);
  // Aktualisierung im Hintergrund (alle 20 s, beim Fensterwechsel) schließt das offene Menü nicht
  await page.evaluate(() => window.MosaikLeiste.aktualisieren()); await page.waitForTimeout(150);
  assert.equal(await pop.count(), 1, 'Menü bleibt bei Aktualisierung offen');
  assert.match(await pop.locator('a', {hasText: B}).getAttribute('href'), /\?projekt=26\.0150%20K%C3%B6ln$/);
  await page.keyboard.press('Escape');
  assert.equal(await pop.count(), 0);
  await Promise.all([page.waitForURL(/projekt=26\.0150/), (async () => { await leiste.locator('.ml-proj').click(); await pop.locator('a', {hasText: B}).click(); })()]);
  await page.waitForSelector('#mosaikLeiste .ml-proj b');
  assert.match(await leiste.locator('.ml-proj b').textContent(), /26\.0150 Köln/);
  await page.waitForFunction(() => document.querySelectorAll('#mosaikLeiste .ml-step.done').length === 0);   // Projekt B ist leer: keine Haken
  assert.equal(await leiste.locator('.ml-obj').count(), 0);

  // 4) zuletzt geöffnet wird mitgeschrieben (B steht jetzt vorn)
  const zuletzt = await page.evaluate(() => new Promise(res => { const q = indexedDB.open('mosaik-suite', 1); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('zuletzt'); g.onsuccess = () => res(g.result); }; }));
  assert.deepEqual(zuletzt, [B, A]);

  assert.deepEqual(errors, []);
  await browser.close(); server.close();
  console.log(`OK (${name})`);
})().catch(e => { console.error(e); process.exit(1); });
