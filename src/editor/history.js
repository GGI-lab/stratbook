// Historique de l'éditeur : Défaire / Refaire. Fonctions pures, testées dans tests/editor.test.js.
// Chaque entrée est une copie figée de l'état (brouillon + étape affichée), en texte JSON.

export function createHistory(limit = 100) {
  const past = [];
  const future = [];
  return {
    /** Garde l'état d'avant une modification. Une nouvelle modification efface ce qui pouvait être refait. */
    record(snapshot) {
      if (past.at(-1) === snapshot) return;
      past.push(snapshot);
      if (past.length > limit) past.shift();
      future.length = 0;
    },
    /** Renvoie l'état à rétablir (ou null) ; `current` pourra être refait. */
    undo(current) {
      if (!past.length) return null;
      future.push(current);
      return past.pop();
    },
    redo(current) {
      if (!future.length) return null;
      past.push(current);
      return future.pop();
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
  };
}
