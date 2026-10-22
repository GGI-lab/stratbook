// Échanges de stratégies entre téléphones : liens (versions qui se croisent, liens courts),
// fichiers (sauvegarde, import), installation sur l'écran d'accueil.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { skipInstallPrompt, shareLink, captureShare, editTitle, seedLocal, persoFrom } from './helpers.js';

const title = (page) => page.locator('#strat-title');
const dialog = (page) => page.getByRole('dialog');
const status = (page) => page.getByRole('status');

test.describe('versions qui se croisent', () => {
  test.beforeEach(async ({ context }) => {
    await skipInstallPrompt(context);
  });

  test('un ancien lien ne remplace plus en silence une version plus récente', async ({ page }) => {
    await page.goto('./');
    await editTitle(page, 'Split A v1');
    const linkV1 = await shareLink(page);
    await editTitle(page, 'Split A v2');

    // Rouvrir l'ancien lien : on demande, et la version du téléphone est dite plus récente.
    await page.goto(linkV1);
    await expect(dialog(page)).toContainText('Tu as déjà cette stratégie');
    await expect(dialog(page)).toContainText('Ta version');
    await expect(dialog(page)).toContainText('(plus récente)');
    await page.getByRole('button', { name: 'Garder la mienne' }).click();
    await expect(title(page)).toHaveText('Split A v2');
    await expect(status(page)).toHaveText('Ta version est gardée');

    // Garder les deux : la version reçue arrive sous un autre nom, la sienne ne bouge pas.
    await page.goto(linkV1);
    await page.getByRole('button', { name: 'Garder les deux' }).click();
    await expect(title(page)).toHaveText('Split A v1 (reçue)');
    await page.getByRole('button', { name: 'Stratégies' }).click();
    await expect(page.locator('#menu-list')).toContainText('Split A v2');
    await expect(page.locator('#menu-list')).toContainText('Split A v1 (reçue)');
    await page.keyboard.press('Escape');

    // Remplacer : la version reçue prend la place de la sienne.
    await page.goto(linkV1);
    await page.getByRole('button', { name: 'Remplacer la mienne' }).click();
    await expect(title(page)).toHaveText('Split A v1');
  });

  test('Échap sur la question garde sa version', async ({ page }) => {
    await page.goto('./');
    await editTitle(page, 'Split A v1');
    const linkV1 = await shareLink(page);
    await editTitle(page, 'Split A v2');
    await page.goto(linkV1);
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(title(page)).toHaveText('Split A v2');
  });

  test("chez l'ami : une version reçue plus récente remplace sans question, sauf s'il l'a modifiée", async ({ page, browser }) => {
    await page.goto('./');
    await editTitle(page, 'Split A v1');
    const linkV1 = await shareLink(page);
    await editTitle(page, 'Split A v2');
    const linkV2 = await shareLink(page);

    const ctx = await browser.newContext({ locale: 'fr-FR' });
    await skipInstallPrompt(ctx);
    const friend = await ctx.newPage();
    await friend.goto(linkV1);
    await expect(title(friend)).toHaveText('Split A v1');
    await expect(status(friend)).toHaveText('Stratégie « Split A v1 » mise à jour');
    // Version suivante de Greg : l'ami n'a rien changé, elle remplace la précédente.
    await friend.goto(linkV2);
    await expect(title(friend)).toHaveText('Split A v2');
    await expect(status(friend)).toHaveText('Stratégie « Split A v2 » mise à jour');
    await expect(dialog(friend)).toBeHidden();
    // L'ami la modifie à son tour : un nouveau lien de Greg ne l'écrase plus.
    await editTitle(friend, 'Split A, version de l’ami');
    await friend.goto(linkV2);
    await expect(dialog(friend)).toContainText('Tu as déjà cette stratégie');
    await friend.getByRole('button', { name: 'Garder la mienne' }).click();
    await expect(title(friend)).toHaveText('Split A, version de l’ami');
    await ctx.close();
  });
});

test.describe('liens de partage', () => {
  test.beforeEach(async ({ context }) => {
    await skipInstallPrompt(context);
  });

  test('stratégie du dépôt modifiée : lien court (seulement les changements)', async ({ page, browser }) => {
    await page.goto('./?step=2&role=j2');
    await page.getByRole('button', { name: 'Stratégies' }).click();
    await page.getByRole('button', { name: 'Modifier cette stratégie' }).click();
    await page.getByRole('button', { name: 'Étape 2', exact: true }).click();
    await page.locator('#ed-m-j2').fill('Smoke CT puis attends le go');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    const link = await shareLink(page);
    expect(link.length).toBeLessThan(700); // environ 2 600 caractères avec la stratégie entière

    const ctx = await browser.newContext({ locale: 'fr-FR' });
    const friend = await ctx.newPage();
    await friend.goto(link);
    await expect(friend.locator('#consignes')).toContainText('Smoke CT puis attends le go');
    await expect(friend.locator('#consignes')).toContainText('Étape 2 sur 4');
    await ctx.close();
  });

  test('lien de plus de 2 000 caractères : on prévient et on propose le fichier', async ({ page }, testInfo) => {
    // Stratégie perso avec beaucoup de texte : le lien dépasse la limite de Discord.
    const long = persoFrom('d2-t-longue', 'Exécute longue', (s) => {
      s.steps.forEach((st, i) =>
        ['j1', 'j2', 'j3', 'j4', 'j5'].forEach((r, k) =>
          st.roles[r].push({ text: `Consigne ${i}-${k} : ${'abcdefghijklmnopqrstuvwxyz'.split('').sort(() => Math.sin(i * 7 + k * 3) - 0.1).join('')} ${i * 97 + k * 31}`, source: 'ajout' }),
        ),
      );
      return s;
    });
    await seedLocal(page.context(), [long]);
    await page.goto('./?s=d2-t-longue&step=1&role=equipe');
    await expect(title(page)).toHaveText('Exécute longue');
    await captureShare(page);

    await page.getByRole('button', { name: 'Partager' }).click();
    await expect(dialog(page)).toContainText('Lien trop long pour Discord');
    await expect(dialog(page)).toContainText('2 000 caractères');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Envoyer le fichier' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('d2-t-longue.json');
    const saved = JSON.parse(readFileSync(await file.path(), 'utf8'));
    expect(saved.title.text).toBe('Exécute longue');

    // Partager quand même : le lien long est copié.
    await page.getByRole('button', { name: 'Partager' }).click();
    await page.getByRole('button', { name: 'Partager le lien quand même' }).click();
    await expect(status(page)).toHaveText('Lien copié');
    const link = await page.evaluate(() => window.__copied);
    expect(link.length).toBeGreaterThan(2000);
    testInfo.annotations.push({ type: 'longueur', description: String(link.length) });
  });

  test("adresse copiée à la main d'une stratégie perso : message clair", async ({ page }) => {
    await page.goto('./?s=d2-t-abc123&step=2&role=j1');
    await expect(status(page)).toContainText('Stratégie introuvable sur ce téléphone');
    await expect(title(page)).toHaveText('Split A, 3 Long + 2 Short');
  });
});

test.describe('sauvegarde et import', () => {
  test.beforeEach(async ({ context }) => {
    await skipInstallPrompt(context);
  });

  test('sauvegarder toutes ses stratégies, puis les importer sur un autre téléphone', async ({ page, browser }) => {
    await seedLocal(page.context(), [persoFrom('d2-t-rusha', 'Rush A'), persoFrom('d2-t-fakeb', 'Fake B')]);
    await page.goto('./');
    await captureShare(page); // pas de menu de partage natif : téléchargement
    await page.getByRole('button', { name: 'Stratégies' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Sauvegarder toutes mes stratégies' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^stratbook-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await file.path();
    const backup = JSON.parse(readFileSync(path, 'utf8'));
    expect(backup.strategies.map((s) => s.title.text).sort()).toEqual(['Fake B', 'Rush A']);

    const ctx = await browser.newContext({ locale: 'fr-FR' });
    await skipInstallPrompt(ctx);
    const other = await ctx.newPage();
    await other.goto('./');
    await other.getByRole('button', { name: 'Stratégies' }).click();
    // Pas de stratégie perso : rien à sauvegarder.
    await expect(other.getByRole('button', { name: 'Sauvegarder toutes mes stratégies' })).toBeHidden();
    const chooser = other.waitForEvent('filechooser');
    await other.getByRole('button', { name: 'Importer un fichier' }).click();
    await (await chooser).setFiles(path);
    await expect(status(other)).toHaveText('2 stratégies lues, 2 ajoutées ou mises à jour');
    await other.getByRole('button', { name: 'Stratégies' }).click();
    await expect(other.locator('#menu-list')).toContainText('Rush A');
    await expect(other.locator('#menu-list')).toContainText('Fake B');
    // Gardées après rechargement.
    await other.reload();
    await other.getByRole('button', { name: 'Stratégies' }).click();
    await expect(other.locator('#menu-list')).toContainText('Rush A');
    await ctx.close();
  });

  test('importer un fichier illisible : message', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Stratégies' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Importer un fichier' }).click();
    await (await chooser).setFiles({ name: 'vide.json', mimeType: 'application/json', buffer: Buffer.from('{"rien": true}') });
    await expect(status(page)).toHaveText('Fichier illisible : aucune stratégie trouvée');
  });
});

test.describe("écran d'accueil", () => {
  test('manifeste et icônes servis', async ({ page, request }) => {
    await page.goto('./');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await request.get(new URL(href, page.url()).toString())).json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./');
    for (const icon of manifest.icons) {
      const res = await request.get(new URL(icon.src, new URL(href, page.url())).toString());
      expect(res.status(), icon.src).toBe(200);
    }
    const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect((await request.get(new URL(apple, page.url()).toString())).status()).toBe(200);
  });

  test("après le premier enregistrement d'une stratégie perso, invitation à l'installer (téléphone)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.startsWith('desktop'), 'Proposé seulement sur téléphone');
    await page.goto('./');
    await page.getByRole('button', { name: 'Stratégies' }).click();
    await page.getByRole('button', { name: 'Nouvelle stratégie T' }).click();
    await page.getByLabel('Titre de la stratégie').fill('Ma strat');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog(page)).toContainText('Garde tes stratégies');
    if (testInfo.project.name.startsWith('iphone')) {
      await expect(dialog(page)).toContainText('Sur l’écran d’accueil');
      await expect(dialog(page)).toContainText('Safari efface');
      // Sur iPhone, l'app installée ne voit pas les données de Safari : on propose la sauvegarde.
      await expect(page.getByRole('button', { name: 'Sauvegarder mes stratégies' })).toBeVisible();
    } else await expect(dialog(page)).toContainText('Installer l’application');
    await page.getByRole('button', { name: 'Plus tard' }).click();
    await expect(dialog(page)).toBeHidden();
    // Une seule fois automatiquement ; ensuite depuis le menu.
    await page.getByRole('button', { name: 'Stratégies' }).click();
    await page.getByRole('button', { name: 'Modifier cette stratégie' }).click();
    await page.getByLabel('Titre de la stratégie').fill('Ma strat 2');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(title(page)).toHaveText('Ma strat 2');
    await expect(dialog(page)).toBeHidden();
    await page.getByRole('button', { name: 'Stratégies' }).click();
    await page.getByRole('button', { name: "Ajouter à l'écran d'accueil" }).click();
    await expect(dialog(page)).toContainText('Garde tes stratégies');
  });
});
