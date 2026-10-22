// Bouton retour du téléphone (Android) et geste retour : ferme l'écran ouvert (éditeur, menu)
// au lieu de quitter le site. Chaque écran ouvert ajoute une entrée à l'historique, avec la même adresse.
// Les fenêtres modales (<dialog>) se ferment déjà toutes seules au retour sur Android.
// Une entrée n'est ajoutée qu'après une action de l'utilisateur (toucher, clic) : Chrome saute au retour
// celles ajoutées sans action, et le retour suivant quitterait alors le site.

const stack = []; // écrans ouverts : { name, onBack }
let pendingBacks = 0; // retours lancés par l'application elle-même (fermeture par un bouton)
let waiters = [];

/** Un écran s'ouvre : le prochain « retour » appellera onBack au lieu de quitter la page. */
export function openLayer(name, onBack) {
  stack.push({ name, onBack });
  // Un retour lancé juste avant (menu fermé puis éditeur ouvert) doit finir avant d'ajouter l'entrée.
  whenSettled(() => history.pushState({ stratbookLayer: name }, ''));
}

export const isLayerOpen = (name) => stack.some((l) => l.name === name);

/**
 * Un écran en remplace un autre (menu → éditeur) en gardant la même entrée d'historique.
 * Pas de « retour puis ajout » : Chrome ignore au retour les entrées ajoutées sans action
 * de l'utilisateur, ce qui ferait quitter le site au retour suivant.
 */
export function swapLayer(from, name, onBack) {
  const i = stack.findLastIndex((l) => l.name === from);
  if (i < 0) return openLayer(name, onBack);
  stack[i] = { name, onBack };
  whenSettled(() => history.replaceState({ ...history.state, stratbookLayer: name }, ''));
}

/**
 * L'écran se ferme par un bouton : on retire son entrée de l'historique.
 * Renvoie une promesse résolue quand l'historique est à jour (avant de réécrire l'adresse).
 */
export function closeLayer(name) {
  const i = stack.findLastIndex((l) => l.name === name);
  if (i < 0) return settled();
  stack.splice(i, 1);
  pendingBacks++;
  history.back();
  return settled();
}

/** Promesse résolue quand aucun retour lancé par l'application n'est en attente. */
export function settled() {
  return pendingBacks ? new Promise((resolve) => waiters.push(resolve)) : Promise.resolve();
}

/** Lance fn tout de suite, ou dès que l'historique est à jour (réécriture de l'adresse). */
export function whenSettled(fn) {
  if (pendingBacks) waiters.push(fn);
  else fn();
}

addEventListener('popstate', () => {
  if (pendingBacks) {
    pendingBacks--;
    if (!pendingBacks) {
      const w = waiters;
      waiters = [];
      w.forEach((resolve) => resolve());
    }
    return;
  }
  // Retour demandé par l'utilisateur : l'écran du dessus se ferme.
  const top = stack.pop();
  top?.onBack();
});
