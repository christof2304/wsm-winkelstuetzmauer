# Mitwirken

Danke, dass du beitragen möchtest. Dieses Projekt rechnet Tragwerke. Ein Fehler im Rechenkern kann im schlimmsten Fall in eine reale Bemessung einfließen. Darum gelten für den Rechenkern strengere Regeln als für die Oberfläche.

> **Hinweis:** Die Software dient der Vorbemessung und ersetzt keine prüffähige Statik. Die Verantwortung für jede Berechnung liegt beim Anwender.

## Grundsatz: erweitern statt forken

Forks sind erlaubt. Bitte reiche Verbesserungen aber als Pull Request ins Upstream-Repository ein. Nur so kommen Fehlerkorrekturen und Normänderungen bei allen an, und es bleibt eindeutig, welche Version verifiziert ist.

- **Neue Norm** (ÖNORM, SIA, PN …): als neues `NormProfile` unter `packages/norm/src/` anlegen. Die bestehenden Profile nicht verändern.
- **Neuer Nachweis, neue Lastart, neues Bauteil**: als eigenes Modul mit klarer Schnittstelle anlegen. Bitte vorher ein Issue eröffnen und den Ansatz abstimmen.

## Arten von Beiträgen

| Art | Was nötig ist |
|---|---|
| Rechenfehler melden | Issue-Vorlage „Rechenfehler" mit Eingabe-JSON, erwartetem Wert und Quelle |
| Rechenfehler beheben | Zuerst ein fehlschlagender Referenztest, dann der Fix im selben PR |
| Rechenkern erweitern | Referenztest(s) mit Quelle und Fach-Review (siehe unten) |
| Normprofil | Angabe der Normausgabe (z. B. `DIN 1054:2021-04`) und Referenztests je Nachweis |
| UI, Zeichnung, Doku | normales Code-Review |

## Referenztests

Referenztests liegen unter `tests/reference/<name>/`:

```
tests/reference/h3m-sand-q10/
  input.json        # Projektdatei wie aus der App exportiert
  expected.json     # erwartete Ergebnisse mit Toleranz
  SOURCE.md         # Herkunft der Sollwerte
```

`expected.json`:

```json
{
  "tolerance": 0.02,
  "results": {
    "sliding.utilization": 0.71,
    "overturning.utilization": 0.48,
    "bearing.utilization": 0.63
  }
}
```

In `SOURCE.md` steht, woher die Sollwerte kommen. Erlaubte Quellen:

- eine **Handrechnung**, nachvollziehbar als Markdown oder PDF
- eine **Literaturstelle** mit Autor, Titel, Auflage und Seite
- eine **Vergleichsrechnung** mit einem anderen Programm, mit Programmname und Version

Werte, die nur aus diesem Programm selbst stammen, gelten nicht als Quelle.

## Fach-Review für den Rechenkern

Änderungen unter `packages/norm`, `packages/soil`, `packages/rc` und an den Bemessungsteilen von `packages/rebar-draw` brauchen

1. mindestens einen neuen oder angepassten Referenztest und
2. ein Review durch eine zweite Person mit Fachkenntnis (Bauingenieur/in), die in `CODEOWNERS` für das Paket eingetragen ist.

Ändert ein PR Ergebnisse bestehender Referenztests, muss die Beschreibung erklären, warum der neue Wert richtig ist. Zusätzlich wird der PR mit dem Label `ändert-ergebnisse` versehen.

## Urheberrecht

- **Formeln, Beiwerte und Normverweise** (z. B. „DIN 4017, Gl. 5") sind in Ordnung.
- **Normtexte und Tabellen** bitte nicht wörtlich übernehmen. Hilfetexte unter `ui/help/` sind eigene Formulierungen.
- **Handbücher kommerzieller Programme**: Übernommen wird nur die Fachlogik, keine Texte, Grafiken oder Beispiele.

## Ablauf

1. Issue eröffnen oder ein bestehendes Issue übernehmen.
2. Branch anlegen: `fix/…`, `feat/…`, `norm/…` oder `docs/…`.
3. Tests lokal ausführen:
   ```bash
   pnpm install
   pnpm test
   ```
4. Commits mit DCO-Signatur erstellen (`git commit -s`). Mit dem `Signed-off-by` bestätigst du das [Developer Certificate of Origin](https://developercertificate.org/). Eine CLA gibt es nicht.
5. Pull Request eröffnen. Die CI führt Unit- und Referenztests aus und zeigt Abweichungen gegenüber dem letzten Release.

## Stil

- Code, Bezeichner und Kommentare auf **Englisch**.
- Oberfläche, Hilfetexte und `SOURCE.md` auf **Deutsch**. Weitere Sprachen kommen über `ui/help/<lang>.ts` dazu.
- Rechenschritte geben strukturierte Daten zurück (`{label, formula, values, result, ref}`). Bitte keine fertig formatierten Strings aus dem Rechenkern liefern.
- Einheiten intern: m, kN, kPa, Grad. Umrechnung erst in der UI.

## Releases

- Versionierung nach [SemVer](https://semver.org/lang/de/).
- Ein Release gilt als **verifiziert**, wenn alle Referenztests bestehen und das Fach-Review abgeschlossen ist.
- `CHANGELOG.md` kennzeichnet rechenrelevante Änderungen gesondert.

## Lizenz

Das gesamte Repository steht unter der [Mozilla Public License 2.0](LICENSE).

Mit deinem Beitrag stimmst du zu, dass er unter dieser Lizenz veröffentlicht wird.
