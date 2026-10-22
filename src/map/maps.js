// Registre des cartes. Pour ajouter une map : créer son fichier (image, cadrage, zones)
// sur le modèle de dust2.js, puis l'ajouter ici. Une stratégie s'y réfère par son id ("map": "dust2").
import { DUST2 } from './dust2.js';

export const MAPS = { [DUST2.id]: DUST2 };

export function getMap(id) {
  const map = MAPS[id];
  if (!map) throw new Error(`Carte inconnue : ${id}`);
  return map;
}
