import { onMounted, onUnmounted, ref } from 'vue';
import config from '../config.js';

// Fetches straight away, then every `seconds` (VITE_REFRESH_SECONDS by
// default) for as long as the component is on screen.
//
// A failed fetch keeps the last good data and sets `error`, so a backend
// restart shows a small "reconnecting" note instead of blanking the page.
export function usePolling(fetcher, seconds = config.refreshSeconds) {
  const data = ref(null);
  const error = ref(null);
  const updated = ref(null);
  let timer = null;

  async function refresh() {
    try {
      data.value = await fetcher();
      error.value = null;
      updated.value = new Date();
    } catch (err) {
      error.value = err;
      console.warn(err);
    }
  }

  onMounted(() => {
    refresh();
    timer = setInterval(refresh, seconds * 1000);
  });
  onUnmounted(() => clearInterval(timer));

  return { data, error, updated, refresh };
}
