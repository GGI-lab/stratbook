// Accès éditeur : le jeton GitHub de Greg, chiffré par son mot de passe, gardé sur l'appareil.
// - Le jeton ne quitte jamais l'appareil (rien de secret dans le dépôt public).
// - Chiffrement AES-GCM 256 bits, clé dérivée du mot de passe (PBKDF2-SHA256, 310 000 tours).
// - Une fois déverrouillé, le jeton reste dans la session de l'onglet (fermée avec l'onglet, ou « Verrouiller »).
// La vraie protection est le jeton : sans lui, personne ne peut écrire dans le dépôt, même en contournant l'écran.
// Fonctions testées dans tests/vault.test.js.

const KEY = 'stratbook:acces';
const SESSION_KEY = 'stratbook:acces-session';
const ITERATIONS = 310000;

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** Chiffre le jeton avec le mot de passe. Renvoie un objet enregistrable (JSON). */
export async function sealToken(token, password, { iterations = ITERATIONS } = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)));
  return { v: 1, iterations, salt: b64(salt), iv: b64(iv), data: b64(data) };
}

/** Déchiffre le jeton ; null si le mot de passe est faux (ou les données abîmées). */
export async function openToken(sealed, password) {
  try {
    const key = await deriveKey(password, unb64(sealed.salt), sealed.iterations ?? ITERATIONS);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, key, unb64(sealed.data));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/** Coffre de l'appareil : stockage local (jeton chiffré) et session (jeton déverrouillé). */
export function createVault(storage, session) {
  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const sealed = () => safe(() => JSON.parse(storage?.getItem(KEY) ?? 'null'), null);
  let unlocked = safe(() => session?.getItem(SESSION_KEY) || null, null);
  return {
    /** Un accès est-il configuré sur cet appareil ? */
    isSetUp: () => Boolean(sealed()?.data),
    /** Jeton disponible (session déverrouillée) ? */
    isUnlocked: () => Boolean(unlocked),
    token: () => unlocked,
    /** Configure l'accès : jeton chiffré par le mot de passe, puis session déverrouillée. */
    async setUp(token, password) {
      const box = await sealToken(token, password);
      const saved = safe(() => (storage.setItem(KEY, JSON.stringify(box)), true), false);
      unlocked = token;
      safe(() => session?.setItem(SESSION_KEY, token));
      return saved;
    },
    /** Déverrouille avec le mot de passe ; false s'il est faux. */
    async unlock(password) {
      const box = sealed();
      if (!box) return false;
      const token = await openToken(box, password);
      if (!token) return false;
      unlocked = token;
      safe(() => session?.setItem(SESSION_KEY, token));
      return true;
    },
    lock() {
      unlocked = null;
      safe(() => session?.removeItem(SESSION_KEY));
    },
    /** Oublie l'accès de cet appareil (jeton chiffré compris). */
    forget() {
      this.lock();
      safe(() => storage?.removeItem(KEY));
    },
  };
}
