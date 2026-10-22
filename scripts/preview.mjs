// Génère preview/apercu-carte.html : les 4 étapes en vue équipe (relecture du plan).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { renderStepSvg } from '../src/map/render.js';
const data = JSON.parse(readFileSync(new URL('../strategies/d2-split-a.json', import.meta.url)));
const out = process.argv[2] ?? 'preview';
mkdirSync(out, { recursive: true });
for (const s of data.steps) writeFileSync(`${out}/etape-${s.n}.svg`, renderStepSvg(data, s.n));
writeFileSync(`${out}/etape-2-j2.svg`, renderStepSvg(data, 2, { focus: 'j2' }));
console.log('ok', out);
