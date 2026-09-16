<template>
  <!--
    插入本知识库其他文档的选择器。
    视觉跟应用的浮层一致：圆角 12、细边、柔和阴影；顶部一条搜索，下面是文档行。
  -->
  <div class="pick-mask" @click.self="emit('close')">
    <div class="pick ui-font">
      <div class="pick-head">
        <PhMagnifyingGlass :size="13" class="pick-glass" />
        <input
          ref="inputEl"
          v-model="kw"
          class="pick-input"
          placeholder="搜索文档…"
          @keydown.esc="emit('close')"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.enter.prevent="choose(list[active])"
        />
        <span class="pick-count">{{ list.length }}</span>
      </div>

      <div class="pick-list no-scrollbar">
        <button
          v-for="(d, i) in list"
          :key="d.file"
          class="pick-row"
          :class="{ 'is-active': i === active }"
          @mouseenter="active = i"
          @click="choose(d)"
        >
          <PhFilePdf v-if="d.type === 'pdf'" :size="13" class="pick-icon" />
          <PhFileText v-else :size="13" class="pick-icon" />
          <span class="pick-name">{{ d.name }}</span>
          <span class="pick-path">{{ folderOf(d.file) }}</span>
        </button>
        <p v-if="!list.length" class="pick-empty">没有匹配的文档</p>
      </div>

      <div class="pick-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
        <span><kbd>↵</kbd> 插入</span>
        <span><kbd>esc</kbd> 关闭</span>
      </div>
    </div>
  </div>
</template>

<script setup>
/* 斜杠菜单里"插入文档"用的选择器：搜名字或路径都行，键盘可用 */
import { computed, onMounted, ref, watch } from 'vue'
import { PhMagnifyingGlass, PhFileText, PhFilePdf } from '@phosphor-icons/vue'
import { useDocsStore } from '../stores/docs'

const emit = defineEmits(['close', 'pick'])
const store = useDocsStore()
const kw = ref('')
const active = ref(0)
const inputEl = ref(null)

onMounted(() => inputEl.value?.focus())

const list = computed(() => {
  const k = kw.value.trim().toLowerCase()
  const all = (store.allDocs || []).filter((d) => d.file !== store.currentPath)
  const hit = k ? all.filter((d) => d.name.toLowerCase().includes(k) || d.file.toLowerCase().includes(k)) : all
  return hit.slice(0, 60)
})

watch(list, () => {
  active.value = 0
})

function move(step) {
  if (!list.value.length) return
  active.value = (active.value + step + list.value.length) % list.value.length
}

function choose(doc) {
  if (!doc) return
  emit('pick', doc)
}

function folderOf(file) {
  const parts = String(file).split('/')
  return parts.length > 1 ? parts.slice(0, -1).join(' / ') : '根目录'
}
</script>

<style scoped>
/* 不带遮罩：它是个"挑一篇插进去"的轻浮层，不该像模态框那样压住整页 */
.pick-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: transparent;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 22vh;
}
.pick {
  width: 392px;
  max-width: calc(100vw - 48px);
  max-height: 46vh;
  display: flex;
  flex-direction: column;
  background: var(--c-pop);
  border: 1px solid var(--c-line);
  border-radius: 11px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06), 0 14px 40px rgba(0, 0, 0, 0.14);
  overflow: hidden;
  animation: pick-in 0.15s ease-out;
}
@keyframes pick-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: none; }
}
.pick-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 11px 0 13px;
  border-bottom: 1px solid var(--c-line-soft);
  flex-shrink: 0;
}
.pick-glass { color: var(--c-faint); flex-shrink: 0; }
.pick-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  background: transparent;
  border: none;
  outline: none;
  font-size: 12.5px;
  color: var(--c-ink);
}
.pick-input::placeholder { color: var(--c-faint); }
.pick-count {
  font-size: 11px;
  color: var(--c-faint);
  font-variant-numeric: tabular-nums;
}
.pick-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 5px;
}
.pick-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 9px;
  border-radius: 7px;
  text-align: left;
}
.pick-row.is-active { background: var(--c-hover); }
.pick-icon { color: var(--c-faint); flex-shrink: 0; }
.pick-name {
  font-size: 12.5px;
  color: var(--c-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pick-path {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--c-faint);
}
.pick-empty {
  padding: 18px;
  text-align: center;
  font-size: 12px;
  color: var(--c-faint);
}
.pick-foot {
  display: flex;
  gap: 12px;
  padding: 8px 14px;
  border-top: 1px solid var(--c-line-soft);
  font-size: 11px;
  color: var(--c-faint);
  flex-shrink: 0;
}
.pick-foot kbd {
  font-family: var(--font-mono);
  font-size: 10.5px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--c-field);
  margin-right: 3px;
}
</style>
