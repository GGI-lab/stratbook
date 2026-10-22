import { STRATEGIES, DEFAULT_STRATEGY_ID } from './strategies.js';
import { createLibrary } from './library.js';
import { sideOf, frameOf, groupLabel, sanitizeStrategy, SIDES } from './model.js';
import { encodeStrategy, decodeStrategy } from './codec.js';
import { renderStepSvg, PLAYER_COLORS } from './map/render.js';
import { getMap, MAPS } from './map/maps.js';
import { animateTransition } from './map/animate.js';
import { attachZoom } from './map/zoom.js';
import { openEditor } from './editor/editor.js';
import { $, esc, toast } from './ui.js';
import {
  ROLES,
  TEAM,
  STEP_MIN,
  RECAP,
  NICK_MAX,
  parseParams,
  resolveInitial,
  buildShareUrl,
  displayName,
  cleanNickname,
  clampStep,
  createStore,
  roleNumber,
} from './state.js';

// Le stockage peut être bloqué (navigation privée) : l'accès lui-même peut lever une erreur.
const storage = (() => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
})();
const store = createStore(storage);
const library = createLibrary(STRATEGIES, storage);
const MAP_ID = 'dust2'; // une seule carte pour l'instant
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sameContent = (a, b) => {
  const key = (s) => JSON.stringify(sanitizeStrategy(s), (k, v) => (k === 'source' ? undefined : v));
  return key(a) === key(b);
};

// ---------- État ----------
const state = { strategy: null, side: 't', step: 1, view: TEAM, nicknames: [] };
let map = MAPS[MAP_ID];
let frame = map.viewBox;
let stepLast = 1;
// L'étape récap suit la dernière étape : state.step vaut alors stepLast + 1.
const recapStep = () => stepLast + 1;
const isRecap = () => state.step > stepLast;
const posStep = () => Math.min(state.step, stepLast); // étape dont la carte montre les positions
const toStep = (n) => clampStep(n, recapStep());
let imageHref = '';
const zoom = attachZoom($('map'), frame);
const shareData = {}; // stratégie encodée pour le lien, par id (calculée à l'avance : le partage reste immédiat)
const lastBySide = {};

function setState(patch, { focusBrief = false } = {}) {
  stopPlay(); // toute action de l'utilisateur arrête la lecture
  Object.assign(state, patch);
  if (patch.view && ROLES.includes(patch.view)) store.saveRole(patch.view);
  syncUrl();
  render();
  if (focusBrief) $('consignes').focus({ preventScroll: true });
}

// L'adresse reflète toujours la vue : un rechargement ou une copie manuelle redonne la même vue.
function syncUrl() {
  history.replaceState(null, '', buildShareUrl(location.href, state.strategy?.id, urlState()));
}

const urlState = () => ({ ...state, step: state.strategy && isRecap() ? RECAP : state.step });

/** Affiche une stratégie de la bibliothèque. */
function selectStrategy(id, { step = STEP_MIN } = {}) {
  stopPlay();
  const s = library.get(id);
  if (!s) return;
  state.strategy = s;
  state.side = sideOf(s);
  map = getMap(s.map);
  frame = frameOf(s, map);
  stepLast = s.steps.length;
  state.step = step === RECAP ? recapStep() : toStep(step);
  imageHref = `${import.meta.env.BASE_URL}${map.background.href}`;
  const ratio = frame.height / frame.width;
  document.documentElement.style.setProperty('--map-ratio', String(ratio));
  // Réduction de 20 % décidée pour le cadrage haut (moitié de map) ; une map entière, presque carrée, garde sa largeur.
  document.documentElement.style.setProperty('--map-shrink', ratio > 1.3 ? '0.8' : '1');
  zoom.setBase(frame);
  shownStep = null;
  lastBySide[state.side] = id;
  library.setLast(id);
  // Une stratégie qui n'existe que sur ce téléphone voyage dans le lien de partage.
  if (library.isLocalCopy(id)) encodeStrategy(s).then((v) => (shareData[id] = v));
  else delete shareData[id];
}

/** Change de side : dernière stratégie vue de ce side, sinon la première, sinon écran vide. */
function setSide(side) {
  if (side === state.side && state.strategy) return;
  stopPlay();
  const list = library.list({ map: MAP_ID, side });
  const id = list.some((s) => s.id === lastBySide[side]) ? lastBySide[side] : list[0]?.id;
  if (id) selectStrategy(id);
  else {
    state.strategy = null;
    state.side = side;
  }
  syncUrl();
  render({ from: null });
}

// ---------- Petits outils de rendu ----------
function playerChip(role) {
  return `<span class="chip chip--${role}" style="--c:${PLAYER_COLORS[role]}">${esc(displayName(role, state.nicknames))}</span>`;
}

// Remplace « J1 » … « J5 » dans un texte par une étiquette colorée avec le pseudo.
function richText(text) {
  return esc(text).replace(/\bJ([1-5])\b/g, (_, n) => playerChip(`j${n}`));
}

function callChip(call) {
  return `<li class="call"><svg class="call__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none"/></svg><span class="call__text">« ${esc(call.text)} »</span><span class="call__who">${esc(groupLabel(state.strategy, call.group))}</span></li>`;
}

const currentStep = () => state.strategy.steps.find((s) => s.n === state.step);

// ---------- En-tête : side, menu des stratégies ----------
function renderHeader() {
  const side = SIDES[state.side];
  const other = SIDES[state.side === 't' ? 'ct' : 't'];
  $('map-label').textContent = `${map.name} · ${side.label}`;
  $('strat-title').textContent = state.strategy ? state.strategy.title.text || 'Sans titre' : 'Aucune stratégie';
  const btn = $('side');
  btn.dataset.side = state.side;
  btn.querySelector('.side-btn__label').textContent = side.short;
  btn.setAttribute('aria-label', `Side : ${side.label}. Passer côté ${other.label}`);
}

const ORIGIN_TAG = { local: 'Perso', modified: 'Modifiée' };

function renderMenu() {
  const side = SIDES[state.side];
  const list = library.list({ map: MAP_ID, side: state.side });
  $('menu-head').textContent = `Stratégies ${side.label} · ${map.name}`;
  $('menu-list').innerHTML = list.length
    ? list
        .map((s) => {
          const current = s.id === state.strategy?.id;
          const tag = ORIGIN_TAG[library.origin(s.id)];
          return `<li><button type="button" class="menu__item" data-id="${esc(s.id)}"${current ? ' aria-current="true"' : ''}><span class="menu__check" aria-hidden="true">${current ? '✓' : ''}</span><span class="menu__name">${esc(s.title.text || 'Sans titre')}</span>${tag ? `<span class="menu__tag">${tag}</span>` : ''}</button></li>`;
        })
        .join('')
    : `<li class="menu__empty">Aucune stratégie ${esc(side.label)} pour l'instant.</li>`;
  $('menu-new-label').textContent = `Nouvelle stratégie ${side.short}`;
  $('menu-edit').hidden = !state.strategy;
}

function openMenu() {
  stopPlay();
  renderMenu();
  $('strat-menu').hidden = false;
  $('open-list').setAttribute('aria-expanded', 'true');
  ($('menu-list').querySelector('[aria-current]') ?? $('menu-list').querySelector('button') ?? $('menu-new')).focus();
}

function closeMenu({ focus = false } = {}) {
  if ($('strat-menu').hidden) return;
  $('strat-menu').hidden = true;
  $('open-list').setAttribute('aria-expanded', 'false');
  if (focus) $('open-list').focus();
}

$('open-list').addEventListener('click', () => ($('strat-menu').hidden ? openMenu() : closeMenu()));
$('menu-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-id]');
  if (!btn) return;
  closeMenu();
  selectStrategy(btn.dataset.id);
  syncUrl();
  render({ from: null });
});
$('menu-new').addEventListener('click', () => {
  closeMenu();
  startEditor(null);
});
$('menu-edit').addEventListener('click', () => {
  closeMenu();
  startEditor(state.strategy);
});
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#strat-menu, #open-list')) closeMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('strat-menu').hidden) {
    e.preventDefault();
    closeMenu({ focus: true });
  }
});

$('side').addEventListener('click', () => setSide(state.side === 't' ? 'ct' : 't'));
$('empty-new').addEventListener('click', () => startEditor(null));

// ---------- Éditeur ----------
function startEditor(strategy) {
  stopPlay();
  document.body.dataset.mode = 'edit';
  window.scrollTo(0, 0);
  openEditor({
    strategy,
    side: state.side,
    step: strategy ? posStep() : 1,
    library,
    onClose: ({ savedId = null, deletedId = null, step = STEP_MIN } = {}) => {
      document.body.dataset.mode = 'view';
      if (savedId) selectStrategy(savedId, { step });
      else if (deletedId) {
        if (library.has(deletedId)) selectStrategy(deletedId, { step }); // stratégie du dépôt : retour à l'original
        else {
          state.strategy = null;
          setSide(state.side);
        }
      } else if (state.strategy) selectStrategy(state.strategy.id, { step: state.step });
      syncUrl();
      render({ from: null });
      window.scrollTo(0, 0);
      $('open-list').focus({ preventScroll: true });
    },
  });
}

// ---------- Vues ----------
// Bouton Équipe : cinq personnages aux couleurs des joueurs.
const TEAM_ICONS = ROLES.map(
  (r) =>
    `<svg class="team-icon" viewBox="0 0 13 18" aria-hidden="true" style="--c:${PLAYER_COLORS[r]}"><circle class="head" cx="6.5" cy="5" r="3.6"/><path class="body" d="M0.7 17.3c0-4.2 2.6-7.2 5.8-7.2s5.8 3 5.8 7.2z"/></svg>`,
).join('');

function renderViews() {
  const items = [{ id: TEAM, label: 'Équipe' }, ...ROLES.map((r) => ({ id: r }))];
  $('views').innerHTML = items
    .map(({ id, label }) => {
      const active = state.view === id;
      if (id === TEAM)
        return `<button type="button" class="view view--team" data-view="${id}" aria-pressed="${active}" aria-label="${label}">${TEAM_ICONS}</button>`;
      const nick = state.nicknames[ROLES.indexOf(id)];
      return `<button type="button" class="view" data-view="${id}" aria-pressed="${active}" style="--c:${PLAYER_COLORS[id]}"><span class="view__dot" aria-hidden="true">${roleNumber(id)}</span><span class="view__nick">${esc(nick || `J${roleNumber(id)}`)}</span></button>`;
    })
    .join('');
}

// ---------- Carte et animation ----------
let shownStep = null; // étape dont les positions sont affichées
let cancelAnim = () => {};

/**
 * Dessine la carte de l'étape courante. Si l'étape change, les joueurs glissent depuis
 * l'étape affichée (sauts de plusieurs étapes compris), sauf si le mouvement est réduit.
 */
function renderMap({ from = shownStep, onDone = () => {} } = {}) {
  cancelAnim();
  const focus = state.view === TEAM ? null : state.view;
  const to = posStep();
  $('map').innerHTML = renderStepSvg(state.strategy, to, { focus, imageHref, map, frame, recap: isRecap() });
  const svg = $('map').querySelector('svg');
  zoom.apply(); // garde le zoom et le déplacement en cours
  const animate = from !== null && from !== to && !reducedMotion();
  shownStep = to;
  if (!animate) return onDone();
  cancelAnim = animateTransition(svg, state.strategy, from, to, {
    onDone: () => {
      cancelAnim = () => {};
      onDone();
    },
  });
}

// ---------- Volet des consignes ----------
// Structure commune : en-tête (repère d'étape + titre), puis sections titrées, espacées de façon régulière.
const section = (label, body, cls = '') => `<section class="b-sec${cls ? ` ${cls}` : ''}"><h3 class="b-label">${label}</h3>${body}</section>`;

const head = (meta, title) => `<header class="b-head"><p class="b-meta">${meta}</p>${title}</header>`;

// Identité d'un joueur : pastille, nom (titre du volet) et rôle.
function playerHead(role) {
  const r = state.strategy.roles[role];
  const sub = r.title.text ? `<p class="b-player__role">${richText(r.title.text)}</p>` : '';
  return `<div class="b-player" style="--c:${PLAYER_COLORS[role]}"><span class="b-dot" aria-hidden="true">${roleNumber(role)}</span><div class="b-player__txt"><h2 class="b-title">${esc(displayName(role, state.nicknames))}</h2>${sub}</div></div>`;
}

const callsList = (calls) => (calls.length ? `<ul class="calls">${calls.map(callChip).join('')}</ul>` : '');
const callsFor = (step, role) => {
  const g = state.strategy.roles[role].group;
  return step.calls.filter((c) => c.group === g || c.group === 'all');
};

function plansList(step) {
  return step.team.length
    ? `<ul class="plans">${step.team
        .map((t) => `<li class="plan"><span class="plan__group">${esc(groupLabel(state.strategy, t.group))}</span><p class="plan__text">${richText(t.text)}</p></li>`)
        .join('')}</ul>`
    : `<p class="b-none">Pas de plan collectif pour cette étape.</p>`;
}

function utilsList(role) {
  const u = state.strategy.roles[role].utilities;
  return u.length ? `<ul class="utils">${u.map((x) => `<li><span>${richText(x.text)}</span></li>`).join('')}</ul>` : '';
}

const stepMeta = (step) => `Étape ${step.n} sur ${stepLast}`;

function renderTeamBrief(step) {
  const title = step.title.text || 'Plan de l’équipe';
  return (
    head(stepMeta(step), `<h2 class="b-title">${esc(title)}</h2>`) +
    section('Plan de l’équipe', plansList(step)) +
    (step.calls.length ? section('Appels', callsList(step.calls)) : '')
  );
}

function renderRoleBrief(step, role) {
  const s = state.strategy;
  const r = s.roles[role];
  const missions = step.roles[role] ?? [];
  const missionHtml = missions.length
    ? `<ul class="missions">${missions.map((m) => `<li>${richText(m.text)}</li>`).join('')}</ul>`
    : `<p class="b-none missions--none">${esc(s.labels.noNewInstruction.text)}</p>`;
  const calls = callsFor(step, role);
  const meta = step.title.text ? `${stepMeta(step)} · ${esc(step.title.text)}` : stepMeta(step);
  // Rôle et utilitaires valent pour toute la manche : regroupés sous un trait, après la consigne de l'étape.
  const round =
    (r.summary.text ? section('Ton rôle', `<p class="b-text">${richText(r.summary.text)}</p>`) : '') +
    (r.utilities.length ? section(esc(s.labels.utilitiesHeading.text), utilsList(role)) : '');
  return (
    head(meta, playerHead(role)) +
    `<div class="b-focus">${section('Ta mission', missionHtml)}${calls.length ? section('Appels', callsList(calls)) : ''}</div>` +
    (round ? `<div class="b-round">${round}</div>` : '')
  );
}

// ---------- Récap : toute la stratégie dans le volet ----------
const recapMeta = () => `Récap · ${stepLast} étape${stepLast > 1 ? 's' : ''}`;

// Frise des étapes : numéro, titre, puis le contenu propre à chaque étape.
function timeline(render) {
  return `<ol class="tl">${state.strategy.steps
    .map(
      (st) =>
        `<li class="tl__item"><span class="tl__n" aria-hidden="true">${st.n}</span><div class="tl__body"><p class="tl__title">${esc(st.title.text || `Étape ${st.n}`)}</p>${render(st)}</div></li>`,
    )
    .join('')}</ol>`;
}

const inlineCalls = (calls) =>
  calls.length
    ? `<ul class="tl__calls">${calls.map((c) => `<li class="tl__call"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/></svg>« ${esc(c.text)} »</li>`).join('')}</ul>`
    : '';

function renderTeamRecap() {
  const s = state.strategy;
  const steps = timeline((st) => {
    const plans = st.team.length
      ? `<ul class="tl__plans">${st.team.map((t) => `<li><span class="tl__group">${esc(groupLabel(s, t.group))}</span> ${richText(t.text)}</li>`).join('')}</ul>`
      : '';
    return plans + inlineCalls(st.calls);
  });
  const roster = `<ul class="roster">${ROLES.map((role) => {
    const r = s.roles[role];
    const sum = r.summary.text ? `<span class="roster__sum">${richText(r.summary.text)}</span>` : '';
    const title = r.title.text ? `<span class="roster__role">${richText(r.title.text)}</span>` : '';
    return `<li><button type="button" class="roster__item" data-goto-view="${role}" style="--c:${PLAYER_COLORS[role]}"><span class="b-dot b-dot--sm" aria-hidden="true">${roleNumber(role)}</span><span class="roster__txt"><span class="roster__name">${esc(displayName(role, state.nicknames))}</span>${title}${sum}</span></button></li>`;
  }).join('')}</ul>`;
  const withUtils = ROLES.filter((role) => s.roles[role].utilities.length);
  const utils = withUtils.length
    ? `<ul class="kit">${withUtils
        .map((role) => `<li>${playerChip(role)}<span>${s.roles[role].utilities.map((u) => richText(u.text)).join(', ')}</span></li>`)
        .join('')}</ul>`
    : '';
  return (
    head(recapMeta(), `<h2 class="b-title">${esc(s.title.text || 'Sans titre')}</h2>`) +
    section('Déroulé', steps) +
    section('Rôles', roster) +
    (utils ? section(esc(s.labels.utilitiesHeading.text), utils) : '')
  );
}

function renderRoleRecap(role) {
  const s = state.strategy;
  const r = s.roles[role];
  const steps = timeline((st) => {
    const missions = st.roles[role] ?? [];
    const body = missions.length
      ? `<ul class="tl__missions">${missions.map((m) => `<li>${richText(m.text)}</li>`).join('')}</ul>`
      : `<p class="b-none">${esc(s.labels.noNewInstruction.text)}</p>`;
    return body + inlineCalls(callsFor(st, role));
  });
  return (
    head(recapMeta(), playerHead(role)) +
    (r.summary.text ? section('Ton rôle', `<p class="b-text">${richText(r.summary.text)}</p>`) : '') +
    section('Tes missions', steps, 'b-sec--tl') +
    (r.utilities.length ? section(esc(s.labels.utilitiesHeading.text), utilsList(role)) : '')
  );
}

function renderBrief() {
  const role = state.view === TEAM ? null : state.view;
  const el = $('consignes');
  el.classList.toggle('brief--recap', isRecap());
  // Couleur du joueur suivi : barre des consignes et pastille.
  if (role) el.style.setProperty('--c', PLAYER_COLORS[role]);
  else el.style.removeProperty('--c');
  if (isRecap()) {
    el.innerHTML = role ? renderRoleRecap(role) : renderTeamRecap();
    return;
  }
  const step = currentStep();
  el.innerHTML = role ? renderRoleBrief(step, role) : renderTeamBrief(step);
}

// Récap équipe : toucher un joueur ouvre sa vue.
$('consignes').addEventListener('click', (e) => {
  const goView = e.target.closest('[data-goto-view]');
  if (goView) setState({ view: goView.dataset.gotoView });
});

function renderSteps() {
  const recap = recapStep();
  $('step-dots').innerHTML =
    state.strategy.steps
      .map(
        (s) =>
          `<li><button type="button" class="dot" data-step="${s.n}" ${s.n === state.step ? 'aria-current="step"' : ''} aria-label="Étape ${s.n} : ${esc(s.title.text)}">${s.n}</button></li>`,
      )
      .join('') +
    `<li class="steps__recap"><button type="button" class="dot dot--recap" data-step="${recap}" ${isRecap() ? 'aria-current="step"' : ''} aria-label="Récap de la stratégie">Récap</button></li>`;
  $('prev').disabled = state.step <= STEP_MIN;
  $('next').disabled = state.step >= recap;
  // Stratégie longue sur petit écran : la barre défile et garde la pastille active visible.
  const box = $('step-dots');
  const cur = box.querySelector('[aria-current]')?.parentElement;
  if (cur && box.scrollWidth > box.clientWidth) box.scrollLeft = cur.offsetLeft - (box.clientWidth - cur.offsetWidth) / 2;
}

function renderEmpty() {
  const side = SIDES[state.side];
  $('empty-text').textContent = `Aucune stratégie ${side.label} sur ${map.name} pour l'instant.`;
  $('empty-new').textContent = `Créer une stratégie ${side.short}`;
  document.title = `${map.name} · ${side.label} · Stratbook`;
  $('announce').textContent = `Side ${side.label}, aucune stratégie`;
}

function render(mapOpts) {
  renderHeader();
  const has = Boolean(state.strategy);
  $('controls').hidden = !has;
  $('layout').hidden = !has;
  $('empty').hidden = has;
  $('play').hidden = !has;
  if (!has) return renderEmpty();
  document.body.dataset.view = state.view === TEAM ? 'team' : 'role';
  const where = isRecap() ? 'Récap' : `Étape ${state.step}`;
  document.title = `${where} · ${state.strategy.title.text} · Stratbook`;
  renderViews();
  renderMap(mapOpts);
  renderBrief();
  renderSteps();
  // Annonce courte pour les lecteurs d'écran, au lieu de relire tout le volet.
  const who = state.view === TEAM ? 'vue équipe' : displayName(state.view, state.nicknames);
  $('announce').textContent = `${isRecap() ? 'Récap de la stratégie' : `Étape ${state.step} sur ${stepLast}`}, ${who}`;
}

// ---------- Interactions ----------
$('views').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view]');
  if (btn) setState({ view: btn.dataset.view });
});

// Toucher un joueur sur la carte ouvre sa vue.
$('map').addEventListener('click', (e) => {
  const p = e.target.closest('.player');
  if (p) setState({ view: p.dataset.role }, { focusBrief: false });
});

$('step-dots').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-step]');
  if (btn) setState({ step: Number(btn.dataset.step) });
});
$('prev').addEventListener('click', () => setState({ step: toStep(state.step - 1) }));
$('next').addEventListener('click', () => setState({ step: toStep(state.step + 1) }));

// Flèches gauche et droite du clavier pour changer d'étape (hors champs de saisie et éditeur).
document.addEventListener('keydown', (e) => {
  if (document.body.dataset.mode !== 'view' || !state.strategy) return;
  if (e.target.closest?.('input, textarea, select, .menu')) return;
  if (document.querySelector('dialog[open]') || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'ArrowLeft') setState({ step: toStep(state.step - 1) });
  if (e.key === 'ArrowRight') setState({ step: toStep(state.step + 1) });
});

// ---------- Lecture : toute la stratégie, du départ à la dernière étape ----------
const HOLD = 900; // pause sur chaque étape (ms)
let playing = false;
let playTimer = 0;

function updatePlayButton() {
  const btn = $('play');
  btn.setAttribute('aria-pressed', String(playing));
  btn.querySelector('.play__label').textContent = playing ? 'Arrêter' : 'Lecture';
}

function stopPlay() {
  if (!playing) return;
  playing = false;
  clearTimeout(playTimer);
  updatePlayButton();
}

function playStep(n, from) {
  state.step = n;
  syncUrl();
  render({
    from,
    onDone: () => {
      if (!playing) return;
      const hold = reducedMotion() ? HOLD * 2 : HOLD;
      playTimer = setTimeout(() => (n < stepLast ? playStep(n + 1, n) : stopPlay()), hold);
    },
  });
}

$('play').addEventListener('click', () => {
  if (playing) return stopPlay();
  playing = true;
  updatePlayButton();
  playStep(STEP_MIN, 0); // 0 = position de départ
});

// ---------- Pseudos ----------
const dialog = $('nicks-dialog');
$('open-nicks').addEventListener('click', () => {
  stopPlay();
  $('nicks-fields').innerHTML = ROLES.map((role, i) => {
    const id = `nick-${role}`;
    const title = state.strategy?.roles[role].title.text;
    return `<div class="field" style="--c:${PLAYER_COLORS[role]}"><label for="${id}"><span class="view__dot" aria-hidden="true">${roleNumber(role)}</span>J${roleNumber(role)}${title ? `, ${esc(title)}` : ''}</label><input id="${id}" name="${role}" type="text" maxlength="${NICK_MAX}" autocomplete="off" autocapitalize="words" enterkeyhint="next" value="${esc(state.nicknames[i])}" placeholder="J${roleNumber(role)}" /></div>`;
  }).join('');
  dialog.showModal();
});
$('nicks-cancel').addEventListener('click', () => dialog.close());
$('nicks-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const nicknames = ROLES.map((r) => cleanNickname(form.get(r)));
  const saved = store.saveNicknames(nicknames);
  dialog.close();
  setState({ nicknames });
  toast(saved ? 'Pseudos enregistrés' : 'Pseudos appliqués (stockage indisponible sur ce navigateur)');
});

// ---------- Partage ----------
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Repli pour les navigateurs sans API presse-papiers.
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand?.('copy') ?? false;
    ta.remove();
    return ok;
  }
}

$('share').addEventListener('click', async () => {
  stopPlay();
  const s = state.strategy;
  // Stratégie présente seulement sur ce téléphone : elle est jointe au lien.
  if (s && library.isLocalCopy(s.id) && !shareData[s.id]) shareData[s.id] = await encodeStrategy(s);
  const url = buildShareUrl(location.href, s?.id, urlState(), { data: s ? shareData[s.id] : undefined });
  const who = state.view === TEAM ? 'vue équipe' : displayName(state.view, state.nicknames);
  const title = s ? `${s.title.text}, ${isRecap() ? 'récap' : `étape ${state.step}`} (${who})` : 'Stratbook';
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // partage annulé par l'utilisateur
    }
  }
  toast((await copy(url)) ? 'Lien copié' : `Copie impossible, voici le lien : ${url}`);
});

// ---------- Ouverture ----------
async function init() {
  const params = parseParams(location.search);
  const initial = resolveInitial(params, store.read());
  if (initial.adoptLinkNicknames) store.saveNicknames(initial.nicknames);
  state.view = initial.view;
  state.nicknames = initial.nicknames;

  let id = params.strategyId;
  let message = '';
  // Lien avec une stratégie jointe : elle est ajoutée (ou mise à jour) sur ce téléphone.
  if (params.data) {
    const received = sanitizeStrategy(await decodeStrategy(params.data));
    if (received) {
      const existing = library.get(received.id);
      if (!existing || !sameContent(existing, received)) {
        library.save(received);
        message = `Stratégie « ${received.title.text} » ${existing ? 'mise à jour' : 'ajoutée'}`;
      }
      id = received.id;
    } else message = 'Stratégie du lien illisible';
  }
  if (!library.has(id)) id = null;
  if (!id && params.side) id = library.list({ map: MAP_ID, side: params.side })[0]?.id ?? null;
  if (!id && !params.side) id = [library.lastId(), DEFAULT_STRATEGY_ID].find((x) => x && library.has(x)) ?? null;

  if (id) selectStrategy(id, { step: initial.step });
  else state.side = params.side ?? 't';
  syncUrl();
  render({ from: null });
  if (message) toast(message);
}

init();
