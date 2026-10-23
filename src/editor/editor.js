// Éditeur de stratégie : création et modification, directement dans l'application.
// - textes du volet de consignes (même structure que l'affichage) ;
// - placement des joueurs à la main sur la carte, étape par étape, trajets calculés automatiquement ;
// - regard (cône), allure (course ou shift) et utilitaires posés sur la carte ;
// - point de passage à glisser sur un trajet pour choisir l'itinéraire (Mid plutôt que Long…) ;
// - Défaire / Refaire (boutons sous la carte, Ctrl+Z hors des champs de texte) ;
// - sur téléphone, la carte reste visible en haut pendant qu'on écrit les consignes de l'étape.
// Les opérations sur les données sont dans ops.js (testées) ; ce fichier gère l'écran.
import { $, esc, toast, confirmDialog, svgPoint } from '../ui.js';
import {
  ROLES,
  SIDES,
  ROLE_GROUPS,
  GROUP_PRESETS,
  MAX_STEPS,
  UTILITY_TYPES,
  createStrategy,
  sanitizeStrategy,
  txt,
} from '../model.js';
import {
  prepareDraft,
  setPosition,
  setLook,
  setPace,
  movesDuring,
  addStep,
  removeStep,
  addUtility,
  moveUtility,
  removeUtility,
  validateDraft,
  finalizeDraft,
  setVia,
  clearVia,
  routeMidpoint,
} from './ops.js';
import { createHistory } from './history.js';
import { renderStepSvg, PLAYER_COLORS, placePlayer, placeCone, scaleFor, UTILITY_NAME, UTILITY_LETTER, utilityPoint } from '../map/render.js';
import { positionAt, facing } from '../map/routes.js';
import { getMap } from '../map/maps.js';
import { attachZoom } from '../map/zoom.js';

const DRAFT_KEY = 'stratbook:brouillon';
const BG = '#0F1720';
const HANDLE_DISTANCE = 95;
const DRAG_THRESHOLD = 3; // px à l'écran : en dessous, c'est un simple toucher

let ctx = null;
let edZoom = null;

const storage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const label = (role) => `J${role.slice(1)}`;
const dot = (role, cls = 'view__dot') => `<span class="${cls}" style="--c:${PLAYER_COLORS[role]}" aria-hidden="true">${role.slice(1)}</span>`;
const groupOptions = (list, selected) =>
  list.map((g) => `<option value="${g.id}"${g.id === selected ? ' selected' : ''}>${esc(g.label)}</option>`).join('');

/**
 * Ouvre l'éditeur.
 * @param {object} opts
 * @param {object|null} opts.strategy  stratégie à modifier, null pour en créer une
 * @param {'t'|'ct'} opts.side         side d'une nouvelle stratégie
 * @param {'repo'|'local'|null} opts.origin  dans le dépôt GitHub, seulement sur ce téléphone, ou nouvelle
 * @param {(s: object) => Promise<boolean>} opts.publish  publie dans GitHub (true si c'est fait)
 * @param {(s: object) => Promise<boolean>} opts.remove   supprime du dépôt (true si c'est fait)
 * @param {Function} opts.onClose      appelée avec { savedId, step } ou { deletedId, step } ou {}
 * @param {number} [opts.step]         étape affichée à l'ouverture
 */
export function openEditor({ strategy, side, origin = null, publish, remove, onClose, step = 1 }) {
  const isNew = !strategy;
  const key = isNew ? `new:${side}` : strategy.id;
  let draft = isNew ? createStrategy({ mapId: 'dust2', side }) : prepareDraft(strategy);
  let restored = false;
  try {
    const saved = JSON.parse(storage()?.getItem(DRAFT_KEY) ?? 'null');
    const clean = saved?.key === key ? sanitizeStrategy(saved.draft) : null;
    if (clean) {
      draft = prepareDraft(clean);
      restored = true;
    }
  } catch {
    /* brouillon illisible : ignoré */
  }
  const map = getMap(draft.map);
  ctx = {
    draft,
    map,
    frame: map.viewBox,
    key,
    isNew,
    publish,
    remove,
    onClose,
    origin: isNew ? null : origin,
    step: Math.min(Math.max(1, step), draft.steps.length), // l'éditeur s'ouvre sur l'étape affichée
    selected: null, // { kind: 'player', role } ou { kind: 'utility', index }
    placing: null, // utilitaire en attente d'un toucher sur la carte : { type, by }
    utilBy: 'j1',
    dirty: restored,
    moved: restored,
    groupsTouched: restored,
    history: createHistory(),
    typing: null, // saisie en cours : une seule entrée d'historique par champ et par rafale de frappe
  };
  $('editor-title').textContent = isNew ? `Nouvelle stratégie ${SIDES[side].short}` : 'Modifier la stratégie';
  $('editor').hidden = false;
  renderBody();
  // La carte de l'éditeur est recréée à chaque ouverture : on y rattache zoom et glisser-déposer.
  edZoom = attachZoom($('ed-map'), ctx.frame, { touchAction: 'none' });
  bindMap();
  renderStep();
  updateHistoryButtons();
  watchStage();
  if (restored) toast('Brouillon restauré');
  $('ed-title').focus({ preventScroll: true });
}

function close(result = {}) {
  stageObserver?.disconnect();
  $('editor').hidden = true;
  $('editor-body').innerHTML = '';
  const { onClose } = ctx;
  ctx = null;
  onClose(result);
}

// ---------- Brouillon (gardé sur le téléphone en cas de fermeture accidentelle) ----------
let draftTimer = 0;
function changed() {
  ctx.dirty = true;
  clearTimeout(draftTimer);
  const { key, draft } = ctx;
  draftTimer = setTimeout(() => {
    try {
      storage()?.setItem(DRAFT_KEY, JSON.stringify({ key, draft }));
    } catch {
      /* stockage indisponible */
    }
  }, 300);
}
function clearDraft() {
  clearTimeout(draftTimer);
  try {
    storage()?.removeItem(DRAFT_KEY);
  } catch {
    /* rien */
  }
}

// ---------- Défaire / Refaire ----------
const snap = () => JSON.stringify({ draft: ctx.draft, step: ctx.step });
const draftText = () => JSON.stringify(ctx.draft);

/** Exécute une modification ; si le brouillon a changé, l'état d'avant peut être rétabli. */
function undoable(fn) {
  const before = snap();
  const beforeDraft = draftText();
  const result = fn();
  if (draftText() !== beforeDraft) {
    ctx.history.record(before);
    ctx.typing = null;
    changed();
  }
  updateHistoryButtons();
  return result;
}

function updateHistoryButtons() {
  if (!ctx) return;
  $('ed-undo').disabled = !ctx.history.canUndo;
  $('ed-redo').disabled = !ctx.history.canRedo;
}

function restore(text) {
  const { draft, step } = JSON.parse(text);
  ctx.draft = draft;
  ctx.step = Math.min(Math.max(0, step), draft.steps.length);
  ctx.selected = null;
  ctx.placing = null;
  ctx.typing = null;
  changed();
  $('ed-title').value = draft.title.text;
  $('ed-side').querySelectorAll('[data-side]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.side === sideKey())));
  $('ed-roles').innerHTML = ROLES.map(roleFields).join('');
  renderStep();
  updateHistoryButtons();
}

function undo() {
  const prev = ctx?.history.undo(snap());
  if (prev) {
    restore(prev);
    announce('Action défaite');
  }
}

function redo() {
  const next = ctx?.history.redo(snap());
  if (next) {
    restore(next);
    announce('Action refaite');
  }
}

const announce = (text) => ($('announce').textContent = text);

// ---------- Carte visible pendant la saisie (téléphone) ----------
// La carte reste collée en haut de l'écran pendant qu'on écrit les consignes de l'étape ;
// clavier ouvert, elle se réduit pour laisser la place au texte.
let stageObserver = null;
function watchStage() {
  const stage = $('ed-stage');
  const root = document.documentElement.style;
  const set = () => {
    root.setProperty('--ed-sticky-h', `${Math.round(stage.getBoundingClientRect().height)}px`);
    root.setProperty('--ed-bar-h', `${Math.round(document.querySelector('.editor__bar').getBoundingClientRect().height)}px`);
  };
  stageObserver?.disconnect();
  if (typeof ResizeObserver === 'function') {
    stageObserver = new ResizeObserver(set);
    stageObserver.observe(stage);
  }
  set();
  onViewport();
}

function onViewport() {
  const vv = window.visualViewport;
  // Clavier ouvert : la zone visible est nettement plus basse que la fenêtre.
  const keyboard = Boolean(vv && vv.height < window.innerHeight * 0.75);
  $('editor').classList.toggle('editor--keyboard', keyboard);
}
window.visualViewport?.addEventListener('resize', onViewport);

/** Bouton retour du téléphone : comme « Annuler ». Renvoie true si l'éditeur est fermé. */
export async function editorBack() {
  if (!ctx) return true;
  if (ctx.dirty) {
    const ok = await confirmDialog({ title: 'Quitter sans enregistrer ?', text: 'Tes modifications seront perdues.', ok: 'Quitter', cancel: 'Continuer', danger: true });
    if (!ctx) return true;
    if (!ok) return false;
  }
  clearDraft();
  close({});
  return true;
}

// ---------- Structure de l'écran ----------
function renderBody() {
  const d = ctx.draft;
  const side = sideKey();
  const canRemove = !ctx.isNew;
  $('editor-body').innerHTML = `
    <section class="ed-card" aria-label="Général">
      <div class="ed-field">
        <label for="ed-title">Titre de la stratégie</label>
        <input id="ed-title" type="text" maxlength="80" autocomplete="off" data-bind="title" value="${esc(d.title.text)}" placeholder="Ex. Rush B, 5 joueurs" />
      </div>
      <div class="ed-field">
        <span class="ed-label" id="ed-side-label">Side</span>
        <div class="seg" role="group" aria-labelledby="ed-side-label" id="ed-side">
          ${Object.values(SIDES)
            .map((s) => `<button type="button" class="seg__btn seg__btn--${s.id}" data-side="${s.id}" aria-pressed="${s.id === side}">${s.label}</button>`)
            .join('')}
        </div>
      </div>
    </section>

    <section class="ed-steps" aria-labelledby="ed-steps-h">
      <h2 class="ed-h" id="ed-steps-h">Étapes et placement</h2>
      <div class="ed-tabs" id="ed-tabs" role="group" aria-label="Choix de l'étape"></div>
      <div class="ed-work">
        <div class="ed-board">
          <div class="ed-stage" id="ed-stage">
            <div class="ed-map" id="ed-map"></div>
            <div class="ed-under">
              <p class="ed-hint" id="ed-hint"></p>
              <div class="ed-history" role="group" aria-label="Historique des modifications">
                <button type="button" class="ed-hbtn" id="ed-undo" aria-label="Défaire" title="Défaire (Ctrl+Z)" disabled>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h9.5a5 5 0 0 1 0 10H11"/></svg>
                </button>
                <button type="button" class="ed-hbtn" id="ed-redo" aria-label="Refaire" title="Refaire (Ctrl+Maj+Z)" disabled>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 7l4.5 4.5L15 16"/><path d="M19 11.5H9.5a5 5 0 0 0 0 10H13"/></svg>
                </button>
              </div>
            </div>
          </div>
          <div class="ed-tools" id="ed-tools"></div>
        </div>
        <div class="ed-card ed-step-fields" id="ed-step-fields"></div>
      </div>
    </section>

    <section class="ed-card" aria-labelledby="ed-roles-h">
      <h2 class="ed-h" id="ed-roles-h">Rôles des joueurs</h2>
      <p class="ed-note">Affichés dans la vue de chaque joueur, à toutes les étapes.</p>
      <div class="ed-roles" id="ed-roles">${ROLES.map(roleFields).join('')}</div>
    </section>

    <section class="ed-card ed-more" aria-label="Autres actions">
      <p class="ed-note">« Enregistrer » publie la stratégie dans le dépôt GitHub : tes amis la voient avec le lien.</p>
      ${canRemove ? `<button type="button" class="btn btn--ghost btn--danger-text" id="ed-remove">Supprimer la stratégie</button>` : ''}
    </section>`;
}

const sideKey = () => (/^(ct\b|anti)/i.test(ctx.draft.side.text.trim()) ? 'ct' : 't');

function roleFields(role) {
  const r = ctx.draft.roles[role];
  const id = `ed-${role}`;
  return `<details class="ed-role" style="--c:${PLAYER_COLORS[role]}">
    <summary>${dot(role)}<span class="ed-role__name">${label(role)}</span><span class="ed-role__sum" data-sum="${role}">${esc(r.title.text || 'Rôle à définir')}</span></summary>
    <div class="ed-role__body">
      <div class="ed-field"><label for="${id}-group">Groupe</label><select id="${id}-group" data-bind="role-group" data-role="${role}">${groupOptions(ROLE_GROUPS, r.group)}</select></div>
      <div class="ed-field"><label for="${id}-title">Rôle</label><input id="${id}-title" type="text" maxlength="80" data-bind="role-title" data-role="${role}" value="${esc(r.title.text)}" placeholder="Ex. Entry, support, AWP" /></div>
      <div class="ed-field"><label for="${id}-summary">Résumé du rôle</label><textarea id="${id}-summary" rows="2" data-bind="role-summary" data-role="${role}">${esc(r.summary.text)}</textarea></div>
      <div class="ed-field"><label for="${id}-utils">Utilitaires</label><textarea id="${id}-utils" rows="3" data-bind="role-utils" data-role="${role}" placeholder="Un utilitaire par ligne">${esc(r.utilities.map((u) => u.text).join('\n'))}</textarea></div>
    </div>
  </details>`;
}

function renderTabs() {
  const n = ctx.draft.steps.length;
  const tabs = [{ n: 0, text: 'Départ', label: 'Départ du round' }, ...ctx.draft.steps.map((s) => ({ n: s.n, text: String(s.n), label: `Étape ${s.n}` }))];
  $('ed-tabs').innerHTML =
    tabs
      .map((t) => `<button type="button" class="ed-tab${t.n === 0 ? ' ed-tab--start' : ''}" data-step="${t.n}" aria-pressed="${t.n === ctx.step}" aria-label="${t.label}">${t.text}</button>`)
      .join('') +
    `<button type="button" class="ed-tab ed-tab--add" id="ed-add-step" aria-label="Ajouter une étape"${n >= MAX_STEPS ? ' disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`;
}

/** Tout ce qui dépend de l'étape choisie. */
function renderStep() {
  renderTabs();
  renderMap();
  renderTools();
  renderStepFields();
}

// ---------- Carte de l'éditeur ----------
function viewStrategy() {
  const d = ctx.draft;
  if (ctx.step >= 1) return { s: d, n: ctx.step };
  // Départ : affiché comme une étape sans trajet ni utilitaire, regard de l'étape 1.
  const s = { ...d, start: undefined, steps: [{ n: 1, map: { positions: d.start, look: d.steps[0].map.look, moves: [], utilities: [] } }] };
  return { s, n: 1 };
}

function renderMap() {
  const { s, n } = viewStrategy();
  const sel = ctx.selected?.kind === 'player' ? ctx.selected.role : null;
  const k = scaleFor(ctx.frame);
  const imageHref = `${import.meta.env.BASE_URL}${ctx.map.background.href}`;
  const host = $('ed-map');
  host.innerHTML = renderStepSvg(s, n, { map: ctx.map, frame: ctx.frame, imageHref, highlight: sel, uid: 'ed', hitArea: false });
  const svg = host.querySelector('svg');
  svg.setAttribute('aria-label', ctx.step ? `Placement des joueurs, étape ${ctx.step}` : 'Placement des joueurs au départ');

  // Fantômes : position de l'étape précédente des joueurs qui bougent.
  let ghosts = '';
  if (ctx.step >= 1)
    for (const r of ROLES) {
      if (!movesDuring(ctx.draft, ctx.step, r)) continue;
      const [x, y] = positionAt(ctx.draft, ctx.step - 1, r);
      ghosts += `<circle cx="${x}" cy="${y}" r="${13 * k}" fill="${BG}" fill-opacity="0.6" stroke="${PLAYER_COLORS[r]}" stroke-width="${3 * k}" stroke-dasharray="${4 * k} ${4 * k}"/>`;
    }
  svg.querySelector('.moves').insertAdjacentHTML('beforebegin', `<g class="ed-ghosts" aria-hidden="true">${ghosts}</g>`);

  // Zones de prise plus larges que les jetons, et poignée de regard du joueur choisi.
  const pos = s.steps.find((x) => x.n === n).map.positions;
  let top = ROLES.map((r) => `<circle class="ed-hit" data-role="${r}" cx="${pos[r][0]}" cy="${pos[r][1]}" r="${26 * k}" fill="transparent"/>`)
    .sort((a, b) => a.includes(`"${sel}"`) - b.includes(`"${sel}"`))
    .join('');
  // Point de passage du joueur choisi : losange plein s'il est imposé, en pointillés sinon (à glisser).
  const move = sel && ctx.step >= 1 ? currentMap().moves.find((mv) => mv.role === sel) : null;
  if (move) {
    const [vx, vy] = move.via?.[0] ?? routeMidpoint(move.path);
    const set = Boolean(move.via?.length);
    const h = 10 * k;
    top += `<g class="ed-via${set ? ' is-set' : ''}" data-role="${sel}" transform="translate(${vx} ${vy})"><circle r="${24 * k}" fill="transparent"/><rect x="${-h}" y="${-h}" width="${2 * h}" height="${2 * h}" transform="rotate(45)" fill="${set ? PLAYER_COLORS[sel] : BG}" stroke="#E8EEF4" stroke-width="${3 * k}"${set ? '' : ` stroke-dasharray="${3 * k} ${2.5 * k}"`}/></g>`;
  }
  if (sel && ctx.step >= 1) {
    const [hx, hy] = handlePoint(sel);
    const [px, py] = pos[sel];
    top += `<g class="ed-look" data-role="${sel}"><line x1="${px}" y1="${py}" x2="${hx}" y2="${hy}" stroke="#E8EEF4" stroke-width="${2 * k}" stroke-dasharray="${3 * k} ${3 * k}"/><circle cx="${hx}" cy="${hy}" r="${24 * k}" fill="transparent"/><circle cx="${hx}" cy="${hy}" r="${9 * k}" fill="#E8EEF4" stroke="${BG}" stroke-width="${3 * k}"/></g>`;
  }
  if (ctx.selected?.kind === 'utility') {
    const u = currentMap().utilities[ctx.selected.index];
    if (u) {
      const [ux, uy] = utilityPoint(u, zoneById());
      svg.querySelector('.utilities').insertAdjacentHTML('beforeend', `<circle cx="${ux}" cy="${uy}" r="${27 * k}" fill="none" stroke="#E8EEF4" stroke-width="${3 * k}" pointer-events="none"/>`);
    }
  }
  svg.insertAdjacentHTML('beforeend', `<g class="ed-top">${top}</g>`);
  svg.classList.toggle('is-placing', Boolean(ctx.placing));
  edZoom?.apply();
}

const currentMap = () => ctx.draft.steps[ctx.step - 1].map;
const zoneById = () => Object.fromEntries(ctx.map.zones.map((z) => [z.id, z]));

function handlePoint(role, look = currentMap().look[role]) {
  const pos = currentMap().positions[role];
  const deg = (facing(pos, look) * Math.PI) / 180;
  const r = HANDLE_DISTANCE * scaleFor(ctx.frame);
  return [Math.round(pos[0] + Math.cos(deg) * r), Math.round(pos[1] + Math.sin(deg) * r)];
}

// Glisser-déposer des jetons, de la poignée de regard et des utilitaires.
function bindMap() {
  const host = $('ed-map');
  let drag = null;

  host.addEventListener(
    'pointerdown',
    (e) => {
      if (!ctx) return;
      const svg = host.querySelector('svg');
      if (!svg || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const t = e.target;
      // Utilitaire en attente : le toucher le pose.
      if (ctx.placing && ctx.step >= 1) {
        e.stopImmediatePropagation();
        e.preventDefault();
        const at = svgPoint(svg, e.clientX, e.clientY);
        const index = undoable(() => addUtility(ctx.draft, ctx.step, { ...ctx.placing, at }));
        ctx.placing = null;
        ctx.selected = { kind: 'utility', index };
        renderMap();
        renderTools();
        return;
      }
      const look = t.closest('.ed-look');
      const via = t.closest('.ed-via');
      const hit = t.closest('.ed-hit, .player');
      const util = t.closest('.utility');
      let target = null;
      if (look) target = { kind: 'look', role: look.dataset.role };
      else if (via) target = { kind: 'via', role: via.dataset.role };
      else if (util && ctx.step >= 1) target = { kind: 'utility', index: Number(util.dataset.index) };
      else if (hit) target = { kind: 'player', role: hit.dataset.role };
      if (!target) return; // carte vide : zoom et déplacement
      e.stopImmediatePropagation();
      e.preventDefault();
      try {
        host.setPointerCapture(e.pointerId); // le doigt garde le jeton même s'il sort de la carte
      } catch {
        /* pointeur déjà relâché : sans importance */
      }
      drag = { ...target, id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, point: null };
      if (target.kind !== 'look' && target.kind !== 'via') {
        const before = JSON.stringify(ctx.selected);
        ctx.selected = target.kind === 'player' ? { kind: 'player', role: target.role } : { kind: 'utility', index: target.index };
        if (JSON.stringify(ctx.selected) !== before) {
          renderMap();
          renderTools();
        }
      }
    },
    true,
  );

  host.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_THRESHOLD) return;
    drag.moved = true;
    const svg = host.querySelector('svg');
    const p = svgPoint(svg, e.clientX, e.clientY);
    drag.point = p;
    const k = scaleFor(ctx.frame);
    if (drag.kind === 'player') {
      svg.querySelector(`.player[data-role="${drag.role}"]`)?.setAttribute('transform', placePlayer(p, k));
      const look = ctx.step >= 1 ? currentMap().look[drag.role] : ctx.draft.steps[0].map.look[drag.role];
      svg.querySelector(`.cone[data-role="${drag.role}"]`)?.setAttribute('transform', placeCone(p, facing(p, look), k));
      svg.querySelector('.ed-look')?.setAttribute('visibility', 'hidden');
    } else if (drag.kind === 'look') {
      const pos = currentMap().positions[drag.role];
      svg.querySelector(`.cone[data-role="${drag.role}"]`)?.setAttribute('transform', placeCone(pos, facing(pos, p), k));
      const [hx, hy] = handlePoint(drag.role, p);
      const g = svg.querySelector('.ed-look');
      g.querySelector('line').setAttribute('x2', hx);
      g.querySelector('line').setAttribute('y2', hy);
      for (const c of g.querySelectorAll('circle')) c.setAttribute('cx', hx), c.setAttribute('cy', hy);
    } else if (drag.kind === 'via') {
      svg.querySelector('.ed-via')?.setAttribute('transform', `translate(${p[0]} ${p[1]})`);
    } else if (drag.kind === 'utility') {
      const u = currentMap().utilities[drag.index];
      const [ux, uy] = utilityPoint(u, zoneById());
      svg.querySelector(`.utility[data-index="${drag.index}"]`)?.setAttribute('transform', `translate(${p[0] - ux} ${p[1] - uy})`);
    }
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moved || !d.point || e.type === 'pointercancel') {
      if (d.moved) renderMap();
      return;
    }
    undoable(() => {
      if (d.kind === 'player') {
        setPosition(ctx.draft, ctx.map, ctx.step, d.role, d.point);
        ctx.moved = true;
      } else if (d.kind === 'look') setLook(ctx.draft, ctx.step, d.role, d.point);
      else if (d.kind === 'via') setVia(ctx.draft, ctx.map, ctx.step, d.role, d.point);
      else if (d.kind === 'utility') moveUtility(ctx.draft, ctx.map, ctx.step, d.index, d.point);
    });
    renderMap();
    renderTools();
  };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);

  // Toucher la carte à vide : désélection.
  host.addEventListener('click', (e) => {
    if (!ctx || ctx.placing || !ctx.selected) return;
    if (e.target.closest('.ed-hit, .player, .utility, .ed-look, .ed-via')) return;
    ctx.selected = null;
    renderMap();
    renderTools();
  });
}

// ---------- Outils sous la carte ----------
function renderTools() {
  const n = ctx.step;
  const sel = ctx.selected;
  $('ed-hint').textContent =
    n === 0
      ? 'Départ du round : glisse les joueurs à leur position de départ.'
      : `Glisse un joueur là où il finit l'étape ${n}. Son trajet est calculé tout seul. Pince pour zoomer.`;
  const via = n >= 1 && sel?.kind === 'player' ? currentMap().moves.find((m) => m.role === sel.role)?.via : null;
  let html = '';
  if (n >= 1 && ctx.placing) {
    html = `<div class="ed-tool ed-tool--placing"><p><strong>Touche la carte</strong> pour poser : ${esc(UTILITY_NAME[ctx.placing.type])} de ${label(ctx.placing.by)}</p><button type="button" class="btn btn--ghost" data-tool="cancel-place">Annuler</button></div>`;
  } else if (n >= 1 && sel?.kind === 'utility' && currentMap().utilities[sel.index]) {
    const u = currentMap().utilities[sel.index];
    html = `<div class="ed-tool"><p>${dot(u.by)} <strong>${esc(UTILITY_NAME[u.type])}</strong> de ${label(u.by)}. Glisse-le pour le déplacer.</p><button type="button" class="btn btn--ghost btn--danger-text" data-tool="remove-util">Supprimer</button></div>`;
  } else if (n >= 1 && sel?.kind === 'player') {
    const moving = movesDuring(ctx.draft, n, sel.role);
    const pace = currentMap().moves.find((m) => m.role === sel.role)?.pace ?? 'run';
    const tip = moving
      ? `Glisse le point blanc pour orienter son regard, et le losange pour choisir par où il passe.`
      : 'Glisse le point blanc pour orienter son regard.';
    html = `<div class="ed-tool"><div class="ed-tool__who"><p>${dot(sel.role)} <strong>${label(sel.role)}</strong></p><p class="ed-note">${tip}</p>${
      via ? `<button type="button" class="ed-link" data-tool="clear-via">Retirer le point de passage</button>` : ''
    }</div>${
      moving
        ? `<div class="seg seg--small" role="group" aria-label="Allure de ${label(sel.role)}">${[
            ['run', 'Course'],
            ['walk', 'Shift'],
          ]
            .map(([id, text]) => `<button type="button" class="seg__btn" data-pace="${id}" aria-pressed="${pace === id}">${text}</button>`)
            .join('')}</div>`
        : `<p class="ed-note">Ne bouge pas pendant cette étape.</p>`
    }</div>`;
  } else if (n === 0 && sel?.kind === 'player') {
    html = `<div class="ed-tool"><p>${dot(sel.role)} <strong>${label(sel.role)}</strong> au départ.</p></div>`;
  }
  if (n >= 1 && !ctx.placing) {
    const by = sel?.kind === 'player' ? sel.role : ctx.utilBy;
    html += `<div class="ed-tool ed-tool--utils">
      <p class="ed-label" id="ed-util-label">Poser un utilitaire</p>
      <div class="ed-util-row">
        <label class="ed-util-by"><span class="sr">Lancé par</span><select id="ed-util-by" aria-label="Lancé par">${ROLES.map((r) => `<option value="${r}"${r === by ? ' selected' : ''}>${label(r)}</option>`).join('')}</select></label>
        ${UTILITY_TYPES.map((t) => `<button type="button" class="ed-util" data-util="${t}" aria-label="${UTILITY_NAME[t]}" title="${UTILITY_NAME[t]}"><span aria-hidden="true">${UTILITY_LETTER[t]}</span></button>`).join('')}
      </div>
    </div>`;
  }
  $('ed-tools').innerHTML = html;
}

// ---------- Textes de l'étape ----------
function rowList(kind, items) {
  const isCall = kind === 'calls';
  const name = isCall ? 'Appel' : 'Plan';
  return items
    .map((t, i) => {
      const field = isCall
        ? `<input type="text" maxlength="60" data-bind="${kind}-text" data-i="${i}" aria-label="${name} ${i + 1}" value="${esc(t.text)}" placeholder="Ex. Go B" />`
        : `<textarea rows="2" data-bind="${kind}-text" data-i="${i}" aria-label="${name} ${i + 1}" placeholder="Ex. J1 et J2 prennent Long">${esc(t.text)}</textarea>`;
      return `<div class="ed-row"><select data-bind="${kind}-group" data-i="${i}" aria-label="Groupe, ${name.toLowerCase()} ${i + 1}">${groupOptions(GROUP_PRESETS, t.group)}</select>${field}<button type="button" class="ed-row__del" data-del="${kind}" data-i="${i}" aria-label="Retirer : ${name.toLowerCase()} ${i + 1}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`;
    })
    .join('');
}

function renderStepFields() {
  const n = ctx.step;
  const box = $('ed-step-fields');
  if (n === 0) {
    box.innerHTML = `<p class="ed-note">Le départ n'a pas de consignes. Choisis une étape pour écrire le plan, les appels et les missions.</p>`;
    return;
  }
  const st = ctx.draft.steps[n - 1];
  box.innerHTML = `
    <h3 class="ed-h ed-h--small">Volet de l'étape ${n}</h3>
    <div class="ed-field"><label for="ed-step-title">Titre de l'étape</label><input id="ed-step-title" type="text" maxlength="60" data-bind="step-title" value="${esc(st.title.text)}" placeholder="Étape ${n}" /></div>
    <fieldset class="ed-list"><legend>Plan de l'équipe</legend>${rowList('team', st.team)}<button type="button" class="ed-add" data-add="team">+ Ajouter une ligne</button></fieldset>
    <fieldset class="ed-list"><legend>Appels</legend>${rowList('calls', st.calls)}<button type="button" class="ed-add" data-add="calls">+ Ajouter un appel</button></fieldset>
    <fieldset class="ed-list"><legend>Mission de chaque joueur</legend>
      <p class="ed-note">Une consigne par ligne. Vide : « ${esc(ctx.draft.labels.noNewInstruction.text)} ».</p>
      ${ROLES.map(
        (r) =>
          `<div class="ed-field ed-mission" style="--c:${PLAYER_COLORS[r]}"><label for="ed-m-${r}">${dot(r)}${label(r)}<span class="ed-mission__role" data-sum="${r}">${esc(ctx.draft.roles[r].title.text)}</span></label><textarea id="ed-m-${r}" rows="2" data-bind="missions" data-role="${r}">${esc((st.roles[r] ?? []).map((m) => m.text).join('\n'))}</textarea></div>`,
      ).join('')}
    </fieldset>
    ${ctx.draft.steps.length > 1 ? `<button type="button" class="btn btn--ghost btn--danger-text" id="ed-del-step">Supprimer l'étape ${n}</button>` : ''}`;
}

// ---------- Saisie ----------
/** Lignes d'un champ multi-lignes : garde la source d'origine des lignes inchangées. */
function linesToTexts(value, previous = []) {
  return value.split('\n').map((line) => previous.find((p) => p.text === line) ?? txt(line));
}

function onInput(e) {
  if (!ctx) return;
  const el = e.target;
  const bind = el.dataset?.bind;
  if (!bind) return;
  const before = snap();
  const beforeDraft = draftText();
  applyInput(el, bind);
  if (draftText() === beforeDraft) return;
  // Une entrée d'historique par champ et par rafale de frappe (pas une par lettre).
  const key = `${bind}|${el.dataset.role ?? ''}|${el.dataset.i ?? ''}|${ctx.step}`;
  const now = Date.now();
  if (!ctx.typing || ctx.typing.key !== key || now - ctx.typing.at > 1500) ctx.history.record(before);
  ctx.typing = { key, at: now };
  changed();
  updateHistoryButtons();
}

function applyInput(el, bind) {
  const d = ctx.draft;
  const st = ctx.step >= 1 ? d.steps[ctx.step - 1] : null;
  const i = Number(el.dataset.i);
  const role = el.dataset.role;
  const v = el.value;
  const setText = (obj, key) => {
    if (obj[key].text !== v) obj[key] = { ...obj[key], text: v, source: 'ajout' };
  };
  switch (bind) {
    case 'title':
      setText(d, 'title');
      break;
    case 'step-title':
      setText(st, 'title');
      break;
    case 'team-text':
    case 'calls-text': {
      const list = st[bind.split('-')[0]];
      if (list[i].text !== v) list[i] = { ...list[i], text: v, source: 'ajout' };
      break;
    }
    case 'team-group':
    case 'calls-group':
      st[bind.split('-')[0]][i].group = v;
      break;
    case 'missions':
      st.roles[role] = linesToTexts(v, st.roles[role]);
      break;
    case 'role-group':
      d.roles[role].group = v;
      ctx.groupsTouched = true;
      break;
    case 'role-title':
      setText(d.roles[role], 'title');
      document.querySelectorAll(`[data-sum="${role}"]`).forEach((n) => (n.textContent = v || (n.classList.contains('ed-role__sum') ? 'Rôle à définir' : '')));
      break;
    case 'role-summary':
      setText(d.roles[role], 'summary');
      break;
    case 'role-utils':
      d.roles[role].utilities = linesToTexts(v, d.roles[role].utilities);
      break;
    default:
  }
}

function setSide(side) {
  if (side === sideKey()) return;
  undoable(() => applySide(side));
  $('ed-side').querySelectorAll('[data-side]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.side === side)));
  $('ed-roles').innerHTML = ROLES.map(roleFields).join('');
  renderMap();
}

function applySide(side) {
  const d = ctx.draft;
  d.side = txt(SIDES[side].label);
  // Nouvelle stratégie encore vierge : joueurs replacés au spawn du side choisi.
  if (ctx.isNew && !ctx.moved) {
    const fresh = createStrategy({ mapId: d.map, side, id: d.id });
    d.start = fresh.start;
    for (const st of d.steps) {
      st.map.positions = clone(fresh.start);
      st.map.look = clone(fresh.steps[0].map.look);
      st.map.moves = [];
    }
    if (!ctx.groupsTouched) for (const r of ROLES) d.roles[r].group = fresh.roles[r].group;
    $('editor-title').textContent = `Nouvelle stratégie ${SIDES[side].short}`;
  }
}

async function onClick(e) {
  if (!ctx) return;
  const t = e.target;
  const d = ctx.draft;
  const st = ctx.step >= 1 ? d.steps[ctx.step - 1] : null;
  const btn = t.closest('button');
  if (!btn) return;

  if (btn.dataset.side) return setSide(btn.dataset.side);
  if (btn.id === 'ed-undo') return undo();
  if (btn.id === 'ed-redo') return redo();
  if (btn.closest('#ed-tabs')) {
    if (btn.id === 'ed-add-step') {
      if (!undoable(() => addStep(d))) return;
      ctx.step = d.steps.length;
      toast(`Étape ${ctx.step} ajoutée : les joueurs partent de l'étape ${ctx.step - 1}`);
    } else ctx.step = Number(btn.dataset.step);
    ctx.selected = null;
    ctx.placing = null;
    renderStep();
    $('ed-tabs').querySelector('[aria-pressed="true"]')?.focus();
    return;
  }
  if (btn.dataset.add) {
    const kind = btn.dataset.add;
    const lastGroup = st[kind].at(-1)?.group ?? 'all';
    undoable(() => st[kind].push({ group: lastGroup, ...txt('') }));
    renderStepFields();
    $('ed-step-fields').querySelector(`[data-bind="${kind}-text"][data-i="${st[kind].length - 1}"]`)?.focus();
    return;
  }
  if (btn.dataset.del) {
    undoable(() => st[btn.dataset.del].splice(Number(btn.dataset.i), 1));
    renderStepFields();
    return;
  }
  if (btn.id === 'ed-del-step') {
    const n = ctx.step;
    const ok = await confirmDialog({ title: `Supprimer l'étape ${n} ?`, text: 'Ses consignes, appels, positions et utilitaires seront retirés.', ok: 'Supprimer', danger: true });
    if (!ok || !ctx) return;
    undoable(() => removeStep(ctx.draft, ctx.map, n));
    ctx.step = Math.min(n, ctx.draft.steps.length);
    ctx.selected = null;
    renderStep();
    return;
  }
  if (btn.dataset.pace) {
    undoable(() => setPace(d, ctx.step, ctx.selected.role, btn.dataset.pace));
    renderMap();
    renderTools();
    return;
  }
  if (btn.dataset.util) {
    const by = $('ed-util-by').value;
    ctx.utilBy = by;
    ctx.placing = { type: btn.dataset.util, by };
    ctx.selected = null;
    renderMap();
    renderTools();
    return;
  }
  if (btn.dataset.tool === 'cancel-place') {
    ctx.placing = null;
    renderMap();
    renderTools();
    return;
  }
  if (btn.dataset.tool === 'remove-util') {
    undoable(() => removeUtility(d, ctx.step, ctx.selected.index));
    ctx.selected = null;
    renderMap();
    renderTools();
    return;
  }
  if (btn.dataset.tool === 'clear-via') {
    undoable(() => clearVia(d, ctx.map, ctx.step, ctx.selected.role));
    renderMap();
    renderTools();
    return;
  }
  if (btn.id === 'ed-remove') {
    const local = ctx.origin === 'local';
    const ok = await confirmDialog({
      title: 'Supprimer la stratégie ?',
      text: local
        ? 'Elle n’est que sur ce téléphone : elle sera effacée.'
        : 'Elle sera supprimée du dépôt GitHub, pour tout le monde. Les liens déjà envoyés ne l’ouvriront plus.',
      ok: 'Supprimer',
      danger: true,
    });
    if (!ok || !ctx) return;
    const { id } = d;
    const step = Math.max(1, ctx.step);
    if (!(await busy(btn, 'Suppression…', () => ctx.remove({ id, title: d.title }))) || !ctx) return;
    clearDraft();
    close({ deletedId: id, step });
  }
}

/** Bouton occupé pendant un appel à GitHub (évite le double envoi). Renvoie le résultat de l'appel. */
async function busy(button, label, fn) {
  const text = button.textContent;
  const buttons = [$('ed-save'), $('ed-cancel'), button];
  buttons.forEach((b) => (b.disabled = true));
  button.textContent = label;
  try {
    return await fn();
  } finally {
    buttons.forEach((b) => (b.disabled = false));
    button.textContent = text;
  }
}

async function save() {
  if (!ctx) return;
  const errors = validateDraft(ctx.draft);
  if (errors.length) {
    toast(errors[0].message);
    if (errors[0].field === 'title') $('ed-title').focus();
    return;
  }
  const s = sanitizeStrategy({ ...finalizeDraft(ctx.draft, ctx.map), updatedAt: Date.now() });
  if (!s) {
    toast('Enregistrement impossible : stratégie invalide');
    return;
  }
  // Publication dans GitHub ; en cas d'échec l'éditeur reste ouvert (brouillon gardé), on peut réessayer.
  const step = Math.max(1, ctx.step);
  if (!(await busy($('ed-save'), 'Publication…', () => ctx.publish(s))) || !ctx) return;
  clearDraft();
  close({ savedId: s.id, step }); // retour à l'étape en cours de modification
}

async function cancel() {
  if (!ctx) return;
  if (ctx.dirty) {
    const ok = await confirmDialog({ title: 'Quitter sans enregistrer ?', text: 'Tes modifications seront perdues.', ok: 'Quitter', cancel: 'Continuer', danger: true });
    if (!ok || !ctx) return;
  }
  clearDraft();
  close({});
}

$('editor-body').addEventListener('input', onInput);
$('editor-body').addEventListener('change', onInput);
$('editor-body').addEventListener('click', onClick);
$('ed-save').addEventListener('click', save);
$('ed-cancel').addEventListener('click', cancel);

// Ctrl+Z / Cmd+Z : défaire, Ctrl+Maj+Z ou Ctrl+Y : refaire (hors des champs de texte, qui ont les leurs).
document.addEventListener('keydown', (e) => {
  if (!ctx || document.body.dataset.mode !== 'edit' || document.querySelector('dialog[open]')) return;
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.target.closest?.('input, textarea, select')) return;
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if ((key === 'z' && e.shiftKey) || key === 'y') {
    e.preventDefault();
    redo();
  }
});
