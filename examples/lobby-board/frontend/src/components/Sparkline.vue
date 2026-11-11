<script setup>
// A filled line graph of `values`, scaled to `max` (or the largest value).
import { computed } from 'vue';

const props = defineProps({
  values: { type: Array, required: true },
  max: { type: Number, default: 0 },
});

const W = 300;
const H = 60;

const points = computed(() => {
  const v = props.values;
  if (v.length < 2) return '';
  const top = props.max || Math.max(...v, 1e-9);
  return v
    .map((y, i) => `${((i / (v.length - 1)) * W).toFixed(1)},${(H - (y / top) * (H - 2)).toFixed(1)}`)
    .join(' ');
});
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="spark" aria-hidden="true">
    <polygon v-if="points" :points="`0,${H} ${points} ${W},${H}`" class="area" />
    <polyline v-if="points" :points="points" class="line" />
  </svg>
</template>

<style scoped>
.spark {
  width: 100%;
  height: 4rem;
  display: block;
}
.line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
.area {
  fill: var(--accent);
  opacity: 0.15;
}
</style>
