/**
 * 在编辑器里给 ```mermaid 代码块补一块渲染出来的图。
 *
 * 为什么是补一块而不是替换代码块：
 * Crepe 的代码块是 CodeMirror 实例，源码必须留着给用户改。
 * 所以图追加在块内、源码下面，源码一动就重画，语法错就把图撤掉、代码原样保留。
 */
export function useMermaidPreview({ host, renderSvg }) {
  let timer = null

  async function paint() {
    if (!host.value) return
    const blocks = [...host.value.querySelectorAll('.milkdown-code-block')]
    for (const block of blocks) {
      const lang = (block.querySelector('.language-button')?.textContent || '').trim().toLowerCase()
      const existing = block.querySelector('.mermaid-preview')
      if (lang !== 'mermaid') {
        existing?.remove()
        continue
      }
      const code = (block.querySelector('.cm-content')?.textContent || '').trim()
      if (!code) {
        existing?.remove()
        continue
      }
      // 源码没变就别重画，否则每次重排都要重新渲染一遍图
      if (existing && existing.dataset.src === code) continue
      existing?.remove()
      const svg = await renderSvg(code)
      if (!svg) continue
      const box = document.createElement('div')
      box.className = 'mermaid-preview'
      box.dataset.src = code
      box.innerHTML = svg
      block.appendChild(box)
    }
  }

  /** 合并短时间内的多次变更，编辑器每敲一个字都会触发一次 DOM 变动 */
  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(paint, 600)
  }

  function stop() {
    clearTimeout(timer)
  }

  return { paint, schedule, stop }
}
