<template>
  <div class="crepe-host source-reading">
    <div class="milkdown"><article ref="article" class="ProseMirror" /></div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { readingDocument } from '../utils/safe-reading'
import { mermaidCodeBlocks } from '../utils/mermaid'
import { useMermaidPreview } from '../composables/useMermaidPreview'

const props = defineProps({ value: { type: String, default: '' } })
const article = ref(null)
const { watchDiagram } = useMermaidPreview()

watch([article, () => props.value], ([root, source]) => {
  if (!root) return
  root.replaceChildren(readingDocument(source))
  for (const input of root.querySelectorAll('input')) input.disabled = true
  for (const link of root.querySelectorAll('a[target]')) link.rel = 'noopener noreferrer'

  for (const code of mermaidCodeBlocks(root)) {
    const pre = code.parentElement
    let rendered = pre
    watchDiagram(code.textContent, (element, success) => {
      const next = success ? element : document.createElement('div')
      if (!success) next.append(element, pre.cloneNode(true))
      rendered.replaceWith(next)
      rendered = next
    })
  }
}, { flush: 'post' })
</script>

<style scoped>
.source-reading { min-width: 0; overflow-wrap: anywhere; }
.source-reading :deep(img) { max-width: 100%; height: auto; }
.source-reading :deep(pre) { overflow: auto; }
</style>
