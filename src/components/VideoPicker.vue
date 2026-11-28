<template>
  <form class="image-edit reader-video-picker" aria-label="插入视频" @submit.prevent="insertLink" @keydown.esc.stop.prevent="close">
    <span class="image-icon"><PhVideoCamera :size="22" /></span>
    <div class="link-importer">
      <input v-model="url" class="link-input-area" type="text" placeholder="输入视频链接" aria-label="视频地址" :disabled="busy" />
    </div>
    <input ref="input" class="hidden" type="file" :accept="videoAccept" @change="onFile" />
    <button type="button" class="reader-video-upload" :disabled="busy" @click="input.click()">{{ busy ? '正在上传…' : '上传视频' }}</button>
    <button v-if="url.trim()" class="confirm" :disabled="busy">插入</button>
    <button type="button" class="btn-icon" aria-label="关闭视频选择" :disabled="busy" @click="close"><PhX :size="16" /></button>
  </form>
  <p v-if="error" class="reader-error" role="alert">{{ error }}</p>
</template>

<script setup>
import { ref } from 'vue'
import { PhVideoCamera, PhX } from '../icons/remix'
import { playableVideoUrl, videoAccept } from '../utils/video-format.js'

const props = defineProps({ upload: Function })
const emit = defineEmits(['pick', 'close'])
const input = ref(null)
const busy = ref(false)
const error = ref('')
const url = ref('')

function close() {
  if (!busy.value) emit('close')
}

function insertLink() {
  const source = url.value.trim()
  if (!playableVideoUrl(source)) {
    error.value = '请输入有效的视频地址'
    return
  }
  emit('pick', source)
}

async function onFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  error.value = ''
  busy.value = true
  try { emit('pick', await props.upload(file)) }
  catch (e) { error.value = e.message || '视频上传失败' }
  finally { busy.value = false }
}
</script>
