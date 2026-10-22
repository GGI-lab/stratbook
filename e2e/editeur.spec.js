import { test, expect } from '@playwright/test';

const header = (page) => page.locator('header.top');
const brief = (page) => page.locator('#consignes');

// Glisse un jeton de l'éditeur vers un point de la carte (pixels de l'image).
// Les événements pointeur sont envoyés comme un doigt (touch) sur iPhone et Android, souris sur ordinateur.
async function dragToken(page, role, to) {
  await page.locator('#ed-map').scrollIntoViewIfNeeded();
  const { from, dest } = await page.locator('#ed-map svg').evaluate((s, [role, to]) => {
    const g = s.querySelector(`.ed-hit[data-role="${role}"]`);
    const screen = (x, y) => {
      const p = new DOMPoint(x, y).matrixTransform(s.getScreenCTM());
      return [p.x, p.y];
    };
    return { from: screen(+g.getAttribute('cx'), +g.getAttribute('cy')), dest: screen(...to) };
  }, [role, to]);
  const hit = page.locator(`#ed-map .ed-hit[data-role="${role}"]`);
  const opts = (x, y) => ({ pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, button: 0 });
  await hit.dispatchEvent('pointerdown', opts(...from));
  for (let k = 1; k <= 5; k++) {
    const x = from[0] + ((dest[0] - from[0]) * k) / 5;
    const y = from[1] + ((dest[1] - from[1]) * k) / 5;
    await page.locator('#ed-map').dispatchEvent('pointermove', opts(x, y));
  }
  await page.locator('#ed-map').dispatchEvent('pointerup', opts(...dest));
}

async function tapMap(page, point) {
  await page.locator('#ed-map').scrollIntoViewIfNeeded();
  const [x, y] = await page.locator('#ed-map svg').evaluate((s, [x, y]) => {
    const p = new DOMPoint(x, y).matrixTransform(s.getScreenCTM());
    return [p.x, p.y];
  }, point);
  await page.locator('#ed-map svg').dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, button: 0 });
}

test('en-tête : boutons Stratégies, side, Pseudos, Partager, de même taille et dans cet ordre', async ({ page }) => {
  await page.goto('./');
  const names = await header(page).locator('.top__actions button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(names).toEqual(['Stratégies', 'Side : Terro. Passer côté CT', 'Pseudos', 'Partager']);
  const sizes = await header(page).locator('.top__actions button').evaluateAll((els) => els.map((e) => `${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
  expect(new Set(sizes).size).toBe(1);
});

test('bouton side : jaune « T » côté terro, bleu « CT » côté CT, alterne au toucher', async ({ page }) => {
  await page.goto('./');
  const side = page.locator('#side');
  await expect(side).toHaveText('T');
  expect(await side.evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color])).toEqual(['rgb(234, 179, 8)', 'rgb(0, 0, 0)']);
  await side.click();
  await expect(side).toHaveText('CT');
  expect(await side.evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color])).toEqual(['rgb(37, 99, 235)', 'rgb(255, 255, 255)']);
  await expect(page.locator('#map-label')).toHaveText('Dust 2 · CT');
  await expect(page.getByRole('button', { name: 'Créer une stratégie CT' })).toBeVisible();
  await side.click();
  await expect(page.locator('#strat-title')).toHaveText('Split A, 3 Long + 2 Short');
});

test('menu des stratégies : liste du side, Échap ferme et rend le focus', async ({ page }) => {
  await page.goto('./');
  const open = page.getByRole('button', { name: 'Stratégies' });
  await open.click();
  await expect(open).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#menu-head')).toHaveText('Stratégies Terro · Dust 2');
  await expect(page.locator('#menu-list .menu__item')).toHaveText([/Split A, 3 Long \+ 2 Short/]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#strat-menu')).toBeHidden();
  await expect(open).toBeFocused();
});

test('créer une stratégie CT, placer les joueurs, enregistrer, la lire et la partager', async ({ page, browser }) => {
  await page.goto('./?side=ct');
  await page.getByRole('button', { name: 'Créer une stratégie CT' }).click();
  await expect(page.locator('#editor-title')).toHaveText('Nouvelle stratégie CT');
  await page.getByLabel('Titre de la stratégie').fill('Retake B');

  // Étape 1 : J1 va au site B, son trajet est calculé.
  await dragToken(page, 'j1', [150, 200]);
  await expect(page.locator('#ed-map .move[data-role="j1"]')).toHaveCount(1);
  await page.getByRole('button', { name: '+ Ajouter une ligne' }).click();
  await page.getByLabel('Plan 1', { exact: true }).fill('J1 tient B');
  await page.locator('#ed-m-j1').fill('Fenêtre B');

  // Étape 2 : ajoutée, J2 se déplace, smoke posée.
  await page.getByRole('button', { name: 'Ajouter une étape' }).click();
  await expect(page.getByRole('button', { name: 'Étape 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dragToken(page, 'j2', [180, 260]);
  await page.getByRole('button', { name: 'Smoke', exact: true }).click();
  await tapMap(page, [260, 200]);
  await expect(page.locator('#ed-map .utility')).toHaveCount(1);
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page.locator('#strat-title')).toHaveText('Retake B');
  await expect(page.locator('#side')).toHaveText('CT');
  // Retour sur l'étape en cours de modification (2), puis l'étape 1 garde son plan.
  await expect(brief(page)).toContainText('Étape 2 sur 2');
  await page.getByRole('button', { name: 'Étape précédente' }).click();
  await expect(brief(page)).toContainText('Étape 1 sur 2');
  await expect(brief(page)).toContainText('J1 tient B');
  await page.getByRole('button', { name: 'Stratégies' }).click();
  await expect(page.locator('#menu-list')).toContainText('Retake B');
  await expect(page.locator('#menu-list')).toContainText('Perso');
  await page.keyboard.press('Escape');

  // Partage : la stratégie voyage dans le lien.
  await page.evaluate(() => {
    delete Navigator.prototype.share;
    window.__copied = null;
    navigator.clipboard.writeText = async (t) => {
      window.__copied = t;
    };
  });
  await page.getByRole('button', { name: 'Partager' }).click();
  await expect(page.getByRole('status')).toHaveText('Lien copié');
  const link = await page.evaluate(() => window.__copied);
  expect(link).toMatch(/[?&]d=[zj]/);

  const ctx = await browser.newContext();
  const friend = await ctx.newPage();
  await friend.goto(link);
  await expect(friend.locator('#strat-title')).toHaveText('Retake B');
  await expect(friend.getByRole('status')).toHaveText('Stratégie « Retake B » ajoutée');
  await friend.reload();
  await expect(friend.locator('#strat-title')).toHaveText('Retake B');
  await ctx.close();
});

test("modifier la stratégie d'origine, puis revenir à la version d'origine", async ({ page }) => {
  await page.goto('./?step=2&role=j2');
  await page.getByRole('button', { name: 'Stratégies' }).click();
  await page.getByRole('button', { name: 'Modifier cette stratégie' }).click();
  await page.getByRole('button', { name: 'Étape 2', exact: true }).click();
  await page.locator('#ed-m-j2').fill('Smoke CT puis attends le go');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(brief(page)).toContainText('Smoke CT puis attends le go');
  await page.getByRole('button', { name: 'Stratégies' }).click();
  await expect(page.locator('#menu-list')).toContainText('Modifiée');
  await page.getByRole('button', { name: 'Modifier cette stratégie' }).click();
  await page.getByRole('button', { name: 'Revenir à la version d’origine' }).click();
  await page.getByRole('button', { name: 'Revenir', exact: true }).click();
  await expect(brief(page)).toContainText('Étape 2 sur 4');
  await expect(brief(page).locator('.missions')).toHaveText('Smoke CT.');
});

test('annuler une création modifiée demande confirmation', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Stratégies' }).click();
  await page.getByRole('button', { name: 'Nouvelle stratégie T' }).click();
  await page.getByLabel('Titre de la stratégie').fill('Brouillon');
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Quitter sans enregistrer ?');
  await page.getByRole('button', { name: 'Quitter', exact: true }).click();
  await expect(page.locator('#strat-title')).toHaveText('Split A, 3 Long + 2 Short');
});

test('éditeur : aucun défilement horizontal', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Stratégies' }).click();
  await page.getByRole('button', { name: 'Nouvelle stratégie T' }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
