import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Scan automatique WCAG 2.1 AA (environ 30 % des problèmes possibles, à compléter par des tests manuels).
for (const url of ['./?step=1&role=equipe', './?step=2&role=j2&n2=Greg', './?step=3&role=j1']) {
  test(`axe : aucune violation WCAG 2.1 AA sur ${url}`, async ({ page }) => {
    await page.goto(url);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.length} élément(s)`)).toEqual([]);
  });
}

test('axe : panneau pseudos ouvert', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Pseudos' }).click();
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});

test('clavier : Échap ferme le panneau pseudos et le focus revient au bouton', async ({ page, browserName }) => {
  await page.goto('./');
  const open = page.getByRole('button', { name: 'Pseudos' });
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(open).toBeFocused();
});

test('zones tactiles de 44 px minimum', async ({ page }) => {
  await page.goto('./?role=j2');
  const small = await page.$$eval('button, a, input', (els) =>
    els
      .filter((e) => e.offsetParent !== null && !e.classList.contains('skip'))
      .map((e) => ({ t: e.getAttribute('aria-label') || e.textContent.trim(), ...e.getBoundingClientRect().toJSON() }))
      .filter((r) => r.width < 44 || r.height < 36)
      .map((r) => `${r.t} ${Math.round(r.width)}x${Math.round(r.height)}`),
  );
  expect(small).toEqual([]);
});
