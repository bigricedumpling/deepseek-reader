<template>
<section class="page-header" :class="{'has-cover':meta.cover}">
 <div v-if="meta.cover" class="page-cover" :class="[meta.cover.height,{'cover-controls-open':coverControlsOpen}]" @click="onCoverTap">
  <GradientCover v-if="meta.cover.type==='gradient'" :cover="meta.cover" />
  <img v-else :src="API_BASE+'/api/file?asset='+meta.cover.asset" :style="{objectPosition:'center '+meta.cover.position+'%'}" alt="文档封面" />
  <div v-if="!store.currentReadonly" class="cover-actions"><button @click="configure($event)"><PhImage :size="13"/>更换封面</button><button v-if="meta.cover.type==='image'" @click="configure($event,'位置')">调整位置</button><button v-else :disabled="busy" @click="update({cover:randomCover()})" title="随机生成封面"><PhShuffle :size="14"/></button></div>
 </div>
 <div class="page-heading-inner"><div class="page-heading-content">
  <button v-if="meta.icon" class="page-icon" :disabled="store.currentReadonly" title="更换文档图标" @click="iconAnchor=$event.currentTarget;iconOpen=true"><ContentIcon :value="meta.icon" :size="56" /></button>
  <div v-if="!store.currentReadonly&&(!meta.icon||!meta.cover)" class="page-header-controls"><button v-if="!meta.icon" :disabled="busy" @click="update({icon:randomIcon()})"><PhSmiley :size="16"/>添加图标</button><button v-if="!meta.cover" :disabled="busy" @click="update({cover:randomCover()})"><PhImage :size="16"/>添加封面</button></div>
  <p v-if="meta.description" class="page-description">{{meta.description}}</p><p v-if="error&&!settings" class="reader-error">{{error}}</p>
 </div></div>
 <IconPicker v-if="iconOpen" :anchor="iconAnchor" :save="saveIcon" :current="meta.icon || ''" @close="iconOpen=false" />
 <RichBlockDialog :initial="blockDraft" v-if="blockDraft" @close="blockDraft=null" />
 <Teleport to="body"><Transition name="overlay"><div v-if="settings" class="cover-dismiss" @pointerdown.self="closeCover" @keydown.esc="closeCover"><section class="reader-dialog cover-picker" :style="placement" role="dialog" aria-modal="true" aria-label="封面设置">
 <div class="cover-tabs" role="tablist" aria-label="封面来源">
  <button v-for="t in coverTabs" :key="t" :class="{selected:coverTab===t}" :aria-selected="coverTab===t" @click="coverTab=t">{{t}}</button>
  <div class="cover-head-actions">
   <button v-if="meta.cover" class="cover-remove" :disabled="busy" @click="removeCover">移除</button>
   <button class="cover-close" title="关闭" aria-label="关闭" @click="closeCover"><PhX :size="15" /></button>
  </div>
 </div>
 <template v-if="coverTab==='渐变'">
  <div class="cover-preview">
   <GradientCover v-if="draft.type==='gradient'" :cover="draft" />
   <img v-else :src="API_BASE+'/api/file?asset='+draft.asset" :style="{objectPosition:'center '+(draft.position??50)+'%'}" alt="当前封面" />
  </div>
  <div class="cover-swatches"><button v-for="(colors,i) in coverPalettes" :key="i" :class="{selected:draft.type==='gradient'&&sameColors(draft.colors,colors)}" :style="{background:'linear-gradient(120deg,'+colors.join(',')+')'}" :aria-label="'配色 '+(i+1)" @click="pickCoverPalette(colors)" /></div>
  <div class="cover-toolbar">
   <div class="cover-shapes"><button v-for="[id,name] in coverShapes" :key="id" :class="{selected:draft.preset===id}" @click="pickCoverStyle(id)">{{name}}</button></div>
   <button class="cover-shuffle" @click="shuffleCover"><PhShuffle :size="14" />随机</button>
  </div>
  <div v-if="draft.type==='gradient'" class="cover-custom">
   <span>颜色</span>
   <input v-for="(_,i) in (draft.colors||previewDefault.colors)" :key="i" :value="draft.colors?.[i]||previewDefault.colors[i]" type="color" :aria-label="'颜色 '+(i+1)" @input="pickCoverColor(i,$event)" />
   <button class="cover-flow" role="switch" :aria-checked="!!draft.animated" @click="toggleCoverFlow"><span>流动</span><span class="cover-switch" :class="{on:draft.animated}" /></button>
  </div>
 </template>
 <div v-else-if="coverTab==='上传'" class="cover-upload"><PhImage :size="30" /><label class="reader-button">选择图片<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden @change="upload" /></label><p>图片会保存在知识库中，最大 10 MB</p></div>
 <div v-else class="cover-position">
  <div class="cover-preview image-preview"><img :src="API_BASE+'/api/file?asset='+draft.asset" :style="{objectPosition:'center '+draft.position+'%'}" alt="封面预览" /></div>
  <div class="cover-position-row"><span>上下位置</span><input type="range" min="0" max="100" :value="draft.position" @input="pickCoverPosition($event)" /></div>
 </div>
 <p v-if="error" class="reader-error">{{error}}</p>
</section></div></Transition></Teleport>
</section>
</template>
<script setup>
import {ref,computed,watch,onMounted,onBeforeUnmount} from 'vue'
import {PhImage,PhShuffle,PhSmiley,PhX} from '../icons/remix'
import {useDocsStore} from '../stores/docs'
import {API_BASE} from '../utils/api'
import {randomIcon} from '../utils/icon-catalog'
import {randomCover,coverPalettes,coverShapes} from '../utils/cover-presets'
import ContentIcon from './ContentIcon.vue'
import IconPicker from './IconPicker.vue'
import GradientCover from './GradientCover.vue'
import RichBlockDialog from './RichBlockDialog.vue'
const store=useDocsStore(),meta=computed(()=>store.pageMeta),iconOpen=ref(false),iconAnchor=ref(null),settings=ref(false),draft=ref({}),error=ref(''),busy=ref(false),coverTab=ref('渐变'),placement=ref({}),blockDraft=ref(null),previewDefault=randomCover(),coverControlsOpen=ref(false)
const coverTabs=computed(()=>['渐变','上传',...(draft.value.type==='image'?['位置']:[])])
function editBlock(e){if(e.detail.path===store.currentPath&&!store.currentReadonly)blockDraft.value=e.detail}
onMounted(()=>window.addEventListener('reader-edit-block',editBlock));onBeforeUnmount(()=>window.removeEventListener('reader-edit-block',editBlock))
watch(()=>store.currentPath,()=>{clearTimeout(coverTimer);coverTimer=0;coverDocPath='';settings.value=false;iconOpen.value=false;blockDraft.value=null;coverControlsOpen.value=false;error.value=''})
function onCoverTap(event){if(event.target.closest('.cover-actions'))return;if(matchMedia('(hover:none)').matches)coverControlsOpen.value=!coverControlsOpen.value}
async function update(patch){if(busy.value)return false;busy.value=true;error.value='';try{await store.savePageMeta(patch);return true}catch(e){error.value=e.message;return false}finally{busy.value=false}}
async function saveIcon(icon){if(!(await update({icon})))throw Error(error.value)}
let coverTimer = 0
let coverChain = Promise.resolve()
let coverDocPath = ''

function queueCoverSave(delay = 140) {
  clearTimeout(coverTimer)
  coverTimer = window.setTimeout(flushCoverSave, delay)
}

function flushCoverSave() {
  clearTimeout(coverTimer)
  coverTimer = 0
  if (!coverDocPath || coverDocPath !== store.currentPath || !draft.value?.type) return
  const snapshot = JSON.parse(JSON.stringify(draft.value))
  coverChain = coverChain
    .then(() => store.savePageMeta({ cover: snapshot }))
    .then(() => { if (settings.value) error.value = '' })
    .catch(e => { error.value = e.message || String(e) })
}

function closeCover() {
  flushCoverSave()
  settings.value = false
}

async function removeCover() {
  clearTimeout(coverTimer)
  coverTimer = 0
  const path = coverDocPath || store.currentPath
  settings.value = false
  coverChain = coverChain
    .then(() => store.currentPath === path ? store.savePageMeta({ cover: null }) : undefined)
    .then(() => { error.value = '' })
    .catch(e => { error.value = e.message || String(e) })
}

async function configure(e, tab = '渐变') {
  // 必须先把 rect 取出来：await 之后事件对象的 currentTarget 会变成 null。
  const r = e.currentTarget?.getBoundingClientRect?.()
  await coverChain.catch(() => {})
  clearTimeout(coverTimer)
  coverTimer = 0
  if (!r) return
  const w = Math.min(520, innerWidth - 24)
  const estimated = Math.min(560, innerHeight - 24)
  const natural = r.bottom + 10
  const top = Math.max(12, Math.min(natural, innerHeight - estimated - 12))
  placement.value = { position: 'fixed', width: w + 'px', right: Math.max(12, innerWidth - r.right) + 'px', top: top + 'px', maxHeight: 'calc(100dvh - 24px)' }
  coverDocPath = store.currentPath
  draft.value = JSON.parse(JSON.stringify(meta.value.cover || randomCover()))
  coverTab.value = tab !== '渐变' ? tab : (draft.value.type === 'image' ? '位置' : '渐变')
  error.value = ''
  settings.value = true
}

function ensureGradient() { if (draft.value.type !== 'gradient') draft.value = randomCover() }
function sameColors(a, b) { return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]) }

function pickCoverPalette(colors) {
  ensureGradient()
  draft.value.colors = [...colors]
  queueCoverSave()
}
function pickCoverStyle(id) {
  ensureGradient()
  draft.value.preset = id
  queueCoverSave()
}
function shuffleCover() {
  draft.value = randomCover()
  queueCoverSave(0)
}
function pickCoverColor(i, event) {
  ensureGradient()
  if (!Array.isArray(draft.value.colors)) draft.value.colors = [...(previewDefault.colors || [])]
  draft.value.colors[i] = event.target.value
  queueCoverSave(80)
}
function toggleCoverFlow() {
  if (draft.value.type !== 'gradient') return
  draft.value.animated = !draft.value.animated
  queueCoverSave(0)
}
function pickCoverPosition(event) {
  draft.value.position = Number(event.target.value)
  queueCoverSave(60)
}

async function upload(e) {
  const file = e.target.files?.[0]
  if (!file || busy.value) return
  busy.value = true
  error.value = ''
  const docPath = store.currentPath
  try {
    if (file.size > 10 * 1024 * 1024) throw Error('图片不能超过 10 MB')
    const data = await new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result)
      fr.onerror = reject
      fr.readAsDataURL(file)
    })
    const res = await fetch(API_BASE + '/api/asset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: docPath, mime: file.type, base64: String(data).split(',')[1] }) })
    const out = await res.json()
    if (!out.ok) throw Error(out.error)
    if (docPath !== store.currentPath) return
    draft.value = { type: 'image', asset: out.data.id, position: 50, height: draft.value.height || 'medium' }
    coverTab.value = '位置'
    queueCoverSave(0)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>
<style scoped>
.page-header{padding-top:16px}.page-header.has-cover{padding-top:0}.page-cover{position:relative;height:240px;overflow:hidden;margin:0;border-radius:0}.page-cover.small{height:160px}.page-cover.large{height:330px}.page-cover>img{width:100%;height:100%;object-fit:cover}.page-heading-inner{padding:0 64px}.page-heading-content{max-width:var(--measure);margin:auto}.page-icon{display:block;margin:18px 0 2px;padding:4px 0}.has-cover .page-icon{margin-top:-28px;position:relative;filter:drop-shadow(0 1px 3px #fff8)}.page-description{margin-top:14px;color:var(--c-sub);font-size:14px;line-height:1.7}.page-header-controls{display:flex;gap:20px;margin:8px 0 0;font:13px var(--font-sans);color:var(--c-faint)}.page-header-controls button,.cover-actions button,.cover-shuffle{display:flex;align-items:center;gap:6px}.page-header-controls button:hover{color:var(--c-ink)}.cover-actions{position:absolute;right:14px;bottom:14px;display:flex;gap:2px;opacity:0;pointer-events:none;transition:opacity var(--motion-enter) ease;background:color-mix(in srgb,var(--c-pop) 76%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid color-mix(in srgb,var(--c-line) 48%,transparent);border-radius:14px;padding:2px}.page-cover:focus-within .cover-actions{opacity:1;pointer-events:auto}@media(hover:hover){.page-cover:hover .cover-actions{opacity:1;pointer-events:auto}}@media(hover:none){.page-cover.cover-controls-open .cover-actions{opacity:1;pointer-events:auto}}.cover-actions button{padding:4px 7px;font-size:11.5px;gap:5px;line-height:1.2}.cover-dismiss{position:fixed;inset:0;z-index:2100}.cover-picker{padding:18px;border:0;box-shadow:var(--c-pop-shadow);max-height:calc(100dvh - 24px)}.cover-tabs{display:flex;gap:20px}.cover-tabs button,.cover-remove{font-size:13px!important;color:var(--c-faint)}.cover-tabs .selected{font-weight:600;color:var(--c-ink)}.cover-preview{height:130px;border-radius:var(--radius-surface);overflow:hidden}.cover-preview img{width:100%;height:100%;object-fit:cover}.cover-toolbar{display:flex;align-items:center;justify-content:space-between;margin:12px 0}.cover-shapes{display:flex;gap:4px}.cover-shapes button{padding:5px 9px;border-radius:var(--radius-control);color:var(--c-sub)}.cover-shapes .selected{background:var(--c-field);color:var(--c-ink)}.cover-swatches{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.cover-swatches button{height:40px;border-radius:var(--radius-control)}.cover-custom{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:12px;color:var(--c-sub)}.cover-custom input[type=color]{width:24px!important;height:24px;padding:0!important;margin:0!important;border:0!important}.cover-custom label{margin-left:auto}.cover-picker footer{justify-content:space-between}.height-control{display:flex!important;align-items:center;gap:10px;margin:0!important}.height-control select{width:70px!important;margin:0!important;border:0!important}.cover-upload{display:flex;flex-direction:column;align-items:center;padding:30px 0}.image-preview{height:180px}.cover-picker input[type=range]{width:100%;display:block;margin-top:10px}.reader-error{color:#c94c4c;font-size:12px}@media(max-width:720px){.page-cover{margin:0;height:180px}.page-cover.large{height:250px}.page-heading-inner{padding-inline:18px}.cover-picker{right:12px!important}.page-icon{margin-top:20px}}@media(max-width:480px){.page-heading-inner{padding-inline:14px}}@media print{.page-header-controls,.cover-actions{display:none}.page-cover{break-inside:avoid}}
</style>

<style scoped>.cover-tabs button{padding:6px 12px!important;border-radius:var(--radius-surface);font-weight:400!important}.cover-tabs .selected{background:var(--c-field);font-weight:400}.cover-tabs button:hover,.cover-actions button:hover{background:var(--c-hover)}.cover-shapes .selected{font-weight:400}.cover-shuffle{padding:6px 10px;background:var(--c-field);border-radius:var(--radius-surface)}.cover-shuffle:hover{background:var(--c-chip-hover)}.cover-picker{border:1px solid var(--c-line)}</style>


<style scoped>
.cover-picker.reader-dialog{padding:0 20px 16px;border:1px solid var(--c-line);border-radius:20px!important;max-height:calc(100dvh - 24px)}
.cover-tabs{display:flex;align-items:center;gap:18px;margin:0 -20px 0;padding:0 20px;border-bottom:1px solid var(--c-line)}
.cover-tabs button{position:relative;padding:14px 0 10px!important;border-radius:0!important;background:transparent!important;color:var(--c-sub)!important;font-size:13px;white-space:nowrap;transition:color 160ms ease}
.cover-tabs button::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--c-ink);transform:scaleX(0);transform-origin:left;transition:transform 220ms var(--motion-pop)}
.cover-tabs button.selected{color:var(--c-ink)!important;background:transparent!important;font-weight:400!important;box-shadow:none!important}
.cover-tabs button.selected::after{transform:scaleX(1)}
.cover-tabs button:hover{color:var(--c-ink)}
.cover-tabs .cover-remove{margin-left:auto;padding-right:2px!important;color:var(--c-sub)!important;font-size:11.5px!important}
.cover-tabs .cover-remove::after{display:none}
.cover-tabs .cover-remove:hover{color:var(--c-ink)!important}
.cover-preview{height:160px;margin-top:14px;border-radius:12px}
.cover-section{margin:14px 0 8px;color:var(--c-sub);font-size:11px;line-height:1.4}
.cover-swatches{grid-template-columns:repeat(4,1fr);gap:10px}
.cover-swatches button{height:56px;border-radius:10px;position:relative;transition:box-shadow 180ms var(--motion-snap),transform 160ms var(--motion-snap)}
.cover-swatches button:hover{transform:scale(1.015)}
.cover-swatches button:active{transform:scale(.99)}
.cover-swatches button.selected{box-shadow:inset 0 0 0 2px var(--c-pop),0 0 0 2px var(--c-ink)}
.cover-toolbar{display:flex;align-items:center;gap:10px;margin:0 0 2px}
.cover-shapes{display:flex;gap:3px;padding:3px;background:var(--c-field);border-radius:10px}
.cover-shapes button{height:28px;padding:0 10px;border-radius:7px;font-size:11.5px;color:var(--c-sub)}
.cover-shapes button:hover{color:var(--c-ink)}
.cover-shapes button.selected{background:var(--c-pop);color:var(--c-ink);font-weight:400}
.cover-shuffle{display:flex;align-items:center;gap:5px;height:34px;padding:0 10px;border:1px solid var(--c-line);border-radius:9px;background:transparent!important;color:var(--c-sub);font-size:11.5px;margin-left:auto}
.cover-shuffle:hover{background:var(--c-hover);color:var(--c-ink)}
.cover-custom{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--c-sub)}
.cover-custom input[type=color]{width:22px!important;height:22px;border-radius:6px;overflow:hidden;cursor:pointer}
.cover-flow{display:flex;align-items:center;gap:7px;margin-left:auto;padding:3px 4px;border-radius:7px;color:var(--c-sub);font-size:11.5px}
.cover-flow:hover{color:var(--c-ink)}
.cover-switch{width:24px;height:14px;border-radius:999px;background:var(--c-line);position:relative;flex:none}
.cover-switch::after{content:'';position:absolute;width:10px;height:10px;left:2px;top:2px;border-radius:50%;background:var(--c-pop);box-shadow:0 1px 2px #0002;transition:left .15s ease}
.cover-switch.on{background:var(--c-accent)}.cover-switch.on::after{left:12px}
.cover-footer{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin:16px -20px 0;padding:12px 20px 0;border-top:1px solid var(--c-line)}
.cover-footer-actions{display:flex;align-items:center;gap:10px}
.cover-done{height:34px;padding:0 14px;border-radius:9px;background:var(--c-accent);color:var(--c-on-accent);font-size:12px}
.cover-done:hover:not(:disabled){background:var(--c-accent-hover)}
.cover-done:disabled{opacity:.5;cursor:default}
.height-control{display:flex!important;align-items:center;gap:8px;margin:0!important;font-size:11.5px;color:var(--c-sub)}
.height-control select{width:64px!important;height:34px;padding:0 8px!important;border:1px solid var(--c-line)!important;border-radius:8px!important;background:var(--c-field)!important;color:var(--c-ink)!important;font-size:11.5px}
.cover-picker input[type=range]{width:100%;display:block;margin-top:4px;accent-color:var(--c-ink)}
.cover-upload{display:flex;flex-direction:column;align-items:center;padding:30px 0}
.cover-upload>svg{margin:auto;color:var(--c-faint)}
.image-preview{height:220px}
@media(max-width:640px){.cover-picker{left:12px!important;right:12px!important;width:auto!important;top:58px!important;padding:0 16px 14px}.cover-tabs{gap:14px;margin:0 -16px;padding:0 16px}.cover-tabs button{font-size:12.5px}.cover-tabs .cover-remove{font-size:11px}.cover-preview{height:130px}.cover-swatches{grid-template-columns:repeat(4,1fr);gap:8px}.cover-swatches button{height:48px}.cover-footer{margin:16px -16px 0;padding:12px 16px 0}.image-preview{height:180px}}
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
  .page-header:has(+ .editor-shell .src-editor) .page-header-controls,
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
.cover-actions { transform: translateY(4px) scale(.985); transition: opacity var(--motion-enter) ease, transform var(--motion-enter) var(--motion-ease); }
.page-cover:focus-within .cover-actions,
.page-cover.cover-controls-open .cover-actions { transform: none; }
@media (hover: hover) { .page-cover:hover .cover-actions { transform: none; } }
@media (prefers-reduced-motion: reduce) { .cover-actions { transition: none; transform: none; } }
</style>

<style scoped>
/* 紧凑的实时封面编辑器 */
.cover-picker.reader-dialog { padding: 0 16px 12px; border-radius: 18px !important; overflow-y: auto; }
.cover-tabs { gap: 16px; margin: 0 -16px; padding: 0 16px; }
.cover-tabs button { padding: 12px 0 8px !important; font-size: 12.5px; }
.cover-head-actions { margin-left: auto; display: flex; align-items: center; gap: 2px; }
.cover-tabs .cover-remove { margin-left: 0; padding: 0 6px !important; font-size: 11px !important; }
.cover-tabs .cover-close { display: grid; place-items: center; width: 26px; height: 26px; padding: 0 !important; border-radius: 7px !important; color: var(--c-faint) !important; }
.cover-tabs .cover-close::after { display: none; }
.cover-tabs .cover-close:hover { background: var(--c-hover); color: var(--c-ink) !important; }
.cover-preview { height: 104px; margin-top: 12px; border-radius: 10px; }
.image-preview { height: 124px; }
.cover-swatches { gap: 6px; }
.cover-swatches button { height: 34px; border-radius: 8px; }
.cover-swatches button:hover { transform: none; }
.cover-swatches button.selected { box-shadow: inset 0 0 0 1px var(--c-pop), 0 0 0 1.5px color-mix(in srgb, var(--c-ink) 45%, transparent); }
.cover-toolbar { margin: 8px 0 10px; gap: 8px; }
.cover-shapes { gap: 2px; padding: 2px; border-radius: 9px; }
.cover-shapes button { height: 26px; padding: 0 9px; border-radius: 6px; font-size: 11px; }
.cover-shuffle { height: 28px; padding: 0 8px; border-radius: 8px; font-size: 11px; }
.cover-custom { margin-top: 0; gap: 6px; font-size: 11px; }
.cover-custom input[type=color] { width: 20px !important; height: 20px; border-radius: 5px; }
.cover-flow { gap: 6px; font-size: 11px; padding: 2px 3px; }
.cover-switch { width: 22px; height: 13px; }
.cover-switch::after { width: 9px; height: 9px; left: 2px; top: 2px; }
.cover-switch.on::after { left: 11px; }
.cover-upload { padding: 18px 0; gap: 6px; }
.cover-position { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.cover-position-row { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--c-sub); }
.cover-position-row input[type=range] { flex: 1; min-width: 0; margin: 0; }
.cover-picker .reader-error { margin: 6px 0 0; }
</style>
