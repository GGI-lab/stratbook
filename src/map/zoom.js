// Zoom et déplacement tactiles de la carte, sans bouton :
// - pincer à deux doigts pour zoomer autour du point pincé ;
// - glisser à un doigt pour déplacer la carte quand elle est zoomée ;
// - toucher deux fois rapidement pour revenir à la vue entière ;
// - sur ordinateur, le pincement du pavé tactile (molette + Ctrl) zoome aussi.
// On agit sur le viewBox du SVG : le rendu reste net à tous les niveaux de zoom.
// Le zoom est conservé quand la carte est redessinée (changement d'étape ou de vue).

const MAX_SCALE = 4;
const TAP_MOVE = 8; // px : au-delà, un toucher est un glissement, pas un clic
const DOUBLE_TAP_MS = 300;

/**
 * @param {HTMLElement} container  élément qui contient le SVG (remplacé à chaque rendu)
 * @param {{x:number,y:number,width:number,height:number}} base  cadrage complet de la carte
 */
export function attachZoom(container, base) {
  let view = { ...base }; // cadrage courant (x, y, width, height)
  const pointers = new Map();
  let gesture = null;
  let moved = false;
  let lastTap = 0;

  const svg = () => container.querySelector('svg');
  const scale = () => base.width / view.width;

  function clampView(v) {
    const width = Math.min(base.width, Math.max(base.width / MAX_SCALE, v.width));
    const height = (width / base.width) * base.height;
    const x = Math.min(base.x + base.width - width, Math.max(base.x, v.x));
    const y = Math.min(base.y + base.height - height, Math.max(base.y, v.y));
    return { x, y, width, height };
  }

  function apply() {
    const el = svg();
    if (el) el.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`);
    // Vue entière : le doigt fait défiler la page. Zoomée : le doigt déplace la carte.
    container.style.touchAction = scale() > 1.01 ? 'none' : 'pan-y';
    container.dataset.zoomed = String(scale() > 1.01);
  }

  // Position d'un point de l'écran dans les coordonnées de la carte, pour un cadrage donné.
  function toMap(clientX, clientY, v = view) {
    const r = svg().getBoundingClientRect();
    return { x: v.x + ((clientX - r.left) / r.width) * v.width, y: v.y + ((clientY - r.top) / r.height) * v.height };
  }

  const mid = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  function start() {
    if (pointers.size === 2) {
      const m = mid();
      gesture = { type: 'pinch', d0: m.d, view0: { ...view }, anchor: toMap(m.x, m.y) };
    } else if (pointers.size === 1) {
      const [p] = pointers.values();
      gesture = { type: 'pan', x0: p.x, y0: p.y, view0: { ...view } };
    }
  }

  container.addEventListener('pointerdown', (e) => {
    if (!svg() || e.pointerType === 'mouse') return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) moved = false;
    start();
  });

  container.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = svg().getBoundingClientRect();
    if (gesture?.type === 'pinch' && pointers.size === 2) {
      const m = mid();
      const width = gesture.view0.width / (m.d / gesture.d0);
      const height = (width / base.width) * base.height;
      // Le point de la carte pincé au départ reste sous les doigts.
      const x = gesture.anchor.x - ((m.x - r.left) / r.width) * width;
      const y = gesture.anchor.y - ((m.y - r.top) / r.height) * height;
      view = clampView({ x, y, width, height });
      moved = true;
      apply();
    } else if (gesture?.type === 'pan' && scale() > 1.01) {
      const dx = e.clientX - gesture.x0;
      const dy = e.clientY - gesture.y0;
      if (Math.hypot(dx, dy) > TAP_MOVE) moved = true;
      view = clampView({
        ...gesture.view0,
        x: gesture.view0.x - (dx / r.width) * gesture.view0.width,
        y: gesture.view0.y - (dy / r.height) * gesture.view0.height,
      });
      apply();
    }
  });

  const end = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (e.type === 'pointerup' && pointers.size === 0 && !moved) {
      const now = e.timeStamp;
      if (now - lastTap < DOUBLE_TAP_MS) {
        view = { ...base };
        apply();
        lastTap = 0;
      } else lastTap = now;
    }
    start(); // un doigt restant reprend en déplacement
  };
  container.addEventListener('pointerup', end);
  container.addEventListener('pointercancel', end);

  // Après un glissement ou un pincement, le relâchement ne doit pas sélectionner un joueur.
  container.addEventListener(
    'click',
    (e) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      }
    },
    true,
  );

  // Safari iOS : empêcher le zoom de toute la page quand on pince la carte.
  container.addEventListener('gesturestart', (e) => e.preventDefault());

  // Ordinateur : pincement du pavé tactile (envoyé comme molette avec Ctrl).
  container.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey || !svg()) return;
      e.preventDefault();
      const p = toMap(e.clientX, e.clientY);
      const f = Math.exp(-e.deltaY * 0.01);
      const width = view.width / f;
      const height = (width / base.width) * base.height;
      const r = svg().getBoundingClientRect();
      view = clampView({
        x: p.x - ((e.clientX - r.left) / r.width) * width,
        y: p.y - ((e.clientY - r.top) / r.height) * height,
        width,
        height,
      });
      apply();
    },
    { passive: false },
  );

  return { apply, reset: () => ((view = { ...base }), apply()), scale };
}
