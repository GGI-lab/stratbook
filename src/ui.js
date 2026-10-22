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

/** Télécharge un fichier (ou l'envoie par le menu de partage du téléphone si `share` et possible). */
export async function saveFile(name, data, { share = false, title = name } = {}) {
  const text = typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`;
  const type = 'application/json';
  if (share && typeof File === 'function' && navigator.canShare) {
    const file = new File([text], name, { type });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
        return 'shared';
      } catch (err) {
        if (err?.name === 'AbortError') return 'cancelled';
      }
    }
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return 'downloaded';
}

/** Demande un fichier à l'utilisateur et renvoie son texte (null si annulé). */
export function pickFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.style.display = 'none';
    document.body.append(input);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      resolve(file && file.size < 2_000_000 ? await file.text() : null);
    });
    input.addEventListener('cancel', () => (input.remove(), resolve(null)));
    input.click();
  });
}

/** Coordonnées d'un pointeur dans le repère d'un SVG (viewBox), zoom compris. */
export function svgPoint(svg, clientX, clientY) {
  const p = new DOMPoint(clientX, clientY).matrixTransform(svg.getScreenCTM().inverse());
  return [p.x, p.y];
}
