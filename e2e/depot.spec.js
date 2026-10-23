// Stratégies enregistrées dans GitHub (dépôt simulé) et accès éditeur protégé par mot de passe.
import { test, expect, asAdmin, TOKEN, shareLink, editTitle, seedLocal, persoFrom, SPLIT_A } from './helpers.js';

const title = (page) => page.locator('#strat-title');
const dialog = (page) => page.getByRole('dialog');
const status = (page) => page.getByRole('status');
const menu = (page) => page.getByRole('button', { name: 'Stratégies' });

test.describe('accès éditeur', () => {
  test('ami sans accès : aucune action d’édition, mot de passe demandé', async ({ page }) => {
    await page.goto('./');
    await menu(page).click();
    await expect(page.getByRole('button', { name: 'Nouvelle stratégie T' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Modifier cette stratégie' })).toBeHidden();
    await page.getByRole('button', { name: 'Modifier les stratégies' }).click();
    // Premier passage sur cet appareil : jeton GitHub + mot de passe.
    await expect(dialog(page)).toContainText('Configurer l’accès éditeur');
    await expect(page.getByLabel('Jeton GitHub')).toBeVisible();
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialog(page)).toBeHidden();
    // Un ami qui saisit un faux jeton est refusé.
    await menu(page).click();
    await page.getByRole('button', { name: 'Modifier les stratégies' }).click();
    await page.getByLabel('Jeton GitHub').fill('github_pat_faux');
    await page.getByLabel('Choisis un mot de passe (8 caractères au moins)').fill('motdepasse1');
    await page.getByLabel('Confirme le mot de passe').fill('motdepasse1');
    await page.getByRole('button', { name: 'Activer' }).click();
    await expect(page.locator('#admin-error')).toContainText('Jeton GitHub refusé');
  });

  test('configuration (jeton + mot de passe), puis mot de passe seul dans un nouvel onglet', async ({ page, context }) => {
    await page.goto('./');
    await menu(page).click();
    await page.getByRole('button', { name: 'Modifier les stratégies' }).click();
    await page.getByLabel('Jeton GitHub').fill(TOKEN);
    const choose = page.getByLabel('Choisis un mot de passe (8 caractères au moins)');
    await choose.fill('court');
    await page.getByLabel('Confirme le mot de passe').fill('court');
    await page.getByRole('button', { name: 'Activer' }).click();
    await expect(page.locator('#admin-error')).toHaveText('Mot de passe : 8 caractères au moins.');
    await choose.fill('motdepasse1');
    await page.getByLabel('Confirme le mot de passe').fill('motdepasse2');
    await page.getByRole('button', { name: 'Activer' }).click();
    await expect(page.locator('#admin-error')).toHaveText('Les deux mots de passe sont différents.');
    await page.getByLabel('Confirme le mot de passe').fill('motdepasse1');
    await page.getByRole('button', { name: 'Activer' }).click();
    await expect(status(page)).toHaveText('Accès éditeur activé sur cet appareil');
    // Le menu rouvert montre les actions d'édition.
    await expect(page.getByRole('button', { name: 'Nouvelle stratégie T' })).toBeVisible();
    // Le jeton n'est jamais gardé en clair dans le stockage local.
    const stored = await page.evaluate(() => JSON.stringify(localStorage));
    expect(stored).not.toContain(TOKEN);

    // Nouvel onglet : verrouillé, mot de passe seul.
    const tab = await context.newPage();
    await tab.goto('./');
    await menu(tab).click();
    await tab.getByRole('button', { name: 'Modifier les stratégies' }).click();
    await expect(dialog(tab)).toContainText('Accès éditeur');
    await expect(tab.getByLabel('Jeton GitHub')).toBeHidden();
    await tab.getByLabel('Mot de passe', { exact: true }).fill('mauvais-mdp');
    await tab.getByRole('button', { name: 'Déverrouiller' }).click();
    await expect(tab.locator('#admin-error')).toHaveText('Mot de passe incorrect.');
    await tab.getByLabel('Mot de passe', { exact: true }).fill('motdepasse1');
    await tab.getByRole('button', { name: 'Déverrouiller' }).click();
    await expect(status(tab)).toHaveText('Édition déverrouillée');
    // Verrouiller : les actions disparaissent.
    await tab.getByRole('button', { name: /Verrouiller l.édition/ }).click();
    await menu(tab).click();
    await expect(tab.getByRole('button', { name: 'Modifier les stratégies' })).toBeVisible();
  });

  test('« Créer une stratégie » sur un side vide demande aussi le mot de passe', async ({ page }) => {
    await page.goto('./?side=ct');
    await page.getByRole('button', { name: 'Créer une stratégie CT' }).click();
    await expect(dialog(page)).toContainText('Configurer l’accès éditeur');
  });
});

test.describe('publication dans GitHub', () => {
  test.beforeEach(async ({ context }) => {
    await asAdmin(context);
  });

  test('échec de publication : l’éditeur reste ouvert, on peut réessayer', async ({ page, github }) => {
    await page.goto('./');
    await menu(page).click();
    await page.getByRole('button', { name: 'Modifier cette stratégie' }).click();
    await page.getByLabel('Titre de la stratégie').fill('Split A v2');
    github.failNext(500);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(status(page)).toContainText('Erreur GitHub (500)');
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.getByLabel('Titre de la stratégie')).toHaveValue('Split A v2');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(title(page)).toHaveText('Split A v2');
    expect(github.commits).toHaveLength(1);
  });

  test('modifiée ailleurs entre-temps (autre appareil) : on demande avant de remplacer', async ({ page, github }) => {
    await page.goto('./');
    await menu(page).click();
    await page.getByRole('button', { name: 'Modifier cette stratégie' }).click();
    await page.getByLabel('Titre de la stratégie').fill('Version du téléphone');
    github.setFile('d2-split-a', { ...SPLIT_A, title: { text: 'Version de l’ordinateur', source: 'ajout' } });
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog(page)).toContainText('Modifiée ailleurs');
    await page.getByRole('button', { name: 'Revenir à l’éditeur' }).click();
    await expect(page.locator('#editor')).toBeVisible();
    expect(github.strategy('d2-split-a').title.text).toBe('Version de l’ordinateur');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByRole('button', { name: 'Publier ma version' }).click();
    await expect(title(page)).toHaveText('Version du téléphone');
    expect(github.strategy('d2-split-a').title.text).toBe('Version du téléphone');
  });

  test('jeton révoqué : message clair, édition verrouillée', async ({ page, context }) => {
    await context.addInitScript(() => sessionStorage.setItem('stratbook:acces-session', 'github_pat_revoque'));
    await page.goto('./');
    await menu(page).click();
    await page.getByRole('button', { name: 'Modifier cette stratégie' }).click();
    await page.getByLabel('Titre de la stratégie').fill('Split A v2');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(status(page)).toContainText('Jeton GitHub refusé');
    await expect(status(page)).toContainText('Reconfigure l’accès éditeur');
  });

  test('anciennes stratégies gardées sur le téléphone : publiées depuis le menu', async ({ page, github }) => {
    await seedLocal(page.context(), [persoFrom('d2-t-perso1', 'Rush B perso')]);
    await page.goto('./?s=d2-t-perso1');
    await expect(title(page)).toHaveText('Rush B perso');
    // Partager une stratégie qui n'est que sur ce téléphone : avertissement.
    await shareLink(page);
    await expect(status(page)).toContainText('n’est que sur ce téléphone');
    await menu(page).click();
    await expect(page.locator('#menu-list')).toContainText('Sur ce téléphone');
    await page.getByRole('button', { name: 'Publier les stratégies de ce téléphone (1)' }).click();
    await expect(status(page)).toHaveText('1 stratégie publiée sur 1');
    expect(github.strategy('d2-t-perso1').title.text).toBe('Rush B perso');
    await menu(page).click();
    await expect(page.locator('#menu-list')).not.toContainText('Sur ce téléphone');
    await expect(page.getByRole('button', { name: /Publier les stratégies/ })).toBeHidden();
  });
});

test.describe('lecture depuis GitHub', () => {
  test('stratégie modifiée dans GitHub après la mise en ligne du site : la version à jour s’affiche', async ({ page, github }) => {
    github.setFile('d2-split-a', { ...SPLIT_A, title: { text: 'Split A, version GitHub', source: 'ajout' } });
    await page.goto('./');
    await expect(title(page)).toHaveText('Split A, version GitHub');
    await expect(status(page)).toHaveText('Stratégie mise à jour');
    // Rechargée : version gardée en cache, aucun fichier relu.
    const reads = github.reads.length;
    await page.reload();
    await expect(title(page)).toHaveText('Split A, version GitHub');
    expect(github.reads.length).toBe(reads);
  });

  test('stratégie supprimée de GitHub : elle disparaît', async ({ page, github }) => {
    delete github.files['d2-split-a'];
    await page.goto('./');
    await expect(page.getByRole('button', { name: 'Créer une stratégie T' })).toBeVisible();
  });

  test('lien vers une stratégie publiée après la mise en ligne : lue dans GitHub', async ({ page, github }) => {
    github.setFile('d2-ct-new001', { ...persoFrom('d2-ct-new001', 'Retake A'), side: { text: 'CT', source: 'ajout' } });
    await page.goto('./?s=d2-ct-new001&step=2&role=j4');
    await expect(title(page)).toHaveText('Retake A');
    await expect(page.locator('#side')).toHaveText('CT');
    await expect(page.locator('#consignes')).toContainText('Étape 2 sur 4');
  });

  test('lien vers une stratégie inconnue : message clair', async ({ page }) => {
    await page.goto('./?s=d2-t-abc123&step=2&role=j1');
    await expect(status(page)).toContainText('Stratégie introuvable');
    await expect(title(page)).toHaveText('Split A, 3 Long + 2 Short');
  });

  test('GitHub injoignable : la version livrée avec le site s’affiche', async ({ page, context }) => {
    await context.route('https://api.github.com/**', (route) => route.abort());
    await page.goto('./');
    await expect(title(page)).toHaveText('Split A, 3 Long + 2 Short');
  });

  test('lien partagé : court et lisible (stratégie / étape / vue, pseudos)', async ({ page, baseURL }) => {
    await page.goto('./?step=3&role=j2&n1=Greg&n2=Zoé');
    const link = await shareLink(page);
    expect(link).toBe(`${baseURL}d2-split-a/etape-3/j2?pseudos=Greg,Zoé`);
  });
});

test.describe('récap', () => {
  test('un tracé d’un seul tenant par joueur', async ({ page }) => {
    await page.goto('./?step=recap&role=equipe');
    const perRole = await page.locator('#map .moves .move').evaluateAll((els) => els.map((e) => e.dataset.role).sort());
    expect(perRole).toEqual(['j1', 'j2', 'j3', 'j4', 'j5']);
    // Contours sombres sous les traits de couleur.
    const order = await page.locator('#map svg > g').evaluateAll((els) => els.map((e) => e.getAttribute('class')));
    expect(order.indexOf('move-casings')).toBeLessThan(order.indexOf('moves'));
  });
});

test("écran d'accueil : manifeste et icônes servis", async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifestUrl = new URL(href, page.url()).toString();
  const manifest = await (await request.get(manifestUrl)).json();
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) expect((await request.get(new URL(icon.src, manifestUrl).toString())).status(), icon.src).toBe(200);
});

test.describe('pseudos de l’équipe dans GitHub', () => {
  test('ami : les pseudos de GitHub s’affichent, le bouton Pseudos demande le mot de passe', async ({ page, github }) => {
    github.setTeam(['Splat', 'Dark', 'Silent', 'JP', 'Rod']);
    await page.goto('./?step=2&role=j2');
    await expect(page.locator('#consignes .b-title')).toHaveText('Dark');
    await expect(page.locator('[data-view="j5"]')).toContainText('Rod');
    await page.getByRole('button', { name: 'Pseudos' }).click();
    await expect(dialog(page)).toContainText('Configurer l’accès éditeur');
  });

  test('pseudos de GitHub : ils priment sur ceux du lien et de l’appareil, et ne sont plus dans le lien', async ({ page, github, baseURL }) => {
    github.setTeam(['Splat', 'Dark', '', '', '']);
    await page.addInitScript(() => localStorage.setItem('stratbook:pseudos', JSON.stringify(['Moi', '', '', '', ''])));
    await page.goto('./d2-split-a/etape-1/j1?pseudos=Alex');
    await expect(page.locator('#consignes .b-title')).toHaveText('Splat');
    const link = await shareLink(page);
    expect(link).toBe(`${baseURL}d2-split-a/etape-1/j1`);
  });

  test('pseudos modifiés dans GitHub (sur un autre appareil) : mis à jour à l’ouverture', async ({ page, github }) => {
    github.setTeam(['Splat', 'Dark', '', '', '']);
    await page.goto('./?step=1&role=j1');
    await expect(page.locator('#consignes .b-title')).toHaveText('Splat');
    github.setTeam(['Ace', 'Dark', '', '', '']);
    await page.reload();
    await expect(page.locator('#consignes .b-title')).toHaveText('Ace');
  });

  test('modification par Greg : fichier changé ailleurs entre-temps, enregistré quand même ; échec affiché', async ({ page, context, github }) => {
    await asAdmin(context);
    github.setTeam(['Splat', '', '', '', '']);
    await page.goto('./?step=1&role=j1');
    await expect(page.locator('#consignes .b-title')).toHaveText('Splat');
    github.setTeam(['Autre', '', '', '', '']); // modifié ailleurs, empreinte connue ici périmée
    await page.getByRole('button', { name: 'Pseudos' }).click();
    await page.locator('#nick-j1').fill('Ace');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(status(page)).toHaveText('Pseudos enregistrés dans GitHub, pour toute l’équipe');
    expect(github.team().pseudos[0]).toBe('Ace');
    await expect(page.locator('#consignes .b-title')).toHaveText('Ace');
    // Échec (GitHub en panne) : message dans la fenêtre, qui reste ouverte.
    await page.getByRole('button', { name: 'Pseudos' }).click();
    await page.locator('#nick-j1').fill('Zed');
    github.failNext(500);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('#nicks-error')).toContainText('Erreur GitHub (500)');
    await expect(dialog(page)).toBeVisible();
    expect(github.team().pseudos[0]).toBe('Ace');
  });

  test('fichier des pseudos absent du dépôt : créé au premier enregistrement', async ({ page, context, github }) => {
    await asAdmin(context);
    github.setTeam(null);
    await page.goto('./');
    await page.getByRole('button', { name: 'Pseudos' }).click();
    await page.locator('#nick-j3').fill('Silent');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(status(page)).toHaveText('Pseudos enregistrés dans GitHub, pour toute l’équipe');
    expect(github.team().pseudos).toEqual(['', '', 'Silent', '', '']);
  });
});
