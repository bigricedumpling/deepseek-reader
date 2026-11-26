<template>
  <svg v-if="playing" class="cover-ink-pass" :data-cover-ink="artwork.id" aria-hidden="true" focusable="false"
    viewBox="-600 0 2400 400" :style="placement" @animationend.self="finish" @animationcancel.self="finish">
    <use class="wet-line" :href="artwork.inkUrl" />
    <use class="pen-tip" :href="artwork.inkUrl" />
  </svg>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  artwork: { type: Object, required: true },
  position: { type: Number, default: 50 }
})
const emit = defineEmits(['finish'])
const playing = ref(true)
const placement = computed(() => ({
  top: props.position + '%', transform: 'translate(-50%, -' + props.position + '%)'
}))

function finish(event) {
  playing.value = false
  if (!event.currentTarget.closest('.cover-swap-leave-active')) emit('finish', props.artwork.id)
}
</script>

<style scoped>
/* Match the poster's 6:1 object-fit crop on the document and on the selected tile. */
.cover-ink-pass {
  position:absolute; left:50%; width:max(100cqw, 600cqh); height:auto; max-width:none;
  pointer-events:none; animation:ink-dry 1760ms linear both;
}
.wet-line {
  stroke:#3a70b3; stroke-dasharray:1 1;
  --pen-start:1; --pen-end:0;
}
.pen-tip {
  stroke:#6796cd; stroke-dasharray:.09 1;
  --pen-start:.09; --pen-end:-.91;
}
use { animation:ink-draw 1140ms cubic-bezier(.36,.12,.32,.96) 100ms both; }
@keyframes ink-draw {
  from { stroke-dashoffset:var(--pen-start); }
  to { stroke-dashoffset:var(--pen-end); }
}
@keyframes ink-dry {
  0%, 5% { opacity:0; }
  13%, 74% { opacity:1; }
  100% { opacity:0; }
}
@media print,(prefers-reduced-motion:reduce) { .cover-ink-pass {display:none} }
</style>
