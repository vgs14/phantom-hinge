import { onUnmounted, ref } from 'vue';

// The current time as a ref, ticking every `ms`. Used for the header clock
// and for "in 10 min" labels that need to count down between polls.
export function useNow(ms = 1000) {
  const now = ref(new Date());
  const timer = setInterval(() => {
    now.value = new Date();
  }, ms);
  onUnmounted(() => clearInterval(timer));
  return now;
}
