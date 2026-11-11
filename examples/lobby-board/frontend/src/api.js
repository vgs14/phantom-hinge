// The backend's JSON API (backend/server.js). Same origin as the page, so
// there's no CORS and no base URL to configure - in "npm run dev" Vite's
// proxy forwards /api to the backend instead.

const TIMEOUT_MS = 8000;

async function get(path) {
  const res = await fetch(path, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export const getAnnouncements = () => get('/api/announcements');
export const getVisitors = () => get('/api/visitors');
export const getRooms = () => get('/api/rooms');
export const getSystem = () => get('/api/system');
