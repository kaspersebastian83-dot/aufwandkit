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

   Welche Projekte: Projektnummer ab 26.0560 – oder ein „_Spektron“-Ordner ist schon da (von Hand übernommenes Projekt).
   Projekte „Vor Spektron“ bekommen nie einen „_Spektron“-Ordner; dort gilt immer der frühere Ort.

   ort(projektordner, bereich) sagt, wo ein Bereich gerade liegt. Alle Apps lesen UND schreiben dort:
     1. Neuer Ort hat passende Einträge (und der alte nicht, oder der Umzug ist vermerkt) → neu.
     2. Früherer Ort hat passende Einträge → alt (auch, wenn beide etwas haben und kein Umzug vermerkt ist: „konflikt“).
     3. Nichts da → neu, wenn „_Spektron“ schon existiert oder UMSTELLUNG an ist; sonst alt.
   Damit laufen alte und neue App-Versionen nebeneinander, ohne dass Daten an zwei Orten auseinanderlaufen.
   Der Umzug selbst (kopieren, prüfen, vermerken, löschen) gehört in die Projektzentrale; hier nur lesen und planen.
   Läuft im Browser (globalThis.SpektronOrdner) und in Node (module.exports, für Tests). Keine Abhängigkeiten. */
(function(root){
'use strict';

const VERSION = 1;
const ORDNER = '_Spektron';
const AB = '26.0560';                 // erstes Spektron-Projekt
const UMSTELLUNG = true;              // seit dem Umzug (28.10.2026): neue Projekte landen gleich in _Spektron
const MARKER = '_Umzug.json';         // <Projekt>/_Spektron/_Umzug.json: { format:'spektron-umzug', version:1, bereiche:{ <id>:{ am, ... } } }
const HINWEIS_DATEI = 'BITTE NICHT ANFASSEN.txt';
const HINWEIS_TEXT = [
  'Spektron – Daten der Apps zu diesem Projekt',
  '',
  'In diesem Ordner speichern die Spektron-Apps (Projektzentrale, LabelKit, FotoKit, ResultKit, PlanKit, BelegKit, BüroKit)',
  'ihre Arbeitsdaten: Projektdaten, Probenerfassung, Bildangaben, Laborwerte, Plan, Zeiten und Büroaufgaben.',
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

/* Bereiche: alt = Pfad ab Projektordner, neu = Pfad ab _Spektron, passt(name, art) = gehört der Eintrag dazu. */
const BEREICHE = Object.freeze({
  projekt:            Object.freeze({ app: 'Projektzentrale, FotoKit', alt: [], neu: [], passt: oder(datei('_Projekt.json'), ordner('_Projekt_Sicherungen')) }),
  fotokit:            Object.freeze({ app: 'FotoKit', alt: ['Fotos'], neu: ['FotoKit'], passt: oder(datei('_Bildumbenenner.json'), ordner('_FotoKit_Fassungen')) }),
  fotokitPruefsummen: Object.freeze({ app: 'FotoKit', alt: ['Fotos'], neu: ['FotoKit', 'Pruefsummen'], passt: muster(/^Pruefsummen_Originale_.*\.sha256$/i) }),
  labelkit:           Object.freeze({ app: 'LabelKit', alt: ['Laboraufträge'], neu: ['LabelKit'], passt: muster(/_Daten\.json$/i) }),
  labelkitAblage:     Object.freeze({ app: 'LabelKit', alt: ['Feldprotokolle'], neu: ['LabelKit'], passt: datei('_Ablage-Protokoll.txt') }),
  resultkit:          Object.freeze({ app: 'ResultKit', alt: ['Laborergebnisse'], neu: ['ResultKit'], passt: datei('_Ergebnisse.json', '_Ergebnisse.vorher.json') }),
  plankit:            Object.freeze({ app: 'PlanKit', alt: ['Pläne'], neu: ['PlanKit'], passt: muster(/\.probenplan$/i) }),
  // nur die Dateien, die BelegKit selbst schreibt: Zeiten je Person, Berichtsangaben, gespeicherte Stände (JSON) – andere JSON bleiben
  belegkit:           Object.freeze({ app: 'BelegKit', alt: ['Abrechnung'], neu: ['BelegKit'], passt: oder(muster(/^Aufwand_[^\\/]+\.json$/i), datei('_Abrechnung.json'), muster(/^.+_Aufwand_\d{4}-\d{2}-\d{2}(?:_\d+)?\.json$/i), ordner('_BelegKit_Sicherungen')) }),
  buero:              Object.freeze({ app: 'BüroKit, Projektzentrale', alt: ['_Buero'], neu: ['Buero'], passt: () => true }),
  anlagenProtokoll:   Object.freeze({ app: 'Projektzentrale, PlanKit', alt: ['Mitteilungen'], neu: ['Protokolle'], passt: datei('_Anlagen-Protokoll.txt') })
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

/** Wo liegt der Bereich? → { dir, wo:'neu'|'alt', pfad, konflikt, umgezogen, bereich }.
    dir ist null, wenn der Ordner fehlt und anlegen nicht gesetzt ist. Mit anlegen am neuen Ort wird auch die Hinweisdatei
    ergänzt, falls sie fehlt. konflikt = an beiden Orten liegen passende Einträge; mit umgezogen (Umzug vermerkt) sind das
    Nachzügler am früheren Ort – z. B. von einer noch offenen alten App-Version. Die übernimmt der Umzug der Projektzentrale
    bei erneutem Ausführen; die App arbeitet weiter am neuen Ort. */
async function ort(projektDir, bereich, optionen){
  const b = BEREICHE[bereich];
  if (!b) throw Error('Unbekannter Spektron-Bereich: ' + bereich);
  const anlegen = !!(optionen && optionen.anlegen);
  const altPfad = b.alt, neuPfad = [ORDNER].concat(b.neu);
  const fertig = async (wo, dir, konflikt, umgezogen) => {
    if (anlegen && wo === 'neu'){ const sp = await spektronDir(projektDir, true); if (!dir) dir = await unter(sp, b.neu, true); }
    else if (anlegen && !dir) dir = await unter(projektDir, altPfad, true);
    return { dir: dir || null, wo, pfad: (wo === 'neu' ? neuPfad : altPfad).join('/'), konflikt: !!konflikt, umgezogen: !!umgezogen, bereich };
  };
  const altDir = await unter(projektDir, altPfad, false);
  if (!auflistbar(projektDir) || !(await istSpektronProjekt(projektDir))) return fertig('alt', altDir, false, false);
  const sp = await hatSpektron(projektDir);
  const neuDir = sp ? await unter(sp, b.neu, false) : null;
  const altHat = (await passende(altDir, b)).length > 0;
  const neuHat = (await passende(neuDir, b)).length > 0;
  const konflikt = altHat && neuHat;
  const umgezogen = !!(((await umzugVermerk(sp)) || { bereiche: {} }).bereiche[bereich]);
  if (neuHat && (!altHat || umgezogen)) return fertig('neu', neuDir, konflikt, umgezogen);
  if (altHat) return fertig('alt', altDir, konflikt, umgezogen);
  return (sp || UMSTELLUNG) ? fertig('neu', neuDir, false, umgezogen) : fertig('alt', altDir, false, umgezogen);
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
  projektKey, istSpektronProjekt, ort, umzugListe, spektronDir, unter });
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.SpektronOrdner = api;
})(typeof window !== 'undefined' ? window : globalThis);
/* SPEKTRON-ORDNER-ENDE */
