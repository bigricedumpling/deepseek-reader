<template><Teleport to="body"><div class="reader-modal-shade" @mousedown.self="$emit('close')"><section ref="dialog" tabindex="-1" class="reader-dialog raw-editor" role="dialog" aria-modal="true" aria-label="编辑内容块"><header><h2>编辑内容块</h2><button class="btn-icon" aria-label="关闭" @click="$emit('close')"><PhX :size="18"/></button></header><textarea v-model="draft" aria-label="内容块源码" spellcheck="false"/><footer><button @click="$emit('close')">取消</button><button class="reader-button" @click="$emit('save',draft)">保存</button></footer></section></div></Teleport></template>
<script setup>
import {ref} from 'vue'
import {PhX} from '@phosphor-icons/vue'
import {useDialogFocus} from '../composables/useDialogFocus'
const props=defineProps({value:String}),emit=defineEmits(['save','close'])
const draft=ref(props.value),dialog=ref(null)
useDialogFocus(()=>true,dialog,()=>emit('close'))
</script>
<style scoped>
.raw-editor{width:min(640px,calc(100vw - 32px));display:flex;flex-direction:column;gap:16px}.raw-editor header,.raw-editor footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.raw-editor h2{font-size:16px;margin:0}.raw-editor textarea{width:100%;min-height:180px;height:40dvh;resize:vertical;padding:12px;background:var(--c-field);border-radius:10px;font:13px/1.7 var(--font-mono);color:var(--c-ink)}.raw-editor footer{justify-content:flex-end}
</style>
