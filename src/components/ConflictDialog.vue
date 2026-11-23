<template><Teleport to="body"><Transition name="overlay"><div v-if="store.conflict" class="reader-modal-shade"><section ref="dialog" tabindex="-1" class="reader-dialog conflict-dialog" role="dialog" aria-modal="true" aria-label="保存冲突"><header><b>这篇文档有另一份修改</b></header><p>磁盘内容已被其他窗口或 Agent 更新。你的编辑还保留在这里，尚未覆盖另一份。</p><div class="conflict-columns"><label>你的修改<textarea readonly :value="store.conflict.local" /></label><label>磁盘上的版本<textarea readonly :value="store.conflict.remote" /></label></div><label v-if="merging">合并结果<textarea v-model="merged" :disabled="busy" class="merged-text" /></label><p v-if="error" class="reader-error">{{error}}</p><p v-if="discarding">将放弃这里尚未保存的修改。你也可以先另存为副本。</p><footer><button v-if="!discarding" :disabled="busy" @click="discarding=true">使用磁盘版本</button><button v-else :disabled="busy" @click="resolve('remote')">放弃我的修改，使用磁盘版本</button><button v-if="discarding" @click="discarding=false">取消</button><button :disabled="busy" @click="resolve('copy')">将我的修改另存为副本</button><button v-if="!merging" :disabled="busy" @click="startMerge">手动合并</button><button v-else class="reader-button" :disabled="busy" @click="resolve('merge')">保存合并结果</button></footer></section></div></Transition></Teleport></template>
<script setup>
import {ref,watch} from 'vue'
import { useDialogFocus } from '../composables/useDialogFocus'
import {useDocsStore} from '../stores/docs'
const store=useDocsStore(),merged=ref(''),merging=ref(false),busy=ref(false),error=ref('')
const dialog=ref(null),discarding=ref(false)
useDialogFocus(() => !!store.conflict, dialog)
const mergeBase = ref('')
function startMerge() {
  mergeBase.value = store.conflict.local
  merged.value = mergeBase.value
  merging.value = true
}
watch(() => store.conflict, () => {
  discarding.value = false
  merging.value = false
  error.value = ''
}, { immediate: true })
watch(() => store.conflict?.local, local => {
  if (merging.value && local !== undefined && merged.value === mergeBase.value) {
    merged.value = local
    mergeBase.value = local
  }
})
async function resolve(mode) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await store.resolveConflict(mode, merged.value, mergeBase.value)
  } catch (e) {
    error.value = e.message
    // Leave the hand-edited merge intact and require a fresh confirmation.
    if (store.conflict) mergeBase.value = store.conflict.local
  } finally {
    busy.value = false
  }
}
</script>
<style scoped>.conflict-dialog{width:min(850px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto}.conflict-dialog footer{flex-wrap:wrap;gap:8px}.conflict-columns{display:grid;grid-template-columns:1fr 1fr;gap:16px}.conflict-columns textarea{height:230px;font-family:monospace;font-size:12px}.merged-text{height:180px}@media(max-width:600px){.conflict-columns{grid-template-columns:1fr}.conflict-columns textarea{height:130px}}</style>
