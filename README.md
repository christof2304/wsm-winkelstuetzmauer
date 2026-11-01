# WSM – Winkelstützmauer

Browser-App zur Vorbemessung von Winkelstützmauern aus Stahlbeton nach DIN 1054 / DIN EN 1997-1 (BS-P), DIN 4085, DIN 4017 und DIN EN 1992-1-1, mit automatisch konstruierter 2D-Bewehrungsskizze und Stahlliste.

> **Vorbemessung, ersetzt keine prüffähige Statik.** Die Verantwortung für jede Berechnung liegt beim Anwender.

## Starten

Kein Build-Schritt – reine ES-Module, Preact und htm kommen per Importmap aus dem CDN.

```bash
python -m http.server 8765
```

- App: http://localhost:8765/
- Tests: http://localhost:8765/tests/

## Funktionen

- Live-Rechnung bei jeder Eingabe, Rechnen in Feldern (`2,4+0,3`), Undo/Redo, Befehlspalette (Strg+K)
- Äußere Standsicherheit: Kippen (EQU), klaffende Fuge, Gleiten, Grundbruch (DIN 4017) mit nachvollziehbarem Rechenweg
- EC2-Bemessung von Wand, Berg- und Talsporn: Biegung, Querkraft, Rissbreite, Mindestbewehrung Zwang
- Bewehrungsskizze mit Positionen 1–9, Staffelung und Stoß, Stahlliste; Export SVG / PNG / DXF / CSV
- Abmessungen optimieren, Parameterstudie, druckbarer Rechenbericht
- Hell-/Dunkelmodus, zuschaltbare Tooltips (F1)

## Aufbau

```
apps/wsm/        App: Modell, Geometrie, Nachweise, Bemessung, Bewehrung, Zeichnung, UI
packages/norm/   Normprofil DIN 1054 (Teilsicherheitsbeiwerte)
packages/soil/   Erddruck (DIN 4085), Grundbruch (DIN 4017)
packages/rc/     EC2-Querschnittsbemessung, Rissbreite, Verankerung, Stabwahl
packages/rebar-draw/  Zeichnungsklasse mit SVG- und DXF-Export
packages/ui/     Komponenten, Theme, Formatierung
tests/           Browser-Tests
```

## Noch offen

Mehrere Bodenschichten, Grundwasser, Gegengleitfläche, Verdichtungs- und Ruhedruck, Erdwiderstand, weitere Lastarten, Geländebruch (Bishop), Setzung, Startassistent, weitere Normprofile.

Beiträge: siehe [CONTRIBUTING.md](CONTRIBUTING.md).

## Lizenz

[Mozilla Public License 2.0](LICENSE). Geänderte Dateien müssen bei Weitergabe wieder unter MPL-2.0 offengelegt werden; eigener Code daneben darf unter beliebiger Lizenz stehen.

Die Software dient der Vorbemessung und ersetzt keine prüffähige Statik. Die Verantwortung für die Ergebnisse liegt beim Anwender; eine Haftung ist ausgeschlossen (siehe Abschnitte 6 und 7 der Lizenz).
