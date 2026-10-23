import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';

// GitHub Pages sert le site sous https://ggi-lab.github.io/stratbook/
// Liens lisibles (/stratbook/d2-split-a/etape-2/j2) : ces adresses n'existent pas en fichiers ;
// GitHub Pages répond alors avec 404.html, qui est une copie de l'application (elle lit l'adresse).
let outDir = 'dist';
export default defineConfig({
  base: '/stratbook/',
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
});
