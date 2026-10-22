import { pickStrategy } from './strategies.js';
import { renderStepSvg, PLAYER_COLORS } from './map/render.js';
import { getMap } from './map/maps.js';
import { animateTransition } from './map/animate.js';
import {
  ROLES,
  TEAM,
  STEP_MIN,
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

const $ = (id) => document.getElementById(id);
const store = createStore(globalThis.localStorage);
const strategy = pickStrategy(new URLSearchParams(location.search).get('s'));
const map = getMap(strategy.map);
const imageHref = `${import.meta.env.BASE_URL}${map.background.href}`;
const STEP_LAST = strategy.steps.length;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const GROUP_LABEL = { long: 'Long', short: 'Short', all: 'Toute l’équipe' };

// ---------- État ----------
const initial = resolveInitial(parseParams(location.search), store.read());
if (initial.adoptLinkNicknames) store.saveNicknames(initial.nicknames);
const state = { step: clampStep(initial.step, STEP_LAST), view: initial.view, nicknames: initial.nicknames };

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
  const url = buildShareUrl(location.href, strategy.id, state);
  history.replaceState(null, '', url);
}

// ---------- Petits outils de rendu ----------
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function playerChip(role) {
  return `<span class="chip chip--${role}" style="--c:${PLAYER_COLORS[role]}">${esc(displayName(role, state.nicknames))}</span>`;
}

// Remplace « J1 » … « J5 » dans un texte par une étiquette colorée avec le pseudo.
function richText(text) {
  return esc(text).replace(/\bJ([1-5])\b/g, (_, n) => playerChip(`j${n}`));
}

function callChip(call) {
  return `<li class="call"><svg class="call__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none"/></svg><span class="call__text">« ${esc(call.text)} »</span><span class="call__who">${esc(GROUP_LABEL[call.group] ?? '')}</span></li>`;
}

const currentStep = () => strategy.steps.find((s) => s.n === state.step);

// ---------- Rendu ----------
function renderViews() {
  const items = [{ id: TEAM, label: 'Équipe' }, ...ROLES.map((r) => ({ id: r }))];
  $('views').innerHTML = items
    .map(({ id, label }) => {
      const active = state.view === id;
      if (id === TEAM)
        return `<button type="button" class="view view--team" data-view="${id}" aria-pressed="${active}">${label}</button>`;
      const nick = state.nicknames[ROLES.indexOf(id)];
      // Nom accessible = texte visible (« Greg » ou « J2 ») complété par le numéro de rôle (WCAG 2.5.3).
      const extra = nick ? `<span class="sr"> · J${roleNumber(id)}</span>` : '';
      return `<button type="button" class="view" data-view="${id}" aria-pressed="${active}" style="--c:${PLAYER_COLORS[id]}"><span class="view__dot" aria-hidden="true">${roleNumber(id)}</span><span class="view__nick">${esc(nick || `J${roleNumber(id)}`)}</span>${extra}</button>`;
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
  $('map').innerHTML = renderStepSvg(strategy, state.step, { focus, imageHref, map });
  $('map-note').textContent = strategy.mapNote.text;
  const svg = $('map').querySelector('svg');
  const animate = from !== null && from !== state.step && !reducedMotion();
  shownStep = state.step;
  if (!animate) return onDone();
  cancelAnim = animateTransition(svg, strategy, from, state.step, {
    onDone: () => {
      cancelAnim = () => {};
      onDone();
    },
  });
}

function renderTeamBrief(step) {
  const groups = step.team
    .map(
      (t) =>
        `<li class="plan"><span class="plan__group">${esc(GROUP_LABEL[t.group] ?? t.group)}</span><p>${richText(t.text)}</p></li>`,
    )
    .join('');
  const calls = step.calls.length
    ? `<h3 class="brief__h">Appels</h3><ul class="calls">${step.calls.map(callChip).join('')}</ul>`
    : '';
  return `<h2 class="brief__title">Plan de l’équipe</h2><ul class="plans">${groups}</ul>${calls}`;
}

function renderRoleBrief(step, role) {
  const r = strategy.roles[role];
  const missions = step.roles[role];
  const missionHtml = missions.length
    ? `<ul class="missions">${missions.map((m) => `<li>${richText(m.text)}</li>`).join('')}</ul>`
    : `<p class="missions missions--none">${esc(strategy.labels.noNewInstruction.text)}</p>`;
  const myCalls = step.calls.filter((c) => c.group === r.group || c.group === 'all');
  const calls = myCalls.length
    ? `<h3 class="brief__h">Appels</h3><ul class="calls">${myCalls.map(callChip).join('')}</ul>`
    : '';
  const utils = r.utilities.length
    ? `<h3 class="brief__h">${esc(strategy.labels.utilitiesHeading.text)}</h3><ul class="utils">${r.utilities
        .map((u) => `<li>${richText(u.text)}</li>`)
        .join('')}</ul>`
    : '';
  return `<h2 class="brief__title brief__title--role" style="--c:${PLAYER_COLORS[role]}"><span class="brief__dot" aria-hidden="true">${roleNumber(role)}</span>${esc(displayName(role, state.nicknames))}</h2>
    <p class="brief__role">${esc(r.title.text)}</p>
    <h3 class="brief__h">Ta mission</h3>${missionHtml}${calls}
    <h3 class="brief__h">Ton rôle</h3><p>${richText(r.summary.text)}</p>${utils}`;
}

function renderBrief() {
  const step = currentStep();
  const body = state.view === TEAM ? renderTeamBrief(step) : renderRoleBrief(step, state.view);
  $('consignes').innerHTML = `<p class="brief__step">Étape ${step.n} sur ${STEP_LAST} : ${esc(step.title.text)}</p>${body}`;
}

function renderSteps() {
  $('step-dots').innerHTML = strategy.steps
    .map(
      (s) =>
        `<li><button type="button" class="dot" data-step="${s.n}" ${s.n === state.step ? 'aria-current="step"' : ''} aria-label="Étape ${s.n} : ${esc(s.title.text)}">${s.n}</button></li>`,
    )
    .join('');
  $('step-title').textContent = currentStep().title.text;
  $('prev').disabled = state.step <= STEP_MIN;
  $('next').disabled = state.step >= STEP_LAST;
}

function render(mapOpts) {
  document.body.dataset.view = state.view === TEAM ? 'team' : 'role';
  document.title = `Étape ${state.step} · ${strategy.title.text} · Stratbook`;
  renderViews();
  renderMap(mapOpts);
  renderBrief();
  renderSteps();
  // Annonce courte pour les lecteurs d'écran, au lieu de relire tout le volet.
  const who = state.view === TEAM ? 'vue équipe' : displayName(state.view, state.nicknames);
  $('announce').textContent = `Étape ${state.step} sur ${STEP_LAST}, ${who}`;
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
$('prev').addEventListener('click', () => setState({ step: clampStep(state.step - 1, STEP_LAST) }));
$('next').addEventListener('click', () => setState({ step: clampStep(state.step + 1, STEP_LAST) }));

// Flèches gauche et droite du clavier pour changer d'étape (hors champs de saisie).
document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select')) return;
  if (document.querySelector('dialog[open]') || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'ArrowLeft') setState({ step: clampStep(state.step - 1, STEP_LAST) });
  if (e.key === 'ArrowRight') setState({ step: clampStep(state.step + 1, STEP_LAST) });
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
      playTimer = setTimeout(() => (n < STEP_LAST ? playStep(n + 1, n) : stopPlay()), hold);
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
  $('nicks-fields').innerHTML = ROLES.map((role, i) => {
    const id = `nick-${role}`;
    return `<div class="field" style="--c:${PLAYER_COLORS[role]}"><label for="${id}"><span class="view__dot" aria-hidden="true">${roleNumber(role)}</span>J${roleNumber(role)}, ${esc(strategy.roles[role].title.text)}</label><input id="${id}" name="${role}" type="text" maxlength="${NICK_MAX}" autocomplete="off" autocapitalize="words" enterkeyhint="next" value="${esc(state.nicknames[i])}" placeholder="J${roleNumber(role)}" /></div>`;
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
let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('toast--on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('toast--on'), 3000);
}

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
  const url = buildShareUrl(location.href, strategy.id, state);
  const who = state.view === TEAM ? 'vue équipe' : displayName(state.view, state.nicknames);
  const title = `${strategy.title.text}, étape ${state.step} (${who})`;
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

syncUrl();
render({ from: null });
