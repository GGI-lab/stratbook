import { test, expect, asAdmin } from './helpers.js';

// Gestes tactiles simulés par des événements pointeur (deux doigts).
async function touch(page, type, id, x, y) {
  await page.locator('#map').dispatchEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, isPrimary: id === 1, bubbles: true });
}
const viewBox = (page) => page.locator('#map svg').getAttribute('viewBox');

test('pincer zoome la carte, glisser la déplace, double toucher revient à la vue entière', async ({ page }) => {
  await page.goto('./?step=2&role=equipe');
  const base = await viewBox(page);
  const box = await page.locator('#map svg').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Pincement : les doigts s'écartent de 40 à 160 px.
  await touch(page, 'pointerdown', 1, cx - 20, cy);
  await touch(page, 'pointerdown', 2, cx + 20, cy);
  await touch(page, 'pointermove', 1, cx - 80, cy);
  await touch(page, 'pointermove', 2, cx + 80, cy);
  await touch(page, 'pointerup', 1, cx - 80, cy);
  await touch(page, 'pointerup', 2, cx + 80, cy);
  const zoomed = await viewBox(page);
  expect(Number(zoomed.split(' ')[2])).toBeLessThan(Number(base.split(' ')[2]) / 2);
  await expect(page.locator('#map')).toHaveAttribute('data-zoomed', 'true');

  // Glisser à un doigt déplace la vue.
  await touch(page, 'pointerdown', 3, cx, cy);
  await touch(page, 'pointermove', 3, cx + 60, cy + 40);
  await touch(page, 'pointerup', 3, cx + 60, cy + 40);
  expect(await viewBox(page)).not.toBe(zoomed);

  // Le zoom est conservé en changeant d'étape.
  await page.getByRole('button', { name: 'Étape suivante' }).click();
  await expect(page.locator('#map svg')).not.toHaveAttribute('viewBox', base);

  // Double toucher : retour à la vue entière.
  for (const id of [4, 5]) {
    await touch(page, 'pointerdown', id, cx, cy);
    await touch(page, 'pointerup', id, cx, cy);
  }
  await expect(page.locator('#map svg')).toHaveAttribute('viewBox', base);
});

test('pas de bouton de zoom à l\'écran', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: /zoom/i })).toHaveCount(0);
});
