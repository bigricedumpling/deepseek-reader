import { onWatcherCleanup, watch } from 'vue'
import { useReaderStore } from '../stores/reader'
import { isMermaidLanguage, mermaidSourceKey, renderMermaidSvg } from '../utils/mermaid.js'

export function useMermaidPreview() {
  const reader = useReaderStore()

  // A native CodeMirror preview and a read-only fence each own their watcher.
  // Invalidate pending work when the source, language, theme or owning block changes.
  function watchDiagram(source, apply) {
    const stop = watch(
      [() => reader.resolvedTheme, () => reader.documentStyle],
      (_, __, onCleanup) => {
        let current = true
        const timer = setTimeout(async () => {
          const svg = await renderMermaidSvg(source)
          if (!current) return
          if (!svg) {
            const message = document.createElement('div')
            message.className = 'mermaid-preview-error'
            message.setAttribute('role', 'status')
            message.textContent = '图表未能显示，请检查 Mermaid 源码。'
            apply(message, false)
            return
          }
          const figure = document.createElement('figure')
          figure.className = 'mermaid-preview'
          figure.dataset.src = mermaidSourceKey(source)
          figure.innerHTML = svg
          apply(figure, true)
        }, 140)
        onCleanup(() => {
          current = false
          clearTimeout(timer)
        })
      },
      { immediate: true, flush: 'post' }
    )
    onWatcherCleanup(stop)
  }

  function renderPreview(language, source, apply) {
    if (!isMermaidLanguage(language)) return null
    // Crepe supplies the entire document model, including lines outside the viewport.
    watchDiagram(source, element => apply(element.outerHTML))
    // Returning undefined selects Crepe's asynchronous preview mode.
  }

  return { renderPreview, watchDiagram }
}
