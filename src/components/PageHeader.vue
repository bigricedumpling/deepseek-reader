<template>
<section class="page-header" :class="{'has-cover':displayCover}">
 <div v-if="displayCover" class="page-cover" :class="[displayCover.height,{'cover-controls-open':coverControlsOpen}]" @click="onCoverTap">
  <Teleport :to="coverPlane || 'body'" :disabled="!coverPlane">
   <Transition name="cover-swap">
    <div :key="pictureUrl || displayCover.preset" class="cover-art-layer">
     <GradientCover v-if="displayCover.type==='gradient'" :cover="displayCover" :active="active" />
     <img v-else-if="pictureUrl" class="document-cover-image" :src="pictureUrl" :style="{objectPosition:'center '+(displayCover.position ?? 50)+'%'}" alt="文档封面" />
    </div>
   </Transition>
  </Teleport>
  <div v-if="!store.currentReadonly" class="cover-actions"><button ref="editCoverButton" @click="configure"><PhImage :size="13"/>更换封面</button></div>
 </div>
 <div class="page-heading-inner"><div class="page-heading-content">
  <button v-if="meta.icon" ref="iconButton" class="page-icon" :disabled="store.currentReadonly" :title="store.currentReadonly ? undefined : '更换文档图标'" :aria-label="store.currentReadonly ? '文档图标' : '更换文档图标'" @click="iconAnchor=$event.currentTarget;iconOpen=true"><ContentIcon :value="meta.icon" :size="56" /></button>
  <div v-if="!store.currentReadonly&&(!meta.icon||!displayCover)" class="page-header-controls"><button v-if="!meta.icon" ref="addIconButton" :disabled="busy" @click="iconAnchor=$event.currentTarget;iconOpen=true"><PhSmiley :size="16"/>添加图标</button><button v-if="!displayCover" ref="addCoverButton" :disabled="busy" @click="configure($event)"><PhImage :size="16"/>添加封面</button></div>
  <p v-if="meta.description" class="page-description">{{meta.description}}</p><p v-if="error&&!settings" class="reader-error">{{error}}</p>
 </div></div>
 <IconPicker v-if="iconOpen" :anchor="iconAnchor" :save="saveIcon" :current="meta.icon || ''" @close="closeIcon" />
 <RichBlockDialog :initial="blockDraft" v-if="blockDraft" @close="blockDraft=null" />
 <CoverPicker v-if="settings" :original="meta.cover || null" :anchor="pickerAnchor" :path="coverDocPath"
   @preview="previewCover" @dismiss="closeCover" />
</section>
</template>
<script setup>
import {ref,shallowRef,computed,watch,onMounted,onBeforeUnmount,nextTick} from 'vue'
import {PhImage,PhSmiley} from '../icons/remix'
import {useDocsStore} from '../stores/docs'
import {API_BASE} from '../utils/api'
import {getCoverArtwork} from '../utils/cover-artworks'
import ContentIcon from './ContentIcon.vue'
import IconPicker from './IconPicker.vue'
import CoverPicker from './CoverPicker.vue'
import GradientCover from './GradientCover.vue'
import RichBlockDialog from './RichBlockDialog.vue'

const emit = defineEmits(['preview-cover'])
defineProps({ coverPlane: { type: Object, default: null }, active: { type: Boolean, default: true } })
const store = useDocsStore()
const meta = computed(() => store.pageMeta)
const settings = ref(false), coverControlsOpen = ref(false)
const iconOpen = ref(false), iconAnchor = ref(null), blockDraft = ref(null), busy = ref(false), error = ref('')
const editCoverButton = ref(null), addCoverButton = ref(null), iconButton = ref(null), addIconButton = ref(null)
const pickerAnchor = shallowRef(null), candidate = shallowRef(undefined)
let coverDocPath = ''
const displayCover = computed(() => settings.value && candidate.value !== undefined ? candidate.value : meta.value.cover)
const pictureUrl = computed(() => {
  const cover = displayCover.value
  if (cover?.type === 'artwork') return getCoverArtwork(cover.artwork)?.url
  if (cover?.type === 'image') return cover.previewUrl || API_BASE + '/api/file?asset=' + encodeURIComponent(cover.asset)
  return ''
})
function previewCover(cover) {
  if (!settings.value || store.currentPath !== coverDocPath) return
  candidate.value = cover
  emit('preview-cover', cover)
}
function configure(event) {
  if (settings.value || busy.value || store.currentReadonly) return
  coverDocPath = store.currentPath
  const trigger = event.currentTarget
  // The trigger moves when a cover is added or removed; keep the open picker steady.
  let rect, width
  pickerAnchor.value = {
    isConnected: true,
    getBoundingClientRect() {
      if (!rect || width !== innerWidth) {
        rect = (editCoverButton.value || addCoverButton.value || trigger).getBoundingClientRect()
        width = innerWidth
      }
      return rect
    }
  }
  settings.value = true
}
function closeCover() {
  if (!settings.value) return
  settings.value = false
  candidate.value = undefined
  emit('preview-cover', undefined)
  const path = coverDocPath
  nextTick(() => {
    if (store.currentPath === path) (editCoverButton.value || addCoverButton.value)?.focus({ preventScroll:true })
  })
}
function onCoverTap(event) {
  if (!event.target.closest('.cover-actions') && matchMedia('(hover:none)').matches) {
    coverControlsOpen.value = !coverControlsOpen.value
  }
}
function editBlock(e) {
  if (e.detail.path === store.currentPath && !store.currentReadonly) blockDraft.value = e.detail
}
onMounted(() => window.addEventListener('reader-edit-block',editBlock))
onBeforeUnmount(() => {
  window.removeEventListener('reader-edit-block',editBlock)
  if (settings.value) emit('preview-cover', undefined)
})
watch(() => store.currentPath, () => {
  closeCover()
  iconOpen.value = false
  blockDraft.value = null
  coverControlsOpen.value = false
  error.value = ''
})
watch(() => store.currentReadonly, readonly => { if (readonly) closeCover() })
async function saveIcon(icon) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try { await store.savePageMeta({icon}) }
  catch (e) { error.value = e.message; throw e }
  finally { busy.value = false }
}
function closeIcon() {
  iconOpen.value = false
  if (!iconAnchor.value?.isConnected && document.activeElement === document.body) {
    (iconButton.value || addIconButton.value)?.focus({ preventScroll: true })
  }
}
</script>
<style scoped>
.page-header{padding-top:16px}.page-header.has-cover{padding-top:0}.page-cover{position:relative;height:240px;overflow:hidden;margin:0;border-radius:0}.page-cover.small{height:160px}.page-cover.large{height:330px}.document-cover-image{width:100%;height:100%;object-fit:cover}.page-heading-inner{padding:0 64px}.page-heading-content{max-width:var(--measure);margin:auto}.page-icon{display:block;margin:18px 0 2px;padding:4px 0}.has-cover .page-icon{margin-top:-28px;position:relative;filter:drop-shadow(0 1px 3px #fff8)}.page-description{margin-top:14px;color:var(--c-sub);font-size:14px;line-height:1.7}.page-header-controls{display:flex;gap:20px;margin:8px 0 0;font:13px var(--font-sans);color:var(--c-faint)}.page-header-controls button,.cover-actions button{display:flex;align-items:center;gap:6px}.page-header-controls button:hover{color:var(--c-ink)}.cover-actions{position:absolute;right:14px;bottom:14px;display:flex;gap:2px;opacity:0;pointer-events:none;padding:2px}.page-cover:focus-within .cover-actions{opacity:1;pointer-events:auto}@media(hover:hover){.page-cover:hover .cover-actions{opacity:1;pointer-events:auto}}@media(hover:none){.page-cover.cover-controls-open .cover-actions{opacity:1;pointer-events:auto}}.cover-actions button{padding:4px 7px;font-size:11.5px;gap:5px;line-height:1.2}
.cover-art-layer { position:absolute; inset:0; pointer-events:none; }
.cover-swap-enter-active,.cover-swap-leave-active { transition:opacity 150ms var(--motion-ease); }
.cover-swap-enter-active { z-index:1; }
.cover-swap-enter-from,.cover-swap-leave-to { opacity:0; }
.cover-actions { z-index:2; }
@media(prefers-reduced-motion:reduce){.cover-swap-enter-active,.cover-swap-leave-active{transition:none}}
@media(pointer:coarse){.cover-actions button{min-height:44px;min-width:44px}}
@media(max-width:720px){.page-cover{margin:0;height:180px}.page-cover.large{height:250px}.page-heading-inner{padding-inline:18px}.page-icon{margin-top:20px}}@media(max-width:480px){.page-heading-inner{padding-inline:14px}}@media print{.page-header-controls,.cover-actions{display:none}.page-cover{break-inside:avoid}}
</style>

<style>
@media (hover:hover) and (pointer:fine) {
  .page-header-controls {
    opacity:0;
    pointer-events:none;
    transition:opacity var(--motion-enter,180ms) ease 140ms;
  }
  .page-header:has(+ .editor-shell .ProseMirror > h1:first-of-type:hover) .page-header-controls,
  .page-header .page-heading-inner:hover .page-header-controls,
  .page-header-controls:focus-within,
  .page-header:not(:has(+ .editor-shell .ProseMirror > h1)) .page-header-controls {
    opacity:1;
    pointer-events:auto;
    transition-delay:0ms;
  }
}
@media (prefers-reduced-motion:reduce) { .page-header-controls{transition:none} }
</style>

<style scoped>
/* 封面操作条：从封面里轻轻托起来，而不是只改透明度。 */
.cover-actions {
  background: var(--surface-tool-bg);
  color: var(--c-ink);
  -webkit-backdrop-filter: var(--surface-tool-filter);
  backdrop-filter: var(--surface-tool-filter);
  border: 1px solid var(--surface-menu-border);
  border-radius: var(--radius-tool);
  corner-shape: var(--corner-ui);
  box-shadow: var(--surface-tool-shadow);
  transform: translateY(4px);
  transition: opacity var(--motion-enter) ease, transform var(--motion-enter) var(--motion-ease);
}
.cover-actions button { border-radius: var(--radius-item); }
@media (hover:hover) {
  .cover-actions button:enabled:hover { background: var(--c-hover); }
}
.cover-actions button:focus-visible { outline: 2px solid var(--c-focus); outline-offset: -2px; }
.page-cover:focus-within .cover-actions,
.page-cover.cover-controls-open .cover-actions { transform: none; }
@media (hover: hover) { .page-cover:hover .cover-actions { transform: none; } }
@media (prefers-reduced-motion: reduce) { .cover-actions { transition: none; transform: none; } }
</style>
