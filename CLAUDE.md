# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Worum es geht

WSM ist eine Browser-App zur Vorbemessung von Winkelstützmauern aus Stahlbeton. Abgedeckt sind DIN 1054 / DIN EN 1997-1 (BS-P), DIN 4085 (Erddruck), DIN 4017 (Grundbruch) und DIN EN 1992-1-1 (Stahlbetonbemessung). Die App erzeugt außerdem eine 2D-Bewehrungsskizze und eine Stahlliste. Oberfläche und Hilfetexte sind auf Deutsch.

## Starten und Testen

Es gibt keinen Build-Schritt, keine `package.json` und kein `node_modules`. Die App besteht aus reinen ES-Modulen. Preact und htm kommen über eine Importmap in `index.html` von jsDelivr, und `tests/index.html` hat eine eigene Kopie dieser Importmap.

```bash
python -m http.server 8765      # auch als „wsm“ in .claude/launch.json hinterlegt
```

- App: http://localhost:8765/
- Tests: http://localhost:8765/tests/

Alle Tests stehen in einer einzigen Browserseite, `tests/index.html`. Sie nutzt ein kleines eingebettetes Testgerüst: `t(name, fn)` gilt als bestanden, wenn `fn` `true` oder `undefined` zurückgibt; ein zurückgegebener String ist die Fehlermeldung. `near(a, b, tol)` vergleicht Zahlen. Die Seite zeigt eine Tabelle mit bestanden/fehlgeschlagen und stellt `window.__results` für eine Prüfung ohne Browserfenster bereit. Einen einzelnen Test kann man nicht gezielt starten; dafür die übrigen vorübergehend auskommentieren. Ein neuer Test ist eine weitere `t(...)`-Zeile in dieser Datei.

CONTRIBUTING.md beschreibt einiges, das es im Repository noch nicht gibt: `pnpm install` / `pnpm test`, `tests/reference/<fall>/{input.json,expected.json,SOURCE.md}`, `packages/norm/src/`, CODEOWNERS, `ui/help/<lang>.ts`, CI und ein CHANGELOG. Das ist der geplante Zielzustand, nicht der aktuelle Stand.

## Architektur

Die Daten fließen in eine Richtung: Modell, dann Berechnung, dann Zeichnung und Oberfläche.

1. **`apps/wsm/model.js`**: `DEFAULT_MODEL` enthält den gesamten Projektzustand als einfaches JSON-Objekt: `name`, `norm` und die Gruppen `wall`, `soil`, `earth`, `loads`, `rc` und `display`. `FIELDS` steuert das Eingabeformular (Pfad, Symbol, Einheit, Schrittweite, Plausibilitätsgrenzen). `setPath` verändert das Modell nicht, sondern liefert eine Kopie (`structuredClone`). `normalize` ergänzt geladene oder ältere Projekte um fehlende Standardwerte. Koordinaten wie bei FRILO: links die Talseite, rechts die Bergseite, Ursprung an der Sohle an der Vorderkante des Talsporns. Einheiten: m, kN, kPa und Grad.
2. **`apps/wsm/analyze.js` → `analyze(m)`** ist der einzige Einstiegspunkt der Berechnung. Er ruft nacheinander auf:
   - `calc.js` `analyzeExternal`: `geometry(m)` (aus `geometry.js`), Einwirkungen, Lastkombinationen, äußere Standsicherheit (Kippen EQU, Exzentrizität `ecc1`/`ecc2`, Gleiten, Grundbruch) und Sohldruck.
   - `design.js` `analyzeInternal(m, ext)`: Schnittgrößen für Wand, Berg- und Talsporn aus den Kombinationen STR und quasi-ständig, danach EC2-Nachweise für jede Bewehrungsposition (`int.pos`, Pos 1–9): Biegung, Querkraft, Rissbreite und Mindestbewehrung für Zwang.
   - `rebar.js` `rebarLayout(m, g, pos)`: Stabverläufe als Polylinien und Punktreihen im Querschnitt sowie die Stahlliste.

   Das Ergebnis ist `{ ok, ext, int, layout, checks, warnings, etaMax }`. `analyze` wirft nie: Jeder Fehler wird zu `{ ok: false, error }`. `optimize` (Rastersuche über `bt`/`bh` nach der kleinsten Sohlbreite) und `study` (Ausnutzungskurven über einen Parameter) rufen dieselbe Berechnung viele Male auf. Die Berechnung muss deshalb schnell bleiben und darf keine Nebenwirkungen haben.
3. **`apps/wsm/draw.js`** erzeugt die Systemzeichnung und die Bewehrungsskizze mit `packages/rebar-draw/drawing.js` (Klasse `Drawing`, Ausgabe als SVG und DXF). **`apps/wsm/main.js`** ist die gesamte Preact-Oberfläche: Undo/Redo, Befehlspalette, Export (SVG/PNG/DXF/CSV/`.wsm.json`) und Rechenbericht. Das Modell und die UI-Einstellungen werden im `localStorage` unter `wsm.*`-Schlüsseln gespeichert.

Pakete des Rechenkerns (`packages/`), alles reine Funktionen:
- `norm/din1054.js`: Normprofil `DIN1054_BSP` (JSDoc-Typ `NormProfile`) mit Teilsicherheitsbeiwerten und Normverweisen. Das Profil wird über `NORMS[m.norm]` gewählt. Eine neue Norm kommt als neues Profil mit derselben Struktur hinzu; das bestehende Profil nicht ändern.
- `soil/earth.js` (Coulomb Ka/Kah, K0, `pressureModel`, `integrate`) und `soil/bearing.js` (Tragfähigkeitsbeiwerte und Grundbruchwiderstand nach DIN 4017).
- `rc/ec2.js`: Betonklassen, Biegung, Querkraft, Rissbreite (`phiStar`), Mindestbewehrung für Zwang, Verankerung sowie Stabkatalog und Stabwahl (Ø 10–25, s = 100–200 mm).
- `ui/`: Komponenten, `theme.css` und `format.js`. `format.js` enthält auch `step()` und `statusOf()`, die der Rechenkern importiert.

Jeder Nachweis ist ein Objekt `{ id, label, short, eta, combo, part, steps }`. `steps` enthält strukturierte Einträge `{ label, formula, result, ref }`, die mit `step()` erzeugt werden. Oberfläche und Rechenbericht stellen diese Schritte dar. Der Rechenkern liefert also strukturierte Daten, keine fertig formulierten Texte. Den Status einer Ausnutzung bestimmt `statusOf(eta)`: ok bis 0,9, Warnung über 0,9, nicht erfüllt über 1,0 oder bei nicht endlichem η.

## Regeln für Änderungen (aus CONTRIBUTING.md)

- Änderungen am Rechenkern (`packages/norm`, `packages/soil`, `packages/rc` und die Bemessungsteile von `rebar-draw`) brauchen einen Test, dessen Sollwerte aus einer unabhängigen Quelle stammen: Handrechnung, Literaturstelle oder ein anderes Programm mit Versionsangabe. Werte aus diesem Programm selbst gelten nicht als Quelle. Bei einer Fehlerkorrektur zuerst den fehlschlagenden Test schreiben. Ändern sich bestehende Ergebnisse, muss begründet werden, warum der neue Wert richtig ist.
- Normtexte und Normtabellen nicht wörtlich übernehmen; Formeln, Beiwerte und Normverweise sind erlaubt. Aus Handbüchern kommerzieller Programme nur die Fachlogik übernehmen, keine Texte, Grafiken oder Beispiele.
- Code, Bezeichner und Kommentare laut Stilvorgabe auf Englisch, Oberflächentexte auf Deutsch. Der bestehende Code hat trotzdem deutsche Kommentare.
- Commits mit DCO-Signatur (`git commit -s`). Branch-Präfixe: `fix/`, `feat/`, `norm/` und `docs/`.
- Lizenz: MPL-2.0.
