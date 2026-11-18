# Re-assemble

App om met foto's vast te leggen hoe je iets uit elkaar haalt, en het daarna stap voor stap
(in omgekeerde volgorde) weer in elkaar te zetten. Eerste gebruik: de massagestoel van Mark.

## Hoe het in elkaar zit
- Geen build en geen npm: `index.html` + `app.css` + `app.js`, gewone JavaScript.
- Alles wordt op het toestel zelf bewaard (IndexedDB: `projects`, `steps`, `photos`). Er is geen server en geen account.
- Foto's worden verkleind tot max. 1600 px voordat ze worden opgeslagen.
- `sw.js` laat de app zonder internet openen. Verhoog `VERSION` daarin bij elke wijziging.
- `tools/make-artifact.mjs <bestand>` maakt één los bestand om als Claude-artifact te tonen.
- Teksten in de app zijn Nederlands en in gewone taal. Knoppen minstens 48 px hoog.

## Testen
Er is geen testmap. Controleer wijzigingen met Playwright op telefoonbreedte (400 px), licht en donker:
project maken, stap met foto en stippen, terugzetten, herladen, reservekopie maken en terugzetten.

## Meer
- Besluiten met reden: `docs/besluiten.md`
- Wat nog open staat: `docs/roadmap.md`
