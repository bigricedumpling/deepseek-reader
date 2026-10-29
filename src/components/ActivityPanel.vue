<template>
  <Teleport to="body">
    <Transition name="overlay">
      <div v-if="open" class="reader-modal-shade" @mousedown.self="close">
        <section ref="dialog" tabindex="-1" class="reader-dialog activity-panel" role="dialog" aria-modal="true" aria-label="Agent 改动">
          <header class="activity-head">
            <div class="activity-title">
              <h2>Agent 改动</h2>
              <span class="activity-sub">{{ unread ? `${unread} 条未读` : '都看过了' }}</span>
            </div>
            <div class="activity-head-actions">
              <button v-if="unread" class="activity-text-btn" :disabled="busy" @click="markAll">全部已读</button>
              <button class="activity-text-btn" :disabled="busy" @click="toggleAll">{{ showAll ? '只看 Agent' : '包含我的改动' }}</button>
              <button ref="closeButton" class="btn-icon" title="关闭" aria-label="关闭" @click="close"><PhX :size="18" /></button>
            </div>
          </header>

          <p v-if="error" class="reader-error activity-error" role="alert">{{ error }}</p>

          <div class="activity-body">
            <nav class="activity-list" aria-label="改动列表">
              <p v-if="loading && !items.length" class="activity-empty">正在读取…</p>
              <p v-else-if="!items.length" class="activity-empty">Agent 还没有改动过文档</p>
              <button
                v-for="item in items"
                :key="item.id"
                class="activity-item"
                :class="{ 'is-active': selected?.id === item.id, 'is-read': item.reviewed }"
                @click="choose(item)"
              >
                <span class="activity-line">
                  <b>{{ item.actor }}</b>
                  <span>{{ item.actionLabel }}</span>
                  <time>{{ time(item.at) }}</time>
                </span>
                <span class="activity-name">{{ item.name || item.path || '改动' }}</span>
                <span v-if="item.path && item.name !== item.path" class="activity-path">{{ item.path }}</span>
              </button>
              <button v-if="items.length < total" class="activity-more" :disabled="loading" @click="load(true)">
                {{ loading ? '正在读取…' : '加载更早的改动' }}
              </button>
            </nav>

            <section class="activity-detail">
              <template v-if="selected">
                <div class="activity-detail-head">
                  <div>
                    <h3>{{ selected.name || selected.path || '改动' }}</h3>
                    <p>{{ selected.actor }} · {{ selected.actionLabel }} · {{ time(selected.at) }}</p>
                  </div>
                  <div class="activity-detail-actions">
                    <button v-if="selected.path && selected.available && selected.action !== 'DELETE /doc'" class="activity-text-btn" @click="openDoc">打开文档</button>
                    <button v-if="!selected.reviewed" class="activity-text-btn" :disabled="busy" @click="markRead(selected)">标记已读</button>
                  </div>
                </div>
                <p v-if="!selected.available && selected.action !== 'DELETE /doc'" class="activity-note">这篇文档现在不在知识库里，可能是之后被删除或移动了。</p>
                <p v-else-if="selected.currentPath && selected.currentPath !== selected.path" class="activity-note">现在位置：{{ selected.currentPath }}</p>
                <p v-if="diffError" class="reader-error" role="alert">{{ diffError }}</p>
                <p v-else-if="diffLoading" class="activity-empty">正在读取差异…</p>
                <template v-else-if="diff">
                  <p v-if="diff.kind === 'delete'" class="activity-note">这篇文档已被删除，可以在回收站找回。</p>
                  <p v-else-if="diff.kind === 'rename'" class="activity-note">重命名或移动，正文没有变化。</p>
                  <p v-else-if="diff.kind === 'meta'" class="activity-note">页面设置发生变化，正文没有变化。</p>
                  <template v-else-if="diff.kind === 'create'">
                    <p class="activity-note">新建文档，下面是初始内容。</p>
                    <pre class="activity-created">{{ diff.after }}</pre>
                  </template>
                  <TextComparison v-else :before="diff.before" :after="diff.after" />
                </template>
              </template>
              <p v-else class="activity-empty">选一条改动查看差异</p>
            </section>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { PhX } from '../icons/remix'
import TextComparison from './TextComparison.vue'
import { useDialogFocus } from '../composables/useDialogFocus'
import { getActivity, getActivityDiff, reviewActivity } from '../services/activity'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close', 'select'])
const dialog = ref(null), closeButton = ref(null)
const items = ref([]), total = ref(0), unread = ref(0), loading = ref(false), busy = ref(false)
const error = ref(''), showAll = ref(false)
const selected = ref(null), diff = ref(null), diffLoading = ref(false), diffError = ref('')

function close() { if (!busy.value) emit('close') }
useDialogFocus(() => props.open, dialog, close)

function time(at) {
  const date = new Date(at)
  const now = new Date()
  const clock = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
  if (date.toDateString() === now.toDateString()) return clock
  return `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`
}

async function load(more = false) {
  loading.value = true
  error.value = ''
  try {
    const data = await getActivity({ limit: 50, offset: more ? items.value.length : 0, all: showAll.value })
    items.value = more ? [...items.value, ...data.items] : data.items
    total.value = data.total
    unread.value = data.unread
    if (selected.value) selected.value = items.value.find(item => item.id === selected.value.id) || null
    if (!selected.value && items.value.length) await choose(items.value[0])
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function choose(item) {
  selected.value = item
  diff.value = null
  diffError.value = ''
  if (!item.hasDiff) return
  diffLoading.value = true
  try {
    diff.value = await getActivityDiff(item.id)
  } catch (e) {
    diffError.value = e.message
  } finally {
    diffLoading.value = false
  }
}

async function markRead(item) {
  busy.value = true
  error.value = ''
  try {
    await reviewActivity({ id: item.id })
    item.reviewed = true
    unread.value = Math.max(0, unread.value - 1)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function markAll() {
  busy.value = true
  error.value = ''
  try {
    await reviewActivity({ all: true })
    for (const item of items.value) item.reviewed = true
    unread.value = 0
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function toggleAll() {
  showAll.value = !showAll.value
  selected.value = null
  items.value = []
  await load()
}

function openDoc() {
  const path = selected.value?.currentPath || selected.value?.path
  if (!path) return
  emit('select', path)
  emit('close')
}

watch(() => props.open, async visible => {
  if (!visible) return
  selected.value = null
  diff.value = null
  diffError.value = ''
  await load()
  await nextTick()
  closeButton.value?.focus()
}, { immediate: true })
</script>

<style scoped>
.activity-panel { width: min(760px, calc(100vw - 24px)); height: min(560px, calc(100dvh - 24px)); padding: 0; display: flex; flex-direction: column; overflow: hidden; }
.activity-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px 8px; border-bottom: 1px solid var(--c-line); }
.activity-title { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.activity-head h2 { margin: 0; font-size: 13px; font-weight: 500; }
.activity-sub { margin: 0; font-size: 11px; color: var(--c-faint); white-space: nowrap; }
.activity-head-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.activity-text-btn { border: 0; background: transparent; color: var(--c-sub); font-size: 11.5px; padding: 4px 6px; border-radius: 6px; }
.activity-text-btn:hover:not(:disabled) { background: var(--c-hover); color: var(--c-ink); }
.activity-text-btn:disabled { opacity: .45; cursor: default; }
.activity-error { margin: 8px 16px 0; }
.activity-body { display: grid; grid-template-columns: 230px minmax(0, 1fr); min-height: 0; flex: 1; }
.activity-list { overflow: auto; padding: 6px; border-right: 1px solid var(--c-line); min-height: 0; }
.activity-item { display: grid; gap: 2px; width: 100%; padding: 7px 9px; text-align: left; border: 0; border-radius: var(--radius-control); background: transparent; }
.activity-item:hover { background: var(--c-hover); }
.activity-item.is-active { background: var(--c-active); }
.activity-item.is-read { opacity: .62; }
.activity-line { display: flex; align-items: baseline; gap: 5px; font-size: 11px; line-height: 1.4; color: var(--c-sub); min-width: 0; }
.activity-line b { color: var(--c-ink); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px; }
.activity-line time { margin-left: auto; flex-shrink: 0; font-size: 10px; color: var(--c-faint); }
.activity-name { font-size: 12.5px; line-height: 1.4; color: var(--c-ink); overflow-wrap: anywhere; }
.activity-path { font-size: 10.5px; line-height: 1.35; color: var(--c-faint); overflow-wrap: anywhere; }
.activity-more { display: block; width: 100%; padding: 9px; border: 0; background: transparent; font-size: 12px; color: var(--c-sub); text-align: center; }
.activity-more:hover:not(:disabled) { color: var(--c-ink); }
.activity-empty { padding: 24px 16px; text-align: center; color: var(--c-faint); font-size: 12px; margin: 0; }
.activity-detail { min-width: 0; min-height: 0; overflow: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.activity-detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.activity-detail-head h3 { margin: 0; font-size: 13px; font-weight: 500; overflow-wrap: anywhere; }
.activity-detail-head p { margin: 4px 0 0; font-size: 11px; color: var(--c-sub); }
.activity-detail-actions { display: flex; gap: 8px; flex-shrink: 0; }
.activity-note { margin: 0; padding: 12px; border-radius: 8px; background: var(--c-field); color: var(--c-sub); font-size: 12px; line-height: 1.65; }
.activity-created { margin: 0; padding: 12px; border-radius: 8px; background: var(--c-field); color: var(--c-ink); white-space: pre-wrap; overflow-wrap: anywhere; font: 11.5px/1.65 monospace; }
.activity-detail :deep(.text-comparison) { flex: 1; min-height: 0; }
@media (max-width: 720px) {
  .activity-panel { height: calc(100dvh - 24px); }
  .activity-body { grid-template-columns: 1fr; grid-template-rows: minmax(120px, 34%) minmax(0, 1fr); }
  .activity-list { border-right: 0; border-bottom: 1px solid var(--c-line); }
  .activity-head { padding: 12px; }
  .activity-detail { padding: 12px; }
}
</style>
