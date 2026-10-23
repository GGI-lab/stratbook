// Confort d'usage : bouton retour du téléphone, zones de toucher des jetons, bouton Lecture.
import { test, expect, asAdmin, toScreen } from './helpers.js';

test.beforeEach(async ({ context }) => {
  await asAdmin(context);
});

const onSite = (page) => expect(page).toHaveURL(/\/stratbook\/\?s=d2-split-a/);

test('retour : ferme le menu des stratégies sans quitter le site', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Stratégies' }).click();
  await expect(page.locator('#strat-menu')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#strat-menu')).toBeHidden();
  await onSite(page);
  await expect(page.locator('#strat-title')).toHaveText('Split A, 3 Long + 2 Short');
});

test("retour : ferme l'éditeur, en demandant confirmation s'il y a des changements", async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Stratégies' }).click();
  await page.getByRole('button', { name: 'Modifier cette stratégie' }).click();
  await expect(page.locator('#editor')).toBeVisible();
  // Sans changement : fermeture directe.
  await page.goBack();
  await expect(page.locator('#editor')).toBeHidden();
  await onSite(page);

  // Avec un changement : confirmation ; « Continuer » reste dans l'éditeur.
  await page.getByRole('button', { name: 'Stratégies' }).click();
  await page.getByRole('button', { name: 'Modifier cette stratégie' }).click();
  await page.getByLabel('Titre de la stratégie').fill('Titre changé');
  await page.goBack();
  await expect(page.getByRole('dialog')).toContainText('Quitter sans enregistrer ?');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.locator('#editor')).toBeVisible();
  // L'entrée d'historique est remise après le clic (pas d'entrée ajoutée sans action de l'utilisateur).
  await page.waitForFunction(() => history.state?.stratbookLayer === 'editor');
  await expect(page.getByLabel('Titre de la stratégie')).toHaveValue('Titre changé');
  // Deuxième retour : « Quitter » ferme sans enregistrer.
  await page.goBack();
  await page.getByRole('button', { name: 'Quitter', exact: true }).click();
  await expect(page.locator('#editor')).toBeHidden();
  await expect(page.locator('#strat-title')).toHaveText('Split A, 3 Long + 2 Short');
  await onSite(page);
});

test("enregistrer puis retour : on revient à la page d'avant l'ouverture du site, pas dans l'éditeur", async ({ page }) => {
  await page.goto('./?step=2&role=j2');
  await page.getByRole('button', { name: 'Stratégies' }).click();
  await page.getByRole('button', { name: 'Modifier cette stratégie' }).click();
  await page.getByLabel('Titre de la stratégie').fill('Split A modifiée');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('#strat-title')).toHaveText('Split A modifiée');
  // L'adresse garde l'étape et la vue ; l'historique ne contient plus l'éditeur ni le menu.
  await expect(page).toHaveURL(/step=2&role=j2/);
  expect(await page.evaluate(() => history.state?.stratbookLayer ?? null)).toBeNull();
});

test('jetons : zone de toucher de 44 px, le joueur le plus proche du doigt est choisi', async ({ page }) => {
  await page.goto('./?step=1&role=equipe');
  const hits = await page.locator('#map .player__hit').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  expect(hits).toHaveLength(5);
  for (const w of hits) expect(w).toBeGreaterThanOrEqual(43);
  // Toucher à côté de J3 (hors du jeton dessiné, dans sa zone de toucher).
  const [x, y] = await page.locator('#map .player[data-role="j3"]').evaluate((g) => {
    const b = g.querySelector('circle:not(.player__hit)').getBoundingClientRect();
    return [b.left + b.width / 2 + b.width * 0.9, b.top + b.height / 2];
  });
  await page.mouse.click(x, y);
  await expect(page.locator('[data-view="j3"]')).toHaveAttribute('aria-pressed', 'true');
});

test('bouton Lecture : hors de la carte, au-dessus du volet des consignes', async ({ page }) => {
  await page.goto('./');
  const play = await page.locator('#play').boundingBox();
  const map = await page.locator('#map svg').boundingBox();
  const brief = await page.locator('#consignes').boundingBox();
  const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(overlap(play, map)).toBe(false);
  expect(overlap(play, brief)).toBe(true); // posé dans le coin du volet
  // Il ne recouvre pas le titre de l'étape.
  const heading = await page.locator('#consignes .b-title').boundingBox();
  expect(overlap(play, heading)).toBe(false);
  // Le spawn T (bas de la carte) est dégagé : rien ne se pose dessus.
  const [sx, sy] = await toScreen(page, '#map', [400, 900]);
  const topEl = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('#play') !== null, [sx, sy]);
  expect(topEl).toBe(false);
});

test("menu puis éditeur : une seule entrée d'historique, ajoutée au toucher", async ({ page }) => {
  await page.goto('./');
  const length0 = await page.evaluate(() => history.length);
  await page.getByRole('button', { name: 'Stratégies' }).click();
  await page.getByRole('button', { name: 'Modifier cette stratégie' }).click();
  await expect(page.locator('#editor')).toBeVisible();
  // L'entrée du menu est reprise par l'éditeur (pas de retour suivi d'un ajout sans action).
  expect(await page.evaluate(() => [history.length, history.state?.stratbookLayer])).toEqual([length0 + 1, 'editor']);
  await page.goBack();
  await expect(page.locator('#editor')).toBeHidden();
  await onSite(page);
});
