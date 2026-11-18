# Re-assemble

App om met foto's vast te leggen hoe je iets uit elkaar haalt, en het daarna stap voor stap
(in omgekeerde volgorde) weer in elkaar te zetten. Eerste gebruik: de massagestoel van Mark.

## Hoe het in elkaar zit
- Live: https://re-assemble.markhultink.workers.dev (Cloudflare, project `re-assemble`).
- Geen build en geen npm. De app staat in `public/`: `index.html` + `app.css` + `app.js`, gewone JavaScript.
- Alles wordt op het toestel zelf bewaard (IndexedDB: `projects`, `steps`, `photos`). Er is geen server en geen account.
- Foto's worden verkleind tot max. 1600 px voordat ze worden opgeslagen.
- `public/sw.js` laat de app zonder internet openen. Verhoog `VERSION` daarin bij elke wijziging.
- `tools/make-artifact.mjs <bestand>` maakt één los bestand om als Claude-artifact te tonen.
- Teksten in de app zijn Nederlands en in gewone taal. Knoppen minstens 48 px hoog.

## Live zetten
Alleen na akkoord van Mark: `wrangler deploy` in de hoofdmap (leest `wrangler.jsonc`, zet `public/` live).
Gebruik niet `wrangler pages ...`; dat werkt niet meer voor nieuwe projecten.
Cloudflare-toegang staat in de omgeving van de sessie (`CLOUDFLARE_API_TOKEN`), nooit in de code.
Deployen gaat met de hand; een push naar GitHub zet niets live.

## Testen
Er is geen testmap. Controleer wijzigingen met Playwright op telefoonbreedte (400 px), licht en donker:
project maken, stap met foto en stippen, terugzetten, herladen, reservekopie maken en terugzetten.

## Meer
- Besluiten met reden: `docs/besluiten.md`
- Wat nog open staat: `docs/roadmap.md`
