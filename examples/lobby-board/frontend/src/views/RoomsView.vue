<script setup>
// Meeting rooms: one card per room from /api/rooms, free or busy right now
// and what's booked next.
import { getRooms } from '../api.js';
import { usePolling } from '../composables/usePolling.js';
import { useNow } from '../composables/useNow.js';
import { relative, time, timeRange } from '../format.js';
import FetchState from '../components/FetchState.vue';

const rooms = usePolling(getRooms);
const now = useNow(30e3);
</script>

<template>
  <div class="rooms">
    <div class="head">
      <h1>Meeting rooms</h1>
      <FetchState :error="rooms.error.value" :updated="rooms.updated.value" />
    </div>

    <div class="grid">
      <article v-for="r in rooms.data.value || []" :key="r.id" :class="['room', 'panel', r.status]">
        <header>
          <div>
            <h2>{{ r.name }}</h2>
            <span class="meta">
              Floor {{ r.floor }} · {{ r.capacity }} people
              <span v-for="f in r.features" :key="f" class="feature">{{ f }}</span>
            </span>
          </div>
          <span class="pill status">{{ r.status === 'busy' ? 'In use' : 'Free' }}</span>
        </header>

        <div class="now">
          <template v-if="r.current">
            <strong>{{ r.current.title }}</strong>
            <span>{{ r.current.organiser }} · until {{ time(r.current.end) }}</span>
          </template>
          <template v-else-if="r.freeUntil">
            <strong>Free until {{ time(r.freeUntil) }}</strong>
            <span>next booking {{ relative(r.freeUntil, now.getTime()) }}</span>
          </template>
          <template v-else>
            <strong>Free for the next few hours</strong>
          </template>
        </div>

        <ul class="next">
          <li v-for="b in r.upcoming.slice(0, 3)" :key="b.start">
            <span class="tabular">{{ timeRange(b.start, b.end) }}</span>
            <span class="title">{{ b.title }}</span>
          </li>
        </ul>
      </article>
    </div>
  </div>
</template>

<style scoped>
.rooms {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  height: 100%;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.head h1 {
  font-size: 2.2rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 1fr;
  gap: 1.5rem;
  flex: 1;
  min-height: 0;
}

.room {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  border-top: 5px solid var(--free);
  overflow: hidden;
}
.room.busy {
  border-top-color: var(--busy);
}
.room header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.room h2 {
  font-size: 1.6rem;
}
.meta {
  color: var(--muted);
  font-size: 0.9rem;
}
.status {
  background: color-mix(in srgb, var(--free) 20%, transparent);
  color: var(--free);
}
.busy .status {
  background: color-mix(in srgb, var(--busy) 20%, transparent);
  color: var(--busy);
}

.now {
  display: flex;
  flex-direction: column;
}
.now strong {
  font-size: 1.2rem;
}
.now span {
  color: var(--muted);
}

.next {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.95rem;
}
.next li {
  display: flex;
  gap: 1rem;
  padding: 0.3rem 0;
  border-top: 1px solid var(--line);
}
.next .tabular {
  color: var(--muted);
  width: 7.5rem;
  flex: none;
}
.next .title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.feature {
  margin-left: 0.4rem;
  font-size: 0.75rem;
  color: var(--muted);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.1rem 0.6rem;
}
</style>
