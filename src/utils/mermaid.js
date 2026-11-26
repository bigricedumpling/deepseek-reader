import { flowchartTheme, polishFlowchart } from './mermaid-flowchart.js'
import { centerMindmapLabels, mindmapTheme } from './mermaid-mindmap.js'

// Mermaid is loaded only for an explicitly marked Markdown fence.
export function isMermaidLanguage(language) {
  return language?.trim().toLowerCase() === 'mermaid'
}

export function mermaidCodeBlocks(root) {
  return [...root.querySelectorAll('pre > code')].filter(code =>
    [...code.classList].some(name => name.toLowerCase() === 'language-mermaid'))
}

// Crepe sanitizes data attributes containing a literal "-->". Keep source
// identity intact for native print, including indentation and internal newlines.
export function mermaidSourceKey(source) {
  return encodeURIComponent(source.trimEnd().toWellFormed())
}

// Palette and line weights are part of the SVG so standalone exports match the reader.
function diagramVariables(dark) {
  const ink = dark ? '#f1eee8' : '#302e2a'
  const line = dark ? '#a9a69e' : '#87877f'
  const canvas = dark ? '#202120' : '#ffffff'
  const branches = dark ? ['#324238', '#403c51', '#494039'] : ['#edf2e9', '#eeeaf4', '#f7eee7']
  const themeVariables = {
    darkMode: dark, background: canvas, primaryColor: branches[0],
    primaryTextColor: ink, primaryBorderColor: dark ? '#879482' : '#929e89',
    secondaryColor: branches[1], tertiaryColor: branches[2], textColor: ink,
    lineColor: line, edgeLabelBackground: canvas, fontSize: '15px', mainBkg: branches[0]
  }
  for (let i = 0; i < 12; i++) {
    themeVariables['cScale' + i] = branches[i % branches.length]
    themeVariables['cScaleLabel' + i] = ink
  }
  return themeVariables
}

// initialize() changes global configuration. Keep it paired with its own render,
// even if an export requests a paper palette while editor previews are pending.
let lastRender = Promise.resolve()
export function renderMermaidSvg(source, { paper = false } = {}) {
  if (!source?.trim()) return Promise.resolve(null)
  const render = lastRender.then(async () => {
    const { default: mermaid } = await import('mermaid')
    // Register the built-in type detectors without loading the individual layouts.
    await mermaid.registerExternalDiagrams([])
    // render() also preprocesses legacy directives and frontmatter. If its fast
    // detector cannot classify a source, let the native renderer decide validity.
    let type = ''
    try { type = mermaid.detectType(source) } catch {}
    const dark = !paper && document.body.dataset.theme === 'dark'
    const isFlowchart = type.startsWith('flowchart')
    const family = isFlowchart ? flowchartTheme(dark) : type === 'mindmap' ? mindmapTheme(dark) : {}
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'strict',
      suppressErrorRendering: true,
      htmlLabels: false,
      fontFamily: 'system-ui, sans-serif',
      look: 'classic',
      themeVariables: { ...diagramVariables(dark), ...family.themeVariables },
      themeCSS: family.themeCSS || '',
      flowchart: { curve: 'basis', padding: 11, minNodeWidth: 38, diagramPadding: 18, nodeSpacing: 38, rankSpacing: 62, htmlLabels: false },
      sequence: { actorMargin: 40 },
      gantt: { fontSize: 13 }
    })
    // Layout needs a connected, measurable DOM. Keep temporary SVGs outside
    // the article and remove the entire measurement surface even on errors.
    const surface = document.createElement('div')
    surface.style.cssText = 'position:absolute;inset:0 0 auto;visibility:hidden;pointer-events:none;overflow:hidden'
    surface.setAttribute('aria-hidden', 'true')
    document.body.append(surface)
    try {
      const id = 'mmd-' + crypto.getRandomValues(new Uint32Array(2)).join('-')
      // Strict Mermaid sanitizes its SVG. We never bind diagram-supplied events.
      const { svg } = await mermaid.render(id, source, surface)
      if (!isFlowchart && type !== 'mindmap') return svg
      surface.innerHTML = svg
      const drawing = surface.querySelector('svg')
      if (isFlowchart) polishFlowchart(drawing, dark, paper)
      else centerMindmapLabels(drawing)
      return drawing.outerHTML
    } finally {
      surface.remove()
    }
  }).catch(() => null)
  lastRender = render.then(() => {})
  return render
}
