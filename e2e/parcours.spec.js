import { test, expect, asAdmin } from './helpers.js';

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
  // Adresse lisible : stratégie / étape / vue.
  await expect(page).toHaveURL(/\/stratbook\/d2-split-a\/etape-3\/j2$/);

  // Pas de partage natif en test : on vérifie la copie du lien en repli.
  await page.evaluate(() => {
    delete Navigator.prototype.share;
    window.__copied = null;
    navigator.clipboard.writeText = async (t) => { window.__copied = t; };
  });
  await page.getByRole('button', { name: 'Partager' }).click();
  await expect(page.getByRole('status')).toHaveText('Lien copié');
  const copied = await page.evaluate(() => window.__copied);
  expect(new URL(copied).pathname).toBe('/stratbook/d2-split-a/etape-3/j2');
});

test("les boutons vont de l'étape 1 au récap, sans dépasser", async ({ page }) => {
  await page.goto('./?step=1');
  await expect(steps(page).getByRole('button', { name: 'Étape précédente' })).toBeDisabled();
  for (let i = 0; i < 3; i++) await steps(page).getByRole('button', { name: 'Étape suivante' }).click();
  await expect(brief(page)).toContainText('Étape 4 sur 4');
  await steps(page).getByRole('button', { name: 'Étape suivante' }).click();
  await expect(brief(page)).toContainText('Récap · 4 étapes');
  await expect(page).toHaveURL(/\/d2-split-a\/recap\/equipe$/);
  await expect(steps(page).getByRole('button', { name: 'Étape suivante' })).toBeDisabled();
});

test('récap équipe : toute la stratégie, puis un joueur ouvre sa vue', async ({ page }) => {
  await page.goto('./?step=1&role=equipe');
  await steps(page).getByRole('button', { name: 'Récap de la stratégie' }).click();
  await expect(steps(page).getByRole('button', { name: 'Récap de la stratégie' })).toHaveAttribute('aria-current', 'step');
  await expect(brief(page).getByRole('heading', { level: 2 })).toHaveText('Split A, 3 Long + 2 Short');
  for (const t of ['Prendre Long et Mid', 'Préparer la convergence', 'Entrer sur A et planter', 'Sécuriser après la pose'])
    await expect(brief(page)).toContainText(t);
  await expect(brief(page)).toContainText('« Long go »');
  await expect(brief(page)).toContainText('Smoke Xbox');
  // Tous les trajets sont tracés sur la carte : un tracé d'un seul tenant par joueur.
  expect(await page.locator('#map .move').count()).toBe(5);
  await brief(page).locator('[data-goto-view="j2"]').click();
  await expect(views(page).getByRole('button', { name: 'J2' })).toHaveAttribute('aria-pressed', 'true');
  await expect(brief(page)).toContainText('Tes missions');
  await expect(brief(page)).toContainText('Smoke CT.');
  await expect(brief(page)).toContainText('Plante la bombe.');
});

test('récap : un lien step=recap rouvre le récap', async ({ page }) => {
  await page.goto('./?s=d2-split-a&step=recap&role=j4');
  await expect(brief(page)).toContainText('Récap · 4 étapes');
  await expect(brief(page)).toContainText('Tes missions');
  await steps(page).getByRole('button', { name: 'Étape précédente' }).click();
  await expect(brief(page)).toContainText('Étape 4 sur 4');
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

test('pseudos : enregistrés dans GitHub, gardés au rechargement, affichés à la place de J1 à J5', async ({ page, context, github }) => {
  await asAdmin(context);
  await page.goto('./');
  await page.getByRole('button', { name: 'Pseudos' }).click();
  await page.getByRole('textbox', { name: /J2,/ }).fill('Greg');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('status')).toHaveText('Pseudos enregistrés dans GitHub, pour toute l’équipe');
  expect(github.team().pseudos).toEqual(['', 'Greg', '', '', '']);
  expect(github.commits.at(-1)).toMatchObject({ id: 'equipe', message: 'Pseudos de l’équipe modifiés depuis l’application' });
  await page.reload();
  await views(page).getByRole('button', { name: 'Greg', exact: true }).click();
  await expect(brief(page).getByRole('heading', { level: 2 })).toHaveText(/Greg/);
  // Le rôle choisi est mémorisé : un lien sans paramètre rouvre J2.
  await page.goto('./');
  await expect(views(page).getByRole('button', { name: 'Greg', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test("un lien ouvre la même vue et les mêmes pseudos sur un autre appareil", async ({ browser, github }) => {
  const ctx = await browser.newContext();
  await github.attach(ctx);
  const page = await ctx.newPage();
  await page.goto('./d2-split-a/etape-2/j2?pseudos=Alex,Greg');
  await expect(brief(page)).toContainText('Étape 2 sur 4');
  await expect(brief(page).getByRole('heading', { level: 2 })).toHaveText(/Greg/);
  await expect(brief(page).locator('.chip').first()).toHaveText('Alex');
  // Avec des pseudos, plus de « J1 » ou « J2 » dans les consignes.
  await expect(brief(page)).not.toContainText('J1');
  await expect(brief(page)).not.toContainText('J2');
  await ctx.close();
});

test("aucun défilement horizontal", async ({ page }) => {
  for (const url of ['./', './?step=3&role=j5', './?step=recap&role=equipe', './?step=recap&role=j2']) {
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

test('lien lisible : ouvert directement, rechargé, et anciens liens réécrits', async ({ page, request, baseURL }) => {
  await page.goto('./d2-split-a/recap/j4?pseudos=Greg,,,Max');
  await expect(brief(page)).toContainText('Récap · 4 étapes');
  await expect(brief(page).getByRole('heading', { level: 2 })).toHaveText('Max');
  await page.reload();
  await expect(brief(page)).toContainText('Récap · 4 étapes');
  // Fond de carte et styles chargés depuis une adresse à plusieurs niveaux.
  expect(await page.locator('#map svg image').getAttribute('href')).toBe('/stratbook/maps/dust2.webp');
  // Ancien lien : la vue s'ouvre et l'adresse prend la forme lisible.
  await page.goto('./?s=d2-split-a&step=2&role=j3');
  await expect(brief(page)).toContainText('Étape 2 sur 4');
  await expect(page).toHaveURL(/\/stratbook\/d2-split-a\/etape-2\/j3/);
  // GitHub Pages : les adresses lisibles sont servies par 404.html, copie de l'application.
  const page404 = await request.get(`${baseURL}404.html`);
  expect(page404.status()).toBe(200);
  expect(await page404.text()).toBe(await (await request.get(baseURL)).text());
});

test('bouton Équipe sélectionné : contour intérieur blanc comme les joueurs, sans fond blanc', async ({ page }) => {
  await page.goto('./?step=1&role=equipe');
  const team = views(page).getByRole('button', { name: 'Équipe' });
  await expect(team).toHaveAttribute('aria-pressed', 'true');
  const style = (loc) => loc.evaluate((e) => {
    const c = getComputedStyle(e);
    return { bg: c.backgroundColor, border: c.borderTopColor, shadow: c.boxShadow };
  });
  const t = await style(team);
  expect(t.bg).toBe('rgb(30, 42, 54)'); // même fond que J1 sélectionné (--surface-2)
  expect(t.border).toBe('rgb(232, 238, 244)'); // blanc (--text)
  expect(t.shadow).toContain('rgb(232, 238, 244)');
  expect(t.shadow).toContain('inset');
  // Même construction que J1 sélectionné, seule la couleur change.
  await views(page).getByRole('button', { name: 'J1' }).click();
  const j1 = await style(views(page).getByRole('button', { name: 'J1' }));
  expect(j1.bg).toBe(t.bg);
  expect(j1.shadow.replace(/rgb\([^)]*\)/, 'C')).toBe(t.shadow.replace(/rgb\([^)]*\)/, 'C'));
});
