<template>
<section class="page-header" :class="{'has-cover':meta.cover}">
 <div v-if="meta.cover" class="page-cover" :class="meta.cover.height">
  <GradientCover v-if="meta.cover.type==='gradient'" :cover="meta.cover" />
  <img v-else :src="API_BASE+'/api/file?asset='+meta.cover.asset" :style="{objectPosition:'center '+meta.cover.position+'%'}" alt="文档封面" />
  <div v-if="!store.currentReadonly" class="cover-actions"><button @click="configure($event)"><PhImage :size="14"/>更换封面</button><button v-if="meta.cover.type==='image'" @click="configure($event,'位置')">调整位置</button><button v-else :disabled="busy" @click="update({cover:randomCover()})" title="随机生成封面"><PhShuffle :size="16"/></button></div>
 </div>
 <div class="page-heading-inner"><div class="page-heading-content">
  <button v-if="meta.icon" class="page-icon" :disabled="store.currentReadonly" title="更换文档图标" @click="iconAnchor=$event.currentTarget;iconOpen=true"><ContentIcon :value="meta.icon" :size="56" /></button>
  <div v-if="!store.currentReadonly&&(!meta.icon||!meta.cover)" class="page-header-controls"><button v-if="!meta.icon" :disabled="busy" @click="update({icon:randomIcon()})"><PhSmiley :size="16"/>添加图标</button><button v-if="!meta.cover" :disabled="busy" @click="update({cover:randomCover()})"><PhImage :size="16"/>添加封面</button></div>
  <p v-if="meta.description" class="page-description">{{meta.description}}</p><p v-if="error&&!settings" class="reader-error">{{error}}</p>
 </div></div>
 <IconPicker v-if="iconOpen" :anchor="iconAnchor" :save="saveIcon" @close="iconOpen=false" />
 <RichBlockDialog :initial="blockDraft" v-if="blockDraft" @close="blockDraft=null" />
 <Teleport to="body"><Transition name="overlay"><div v-if="settings" class="cover-dismiss" @pointerdown.self="settings=false" @keydown.esc="settings=false"><section class="reader-dialog cover-picker" :style="placement" role="dialog" aria-modal="true" aria-label="更换封面">
 <header><div class="cover-tabs"><button v-for="t in ['渐变','上传',...(draft.type==='image'?['位置']:[])]" :key="t" :class="{selected:coverTab===t}" @click="coverTab=t">{{t}}</button></div><button class="cover-remove" :disabled="busy" @click="remove">移除</button></header>
 <template v-if="coverTab==='渐变'"><div class="cover-preview"><GradientCover :cover="draft.type==='gradient'?draft:previewDefault"/></div><div class="cover-toolbar"><div class="cover-shapes"><button v-for="[id,name] in coverShapes" :key="id" :class="{selected:draft.preset===id}" @click="ensureGradient();draft.preset=id">{{name}}</button></div><button class="cover-shuffle" @click="draft=randomCover()"><PhShuffle :size="17"/>随机</button></div>
 <div class="cover-swatches"><button v-for="(colors,i) in coverPalettes" :key="i" :style="{background:'linear-gradient(120deg,'+colors.join(',')+')'}" :aria-label="'配色 '+(i+1)" @click="ensureGradient();draft.colors=[...colors]"/></div>
 <div class="cover-custom"><span>自定义颜色</span><input v-for="(_,i) in (draft.colors||previewDefault.colors)" :key="i" :value="draft.colors?.[i]||previewDefault.colors[i]" type="color" :aria-label="'颜色 '+(i+1)" @input="ensureGradient();draft.colors[i]=$event.target.value"/><label><input type="checkbox" v-model="draft.animated"/>流动</label></div></template>
 <div v-else-if="coverTab==='上传'" class="cover-upload"><PhImage :size="34"/><label class="reader-button">选择图片<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden @change="upload"/></label><p>图片会保存在知识库中，最大 10 MB</p></div>
 <div v-else><div class="cover-preview image-preview"><img :src="API_BASE+'/api/file?asset='+draft.asset" :style="{objectPosition:'center '+draft.position+'%'}"/></div><label>上下位置<input type="range" min="0" max="100" v-model.number="draft.position"/></label></div>
 <footer><label class="height-control">高度<select v-model="draft.height"><option value="small">低</option><option value="medium">中</option><option value="large">高</option></select></label><button class="reader-button" :disabled="busy" @click="save">完成</button></footer><p v-if="error" class="reader-error">{{error}}</p>
 </section></div></Transition></Teleport>
</section>
</template>
<script setup>
import {ref,computed,watch,onMounted,onBeforeUnmount} from 'vue'
import {PhImage,PhShuffle,PhSmiley} from '@phosphor-icons/vue'
import {useDocsStore} from '../stores/docs'
import {API_BASE} from '../utils/api'
import {randomIcon} from '../utils/icon-catalog'
import {randomCover,coverPalettes,coverShapes} from '../utils/cover-presets'
import ContentIcon from './ContentIcon.vue'
import IconPicker from './IconPicker.vue'
import GradientCover from './GradientCover.vue'
import RichBlockDialog from './RichBlockDialog.vue'
const store=useDocsStore(),meta=computed(()=>store.pageMeta),iconOpen=ref(false),iconAnchor=ref(null),settings=ref(false),draft=ref({}),error=ref(''),busy=ref(false),coverTab=ref('渐变'),placement=ref({}),blockDraft=ref(null),previewDefault=randomCover()
function editBlock(e){if(e.detail.path===store.currentPath&&!store.currentReadonly)blockDraft.value=e.detail}
onMounted(()=>window.addEventListener('reader-edit-block',editBlock));onBeforeUnmount(()=>window.removeEventListener('reader-edit-block',editBlock))
watch(()=>store.currentPath,()=>{settings.value=false;iconOpen.value=false;blockDraft.value=null;error.value=''})
async function update(patch){if(busy.value)return false;busy.value=true;error.value='';try{await store.savePageMeta(patch);return true}catch(e){error.value=e.message;return false}finally{busy.value=false}}
async function saveIcon(icon){if(!(await update({icon})))throw Error(error.value)}
function configure(e,tab='渐变'){const r=e.currentTarget.getBoundingClientRect(),w=Math.min(430,innerWidth-24);placement.value={position:'fixed',width:w+'px',right:Math.max(12,innerWidth-r.right)+'px',top:Math.max(12,Math.min(r.bottom+10,innerHeight-540))+'px'};draft.value=JSON.parse(JSON.stringify(meta.value.cover||randomCover()));coverTab.value=tab;error.value='';settings.value=true}
function ensureGradient(){if(draft.value.type!=='gradient')draft.value=randomCover()}
async function save(){if(await update({cover:draft.value}))settings.value=false}
async function remove(){if(await update({cover:null}))settings.value=false}
async function upload(e){const file=e.target.files?.[0];if(!file||busy.value)return;busy.value=true;error.value='';const docPath=store.currentPath;try{if(file.size>10*1024*1024)throw Error('图片不能超过 10 MB');const data=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(file)});const res=await fetch(API_BASE+'/api/asset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:docPath,mime:file.type,base64:String(data).split(',')[1]})});const out=await res.json();if(!out.ok)throw Error(out.error);if(docPath!==store.currentPath)return;draft.value={type:'image',asset:out.data.id,position:50,height:draft.value.height||'medium'};coverTab.value='位置'}catch(e){error.value=e.message}finally{busy.value=false}}
</script>
<style scoped>
.page-header{padding-top:16px}.page-header.has-cover{padding-top:0}.page-cover{position:relative;height:240px;overflow:hidden;margin:0;border-radius:0}.page-cover.small{height:160px}.page-cover.large{height:330px}.page-cover>img{width:100%;height:100%;object-fit:cover}.page-heading-inner{padding:0 64px}.page-heading-content{max-width:var(--measure);margin:auto}.page-icon{display:block;margin:26px 0 8px;padding:4px 0}.has-cover .page-icon{margin-top:-28px;position:relative;filter:drop-shadow(0 1px 3px #fff8)}.page-description{margin-top:14px;color:var(--c-sub);font-size:14px;line-height:1.7}.page-header-controls{display:flex;gap:20px;margin:22px 0 4px;font:13px var(--font-sans);color:var(--c-faint)}.page-header-controls button,.cover-actions button,.cover-shuffle{display:flex;align-items:center;gap:6px}.page-header-controls button:hover{color:var(--c-ink)}.cover-actions{position:absolute;right:16px;bottom:16px;display:flex;gap:4px;opacity:0;transition:opacity .15s;background:var(--c-pop);border-radius:var(--radius-control);padding:3px}.page-cover:hover .cover-actions,.page-cover:focus-within .cover-actions{opacity:1}.cover-actions button{padding:5px 8px;font-size:12px}.cover-dismiss{position:fixed;inset:0;z-index:2100}.cover-picker{padding:18px;border:0;box-shadow:0 8px 40px #0002;max-height:calc(100dvh - 24px)}.cover-tabs{display:flex;gap:20px}.cover-tabs button,.cover-remove{font-size:13px!important;color:var(--c-faint)}.cover-tabs .selected{font-weight:600;color:var(--c-ink)}.cover-preview{height:130px;border-radius:var(--radius-surface);overflow:hidden}.cover-preview img{width:100%;height:100%;object-fit:cover}.cover-toolbar{display:flex;align-items:center;justify-content:space-between;margin:12px 0}.cover-shapes{display:flex;gap:4px}.cover-shapes button{padding:5px 9px;border-radius:var(--radius-control);color:var(--c-sub)}.cover-shapes .selected{background:var(--c-field);color:var(--c-ink)}.cover-swatches{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.cover-swatches button{height:40px;border-radius:var(--radius-control)}.cover-custom{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:12px;color:var(--c-sub)}.cover-custom input[type=color]{width:24px!important;height:24px;padding:0!important;margin:0!important;border:0!important}.cover-custom label{margin-left:auto}.cover-picker footer{justify-content:space-between}.height-control{display:flex!important;align-items:center;gap:10px;margin:0!important}.height-control select{width:70px!important;margin:0!important;border:0!important}.cover-upload{display:flex;flex-direction:column;align-items:center;padding:30px 0}.image-preview{height:180px}.cover-picker input[type=range]{width:100%;display:block;margin-top:10px}.reader-error{color:#c94c4c;font-size:12px}@media(max-width:720px){.page-cover{margin:0;height:180px}.page-cover.large{height:250px}.page-heading-inner{padding-inline:18px}.cover-actions{opacity:1}.cover-picker{right:12px!important}.page-icon{margin-top:20px}}@media(max-width:480px){.page-heading-inner{padding-inline:14px}}@media print{.page-header-controls,.cover-actions{display:none}.page-cover{break-inside:avoid}}
</style>

<style scoped>.cover-tabs button{padding:6px 12px!important;border-radius:var(--radius-surface);font-weight:400!important}.cover-tabs .selected{background:var(--c-field)}.cover-tabs button:hover,.cover-actions button:hover{background:var(--c-hover)}.cover-shapes .selected{font-weight:400}.cover-shuffle{padding:6px 10px;background:var(--c-field);border-radius:var(--radius-surface)}.cover-shuffle:hover{background:var(--c-chip-hover)}</style>

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
