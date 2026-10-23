// Stratégies enregistrées dans le dépôt GitHub (dossier strategies/), lues et écrites par l'API REST.
// - Lecture (tout le monde) : liste du dossier puis contenu des fichiers nouveaux ou modifiés.
//   Sans jeton : limite de 60 requêtes par heure et par adresse IP, mise en cache 60 s par GitHub.
// - Écriture (Greg seulement) : un commit par enregistrement ou suppression, avec son jeton GitHub.
//   Chaque commit relance la publication du site (GitHub Actions).
// Fonctions sans dépendance au navigateur (fetch injectable), testées dans tests/github.test.js.

export const REPO = { owner: 'GGI-lab', name: 'stratbook', branch: 'main', dir: 'strategies' };
const API = 'https://api.github.com';

export const pathOf = (id) => `${REPO.dir}/${id}.json`;
const contentsUrl = (path = REPO.dir) => `${API}/repos/${REPO.owner}/${REPO.name}/contents/${path}`;

/** Erreur de l'API, avec un message en français et un code utilisable par l'interface. */
export class GitHubError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.code = code; // 'token' | 'rights' | 'limit' | 'conflict' | 'missing' | 'network' | 'other'
    this.status = status;
  }
}

async function call(fetchFn, url, { token, method = 'GET', body, accept = 'application/vnd.github+json' } = {}) {
  let res;
  try {
    res = await fetchFn(url, {
      method,
      headers: {
        Accept: accept,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: method === 'GET' ? 'no-cache' : undefined, // revalidation : réponse à jour ; un « 304 » ne compte pas dans la limite
    });
  } catch {
    throw new GitHubError('network', 'GitHub ne répond pas : vérifie la connexion.');
  }
  if (res.ok) return res;
  const status = res.status;
  const remaining = res.headers?.get?.('x-ratelimit-remaining');
  if (status === 401) throw new GitHubError('token', 'Jeton GitHub refusé (expiré ou révoqué).', status);
  if (status === 403 && remaining === '0') throw new GitHubError('limit', 'Limite de requêtes GitHub atteinte, réessaie dans quelques minutes.', status);
  if (status === 403) throw new GitHubError('rights', 'Ce jeton n’a pas le droit d’écrire dans le dépôt.', status);
  if (status === 404) throw new GitHubError('missing', 'Fichier introuvable dans le dépôt.', status);
  if (status === 409 || status === 422) throw new GitHubError('conflict', 'La stratégie a été modifiée ailleurs entre-temps.', status);
  throw new GitHubError('other', `Erreur GitHub (${status}).`, status);
}

// Contenu des fichiers en base64 (API contents), avec les accents (UTF-8).
export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function fromBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Empreinte Git d'un fichier (comme `git hash-object`) : sert à savoir si un fichier a changé. */
export async function blobSha(text) {
  const body = new TextEncoder().encode(text);
  const head = new TextEncoder().encode(`blob ${body.length}\0`);
  const all = new Uint8Array(head.length + body.length);
  all.set(head);
  all.set(body, head.length);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', all));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Fichiers .json du dossier des stratégies : [{ id, sha }]. */
export async function listStrategies(fetchFn = fetch, { token } = {}) {
  const res = await call(fetchFn, `${contentsUrl()}?ref=${REPO.branch}`, { token });
  const items = await res.json();
  if (!Array.isArray(items)) throw new GitHubError('other', 'Réponse GitHub inattendue.');
  return items
    .filter((f) => f.type === 'file' && /^[a-z0-9][a-z0-9-]{0,63}\.json$/.test(f.name))
    .map((f) => ({ id: f.name.slice(0, -5), sha: f.sha }));
}

/** Texte et empreinte d'un fichier de stratégie. */
export async function readStrategy(fetchFn, id, { token } = {}) {
  const res = await call(fetchFn, `${contentsUrl(pathOf(id))}?ref=${REPO.branch}`, { token });
  const data = await res.json();
  return { text: fromBase64(data.content ?? ''), sha: data.sha };
}

/** Texte du fichier tel qu'il est enregistré (lisible dans GitHub, une ligne finale). */
export const fileText = (strategy) => `${JSON.stringify(strategy, null, 2)}\n`;

/**
 * Crée ou remplace un fichier de stratégie (un commit). `sha` : empreinte de la version remplacée
 * (absente pour une création) ; si le fichier a changé entre-temps, erreur 'conflict'.
 * Renvoie la nouvelle empreinte.
 */
export async function writeStrategy(fetchFn, token, strategy, { sha, message } = {}) {
  const res = await call(fetchFn, contentsUrl(pathOf(strategy.id)), {
    token,
    method: 'PUT',
    body: {
      message: message ?? `Stratégie « ${strategy.title.text} » ${sha ? 'modifiée' : 'ajoutée'} depuis l’application`,
      content: toBase64(fileText(strategy)),
      branch: REPO.branch,
      ...(sha ? { sha } : {}),
    },
  });
  const data = await res.json();
  return data.content?.sha ?? null;
}

/** Supprime un fichier de stratégie (un commit). */
export async function deleteStrategy(fetchFn, token, { id, title, sha }) {
  await call(fetchFn, contentsUrl(pathOf(id)), {
    token,
    method: 'DELETE',
    body: { message: `Stratégie « ${title} » supprimée depuis l’application`, sha, branch: REPO.branch },
  });
}

/** Le jeton peut-il écrire dans le dépôt ? Renvoie true, ou lève une GitHubError. */
export async function checkAccess(fetchFn, token) {
  const res = await call(fetchFn, `${API}/repos/${REPO.owner}/${REPO.name}`, { token });
  const repo = await res.json();
  if (!repo.permissions?.push) throw new GitHubError('rights', 'Ce jeton peut lire le dépôt mais pas y écrire (droit Contents : Read and write).');
  return true;
}
