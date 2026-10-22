// Génère les SVG d'aperçu des 4 étapes (vue équipe) et de l'étape 2 en vue J2.
// Usage : node scripts/preview.mjs <dossier> [href de l'image]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { renderStepSvg } from '../src/map/render.js';
const data = JSON.parse(readFileSync(new URL('../strategies/d2-split-a.json', import.meta.url)));
const out = process.argv[2] ?? 'preview';
// Un chemin local est intégré en data URI (utile pour convertir l'aperçu en PNG).
const arg = process.argv[3];
const imageHref = arg && !/^(https?:|data:)/.test(arg)
  ? `data:image/${arg.endsWith('.png') ? 'png' : 'webp'};base64,${readFileSync(arg).toString('base64')}`
  : arg;
mkdirSync(out, { recursive: true });
for (const s of data.steps) writeFileSync(`${out}/etape-${s.n}.svg`, renderStepSvg(data, s.n, { imageHref }));
writeFileSync(`${out}/etape-2-j2.svg`, renderStepSvg(data, 2, { focus: 'j2', imageHref }));
console.log('ok', out);
