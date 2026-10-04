<template><Teleport to="body"><div class="reader-modal-shade" @mousedown.self="$emit('close')"><section ref="dialog" tabindex="-1" class="reader-dialog formula-editor" role="dialog" aria-modal="true" aria-label="编辑公式"><header><h2>公式</h2><button class="btn-icon" aria-label="关闭" @click="$emit('close')"><PhX :size="18"/></button></header><div class="formula-preview" aria-label="公式预览" v-html="preview.html"/><label for="formula-source">公式代码<textarea ref="input" id="formula-source" v-model="draft" spellcheck="false" @keydown.ctrl.enter.prevent="save" @keydown.meta.enter.prevent="save"/></label><p v-if="preview.error" role="status" class="reader-error">公式尚未完整</p><footer><button @click="$emit('close')">取消</button><button class="reader-button" :disabled="!!preview.error||!draft.trim()" @click="save">保存</button></footer></section></div></Teleport></template>
<script setup>
import {ref,computed,onMounted,nextTick} from 'vue'
import katex from 'katex'
import {PhX} from '@phosphor-icons/vue'
import {useDialogFocus} from '../composables/useDialogFocus'
const props=defineProps({value:String}),emit=defineEmits(['close','save'])
const draft=ref(props.value),dialog=ref(null),input=ref(null)
onMounted(()=>nextTick(()=>input.value?.focus()))
const preview=computed(()=>{try{return {html:katex.renderToString(draft.value,{throwOnError:true,trust:false,displayMode:true}),error:false}}catch{return {html:'',error:true}}})
function save(){if(!preview.value.error&&draft.value.trim())emit('save',draft.value)}
useDialogFocus(()=>true,dialog,()=>emit('close'))
</script>
<style scoped>
.formula-editor{width:min(440px,calc(100vw - 32px));display:grid;gap:16px}.formula-editor header,.formula-editor footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.formula-editor h2{font-size:16px;margin:0}.formula-preview{min-height:72px;overflow:auto;display:grid;align-items:center;padding:12px;background:var(--c-field);border-radius:12px}.formula-editor label{font-size:12px;color:var(--c-sub)}.formula-editor textarea{width:100%;min-height:76px;padding:12px;background:var(--c-field);border-radius:10px;font:14px/1.6 var(--font-mono);resize:vertical;color:var(--c-ink)}.formula-editor footer{justify-content:flex-end}.formula-editor button:disabled{opacity:.4}
.reader-dialog.formula-editor header,.reader-dialog.formula-editor footer,.reader-dialog.formula-editor label,.reader-dialog.formula-editor textarea{margin:0}.reader-dialog.formula-editor label{display:grid;gap:8px}
</style>
