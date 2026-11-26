<template>
  <Teleport to="body">
    <Transition name="pop" appear @after-leave="emit('dismiss')">
      <div v-if="visible" class="cover-dismiss" @pointerdown.self="close">
        <section ref="dialog" class="reader-dialog cover-picker" :style="placement" tabindex="-1"
          role="dialog" aria-modal="true" aria-label="封面设置" :aria-busy="saving || decoding">
          <div class="cover-head">
            <div class="cover-tabs" role="tablist" aria-label="封面来源" @keydown="navigateTabs">
              <button v-for="source in sources" :key="source" :id="'cover-tab-'+source" role="tab"
                :tabindex="tab === source ? 0 : -1" :aria-selected="tab === source" aria-controls="cover-choices"
                @click="changeSource(source)">{{source}}</button>
            </div>
            <button class="cover-close" aria-label="关闭" @click="close"><PhX :size="16"/></button>
          </div>
          <div class="cover-body" role="tabpanel" id="cover-choices" :aria-labelledby="'cover-tab-'+tab">
            <div v-if="tab==='图库'" class="cover-grid" role="radiogroup" aria-label="图库封面">
              <label v-for="art in coverArtworks" :key="art.id" class="cover-tile">
                <input type="radio" name="featured-cover" :value="art.id" :aria-label="art.name"
                  :checked="draft?.artwork === art.id" @change="selectArt(art.id)" />
                <span class="cover-thumb"><img :src="art.thumbnail" alt="" />
                  <span v-if="draft?.artwork === art.id" class="cover-mark"><PhCheck :size="12"/></span>
                </span>
              </label>
            </div>
            <div v-else-if="tab==='图案'" class="cover-grid" role="radiogroup" aria-label="图案样式">
              <label v-for="choice in patterns" :key="choice.cover.preset" class="cover-tile">
                <input type="radio" name="pattern-cover" :value="choice.cover.preset" :aria-label="choice.name"
                  :checked="draft?.type === 'gradient' && draft.preset === choice.cover.preset" @change="selectPattern(choice.cover)" />
                <span class="cover-thumb"><GradientCover :cover="choice.cover" :active="false"/>
                  <span v-if="draft?.type === 'gradient' && draft.preset === choice.cover.preset" class="cover-mark"><PhCheck :size="12"/></span>
                </span>
              </label>
            </div>
            <div v-else class="cover-upload">
              <button v-if="uploaded" class="upload-choice" :aria-pressed="draft?.type==='image'" @click="selectUploaded">
                <img :src="uploaded.previewUrl || assetUrl(uploaded.asset)" alt="" />
                <span>{{uploadName || '已上传的封面'}}</span>
                <PhCheck v-if="draft?.type==='image'" :size="16"/>
              </button>
              <button class="cover-file-button" @click="fileInput.click()">
                <PhImage :size="18"/>{{ uploaded ? '更换图片' : '选择本地图片' }}
              </button>
              <small v-if="!uploaded">PNG、JPEG、WebP、GIF，最大 10 MB</small>
              <input ref="fileInput" hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="chooseImage"/>
            </div>
            <div v-if="draft" class="cover-adjust-bar">
              <button v-if="selectedSource === tab" class="cover-adjust" :aria-expanded="adjust" aria-controls="cover-adjustments" @click="adjust=!adjust">
                <PhSlidersHorizontal :size="14"/>调整<PhCaretDown class="adjust-caret" :class="{open:adjust}" :size="12"/>
              </button>
              <button class="cover-remove" @click="removeCover">移除封面</button>
            </div>
            <div v-if="adjust && selectedSource === tab" id="cover-adjustments" class="cover-adjustments">
              <div v-if="draft.type === 'gradient'" class="cover-pattern-settings">
                <div class="cover-palette-row">
                  <span>配色</span>
                  <div class="cover-swatches" role="group" aria-label="配色">
                    <button v-for="(colors,i) in coverPalettes" :key="i" :aria-label="coverPaletteNames[i]"
                      :aria-pressed="sameColors(colors,draft.colors)" @click="setPalette(colors)">
                      <span :style="{background:'linear-gradient(115deg,'+colors.join(',')+')'}"></span>
                    </button>
                  </div>
                </div>
                <div class="cover-custom" role="group" aria-label="自选颜色">
                  <span>自选</span>
                  <input v-for="(color,i) in draft.colors" :key="i" type="color" :value="color" :aria-label="'颜色 '+(i+1)"
                    @input="setColor(i,$event.target.value)" @change="commitAdjustment"/>
                </div>
                <div class="cover-variation">
                  <button class="cover-shuffle" @click="shuffle"><PhShuffle :size="14"/>换一版</button>
                  <button class="cover-flow" role="switch" :aria-checked="!!draft.animated" @click="toggleMotion">
                    动态<span class="cover-switch"></span>
                  </button>
                </div>
              </div>
              <label v-else class="cover-position-row"><span>上下位置</span>
                <input type="range" min="0" max="100" :value="draft.position ?? 50" @input="setPosition(Number($event.target.value))" @change="commitAdjustment"/>
              </label>
              <div class="cover-height-row"><span>封面高度</span>
                <div class="cover-heights" role="group" aria-label="封面高度">
                  <button v-for="choice in heights" :key="choice[0]" :aria-pressed="draft.height === choice[0]" @click="setHeight(choice[0])">{{choice[1]}}</button>
                </div>
              </div>
            </div>
          </div>
          <p v-if="error" class="reader-error" role="alert">{{error}}</p>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, shallowRef, computed, watch, onBeforeUnmount } from 'vue'
import { PhCheck, PhImage, PhShuffle, PhCaretDown, PhSlidersHorizontal, PhX } from '../icons/remix'
import { useDocsStore } from '../stores/docs'
import { API_BASE } from '../utils/api'
import { coverArtworks } from '../utils/cover-artworks'
import { coverShapes, patternCovers, coverPalettes, coverPaletteNames } from '../utils/cover-presets'
import { navigateTabs } from '../utils/navigate-tabs'
import { usePickerPlacement } from '../composables/usePickerPlacement'
import { useDialogFocus } from '../composables/useDialogFocus'
import GradientCover from './GradientCover.vue'

const props = defineProps({
  original: { type:Object, default:null },
  anchor: {type:Object, required:true},
  path: {type:String, required:true}
})
const emit = defineEmits(['preview','dismiss'])
const store = useDocsStore()
const sources = ['图库','图案','上传']
const heights = [['small','矮'],['medium','中'],['large','高']]
const openedPath = props.path
const openedId = store.currentSourceId
const initial = props.original || null
const sourceOf = type => ({artwork:'图库', gradient:'图案', image:'上传'})[type]
const tab = ref(sourceOf(initial?.type) || '图库')
const height = ref(initial?.height || 'medium')
const artwork = (id, position = 50) => ({type:'artwork', artwork:id, position, height:height.value})
const draft = shallowRef(initial)
const selectedSource = computed(() => sourceOf(draft.value?.type))
const uploaded = shallowRef(initial?.type === 'image' ? initial : null)
const fileInput = ref(null), uploadName = ref('')
const adjust = ref(false), saving = ref(false), decoding = ref(false), error = ref(''), visible = ref(true)
const dialog = ref(null)
const placement = usePickerPlacement(dialog, computed(() => props.anchor), 420, initial ? 'end' : 'start')
useDialogFocus(visible, dialog, close)
const assetUrl = id => API_BASE+'/api/file?asset='+encodeURIComponent(id)
let saved = initial, revision = store.pageMetaRevision
let queued = null, localFile = null, fileChoice = 0
let adjustmentPending = false, closing = false, mounted = true

function sameCover(a, b) {
  const key = value => value ? JSON.stringify(value, Object.keys(value).sort()) : ''
  return key(a) === key(b)
}
function show(cover) {
  draft.value = cover
  if (mounted) emit('preview', cover)
}
function setCover(cover, commit = true) {
  error.value = ''
  closing = false
  show(cover)
  adjustmentPending = !commit
  if (commit) enqueue()
}
function enqueue() {
  queued = {cover:draft.value, file:localFile}
  if (!saving.value) void saveSelections()
}
function commitAdjustment() {
  if (!adjustmentPending) return
  adjustmentPending = false
  enqueue()
}
function close() {
  closing = true
  commitAdjustment()
  closeWhenReady()
}
function closeWhenReady() {
  if (closing && !saving.value && !decoding.value) visible.value = false
}
function dismissFileChoice() {
  fileChoice++
  decoding.value = false
}

function sameColors(a, b) {
  return a?.join().toLowerCase() === b?.join().toLowerCase()
}
// Keep a document's existing colors and motion when trying a different pattern.
const savedPattern = initial?.type === 'gradient' ? initial : null
const patternDrafts = ref(savedPattern ? {[savedPattern.preset]:savedPattern} : {})
const userPalette = shallowRef(savedPattern?.colors)
const userMotion = ref(savedPattern?.animated)
const patterns = computed(() => patternCovers.map(preset => {
  const choice = patternDrafts.value[preset.preset] || preset
  return {
    name:coverShapes.find(([id]) => id === preset.preset)[1],
    cover:{...choice,colors:userPalette.value || choice.colors,
      animated:userMotion.value ?? choice.animated,height:height.value}
  }
}))

function changeSource(source) {
  if (tab.value === source) return
  commitAdjustment()
  tab.value = source
  adjust.value = false
}
function selectArt(id) {
  dismissFileChoice()
  setCover(artwork(id, saved?.artwork === id ? saved.position : 50))
}
function setPattern(value, commit = true) {
  const next = {...value,height:height.value}
  patternDrafts.value[value.preset] = next
  setCover(next, commit)
}
function selectPattern(value) {
  dismissFileChoice()
  setPattern(value)
}
function setPalette(colors, commit = true) {
  userPalette.value = [...colors]
  setPattern({...draft.value,colors:userPalette.value}, commit)
}
function toggleMotion() {
  userMotion.value = !draft.value.animated
  setPattern({...draft.value,animated:userMotion.value})
}
function setColor(index, value) {
  const colors = [...draft.value.colors]
  colors[index] = value
  setPalette(colors, false)
}
function shuffle() {
  const offset = 1 + Math.floor(Math.random() * 999)
  setPattern({...draft.value,seed:(Math.floor(draft.value.seed || 0) + offset) % 1000})
}
function setPosition(position) {
  const next = {...draft.value,position}
  if (next.type === 'image') uploaded.value = next
  setCover(next, false)
}
function setHeight(value) {
  height.value = value
  setCover({...draft.value,height:value})
}
function removeCover() {
  dismissFileChoice()
  adjust.value = false
  setCover(null)
}
function selectUploaded() {
  dismissFileChoice()
  if (uploaded.value) setCover({...uploaded.value,height:height.value})
}
function report(message) {
  closing = false
  if (mounted) error.value = message
  else store.setError('封面保存失败：' + message)
}
async function chooseImage(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  const ticket = ++fileChoice
  if (file.size > 10 * 1024 * 1024 || !['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)) {
    decoding.value = false
    report(file.size > 10 * 1024 * 1024 ? '图片不能超过 10 MB' : '请选择 PNG、JPEG、WebP 或 GIF 图片')
    return
  }
  const url = URL.createObjectURL(file)
  decoding.value = true
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (ticket !== fileChoice) return
    if (localFile) URL.revokeObjectURL(localFile.url)
    localFile = {file,url,asset:''}
    uploadName.value = file.name
    uploaded.value = {type:'image',previewUrl:url,position:50,height:height.value}
    const shouldClose = closing
    setCover(uploaded.value)
    closing = shouldClose
  } catch {
    if (ticket === fileChoice) report('无法读取这张图片，请选择有效的图片文件。')
  } finally {
    if (localFile?.url !== url) URL.revokeObjectURL(url)
    if (ticket === fileChoice) decoding.value = false
    closeWhenReady()
  }
}
async function upload(local) {
  if (local.asset) return local.asset
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = () => reject(new Error('无法读取这张图片'))
    reader.readAsDataURL(local.file)
  })
  const response = await fetch(API_BASE+'/api/asset',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({path:openedPath,documentId:openedId,mime:local.file.type,base64})
  })
  const result = await response.json()
  if (!result.ok) throw Error(result.error || '图片上传失败')
  local.asset = result.data.id
  if (uploaded.value?.previewUrl === local.url) uploaded.value = {...uploaded.value,asset:local.asset}
  return local.asset
}

async function persist(cover) {
  const target = {path:openedPath,id:openedId,revision}
  try {
    return await store.savePageMeta({cover}, target)
  } catch (e) {
    if (e.code !== 'CONFLICT' || !e.details?.revision) throw e
    // An Agent may have changed a different page property while this picker was open.
    if (sameCover(e.details.meta?.cover, saved)) {
      return await store.savePageMeta({cover},{...target,revision:e.details.revision})
    }
    throw e
  }
}

// Only one revision can be written at a time. A later click replaces any choice
// still waiting, and retains the identity of the document even after navigation.
async function saveSelections() {
  saving.value = true
  try {
    while (queued) {
      const {cover, file} = queued
      queued = null
      try {
        let next = cover
        if (cover?.previewUrl) {
          const asset = cover.asset || await upload(file)
          if (queued) continue
          next = {...cover,asset}
          delete next.previewUrl
        }
        if (!sameCover(next, saved)) {
          const result = await persist(next)
          saved = result.meta.cover ?? null
          revision = result.revision
        }
        if (!queued && !adjustmentPending && draft.value === cover) show(saved)
      } catch (e) {
        if (e.code === 'CONFLICT' && e.details?.revision) {
          saved = e.details.meta?.cover ?? null
          revision = e.details.revision
          queued = null
          adjustmentPending = false
        }
        if (!queued) {
          adjustmentPending = false
          adoptSaved()
          report(e.code === 'CONFLICT' ? '封面已在别处更改，已显示最新版本。' : (e.message || '封面保存失败，请重试。'))
        }
      }
    }
  } finally {
    saving.value = false
    closeWhenReady()
    if (!mounted && !decoding.value && localFile) URL.revokeObjectURL(localFile.url)
  }
}
function adoptSaved() {
  height.value = saved?.height || 'medium'
  if (saved?.type === 'gradient') {
    patternDrafts.value[saved.preset] = saved
    userPalette.value = saved.colors
    userMotion.value = saved.animated
  }
  if (saved?.type === 'image') uploaded.value = saved
  show(saved)
}
watch(() => store.pageMetaRevision, value => {
  if (store.currentPath !== openedPath || store.currentSourceId !== openedId || !value || saving.value || adjustmentPending) return
  revision = value
  if (!sameCover(store.pageMeta.cover, saved)) {
    saved = store.pageMeta.cover ?? null
    adoptSaved()
  }
})
onBeforeUnmount(() => {
  mounted = false
  commitAdjustment()
  if (localFile && !saving.value && !decoding.value) URL.revokeObjectURL(localFile.url)
})
</script>
<style scoped>
.cover-dismiss { position:fixed; inset:0; }
.cover-picker.reader-dialog {
  display:flex; flex-direction:column; gap:0; padding:12px; overflow:hidden;
  color:var(--c-ink); font-family:var(--font-sans); overscroll-behavior:contain;
}
.cover-head,.cover-tabs,.cover-adjust-bar,.cover-adjust,.cover-shuffle,.cover-custom,.cover-flow,.cover-height-row,.cover-heights {
  display:flex; align-items:center;
}
.cover-head { flex:none; justify-content:space-between; gap:6px; }
.cover-tabs { gap:2px; }
.cover-picker button { color:var(--c-sub); }
.cover-picker button:hover:not(:disabled) { color:var(--c-ink); background-color:var(--c-hover); }
.cover-picker :is(button,input):focus-visible { outline:2px solid var(--c-focus); outline-offset:2px; }
.cover-tabs button,.cover-close,.cover-adjust,.cover-shuffle,.cover-flow,.cover-remove,.cover-heights button {
  min-height:30px; padding:4px 9px; border-radius:var(--radius-item); font-size:12px; line-height:1.35;
}
.cover-picker button[aria-selected=true],.cover-picker button[aria-pressed=true]:not(.upload-choice) { color:var(--c-ink); background-color:var(--c-active); }
.cover-close { min-width:30px; display:grid; place-items:center; padding:0; }
.cover-body { overflow:auto; overscroll-behavior:contain; min-height:0; padding:6px 3px 4px; margin:2px -3px 0; }
.cover-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:4px 1px 1px; }
.cover-picker label.cover-tile { position:relative; display:block; margin:0; min-width:0; cursor:pointer; }
.cover-picker .cover-tile input[type=radio] {
  position:absolute; width:1px; height:1px; opacity:0; margin:0; padding:0; pointer-events:none;
}
.cover-thumb { position:relative; display:block; aspect-ratio:2.65; border-radius:var(--radius-item); background:var(--c-field); }
.cover-thumb>img,.cover-thumb :deep(.gradient-cover) { width:100%; height:100%; object-fit:cover; display:block; border-radius:inherit; overflow:hidden; }
.cover-thumb::after { content:''; position:absolute; inset:0; pointer-events:none; border-radius:inherit; box-shadow:inset 0 0 0 1px var(--surface-menu-border); }
.cover-tile input:checked+.cover-thumb { outline:1.5px solid var(--c-ink); outline-offset:2px; }
.cover-tile input:focus-visible+.cover-thumb { outline:2px solid var(--c-focus); outline-offset:2px; }
.cover-mark { display:grid; place-items:center; position:absolute; bottom:4px; right:4px; width:16px; height:16px; border-radius:50%; background:var(--c-pop); color:var(--c-ink); }
.cover-adjust-bar { justify-content:space-between; margin:8px -4px 0; }
.cover-remove { margin-left:auto; }
.cover-adjust,.cover-shuffle,.cover-flow { gap:5px; }
.adjust-caret { transition:transform .14s var(--motion-ease); }
.adjust-caret.open { transform:rotate(180deg); }
.cover-adjustments { margin-top:4px; padding:10px; border-radius:var(--radius-control); background:var(--c-field); }
.cover-palette-row,.cover-variation { display:flex; align-items:center; gap:8px; }
.cover-palette-row>span,.cover-custom>span { width:30px; flex:none; }
.cover-palette-row>span { color:var(--c-sub); font-size:12px; }
.cover-swatches { flex:1; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px; }
.cover-variation { justify-content:space-between; margin-top:4px; }
.cover-variation button { min-height:28px; padding:3px 6px; border-radius:var(--radius-control); font-size:12px; }
.cover-swatches button { position:relative; min-width:0; padding:3px; height:27px; border-radius:6px; }
.cover-swatches button span { display:block; height:100%; border-radius:4px; }
.cover-swatches button[aria-pressed=true] { outline:1.5px solid var(--c-ink); outline-offset:-1px; }
.cover-pattern-settings { margin-bottom:8px; }
.cover-custom { gap:6px; margin-top:3px; }
.cover-custom>span,.cover-height-row>span,.cover-position-row>span { color:var(--c-sub); font-size:12px; }
.cover-picker .cover-custom input[type=color] { width:25px; height:26px; margin:0; padding:3px; border:0; appearance:none; background:transparent; cursor:pointer; }
.cover-custom input::-webkit-color-swatch-wrapper { padding:0; }
.cover-custom input::-webkit-color-swatch { border:1px solid var(--surface-menu-border);border-radius:4px; }
.cover-switch { display:block; width:23px; height:14px; border-radius:14px; padding:2px; background:var(--c-line); }
.cover-switch::after { content:''; display:block; width:10px; height:10px; border-radius:50%; background:var(--c-pop); transition:transform .14s var(--motion-ease); }
.cover-flow[aria-checked=true] .cover-switch { background:var(--c-ink); }
.cover-flow[aria-checked=true] .cover-switch::after { transform:translateX(9px); }
.cover-height-row,.cover-picker label.cover-position-row { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0; }
.cover-picker label.cover-position-row { margin-bottom:8px; }
.cover-position-row input { min-width:0; width:65%; accent-color:var(--c-accent); }
.cover-heights { gap:3px; }
.cover-heights button { min-width:35px; min-height:26px; }
.cover-picker .cover-heights button[aria-pressed=true] { background:var(--c-pop); color:var(--c-ink); }
.cover-upload { display:grid; gap:7px; justify-items:center; padding:12px 0 8px; }
.cover-file-button { display:flex; align-items:center; justify-content:center; gap:7px; width:100%; height:50px; border-radius:var(--radius-control); background:var(--c-field); }
.cover-upload:has(.upload-choice) .cover-file-button { height:32px; }
.cover-upload small { color:var(--c-sub); font-size:11px; }
.upload-choice { display:flex; width:100%; gap:10px; align-items:center; padding:5px; border-radius:var(--radius-control); }
.upload-choice img { width:74px; height:36px; object-fit:cover; border-radius:5px; }
.upload-choice span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:start; }
.cover-picker p.reader-error { margin:6px 0 0; font-size:12px; }
@media(max-width:600px) {
  .cover-picker.reader-dialog { top:auto!important; bottom:max(10px,env(safe-area-inset-bottom)); max-height:64dvh!important; }

}
@media(max-height:430px) { .cover-picker.reader-dialog{ max-height:calc(100dvh - 20px)!important; } }
@media(pointer:coarse) {
  .cover-head button,.cover-adjust,.cover-variation button,.cover-remove,.cover-heights button,.cover-file-button { min-height:44px; min-width:44px; }
  .cover-swatches button { height:44px; padding:7px 3px; }
  .cover-picker .cover-custom input[type=color] { width:34px;height:44px;padding:7px 2px; }
}
@media(prefers-reduced-motion:reduce){.cover-switch::after,.adjust-caret{transition:none}}
@media print { .cover-dismiss { display:none!important; } }
</style>
