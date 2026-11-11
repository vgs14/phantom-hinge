import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Every VITE_* value that src/config.js relies on. Checked here so a typo
// in .env fails the build, rather than producing a kiosk that boots into a
// blank header.
const REQUIRED = [
  'VITE_SITE_NAME',
  'VITE_WELCOME_MESSAGE',
  'VITE_ACCENT_COLOR',
  'VITE_TIME_ZONE',
  'VITE_LOCALE',
  'VITE_ROTATE_SECONDS',
  'VITE_REFRESH_SECONDS',
];

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  if (command === 'build') {
    const missing = REQUIRED.filter((key) => !env[key]);
    if (missing.length) {
      throw new Error(`missing from .env (mode "${mode}"): ${missing.join(', ')}`);
    }
    try {
      new Intl.DateTimeFormat(env.VITE_LOCALE, { timeZone: env.VITE_TIME_ZONE });
    } catch {
      throw new Error(`VITE_TIME_ZONE "${env.VITE_TIME_ZONE}" or VITE_LOCALE "${env.VITE_LOCALE}" isn't valid`);
    }
  }

  return {
    plugins: [vue()],

    // Values that aren't in .env but are still baked in at build time.
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __BUILD_MODE__: JSON.stringify(mode),
    },

    build: {
      // Straight into the backend, which serves it. build.sh then packs
      // backend/ (and only backend/) into the SquashFS.
      outDir: fileURLToPath(new URL('../backend/public', import.meta.url)),
      emptyOutDir: true,
      // Chromium on the kiosk is always current - no need for legacy output.
      target: 'esnext',
    },

    // "npm run dev": hot-reloading Vue on your own machine, with API calls
    // passed through to the real backend (node ../backend/server.js).
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:3000',
      },
    },
  };
});
