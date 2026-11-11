<script setup>
// The board's frame: header with the site name, page tabs and clock; the
// current page; and a footer with the rotation progress and build details.
//
// Rotation: with no touch or mouse input for VITE_ROTATE_SECONDS, move to
// the next page in router.js's order. Any input restarts the countdown, so
// someone reading a page (or tapping a tab) isn't moved on mid-read.

import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import config from './config.js';
import { routes } from './router.js';
import { useNow } from './composables/useNow.js';
import { clock, longDate } from './format.js';

const router = useRouter();
const route = useRoute();
const now = useNow();

const pages = routes.filter((r) => r.meta);
const rotateMs = config.rotateSeconds * 1000;
const lastInput = ref(Date.now());

// 0..1 through the current page's turn, for the footer bar.
const progress = computed(() =>
  rotateMs ? Math.min(1, (now.value.getTime() - lastInput.value) / rotateMs) : 0,
);

function onInput() {
  lastInput.value = Date.now();
}

let timer = null;

onMounted(() => {
  for (const ev of ['pointerdown', 'keydown', 'wheel']) {
    window.addEventListener(ev, onInput, { passive: true });
  }
  if (!rotateMs) return;
  timer = setInterval(() => {
    if (Date.now() - lastInput.value < rotateMs) return;
    const i = pages.findIndex((p) => p.name === route.name);
    router.push({ name: pages[(i + 1) % pages.length].name });
    lastInput.value = Date.now();
  }, 250);
});

onUnmounted(() => {
  clearInterval(timer);
  for (const ev of ['pointerdown', 'keydown', 'wheel']) {
    window.removeEventListener(ev, onInput);
  }
});

const builtAt = new Date(config.builtAt).toLocaleString(config.locale, {
  timeZone: config.timeZone, dateStyle: 'medium', timeStyle: 'short',
});
</script>

<template>
  <div class="frame">
    <header class="top">
      <div class="brand">
        <span class="mark" aria-hidden="true">H</span>
        <span class="site">{{ config.siteName }}</span>
      </div>

      <nav class="tabs">
        <RouterLink v-for="p in pages" :key="p.name" :to="{ name: p.name }" class="tab">
          {{ p.meta.title }}
        </RouterLink>
      </nav>

      <div class="clock">
        <div class="time">{{ clock(now) }}</div>
        <div class="date">{{ longDate(now) }}</div>
      </div>
    </header>

    <main class="page">
      <RouterView v-slot="{ Component }">
        <Transition name="fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

    <footer class="bottom">
      <div v-if="rotateMs" class="rotate">
        <div class="bar" :style="{ transform: `scaleX(${progress})` }"></div>
      </div>
      <span>lobby-board v{{ config.version }}</span>
      <span>build "{{ config.buildMode }}", {{ builtAt }}</span>
      <span v-if="rotateMs">next page after {{ config.rotateSeconds }}s idle</span>
      <span v-else>rotation off</span>
    </footer>
  </div>
</template>

<style scoped>
.frame {
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: 100vh;
}

.top {
  display: flex;
  align-items: center;
  gap: 2.5rem;
  padding: 1.25rem 2.5rem;
  border-bottom: 1px solid var(--line);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  min-width: 0;
}
.mark {
  display: grid;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 0.6rem;
  background: var(--accent);
  color: #fff;
  font-weight: 800;
  font-size: 1.4rem;
  flex: none;
}
.site {
  font-size: 1.5rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tabs {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}
.tab {
  padding: 0.7rem 1.3rem;
  border-radius: 999px;
  color: var(--muted);
  text-decoration: none;
  font-size: 1.1rem;
  font-weight: 600;
  /* Big enough to hit on a touchscreen. */
  min-height: 3rem;
  display: flex;
  align-items: center;
}
.tab.router-link-exact-active {
  background: var(--accent);
  color: #fff;
}

.clock {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.time {
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.1;
}
.date {
  color: var(--muted);
}

.page {
  overflow: hidden;
  padding: 2rem 2.5rem;
  min-height: 0;
}

.bottom {
  position: relative;
  display: flex;
  gap: 2rem;
  padding: 0.7rem 2.5rem;
  color: var(--faint);
  font-size: 0.85rem;
  border-top: 1px solid var(--line);
}
.rotate {
  position: absolute;
  inset: -1px 0 auto 0;
  height: 2px;
}
.bar {
  height: 100%;
  background: var(--accent);
  transform-origin: left;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.fade-leave-to {
  opacity: 0;
}
</style>
