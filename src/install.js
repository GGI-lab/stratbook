// Protéger les stratégies gardées sur le téléphone (il n'y a pas de serveur) :
// - Safari efface le stockage d'un site après 7 jours d'utilisation de Safari sans visite ;
//   une app ajoutée à l'écran d'accueil n'est pas concernée ;
// - navigator.storage.persist() demande au navigateur de ne pas effacer les données (Safari 17+, Chrome) ;
// - la sauvegarde dans un fichier (menu Stratégies) reste le filet de sécurité.
// Attention : sur iPhone, l'app de l'écran d'accueil a son propre stockage, séparé de Safari.
import { $, esc } from './ui.js';

const KEY_SEEN = 'stratbook:installation-proposee';
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

/** Faut-il proposer l'installation ? Sur téléphone, hors app installée, une seule fois automatiquement. */
export function shouldOfferInstall(storage) {
  if (isStandalone() || !isMobile()) return false;
  try {
    return !storage?.getItem(KEY_SEEN);
  } catch {
    return false;
  }
}

/** L'installation peut-elle être proposée depuis le menu (téléphone, pas déjà installée) ? */
export const canOfferInstall = () => !isStandalone() && (isMobile() || Boolean(deferredPrompt));

/**
 * Fenêtre « Ajouter à l'écran d'accueil ».
 * @param {object} opts
 * @param {Storage} [opts.storage]  pour ne plus la proposer automatiquement
 * @param {boolean} [opts.hasLocal] le téléphone a des stratégies perso (ajoute le conseil de sauvegarde)
 * @param {Function} [opts.onBackup] sauvegarde de toutes les stratégies
 */
export function showInstallDialog({ storage, hasLocal = false, onBackup } = {}) {
  try {
    storage?.setItem(KEY_SEEN, '1');
  } catch {
    /* stockage indisponible */
  }
  const dialog = $('install-dialog');
  const ios = isIOS();
  const steps = ios
    ? [
        'Dans Safari, touche le bouton Partager (carré avec une flèche vers le haut).',
        'Choisis « Sur l’écran d’accueil », puis « Ajouter ».',
        'Ouvre ensuite Stratbook depuis son icône.',
      ]
    : ['Ouvre le menu du navigateur (⋮).', 'Choisis « Installer l’application » ou « Ajouter à l’écran d’accueil ».', 'Ouvre ensuite Stratbook depuis son icône.'];
  $('install-steps').innerHTML = steps.map((s) => `<li>${esc(s)}</li>`).join('');
  $('install-why').textContent = ios
    ? 'Safari efface les données d’un site que tu n’ouvres pas pendant 7 jours d’utilisation. Installée sur l’écran d’accueil, l’app garde tes stratégies.'
    : 'Installée sur l’écran d’accueil, l’app s’ouvre plus vite et garde mieux tes stratégies.';
  // Sur iPhone, l'app installée ne voit pas les données de Safari : il faut les y importer.
  $('install-move').hidden = !(ios && hasLocal);
  $('install-backup').hidden = !(ios && hasLocal && onBackup);
  $('install-now').hidden = !deferredPrompt;
  $('install-backup').onclick = () => onBackup?.();
  $('install-now').onclick = async () => {
    const prompt = deferredPrompt;
    deferredPrompt = null;
    dialog.close();
    await prompt?.prompt();
  };
  dialog.showModal();
}
