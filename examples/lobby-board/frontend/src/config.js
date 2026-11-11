// Everything the app takes from .env, in one place.
//
// import.meta.env.VITE_* is replaced with the literal value from .env when
// Vite builds the bundle, so this file is where "build-time configuration"
// actually happens. There's no runtime config - to change a value, edit
// .env and rebuild the SquashFS (see ../build.sh). vite.config.js checks
// they're all set before building.

const env = import.meta.env;

function seconds(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export default Object.freeze({
  siteName: env.VITE_SITE_NAME,
  welcomeMessage: env.VITE_WELCOME_MESSAGE,
  accentColor: env.VITE_ACCENT_COLOR,
  timeZone: env.VITE_TIME_ZONE,
  locale: env.VITE_LOCALE,
  rotateSeconds: seconds(env.VITE_ROTATE_SECONDS, 20),
  // At least 5s, so a typo can't make every page hammer the backend.
  refreshSeconds: Math.max(5, seconds(env.VITE_REFRESH_SECONDS, 30)),

  // Not from .env, but baked in the same way (see "define" in vite.config.js).
  version: __APP_VERSION__,
  builtAt: __BUILD_TIME__,
  buildMode: __BUILD_MODE__,
});
