// Différences entre deux versions d'une stratégie (JSON), pour des liens de partage courts :
// une stratégie du dépôt modifiée voyage sous forme de « ce qui a changé » par rapport à l'original.
// Fonctions pures, testées dans tests/patch.test.js.
//
// Format d'une différence :
//   { v: valeur }                 valeur remplacée
//   { o: { clé: diff }, x: [clés] } objet : clés modifiées ou ajoutées (o), clés retirées (x)
//   { a: longueur, o: { i: diff } } tableau : nouvelle longueur, éléments modifiés ou ajoutés

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Clés refusées à l'application d'une différence reçue (pollution du prototype).
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_ARRAY = 1000;

/** Différence pour passer de `a` à `b` ; undefined si rien n'a changé. */
export function diff(a, b) {
  if (same(a, b)) return undefined;
  if (isObj(a) && isObj(b)) {
    const o = {};
    for (const k of Object.keys(b)) {
      const d = diff(a[k], b[k]);
      if (d !== undefined) o[k] = d;
    }
    const x = Object.keys(a).filter((k) => !(k in b));
    return x.length ? { o, x } : { o };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const o = {};
    b.forEach((v, i) => {
      const d = i < a.length ? diff(a[i], v) : { v };
      if (d !== undefined) o[i] = d;
    });
    const patch = { a: b.length, o };
    // Un tableau très changé s'envoie tel quel : plus court.
    return JSON.stringify(patch).length < JSON.stringify(b).length ? patch : { v: clone(b) };
  }
  return { v: clone(b) };
}

/** Applique une différence (éventuellement reçue d'un lien) à `a`. Lève une erreur si elle est mal formée. */
export function applyDiff(a, d) {
  if (d === undefined) return clone(a);
  if (!isObj(d)) throw new Error('Différence invalide');
  if ('v' in d) return clone(d.v);
  if ('a' in d) {
    if (!Number.isInteger(d.a) || d.a < 0 || d.a > MAX_ARRAY) throw new Error('Différence invalide');
    const base = Array.isArray(a) ? a : [];
    const changes = isObj(d.o) ? d.o : {};
    return Array.from({ length: d.a }, (_, i) => (i in changes ? applyDiff(base[i], changes[i]) : clone(base[i])));
  }
  const base = isObj(a) ? a : {};
  const removed = new Set(Array.isArray(d.x) ? d.x : []);
  const out = {};
  for (const k of Object.keys(base)) if (!removed.has(k)) out[k] = clone(base[k]);
  for (const [k, sub] of Object.entries(isObj(d.o) ? d.o : {})) {
    if (FORBIDDEN.has(k)) continue;
    out[k] = applyDiff(base[k], sub);
  }
  return out;
}

/** Empreinte courte d'un texte (FNV-1a 32 bits), pour vérifier que l'original n'a pas changé. */
export function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
