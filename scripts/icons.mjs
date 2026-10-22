// Génère les icônes PNG de l'app (public/icons/) depuis public/icons/favicon.svg, avec Playwright.
// Usage : node scripts/icons.mjs (CHROME_PATH=... pour utiliser un Chrome déjà installé).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icons/favicon.svg', 'utf8');
const b = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const p = await b.newPage();
async function shot(size, file, { maskable = false } = {}) {
  // Maskable : fond plein (pas d'arrondi) et motif réduit dans la zone sûre (80 %).
  const inner = maskable
    ? svg.replace('rx="112"', 'rx="0"').replace(/<path|<circle/g, (m) => m).replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0F1720"/><g transform="translate(51 51) scale(0.8)">').replace('</svg>', '</g></svg>')
    : svg;
  const full = size === 180 ? svg.replace('rx="112"', 'rx="0"') : inner; // iOS arrondit lui-même
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;background:transparent">${full.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await shot(192, 'public/icons/icon-192.png');
await shot(512, 'public/icons/icon-512.png');
await shot(512, 'public/icons/maskable-512.png', { maskable: true });
await shot(180, 'public/icons/apple-touch-icon.png');
await b.close();
