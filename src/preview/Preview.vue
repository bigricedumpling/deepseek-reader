<template>
  <main class="preview-shell">
    <header class="preview-header">
      <div class="preview-identity"><span class="preview-kicker">工作区文件</span><span class="preview-filename" :title="filePath">{{ title || 'Markdown 预览' }}</span></div>
      <button v-if="ready" class="collect-button" type="button" @click="openPicker">收录副本到知识库</button>
    </header>
    <div v-if="!ready" class="preview-state">正在读取工作区文件…</div>
    <div v-else class="preview-reader" @click="onArticleClick">
      <MarkdownEditor :key="readerVersion" :value="readerRaw" :readonly="true" :doc-id="filePath" />
      <article class="preview-image-probe" aria-hidden="true" v-html="html" />
    </div>
    <div v-if="picker" class="picker-mask" @click.self="picker=false">
      <section class="picker" role="dialog" aria-modal="true" aria-label="收录副本到知识库" @keydown.esc="picker=false">
        <div class="picker-heading">收录副本到知识库<button type="button" aria-label="关闭" @click="picker=false">×</button></div>
        <div class="picker-tools"><input v-model.trim="libQuery" class="picker-search" type="search" placeholder="搜索知识库" aria-label="搜索知识库" autofocus /><SelectMenu v-model="libFilter" :options="[{value:'all',label:'全部'},{value:'private',label:'未公开'},{value:'public',label:'公开'}]" label="筛选知识库" /></div>
        <div class="picker-grid">
          <button v-for="lib in filteredLibraries" :key="lib.name" type="button" class="picker-card" :class="{ selected: destination === lib.name, draft: lib.name === DRAFT_NAME }" @click="destination=lib.name">
            <ContentIcon :value="lib.name === DRAFT_NAME ? 'icon:draft' : lib.icon || 'icon:book'" :size="24" />
            <strong>{{ lib.name }}</strong>
            <small>{{ lib.docs || 0 }} 篇</small>
          </button>
          <p v-if="libraries.length && !filteredLibraries.length" class="picker-empty">没有匹配的知识库</p><div v-if="!libraries.length" class="empty-library-create"><label>知识库名称<input v-model="newLibraryName" placeholder="新知识库" /></label><button :disabled="busy||!newLibraryName.trim()" @click="createLibrary">创建知识库</button></div>
        </div>
        <label>文档名称<input v-model="newName" maxlength="160" /></label>
        <p v-if="pickerError" class="picker-error">{{ pickerError }}</p>
        <div class="picker-actions"><button type="button" @click="picker=false">取消</button><button type="button" :disabled="busy || !destination || !newName.trim()" @click="collect">{{ busy ? '正在收录…' : '收录' }}</button></div>
      </section>
    </div>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import { API_BASE } from '../utils/api'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import ContentIcon from '../components/ContentIcon.vue'
import SelectMenu from '../components/SelectMenu.vue'

// 工作区 Markdown 是任意项目文件，预览禁用原生 HTML 执行。
const md = new MarkdownIt({ html: false, linkify: true, breaks: false })
const imageRule = md.renderer.rules.image || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options))
md.renderer.rules.image = (tokens, index, options, env, self) => {
  const src = tokens[index].attrGet('src') || ''
  if (src && !/^https?:\/\//i.test(src)) {
    tokens[index].attrSet('data-workspace-src', src)
    tokens[index].attrSet('src', 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=')
  }
  return imageRule(tokens, index, options, env, self)
}
const linkRule = md.renderer.rules.link_open || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options))
md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  if (/^https?:\/\//i.test(tokens[index].attrGet('href') || '')) {
    tokens[index].attrSet('target', '_blank')
    tokens[index].attrSet('rel', 'noopener noreferrer')
  }
  return linkRule(tokens, index, options, env, self)
}

const title = ref('')
const filePath = ref('')
const sourcePath = ref('')
const source = ref('')
const ready = ref(false)
const picker = ref(false)
const pickerError = ref('')
const busy = ref(false)
const newName = ref('')
const destination = ref('')
const libraries = ref([])
const libQuery = ref('')
const libFilter = ref('all')
const DRAFT_NAME = '草稿'
const newLibraryName=ref('')
async function createLibrary(){busy.value=true;pickerError.value='';try{const result=await fetch(API_BASE+'/api/lib',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newLibraryName.value.trim()})}).then(r=>r.json());if(!result.ok)throw Error(result.error);destination.value=newLibraryName.value.trim();await openPicker()}catch(e){pickerError.value=e.message}finally{busy.value=false}}
const filteredLibraries = computed(() => libraries.value.filter(lib => lib.name.toLocaleLowerCase().includes(libQuery.value.toLocaleLowerCase()) && (libFilter.value === 'all' || lib.name === DRAFT_NAME || (libFilter.value === 'public' ? lib.shared : !lib.shared))))
const pendingImages = ref(0)
const imageData = new Map()
const imageVersion = ref(0)
const sourceVersion = ref(0)
const imageFailures = new Map()
const requests = new Map()
let snapshotReady = false
let snapshotSaving = false
let snapshotWrite = Promise.resolve()
let lastSnapshot = ''
let lastAssetCount = -1
let fullRequestedFor = ''
let parentOrigin = ''
let nextRequestId = 0
let awaitingImages = false
let resizeObserver

const html = computed(() => md.render(source.value.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')))
const readerVersion = computed(() => filePath.value + ':' + sourceVersion.value + ':' + imageVersion.value)
const readerRaw = computed(() => {
  imageVersion.value
  let content = source.value
  for (const [reference, image] of imageData) content = content.split(reference).join('data:' + image.mime + ';base64,' + image.base64)
  return content
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
    document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: 'smooth' })
    return
  }
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(href)) return
  event.preventDefault()
  window.parent.postMessage({ type: 'dsh-reader-preview:open-link', href }, parentOrigin || '*')
}
function scanImages() {
  for (const img of document.querySelectorAll('.preview-image-probe img[data-workspace-src]')) {
    const reference = img.getAttribute('data-workspace-src')
    const saved = imageData.get(reference)
    if (saved) { img.src = 'data:' + saved.mime + ';base64,' + saved.base64; continue }
    if (imageFailures.has(reference) || [...requests.values()].includes(reference)) continue
    const requestId = String(++nextRequestId)
    requests.set(requestId, reference)
    pendingImages.value++
    window.parent.postMessage({ type: 'dsh-reader-preview:asset-request', requestId, reference }, parentOrigin || '*')
  }
  notifyHeight()
  if (pendingImages.value === 0) saveSnapshot()
}
async function saveSnapshot() {
  // 自动暂存只写本机阅读器；远程阅读器必须由用户主动收录。
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) return
  if (!snapshotReady || snapshotSaving || busy.value || !filePath.value || !source.value || pendingImages.value) return
  if (lastSnapshot === source.value && lastAssetCount === imageData.size) return
  snapshotSaving = true
  snapshotWrite = (async () => {
    const response = await fetch(API_BASE + '/api/workspace-preview', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference: filePath.value, sourcePath: sourcePath.value, title: title.value, content: source.value,
        incomplete: imageFailures.size > 0,
        assets: [...imageData].map(([reference, image]) => ({ reference, ...image })) })
    })
    if (response.ok) { lastSnapshot = source.value; lastAssetCount = imageData.size }
  })()
  try { await snapshotWrite }
  catch { /* 预览本身继续可用；访客不会写入工作区浏览记录。 */ }
  finally { snapshotSaving = false }
}
watch(html, async () => { await nextTick(); scanImages() }, { flush: 'post' })

function onMessage(event) {
  const localParent = /^(?:https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?|dsh-app:\/\/app)$/.test(event.origin)
  const remoteReader = !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  if (event.source !== window.parent || (!localParent && !(remoteReader && /^https:\/\//.test(event.origin)))) return
  const data = event.data || {}
  if (data.type === 'dsh-reader-preview:update') {
    parentOrigin = event.origin
    const changed = filePath.value && filePath.value !== String(data.filePath || '')
    if (changed) { imageData.clear(); imageFailures.clear(); requests.clear(); pendingImages.value = 0; lastSnapshot = ''; lastAssetCount = -1; fullRequestedFor = ''; newName.value = '' }
    title.value = String(data.title || '').slice(0, 200)
    filePath.value = String(data.filePath || '').slice(0, 2000)
    sourcePath.value = String(data.sourcePath || '').slice(0, 2000)
    source.value = String(data.text || '')
    sourceVersion.value++
    snapshotReady = data.eof === true
    if (!snapshotReady && !busy.value && fullRequestedFor !== filePath.value) {
      fullRequestedFor = filePath.value
      window.parent.postMessage({ type: 'dsh-reader-preview:full-request' }, parentOrigin)
    }
    if (!newName.value) newName.value = title.value.replace(/\.(md|markdown)$/i, '')
    ready.value = true
  } else if (data.type === 'dsh-reader-preview:asset-response') {
    const reference = requests.get(String(data.requestId || ''))
    if (!reference) return
    requests.delete(String(data.requestId))
    pendingImages.value = Math.max(0, pendingImages.value - 1)
    if (data.error) imageFailures.set(reference, String(data.error))
    else if (data.mime && data.base64) { imageData.set(reference, { mime: data.mime, base64: data.base64 }); imageVersion.value++ }
    scanImages()
    saveSnapshot()
    if (awaitingImages && pendingImages.value === 0) { awaitingImages = false; commitCollect() }
  } else if (data.type === 'dsh-reader-preview:full-content') {
    if (data.error) { if (busy.value) { pickerError.value = String(data.error); busy.value = false }; return }
    source.value = String(data.text || '')
    sourceVersion.value++
    snapshotReady = true
    nextTick(() => {
      scanImages()
      if (pendingImages.value && busy.value) awaitingImages = true
      else if (busy.value) commitCollect()
      saveSnapshot()
    })
  }
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  window.addEventListener('resize', notifyHeight)
  resizeObserver = new ResizeObserver(notifyHeight)
  resizeObserver.observe(document.body)
  window.parent.postMessage({ type: 'dsh-reader-preview:ready' }, '*')
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  window.removeEventListener('resize', notifyHeight)
  resizeObserver?.disconnect()
})

async function openPicker() {
  pickerError.value = ''
  try {
    const [me, result] = await Promise.all([
      fetch(API_BASE + '/api/me', { credentials: 'same-origin' }).then(r => r.json()),
      fetch(API_BASE + '/api/libs', { credentials: 'same-origin' }).then(r => r.json())
    ])
    if (me?.data?.role !== 'owner') throw Error('请先在阅读器中进入管理工作区')
    if (!result.ok) throw Error(result.error || '无法读取知识库')
    libraries.value = result.data.libs
    if (!libraries.value.some(lib => lib.name === destination.value)) destination.value = libraries.value[0]?.name || ''
  } catch (error) { pickerError.value = error.message }
  picker.value = true
}
function collect() {
  if (busy.value || !destination.value || !newName.value.trim()) return
  busy.value = true
  pickerError.value = ''
  if (snapshotReady) { nextTick(() => { scanImages(); if (pendingImages.value) awaitingImages = true; else commitCollect() }) }
  else window.parent.postMessage({ type: 'dsh-reader-preview:full-request' }, parentOrigin || '*')
}
async function commitCollect() {
  await snapshotWrite.catch(() => {})
  const references = [...new Set([...document.querySelectorAll('.preview-image-probe img[data-workspace-src]')].map(img => img.getAttribute('data-workspace-src')))]
  const missing = references.find(ref => !imageData.has(ref))
  if (missing) {
    pickerError.value = '图片无法保存：' + missing + (imageFailures.has(missing) ? '（' + imageFailures.get(missing) + '）' : '')
    busy.value = false
    return
  }
  try {
    const response = await fetch(API_BASE + '/api/import-workspace-doc', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: destination.value, name: newName.value.trim(), content: source.value,
        reference: filePath.value, workspace: filePath.value.slice(0, filePath.value.lastIndexOf('/')),
        assets: references.map(reference => ({ reference, ...imageData.get(reference) })) })
    })
    const json = await response.json()
    if (!json.ok) throw Error(json.error || '收录失败')
    picker.value = false
    window.parent.postMessage({ type: 'dsh-reader-preview:collected', file: json.data.file }, parentOrigin || '*')
  } catch (error) { pickerError.value = error.message } finally { busy.value = false }
}
</script>

<style>
:root { font-family: var(--font-sans); color: var(--c-text); background: var(--c-surface); font-synthesis: none; }
* { box-sizing: border-box; }
body { margin: 0; }
.preview-shell { min-height: 100vh; background: var(--c-surface); }
.preview-header { display: flex; align-items: center; gap: 12px; justify-content: space-between; min-height: 52px; padding: 10px clamp(18px,5vw,44px); background: var(--c-surface); }
.preview-identity { min-width: 0; display: flex; align-items: baseline; gap: 9px; }
.preview-kicker { font-size: 11px; color: var(--c-faint); white-space: nowrap; }
.preview-filename { font-size: 12px; color: var(--c-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.collect-button,.picker-actions button { border: 0; border-radius: var(--radius-control); corner-shape: superellipse(2); background: var(--c-field); color: var(--c-text); padding: 8px 12px; font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.collect-button:hover,.picker-actions button:hover { background: var(--c-hover); }
.preview-state { padding: 30px; color: var(--c-faint); font-size: 13px; }
.preview-reader { min-height: calc(100vh - 52px); padding: 16px 0 80px; }
.preview-reader .editor-shell { max-width: var(--measure,850px); margin: auto; }
.preview-image-probe { display: none; }
.picker-mask { position: fixed; inset: 0; z-index: 10; background: var(--c-overlay); display: grid; place-items: center; padding: 16px; }
.picker { width: min(720px,100%); max-height: min(720px,88dvh); overflow: auto; padding: 24px; border: 1px solid var(--c-line); border-radius: 38px; corner-shape: superellipse(2); background: var(--c-pop); box-shadow: var(--c-pop-shadow); }
.picker-heading { display: flex; align-items: center; justify-content: space-between; font-size: 17px; }
.picker-heading button { border: 0; background: transparent; color: var(--c-sub); font-size: 22px; cursor: pointer; }
.picker-search,.picker label input { display: block; width: 100%; padding: 10px 12px; border: 1px solid var(--c-line); border-radius: var(--radius-control); corner-shape: superellipse(2); background: var(--c-field); font: inherit; color: var(--c-text); }
.picker-tools { display:flex; align-items:center; gap:10px; margin:18px 0; }.picker-tools .picker-search { flex:1; min-width:0; }.picker-tools .select-menu-trigger { flex:none; }
.picker-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(148px,1fr)); gap: 10px; max-height: min(42dvh,350px); overflow: auto; padding: 2px; }
.picker-card { display: flex; align-items: flex-start; flex-direction: column; gap: 5px; min-height: 120px; padding: 16px; border: 1px solid transparent; border-radius: 24px; corner-shape: superellipse(2); background: var(--c-field); color: var(--c-text); text-align: left; cursor: pointer; }
.picker-card:hover { background: var(--c-hover); }
.picker-card.selected { border-color: var(--color-ds); background: color-mix(in srgb,var(--color-ds) 8%,var(--c-pop)); }
.picker-card.draft { background: color-mix(in srgb,var(--color-ds) 5%,var(--c-pop)); }
.picker-card-icon { font-size: 21px; line-height: 1; }
.picker-card strong { font-size: 13px; font-weight: 400; }
.picker-card small { font-size: 11px; color: var(--c-sub); }
.picker-empty { grid-column: 1/-1; color: var(--c-sub); }
.picker label { display: block; margin-top: 18px; font-size: 12px; color: var(--c-sub); }
.picker label input { margin-top: 7px; }
.picker-error { font-size: 12px; color: #c64b4b; }
.picker-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.picker-actions button:disabled { opacity: .5; cursor: default; }
</style>
