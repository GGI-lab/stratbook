// Plan de Dust 2 : image de vue d'ensemble fournie par Greg, passée en niveaux de gris
// (public/maps/dust2.webp, 1000 x 1000, original dans assets-src/).
// Toutes les coordonnées sont en pixels de cette image.

export const BACKGROUND = { href: 'maps/dust2.webp', width: 1000, height: 1000 };

// Cadrage fixe : moitié droite de la map (Long, Mid, Short, site A, Spawn T).
// Le site B et ses accès sont hors cadre, la stratégie ne les utilise pas.
export const VIEWBOX = { x: 360, y: 20, width: 590, height: 940 };

// Zones nommées. anchor = point où poser un symbole d'utilitaire.
// Les noms ne sont pas affichés sur la carte (choix de Greg), ils servent aux données et aux tests.
export const ZONES = [
  { id: 'siteA', name: 'Site A', anchor: [790, 170] },
  { id: 'ct', name: 'CT', anchor: [640, 215] },
  { id: 'rampe', name: 'Rampe', anchor: [868, 228] },
  { id: 'car', name: 'Car', anchor: [920, 268] },
  { id: 'long', name: 'Long', anchor: [880, 400] },
  { id: 'pit', name: 'Pit', anchor: [868, 615] },
  { id: 'portesLong', name: 'Portes Long', anchor: [705, 650] },
  { id: 'short', name: 'Short', anchor: [632, 300] },
  { id: 'xbox', name: 'Xbox', anchor: [482, 400] },
  { id: 'mid', name: 'Mid', anchor: [462, 500] },
  { id: 'lower', name: 'Lower', anchor: [390, 400] },
  { id: 'topMid', name: 'Top Mid', anchor: [480, 610] },
  { id: 'suicide', name: 'Suicide', anchor: [450, 740] },
  { id: 'tSpawn', name: 'Spawn T', anchor: [400, 900] },
];
