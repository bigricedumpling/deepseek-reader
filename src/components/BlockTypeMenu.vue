<template>
  <Teleport to="body">
    <div
      ref="el"
      class="bt-menu ui-font"
      :style="{ left: x + 'px', top: y + dy + 'px' }"
      @mousedown.prevent
      @contextmenu.prevent
    >
      <template v-for="g in groups" :key="g.label">
        <p class="bt-group">{{ g.label }}</p>
        <button
          v-for="it in g.items"
          :key="it.key"
          class="bt-item"
          :class="{ 'is-on': it.active }"
          @click="emit('pick', it.key)"
        >
          <span class="bt-icon">{{ it.icon }}</span>
          <span class="bt-label">{{ it.label }}</span>
          <PhCheck v-if="it.active" :size="12" class="bt-check" />
        </button>
      </template>
    </div>
  </Teleport>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { PhCheck } from '@phosphor-icons/vue'

const el = ref(null)
/* 菜单实际有多高，量出来再决定往上顶多少（比拍一个固定高度稳） */
const dy = ref(0)
onMounted(() => {
  const r = el.value?.getBoundingClientRect()
  if (!r) return
  const over = r.bottom - (window.innerHeight - 8)
  if (over > 0) dy.value = -Math.min(over, Math.max(0, r.top - 8))
})

defineProps({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  /* [{ label, items: [{ key, label, icon, active }] }] */
  groups: { type: Array, default: () => [] }
})
const emit = defineEmits(['pick'])
</script>

<style scoped>
.bt-menu {
  position: fixed;
  z-index: 55;
  width: 198px;
  max-height: min(420px, calc(100dvh - 24px));
  overflow-y: auto;
  padding: 7px;
  scrollbar-width: thin;
  scrollbar-color: var(--c-line) transparent;
  background: var(--c-pop, #fff);
  border: 1px solid var(--c-line-soft, #ececec);
  border-radius: var(--radius-surface);
  box-shadow: var(--c-pop-shadow);
}
.bt-group {
  margin: 4px 0 3px;
  padding: 6px 9px 3px;
  font-size: 10.5px;
  letter-spacing: 0;
  color: var(--c-faint, #9a9a9a);
}
.bt-group:not(:first-child) { margin-top: 7px; border-top: 1px solid var(--c-line); padding-top: 10px; }
.bt-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 32px;
  padding: 6px 9px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--c-text, #333);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}
.bt-item:hover {
  background: var(--c-hover, #f4f4f4);
}
.bt-item.is-on {
  color: var(--color-ds, #4d6bfe);
  background: var(--c-active);
}
.bt-icon {
  display: inline-flex;
  width: 23px;
  flex-shrink: 0;
  justify-content: center;
  font-size: 11px;
  color: var(--c-faint, #9a9a9a);
  font-variant-numeric: tabular-nums;
}
.bt-item.is-on .bt-icon {
  color: inherit;
}
.bt-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.bt-check {
  flex-shrink: 0;
  opacity: 0.9;
}
</style>
