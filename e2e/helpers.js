// Outils partagés par les tests de parcours.
import { readFileSync } from 'node:fs';

export const SPLIT_A = JSON.parse(readFileSync(new URL('../strategies/d2-split-a.json', import.meta.url), 'utf8'));

/** Coordonnées écran d'un point de la carte (pixels de l'image) dans le SVG `selector`. */
export async function toScreen(page, selector, point) {
  return page.locator(`${selector} svg`).evaluate((s, [x, y]) => {
    const p = new DOMPoint(x, y).matrixTransform(s.getScreenCTM());
    return [p.x, p.y];
  }, point);
}

const touch = (x, y, id = 7) => ({ pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, button: 0 });

/** Glisse un élément de la carte de l'éditeur (départ en coordonnées écran) vers un point de la carte. */
async function dragFrom(page, target, from, to) {
  const dest = await toScreen(page, '#ed-map', to);
  await target.dispatchEvent('pointerdown', touch(...from));
  for (let k = 1; k <= 5; k++) {
    const x = from[0] + ((dest[0] - from[0]) * k) / 5;
    const y = from[1] + ((dest[1] - from[1]) * k) / 5;
    await page.locator('#ed-map').dispatchEvent('pointermove', touch(x, y));
  }
  await page.locator('#ed-map').dispatchEvent('pointerup', touch(...dest));
}

// Glisse un jeton de l'éditeur vers un point de la carte (pixels de l'image).
// Les événements pointeur sont envoyés comme un doigt (touch) sur iPhone et Android, souris sur ordinateur.
export async function dragToken(page, role, to) {
  await page.locator('#ed-map').scrollIntoViewIfNeeded();
  const hit = page.locator(`#ed-map .ed-hit[data-role="${role}"]`);
  const from = await hit.evaluate((g) => {
    const s = g.ownerSVGElement;
    const p = new DOMPoint(+g.getAttribute('cx'), +g.getAttribute('cy')).matrixTransform(s.getScreenCTM());
    return [p.x, p.y];
  });
  await dragFrom(page, hit, from, to);
}

/** Glisse le losange du point de passage (joueur choisi) vers un point de la carte. */
export async function dragVia(page, to) {
  const handle = page.locator('#ed-map .ed-via');
  const box = await handle.locator('rect').boundingBox();
  await dragFrom(page, handle, [box.x + box.width / 2, box.y + box.height / 2], to);
}

export async function tapMap(page, point) {
  await page.locator('#ed-map').scrollIntoViewIfNeeded();
  const [x, y] = await toScreen(page, '#ed-map', point);
  await page.locator('#ed-map svg').dispatchEvent('pointerdown', touch(x, y, 9));
}

/** Pas d'invitation automatique « Ajouter à l'écran d'accueil » (testée à part). */
export async function skipInstallPrompt(context) {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('stratbook:installation-proposee', '1');
    } catch {
      /* rien */
    }
  });
}

/** Partage : pas de menu natif, le lien copié est gardé dans window.__copied. */
export async function captureShare(page) {
  await page.evaluate(() => {
    delete Navigator.prototype.share;
    delete Navigator.prototype.canShare;
    window.__copied = null;
    navigator.clipboard.writeText = async (t) => {
      window.__copied = t;
    };
  });
}

/** Clique sur Partager et renvoie le lien copié. */
export async function shareLink(page) {
  await captureShare(page);
  await page.getByRole('button', { name: 'Partager' }).click();
  await page.waitForFunction(() => window.__copied);
  return page.evaluate(() => window.__copied);
}

/** Modifie le titre de la stratégie affichée dans l'éditeur, puis enregistre. */
export async function editTitle(page, title) {
  await page.getByRole('button', { name: 'Stratégies' }).click();
  await page.getByRole('button', { name: 'Modifier cette stratégie' }).click();
  await page.getByLabel('Titre de la stratégie').fill(title);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.locator('#strat-title').getByText(title, { exact: true }).waitFor();
}

/** Met des stratégies perso dans le stockage du téléphone avant l'ouverture de la page. */
export async function seedLocal(context, strategies) {
  await context.addInitScript((list) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('stratbook:strategies', JSON.stringify(Object.fromEntries(list.map((s) => [s.id, s]))));
  }, strategies);
}

/** Copie de Split A sous un autre id (stratégie perso), avec un titre. */
export function persoFrom(id, title, patch = (s) => s) {
  const s = JSON.parse(JSON.stringify(SPLIT_A));
  s.id = id;
  s.title = { text: title, source: 'ajout' };
  delete s.frame;
  return patch(s);
}
