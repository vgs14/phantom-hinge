<script setup>
// The small "updated 12:04 / reconnecting..." line each page shows, driven
// by usePolling()'s refs.
import { time } from '../format.js';

defineProps({
  error: { type: Object, default: null },
  updated: { type: Date, default: null },
});
</script>

<template>
  <span v-if="error" class="state bad">Can't reach the backend, retrying…</span>
  <span v-else-if="updated" class="state">Updated {{ time(updated) }}</span>
  <span v-else class="state">Loading…</span>
</template>

<style scoped>
.state {
  color: var(--faint);
  font-size: 0.85rem;
}
.bad {
  color: var(--warn);
}
</style>
