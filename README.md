# BelegKit

*Früher „AufwandKit“. Nur der Anzeigename hat sich geändert: Repository, Webadresse (`…/aufwandkit/`), Dateinamen (`Aufwand_<Kürzel>.json`, `_AufwandKit-Einstellungen.json`) und gespeicherte Einstellungen behalten den alten Namen – bestehende Projekte, Lesezeichen und installierte Apps funktionieren weiter.*

Erfasst je Projekt, was in die Rechnung gehört – mit den Positionsnummern der Rechnung, zum Übertragen ins Rechnungsprogramm. Die Rechnung selbst (Nummer, Umsatzsteuer, Archiv) bleibt im Rechnungsprogramm.

Teil der App-Familie: **Projektzentrale** (Absprung „Abrechnung → BelegKit“), **LabelKit**, **FotoKit**, **PlanKit**. Alles läuft im Browser (Chrome oder Edge) direkt auf dem Projektordner; nichts wird hochgeladen.

## Was gezählt wird

| Rechnung | Woher |
|---|---|
| Titel 1 – Stunden Sachverständiger / Probenehmer, km, Tagesspesen, Übernachtungen | „Meine Zeiten“: jede Person trägt ihre Ortstermine selbst ein (Fahrzeit gehört zum Ortstermin, km nur der Fahrer, Übernachtung mit Betrag lt. Beleg). Die Termine werden an den Titeltext angehängt („am 28.07. und 21.08.2026“). |
| Titel 2 – Analysen | Neueste LabelKit-Projektdatei `Laboraufträge/…_Daten.json`: jede Probe einer Liste ist eine Analyse – PAK (Wischprobe / Material), Chlorid (Wischprobe / Material, Löschpulverparameter eigens), Asbest, sonstige Proben je Untersuchungsparameter (DepV-Mischprobe eigens), Brandgeruch. Welche Probenart zu welcher Position gehört, wird einmal unter „Proben“ zugeordnet und gilt für alle Projekte. |
| Titel 3 – Stunden Auswertung / Bericht | „Meine Zeiten“, Tätigkeit „Auswertung / Bericht“. |
| 3.002 Schreib-, Versand- und Nebenkosten, Fotos | Seiten der abzurechnenden Berichte in `Mitteilungen` (aus der PDF-Fassung gezählt oder von Hand bestätigt – die Angabe in der Word-Datei ist oft veraltet) und Fotos in `Fotos` ohne die in FotoKit aussortierten. Mit den Sätzen € je Seite / € je Foto / fester Anteil ergibt sich der Pauschalbetrag. |

Hinweise statt stiller Annahmen: nicht zugeordnete Probenarten, km von zwei Personen am selben Tag (Fahrgemeinschaft?), Ortstermin ohne Stunden, keine Zahl, Bericht ohne bestätigte Seitenzahl, Position ohne Nummer, fehlende Sätze.

## Dateien

| Datei | Inhalt |
|---|---|
| `<Projekt>/Abrechnung/Aufwand_<Kürzel>.json` | Zeiten einer Person. Jede Person schreibt nur ihre eigene Datei – gleichzeitiges Arbeiten überschreibt nichts. |
| `<Projekt>/Abrechnung/_Abrechnung.json` | Welche Berichte abgerechnet werden und ihre Seitenzahl (frisch lesen → ändern → schreiben). |
| `<Projekt>/Abrechnung/<Nr>_Aufwand_<Datum>.json` / `.csv` | „Stand speichern“: Positionen, Hinweise und SHA-256 jeder Quelle; nie überschreibend. CSV für Excel. |
| `<Archivordner>/_AufwandKit-Einstellungen.json` | Positionen (Nummer, Text, Einheit, Preis für die Vorschau), Zuordnung der Probenarten, Personen, Sätze für 3.002 – gilt für alle Projekte. Vorbelegt nach Rechnung 202600542. |

Gelesen (nie geschrieben): `Laboraufträge/…_Daten.json` (LabelKit), `Fotos/_Bildumbenenner.json` (FotoKit), Berichte in `Mitteilungen`.

## Neue Version veröffentlichen

`APP_VERSION`, `APP_DATE` und `CHANGELOG` in `index.html` anpassen. GitHub Pages veröffentlicht den Stand von `main`.

## Tests

```
node tests/logik.cjs
NODE_PATH=… node tests/browser.cjs chromium   # braucht Playwright (nicht im Repository)
NODE_PATH=… node tests/leiste-browser.cjs chromium   # Leiste mit Projekt, Arbeitsschritten und „Weiter“
```

`tests/logik.cjs` rechnet unter anderem die Beispielrechnung 202600542 nach (Titel 1: 8.166,83 €, Titel 2: 6.570,00 €, netto 15.988,23 €). Der Browsertest bildet einen Projektordner im Origin Private File System nach (LabelKit-Datei, Fotos, Bericht als Word mit veralteter Seitenzahl und als PDF) und prüft Erfassung, Zuordnung, Seitenzahl, Abrechnung, Kopieren und „Stand speichern“; mit `SHOTS=<Ordner>` entstehen Bildschirmfotos. Beide laufen bei jedem Pull Request auf GitHub (Chromium und WebKit).
