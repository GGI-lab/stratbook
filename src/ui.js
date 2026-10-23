// Petits outils d'interface partagés par l'écran principal et l'éditeur.

export const $ = (id) => document.getElementById(id);

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let toastTimer;
export function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('toast--on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('toast--on'), 3000);
}

/**
 * Boîte de choix (sans alert/confirm du navigateur). Renvoie une promesse de la valeur choisie.
 * choices : [{ value, label, kind: 'primary' | 'ghost' | 'danger' }], le premier reçoit le focus.
 * Échap ou fermeture : `dismiss`.
 * text : chaîne, ou liste de paragraphes.
 */
export function choiceDialog({ title, text, choices, dismiss = 'cancel' }) {
  const dialog = $('confirm-dialog');
  $('confirm-title').textContent = title;
  $('confirm-text').innerHTML = (Array.isArray(text) ? text : [text]).map((p) => `<p>${esc(p)}</p>`).join('');
  const actions = $('confirm-actions');
  actions.classList.toggle('nicks__actions--stack', choices.length > 2);
  actions.innerHTML = choices
    .map(
      (c, i) =>
        `<button type="submit" class="btn btn--${c.kind ?? 'ghost'}" value="${esc(c.value)}"${i === 0 ? ' autofocus' : ''}>${esc(c.label)}</button>`,
    )
    .join('');
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) =>
    dialog.addEventListener('close', () => resolve(choices.some((c) => c.value === dialog.returnValue) ? dialog.returnValue : dismiss), {
      once: true,
    }),
  );
}

/** Boîte de confirmation à deux boutons. Renvoie une promesse de booléen. */
export async function confirmDialog({ title, text, ok = 'Confirmer', cancel = 'Annuler', danger = false }) {
  // Ordre d'affichage : Annuler puis Confirmer (comme avant) ; le focus va au bouton sans risque.
  const answer = await choiceDialog({
    title,
    text,
    choices: [
      { value: 'cancel', label: cancel, kind: 'ghost' },
      { value: 'ok', label: ok, kind: danger ? 'danger' : 'primary' },
    ],
  });
  return answer === 'ok';
}

/** Coordonnées d'un pointeur dans le repère d'un SVG (viewBox), zoom compris. */
export function svgPoint(svg, clientX, clientY) {
  const p = new DOMPoint(clientX, clientY).matrixTransform(svg.getScreenCTM().inverse());
  return [p.x, p.y];
}
