import { test, expect } from '@playwright/test';

const steps = (page) => page.getByRole('navigation', { name: 'Étapes de la stratégie' });
const svg = (page) => page.locator('#map svg');
const j2 = (page) => page.locator('#map .player[data-role="j2"]');

// Positions de J2 dans les données (étape 1 et étape 4).
const J2_STEP1 = 'translate(872 350)';
const J2_STEP4 = 'translate(750 198)';

test('saut 1 → 4 : les joueurs se déplacent puis arrivent à la position de l\'étape 4', async ({ page }) => {
  await page.goto('./?step=1&role=equipe');
  await steps(page).getByRole('button', { name: /^Étape 4/ }).click();
  await expect(svg(page)).toHaveClass(/is-moving/);
  await expect(svg(page)).not.toHaveClass(/is-moving/, { timeout: 5000 });
  await expect(j2(page)).toHaveAttribute('transform', J2_STEP4);
});

test('retour 4 → 1 : trajet à l\'envers jusqu\'à la position de l\'étape 1', async ({ page }) => {
  await page.goto('./?step=4&role=equipe');
  await steps(page).getByRole('button', { name: /^Étape 1/ }).click();
  await expect(svg(page)).toHaveClass(/is-moving/);
  await expect(svg(page)).not.toHaveClass(/is-moving/, { timeout: 5000 });
  await expect(j2(page)).toHaveAttribute('transform', J2_STEP1);
});

test('pendant le déplacement, J2 passe par des positions intermédiaires', async ({ page }) => {
  await page.goto('./?step=1&role=j2');
  await steps(page).getByRole('button', { name: 'Étape suivante' }).click();
  const seen = new Set();
  for (let i = 0; i < 10; i++) {
    seen.add(await j2(page).getAttribute('transform'));
    await page.waitForTimeout(60);
  }
  expect(seen.size).toBeGreaterThan(2);
});

test('mouvement réduit : changement d\'étape immédiat, sans animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?step=1&role=equipe');
  await steps(page).getByRole('button', { name: /^Étape 4/ }).click();
  await expect(svg(page)).not.toHaveClass(/is-moving/);
  await expect(j2(page)).toHaveAttribute('transform', J2_STEP4);
});

test('Lecture : rejoue toute la stratégie puis s\'arrête à la dernière étape', async ({ page }) => {
  await page.goto('./?step=2&role=j2');
  const play = page.getByRole('button', { name: 'Lecture' });
  await play.click();
  await expect(page.locator('#play')).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/step=1/);
  await expect(page).toHaveURL(/step=4/, { timeout: 15000 });
  await expect(page.locator('#play')).toHaveAttribute('aria-pressed', 'false', { timeout: 5000 });
  await expect(j2(page)).toHaveAttribute('transform', J2_STEP4);
});

test('Lecture : une action de l\'utilisateur arrête la lecture', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Lecture' }).click();
  await page.getByRole('button', { name: 'Arrêter' }).waitFor();
  await page.getByRole('navigation', { name: 'Choix de la vue' }).getByRole('button', { name: 'J3' }).click();
  await expect(page.locator('#play')).toHaveAttribute('aria-pressed', 'false');
});
