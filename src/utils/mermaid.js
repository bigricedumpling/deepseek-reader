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

function themeVariables(paper) {
  const style = paper ? null : getComputedStyle(document.body)
  const color = (token, fallback) => style?.getPropertyValue(token).trim() || fallback
  return {
    darkMode: !paper && document.body.dataset.theme === 'dark',
    background: color('--c-surface', '#ffffff'),
    primaryColor: color('--c-code-bg', '#f5f5f5'),
    primaryBorderColor: color('--c-accent', '#303030'),
    primaryTextColor: color('--c-ink', '#1a1a1a'),
    lineColor: color('--c-sub', '#6b6b6b'),
    secondaryColor: color('--c-surface', '#ffffff'),
    tertiaryColor: color('--c-line-soft', '#f2f2f2'),
    textColor: color('--c-text', '#333333'),
    fontSize: '14px'
  }
}

// initialize() changes global configuration. Keep it paired with its own render,
// even if an export requests a paper palette while editor previews are pending.
let lastRender = Promise.resolve()
export function renderMermaidSvg(source, { paper = false } = {}) {
  if (!source?.trim()) return Promise.resolve(null)
  const render = lastRender.then(async () => {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'strict',
      suppressErrorRendering: true,
      htmlLabels: false,
      fontFamily: '"HarmonyOS Sans SC", "Noto Sans SC", sans-serif',
      themeVariables: themeVariables(paper),
      flowchart: { curve: 'basis', padding: 12, htmlLabels: false },
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
      return svg
    } finally {
      surface.remove()
    }
  }).catch(() => null)
  lastRender = render.then(() => {})
  return render
}
