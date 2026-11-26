import { onWatcherCleanup, watch } from 'vue'
import { useReaderStore } from '../stores/reader'
import { isMermaidLanguage, mermaidSourceKey, renderMermaidSvg } from '../utils/mermaid.js'

// Mermaid puts the parser's type on the rendered SVG, including for sources
// with frontmatter, comments or an alias such as "graph LR".
const diagramNames = {
  'flowchart-v2': '流程图',
  'flowchart-elk': '流程图',
  flowchart: '流程图',
  mindmap: '思维导图',
  sequence: '时序图',
  classDiagram: '类图',
  stateDiagram: '状态图',
  er: '实体关系图',
  gantt: '甘特图',
  journey: '用户旅程图',
  gitGraph: 'Git 分支图',
  pie: '饼图',
  quadrantChart: '象限图',
  xychart: 'XY 图',
  requirement: '需求图',
  timeline: '时间线',
  kanban: '看板',
  sankey: '桑基图',
  packet: '数据包图',
  radar: '雷达图',
  block: '框图',
  treeView: '树形图',
  architecture: '架构图',
  c4: 'C4 架构图',
  swimlane: '泳道图',
  agentflow: '智能体流程图',
  eventmodeling: '事件建模图',
  ishikawa: '鱼骨图',
  venn: '维恩图',
  treemap: '矩形树图',
  usecase: '用例图',
  wardley: '沃德利地图',
  cynefin: 'Cynefin 框架图',
  railroad: '语法图',
  railroadEbnf: 'EBNF 语法图',
  railroadAbnf: 'ABNF 语法图',
  railroadPeg: 'PEG 语法图',
  info: 'Mermaid 版本信息'
}

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
          const type = figure.querySelector('svg')?.getAttribute('aria-roledescription')
          const caption = document.createElement('figcaption')
          caption.className = 'mermaid-type-label'
          caption.textContent = diagramNames[type] || 'Mermaid 图表'
          figure.prepend(caption)
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
