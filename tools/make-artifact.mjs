// Maakt één los bestand van de app, om als Claude-artifact te tonen.
// Gebruik: node tools/make-artifact.mjs <uitvoerbestand>
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('..', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
writeFileSync(process.argv[2], `<title>Re-assemble</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${read('app.css')}</style>
<main id="app"></main>
<script>
${read('app.js')}</script>
`);
