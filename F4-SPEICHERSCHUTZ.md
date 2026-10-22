# F4: Verlustschutz für persönliche Zeitdateien

Gilt für `Abrechnung/Aufwand_<Kürzel>.json`. Einstellungen, Preise,
`_Abrechnung.json`, Rechnungsermittlung und andere Anwendungen bleiben unverändert.
Dateiformat `aufwandkit-zeiten`, Version 1, bleibt erhalten. Das ursprüngliche
Format aus AufwandKit 1.0.0 wurde anhand des ersten Repository-Commits geprüft;
ältere gültige Version-1-Dateien und fehlende optionale Aufwandsfelder bleiben lesbar.
Unbekannte Felder auf Dateiebene und in Einträgen werden mitgeführt. Unbekannte
Dateiformate und neue inkompatible Versionen werden nicht automatisch ersetzt.

## Speichern

Beim Laden werden vollständige Dateibytes mit SHA-256 identifiziert und Format,
Version, Projekt, Mitarbeiterkürzel, eindeutige Eintrags-IDs und Eintragsstruktur
geprüft. Fehlerhafte fremde Mitarbeiterdateien werden nicht in die Abrechnung
übernommen und als fehlende Quelle gemeldet. Mehrere Dateinamen für dasselbe
Kürzel blockieren die eigene Speicherung. Neue Zeilen erhalten UUIDs, damit
unabhängige Sitzungen keine zeitstempelgleichen IDs erzeugen.

Der eigene Schreibversuch wird vor dem ersten Dateizugriff eingefroren. Später
eingegebene Werte bleiben im Formular und gelten nicht vorzeitig als gespeichert.
Vor jeder Hauptspeicherung wird erneut gelesen und mit der geladenen bzw. zuletzt
bestätigten vollständigen Inhaltsrevision verglichen. Eine zwischenzeitlich
geänderte oder verschwundene Datei wird nicht automatisch ersetzt. Ein Lesefehler
ist keine fehlende Datei. Gleichzeitige Sitzungen unter verschiedenen Kürzeln
bleiben getrennt. Web Locks koordinieren kooperierende Tabs; der Verlustschutz
setzt keine profilübergreifende Sperre voraus.

Vor dem Ersetzen werden Ausgangsbytes und vollständiger neuer Kandidat unter
`Abrechnung/_Aufwand_Sicherungen/` gespeichert:

- `Aufwand_<Kürzel>_vorher_<UTC>_<UUID>.json`
- `Aufwand_<Kürzel>_kandidat_<UTC>_<UUID>.json`

Vorhandene Sicherungsnamen werden nicht wiederverwendet. Beide Kopien werden
erneut gelesen und bytegenau verglichen. Fehler blockieren das Ersetzen. Weitere
Inhaltsvergleiche erfolgen vor Öffnen des Hauptschreibstroms, unmittelbar vor
Schreiben und nach `close()`. Erst nach erfolgreicher Verifikation wird Erfolg
gemeldet und die bestätigte Revision fortgeschrieben.

**Keine automatische Bereinigung:** Auch bestätigte Kandidaten und Vorgänger
bleiben dauerhaft erhalten. Ein späterer unabhängiger Schreiber kann die
Hauptdatei überholen, aber die vollständige bestätigte Fassung bleibt auffindbar.
Der Sicherungsordner kann wachsen. Kapazitätsfehler blockieren die Speicherung;
keine möglicherweise einzigartige Fassung wird zur Platzgewinnung gelöscht.

Eine gescheiterte erste Speicherung kann einen leeren Hauptdateiplatzhalter
hinterlassen. Nur innerhalb derselben Sitzung darf ein als eigener und weiterhin
byteidentischer leerer Platzhalter erkannter Stand erneut beschrieben werden.
Seine Bytes werden vorher gesichert. Nach Neustart gilt er als beschädigte Datei:
keine blinde Wiederholung, sondern ausdrückliche Auswahl eines geprüften Kandidaten.

## Konflikte und Wiederherstellung

Fehler lassen eigene Eingaben geöffnet und blockieren Projekt-/Kürzelwechsel sowie
„Neu einlesen“, solange die Speicherung ungeklärt ist. „Erneut speichern“ nutzt
dieselben Prüfungen. „Zeitfassungen prüfen“ zeigt Hauptdatei, eigene offene Eingaben
und alle unterschiedlichen gültigen Sicherungen mit vollständiger JSON-Vorschau.
Die Dateiliste wird frisch aus dem Ordner gelesen, funktioniert nach Neustart und
hat keine Gesamtbegrenzung (20 Sicherungen je Seite). Identische Inhalte werden
nur in der Anzeige zusammengefasst. Beschädigte/inkompatible Sicherungen werden
gemeldet und erhalten. Sicherungsdatum allein beweist weder fachliche Priorität
noch eine erfolgreich bestätigte ursprüngliche Speicherung.

Erst eine ausdrückliche Auswahl übernimmt einen Dateistand oder ersetzt die
gesamte Hauptdatei. Eigene offene Eingaben werden davor als vollständiger Kandidat
verifiziert gesichert. Hauptrevision und ausgewählte Sicherung werden erneut
geprüft. Veraltete Auswahl blockiert die Übernahme. Die Wiederherstellung verwendet
das gleiche Sicherungsverfahren. Beschädigte ursprüngliche Bytes bleiben erhalten;
fremde Projekt-/Mitarbeiteridentitäten und neuere Formate bleiben gesperrt.

Eine zusätzliche ausdrückliche Zusammenführung ist nur für disjunkte oder exakt
gleiche Eintrags-IDs möglich. Abweichender Inhalt derselben ID wird abgewiesen.
Es gibt keine automatische fachliche Auflösung solcher Widersprüche. Der bereits
vorhandene Reparaturablauf bleibt erhalten: War eine Datei beim Laden nicht lesbar,
darf eine inzwischen reparierte gültige Originaldatei mit konfliktfreien neuen
Eingaben vereint werden. Auch dieser Ablauf prüft und sichert den vollständigen
Originalstand vor dem Schreiben und behält neuere Eingaben während des Schreibens.

## Tests und Aussagegrenzen

`node tests/f4.cjs` führt die tatsächlichen Lade-/Speicherfunktionen in voneinander
unabhängigen V8-Sitzungen über gemeinsame temporäre Dateien aus. A: veraltete
Sitzung blockiert, zusätzliche sieben Stunden und eigene Änderungen bleiben erhalten.
B: beide Sitzungen passieren den letzten Vergleich, A bestätigt Erfolg vor B;
beide vollständigen Fassungen bleiben nach Neustart und Wiederherstellung erhalten.
Auch der Fall zweier Erstanlagen wird über zusätzliche Erstellungsbarrieren
deterministisch erzwungen. C: beschädigtes JSON wird nicht überschrieben. D: Projekt,
Kürzel, Format/Version, Struktur, verschwundene/fehlende Datei, erste Speicherung,
Fehler, Neustart, ältere gültige Daten und verschiedene Kürzel sind abgedeckt.

`node tests/f4-browser.cjs chromium|webkit` bedient die echten Oberflächen mit
unabhängigen Browserkontexten und gemeinsamen synthetischen Dateihandles. Es prüft
den letzten Vergleich deterministisch, die sichtbaren Konflikte, eigene Eingaben,
ausdrückliche Auflösung, neue Sitzung/Wiederherstellung, beschädigte Quelldatei
und Wiederholung nach Schreibfehler. Die bestehenden Tests bleiben erhalten.

Die zusätzliche CI verwendet die vorhandene vollständige Spektron-Integration
aus Projektzentrale-main `4716c0b57284bdf3a0dcdb657bb99059bbf7da77`, mit diesem
F4-Head als temporär gepinnter BelegKit-Quelle. Andere Anwendungen werden nicht
geändert. Orientierung: PlanKit F2 `532132c3dac9a4a087c18197dec1d204809b57f2`,
Projektzentrale F3 `e7b8c4e3819a4ce54fe2dc2ac91bb731e040896f` und SpesenKit
`30d74d63707b632c520f84032f3379c8f1c8ce74`. Das BelegKit-Datenformat wird beibehalten;
keine fremde Implementierung oder Löschregel wird ungeprüft übernommen.

Die Regressionen verwenden synthetische Dateihandles, temporäre Dateien bzw.
Chromium-OPFS. Neue WebKit-Dateiszenarien verwenden eine Dateibrücke und belegen
keinen nativen Ordnerzugriff in WebKit. Die Browser-Dateischnittstelle bietet hier
keine profilübergreifende atomare Compare-and-Swap-/Transaktionsoperation und
keine zugesicherte physische `fsync`-/Stromausfallgarantie. Erneutes Lesen bestätigt
den sichtbaren Inhalt, nicht dessen dauerhafte physische Speicherung bei Stromausfall.
Windows-, SMB-/Netzwerkcache-, RDP-, echte Mehrbenutzerrechte- und Stromausfalltests
sind nicht praktisch nachgewiesen. Manuelle Löschung von Sicherungen und alte,
nicht aktualisierte Schreiber liegen außerhalb dieses Schutzes.
