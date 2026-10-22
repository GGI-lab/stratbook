// Plan schématique de Dust 2, dessiné pour le projet (pas le radar officiel).
// Repère : viewBox 0 0 420 460, nord en haut, côté T en bas.
// Les zones sont approximatives : elles servent à se repérer, pas à placer un lineup.

export const VIEWBOX = { width: 420, height: 460 };

// Couloirs : traits épais dessinés sous les zones.
export const CORRIDORS = [
  [[250, 425], [300, 385], [345, 360]], // Spawn T vers portes Long
  [[350, 345], [350, 330]], // portes Long vers Long
  [[350, 170], [340, 145], [325, 122], [310, 102]], // Long, Car, Rampe, site A
  [[368, 178], [392, 178]], // Long vers Pit
  [[200, 412], [205, 345]], // Spawn T vers Top Mid
  [[170, 415], [145, 388]], // Spawn T vers Suicide
  [[160, 362], [186, 336]], // Suicide vers Top Mid
  [[205, 320], [205, 312]], // Top Mid vers Mid
  [[220, 205], [242, 205], [268, 192]], // Mid, Xbox, Short
  [[271, 116], [276, 100]], // Short vers site A
  [[205, 152], [172, 86]], // Mid vers CT
  [[186, 190], [176, 190]], // Mid vers Lower
  [[198, 60], [252, 62]], // CT vers site A
];

// Zones nommées. anchor = point où poser un symbole d'utilitaire.
// labelAt = position du nom, placée pour ne pas être masquée par les joueurs.
export const ZONES = [
  { id: 'siteA', name: 'Site A', x: 250, y: 30, w: 125, h: 80, anchor: [312, 52], labelAt: { x: 367, y: 42, anchor: 'end' } },
  { id: 'ct', name: 'CT', x: 110, y: 30, w: 90, h: 60, anchor: [155, 62], labelAt: { x: 118, y: 44, anchor: 'start' } },
  { id: 'rampe', name: 'Rampe', x: 298, y: 110, w: 56, h: 18, anchor: [326, 119], labelAt: { x: 326, y: 119 } },
  { id: 'car', name: 'Car', x: 318, y: 130, w: 46, h: 26, anchor: [341, 143], labelAt: { x: 314, y: 147, anchor: 'end' } },
  { id: 'pit', name: 'Pit', x: 380, y: 158, w: 32, h: 44, anchor: [396, 180], labelAt: { x: 396, y: 180, rotate: true } },
  { id: 'long', name: 'Long', x: 330, y: 160, w: 40, h: 180, anchor: [350, 250], labelAt: { x: 378, y: 290, rotate: true } },
  { id: 'portesLong', name: 'Portes Long', x: 312, y: 340, w: 76, h: 24, anchor: [350, 352], labelAt: { x: 350, y: 376 } },
  { id: 'short', name: 'Short', x: 256, y: 112, w: 32, h: 92, anchor: [272, 132], labelAt: { x: 297, y: 172, rotate: true } },
  { id: 'xbox', name: 'Xbox', x: 226, y: 192, w: 28, h: 26, anchor: [240, 205], labelAt: { x: 240, y: 229 } },
  { id: 'mid', name: 'Mid', x: 185, y: 150, w: 40, h: 165, anchor: [205, 230], labelAt: { x: 205, y: 280, rotate: true } },
  { id: 'lower', name: 'Lower', x: 110, y: 172, w: 66, h: 38, anchor: [143, 191], labelAt: { x: 143, y: 191 } },
  { id: 'topMid', name: 'Top Mid', x: 178, y: 318, w: 56, h: 28, anchor: [206, 332], labelAt: { x: 174, y: 332, anchor: 'end' } },
  { id: 'suicide', name: 'Suicide', x: 112, y: 350, w: 58, h: 40, anchor: [141, 370], labelAt: { x: 108, y: 370, anchor: 'end' } },
  { id: 'tSpawn', name: 'Spawn T', x: 140, y: 412, w: 130, h: 40, anchor: [205, 432], labelAt: { x: 205, y: 443 } },
];
