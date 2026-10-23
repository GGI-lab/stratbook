import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// GitHub Pages sert le site sous https://ggi-lab.github.io/stratbook/
// Liens lisibles (/stratbook/d2-split-a/etape-2/j2) : ces adresses n'existent pas en fichiers ;
// GitHub Pages répond alors avec 404.html, qui est une copie de l'application (elle lit l'adresse).
// Mode « e2e » (tests de parcours) : stratégies et pseudos figés de tests/fixtures au lieu de strategies/ et data/,
// pour que les modifications de Greg depuis l'application ne fassent pas échouer les tests.
export default defineConfig(({ mode }) => {
  let outDir = 'dist';
  return {
    base: '/stratbook/',
    resolve: {
      alias: {
        '@strategies': resolve(import.meta.dirname, mode === 'e2e' ? 'tests/fixtures/strategies' : 'strategies'),
        '@data': resolve(import.meta.dirname, mode === 'e2e' ? 'tests/fixtures/data' : 'data'),
      },
    },
    build: { outDir: mode === 'e2e' ? 'dist-e2e' : 'dist' },
    plugins: [
      {
        name: 'stratbook-404',
        apply: 'build',
        configResolved(config) {
          outDir = config.build.outDir;
        },
        closeBundle() {
          copyFileSync(join(outDir, 'index.html'), join(outDir, '404.html'));
        },
      },
    ],
  };
});
