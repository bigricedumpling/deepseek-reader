<template>
  <Teleport to="body">
    <Transition name="overlay" appear @after-leave="afterLeave">
      <div v-if="visible" class="pick-mask" @click.self="close">
        <section ref="dialog" class="pick ui-font" role="dialog" aria-modal="true" aria-label="插入文档引用" tabindex="-1">
          <div class="pick-head">
            <PhMagnifyingGlass :size="15" class="pick-glass" aria-hidden="true" />
            <input v-model="kw" class="pick-input" type="search" aria-label="搜索当前知识库的文档"
              autofocus role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="reference-results"
              :aria-activedescendant="list.length ? 'reference-option-' + active : undefined" placeholder="搜索文档"
              @keydown="onKey" />
            <span class="pick-count">{{ list.length }}</span>
            <button type="button" class="pick-close" aria-label="关闭" @click="close"><PhX :size="15" /></button>
          </div>
          <div ref="results" id="reference-results" class="pick-list" role="listbox" aria-label="文档" @scroll="loadMore">
            <button v-for="(d,i) in list.slice(0,limit)" :key="d.file" :id="'reference-option-' + i"
              type="button" role="option" tabindex="-1" class="pick-row" :class="{ 'is-active': i === active }"
              :aria-selected="i === active" @pointermove="active = i" @mousedown.prevent @click="choose(d)">
              <PhFilePdf v-if="d.type === 'pdf'" :size="16" class="pick-icon" aria-hidden="true" />
              <PhFileHtml v-else-if="d.type === 'h5'" :size="16" class="pick-icon" aria-hidden="true" />
              <PhFileText v-else :size="16" class="pick-icon" aria-hidden="true" />
              <span class="pick-details">
                <span class="pick-name" :title="d.name">{{ d.name }}</span>
                <span v-if="folderOf(d.file)" class="pick-path" :title="folderOf(d.file)"><bdi dir="auto">{{ folderOf(d.file) }}</bdi></span>
              </span>
            </button>
          </div>
          <p v-if="!list.length" class="pick-empty" role="status">{{ kw.trim() ? '没有匹配的文档' : '知识库里还没有其他文档' }}</p>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/* 斜杠菜单里"插入文档"用的选择器：搜名字或路径都行，键盘可用 */
import { computed, nextTick, ref, watch } from 'vue'
import { PhMagnifyingGlass, PhFileText, PhFilePdf, PhFileHtml, PhX } from '../icons/remix'
import { useDialogFocus } from '../composables/useDialogFocus'
import { useDocsStore } from '../stores/docs'

const emit = defineEmits(['close', 'pick'])
const store = useDocsStore()
const kw = ref('')
const active = ref(0)
const dialog = ref(null)
const results = ref(null)
const limit = ref(60)
const visible = ref(true)
let pendingPick = null

/* 先放完退场，再通知父组件卸载，否则 v-if 会把它一帧拿掉，看不到收起。 */
function close() { visible.value = false }
function afterLeave() {
  if (pendingPick) emit('pick', pendingPick)
  else emit('close')
}

useDialogFocus(visible, dialog, close, () => document.querySelector('.editor-shell .ProseMirror[contenteditable="true"]'))

const list = computed(() => {
  const k = kw.value.trim().toLowerCase()
  const all = (store.allFiles || []).filter((d) => d.file !== store.currentPath)
  const hit = k ? all.filter((d) => d.name.toLowerCase().includes(k) || d.file.toLowerCase().includes(k)) : all
  return hit
})

watch(list, () => {
  active.value = 0
  limit.value = 60
  if (results.value) results.value.scrollTop = 0
})

function loadMore() {
  const el = results.value
  if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 60)
    limit.value = Math.min(list.value.length, limit.value + 60)
}

function onKey(event) {
  if (event.isComposing || event.keyCode === 229) return
  if (!['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) return
  event.preventDefault()
  if (event.key === 'Enter') return choose(list.value[active.value])
  const step = event.key === 'ArrowDown' ? 1 : -1
  if (!list.value.length) return
  active.value = (active.value + step + list.value.length) % list.value.length
  limit.value = Math.max(limit.value, active.value + 1)
  nextTick(() => document.getElementById('reference-option-' + active.value)?.scrollIntoView({ block: 'nearest' }))
}

function choose(doc) {
  if (!doc) return
  pendingPick = doc
  visible.value = false
}

function folderOf(file) {
  const parts = String(file).split('/')
  return parts.slice(1, -1).join(' / ')
}
</script>

<style scoped>
.pick-mask { position:fixed; inset:0; z-index:var(--layer-modal-backdrop); display:flex; align-items:flex-start; justify-content:center; padding:clamp(12px,14dvh,110px) 12px 12px; background:var(--c-overlay); }
.pick { width:min(400px,100%); max-height:min(450px,100%); display:flex; flex-direction:column; background:var(--c-pop); overflow:hidden; }
.pick-head { display:flex; align-items:center; gap:8px; padding:5px 8px 5px 14px; flex:none; }
.pick-glass,.pick-icon,.pick-count { flex:none; color:var(--c-sub); }
.pick-input { flex:1; min-width:0; height:36px; font-size:13px; color:var(--c-ink); outline:none; }
.pick-input::-webkit-search-cancel-button { display:none; }
.pick-count { font-size:11px; font-variant-numeric:tabular-nums; }
.pick-close { display:grid; place-items:center; width:32px; height:32px; border-radius:var(--radius-row); color:var(--c-sub); }
.pick-close:hover,.pick-row.is-active { background:var(--c-hover); }
.pick-close:focus-visible { outline:2px solid var(--c-focus); outline-offset:-2px; }
.pick-list { min-height:0; overflow:auto; overscroll-behavior:contain; scroll-padding:4px; padding:0 5px 5px; }
.pick-row { display:grid; grid-template-columns:16px minmax(0,1fr); align-items:center; gap:10px; width:100%; min-height:36px; padding:7px 10px; border-radius:var(--radius-row); text-align:start; }
.pick-details { min-width:0; display:grid; gap:2px; }
.pick-name { color:var(--c-ink); font-size:13px; line-height:1.4; }
.pick-path { direction:rtl; text-align:left; color:var(--c-sub); font-size:11px; line-height:1.4; }
.pick-name,.pick-path { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pick-empty { margin:0; padding:16px; text-align:center; font-size:12px; color:var(--c-sub); }
@media (pointer:coarse) { .pick-row,.pick-close { min-height:44px; } .pick-close { width:44px; } }
</style>
