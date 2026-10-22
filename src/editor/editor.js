// Éditeur de stratégie : création et modification, directement dans l'application.
// - textes du volet de consignes (même structure que l'affichage) ;
// - placement des joueurs à la main sur la carte, étape par étape, trajets calculés automatiquement ;
// - regard (cône), allure (course ou shift) et utilitaires posés sur la carte.
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
} from './ops.js';
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
 * @param {object} opts.library        bibliothèque (src/library.js)
 * @param {Function} opts.onClose      appelée avec { savedId, step } ou { deletedId, step } ou {}
 * @param {number} [opts.step]         étape affichée à l'ouverture
 */
export function openEditor({ strategy, side, library, onClose, step = 1 }) {
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
    library,
    onClose,
    origin: isNew ? null : library.origin(strategy.id),
    step: Math.min(Math.max(1, step), draft.steps.length), // l'éditeur s'ouvre sur l'étape affichée
    selected: null, // { kind: 'player', role } ou { kind: 'utility', index }
    placing: null, // utilitaire en attente d'un toucher sur la carte : { type, by }
    utilBy: 'j1',
    dirty: restored,
    moved: restored,
    groupsTouched: restored,
  };
  $('editor-title').textContent = isNew ? `Nouvelle stratégie ${SIDES[side].short}` : 'Modifier la stratégie';
  $('editor').hidden = false;
  renderBody();
  // La carte de l'éditeur est recréée à chaque ouverture : on y rattache zoom et glisser-déposer.
  edZoom = attachZoom($('ed-map'), ctx.frame, { touchAction: 'none' });
  bindMap();
  renderStep();
  if (restored) toast('Brouillon restauré');
  $('ed-title').focus({ preventScroll: true });
}

function close(result = {}) {
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

// ---------- Structure de l'écran ----------
function renderBody() {
  const d = ctx.draft;
  const side = sideKey();
  const canRemove = ctx.origin === 'local' || ctx.origin === 'modified';
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
          <div class="ed-map" id="ed-map"></div>
          <p class="ed-hint" id="ed-hint"></p>
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
      <button type="button" class="btn btn--ghost" id="ed-export">Télécharger le fichier (.json)</button>
      <p class="ed-note">Pour l'ajouter au dépôt et la rendre visible par tous, sans lien.</p>
      ${
        canRemove
          ? `<button type="button" class="btn btn--ghost btn--danger-text" id="ed-remove">${ctx.origin === 'modified' ? 'Revenir à la version d’origine' : 'Supprimer la stratégie'}</button>`
          : ''
      }
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
  host.innerHTML = renderStepSvg(s, n, { map: ctx.map, frame: ctx.frame, imageHref, highlight: sel, uid: 'ed' });
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
        const index = addUtility(ctx.draft, ctx.step, { ...ctx.placing, at });
        ctx.placing = null;
        ctx.selected = { kind: 'utility', index };
        changed();
        renderMap();
        renderTools();
        return;
      }
      const look = t.closest('.ed-look');
      const hit = t.closest('.ed-hit, .player');
      const util = t.closest('.utility');
      let target = null;
      if (look) target = { kind: 'look', role: look.dataset.role };
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
      if (target.kind !== 'look') {
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
    if (d.kind === 'player') {
      setPosition(ctx.draft, ctx.map, ctx.step, d.role, d.point);
      ctx.moved = true;
    } else if (d.kind === 'look') setLook(ctx.draft, ctx.step, d.role, d.point);
    else if (d.kind === 'utility') moveUtility(ctx.draft, ctx.map, ctx.step, d.index, d.point);
    changed();
    renderMap();
    renderTools();
  };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);

  // Toucher la carte à vide : désélection.
  host.addEventListener('click', (e) => {
    if (!ctx || ctx.placing || !ctx.selected) return;
    if (e.target.closest('.ed-hit, .player, .utility, .ed-look')) return;
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
  let html = '';
  if (n >= 1 && ctx.placing) {
    html = `<div class="ed-tool ed-tool--placing"><p><strong>Touche la carte</strong> pour poser : ${esc(UTILITY_NAME[ctx.placing.type])} de ${label(ctx.placing.by)}</p><button type="button" class="btn btn--ghost" data-tool="cancel-place">Annuler</button></div>`;
  } else if (n >= 1 && sel?.kind === 'utility' && currentMap().utilities[sel.index]) {
    const u = currentMap().utilities[sel.index];
    html = `<div class="ed-tool"><p>${dot(u.by)} <strong>${esc(UTILITY_NAME[u.type])}</strong> de ${label(u.by)}. Glisse-le pour le déplacer.</p><button type="button" class="btn btn--ghost btn--danger-text" data-tool="remove-util">Supprimer</button></div>`;
  } else if (n >= 1 && sel?.kind === 'player') {
    const moving = movesDuring(ctx.draft, n, sel.role);
    const pace = currentMap().moves.find((m) => m.role === sel.role)?.pace ?? 'run';
    html = `<div class="ed-tool"><div class="ed-tool__who"><p>${dot(sel.role)} <strong>${label(sel.role)}</strong></p><p class="ed-note">Glisse le point blanc pour orienter son regard.</p></div>${
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
      return;
  }
  changed();
}

function setSide(side) {
  const d = ctx.draft;
  if (side === sideKey()) return;
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
  changed();
  $('ed-side').querySelectorAll('[data-side]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.side === side)));
  $('ed-roles').innerHTML = ROLES.map(roleFields).join('');
  renderMap();
}

async function onClick(e) {
  if (!ctx) return;
  const t = e.target;
  const d = ctx.draft;
  const st = ctx.step >= 1 ? d.steps[ctx.step - 1] : null;
  const btn = t.closest('button');
  if (!btn) return;

  if (btn.dataset.side) return setSide(btn.dataset.side);
  if (btn.closest('#ed-tabs')) {
    if (btn.id === 'ed-add-step') {
      if (!addStep(d)) return;
      ctx.step = d.steps.length;
      changed();
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
    st[kind].push({ group: lastGroup, ...txt('') });
    changed();
    renderStepFields();
    $('ed-step-fields').querySelector(`[data-bind="${kind}-text"][data-i="${st[kind].length - 1}"]`)?.focus();
    return;
  }
  if (btn.dataset.del) {
    st[btn.dataset.del].splice(Number(btn.dataset.i), 1);
    changed();
    renderStepFields();
    return;
  }
  if (btn.id === 'ed-del-step') {
    const n = ctx.step;
    const ok = await confirmDialog({ title: `Supprimer l'étape ${n} ?`, text: 'Ses consignes, appels, positions et utilitaires seront retirés.', ok: 'Supprimer', danger: true });
    if (!ok || !ctx) return;
    removeStep(d, ctx.map, n);
    ctx.step = Math.min(n, d.steps.length);
    ctx.selected = null;
    changed();
    renderStep();
    return;
  }
  if (btn.dataset.pace) {
    setPace(d, ctx.step, ctx.selected.role, btn.dataset.pace);
    changed();
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
    removeUtility(d, ctx.step, ctx.selected.index);
    ctx.selected = null;
    changed();
    renderMap();
    renderTools();
    return;
  }
  if (btn.id === 'ed-export') return exportFile();
  if (btn.id === 'ed-remove') {
    const modified = ctx.origin === 'modified';
    const ok = await confirmDialog({
      title: modified ? 'Revenir à la version d’origine ?' : 'Supprimer la stratégie ?',
      text: modified ? 'Tes modifications sur ce téléphone seront effacées.' : 'Elle sera effacée de ce téléphone. Les liens déjà envoyés restent valables.',
      ok: modified ? 'Revenir' : 'Supprimer',
      danger: true,
    });
    if (!ok || !ctx) return;
    const id = d.id;
    ctx.library.remove(id);
    clearDraft();
    close({ deletedId: id, step: Math.max(1, ctx.step) });
    toast(modified ? 'Version d’origine rétablie' : 'Stratégie supprimée');
  }
}

function exportFile() {
  const s = finalizeDraft(ctx.draft, ctx.map);
  if (!s.title.text) s.title = txt('Sans titre');
  const blob = new Blob([`${JSON.stringify(s, null, 2)}\n`], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${s.id}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function save() {
  if (!ctx) return;
  const errors = validateDraft(ctx.draft);
  if (errors.length) {
    toast(errors[0].message);
    if (errors[0].field === 'title') $('ed-title').focus();
    return;
  }
  const s = finalizeDraft(ctx.draft, ctx.map);
  let persisted = false;
  try {
    persisted = ctx.library.save(s);
  } catch {
    toast('Enregistrement impossible : stratégie invalide');
    return;
  }
  clearDraft();
  close({ savedId: s.id, step: Math.max(1, ctx.step) }); // retour à l'étape en cours de modification
  toast(persisted ? 'Stratégie enregistrée' : 'Stratégie gardée jusqu’à la fermeture (stockage indisponible)');
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
