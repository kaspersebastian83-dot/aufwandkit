# BelegKit

*Früher „AufwandKit“. Nur der Anzeigename hat sich geändert: Repository, Webadresse (`…/aufwandkit/`), Dateinamen (`Aufwand_<Kürzel>.json`, `_AufwandKit-Einstellungen.json`) und gespeicherte Einstellungen behalten den alten Namen – bestehende Projekte, Lesezeichen und installierte Apps funktionieren weiter.*

Erfasst je Projekt, was in die Rechnung gehört – mit den Positionsnummern der Rechnung, zum Übertragen ins Rechnungsprogramm. Die Rechnung selbst (Nummer, Umsatzsteuer, Archiv) bleibt im Rechnungsprogramm.

**App öffnen:** https://kaspersebastian83-dot.github.io/aufwandkit/ · aktuelle Version **1.8.2** · Schritt für Schritt im [Handbuch](https://kaspersebastian83-dot.github.io/aidkit/#app-belegkit) (Änderungen: Klick auf die Versionsnummer in der App)

Schritt ④ der Büro-App-Suite **Spektron**: **Projektzentrale** (Absprung „Zeiten & Abrechnung“), **LabelKit**, **FotoKit**, **PlanKit**, dazu ohne Projektbezug **SpesenKit** (monatliche Spesenabrechnung je Person). Übersicht im [README der Projektzentrale](https://github.com/kaspersebastian83-dot/Projektzentrale#readme). Alles läuft im Browser (Chrome oder Edge) direkt auf dem Projektordner; nichts wird hochgeladen.

- **Leiste oben (ab 1.3):** wie in LabelKit, FotoKit und PlanKit – Projekt mit Wechsel zu den zuletzt geöffneten, die vier Arbeitsschritte mit Haken und „Weiter: …“.
- **Projektdaten (ab 1.2):** Objekt, Auftraggeber und Schaden-Nr. aus `_Projekt.json` stehen oben auf jeder Seite und im gespeicherten Stand (nur Ansicht, geändert wird in der Projektzentrale).
- **Kürzel (ab 1.1.1):** wird mit LabelKit geteilt – einmal eintragen, gilt in beiden Apps.

## Neu in 1.4.1 · 20.10.2026

Projektzentrale und Spektron-Leiste übergeben Projekte jetzt über #projekt im Fragment. Sonderzeichen bleiben erhalten; alte ?projekt-Links funktionieren weiterhin und werden nach dem Laden bereinigt. Projektwechsel laden auch bereits geöffnete App-Fenster neu; eine Warnung vor ungesicherten Eingaben kann den Wechsel abbrechen.

## Was gezählt wird

| Rechnung | Woher |
|---|---|
| Titel 1 – Stunden Sachverständiger / Probenehmer, km, Tagesspesen, Übernachtungen | „Meine Zeiten“: jede Person trägt ihre Ortstermine selbst ein (Fahrzeit gehört zum Ortstermin, km nur der Fahrer, Übernachtung mit Betrag lt. Beleg). Die Termine werden an den Titeltext angehängt („am 28.07. und 21.08.2026“). |
| Titel 2 – Analysen | Neueste LabelKit-Projektdatei `Laboraufträge/…_Daten.json`: jede Probe einer Liste ist eine Analyse – PAK (Wischprobe / Material), Chlorid (Wischprobe / Material, Löschpulverparameter eigens), Asbest, sonstige Proben je Untersuchungsparameter – eine Probe mit „PCB, Schwermetalle“ zählt als je eine PCB- und Schwermetall-Analyse, ein Paket in einem Begriff (z. B. „MKW (KW-Index C10–C40 und C10–C22)“, „Schwermetalle (As, Pb, Cd)“) als eine (DepV-Mischprobe eigens), Brandgeruch. Welche Probenart zu welcher Position gehört, wird einmal unter „Proben“ zugeordnet und gilt für alle Projekte. |
| Titel 3 – Stunden Auswertung / Bericht | „Meine Zeiten“, Tätigkeit „Auswertung / Bericht“. |
| 3.002 Schreib-, Versand- und Nebenkosten, Fotos | Seiten der abzurechnenden Berichte in `Mitteilungen` (aus der PDF-Fassung gezählt oder von Hand bestätigt – die Angabe in der Word-Datei ist oft veraltet) und Fotos in `Fotos` ohne die in FotoKit aussortierten. Mit den Sätzen € je Seite / € je Foto / fester Anteil ergibt sich der Pauschalbetrag. |

Hinweise statt stiller Annahmen: Zahlen mit Tausenderpunkt („1.250“) oder ein Preis, der keine Zahl ist (ab 1.3.1), nicht zugeordnete Probenarten, km von zwei Personen am selben Tag (Fahrgemeinschaft?), Ortstermin ohne Stunden, keine Zahl, Bericht ohne bestätigte Seitenzahl, Position ohne Nummer, fehlende Sätze. Ebenso, wenn eine Quelle nicht gelesen werden kann (Zeiten-Datei eines Kollegen, LabelKit-, FotoKit-, Berichts- oder Einstellungsdatei), ein angekreuzter Bericht nicht mehr in `Mitteilungen` liegt oder Fotos in Unterordnern von `Fotos` liegen – nichts fällt still aus der Abrechnung.

**Route in Google Maps (ab 1.4):** 🗺 neben den km eines Ortstermins öffnet Google Maps in einem eigenen Fenster – Start (Standard: Büro Gouleystraße 59, Würselen; änderbar, wird im Browser gemerkt) → Objekt aus der Projektzentrale → zurück zum Start (oder nur Hinfahrt). Route dort bei Bedarf anpassen, km ablesen und übernehmen. Der Link zur Route wird am Eintrag in `Aufwand_<Kürzel>.json` gespeichert (`route`, dazu `routeStart`, `routeZiel`, `routeRund`); ein in Google Maps angepasster Weg kann über „Teilen → Link kopieren“ eingefügt werden. BelegKit selbst lädt nichts von Google – die Content Security Policy bleibt unverändert, die Adressen sieht nur Google Maps im eigenen Fenster.

Beträge (nur Vorschau): Menge × Preis kaufmännisch auf Cent gerundet, mit der Menge wie kopiert (zwei Nachkommastellen). Ein Betrag erscheint nur, wenn alles feststeht – fehlt ein Satz für vorhandene Seiten oder Fotos oder die Seitenzahl eines angekreuzten Berichts, bleibt 3.002 ohne Betrag (Satz „0“ = kostenlos).

## Dateien

| Datei | Inhalt |
|---|---|
| `<Projekt>/Abrechnung/Aufwand_<Kürzel>.json` | Zeiten einer Person. Vollständige Inhaltsrevision, Konfliktprüfung und dauerhaft verifizierte Sicherungskandidaten schützen bestätigte Fassungen bei parallelen Sitzungen. |
| `<Projekt>/Abrechnung/_Abrechnung.json` | Welche Berichte abgerechnet werden und ihre Seitenzahl (frisch lesen → ändern → schreiben). |
| `<Projekt>/Abrechnung/<Nr>_Aufwand_<Datum>.json` / `.csv` | „Stand speichern“: Positionen, Hinweise und SHA-256 jeder Quelle; nie überschreibend. CSV für Excel. |
| `<Archivordner>/_AufwandKit-Einstellungen.json` | Positionen (Nummer, Text, Einheit, Preis für die Vorschau), Zuordnung der Probenarten, Personen, Sätze für 3.002 – gilt für alle Projekte. Vorbelegt nach Rechnung 202600542. |

Sicherungen liegen unter `Abrechnung/_BelegKit_Sicherungen/`. „Zeitfassungen prüfen“ bietet eine vollständige Vorschau und ausdrückliche Wiederherstellung. Keine automatische Löschung oder Auflösung widersprüchlicher Einträge. Details und Testgrenzen: [F4-SPEICHERSCHUTZ.md](F4-SPEICHERSCHUTZ.md).

Gelesen (nie geschrieben): `Laboraufträge/…_Daten.json` (LabelKit), `Fotos/_Bildumbenenner.json` (FotoKit), Berichte in `Mitteilungen`.

## Neue Version veröffentlichen

`APP_VERSION`, `APP_DATE` und `CHANGELOG` in `index.html` anpassen. GitHub Pages veröffentlicht den Stand von `main`.

## Tests

```
node tests/logik.cjs
node tests/f4.cjs
NODE_PATH=… node tests/f4-browser.cjs chromium   # ebenfalls webkit; unabhängige Sitzungen, synthetische Dateibrücke
NODE_PATH=… node tests/browser.cjs chromium   # braucht Playwright (nicht im Repository)
NODE_PATH=… node tests/leiste-browser.cjs chromium   # Leiste mit Projekt, Arbeitsschritten und „Weiter“
```

GitHub führt die Tests bei jedem Pull Request aus (`.github/workflows/tests.yml`, Chromium). Es gibt nur diesen einen Test-Workflow; zusätzliche Kompatibilitäts- und Integrations-Workflows wurden am 23.10.2026 entfernt.

`tests/leiste-browser.cjs` prüft die gemeinsame Leiste (gleicher Test wie in LabelKit, FotoKit und PlanKit). `tests/logik.cjs` rechnet unter anderem die Beispielrechnung 202600542 nach (Titel 1: 8.166,83 €, Titel 2: 6.570,00 €, netto 15.988,23 €). Der Browsertest bildet einen Projektordner im Origin Private File System nach (LabelKit-Datei, Fotos, Bericht als Word mit veralteter Seitenzahl und als PDF) und prüft Erfassung, Zuordnung, Seitenzahl, Abrechnung, Kopieren und „Stand speichern“; mit `SHOTS=<Ordner>` entstehen Bildschirmfotos. Alle Tests laufen bei jedem Pull Request auf GitHub (Browsertests in Chromium und WebKit).
