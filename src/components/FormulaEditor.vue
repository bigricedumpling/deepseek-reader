<template><Teleport to="body"><Transition name="overlay" appear @after-leave="afterLeave"><div v-if="visible" class="reader-modal-shade" @mousedown.self="close"><section ref="dialog" tabindex="-1" class="reader-dialog formula-editor" role="dialog" aria-modal="true" aria-label="编辑公式"><header><h2>公式</h2><button class="btn-icon" aria-label="关闭" @click="close"><PhX :size="18"/></button></header><div class="formula-preview" aria-label="公式预览" v-html="preview.html"/><label for="formula-source">公式代码<textarea ref="input" id="formula-source" autofocus v-model="draft" spellcheck="false" :aria-invalid="!!preview.error" :aria-describedby="preview.error ? 'formula-error' : undefined" @keydown.ctrl.enter.prevent="save" @keydown.meta.enter.prevent="save"/></label><p v-if="preview.error" id="formula-error" role="status" class="reader-error">{{ preview.error }}</p><footer><button @click="close">取消</button><button class="reader-button" :disabled="!!preview.error||!draft.trim()" @click="save">保存</button></footer></section></div></Transition></Teleport></template>
<script setup>
import {ref,computed,onMounted,nextTick} from 'vue'
import katex from 'katex'
import {PhX} from '../icons/remix'
import {useDialogFocus} from '../composables/useDialogFocus'
const props=defineProps({value:String, display:Boolean}),emit=defineEmits(['close','save'])
const draft=ref(props.value),dialog=ref(null),input=ref(null)
const visible=ref(true)
let pendingSave=false
function close(){visible.value=false}
function afterLeave(){ if(pendingSave) emit('save',draft.value); else emit('close') }
onMounted(()=>nextTick(()=>input.value?.focus()))
const preview = computed(() => {
  try {
    const html = katex.renderToString(draft.value, { throwOnError: true, trust: false, displayMode: props.display })
    return { html, error: '' }
  } catch (cause) {
    const message = cause.rawMessage || ''
    const command = /^Undefined control sequence: (\\\S+)/.exec(message)
    let error = '公式语法有误'
    if (command) error = '无法识别命令 ' + command[1]
    else if (message.includes("expected '}'")) error = '缺少右花括号 }'
    else if (Number.isInteger(cause.position) && cause.position < draft.value.length) {
      const index = Array.from(draft.value.slice(0, cause.position)).length + 1
      error = '第 ' + index + ' 个字符附近有语法错误'
    }
    return { html: '', error }
  }
})
function save(){if(!preview.value.error&&draft.value.trim()){pendingSave=true;visible.value=false}}
useDialogFocus(()=>visible.value,dialog,close)
</script>
<style scoped>
.formula-editor{width:min(420px,calc(100vw - 32px));display:grid;grid-template-columns:minmax(0,1fr);max-height:calc(100dvh - 32px);overflow:auto;gap:12px}.formula-editor header,.formula-editor footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.formula-editor h2{font-size:13px!important;margin:0}.formula-preview{min-width:0;min-height:72px;max-height:35vh;overflow:auto;display:grid;align-items:center;padding:12px;background:var(--c-field);border-radius:12px}.formula-editor label{font-size:12px;color:var(--c-sub)}.formula-editor textarea{width:100%;min-height:76px;padding:12px;background:var(--c-field);border-radius:10px;font:14px/1.6 var(--font-mono);resize:vertical;color:var(--c-ink)}.formula-editor footer{justify-content:flex-end}.formula-editor button:disabled{opacity:.4}
.reader-dialog.formula-editor header,.reader-dialog.formula-editor footer,.reader-dialog.formula-editor label,.reader-dialog.formula-editor textarea{margin:0}.reader-dialog.formula-editor label{display:grid;gap:8px}
</style>
