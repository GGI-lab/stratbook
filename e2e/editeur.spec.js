import { test, expect } from '@playwright/test';
import { dragToken, dragVia, tapMap, skipInstallPrompt } from './helpers.js';

const header = (page) => page.locator('header.top');
const brief = (page) => page.locator('#consignes');

test.beforeEach(async ({ context }) => {
  await skipInstallPrompt(context);
});

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

// ---------- Défaire / Refaire ----------
const savedStrategies = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('stratbook:strategies') ?? '{}'));

test('défaire et refaire : déplacement de joueur, utilitaire, texte', async ({ page }) => {
  await page.goto('./?side=ct');
  await page.getByRole('button', { name: 'Créer une stratégie CT' }).click();
  const undo = page.getByRole('button', { name: 'Défaire' });
  const redo = page.getByRole('button', { name: 'Refaire' });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  // Déplacement : défait puis refait.
  await dragToken(page, 'j1', [150, 200]);
  await expect(page.locator('#ed-map .move[data-role="j1"]')).toHaveCount(1);
  await undo.click();
  await expect(page.locator('#ed-map .move[data-role="j1"]')).toHaveCount(0);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(page.locator('#ed-map .move[data-role="j1"]')).toHaveCount(1);

  // Utilitaire posé puis défait.
  await page.getByRole('button', { name: 'Smoke', exact: true }).click();
  await tapMap(page, [260, 200]);
  await expect(page.locator('#ed-map .utility')).toHaveCount(1);
  await undo.click();
  await expect(page.locator('#ed-map .utility')).toHaveCount(0);

  // Texte : une frappe continue compte pour une seule action.
  await page.getByLabel('Titre de la stratégie').pressSequentially('Retake');
  await undo.click();
  await expect(page.getByLabel('Titre de la stratégie')).toHaveValue('');
  // Une nouvelle action efface ce qui pouvait être refait.
  await dragToken(page, 'j2', [180, 260]);
  await expect(redo).toBeDisabled();
});

test('défaire au clavier (Ctrl+Z) hors des champs de texte', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'), 'Raccourci clavier : ordinateur');
  await page.goto('./?side=ct');
  await page.getByRole('button', { name: 'Créer une stratégie CT' }).click();
  await dragToken(page, 'j1', [150, 200]);
  await expect(page.locator('#ed-map .move[data-role="j1"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ajouter une étape' }).focus();
  await page.keyboard.press('Control+z');
  await expect(page.locator('#ed-map .move[data-role="j1"]')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('#ed-map .move[data-role="j1"]')).toHaveCount(1);
});

// ---------- Point de passage ----------
test('point de passage : imposer Mid plutôt que le plus court chemin, puis le retirer', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Stratégies' }).click();
  await page.getByRole('button', { name: 'Nouvelle stratégie T' }).click();
  await page.getByLabel('Titre de la stratégie').fill('Passage Mid');
  // J1 va au bout de Long ; le losange apparaît sur son trajet (joueur choisi).
  await dragToken(page, 'j1', [895, 300]);
  await expect(page.locator('#ed-map .ed-via')).toHaveCount(1);
  await expect(page.locator('#ed-map .ed-via.is-set')).toHaveCount(0);
  const before = await page.locator('#ed-map .move[data-role="j1"] path').first().getAttribute('d');

  // Losange glissé à Mid : le trajet passe par là.
  await dragVia(page, [462, 520]);
  await expect(page.locator('#ed-map .ed-via.is-set')).toHaveCount(1);
  const after = await page.locator('#ed-map .move[data-role="j1"] path').first().getAttribute('d');
  expect(after).not.toBe(before);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  const saved = Object.values(await savedStrategies(page)).find((s) => s.title.text === 'Passage Mid');
  const move = saved.steps[0].map.moves.find((m) => m.role === 'j1');
  expect(move.via).toHaveLength(1);
  const [vx, vy] = move.via[0];
  expect(Math.hypot(vx - 462, vy - 520)).toBeLessThan(30);
  expect(move.path.some(([x, y]) => x === vx && y === vy)).toBe(true);

  // Retirer le point de passage : retour au plus court chemin.
  await page.getByRole('button', { name: 'Stratégies' }).click();
  await page.getByRole('button', { name: 'Modifier cette stratégie' }).click();
  await page.locator('#ed-map .ed-hit[data-role="j1"]').dispatchEvent('pointerdown', { pointerId: 3, pointerType: 'touch', isPrimary: true, bubbles: true, button: 0 });
  await page.locator('#ed-map').dispatchEvent('pointerup', { pointerId: 3, pointerType: 'touch', isPrimary: true, bubbles: true, button: 0 });
  await page.getByRole('button', { name: 'Retirer le point de passage' }).click();
  await expect(page.locator('#ed-map .ed-via.is-set')).toHaveCount(0);
  expect(await page.locator('#ed-map .move[data-role="j1"] path').first().getAttribute('d')).toBe(before);
});

// ---------- Carte visible pendant la saisie (téléphone) ----------
test('téléphone : la carte reste en haut pendant la saisie des missions', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('desktop'), 'Ordinateur : carte et consignes côte à côte');
  await page.goto('./');
  await page.getByRole('button', { name: 'Stratégies' }).click();
  await page.getByRole('button', { name: 'Modifier cette stratégie' }).click();
  const field = page.locator('#ed-m-j5');
  await field.scrollIntoViewIfNeeded();
  await field.click();
  await field.fill('Garde l’arrière de Short');
  const stage = await page.locator('#ed-stage').boundingBox();
  const bar = await page.locator('.editor__bar').boundingBox();
  const input = await field.boundingBox();
  // Carte collée sous la barre de l'éditeur, entièrement visible, et le champ n'est pas dessous.
  expect(Math.abs(stage.y - (bar.y + bar.height))).toBeLessThan(2);
  expect(stage.height).toBeGreaterThan(150);
  expect(input.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
  // Plus bas, la section des rôles fait défiler la carte (elle ne colle que dans « Étapes et placement »).
  await page.getByRole('heading', { name: 'Rôles des joueurs' }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 400));
  const later = await page.locator('#ed-stage').boundingBox();
  expect(later.y).toBeLessThan(bar.y + bar.height - 50);
});
