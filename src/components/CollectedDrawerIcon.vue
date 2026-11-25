<template>
  <span class="drawer-mark" :class="{ received }">
    <span class="drawer-glyph"><ContentIcon :value="value" :size="20" /></span>
    <span v-if="received" class="drawer-check" aria-hidden="true"><PhCheck weight="bold" :size="8" /></span>
  </span>
  <Teleport to="body">
    <span v-if="embedded" class="sr-only" role="status">{{ received ? '已保存到知识库「' + file.split('/')[0] + '」' : '' }}</span>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { PhCheck } from '../icons/remix'
import ContentIcon from './ContentIcon.vue'

const props = defineProps({
  value: String,
  file: String,
  docId: String,
  loaded: Boolean
})
const embedded = window.parent !== window
const receipt = ref(null)
const received = computed(() => props.loaded && receipt.value?.file === props.file && receipt.value?.id === props.docId)
let timer

function onCollection(event) {
  if (event.source !== window.parent || event.data?.type !== 'dsh-reader:collection-opened') return
  const { file, id } = event.data
  if (typeof file !== 'string' || !file || typeof id !== 'string' || !id) return
  receipt.value = { file, id }
  window.removeEventListener('message', onCollection)
  // Discard a receipt if the target failed to open, even if it is visited later.
  timer = setTimeout(() => { receipt.value = null }, 8000)
}
watch(received, active => {
  if (!active) { receipt.value = null; return }
  clearTimeout(timer)
  timer = setTimeout(() => { receipt.value = null }, 1600)
})
onMounted(() => { if (embedded) window.addEventListener('message', onCollection) })
onBeforeUnmount(() => { clearTimeout(timer); window.removeEventListener('message', onCollection) })
</script>

<style scoped>
.drawer-mark,.drawer-glyph { display: inline-grid; place-items: center; }
.drawer-mark { position: relative; width: 20px; height: 20px; }
.drawer-check {
  position: absolute; right: 0; bottom: 0; display: grid; place-items: center;
  width: 11px; height: 11px; border-radius: 50%;
  background: var(--c-ink); color: var(--c-surface); box-shadow: 0 0 0 1px var(--c-surface);
}
@media (prefers-reduced-motion: no-preference) {
  .received .drawer-glyph { animation: drawer-receive 300ms var(--motion-ease); }
  .drawer-check { animation: drawer-settle 180ms var(--motion-ease) 90ms backwards; }
  @keyframes drawer-receive { 40% { transform: translateY(2px) scale(.95); } }
  @keyframes drawer-settle { from { opacity: 0; transform: translateY(-3px); } }
}
</style>
