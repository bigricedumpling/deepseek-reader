<template><Teleport to="body"><Transition name="overlay" appear @after-leave="afterLeave"><div v-if="visible" class="reader-modal-shade" @mousedown.self="close"><section ref="dialog" tabindex="-1" class="reader-dialog raw-editor" role="dialog" aria-modal="true" aria-label="编辑内容块"><header><h2>编辑内容块</h2><button class="btn-icon" aria-label="关闭" @click="close"><PhX :size="18"/></button></header><textarea v-model="draft" aria-label="内容块源码" spellcheck="false"/><footer><button @click="close">取消</button><button class="reader-button" @click="save">保存</button></footer></section></div></Transition></Teleport></template>
<script setup>
import {ref} from 'vue'
import {PhX} from '../icons/remix'
import {useDialogFocus} from '../composables/useDialogFocus'
const props=defineProps({value:String}),emit=defineEmits(['save','close'])
const draft=ref(props.value),dialog=ref(null)
const visible=ref(true)
let pendingSave=false
function close(){visible.value=false}
function afterLeave(){ if(pendingSave) emit('save',draft.value); else emit('close') }
function save(){pendingSave=true;visible.value=false}
useDialogFocus(()=>visible.value,dialog,close)
</script>
<style scoped>
.raw-editor{width:min(620px,calc(100vw - 32px));display:flex;flex-direction:column;gap:12px}.raw-editor header,.raw-editor footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.raw-editor h2{font-size:13px!important;margin:0}.raw-editor textarea{width:100%;min-height:180px;height:40dvh;resize:vertical;padding:12px;background:var(--c-field);border-radius:10px;font:13px/1.7 var(--font-mono);color:var(--c-ink)}.raw-editor footer{justify-content:flex-end}
</style>
