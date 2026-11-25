<template>
  <button class="pop-item" @click="$emit('back')"><PhCaretLeft :size="15" />通过 Agent 分享</button>
  <div class="share-body">
    <fieldset>
      <legend>分享范围</legend>
      <label v-for="option in options" :key="option.value">
        <input v-model="scope" type="radio" :value="option.value" name="agent-share-scope">
        <span><strong>{{ option.label }}</strong><small>{{ option.name }}</small></span>
      </label>
    </fieldset>
    <p>将提示词发给 Agent，由它生成临时只读链接。</p>
    <button class="reader-button primary share-copy" type="button" @click="copy"><PhCopy :size="14" /><span role="status">{{ result === 'copied' ? '已复制提示词' : '复制分享提示词' }}</span></button>
    <template v-if="result === 'manual'">
      <label class="share-manual">请手动复制提示词
        <textarea ref="manual" :value="prompt" readonly rows="4" />
      </label>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { BRAND_NAME } from '../../brand.mjs'
import { sharePrompt } from '../../plugins/reader-workspace/scripts/share-prompt.mjs'
import { PhCaretLeft, PhCopy } from '../icons/remix'
import { API_BASE } from '../utils/api'
import { copyText } from '../utils/clipboard.js'

const props = defineProps({ file: { type:String, required:true }, id:String })
defineEmits(['back'])
const scope = ref('document'), result = ref(''), manual = ref(null)
const library = computed(() => props.file.split('/')[0])
const options = computed(() => [
  { value:'document', label:'当前文档', name:props.file.split('/').at(-1) },
  { value:'library', label:'整个知识库', name:library.value }
])
const source = ['localhost','127.0.0.1','[::1]'].includes(location.hostname) ? location.origin + API_BASE + '/' : ''
const prompt = computed(() => sharePrompt(BRAND_NAME, scope.value === 'document'
  ? { scope:'document', target:props.file, id:props.id || undefined }
  : { scope:'library', target:library.value }, source))
watch([scope, () => props.file], () => { result.value = '' })
async function copy() {
  const text = prompt.value
  const copied = await copyText(text)
  if (prompt.value !== text) return
  result.value = copied ? 'copied' : 'manual'
  if (!copied) {
    await nextTick()
    manual.value?.focus()
    manual.value?.select()
  }
}
</script>

<style scoped>
.share-body { padding:6px 8px 8px; }
fieldset { border:0; margin:0; padding:0; min-width:0; }
legend,.share-body p,.share-manual { font-size:12px; color:var(--c-sub); }
legend { margin:0 0 4px; }
fieldset label { display:flex; align-items:center; gap:9px; padding:7px 8px; border-radius:var(--radius-item); cursor:pointer; }
fieldset label:hover { background:var(--c-hover); }
fieldset label:has(:checked) { background:var(--c-field); }
input { flex:none; accent-color:var(--c-ink); }
label span { min-width:0; }
strong,small { display:block; overflow-wrap:anywhere; }
strong { font-size:13px; font-weight:500; }
small { color:var(--c-sub); font-size:11px; }
.share-body p { margin:10px 0; line-height:1.5; }
.share-copy { width:100%; display:flex; align-items:center; justify-content:center; gap:6px; }
.share-manual { display:block; margin-top:8px; }
textarea { display:block; width:100%; resize:vertical; color:var(--c-ink); }
</style>
