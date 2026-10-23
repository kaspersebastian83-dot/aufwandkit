// Mosaik-Leiste (Projekt, Arbeitsschritte, „Weiter“, zuletzt geöffnet) im echten Browser: node tests/leiste-browser.cjs chromium
// Projektwechsel im Origin Private File System mit einem synthetischen Archivordner.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');

const name = 'chromium';
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const A = '26.0142 Teststadt', B = '26.0150 Köln & Süd + 50% #Hof';

(async () => {
  const server = http.createServer((req, res) => { if(new URL(req.url,'http://x').pathname==='/time-store.js'){res.writeHead(200,{'content-type':'application/javascript'});res.end(fs.readFileSync(path.join(__dirname,'..','time-store.js')));return;} res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(html); });
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
  const leiste = page.locator('#mosaikLeiste');
  await leiste.waitFor({timeout: 8000});

  // Archiv mit zwei Projekten: A hat Probenerfassung (LabelKit) und bearbeitete Fotos (FotoKit); B ist leer
  await page.evaluate(async ([a, b]) => {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, {recursive: true});
    const archiv = await r.getDirectoryHandle('Mosaik Archivordner', {create: true});
    const put = async (dir, n, t) => { const w = await (await dir.getFileHandle(n, {create: true})).createWritable(); await w.write(t); await w.close(); };
    const pa = await archiv.getDirectoryHandle(a, {create: true}); await archiv.getDirectoryHandle(b, {create: true});
    await put(pa, '_Projekt.json', JSON.stringify({format: 'mosaik-projekt', version: 1, projektnummer: '26.0142', schadenort: 'Teststadt', objekt: 'EFH, Musterweg 7, 52525 Heinsberg'}));
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
  assert.equal(await weiterOhne.getAttribute('href'), '#projekt=' + encodeURIComponent(A));

  // 2) Projektlinks behalten denselben Projektordner
  await page.goto(url + '?projekt=' + encodeURIComponent(A));
  await page.waitForSelector('#mosaikLeiste .ml-obj', {timeout: 8000});
  // Schritte der anderen Apps sind Links mit demselben Projekt, die eigene App ist keiner
  assert.equal(await leiste.locator('a.ml-step').count(), 3);
  for (const a of await leiste.locator('a.ml-step, a.ml-weiter').all()){
    const link = new URL(await a.getAttribute('href'), page.url());
    assert.equal(link.searchParams.has('projekt'), false, 'Kein Projekt im HTTP-Query');
    assert.equal(new URLSearchParams(link.hash.slice(1)).get('projekt'), A);
  }
  assert.equal(await leiste.locator('input, textarea').count(), 0);
  // Bereits geöffnetes benanntes App-Fenster muss bei erneutem Absprung wirklich neu laden.
  const quer = leiste.locator('a.ml-step').first(), querUrl = new URL(await quer.getAttribute('href'), page.url());
  const routeMatch = u => u.pathname.startsWith(querUrl.pathname);
  const querAnfragen = [];
  await ctx.route(routeMatch, route => {
    querAnfragen.push(route.request().url());
    return route.fulfill({contentType:'text/html', body:'<!doctype html><body><script>document.body.dataset.projekt=new URLSearchParams(location.hash.slice(1)).get("projekt");</script></body>'});
  });
  const [anderesFenster] = await Promise.all([page.waitForEvent('popup'), quer.click()]);
  await anderesFenster.waitForFunction(name => document.body.dataset.projekt === name, A);
  await Promise.all([anderesFenster.waitForEvent('load'), quer.click()]);
  assert.equal(ctx.pages().length, 2, 'Benanntes Fenster wird wiederverwendet');
  assert.equal(new URLSearchParams(new URL(anderesFenster.url()).hash.slice(1)).get('projekt'), A);
  assert.ok(querAnfragen.length >= 2, 'Zweiter Absprung lädt ein neues Dokument');
  assert.ok(querAnfragen.every(u => !new URL(u).searchParams.has('projekt') && !new URL(u).hash));
  await anderesFenster.close(); await ctx.unroute(routeMatch);

  // 3) Projektwechsel: zuletzt benutzte Projekte, Wechsel bleibt in dieser App
  await leiste.locator('.ml-proj').click();
  const pop = page.locator('#mosaikLeistePop');
  assert.match(await pop.textContent(), /26\.0150 Köln/); assert.match(await pop.textContent(), /Alle Projekte/);
  // Aktualisierung im Hintergrund (alle 20 s, beim Fensterwechsel) schließt das offene Menü nicht
  await page.evaluate(() => window.MosaikLeiste.aktualisieren()); await page.waitForTimeout(150);
  assert.equal(await pop.count(), 1, 'Menü bleibt bei Aktualisierung offen');
  assert.equal(await pop.locator('a', {hasText: B}).getAttribute('href'), '#projekt=' + encodeURIComponent(B));
  await page.keyboard.press('Escape');
  assert.equal(await pop.count(), 0);
  // Abgebrochene beforeunload-Warnung darf weder URL noch Projekt ändern.
  const vorher = page.url();
  await page.evaluate(() => { window.__wechselSperre = e => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', window.__wechselSperre); });
  page.removeAllListeners('dialog');
  page.on('dialog', d => d.dismiss());
  await leiste.locator('.ml-proj').click();
  await Promise.all([page.waitForEvent('dialog'), pop.locator('a', {hasText: B}).click()]);
  assert.equal(page.url(), vorher, 'Abbruch erhält alte Adresse');
  assert.ok((await leiste.locator('.ml-proj b').textContent()).includes(A));
  await page.evaluate(() => window.removeEventListener('beforeunload', window.__wechselSperre));
  page.removeAllListeners('dialog'); page.on('dialog', d => d.accept());
  await page.keyboard.press('Escape');
  const projektAnfragen = [];
  page.on('request', req => { if (req.isNavigationRequest()) projektAnfragen.push(req.url()); });
  await Promise.all([page.waitForEvent('load'), page.waitForURL(/projekt=26\.0150/), (async () => { await leiste.locator('.ml-proj').click(); await pop.locator('a', {hasText: B}).click(); })()]);
  await page.waitForSelector('#mosaikLeiste .ml-proj b');
  assert.match(await leiste.locator('.ml-proj b').textContent(), /26\.0150 Köln/);
  await page.waitForFunction(() => document.querySelectorAll('#mosaikLeiste .ml-step.done').length === 0);   // Projekt B ist leer: keine Haken
  assert.equal(await leiste.locator('.ml-obj').count(), 0);
  assert.equal(new URL(page.url()).searchParams.has('projekt'), false);
  assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('projekt'), B, 'Sonderzeichen nach echtem App-Neustart erhalten');

  // 4) zuletzt geöffnet wird mitgeschrieben (B steht jetzt vorn)
  const zuletzt = await page.evaluate(() => new Promise(res => { const q = indexedDB.open('mosaik-suite', 1); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('zuletzt'); g.onsuccess = () => res(g.result); }; }));
  assert.deepEqual(zuletzt, [B, A]);
  assert.ok(projektAnfragen.length > 0, 'Projektwechsel lädt wirklich ein neues Dokument');
  for (const request of projektAnfragen){
    assert.equal(new URL(request).searchParams.has('projekt'), false);
    assert.equal(new URL(request).hash, '', 'Projektfragment ist kein Teil der HTTP-Anfrage');
  }

  assert.deepEqual(errors, []);
  await browser.close(); server.close();
  console.log(`OK (${name})`);
})().catch(e => { console.error(e); process.exit(1); });
