import { defineConfig, devices } from '@playwright/test';

// Tests de bout en bout sur le site construit (vite preview).
// Projets : iPhone (WebKit, proche de Safari iOS) et Android (Chromium), plus un écran d'ordinateur.
// CHROME_PATH permet d'utiliser un Chrome déjà installé quand le téléchargement des navigateurs est impossible.
const chromePath = process.env.CHROME_PATH;
const chromium = chromePath ? { launchOptions: { executablePath: chromePath } } : {};

const projects = [
  { name: 'android-chromium', use: { ...devices['Pixel 7'], ...chromium } },
  { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], ...chromium } },
];
if (!process.env.SKIP_WEBKIT) projects.unshift({ name: 'iphone-webkit', use: { ...devices['iPhone 14'] } });

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173/stratbook/',
    locale: 'fr-FR',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/stratbook/',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects,
});
