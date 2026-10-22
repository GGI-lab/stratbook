// Stratégie dans le lien de partage : JSON compressé (deflate) puis encodé en base64 pour URL.
// Préfixe « z » : compressé ; « j » : JSON simple (navigateur sans CompressionStream).
// Sans serveur, c'est ce qui permet d'envoyer une stratégie créée sur un téléphone à un ami.

const toB64Url = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

// Les champs « source » ne servent qu'à relire les données du dépôt : inutiles dans un lien.
function compact(strategy) {
  return JSON.stringify(strategy, (k, v) => (k === 'source' ? undefined : v));
}

export async function encodeStrategy(strategy) {
  const bytes = new TextEncoder().encode(compact(strategy));
  if (typeof CompressionStream === 'function') {
    try {
      return `z${toB64Url(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
    } catch {
      /* repli ci-dessous */
    }
  }
  return `j${toB64Url(bytes)}`;
}

/** Objet brut décodé (à passer ensuite par sanitizeStrategy), ou null. */
export async function decodeStrategy(value) {
  try {
    if (typeof value !== 'string' || value.length < 2 || value.length > 60000) return null;
    let bytes = fromB64Url(value.slice(1));
    if (value[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (value[0] !== 'j') return null;
    if (bytes.length > 500000) return null;
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
