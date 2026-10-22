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

/** Boîte de confirmation (sans alert/confirm du navigateur). Renvoie une promesse de booléen. */
export function confirmDialog({ title, text, ok = 'Confirmer', cancel = 'Annuler', danger = false }) {
  const dialog = $('confirm-dialog');
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm-yes').textContent = ok;
  $('confirm-no').textContent = cancel;
  $('confirm-yes').classList.toggle('btn--danger', danger);
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }));
}

/** Coordonnées d'un pointeur dans le repère d'un SVG (viewBox), zoom compris. */
export function svgPoint(svg, clientX, clientY) {
  const p = new DOMPoint(clientX, clientY).matrixTransform(svg.getScreenCTM().inverse());
  return [p.x, p.y];
}
