// Calcul automatique des trajets sur la carte. Fonctions pures, testées dans tests/nav.test.js.
//
// La grille de navigation (une case = quelques pixels de l'image) dit où l'on peut marcher.
// Elle est tirée de la transparence de l'image de la carte (scripts/nav-grid.py).
// Un trajet est cherché avec A* : il évite les murs et préfère le milieu des couloirs,
// puis il est simplifié en quelques points de passage (le rendu en fait une courbe lisse).

const SQRT2 = Math.SQRT2;
const PREFERRED_CLEARANCE = 4; // cases : en dessous, un léger surcoût éloigne le trajet des murs
const WALL_PENALTY = 0.6;

const cache = new WeakMap();

function decodeBits(b64, size) {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) out[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return out;
}

/**
 * Prépare la grille d'une carte (décodage et distance aux murs), une seule fois par carte.
 * @param {{cell:number, cols:number, rows:number, bits:string}} navData
 */
export function getGrid(navData) {
  if (cache.has(navData)) return cache.get(navData);
  const { cell, cols, rows } = navData;
  const size = cols * rows;
  const walk = decodeBits(navData.bits, size);
  // Distance (en cases) à la case non praticable la plus proche, par parcours en largeur.
  const clear = new Int16Array(size).fill(-1);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < size; i++)
    if (!walk[i]) {
      clear[i] = 0;
      queue[tail++] = i;
    }
  while (head < tail) {
    const i = queue[head++];
    const x = i % cols;
    const y = (i / cols) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (clear[j] === -1) {
          clear[j] = clear[i] + 1;
          queue[tail++] = j;
        }
      }
  }
  for (let i = 0; i < size; i++) if (clear[i] === -1) clear[i] = 99; // grille entièrement praticable
  const grid = { cell, cols, rows, walk, clear };
  cache.set(navData, grid);
  return grid;
}

const toCell = (g, [x, y]) => [
  Math.min(g.cols - 1, Math.max(0, Math.floor(x / g.cell))),
  Math.min(g.rows - 1, Math.max(0, Math.floor(y / g.cell))),
];
const center = (g, x, y) => [Math.round((x + 0.5) * g.cell), Math.round((y + 0.5) * g.cell)];

export function isWalkable(g, point) {
  const [x, y] = toCell(g, point);
  return g.walk[y * g.cols + x] === 1;
}

/** Case praticable la plus proche d'un point (renvoie la case, en coordonnées de grille). */
function nearestWalkableCell(g, point, minClear = 1) {
  const [cx, cy] = toCell(g, point);
  const ok = (x, y) => x >= 0 && y >= 0 && x < g.cols && y < g.rows && g.clear[y * g.cols + x] >= minClear;
  if (ok(cx, cy)) return [cx, cy];
  for (let r = 1; r < Math.max(g.cols, g.rows); r++) {
    let best = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !ok(cx + dx, cy + dy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) [best, bestD] = [[cx + dx, cy + dy], d];
      }
    if (best) return best;
  }
  return null;
}

/** Ramène un point sur une zone praticable (un jeton lâché sur un mur revient dans le couloir). */
export function snapToWalkable(g, point) {
  if (isWalkable(g, point) && g.clear[toCell(g, point)[1] * g.cols + toCell(g, point)[0]] >= 2) return point;
  const c = nearestWalkableCell(g, point, 2) ?? nearestWalkableCell(g, point, 1);
  return c ? center(g, ...c) : point;
}

// File de priorité minimale (tas binaire) sur des indices de case.
class Heap {
  constructor() {
    this.items = [];
    this.keys = [];
  }
  push(item, key) {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      [items[i], items[p], keys[i], keys[p]] = [items[p], items[i], keys[p], keys[i]];
      i = p;
    }
  }
  pop() {
    const { items, keys } = this;
    const top = items[0];
    const lastItem = items.pop();
    const lastKey = keys.pop();
    if (items.length) {
      items[0] = lastItem;
      keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < keys.length && keys[l] < keys[m]) m = l;
        if (r < keys.length && keys[r] < keys[m]) m = r;
        if (m === i) break;
        [items[i], items[m], keys[i], keys[m]] = [items[m], items[i], keys[m], keys[i]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

function astar(g, [sx, sy], [tx, ty]) {
  const { cols, rows, walk, clear } = g;
  const size = cols * rows;
  const start = sy * cols + sx;
  const goal = ty * cols + tx;
  const cost = new Float32Array(size).fill(Infinity);
  const from = new Int32Array(size).fill(-1);
  const done = new Uint8Array(size);
  const h = (i) => {
    const dx = Math.abs((i % cols) - tx);
    const dy = Math.abs(((i / cols) | 0) - ty);
    return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
  };
  const heap = new Heap();
  cost[start] = 0;
  heap.push(start, h(start));
  while (heap.size) {
    const i = heap.pop();
    if (done[i]) continue;
    if (i === goal) break;
    done[i] = 1;
    const x = i % cols;
    const y = (i / cols) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (!walk[j] || done[j]) continue;
        // Pas de diagonale qui coupe un coin de mur.
        if (dx && dy && (!walk[y * cols + nx] || !walk[ny * cols + x])) continue;
        const step = dx && dy ? SQRT2 : 1;
        const penalty = Math.max(0, PREFERRED_CLEARANCE - clear[j]) * WALL_PENALTY;
        const c = cost[i] + step * (1 + penalty);
        if (c < cost[j]) {
          cost[j] = c;
          from[j] = i;
          heap.push(j, c + h(j));
        }
      }
  }
  if (from[goal] === -1 && goal !== start) return null;
  const cells = [];
  for (let i = goal; i !== -1; i = from[i]) cells.push([i % cols, (i / cols) | 0]);
  return cells.reverse();
}

/** Ligne droite praticable entre deux cases, avec une marge minimale aux murs. */
function lineOfSight(g, [ax, ay], [bx, by], minClear) {
  const n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2);
  for (let k = 0; k <= n; k++) {
    const t = n ? k / n : 0;
    const x = Math.round(ax + (bx - ax) * t);
    const y = Math.round(ay + (by - ay) * t);
    if (g.clear[y * g.cols + x] < minClear) return false;
  }
  return true;
}

/** Garde le moins de points possible : on file tout droit tant que la vue est dégagée. */
function simplify(g, cells) {
  if (cells.length <= 2) return cells;
  const out = [cells[0]];
  let anchor = 0;
  while (anchor < cells.length - 1) {
    let next = anchor + 1;
    for (let k = cells.length - 1; k > anchor + 1; k--) {
      const minClear = Math.min(2, g.clear[cells[anchor][1] * g.cols + cells[anchor][0]], g.clear[cells[k][1] * g.cols + cells[k][0]]);
      if (lineOfSight(g, cells[anchor], cells[k], Math.max(1, minClear))) {
        next = k;
        break;
      }
    }
    out.push(cells[next]);
    anchor = next;
  }
  return out;
}

/**
 * Trajet praticable de `from` à `to` (pixels de l'image) : [from, ...points de passage, to].
 * Si aucun chemin n'existe (point hors carte), renvoie la ligne droite.
 */
export function computeRoute(navData, from, to) {
  const g = getGrid(navData);
  const a = nearestWalkableCell(g, from);
  const b = nearestWalkableCell(g, to);
  if (!a || !b) return [from, to];
  const cells = astar(g, a, b);
  if (!cells) return [from, to];
  const middle = simplify(g, cells)
    .slice(1, -1)
    .map(([x, y]) => center(g, x, y));
  return [from, ...middle, to];
}
