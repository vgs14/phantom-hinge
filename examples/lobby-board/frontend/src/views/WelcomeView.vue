<script setup>
// Welcome page: the greeting from .env, announcements from
// backend/data/announcements.json, and the visitors due around now.
import { computed } from 'vue';
import config from '../config.js';
import { getAnnouncements, getVisitors } from '../api.js';
import { usePolling } from '../composables/usePolling.js';
import { useNow } from '../composables/useNow.js';
import { relative, time } from '../format.js';
import FetchState from '../components/FetchState.vue';

const announcements = usePolling(getAnnouncements);
const visitors = usePolling(getVisitors);
const now = useNow(30e3);

const expected = computed(() => (visitors.data.value || []).filter((v) => v.status === 'expected'));
const arrived = computed(() =>
  (visitors.data.value || []).filter((v) => v.status === 'arrived').reverse().slice(0, 3),
);
</script>

<template>
  <div class="welcome">
    <section class="hero panel">
      <h1>Welcome to {{ config.siteName }}</h1>
      <p class="message">{{ config.welcomeMessage }}</p>

      <h2 class="label notices-title">Notices</h2>
      <ul class="notices">
        <li v-for="a in announcements.data.value || []" :key="a.id" :class="['notice', `level-${a.level}`]">
          <h3>{{ a.title }}</h3>
          <p>{{ a.body }}</p>
        </li>
      </ul>
      <FetchState :error="announcements.error.value" :updated="announcements.updated.value" />
    </section>

    <section class="visitors panel">
      <div class="head">
        <h2>Expected visitors</h2>
        <FetchState :error="visitors.error.value" :updated="visitors.updated.value" />
      </div>
      <ul class="people">
        <li
          v-for="v in expected.slice(0, 5)"
          :key="v.id"
          :class="['person', { late: Date.parse(v.expected) < now.getTime() }]"
        >
          <div class="when tabular">
            <strong>{{ time(v.expected) }}</strong>
            <span>{{ relative(v.expected, now.getTime()) }}</span>
          </div>
          <div class="who">
            <strong>{{ v.name }}</strong>
            <span>{{ v.company }} · visiting {{ v.host }}</span>
          </div>
        </li>
        <li v-if="visitors.data.value && !expected.length" class="empty">No more visitors expected.</li>
      </ul>

      <h2 class="label">Recently arrived</h2>
      <ul class="arrived">
        <li v-for="v in arrived" :key="v.id">
          <span class="pill">{{ time(v.arrived) }}</span> {{ v.name }}, {{ v.company }}
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.welcome {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 2rem;
  height: 100%;
}

.hero {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: hidden;
}
.hero h1 {
  font-size: 2.8rem;
}
.message {
  font-size: 1.35rem;
  color: var(--muted);
  margin: 0 0 1rem;
}
.notices-title {
  margin-top: auto;
}
.notices {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.notice {
  background: var(--panel-2);
  border-left: 4px solid var(--accent);
  border-radius: 0.6rem;
  padding: 0.9rem 1.1rem;
}
.level-warning {
  border-left-color: var(--warn);
}
.level-notice {
  border-left-color: var(--muted);
}
.notice h3 {
  font-size: 1.05rem;
}
.notice p {
  margin: 0.3rem 0 0;
  color: var(--muted);
}

.visitors {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: hidden;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.people,
.arrived {
  list-style: none;
  margin: 0;
  padding: 0;
}
.person {
  display: flex;
  gap: 1.4rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--line);
}
.when,
.who {
  display: flex;
  flex-direction: column;
}
.when {
  width: 6.5rem;
  flex: none;
}
.when strong {
  font-size: 1.3rem;
  color: var(--accent);
}
.when span,
.who span {
  color: var(--muted);
  font-size: 0.9rem;
}
.late .when strong,
.late .when span {
  color: var(--warn);
}
.who strong {
  font-size: 1.15rem;
}
.empty {
  color: var(--muted);
  padding: 1rem 0;
}
.arrived li {
  padding: 0.35rem 0;
  color: var(--muted);
}
.arrived .pill {
  background: color-mix(in srgb, var(--free) 20%, transparent);
  color: var(--free);
  margin-right: 0.5rem;
}
</style>
