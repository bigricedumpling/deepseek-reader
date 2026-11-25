<template>
  <Teleport to="body"><Transition name="overlay">
    <div v-if="open" class="reader-modal-shade" @mousedown.self="close">
      <section ref="dialog" tabindex="-1" class="reader-dialog recovery-panel" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
        <header>
          <h2 id="recovery-title">{{ tab === 'trash' ? '回收站' : '备份与恢复' }}</h2>
          <button ref="closeButton" class="btn-icon" aria-label="关闭" :disabled="busy" @click="close"><PhX :size="18" /></button>
        </header>
        <p v-if="error" role="alert" class="reader-error">{{ error }}</p>
        <p v-if="message" role="status" class="recovery-message">{{ message }}</p>
        <label v-if="tab === 'trash' && !legacyChoice && (items.length || legacyItems.length)" class="recovery-search-wrap">
          <PhMagnifyingGlass :size="15" aria-hidden="true" />
          <input ref="searchInput" v-model="query" type="search" placeholder="搜索已删除的内容" aria-label="搜索已删除的内容" />
        </label>
        <div v-if="tab === 'backup' && !loading && !loadFailed" class="backup-actions">
          <span>{{ backupLibraries.length }} 个知识库</span>
          <button ref="backupButton" class="reader-button" :disabled="busy" @click="backup('create')">创建备份</button>
        </div>
        <div class="recovery-content">
          <p v-if="loading" class="empty" role="status">正在读取…</p>
          <button v-else-if="loadFailed" class="reader-button" @click="load">重试</button>
          <template v-else-if="tab === 'trash'">
            <form v-if="legacyChoice" class="legacy-target" @submit.prevent="restoreLegacy">
              <h3>恢复 {{ legacyChoice.name }}</h3>
              <label>知识库<select ref="legacySelect" v-model="legacyLibrary" :disabled="busy"><option value="" disabled>选择知识库</option><option v-for="lib in libraries" :key="lib.name" :value="lib.name">{{ lib.name }}</option></select></label>
              <label>名称<input v-model="legacyName" :disabled="busy" /></label>
              <div class="legacy-actions"><button type="button" :disabled="busy" @click="cancelLegacy">取消</button><button class="reader-button" :disabled="busy || !legacyLibrary || !legacyName.trim()">恢复到这里</button></div>
            </form>
            <template v-else>
              <p v-if="!items.length && !legacyItems.length" class="empty">回收站是空的</p>
              <p v-else-if="!filteredItems.length && !filteredLegacy.length" class="empty" role="status">没有匹配的内容</p>
              <ul v-if="filteredItems.length" class="recovery-list">
                <li v-for="item in filteredItems" :key="item.id">
                  <component :is="item.kind === 'folder' ? PhFolder : PhFileText" :size="17" aria-hidden="true" />
                  <div><b>{{ item.original.split('/').pop() }}</b><small v-if="item.original.includes('/')">{{ item.original.slice(0, item.original.lastIndexOf('/')) }}</small><time>{{ date(item.at) }}</time></div>
                  <button :disabled="busy" @click="restoreItem(item.id)">恢复</button>
                </li>
              </ul>
              <template v-if="filteredLegacy.length">
                <h3>待选择恢复位置</h3>
                <ul class="recovery-list"><li v-for="item in filteredLegacy" :key="item.id">
                  <PhFileText :size="17" aria-hidden="true" /><div><b>{{ item.name }}</b></div>
                  <button :data-legacy="item.id" :disabled="busy" @click="chooseLegacy(item)">选择位置</button>
                </li></ul>
              </template>
            </template>
          </template>
          <template v-else>
            <p v-if="!backupItems.length" class="empty">还没有完整备份</p>
            <ul v-else class="recovery-list"><li v-for="item in backupItems" :key="item.id">
              <PhArchive :size="17" aria-hidden="true" />
              <div><b>{{ date(item.at) }}</b><small>{{ item.libraries ? item.libraries.length + ' 个知识库' : '全部知识库（旧备份）' }}</small><small v-if="item.libraries?.length">{{ item.libraries.join('、') }}</small></div>
              <button :disabled="busy" @click="backup('restore', item.id)">恢复副本</button>
            </li></ul>
            <template v-if="restoredItems.length">
              <h3>已恢复的副本</h3>
              <ul class="recovery-list"><li v-for="item in restoredItems" :key="item.id">
                <PhFolder :size="17" aria-hidden="true" /><div><b>{{ date(item.at) }}</b></div>
                <a v-if="restoredUrls[item.id]" :href="restoredUrls[item.id]">打开副本</a><button v-else :disabled="busy" @click="openRestored(item.id)">打开副本</button>
              </li></ul>
            </template>
          </template>
        </div>
        <footer v-if="tab === 'backup'"><button :disabled="busy" @click="backup('reveal')">{{ fileManagerLabel() }}</button></footer>
      </section>
    </div>
  </Transition></Teleport>
</template>
<script setup>
import { ref, watch, computed, nextTick } from 'vue'
import { PhX, PhFolder, PhFileText, PhArchive, PhMagnifyingGlass } from '../icons/remix'
import { readerRequest } from '../contracts/reader'
import { useDialogFocus } from '../composables/useDialogFocus'
import { fileManagerLabel } from '../utils/reveal'
const props = defineProps({ open: Boolean, initialTab: { type: String, default: 'trash' } })
const emit = defineEmits(['close', 'restored'])
const backupButton = ref(null)
const dialog = ref(null), closeButton = ref(null), searchInput = ref(null), legacySelect = ref(null)
const tab = ref('trash'), items = ref([]), legacyItems = ref([]), legacyChoice = ref(null)
const legacyLibrary = ref(''), legacyName = ref(''), libraries = ref([])
const backupItems = ref([]), restoredItems = ref([]), backupLibraries = ref([]), restoredUrls = ref({})
const query = ref(''), loading = ref(false), loadFailed = ref(false), busy = ref(false), error = ref(''), message = ref('')
const matches = value => value.toLowerCase().includes(query.value.trim().toLowerCase())
const filteredItems = computed(() => items.value.filter(item => matches(item.original)))
const filteredLegacy = computed(() => legacyItems.value.filter(item => matches(item.name)))
const date = value => new Date(value).toLocaleString()
const post = (route,body) => readerRequest(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
let generation = 0
function close() { if (!busy.value) emit('close') }
useDialogFocus(() => props.open, dialog, () => {
  if (legacyChoice.value && !busy.value) cancelLegacy()
  else close()
})
async function refresh() {
  const current = generation
  if (tab.value === 'backup') {
    const result = await readerRequest('/backups')
    if (current !== generation) return
    backupLibraries.value = result.libraries || []; backupItems.value = result.items; restoredItems.value = result.restored || []
  } else {
    const result = await readerRequest('/trash')
    if (current !== generation) return
    items.value = result.items; legacyItems.value = result.legacyItems || []
  }
}
async function load() {
  const current = generation
  loading.value = true; loadFailed.value = false; error.value = ''
  try { await refresh() }
  catch (e) { if (current === generation) { error.value = e.message; loadFailed.value = true } }
  finally { if (current === generation) loading.value = false }
}
watch(() => [props.open, props.initialTab], ([visible, initialTab]) => {
  ++generation
  if (!visible) return
  tab.value = initialTab; query.value = ''; legacyChoice.value = null; items.value = []; legacyItems.value = []; message.value = ''
  load()
}, { immediate: true })
async function chooseLegacy(item) {
  const current = generation
  busy.value = true; error.value = ''
  try {
    const result = await readerRequest('/libs')
    if (current !== generation) return
    libraries.value = result.libs; legacyName.value = item.name; legacyLibrary.value = ''; legacyChoice.value = item
  } catch (e) { error.value = e.message }
  finally { busy.value = false }
  await nextTick(); legacySelect.value?.focus()
}
async function cancelLegacy() {
  const id = legacyChoice.value?.id
  legacyChoice.value = null
  await nextTick()
  const trigger = Array.from(dialog.value?.querySelectorAll('[data-legacy]') || []).find(el => el.dataset.legacy === id)
  trigger?.focus()
}
async function restore(payload, confirmation) {
  if (busy.value) return
  busy.value = true; error.value = ''; message.value = ''
  let restored = false
  try {
    const result = await post('/trash/restore', { ...payload, requestId:crypto.randomUUID() })
    restored = true; legacyChoice.value = null; emit('restored')
    message.value = confirmation || '已恢复到 ' + result.path
    await refresh()
  } catch (e) { error.value = e.message; if (restored) loadFailed.value = true }
  finally { busy.value = false }
  if (restored) { await nextTick(); (searchInput.value || closeButton.value)?.focus() }
}
const restoreLegacy = () => restore({ legacyId:legacyChoice.value.id, destination:legacyLibrary.value + '/' + legacyName.value.trim() }, '已恢复到所选知识库')
const restoreItem = id => restore({ trashId:id })
async function openRestored(id, launch = true) {
  busy.value = true; error.value = ''
  try {
    const data = await post('/backups',{action:'open',restoredId:id})
    restoredUrls.value[id] = data.url
    if (launch) window.location.assign(data.url)
  } catch (e) { error.value = e.message }
  finally { busy.value = false }
}
async function backup(action,id) {
  const trigger = document.activeElement
  busy.value = true; error.value = ''; message.value = ''
  try {
    const result = await post('/backups',{action,backupId:id})
    if (action === 'reveal') return
    await refresh()
    if (action === 'restore') await openRestored(result.restoredId, false)
    message.value = action === 'create' ? '备份已创建' : '副本已恢复'
  } catch (e) { error.value = e.message }
  finally {
    busy.value = false
    await nextTick()
    if (document.activeElement === document.body) {
      const target = trigger !== document.body && trigger?.isConnected ? trigger : backupButton.value || closeButton.value
      target?.focus()
    }
  }
}
</script>
<style scoped>
.recovery-panel { width:min(420px,100%); max-height:min(82dvh,620px); display:flex; flex-direction:column; overflow:auto; gap:10px; padding:16px; }
.recovery-panel > :not(.recovery-content) { flex:none; }
.recovery-panel header,.backup-actions,.legacy-actions { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.recovery-panel header,.recovery-panel p,.recovery-panel label { margin:0; }
.recovery-panel .recovery-message,.recovery-panel .reader-error { font-size:12px; overflow-wrap:anywhere; }
.recovery-panel .empty { padding:18px 10px; color:var(--c-sub); text-align:center; }
.recovery-panel .recovery-search-wrap { display:flex; align-items:center; gap:7px; min-height:34px; padding:0 9px; border-radius:8px; color:var(--c-sub); background:var(--c-field); }
.recovery-panel .recovery-search-wrap:focus-within { outline:2px solid var(--c-focus); outline-offset:1px; }
.recovery-panel .recovery-search-wrap input { flex:1; min-width:0; margin:0!important; padding:3px 0!important; border:0!important; outline:0; background:transparent!important; color:var(--c-ink); font-size:13px; }
.recovery-content { min-height:0; overflow:auto; overscroll-behavior:contain; }
.recovery-content h3 { margin:12px 0 4px; color:var(--c-sub); font-size:12px; font-weight:500; overflow-wrap:anywhere; }
.recovery-list { margin:0; padding:0; list-style:none; }
.recovery-list li { display:grid; grid-template-columns:18px minmax(0,1fr) auto; align-items:center; gap:9px; padding:8px 0; }
.recovery-list li > svg { color:var(--c-sub); }
.recovery-list b,.recovery-list small,.recovery-list time { display:block; overflow-wrap:anywhere; }
.recovery-list b { font-size:13px; line-height:1.5; font-weight:500; }
.recovery-list small,.recovery-list time { color:var(--c-sub); font-size:11px; line-height:1.5; }
.recovery-list button,.recovery-list a,.recovery-panel footer button,.legacy-actions button { display:inline-flex; align-items:center; justify-content:center; min-height:32px; padding:4px 7px; border-radius:var(--radius-row); color:var(--c-ink); font-size:12px; }
.backup-actions { font-size:12px; color:var(--c-sub); }
.recovery-panel footer,.legacy-actions { justify-content:flex-end; margin:0; }
.legacy-target { display:grid; gap:12px; }
.legacy-target h3 { margin:0; color:var(--c-ink); }
.legacy-target label { min-width:0; font-size:12px; }
.legacy-target select { text-overflow:ellipsis; }
.recovery-panel button:focus-visible,.recovery-panel a:focus-visible { outline:2px solid var(--c-focus); outline-offset:-2px; }
@media (hover:hover) { .recovery-list :is(button,a):hover,.recovery-panel footer button:hover { background:var(--c-hover); } }
@media (pointer:coarse) { .recovery-list button,.recovery-list a,.recovery-panel footer button,.backup-actions button,.legacy-actions button,.recovery-panel .recovery-search-wrap { min-height:44px; } }
@media (max-height:390px) { .recovery-panel { max-height:calc(100dvh - 24px); } }
</style>
