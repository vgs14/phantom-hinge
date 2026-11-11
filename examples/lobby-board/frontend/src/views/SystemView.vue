<script setup>
// This kiosk: real stats from /api/system (hostname, load, memory, network,
// the app image it booted), plus what was baked in at build time. Polls
// faster than the other pages so the graphs move.
import { computed } from 'vue';
import config from '../config.js';
import { getSystem } from '../api.js';
import { usePolling } from '../composables/usePolling.js';
import { bytes, duration } from '../format.js';
import FetchState from '../components/FetchState.vue';
import Sparkline from '../components/Sparkline.vue';

const sys = usePolling(getSystem, 5);
const s = computed(() => sys.data.value);

const memUsed = computed(() => (s.value ? s.value.memory.total - s.value.memory.free : 0));
const memPct = computed(() => (s.value ? Math.round((memUsed.value / s.value.memory.total) * 100) : 0));
const loadHistory = computed(() => (s.value ? s.value.samples.map((x) => x.load1) : []));
// IPv4 only, to keep the table short - a kiosk normally has one NIC anyway.
const ipv4 = computed(() => (s.value ? s.value.interfaces.filter((i) => i.family === 'IPv4').slice(0, 5) : []));
const memHistory = computed(() => (s.value ? s.value.samples.map((x) => x.memUsed) : []));

const buildEnv = [
  ['VITE_SITE_NAME', config.siteName],
  ['VITE_ACCENT_COLOR', config.accentColor],
  ['VITE_TIME_ZONE', config.timeZone],
  ['VITE_LOCALE', config.locale],
  ['VITE_ROTATE_SECONDS', config.rotateSeconds],
  ['VITE_REFRESH_SECONDS', config.refreshSeconds],
];
</script>

<template>
  <div class="system">
    <div class="head">
      <h1>This kiosk</h1>
      <FetchState :error="sys.error.value" :updated="sys.updated.value" />
    </div>

    <div v-if="s" class="grid">
      <section class="panel tile">
        <span class="label">Hostname</span>
        <strong class="big">{{ s.hostname }}</strong>
        <span class="sub">{{ s.platform }}</span>
      </section>

      <section class="panel tile">
        <span class="label">Uptime</span>
        <strong class="big tabular">{{ duration(s.uptime.system) }}</strong>
        <span class="sub">backend up {{ duration(s.uptime.backend) }} · Node {{ s.node }}</span>
      </section>

      <section class="panel tile">
        <span class="label">Load (1 / 5 / 15 min)</span>
        <strong class="big tabular">{{ s.load.map((l) => l.toFixed(2)).join(' / ') }}</strong>
        <span class="sub">{{ s.cpu.count }} × {{ s.cpu.model }}</span>
        <Sparkline :values="loadHistory" />
      </section>

      <section class="panel tile">
        <span class="label">Memory</span>
        <strong class="big tabular">{{ memPct }}%</strong>
        <span class="sub">{{ bytes(memUsed) }} of {{ bytes(s.memory.total) }} used - everything runs from RAM</span>
        <Sparkline :values="memHistory" :max="s.memory.total" />
      </section>

      <section class="panel wide">
        <span class="label">Network</span>
        <table>
          <tr v-for="i in ipv4" :key="i.name + i.address">
            <td>{{ i.name }}</td>
            <td class="tabular">{{ i.address }}</td>
            <td class="dim tabular">{{ i.mac }}</td>
          </tr>
          <tr v-if="!ipv4.length"><td class="dim">No network interfaces up</td></tr>
        </table>

        <span class="label">App image</span>
        <table>
          <tr><td>app-url</td><td class="mono">{{ s.boot.appurl || '(not set - baked into the base image)' }}</td></tr>
          <tr v-if="s.boot.appsha256"><td>app-sha256</td><td class="mono">{{ s.boot.appsha256 }}</td></tr>
        </table>
      </section>

      <section class="panel wide">
        <span class="label">Baked in at build time (.env, mode "{{ config.buildMode }}")</span>
        <table>
          <tr v-for="[k, v] in buildEnv" :key="k">
            <td class="mono">{{ k }}</td>
            <td>{{ v }}</td>
          </tr>
          <tr><td class="mono">version</td><td>{{ config.version }}, built {{ config.builtAt }}</td></tr>
        </table>
      </section>
    </div>
  </div>
</template>

<style scoped>
.system {
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
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: auto 1fr;
  gap: 1.5rem;
  flex: 1;
  min-height: 0;
}
.tile {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
}
.big {
  font-size: 1.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sub {
  color: var(--muted);
  font-size: 0.9rem;
  margin-bottom: auto;
}
.wide {
  grid-column: span 2;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  overflow: hidden;
}
table {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 1rem;
}
td {
  padding: 0.35rem 1rem 0.35rem 0;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
.dim {
  color: var(--muted);
}
.mono {
  font-family: "DejaVu Sans Mono", ui-monospace, monospace;
  font-size: 0.9rem;
  word-break: break-all;
}
</style>
