// Outils partagés par les tests de parcours.
// Tous les tests utilisent `test` exporté ici : l'API GitHub y est simulée (aucun appel au vrai dépôt).
import { test as base, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

export { expect };
export const TOKEN = 'github_pat_test';

// Données figées (tests/fixtures) : le site des tests de parcours est construit avec elles (vite build --mode e2e).
const DIR = new URL('../tests/fixtures/strategies/', import.meta.url);
const gitSha = (text) => {
  const body = Buffer.from(text, 'utf8');
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest('hex');
};

/**
 * Faux dépôt GitHub (dossier strategies/), partagé par les pages d'un test.
 * files : { id: texte } ; commits : liste des écritures { method, id, message }.
 * failNext(status) : la prochaine écriture échoue avec ce statut.
 */
export function createFakeRepo() {
  const files = Object.fromEntries(readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => [f.slice(0, -5), readFileSync(new URL(f, DIR), 'utf8')]));
  // Pseudos de l'équipe (data/equipe.json) ; null = fichier absent.
  let teamText = readFileSync(new URL('../tests/fixtures/data/equipe.json', import.meta.url), 'utf8');
  const commits = [];
  const reads = [];
  let failure = null;
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const auth = req.headers().authorization;
    const authed = auth === `Bearer ${TOKEN}`;
    if (auth && !authed) return json(route, 401, { message: 'Bad credentials' });
    // Fichier des pseudos de l'équipe.
    if (url.pathname === '/repos/GGI-lab/stratbook/contents/data/equipe.json') {
      if (method === 'GET') {
        if (teamText === null) return json(route, 404, { message: 'Not Found' });
        return json(route, 200, { content: Buffer.from(teamText, 'utf8').toString('base64'), sha: gitSha(teamText) });
      }
      if (!authed) return json(route, 401, { message: 'Requires authentication' });
      if (failure) {
        const status = failure;
        failure = null;
        return json(route, status, { message: 'Erreur simulée' });
      }
      const body = req.postDataJSON();
      const current = teamText === null ? null : gitSha(teamText);
      if (current && body.sha !== current) return json(route, body.sha ? 409 : 422, { message: 'sha mismatch' });
      teamText = Buffer.from(body.content, 'base64').toString('utf8');
      commits.push({ method, id: 'equipe', message: body.message });
      return json(route, 200, { content: { sha: gitSha(teamText) } });
    }
    const m = url.pathname.match(/^\/repos\/GGI-lab\/stratbook(?:\/contents\/strategies(?:\/([a-z0-9-]+)\.json)?)?$/);
    if (!m) return json(route, 404, { message: 'Not Found' });
    const id = m[1];
    if (!url.pathname.includes('/contents')) return json(route, 200, { permissions: { push: authed, pull: true } });
    if (method === 'GET' && !id) return json(route, 200, Object.entries(files).map(([k, t]) => ({ type: 'file', name: `${k}.json`, sha: gitSha(t) })));
    if (method === 'GET') {
      reads.push(id);
      if (!(id in files)) return json(route, 404, { message: 'Not Found' });
      return json(route, 200, { content: Buffer.from(files[id], 'utf8').toString('base64'), sha: gitSha(files[id]) });
    }
    if (!authed) return json(route, 401, { message: 'Requires authentication' });
    if (failure) {
      const status = failure;
      failure = null;
      return json(route, status, { message: 'Erreur simulée' });
    }
    const body = req.postDataJSON();
    const current = id in files ? gitSha(files[id]) : null;
    if (method === 'PUT') {
      if (current && body.sha !== current) return json(route, current && !body.sha ? 422 : 409, { message: 'sha mismatch' });
      files[id] = Buffer.from(body.content, 'base64').toString('utf8');
      commits.push({ method, id, message: body.message });
      return json(route, current ? 200 : 201, { content: { sha: gitSha(files[id]) } });
    }
    if (method === 'DELETE') {
      if (!current) return json(route, 404, { message: 'Not Found' });
      if (body.sha !== current) return json(route, 409, { message: 'sha mismatch' });
      delete files[id];
      commits.push({ method, id, message: body.message });
      return json(route, 200, {});
    }
    return json(route, 405, {});
  }
  return {
    files,
    commits,
    reads,
    failNext: (status) => (failure = status),
    /** Change un fichier « ailleurs » (autre appareil, ou commit direct). */
    setFile: (id, strategy) => (files[id] = `${JSON.stringify(strategy, null, 2)}\n`),
    strategy: (id) => (id in files ? JSON.parse(files[id]) : null),
    /** Pseudos enregistrés dans le dépôt (null si le fichier est absent). */
    team: () => (teamText === null ? null : JSON.parse(teamText)),
    setTeam: (pseudos) => (teamText = pseudos === null ? null : `${JSON.stringify({ pseudos }, null, 2)}\n`),
    attach: (context) => context.route('https://api.github.com/**', handle),
  };
}

/** `test` avec le faux dépôt GitHub branché sur le contexte du navigateur (fixture `github`). */
export const test = base.extend({
  github: async ({}, use) => {
    await use(createFakeRepo());
  },
  context: async ({ context, github }, use) => {
    await github.attach(context);
    await use(context);
  },
});

/** Accès éditeur déjà déverrouillé (session de l'onglet), sans passer par le mot de passe. */
export async function asAdmin(context) {
  await context.addInitScript((token) => {
    try {
      sessionStorage.setItem('stratbook:acces-session', token);
    } catch {
      /* rien */
    }
  }, TOKEN);
}

export const SPLIT_A = JSON.parse(readFileSync(new URL('../tests/fixtures/strategies/d2-split-a.json', import.meta.url), 'utf8'));

/** Coordonnées écran d'un point de la carte (pixels de l'image) dans le SVG `selector`. */
export async function toScreen(page, selector, point) {
  return page.locator(`${selector} svg`).evaluate((s, [x, y]) => {
    const p = new DOMPoint(x, y).matrixTransform(s.getScreenCTM());
    return [p.x, p.y];
  }, point);
}

const touch = (x, y, id = 7) => ({ pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, button: 0 });

/** Glisse un élément de la carte de l'éditeur (départ en coordonnées écran) vers un point de la carte. */
async function dragFrom(page, target, from, to) {
  const dest = await toScreen(page, '#ed-map', to);
  await target.dispatchEvent('pointerdown', touch(...from));
  for (let k = 1; k <= 5; k++) {
    const x = from[0] + ((dest[0] - from[0]) * k) / 5;
    const y = from[1] + ((dest[1] - from[1]) * k) / 5;
    await page.locator('#ed-map').dispatchEvent('pointermove', touch(x, y));
  }
  await page.locator('#ed-map').dispatchEvent('pointerup', touch(...dest));
}

// Glisse un jeton de l'éditeur vers un point de la carte (pixels de l'image).
// Les événements pointeur sont envoyés comme un doigt (touch) sur iPhone et Android, souris sur ordinateur.
export async function dragToken(page, role, to) {
  await page.locator('#ed-map').scrollIntoViewIfNeeded();
  const hit = page.locator(`#ed-map .ed-hit[data-role="${role}"]`);
  const from = await hit.evaluate((g) => {
    const s = g.ownerSVGElement;
    const p = new DOMPoint(+g.getAttribute('cx'), +g.getAttribute('cy')).matrixTransform(s.getScreenCTM());
    return [p.x, p.y];
  });
  await dragFrom(page, hit, from, to);
}

/** Glisse le losange du point de passage (joueur choisi) vers un point de la carte. */
export async function dragVia(page, to) {
  const handle = page.locator('#ed-map .ed-via');
  const box = await handle.locator('rect').boundingBox();
  await dragFrom(page, handle, [box.x + box.width / 2, box.y + box.height / 2], to);
}

export async function tapMap(page, point) {
  await page.locator('#ed-map').scrollIntoViewIfNeeded();
  const [x, y] = await toScreen(page, '#ed-map', point);
  await page.locator('#ed-map svg').dispatchEvent('pointerdown', touch(x, y, 9));
}

/** Partage : pas de menu natif, le lien copié est gardé dans window.__copied. */
export async function captureShare(page) {
  await page.evaluate(() => {
    delete Navigator.prototype.share;
    delete Navigator.prototype.canShare;
    window.__copied = null;
    navigator.clipboard.writeText = async (t) => {
      window.__copied = t;
    };
  });
}

/** Clique sur Partager et renvoie le lien copié. */
export async function shareLink(page) {
  await captureShare(page);
  await page.getByRole('button', { name: 'Partager' }).click();
  await page.waitForFunction(() => window.__copied);
  return page.evaluate(() => window.__copied);
}

/** Modifie le titre de la stratégie affichée dans l'éditeur, puis enregistre (publication). */
export async function editTitle(page, title) {
  await page.getByRole('button', { name: 'Stratégies' }).click();
  await page.getByRole('button', { name: 'Modifier cette stratégie' }).click();
  await page.getByLabel('Titre de la stratégie').fill(title);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.locator('#strat-title').getByText(title, { exact: true }).waitFor();
}

/** Met des stratégies dans le stockage du téléphone (anciennes stratégies perso) avant l'ouverture. */
export async function seedLocal(context, strategies) {
  await context.addInitScript((list) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('stratbook:strategies', JSON.stringify(Object.fromEntries(list.map((s) => [s.id, s]))));
  }, strategies);
}

/** Copie de Split A sous un autre id, avec un titre. */
export function persoFrom(id, title, patch = (s) => s) {
  const s = JSON.parse(JSON.stringify(SPLIT_A));
  s.id = id;
  s.title = { text: title, source: 'ajout' };
  delete s.frame;
  return patch(s);
}
