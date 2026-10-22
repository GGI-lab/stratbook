// Plan de Dust 2 : image de vue d'ensemble fournie par Greg, passée en niveaux de gris
// (public/maps/dust2.webp, 1000 x 1000, original dans assets-src/).
// Toutes les coordonnées sont en pixels de cette image.
import { NAV } from './dust2-nav.js';

export const BACKGROUND = { href: 'maps/dust2.webp', width: 1000, height: 1000 };

// Cadrage par défaut : la map entière (zones jouables de l'image, avec une petite marge).
// Une stratégie peut fixer son propre cadrage (champ "frame"), par exemple la moitié droite pour un split A.
export const VIEWBOX = { x: 40, y: 5, width: 925, height: 990 };

// Cadrage de la stratégie d'origine : moitié droite (Long, Mid, Short, site A, Spawn T).
export const FRAME_SITE_A = { x: 360, y: 20, width: 590, height: 940 };

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

// Positions de départ proposées pour une nouvelle stratégie (J1 à J5), modifiables dans l'éditeur.
// Espacées de 60 px : sur la map entière, les jetons sont plus grands et ne doivent pas se chevaucher.
export const SPAWNS = {
  t: [[330, 900], [390, 900], [450, 900], [510, 900], [570, 900]],
  ct: [[310, 225], [370, 225], [430, 225], [490, 225], [550, 225]],
};

export const DUST2 = {
  id: 'dust2',
  name: 'Dust 2',
  background: BACKGROUND,
  viewBox: VIEWBOX,
  zones: ZONES,
  spawns: SPAWNS,
  nav: NAV,
};
