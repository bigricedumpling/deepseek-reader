<template>
  <main class="preview-shell">
    <header v-if="ready" class="preview-header">
      <button ref="collectButton" class="collect-button" type="button" :disabled="phase === 'done'" @click="openPicker">{{ phase === 'done' ? '已保存到知识库' : '保存到知识库' }}</button>
    </header>
    <div v-if="!ready" class="preview-state">
      <template v-if="!embedded">这个页面需要在 DSH 的工作区 Markdown 预览中打开。</template>
      <template v-else-if="receiveTimedOut">没有收到工作区文件。请回到 DSH 重新打开这篇 Markdown。</template>
      <template v-else>正在读取工作区文件…</template>
    </div>
    <div v-else class="preview-reader" :style="reader.readingStyle" @click="onArticleClick">
      <MarkdownEditor :key="readerVersion" :value="readerRaw" :readonly="true" :doc-id="filePath" :workspace-name="workspaceReference" />
    </div>
    <Transition name="overlay"><div v-if="picker" class="picker-mask" @click.self="closePicker">
      <section ref="pickerDialog" class="picker" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="preview-save-title">
        <header class="picker-heading">
          <h2 id="preview-save-title">保存到知识库</h2>
          <button type="button" class="picker-close" aria-label="关闭" :disabled="locked" @click="closePicker"><PhX :size="17" /></button>
        </header>
        <p v-if="listState === 'loading'" class="picker-state" role="status">正在读取知识库…</p>
        <template v-if="listState === 'ready'">
          <template v-if="libraries.length">
            <label v-if="libraries.length > 1" class="picker-search">
              <PhMagnifyingGlass :size="15" aria-hidden="true" />
              <input v-model.trim="libQuery" type="search" aria-label="搜索知识库" placeholder="搜索知识库" :disabled="busy" />
            </label>
            <div class="picker-results" :style="{ '--destination-rows': Math.min(libraries.length, 6) }">
              <LibraryDestinationList v-if="filteredLibraries.length" v-model="destination" :libraries="filteredLibraries" :disabled="busy" />
              <p v-else class="picker-state" role="status">没有匹配的知识库</p>
            </div>
            <label class="picker-field">文档名称<input v-model="newName" :disabled="busy" maxlength="160" /></label>
          </template>
          <form v-else class="empty-library-create" @submit.prevent="createLibrary">
            <label class="picker-field">知识库名称<input v-model="newLibraryName" :disabled="creatingLibrary" /></label>
            <button class="picker-submit" :disabled="busy || !newLibraryName.trim()">新建知识库</button>
          </form>
        </template>
        <p v-if="pickerError" class="picker-error" role="alert">{{ pickerError }}</p>
        <footer v-if="listState !== 'loading'" class="picker-actions">
          <button type="button" :disabled="locked" @click="closePicker">取消</button>
          <button v-if="listState === 'error'" type="button" @click="loadLibraries()">重试</button>
          <button v-if="listState === 'ready' && libraries.length" type="button" class="picker-submit" :disabled="!canSave" @click="collect">{{ phase === 'reading' ? '正在读取…' : phase === 'writing' ? '正在保存…' : '保存' }}</button>
        </footer>
      </section>
    </div></Transition>
  </main>
</template>

<script setup>
import { scrollBehavior } from '../utils/scroll-target.js'
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { workspaceImages, rewriteWorkspaceImages } from '../../server/services/workspace-images.js'
import { useDialogFocus } from '../composables/useDialogFocus.js'
import { API_BASE } from '../utils/api'
import { useReaderStore } from '../stores/reader'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import LibraryDestinationList from '../components/LibraryDestinationList.vue'
import { PhMagnifyingGlass, PhX } from '../icons/remix'

const reader = useReaderStore()
const embedded = window.parent !== window
const title = ref('')
const filePath = ref('')
const sourcePath = ref('')
const workspaceReference = computed(() => {
  const path = filePath.value.replaceAll('\\', '/').split(/[?#]/, 1)[0]
  if (/^(?:[a-z][a-z\d+.-]*:|[/~])/i.test(path) || path.split('/').includes('..')) {
    return title.value.split(/[?#]/, 1)[0].split(/[/\\]/).at(-1) || path.split('/').at(-1)
  }
  return path
})
const source = ref('')
const ready = ref(false)
const receiveTimedOut = ref(false)
let receiveTimer = null
const picker = ref(false)
const pickerError = ref('')
const pickerDialog = ref(null)
const collectButton = ref(null)
const creatingLibrary = ref(false)
const phase = ref('idle')
const busy = computed(() => creatingLibrary.value || phase.value !== 'idle')
const locked = computed(() => creatingLibrary.value || phase.value === 'writing')
let lastImport = null

function closePicker() {
  if (locked.value) return
  if (phase.value === 'reading') {
    requests.clear()
    pendingImages.value = 0
    fullReadId = ''
  }
  phase.value = 'idle'
  picker.value = false
  listRequest++
}
useDialogFocus(picker, pickerDialog, closePicker, () => collectButton.value)
const newName = ref('')
const destination = ref('')
const libraries = ref([])
const libQuery = ref('')
const listState = ref('idle')
let listRequest = 0
const newLibraryName = ref('')
const filteredLibraries = computed(() => libraries.value.filter(lib => lib.name.toLocaleLowerCase().includes(libQuery.value.toLocaleLowerCase())))
const canSave = computed(() => !busy.value && listState.value === 'ready' && newName.value.trim() &&
  filteredLibraries.value.some(lib => lib.name === destination.value))
async function createLibrary() {
  const name = newLibraryName.value.trim()
  if (busy.value || !name || listState.value !== 'ready') return
  const request = listRequest
  creatingLibrary.value = true
  pickerError.value = ''
  try {
    const response = await fetch(API_BASE + '/api/lib', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    })
    const result = await response.json()
    if (!result.ok) throw Error(result.error || '无法新建知识库')
    if (request === listRequest && picker.value) {
      destination.value = name
      newLibraryName.value = ''
      await loadLibraries()
    }
  } catch (error) {
    if (request === listRequest && picker.value) pickerError.value = error.message
  } finally { creatingLibrary.value = false }
}
const pendingImages = ref(0)
const imageData = new Map()
const imageVersion = ref(0)
const sourceVersion = ref(0)
const imageFailures = new Map()
const requests = new Map()
let contentComplete = false
let lastPreview = null
let fullReadId = ''
let parentOrigin = ''
let nextRequestId = 0
let resizeObserver

const imageSpans = computed(() => workspaceImages(source.value))
const references = computed(() => [...new Set(imageSpans.value.map(span => span.reference))])
const readerVersion = computed(() => filePath.value + ':' + sourceVersion.value + ':' + imageVersion.value)
const readerRaw = computed(() => {
  imageVersion.value
  return rewriteWorkspaceImages(source.value, imageSpans.value, reference => {
    const image = imageData.get(reference)
    return image && 'data:' + image.mime + ';base64,' + image.base64
  })
})

function notifyHeight() {
  window.parent.postMessage({ type: 'dsh-reader-preview:height', height: document.documentElement.scrollHeight }, parentOrigin || '*')
}
function onArticleClick(event) {
  const link = event.target.closest?.('a[href]')
  if (!link || !event.currentTarget.contains(link)) return
  const href = link.getAttribute('href') || ''
  if (!href || /^https?:\/\//i.test(href)) return
  if (href.startsWith('#')) {
    event.preventDefault()
    document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: scrollBehavior() })
    return
  }
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(href)) return
  event.preventDefault()
  window.parent.postMessage({ type: 'dsh-reader-preview:open-link', href }, parentOrigin || '*')
}
function scanImages() {
  for (const reference of references.value) {
    if (imageData.has(reference)) continue
    if (imageFailures.has(reference) || [...requests.values()].includes(reference)) continue
    const requestId = String(++nextRequestId)
    requests.set(requestId, reference)
    pendingImages.value++
    window.parent.postMessage({ type: 'dsh-reader-preview:asset-request', requestId, reference }, parentOrigin || '*')
  }
  notifyHeight()
}
watch(references, async () => { await nextTick(); scanImages() }, { flush: 'post' })

function requestFullContent() {
  if (fullReadId) return
  fullReadId = String(++nextRequestId)
  window.parent.postMessage({ type: 'dsh-reader-preview:full-request', requestId: fullReadId }, parentOrigin)
}

function onMessage(event) {
  const localParent = /^(?:https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?|dsh-app:\/\/app)$/.test(event.origin)
  const remoteReader = !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  if (event.source !== window.parent || (!localParent && !(remoteReader && /^https:\/\//.test(event.origin)))) return
  const data = event.data || {}
  if (data.type === 'dsh-reader-preview:update') {
    parentOrigin = event.origin
    clearTimeout(receiveTimer)
    receiveTimedOut.value = false
    const path = String(data.filePath || '').slice(0, 2000)
    const changed = filePath.value && filePath.value !== path
    if (changed) {
      listRequest++
      picker.value = false
      phase.value = 'idle'
      lastImport = null
      newName.value = ''
    }
    title.value = String(data.title || '').slice(0, 200)
    filePath.value = path
    sourcePath.value = String(data.sourcePath || '').slice(0, 2000)
    if (!newName.value) newName.value = title.value.replace(/\.(md|markdown)$/i, '')
    ready.value = true

    const text = String(data.text || '')
    const eof = data.eof === true
    if (!changed && lastPreview?.text === text && lastPreview.eof === eof && lastPreview.version === data.version) return
    lastPreview = { text, eof, version: data.version }
    fullReadId = ''
    imageData.clear()
    imageFailures.clear()
    requests.clear()
    pendingImages.value = 0
    source.value = text
    sourceVersion.value++
    contentComplete = eof
    if (!contentComplete && (!busy.value || phase.value === 'reading')) requestFullContent()
    if (contentComplete || phase.value === 'reading') {
      nextTick(() => { scanImages(); commitWhenReady() })
    }
  } else if (data.type === 'dsh-reader-preview:asset-response') {
    const reference = requests.get(String(data.requestId || ''))
    if (!reference) return
    requests.delete(String(data.requestId))
    pendingImages.value = Math.max(0, pendingImages.value - 1)
    if (data.error) imageFailures.set(reference, String(data.error))
    else if (data.mime && data.base64) imageData.set(reference, { mime: data.mime, base64: data.base64 })
    scanImages()
    if (pendingImages.value === 0 && imageData.size > 0) imageVersion.value++
    commitWhenReady()
  } else if (data.type === 'dsh-reader-preview:full-content') {
    if (!fullReadId || (data.requestId && data.requestId !== fullReadId)) return
    fullReadId = ''
    if (data.error) {
      if (phase.value === 'reading') { pickerError.value = String(data.error); phase.value = 'idle' }
      return
    }
    source.value = String(data.text || '')
    sourceVersion.value++
    contentComplete = true
    nextTick(() => {
      scanImages()
      commitWhenReady()
    })
  }
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  window.addEventListener('resize', notifyHeight)
  resizeObserver = new ResizeObserver(notifyHeight)
  resizeObserver.observe(document.body)
  window.parent.postMessage({ type: 'dsh-reader-preview:ready' }, '*')
  if (embedded) {
    receiveTimer = setTimeout(() => {
      if (!ready.value) receiveTimedOut.value = true
    }, 8000)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  window.removeEventListener('resize', notifyHeight)
  clearTimeout(receiveTimer)
  resizeObserver?.disconnect()
})

function openPicker() {
  if (picker.value || phase.value !== 'idle') return
  libQuery.value = ''
  newLibraryName.value = ''
  picker.value = true
  loadLibraries()
}
async function loadLibraries() {
  const request = ++listRequest
  pickerError.value = ''
  listState.value = 'loading'
  try {
    const [me, result] = await Promise.all([
      fetch(API_BASE + '/api/me', { credentials: 'same-origin' }).then(r => r.json()),
      fetch(API_BASE + '/api/libs', { credentials: 'same-origin' }).then(r => r.json())
    ])
    if (!me.ok) throw Error(me.error || '无法读取当前身份')
    if (me.data?.role !== 'owner') throw Error('当前连接为只读，请使用本机知识库。')
    if (!result.ok) throw Error(result.error || '无法读取知识库')
    if (request !== listRequest) return
    libraries.value = result.data.libs
    if (!libraries.value.some(lib => lib.name === destination.value)) destination.value = libraries.value[0]?.name || ''
    listState.value = 'ready'
  } catch (error) {
    if (request !== listRequest) return
    pickerError.value = error.message
    listState.value = 'error'
  }
}
function collect() {
  if (!canSave.value) return
  phase.value = 'reading'
  pickerError.value = ''
  imageFailures.clear()
  if (contentComplete) {
    scanImages()
    commitWhenReady()
  } else requestFullContent()
}
async function commitWhenReady() {
  if (phase.value !== 'reading' || !contentComplete || pendingImages.value) return
  const missing = references.value.find(ref => !imageData.has(ref))
  if (missing) {
    pickerError.value = '图片无法保存：' + missing + (imageFailures.has(missing) ? '（' + imageFailures.get(missing) + '）' : '')
    phase.value = 'idle'
    return
  }
  phase.value = 'writing'
  const reference = filePath.value
  try {
    const body = JSON.stringify({ dir: destination.value, name: newName.value.trim(), content: source.value, reference,
      workspace: reference.slice(0, reference.lastIndexOf('/')),
      assets: references.value.map(reference => ({ reference, ...imageData.get(reference) })) })
    if (lastImport?.body !== body) lastImport = { body, key: crypto.getRandomValues(new Uint32Array(4)).join('-') }
    const response = await fetch(API_BASE + '/api/import-workspace-doc', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': lastImport.key }, body,
      signal: AbortSignal.timeout(30000)
    })
    const json = await response.json()
    if (!json.ok || !json.data?.file) throw Error(json.error || '文档保存失败')
    if (filePath.value !== reference) return
    phase.value = 'done'
    picker.value = false
    lastImport = null
    window.parent.postMessage({ type: 'dsh-reader-preview:collected', file: json.data.file, id: json.data.id }, parentOrigin)
  } catch (error) {
    if (filePath.value !== reference) return
    pickerError.value = error.message
    phase.value = 'idle'
  }
}
</script>

<style>
:root { font-family: var(--font-sans); color: var(--c-text); background: var(--c-surface); font-synthesis: none; }
* { box-sizing: border-box; }
body { margin: 0; }
.preview-shell { min-height: 100vh; background: var(--c-surface); }
.preview-header { display: flex; align-items: center; justify-content: flex-end; min-height: 44px; padding: 8px clamp(18px,5vw,44px); background: var(--c-surface); }
.collect-button,.picker-actions button { border: 0; border-radius: var(--radius-control); corner-shape: superellipse(2); background: var(--c-field); color: var(--c-text); padding: 8px 12px; font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.collect-button:hover,.picker-actions button:hover { background: var(--c-hover); }
.preview-state { padding: 30px; color: var(--c-faint); font-size: 13px; }
.preview-reader { min-height: calc(100vh - 44px); padding: 8px 0 80px; }
.picker-mask {
  --picker-top: max(16px, calc((100dvh - min(270px, 35dvh) - 260px) / 2));
  position: fixed; inset: 0; z-index: var(--layer-modal-backdrop); display: grid; place-items: start center;
  padding: var(--picker-top) 16px 16px; background: var(--c-overlay);
}
.picker {
  width: min(440px, 100%); max-height: calc(100dvh - var(--picker-top) - 16px); overflow: auto;
  padding: 20px; border: 1px solid var(--c-line); border-radius: var(--radius-dialog);
  background: var(--c-pop); box-shadow: var(--c-pop-shadow); color: var(--c-text);
}
/* Keep the query, name and submit targets in place as the visible results change. */
.picker-results { block-size: min(calc(46px * var(--destination-rows) - 2px), 270px, 35dvh); overflow: auto; }
.picker-results .destination-list { max-height: none; }
.picker-heading, .picker-actions, .empty-library-create { display: flex; align-items: center; gap: 8px; }
.picker-heading { justify-content: space-between; margin-bottom: 14px; }
.picker-heading h2 { margin: 0; font-size: 17px; line-height: 1.4; font-weight: 600; }
.picker-close { display: grid; place-items: center; width: 32px; height: 32px; border-radius: var(--radius-control); color: var(--c-sub); }
.picker-close:hover { background: var(--c-hover); color: var(--c-ink); }
.picker-search, .picker-field input { border: 0; border-radius: var(--radius-control); background: var(--c-field); color: var(--c-text); }
.picker-search { display: flex; align-items: center; gap: 7px; padding: 0 10px; margin: 0 0 8px; color: var(--c-sub); }
.picker input { min-width: 0; width: 100%; min-height: 36px; font: inherit; font-size: 13px; }
.picker-search input { flex: 1; border: 0; background: transparent; color: var(--c-text); outline: 0; }
.picker-search:focus-within, .picker-field input:focus-visible { outline: 2px solid var(--c-focus); outline-offset: 1px; }
.picker-field { display: grid; gap: 6px; margin-top: 14px; color: var(--c-sub); font-size: 12px; }
.picker-field input { padding: 7px 10px; }
.empty-library-create { align-items: flex-end; }
.empty-library-create label { flex: 1; margin: 0; min-width: 0; }
.picker-state, .picker-error { margin: 12px 0; font-size: 13px; line-height: 1.5; color: var(--c-sub); }
.picker-error { color: var(--c-danger, #b44b43); }
.picker-actions { justify-content: flex-end; margin-top: 18px; }
.picker-actions button, .empty-library-create button { min-height: 34px; padding: 6px 12px; background: transparent; border-radius: var(--radius-control); font-size: 13px; }
.picker-actions button:hover, .empty-library-create button:hover { background: var(--c-hover); }
.picker .picker-submit { color: var(--c-on-accent); background: var(--c-accent); }
.picker .picker-submit:hover { background: var(--c-accent); filter: brightness(.93); }
.picker button:disabled { opacity: .5; cursor: default; }
@media (pointer: coarse) {
  .collect-button, .picker-close, .picker-actions button, .empty-library-create button { min-width: 44px; min-height: 44px; }
}
</style>
