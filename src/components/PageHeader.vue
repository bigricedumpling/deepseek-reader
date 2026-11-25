<template>
<section class="page-header" :class="{'has-cover':meta.cover}">
 <div v-if="meta.cover" class="page-cover" :class="[meta.cover.height,{'cover-controls-open':coverControlsOpen}]" @click="onCoverTap">
  <Teleport :to="coverPlane || 'body'" :disabled="!coverPlane">
  <GradientCover v-if="meta.cover.type==='gradient'" :cover="meta.cover" :active="active && !settings" />
  <img v-else class="document-cover-image" :src="API_BASE+'/api/file?asset='+meta.cover.asset" :style="{objectPosition:'center '+meta.cover.position+'%'}" alt="文档封面" />
  </Teleport>
  <div v-if="!store.currentReadonly" class="cover-actions"><button ref="editCoverButton" @click="configure($event)"><PhImage :size="13"/>更换封面</button><button v-if="meta.cover.type==='gradient'" :disabled="busy" @click="shuffleAppliedCover" aria-label="随机生成封面" title="随机生成封面"><PhShuffle :size="14"/></button></div>
 </div>
 <div class="page-heading-inner"><div class="page-heading-content">
  <button v-if="meta.icon" ref="iconButton" class="page-icon" :disabled="store.currentReadonly" :title="store.currentReadonly ? undefined : '更换文档图标'" :aria-label="store.currentReadonly ? '文档图标' : '更换文档图标'" @click="iconAnchor=$event.currentTarget;iconOpen=true"><ContentIcon :value="meta.icon" :size="56" /></button>
  <div v-if="!store.currentReadonly&&(!meta.icon||!meta.cover)" class="page-header-controls"><button v-if="!meta.icon" ref="addIconButton" :disabled="busy" @click="iconAnchor=$event.currentTarget;iconOpen=true"><PhSmiley :size="16"/>添加图标</button><button v-if="!meta.cover" ref="addCoverButton" :disabled="busy" @click="configure($event)"><PhImage :size="16"/>添加封面</button></div>
  <p v-if="meta.description" class="page-description">{{meta.description}}</p><p v-if="error&&!settings" class="reader-error">{{error}}</p>
 </div></div>
 <IconPicker v-if="iconOpen" :anchor="iconAnchor" :save="saveIcon" :current="meta.icon || ''" @close="closeIcon" />
 <RichBlockDialog :initial="blockDraft" v-if="blockDraft" @close="blockDraft=null" />
 <Teleport to="body"><Transition name="pop"><div v-if="settings" class="cover-dismiss" @pointerdown.self="closeCover"><section ref="coverDialog" tabindex="-1" class="reader-dialog cover-picker" :style="placement" role="dialog" aria-modal="true" aria-label="封面设置">
 <div class="cover-head"><div class="cover-tabs" role="tablist" aria-label="封面来源" @keydown="navigateTabs">
  <button v-for="t in coverTabs" :key="t" :class="{selected:coverTab===t}" role="tab" :tabindex="coverTab===t ? 0 : -1" :aria-selected="coverTab===t" @click="coverTab=t">{{t}}</button>
  </div><div class="cover-head-actions">
   <button v-if="meta.cover" class="cover-remove" :disabled="busy" @click="removeCover">移除</button>
   <button class="cover-close" title="关闭" aria-label="关闭" @click="closeCover"><PhX :size="15" /></button>
  </div>
 </div>
 <template v-if="coverTab==='图案'">
  <div class="cover-preview">
   <GradientCover :cover="draft" />
  </div>
  <div class="cover-toolbar">
   <div class="cover-shapes" role="group" aria-label="图案样式">
    <button v-for="[id,name] in coverShapes" :key="id" :aria-pressed="draft.preset === id" :class="{selected:draft.preset===id}" @click="pickCoverStyle(id)">{{name}}</button>
   </div>
  </div>
  <div class="cover-swatches" role="group" aria-label="配色">
   <button v-for="(colors,i) in coverPalettes" :key="i" :class="{selected:sameColors(draft.colors,colors)}" :style="{background:'linear-gradient(120deg,'+colors.join(',')+')'}" :aria-pressed="sameColors(draft.colors,colors)" :aria-label="'配色 '+(i+1)" @click="pickCoverPalette(colors)" />
  </div>
  <div class="cover-custom">
   <span>颜色</span>
   <input v-for="(_,i) in draft.colors" :key="i" :value="draft.colors[i]" type="color" :aria-label="'颜色 '+(i+1)" @input="pickCoverColor(i,$event)" />
   <button class="cover-shuffle" aria-label="随机变换图案" title="随机变换图案" @click="shuffleCover"><PhShuffle :size="15" /></button>
   <button class="cover-flow" role="switch" :aria-checked="!!draft.animated" @click="toggleCoverFlow"><span>动态</span><span class="cover-switch" :class="{on:draft.animated}" /></button>
  </div>
 </template>
 <template v-else>
  <div v-if="imageDraft" class="cover-position">
   <div class="cover-preview image-preview"><img :src="imageUrl || API_BASE+'/api/file?asset='+imageDraft.asset" :style="{objectPosition:'center '+imageDraft.position+'%'}" alt="封面预览" /></div>
   <label class="cover-position-row"><span>上下位置</span><input type="range" min="0" max="100" v-model.number="imageDraft.position" /></label>
  </div>
  <div class="cover-upload" :class="{'has-image':imageDraft}">
   <PhImage v-if="!imageDraft" :size="30" />
   <button class="reader-button" type="button" :disabled="busy" @click="coverUpload.click()">{{imageDraft ? '更换图片' : '选择图片'}}</button>
   <p v-if="!imageDraft">最大 10 MB</p>
   <input ref="coverUpload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden @change="chooseImage" />
  </div>
 </template>
 <footer v-if="coverTab==='图案' || imageDraft" class="cover-footer">
  <button type="button" class="cover-done" :disabled="busy" @click="applyCover">使用封面</button>
 </footer>
 <p v-if="error" class="reader-error" role="alert">{{error}}</p>
</section></div></Transition></Teleport>
</section>
</template>
<script setup>
import {ref,computed,watch,onMounted,onBeforeUnmount} from 'vue'
import {PhImage,PhShuffle,PhSmiley,PhX} from '../icons/remix'
import {useDocsStore} from '../stores/docs'
import {API_BASE} from '../utils/api'
import { usePickerPlacement } from '../composables/usePickerPlacement'
import {randomCover,coverPalettes,coverShapes} from '../utils/cover-presets'
import ContentIcon from './ContentIcon.vue'
import { navigateTabs } from '../utils/navigate-tabs'
import { useDialogFocus } from '../composables/useDialogFocus'
import IconPicker from './IconPicker.vue'
import GradientCover from './GradientCover.vue'
import RichBlockDialog from './RichBlockDialog.vue'
defineProps({ coverPlane: { type: Object, default: null }, active: { type: Boolean, default: true } })
const store=useDocsStore(),meta=computed(()=>store.pageMeta),iconOpen=ref(false),iconAnchor=ref(null),settings=ref(false),error=ref(''),busy=ref(false),coverTab=ref('图案'),blockDraft=ref(null),coverControlsOpen=ref(false)
const coverTabs = ['图案', '图片']
const draft = ref(randomCover())
const imageDraft = ref(null)
const imageUrl = ref('')
let imageFile = null
function discardImage() {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
  imageFile = null
}
onBeforeUnmount(discardImage)
function editBlock(e){if(e.detail.path===store.currentPath&&!store.currentReadonly)blockDraft.value=e.detail}
onMounted(()=>window.addEventListener('reader-edit-block',editBlock));onBeforeUnmount(()=>window.removeEventListener('reader-edit-block',editBlock))
watch(()=>store.currentPath,()=>{discardImage();coverDocPath='';settings.value=false;iconOpen.value=false;blockDraft.value=null;coverControlsOpen.value=false;error.value=''})
function onCoverTap(event){if(event.target.closest('.cover-actions'))return;if(matchMedia('(hover:none)').matches)coverControlsOpen.value=!coverControlsOpen.value}
async function update(patch){if(busy.value)return false;busy.value=true;error.value='';try{await store.savePageMeta(patch);return true}catch(e){error.value=e.message;return false}finally{busy.value=false}}
async function saveIcon(icon){if(!(await update({icon})))throw Error(error.value)}
let coverDocPath = ''

const iconButton = ref(null), addIconButton = ref(null)
const editCoverButton = ref(null), addCoverButton = ref(null)
function closeIcon() {
  iconOpen.value = false
  if (!iconAnchor.value?.isConnected && document.activeElement === document.body) {
    const target = iconButton.value || addIconButton.value
    target?.focus({ preventScroll: true })
  }
}
const coverDialog = ref(null), coverUpload = ref(null), coverAnchor = ref(null)
const placement = usePickerPlacement(coverDialog, coverAnchor, 420, 'end')
useDialogFocus(settings, coverDialog, closeCover, () => {
  if (coverDocPath !== store.currentPath) return null
  return coverAnchor.value?.isConnected ? coverAnchor.value : editCoverButton.value || addCoverButton.value
})

function closeCover() {
  if (busy.value) return
  settings.value = false
  discardImage()
}

async function removeCover() {
  if (await update({ cover: null })) closeCover()
}

function configure(event) {
  if (busy.value) return
  coverAnchor.value = event.currentTarget
  coverDocPath = store.currentPath
  discardImage()
  const original = meta.value.cover && JSON.parse(JSON.stringify(meta.value.cover))
  draft.value = original?.type === 'gradient' ? original : { ...randomCover(), height: original?.height || 'medium' }
  draft.value.colors ||= [...coverPalettes[0]]
  imageDraft.value = original?.type === 'image' ? original : null
  coverTab.value = imageDraft.value ? '图片' : '图案'
  error.value = ''
  settings.value = true
}

function sameColors(a, b) { return a?.length === b.length && a.every((v, i) => v === b[i]) }
function pickCoverPalette(colors) { draft.value.colors = [...colors] }
function pickCoverStyle(preset) { draft.value.preset = preset }
function pickCoverColor(index, event) { draft.value.colors[index] = event.target.value }
function toggleCoverFlow() { draft.value.animated = !draft.value.animated }
function variedCover(original) {
  return { ...randomCover(), height: original.height || 'medium', animated: !!original.animated }
}
function shuffleAppliedCover() { update({ cover: variedCover(meta.value.cover) }) }
function shuffleCover() { draft.value = variedCover(draft.value) }

function chooseImage(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || busy.value) return
  if (file.size > 10 * 1024 * 1024) { error.value = '图片不能超过 10 MB'; return }
  if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)) { error.value = '请选择 PNG、JPEG、WebP 或 GIF 图片'; return }
  discardImage()
  imageFile = file
  imageUrl.value = URL.createObjectURL(file)
  imageDraft.value = { type: 'image', position: 50, height: draft.value.height || 'medium' }
  error.value = ''
}

async function applyCover() {
  if (busy.value) return
  const path = coverDocPath
  const next = JSON.parse(JSON.stringify(coverTab.value === '图案' ? draft.value : imageDraft.value))
  if (!next) return
  busy.value = true
  error.value = ''
  try {
    if (next.type === 'image' && !next.asset && imageFile) {
      const file = imageFile
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = () => reject(new Error('无法读取这张图片'))
        reader.readAsDataURL(file)
      })
      if (path !== store.currentPath) return
      const response = await fetch(API_BASE + '/api/asset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, mime: file.type, base64 })
      })
      const result = await response.json()
      if (!result.ok) throw Error(result.error || '图片上传失败')
      if (path !== store.currentPath) return
      next.asset = imageDraft.value.asset = result.data.id
    }
    if (path !== store.currentPath) return
    await store.savePageMeta({ cover: next })
    settings.value = false
    discardImage()
  } catch (e) {
    if (path === store.currentPath) error.value = e.message || '封面保存失败'
  } finally {
    busy.value = false
  }
}
</script>
<style scoped>
.page-header{padding-top:16px}.page-header.has-cover{padding-top:0}.page-cover{position:relative;height:240px;overflow:hidden;margin:0;border-radius:0}.page-cover.small{height:160px}.page-cover.large{height:330px}.page-cover>img,img.document-cover-image{width:100%;height:100%;object-fit:cover}.page-heading-inner{padding:0 64px}.page-heading-content{max-width:var(--measure);margin:auto}.page-icon{display:block;margin:18px 0 2px;padding:4px 0}.has-cover .page-icon{margin-top:-28px;position:relative;filter:drop-shadow(0 1px 3px #fff8)}.page-description{margin-top:14px;color:var(--c-sub);font-size:14px;line-height:1.7}.page-header-controls{display:flex;gap:20px;margin:8px 0 0;font:13px var(--font-sans);color:var(--c-faint)}.page-header-controls button,.cover-actions button,.cover-shuffle{display:flex;align-items:center;gap:6px}.page-header-controls button:hover{color:var(--c-ink)}.cover-actions{position:absolute;right:14px;bottom:14px;display:flex;gap:2px;opacity:0;pointer-events:none;padding:2px}.page-cover:focus-within .cover-actions{opacity:1;pointer-events:auto}@media(hover:hover){.page-cover:hover .cover-actions{opacity:1;pointer-events:auto}}@media(hover:none){.page-cover.cover-controls-open .cover-actions{opacity:1;pointer-events:auto}}.cover-actions button{padding:4px 7px;font-size:11.5px;gap:5px;line-height:1.2}.cover-dismiss { position:fixed; inset:0; z-index:2100; }
.cover-picker.reader-dialog {
  padding:12px 16px 16px; border-radius:var(--radius-dialog);
  box-shadow:var(--c-pop-shadow); overflow-y:auto; container-type:inline-size;
}
.cover-head, .cover-tabs, .cover-head-actions, .cover-custom, .cover-position-row {
  display:flex; align-items:center;
}
.cover-head { justify-content:space-between; gap:8px; }
.cover-tabs, .cover-head-actions { gap:3px; }
.cover-tabs button, .cover-head-actions button, .cover-shuffle, .cover-flow {
  min-height:30px; padding:0 9px; border-radius:var(--radius-control);
  font-size:12px; color:var(--c-sub);
}
.cover-tabs .selected { color:var(--c-ink); background:var(--c-active); }
.cover-picker button:hover { background-color:var(--c-hover); color:var(--c-ink); }
.cover-picker button:focus-visible, .cover-picker input:focus-visible { outline:2px solid var(--c-focus); outline-offset:2px; }
.cover-close, .cover-shuffle { display:grid; place-items:center; min-width:30px; }
.cover-preview {
  height:auto; aspect-ratio: 3.12; overflow:hidden; border-radius:var(--radius-surface);
  margin:12px 0; background:var(--c-field);
}
.cover-preview img { width:100%; height:100%; object-fit:cover; }
.cover-shapes { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:2px; background:var(--c-field); border-radius:var(--radius-control); padding:3px; }
.cover-shapes button { min-width:0; padding:0 2px; height:30px; font-size:12px; border-radius:calc(var(--radius-control) - 2px); color:var(--c-sub); }
.cover-shapes button.selected { color:var(--c-ink); background:var(--c-pop); box-shadow:0 1px 3px #0001; }
.cover-swatches { display:grid; grid-template-columns:repeat(8,minmax(0,1fr)); gap:4px; margin:12px 0 6px; }
.cover-swatches button {
  position:relative; min-width:0; height:29px; border-radius:var(--radius-control);
  background-clip:content-box!important; padding:2px;
}
.cover-swatches button.selected::after {
  content:''; position:absolute; inset:0; border-radius:inherit; border:1.5px solid var(--c-ink);
}
.cover-custom { gap:5px; font-size:12px; color:var(--c-sub); }
.cover-custom > span { margin-right:3px; }
.cover-custom input[type=color] {
  width:24px!important; height:26px; margin:0!important; padding:3px!important; border:0!important;
  background:transparent!important; cursor:pointer; appearance:none;
}
.cover-custom input[type=color]::-webkit-color-swatch-wrapper { padding:0; }
.cover-custom input[type=color]::-webkit-color-swatch { border:1px solid #7774; border-radius:5px; }
.cover-shuffle { margin-left:auto; }
.cover-flow { display:flex; align-items:center; gap:6px; padding-inline:5px; }
.cover-switch { width:25px; height:15px; border-radius:99px; background:var(--c-line); position:relative; }
.cover-switch::after {
  content:''; position:absolute; width:11px; height:11px; left:2px; top:2px;
  border-radius:50%; background:var(--c-pop); box-shadow:0 1px 2px #0003;
  transition:transform .15s ease;
}
.cover-switch.on { background:var(--c-ink); }
.cover-switch.on::after { transform:translateX(10px); }
.cover-picker .cover-footer { justify-content:flex-end; margin-top:12px; }
.cover-done { min-height:34px; padding:0 14px; font-size:12px; border-radius:var(--radius-control); color:var(--c-on-accent); background:var(--c-accent); }
.cover-picker .cover-done:hover { color:var(--c-on-accent); background:var(--c-accent-hover); }
.cover-upload { display:grid; justify-items:center; gap:10px; padding:24px 0 8px; }
.cover-upload.has-image { display:flex; padding:8px 0 0; }
.cover-upload>svg { color:var(--c-faint); }
.cover-picker .cover-position-row { display:flex; margin:0; gap:10px; color:var(--c-sub); font-size:12px; }
.cover-position-row input { flex:1; min-width:0; accent-color:var(--c-ink); }
.reader-error { color:var(--c-danger); font-size:12px; }
@media(pointer:coarse){
  .cover-picker button,.cover-actions button{min-height:44px}
  .cover-close,.cover-shuffle,.cover-actions button{min-width:44px}
  .cover-custom input[type=color]{width:44px!important;height:44px;padding:9px!important}
  .cover-swatches{grid-template-columns:repeat(4,minmax(0,1fr))}
  .cover-swatches button{padding:6px 3px}
}
@container(max-width:275px){
  .cover-shapes{grid-template-columns:repeat(3,minmax(0,1fr))}
  .cover-custom{column-gap:2px;flex-wrap:wrap}
}
@media(prefers-reduced-motion:reduce){.cover-switch::after{transition:none}}
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
