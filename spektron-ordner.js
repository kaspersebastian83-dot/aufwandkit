/* SPEKTRON-ORDNER v1 – in allen Spektron-Apps byte-gleich halten (Vorlage: Projektzentrale/spektron-ordner.js).
   Wo liegen die App-Daten eines Projekts? Grundsatz: Alles, was ohne App nicht nutzbar ist, liegt im Unterordner
   „_Spektron“ des Projektordners; Fotos, PDFs, Word, Excel und CSV bleiben in den Büro-Ordnern.

     <Projekt>/_Spektron/BITTE NICHT ANFASSEN.txt
     <Projekt>/_Spektron/_Projekt.json, _Projekt_Sicherungen/        (früher direkt im Projektordner)
     <Projekt>/_Spektron/FotoKit/      _Bildumbenenner.json, _FotoKit_Fassungen/   (früher Fotos/)
     <Projekt>/_Spektron/FotoKit/Pruefsummen/  Pruefsummen_Originale_….sha256       (früher Fotos/)
     <Projekt>/_Spektron/LabelKit/     …_Daten.json (früher Laboraufträge/), _Ablage-Protokoll.txt (früher Feldprotokolle/)
     <Projekt>/_Spektron/ResultKit/    _Ergebnisse.json, _Ergebnisse.vorher.json   (früher Laborergebnisse/)
     <Projekt>/_Spektron/PlanKit/      *.probenplan                                (früher Pläne/)
     <Projekt>/_Spektron/BelegKit/     *.json, _BelegKit_Sicherungen/   (früher Abrechnung/; die CSV bleiben in Abrechnung/)
     <Projekt>/_Spektron/Buero/        aufgaben/, vermerke/, frühere Übergaben    (früher _Buero/)
     <Projekt>/_Spektron/Protokolle/   _Anlagen-Protokoll.txt                      (früher Mitteilungen/)
     <Projekt>/_Spektron/BerichtKit/   _BerichtKit.json  Angaben zum Bericht (Vor Spektron: Mitteilungen/; die Word-Datei bleibt in Mitteilungen/)

   Welche Projekte: Projektnummer ab 26.0560 – oder ein „_Spektron“-Ordner ist schon da (von Hand übernommenes Projekt).
   Projekte „Vor Spektron“ bekommen nie einen „_Spektron“-Ordner; dort gilt immer der frühere Ort.

   ort(projektordner, bereich) sagt, wo ein Bereich gerade liegt. Alle Apps lesen UND schreiben dort:
     1. Neuer Ort hat passende Einträge und der frühere keine, oder der Umzug ist vermerkt → neu.
        Neuer Ort hat die Hauptdatei des Bereichs (z. B. _Projekt.json, nicht nur _Projekt_Sicherungen/; LabelKit: nur eine
        „…_Daten.json“ dieses Projekts, seit 11.11.2026 – eine fremde schaltet nicht mehr um) → neu – auch, wenn
        am früheren Ort etwas liegt („konflikt“; z. B. eine Datei, die jemand dorthin kopiert hat). Ausnahme: der Umzug dieses
        Bereichs läuft gerade oder wurde unterbrochen („laeuft“ im Umzugsvermerk) → dann gelten noch die Originale.
     2. Sonst: früherer Ort hat passende Einträge → alt.
     3. Nichts da → neu, wenn „_Spektron“ schon existiert oder UMSTELLUNG an ist; sonst alt.
   (Bis 10.11.2026 galt bei Einträgen an beiden Orten ohne Umzugsvermerk der frühere Ort – Audit K1: eine einzelne
   kopierte Datei schaltete so ein ganzes Projekt zurück.) zweiOrte()/zweiOrteText() liefern die eine sichtbare Zeile,
   die jede App bei „konflikt“ zeigt.
   Der Umzug selbst (kopieren, prüfen, vermerken, löschen) gehört in die Projektzentrale; hier nur lesen und planen.
   Läuft im Browser (globalThis.SpektronOrdner) und in Node (module.exports, für Tests). Keine Abhängigkeiten. */
(function(root){
'use strict';

const VERSION = 1;
const ORDNER = '_Spektron';
const AB = '26.0560';                 // erstes Spektron-Projekt
const UMSTELLUNG = true;              // seit dem Umzug (28.10.2026): neue Projekte landen gleich in _Spektron
const MARKER = '_Umzug.json';         // <Projekt>/_Spektron/_Umzug.json: { format:'spektron-umzug', version:1, bereiche:{ <id>:{ am, ... } }, laeuft:{ <id>: am } }
const HINWEIS_DATEI = 'BITTE NICHT ANFASSEN.txt';
const HINWEIS_TEXT = [
  'Spektron – Daten der Apps zu diesem Projekt',
  '',
  'In diesem Ordner speichern die Spektron-Apps (Projektzentrale, LabelKit, FotoKit, ResultKit, PlanKit, BerichtKit, BelegKit, BüroKit)',
  'ihre Arbeitsdaten: Projektdaten, Probenerfassung, Bildangaben, Laborwerte, Plan, Berichtsangaben, Zeiten und Büroaufgaben.',
  '',
  'Bitte nichts löschen, umbenennen oder verschieben – auch nicht beim Aufräumen.',
  'Ohne diesen Ordner kennen die Apps das Projekt nicht mehr.',
  '',
  'Fotos, Pläne, Laborberichte, Anlagen und Abrechnungen (CSV) liegen wie gewohnt in den anderen Ordnern des Projekts.',
  ''
].join('\r\n');

const nfc = s => String(s == null ? '' : s).normalize('NFC');
const gleich = (a, b) => nfc(a).toLowerCase() === nfc(b).toLowerCase();
/* Eintrag passt nur mit Name UND Art: ein Ordner „_Ergebnisse.json“ oder eine Datei „_Projekt_Sicherungen“ zählt nicht. */
const datei = (...namen) => (name, art) => art === 'file' && namen.some(n => gleich(name, n));
const ordner = (...namen) => (name, art) => art === 'directory' && namen.some(n => gleich(name, n));
const muster = re => (name, art) => art === 'file' && re.test(nfc(name));
const oder = (...regeln) => (name, art) => regeln.some(r => r(name, art));

/* Bereiche: alt = Pfad ab Projektordner, neu = Pfad ab _Spektron, passt(name, art) = gehört der Eintrag dazu,
   haupt(name, art, k) = die Datei, mit der die App arbeitet (Sicherungen, Vorher-Kopien und leere Ordner zählen nicht) –
   nur sie lässt den neuen Ort gegen Einträge am früheren Ort gewinnen (ohne haupt: wie passt). k = { nr } aus dem
   Projektordnernamen (PlanKit: die Hauptdatei heißt „Probenplan <Projektnummer> ….probenplan“). */
const BEIWERK = /^(thumbs\.db|desktop\.ini|\.ds_store)$|\.crswap$/i;   // Windows/Chrome-Beiwerk – wie im Umzug: zählt nie als App-Datei
const PLAN_NEBEN = / \((vorher|Wiederherstellung|Speicherkandidat|Kopie)\b[^)]*\)\.probenplan$/i;   // wie PlanKits Leiste
const NR = /^(\d{2}\.\d{2,6})(?:[\s_-]|$)/;                                    // Projektnummer am Anfang des Ordnernamens
const PLAN_NR = /^Probenplan (\d{2}\.\d{2,6})(?:[\s_-]|\.probenplan$)/i;          // „Probenplan 26.0606 ….probenplan“
const projektNr = name => (NR.exec(nfc(name).trim()) || [])[1] || '';
/* PlanKit-Hauptdatei: keine Sicherung UND – wenn der Ordnername eine Projektnummer hat – „Probenplan <diese Nummer> …“.
   Die Nummer bleibt bei einem umbenannten Ordner (Dr.Ka → Dr. Ka) gleich; Notfallkopien („PlanKit Notfallkopie …“) und
   Downloads („<Ordnername>.probenplan“) zählen so nie. Ohne lesbare Nummer: jede .probenplan ohne Sicherungs-Zusatz. */
function planHaupt(name, art, k){
  const n = nfc(name);
  if (art !== 'file' || !/\.probenplan$/i.test(n) || PLAN_NEBEN.test(n)) return false;
  if (!k || !k.nr) return true;
  return (PLAN_NR.exec(n) || [])[1] === k.nr;
}
/* LabelKit-Projektdatei – dieselbe Regel wie LabelKit 5.1.0 (eigeneProjektdatei/projektdateienLesen), Audit o7/m1 (11.11.2026):
   eigen = Name (NFC, ohne Rand-Leerzeichen) beginnt mit der Projektnummer, danach keine Ziffer („26.0604_Daten.json“, auch die
   datierten „26.0604_12.10.2025_Daten.json“; nicht „26.06041…“). Die Nummer wird wie in LabelKit gelesen (2 Ziffern, Punkt, 3–6
   Ziffern); ohne solche Nummer zählt jede „…_Daten.json“ als eigen. Fremde Dateien werden nie gelesen. */
const LK_DATEI = /_Daten\.json$/i;
const LK_NR = /(?<!\d)\d{2}\.\d{3,6}(?!\d)/;
const lkNr = nr => (LK_NR.exec(nfc(nr)) || [''])[0];
function labelkitEigen(name, nr){
  if (!LK_DATEI.test(nfc(name))) return false;
  const k = lkNr(nr); if (!k) return true;
  const n = nfc(name).trim();
  return n.startsWith(k) && !/^\d/.test(n.slice(k.length));
}
const lkHaupt = (name, art, k) => art === 'file' && labelkitEigen(name, k && k.nr);
/** Welche LabelKit-Datei gilt im Ordner dir (Projektordnername für die Nummer)? Wie LabelKit: „<Nr>_Daten.json“ gilt; eine andere
    eigene Datei nur, wenn sie laut „gespeichertAm“ später gespeichert wurde (Kopieren setzt das Änderungsdatum neu); ohne feste Datei
    die eigene mit dem neuesten Änderungsdatum. → { datei: { name, file, text } | null, fremd: [Namen], eigene: [Namen] }.
    Keine eigene Datei → datei null – nie auf eine fremde ausweichen. */
const lkGespeichert = text => { try{ const t = Date.parse(JSON.parse(text).gespeichertAm); return isNaN(t) ? null : t; }catch(e){ return null; } };
async function labelkitWahl(dir, projektName){
  const r = { datei: null, fremd: [], eigene: [] };
  if (!auflistbar(dir)) return r;
  const nr = projektNr(projektName), k = lkNr(nr) || nr, fest = k ? nfc(k + '_Daten.json').toLowerCase() : null, alle = [];
  for await (const h of dir.values()){
    if (h.kind !== 'file' || !LK_DATEI.test(nfc(h.name))) continue;
    if (!labelkitEigen(h.name, nr)){ r.fremd.push(h.name); continue; }   // fremde Datei: nicht einmal lesen
    const file = await (await dir.getFileHandle(h.name)).getFile();
    alle.push({ name: h.name, file, text: await file.text(), fest: fest !== null && nfc(h.name).toLowerCase() === fest });
    r.eigene.push(h.name);
  }
  r.fremd.sort((a, b) => a.localeCompare(b));
  const f = alle.find(e => e.fest);
  if (f){
    let beste = lkGespeichert(f.text); if (beste === null) beste = f.file.lastModified;
    r.datei = f;
    for (const e of alle){ const t = e.fest ? null : lkGespeichert(e.text); if (t !== null && t > beste){ beste = t; r.datei = e; } }
  } else for (const e of alle) if (!r.datei || e.file.lastModified > r.datei.file.lastModified) r.datei = e;
  if (r.datei) r.datei = { name: r.datei.name, file: r.datei.file, text: r.datei.text };
  return r;
}
const BEREICHE = Object.freeze({
  projekt:            Object.freeze({ app: 'Projektzentrale, FotoKit', alt: [], neu: [], passt: oder(datei('_Projekt.json'), ordner('_Projekt_Sicherungen')), haupt: datei('_Projekt.json') }),
  fotokit:            Object.freeze({ app: 'FotoKit', alt: ['Fotos'], neu: ['FotoKit'], passt: oder(datei('_Bildumbenenner.json'), ordner('_FotoKit_Fassungen')), haupt: datei('_Bildumbenenner.json') }),
  fotokitPruefsummen: Object.freeze({ app: 'FotoKit', alt: ['Fotos'], neu: ['FotoKit', 'Pruefsummen'], passt: muster(/^Pruefsummen_Originale_.*\.sha256$/i) }),
  // haupt: nur die LabelKit-Datei dieses Projekts (Audit o7) – eine fremde „…_Daten.json“ in „_Spektron/LabelKit“ schaltet den Bereich nicht um.
  // fremd: was passt, aber nicht haupt ist, gehört zu einem anderen Projekt (für die Zeile). passt bleibt: der Umzug nimmt weiter jede mit.
  labelkit:           Object.freeze({ app: 'LabelKit', alt: ['Laboraufträge'], neu: ['LabelKit'], passt: muster(/_Daten\.json$/i), haupt: lkHaupt, fremd: true }),
  labelkitAblage:     Object.freeze({ app: 'LabelKit', alt: ['Feldprotokolle'], neu: ['LabelKit'], passt: datei('_Ablage-Protokoll.txt') }),
  resultkit:          Object.freeze({ app: 'ResultKit', alt: ['Laborergebnisse'], neu: ['ResultKit'], passt: datei('_Ergebnisse.json', '_Ergebnisse.vorher.json'), haupt: datei('_Ergebnisse.json') }),
  plankit:            Object.freeze({ app: 'PlanKit', alt: ['Pläne'], neu: ['PlanKit'], passt: muster(/\.probenplan$/i), haupt: planHaupt }),
  // nur die Dateien, die BelegKit selbst schreibt (dieselben Muster wie BelegKits Leser): Zeiten je Person, Berichtsangaben, Stände – andere JSON bleiben
  belegkit:           Object.freeze({ app: 'BelegKit', alt: ['Abrechnung'], neu: ['BelegKit'], passt: oder(muster(/^Aufwand_[A-Za-zÄÖÜäöü]{1,6}\.json$/), datei('_Abrechnung.json'), muster(/^.+_Aufwand_\d{4}-\d{2}-\d{2}(?:_\d+)?\.json$/i), ordner('_BelegKit_Sicherungen')),
    haupt: oder(muster(/^Aufwand_[A-Za-zÄÖÜäöü]{1,6}\.json$/), datei('_Abrechnung.json'), muster(/^.+_Aufwand_\d{4}-\d{2}-\d{2}(?:_\d+)?\.json$/i)) }),
  buero:              Object.freeze({ app: 'BüroKit, Projektzentrale', alt: ['_Buero'], neu: ['Buero'], passt: name => !BEIWERK.test(nfc(name)) }),
  anlagenProtokoll:   Object.freeze({ app: 'Projektzentrale, PlanKit', alt: ['Mitteilungen'], neu: ['Protokolle'], passt: datei('_Anlagen-Protokoll.txt') }),
  berichtkit:         Object.freeze({ app: 'BerichtKit', alt: ['Mitteilungen'], neu: ['BerichtKit'], passt: datei('_BerichtKit.json') })
});

/** Projektnummer → Zahl zum Vergleichen (26.0560 → 26000560), sonst null. Gleiche Regel wie SPEKTRON-ORDNERNAME. */
function projektKey(name){
  const m = /^(\d{2})\.(\d{2,6})(?:[\s_-]|$)/.exec(nfc(name).trim());
  return m ? (+m[1]) * 1e6 + (+m[2]) : null;
}
const AB_KEY = projektKey(AB);

/* Ein Ordner, der sich nicht auflisten lässt (nur Testobjekte – echte Ordner können das immer), gilt als leer;
   ein solcher Projektordner bleibt immer beim bisherigen Ort. */
const auflistbar = dir => !!dir && typeof dir.values === 'function';
async function kind(dir, name){
  if (!auflistbar(dir)) return null;
  for await (const h of dir.values()) if (gleich(h.name, name)) return h;
  return null;
}
/** Unterordner entlang eines Pfads: zuerst direkt mit dem Namen (wie findSubdir in den Apps), sonst gesucht –
    ohne Groß-/Kleinschreibung und Unicode-Form verglichen. */
async function unter(dir, pfad, anlegen){
  let d = dir;
  for (const teil of pfad){
    let direkt = null;
    try{ direkt = await d.getDirectoryHandle(teil); }catch(e){ /* fehlt, andere Schreibweise oder Datei gleichen Namens */ }
    if (direkt){ d = direkt; continue; }
    const h = await kind(d, teil);
    if (h && h.kind === 'directory'){ d = await d.getDirectoryHandle(h.name); continue; }
    if (h || !anlegen) return null;        // Datei gleichen Namens oder nicht anlegen
    d = await d.getDirectoryHandle(teil, { create: true });
  }
  return d;
}
async function passende(dir, b){
  const r = [];
  if (auflistbar(dir)) for await (const h of dir.values()) if (b.passt(h.name, h.kind)) r.push({ name: h.name, art: h.kind });
  return r;
}
/** Liegt am Ort die Hauptdatei des Bereichs? Leere Dateien (0 Byte), leere Ordner (auch verschachtelt) und Windows-Beiwerk
    zählen nicht – so bleibt ein abgebrochenes Kopieren zurück, und das ist kein Ersatz für die Dateien am früheren Ort. */
// Nicht lesbar (z. B. SMB kurz weg) zählt als vorhanden – nie als „leer“, sonst schaltete ein Lesefehler auf den früheren Ort zurück (Codex)
async function dateiMitInhalt(fh){ try{ return (await fh.getFile()).size > 0; }catch(e){ return true; } }
async function ordnerMitInhalt(d, tiefe){
  if (!auflistbar(d) || tiefe > 8) return false;
  for await (const y of d.values()){
    if (BEIWERK.test(nfc(y.name))) continue;
    try{
      if (y.kind === 'directory'){ if (await ordnerMitInhalt(await d.getDirectoryHandle(y.name), tiefe + 1)) return true; }
      else if (await dateiMitInhalt(await d.getFileHandle(y.name))) return true;
    }catch(e){ return true; }   // nicht lesbar = vorhanden
  }
  return false;
}
async function hauptDa(dir, b, k){
  if (!auflistbar(dir)) return false;
  const h = b.haupt ? (n, a) => b.haupt(n, a, k) : b.passt;
  for await (const x of dir.values()){
    if (BEIWERK.test(nfc(x.name)) || !h(x.name, x.kind)) continue;
    try{
      if (x.kind === 'directory'){ if (await ordnerMitInhalt(await dir.getDirectoryHandle(x.name), 1)) return true; }
      else if (await dateiMitInhalt(await dir.getFileHandle(x.name))) return true;
    }catch(e){ return true; }   // nicht lesbar = vorhanden
  }
  return false;
}
async function hatSpektron(projektDir){
  const h = await kind(projektDir, ORDNER);
  return h && h.kind === 'directory' ? await projektDir.getDirectoryHandle(h.name) : null;
}
async function umzugVermerk(sp){
  if (!sp) return null;
  try{
    const h = await kind(sp, MARKER);
    if (!h || h.kind !== 'file') return null;
    const o = JSON.parse(await (await (await sp.getFileHandle(h.name)).getFile()).text());
    return o && o.format === 'spektron-umzug' && typeof o.version === 'number' && o.version >= 1 && o.bereiche && typeof o.bereiche === 'object' ? o : null;   // auch neuere Fassungen zählen als Vermerk
  }catch(e){ return null; }          // unlesbar = kein Vermerk; dann gilt der frühere Ort, solange dort etwas liegt
}
async function hinweisSchreiben(sp){
  if (await kind(sp, HINWEIS_DATEI)) return;
  const w = await (await sp.getFileHandle(HINWEIS_DATEI, { create: true })).createWritable();
  try{ await w.write(HINWEIS_TEXT); await w.close(); }catch(e){ try{ await w.abort(); }catch(_){} throw e; }
}
/** „_Spektron“ holen; mit anlegen auch erstellen (einmalig mit Hinweisdatei). */
async function spektronDir(projektDir, anlegen){
  let sp = await hatSpektron(projektDir);
  if (!sp && anlegen){
    if (await kind(projektDir, ORDNER)) throw Error('Im Projektordner liegt eine Datei „' + ORDNER + '“ – bitte umbenennen.');
    sp = await projektDir.getDirectoryHandle(ORDNER, { create: true });
  }
  if (sp && anlegen) await hinweisSchreiben(sp);
  return sp;
}

/** Spektron-Projekt: Nummer ab 26.0560 oder „_Spektron“-Ordner vorhanden. */
async function istSpektronProjekt(projektDir){
  const k = projektKey(projektDir.name);
  if (k != null && k >= AB_KEY) return true;
  return !!(await hatSpektron(projektDir));
}

/** Wo liegt der Bereich? → { dir, wo:'neu'|'alt', pfad, konflikt, umgezogen, unterbrochen, bereich }.
    dir ist null, wenn der Ordner fehlt und anlegen nicht gesetzt ist. Mit anlegen am neuen Ort wird auch die Hinweisdatei
    ergänzt, falls sie fehlt. konflikt = an beiden Orten liegen passende Einträge; es gilt dann der neue Ort. Mit umgezogen
    (Umzug vermerkt) sind das Nachzügler am früheren Ort – z. B. von einer noch offenen alten App-Version; ohne Vermerk eine
    dorthin kopierte oder gespeicherte Datei. unterbrochen = Umzug des Bereichs begonnen, aber nicht vermerkt: dann gilt
    noch der frühere Ort (die Kopien in „_Spektron“ können unvollständig sein). Gelöscht wird hier nie etwas. */
async function ort(projektDir, bereich, optionen){
  const b = BEREICHE[bereich];
  if (!b) throw Error('Unbekannter Spektron-Bereich: ' + bereich);
  const anlegen = !!(optionen && optionen.anlegen);
  const altPfad = b.alt, neuPfad = [ORDNER].concat(b.neu);
  const fertig = async (wo, dir, konflikt, umgezogen, unterbrochen) => {
    if (anlegen && wo === 'neu'){ const sp = await spektronDir(projektDir, true); if (!dir) dir = await unter(sp, b.neu, true); }
    else if (anlegen && !dir) dir = await unter(projektDir, altPfad, true);
    return { dir: dir || null, wo, pfad: (wo === 'neu' ? neuPfad : altPfad).join('/'), konflikt: !!konflikt, umgezogen: !!umgezogen, unterbrochen: !!unterbrochen, bereich };
  };
  const altDir = await unter(projektDir, altPfad, false);
  if (!auflistbar(projektDir) || !(await istSpektronProjekt(projektDir))) return fertig('alt', altDir, false, false, false);
  const sp = await hatSpektron(projektDir);
  const neuDir = sp ? await unter(sp, b.neu, false) : null;
  const altHat = (await passende(altDir, b)).length > 0;
  const neuHat = (await passende(neuDir, b)).length > 0;
  const konflikt = altHat && neuHat;
  const v = (await umzugVermerk(sp)) || { bereiche: {} };
  const umgezogen = !!v.bereiche[bereich];
  const unterbrochen = !umgezogen && !!(v.laeuft && typeof v.laeuft === 'object' && v.laeuft[bereich]);
  const k = { nr: projektNr(projektDir.name) };
  // Codex (11.11.2026): Umzug vermerkt, in „_Spektron/LabelKit“ aber nur Dateien anderer Projekte und die Datei dieses Projekts am
  // früheren Ort (z. B. von einer älteren App-Fassung) → der frühere Ort gilt. Nur für LabelKit (fremd); alle anderen Bereiche wie bisher.
  const nurFremdNeu = umgezogen && altHat && !!b.fremd && !(await hauptDa(neuDir, b, k)) && await hauptDa(altDir, b, k);
  if (neuHat && (!altHat || umgezogen) && !nurFremdNeu) return fertig('neu', neuDir, konflikt, umgezogen, false);
  if (altHat && !unterbrochen && !nurFremdNeu && await hauptDa(neuDir, b, k)) return fertig('neu', neuDir, konflikt, umgezogen, false);   // K1
  if (altHat) return fertig('alt', altDir, konflikt, umgezogen, unterbrochen);
  return (sp || UMSTELLUNG) ? fertig('neu', neuDir, false, umgezogen, false) : fertig('alt', altDir, false, umgezogen, false);
}

/* ---------- Die eine sichtbare Zeile bei Dateien an zwei Orten (für alle Apps gleich) ---------- */
const zwei = n => String(n).padStart(2, '0');
function datumText(ms){
  if (!ms) return '';
  const d = new Date(ms);
  return zwei(d.getDate()) + '.' + zwei(d.getMonth() + 1) + '.' + d.getFullYear() + ', ' + zwei(d.getHours()) + ':' + zwei(d.getMinutes());
}
async function eintraegeMitDatum(dir, b, k){
  const r = [];
  if (!auflistbar(dir)) return r;
  for await (const h of dir.values()){
    if (!b.passt(h.name, h.kind)) continue;
    let zeit = 0;
    if (h.kind === 'file'){ try{ zeit = (await (await dir.getFileHandle(h.name)).getFile()).lastModified || 0; }catch(e){} }
    r.push({ name: h.name, ordner: h.kind === 'directory', zeit, haupt: !b.haupt || b.haupt(h.name, h.kind, k) });
  }
  // Hauptdateien zuerst (die Datei, mit der die App arbeitet – nicht eine Sicherung), dann Dateien vor Ordnern, neueste zuerst
  return r.sort((a, c) => (c.haupt - a.haupt) || (a.ordner - c.ordner) || (c.zeit - a.zeit) || a.name.localeCompare(c.name));
}
/** Bereiche mit Dateien an beiden Orten (nur lesen). bereiche: Liste der Bereich-IDs, die die App nutzt (Standard: alle).
    → [{ bereich, app, wo, umgezogen, unterbrochen, neuPfad, altPfad, neu:[{name,ordner,zeit}], alt:[…], altNeuer }] */
async function zweiOrte(projektDir, bereiche){
  const aus = [];
  if (!projektDir || !auflistbar(projektDir) || !(await istSpektronProjekt(projektDir))) return aus;
  const sp = await hatSpektron(projektDir);
  for (const id of (bereiche || Object.keys(BEREICHE))){
    const b = BEREICHE[id]; if (!b) continue;
    const o = await ort(projektDir, id);
    if (!o.konflikt) continue;
    const k = { nr: projektNr(projektDir.name) };
    const neu = await eintraegeMitDatum(sp ? await unter(sp, b.neu, false) : null, b, k);
    const alt = await eintraegeMitDatum(await unter(projektDir, b.alt, false), b, k);
    // „neuer“ nur nach den Hauptdateien beurteilen (eine neuere Sicherung sagt nichts über die Datei, die die App liest)
    const max = l => { const h = l.filter(e => e.haupt && !e.ordner); return (h.length ? h : l).reduce((m, e) => Math.max(m, e.zeit || 0), 0); };
    aus.push({ bereich: id, app: b.app, wo: o.wo, umgezogen: o.umgezogen, unterbrochen: o.unterbrochen,
      neuPfad: [ORDNER].concat(b.neu).join('/'), altPfad: b.alt.join('/'), neu, alt, altNeuer: max(alt) > max(neu),
      nurFremd: !!b.fremd && neu.length > 0 && !neu.some(e => e.haupt) });   // in „_Spektron“ nur Dateien anderer Projekte
  }
  return aus;
}
/* Je Seite eine Datei nennen (die mit gleichem Namen wie auf der anderen Seite, sonst die neueste), Rest als „und n weitere“. */
function dateienText(pfad, liste, bevorzugt){
  const pf = n => '„' + (pfad ? pfad + '/' : '') + n + '“';
  const haupt = (bevorzugt && liste.find(e => gleich(e.name, bevorzugt))) || liste[0];
  if (!haupt) return '';
  const t = haupt.ordner ? pf(haupt.name + '/') : pf(haupt.name) + (haupt.zeit ? ' (' + datumText(haupt.zeit) + ')' : '');
  return liste.length > 1 ? t + ' und ' + (liste.length - 1) + ' weitere' : t;
}
/** Eine Zeile Klartext zu einem Eintrag aus zweiOrte() – „du“, ohne Fachwörter. optionen.projektzentrale: ohne den
    Verweis auf die Projektzentrale (dort steht das Weitere direkt darunter). */
function zweiOrteText(e, optionen){
  const pz = !(optionen && optionen.projektzentrale);
  const altOrt = e.altPfad ? 'in „' + e.altPfad + '“' : 'im Projektordner';
  const a = e.alt[0] ? e.alt[0].name : '', altText = dateienText(e.altPfad, e.alt), neuText = dateienText(e.neuPfad, e.neu, a);
  if (e.wo === 'alt' && !e.unterbrochen && e.nurFremd){   // Audit o7: fremde Datei in „_Spektron“, die eigene am früheren Ort
    const n = e.neu.filter(x => !x.ordner).map(x => x.name), fremd = '„' + n[0] + '“' + (n.length > 1 ? ' und ' + (n.length - 1) + ' weitere' : '');
    return '⚠ ' + e.app + ': Dateien an zwei Orten. Es gilt ' + altText + '. In „' + e.neuPfad + '“ ' + (n.length > 1 ? 'liegen' : 'liegt') + ' nur ' + fremd +
      ' – nach dem Namen nicht von diesem Projekt; keine App liest sie.' + (pz ? ' Gelöscht wird nichts – in der Projektzentrale steht, was zu tun ist.' : '');
  }
  if (e.wo === 'alt' && e.unterbrochen) return '⚠ ' + e.app + ': Dateien an zwei Orten – der Umzug in „' + ORDNER + '“ wurde unterbrochen. Es gilt noch ' +
    altText + '. Nicht verwendet: ' + neuText + '.' + (pz ? ' Bitte in der Projektzentrale „Umzug erneut ausführen“.' : '');
  if (e.wo === 'alt') return '⚠ ' + e.app + ': Dateien an zwei Orten. Es gilt noch ' + altText + ' – in „' + ORDNER + '“ liegt nur ' +
    'eine Sicherung, eine leere Datei oder ein leerer Ordner, nicht die Datei selbst (vermutlich ein unvollständiger Umzug). Nicht verwendet: ' + neuText + '.' +
    (pz ? ' Bitte in der Projektzentrale „Umzug erneut ausführen“.' : '');
  return '⚠ ' + e.app + ': Dateien an zwei Orten. Es gilt ' + neuText + '. Nicht verwendet: ' + altText + '.' +
    (e.altNeuer ? ' Die Datei ' + altOrt + ' ist neuer – vielleicht hat eine ältere App-Fassung dort gespeichert. Schließ alle Spektron-Tabs auf allen PCs und öffne sie neu.' : '') +
    (pz ? ' Gelöscht wird nichts – in der Projektzentrale steht, was mit der Datei ' + altOrt + ' zu tun ist.' : '');
}

/** Für den Umzug (nur lesen): je Bereich, was am früheren Ort liegt und wohin es gehört. Leer für Projekte „Vor Spektron“. */
async function umzugListe(projektDir){
  if (!(await istSpektronProjekt(projektDir))) return [];
  const liste = [];
  for (const id of Object.keys(BEREICHE)){
    const b = BEREICHE[id];
    const eintraege = await passende(await unter(projektDir, b.alt, false), b);
    if (eintraege.length) liste.push({ bereich: id, app: b.app, von: b.alt.join('/'), nach: [ORDNER].concat(b.neu).join('/'), eintraege });
  }
  return liste;
}

const api = Object.freeze({ VERSION, ORDNER, AB, UMSTELLUNG, MARKER, HINWEIS_DATEI, HINWEIS_TEXT, BEREICHE,
  projektKey, projektNr, planHaupt, labelkitEigen, labelkitWahl, istSpektronProjekt, ort, umzugListe, spektronDir, unter, hauptDa, zweiOrte, zweiOrteText, datumText });
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.SpektronOrdner = api;
})(typeof window !== 'undefined' ? window : globalThis);
/* SPEKTRON-ORDNER-ENDE */
