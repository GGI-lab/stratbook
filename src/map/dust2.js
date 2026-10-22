// Plan de Dust 2 : image de vue d'ensemble fournie par Greg (public/maps/dust2.webp, 1000 x 1000).
// Toutes les coordonnées sont en pixels de cette image.

export const BACKGROUND = { href: 'maps/dust2.webp', width: 1000, height: 1000 };

// Cadrage fixe : moitié droite de la map (Long, Mid, Short, site A, Spawn T).
// Le site B et ses accès sont hors cadre, la stratégie ne les utilise pas.
export const VIEWBOX = { x: 360, y: 20, width: 600, height: 940 };

// Zones nommées. anchor = point où poser un symbole d'utilitaire.
// labelAt = position du nom, choisie pour ne pas être masquée par les joueurs.
export const ZONES = [
  { id: 'siteA', name: 'Site A', anchor: [790, 170], labelAt: [700, 70] },
  { id: 'ct', name: 'CT', anchor: [640, 215], labelAt: [522, 238] },
  { id: 'rampe', name: 'Rampe', anchor: [868, 228], labelAt: [845, 250] },
  { id: 'car', name: 'Car', anchor: [920, 268], labelAt: [925, 225] },
  { id: 'long', name: 'Long', anchor: [880, 400], labelAt: [930, 420] },
  { id: 'pit', name: 'Pit', anchor: [868, 615], labelAt: [868, 640] },
  { id: 'portesLong', name: 'Portes Long', anchor: [705, 650], labelAt: [770, 690] },
  { id: 'short', name: 'Short', anchor: [632, 300], labelAt: [632, 430] },
  { id: 'xbox', name: 'Xbox', anchor: [482, 400], labelAt: [455, 360] },
  { id: 'mid', name: 'Mid', anchor: [462, 500], labelAt: [462, 520] },
  { id: 'lower', name: 'Lower', anchor: [390, 400], labelAt: [395, 450] },
  { id: 'topMid', name: 'Top Mid', anchor: [480, 610], labelAt: [560, 625] },
  { id: 'suicide', name: 'Suicide', anchor: [450, 740], labelAt: [398, 740] },
  { id: 'tSpawn', name: 'Spawn T', anchor: [400, 900], labelAt: [400, 925] },
];
