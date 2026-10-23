// Ajouter Stratbook à l'écran d'accueil : il s'ouvre en un toucher, comme une app.
// Les stratégies sont dans le dépôt GitHub ; sur l'appareil ne restent que les préférences
// (pseudos, rôle) et, pour Greg, l'accès éditeur chiffré. Safari efface ces données d'un site
// qu'on n'ouvre pas pendant 7 jours d'utilisation de Safari ; une app de l'écran d'accueil n'est pas concernée.
import { $, esc } from './ui.js';

let deferredPrompt = null; // Android (Chrome) : invite d'installation gardée pour plus tard

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});
addEventListener('appinstalled', () => (deferredPrompt = null));

/** Ouvert depuis l'écran d'accueil (app installée) ? */
export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;

/** iPhone ou iPad (iPadOS se présente comme un Mac tactile). */
export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isMobile = () => isIOS() || /Android/i.test(navigator.userAgent);

/** Demande un stockage persistant (sans effet si le navigateur refuse ou ne sait pas faire). */
export async function requestPersist() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** L'installation peut-elle être proposée depuis le menu (téléphone, pas déjà installée) ? */
export const canOfferInstall = () => !isStandalone() && (isMobile() || Boolean(deferredPrompt));

/**
 * Fenêtre « Ajouter à l'écran d'accueil ».
 * @param {object} opts
 * @param {boolean} [opts.admin] accès éditeur configuré sur cet appareil (rappel pour l'iPhone)
 */
export function showInstallDialog({ admin = false } = {}) {
  const dialog = $('install-dialog');
  const ios = isIOS();
  const steps = ios
    ? [
        'Dans Safari, touche le bouton Partager (carré avec une flèche vers le haut).',
        'Choisis « Sur l’écran d’accueil », puis « Ajouter ».',
        'Ouvre ensuite Stratbook depuis son icône.',
      ]
    : [
        'Ouvre le menu du navigateur (⋮).',
        'Choisis « Installer l’application » ou « Ajouter à l’écran d’accueil ».',
        'Ouvre ensuite Stratbook depuis son icône.',
      ];
  $('install-steps').innerHTML = steps.map((s) => `<li>${esc(s)}</li>`).join('');
  $('install-why').textContent =
    'Stratbook s’ouvre en un toucher, comme une app, et garde tes pseudos.' +
    (ios && admin ? ' Sur iPhone, l’app installée a son propre stockage : tu y saisiras ton jeton GitHub une fois.' : '');
  $('install-now').hidden = !deferredPrompt;
  $('install-now').onclick = async () => {
    const prompt = deferredPrompt;
    deferredPrompt = null;
    dialog.close();
    await prompt?.prompt();
  };
  dialog.showModal();
}
