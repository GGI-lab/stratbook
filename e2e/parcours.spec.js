import { test, expect } from '@playwright/test';

const views = (page) => page.getByRole('navigation', { name: 'Choix de la vue' });
const steps = (page) => page.getByRole('navigation', { name: 'Étapes de la stratégie' });
const brief = (page) => page.locator('#consignes');

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test("lien sans paramètre : étape 1 en vue équipe, groupes Long et Short visibles", async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Split A, 3 Long + 2 Short');
  await expect(views(page).getByRole('button', { name: 'Équipe' })).toHaveAttribute('aria-pressed', 'true');
  await expect(brief(page)).toContainText('Étape 1 sur 4');
  await expect(brief(page).locator('.plan__group').first()).toHaveText('Long');
  await expect(brief(page)).toContainText('« Long go »');
  await expect(brief(page)).toContainText('« Mid clear »');
});

test('parcours du test ami : J2, étape 2, puis étape 3, puis partage', async ({ page, context, browserName }) => {
  await page.goto('./');
  await views(page).getByRole('button', { name: 'J2' }).click();
  await steps(page).getByRole('button', { name: 'Étape suivante' }).click();
  await expect(brief(page)).toContainText('Étape 2 sur 4');
  await expect(brief(page).locator('.missions')).toHaveText('Smoke CT.');
  await expect(brief(page)).toContainText('« CT smoké »');

  await steps(page).getByRole('button', { name: /Étape 3/ }).click();
  await expect(brief(page).locator('.missions')).toHaveText('Plante la bombe.');
  await expect(page).toHaveURL(/step=3/);
  await expect(page).toHaveURL(/role=j2/);

  // Pas de partage natif en test : on vérifie la copie du lien en repli.
  await page.evaluate(() => {
    delete Navigator.prototype.share;
    window.__copied = null;
    navigator.clipboard.writeText = async (t) => { window.__copied = t; };
  });
  await page.getByRole('button', { name: 'Partager' }).click();
  await expect(page.getByRole('status')).toHaveText('Lien copié');
  const copied = await page.evaluate(() => window.__copied);
  expect(copied).toContain('s=d2-split-a');
  expect(copied).toContain('step=3');
  expect(copied).toContain('role=j2');
});

test('les boutons ne dépassent pas les étapes 1 et 4', async ({ page }) => {
  await page.goto('./?step=1');
  await expect(steps(page).getByRole('button', { name: 'Étape précédente' })).toBeDisabled();
  for (let i = 0; i < 3; i++) await steps(page).getByRole('button', { name: 'Étape suivante' }).click();
  await expect(brief(page)).toContainText('Étape 4 sur 4');
  await expect(steps(page).getByRole('button', { name: 'Étape suivante' })).toBeDisabled();
});

test("changer de vue conserve l'étape", async ({ page }) => {
  await page.goto('./?step=3&role=equipe');
  await views(page).getByRole('button', { name: 'J4' }).click();
  await expect(brief(page)).toContainText('Étape 3 sur 4');
  await views(page).getByRole('button', { name: 'Équipe' }).click();
  await expect(brief(page)).toContainText('Étape 3 sur 4');
});

test('cases sans consigne : J1 étape 3 et J4 étape 4', async ({ page }) => {
  await page.goto('./?step=3&role=j1');
  await expect(brief(page)).toContainText('Pas de nouvelle consigne');
  await page.goto('./?step=4&role=j4');
  await expect(brief(page)).toContainText('Pas de nouvelle consigne');
});

test('toucher un joueur sur la carte ouvre sa vue', async ({ page }) => {
  await page.goto('./?step=2');
  await page.locator('#map .player[data-role="j5"]').click();
  await expect(views(page).getByRole('button', { name: 'J5' })).toHaveAttribute('aria-pressed', 'true');
});

test('pseudos : enregistrés, gardés au rechargement, affichés à la place de J1 à J5', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Pseudos' }).click();
  await page.getByRole('textbox', { name: /J2,/ }).fill('Greg');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('status')).toHaveText('Pseudos enregistrés');
  await page.reload();
  await views(page).getByRole('button', { name: 'Greg', exact: true }).click();
  await expect(brief(page).getByRole('heading', { level: 2 })).toHaveText(/Greg/);
  // Le rôle choisi est mémorisé : un lien sans paramètre rouvre J2.
  await page.goto('./');
  await expect(views(page).getByRole('button', { name: 'Greg', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test("un lien ouvre la même vue et les mêmes pseudos sur un autre appareil", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('./?s=d2-split-a&step=2&role=j2&n1=Alex&n2=Greg');
  await expect(brief(page)).toContainText('Étape 2 sur 4');
  await expect(brief(page).getByRole('heading', { level: 2 })).toHaveText(/Greg/);
  await expect(brief(page).locator('.chip').first()).toHaveText('Alex');
  // Avec des pseudos, plus de « J1 » ou « J2 » dans les consignes.
  await expect(brief(page)).not.toContainText('J1');
  await expect(brief(page)).not.toContainText('J2');
  await ctx.close();
});

test("aucun défilement horizontal", async ({ page }) => {
  for (const url of ['./', './?step=3&role=j5']) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});

test("l'image de la carte se charge", async ({ page }) => {
  const res = page.waitForResponse((r) => r.url().includes('maps/dust2.webp'));
  await page.goto('./');
  expect((await res).status()).toBe(200);
});
