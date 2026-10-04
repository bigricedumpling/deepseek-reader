/**
 * mermaid 有 2MB，不能一进页面就加载。
 * 所以先扫一遍有没有 ```mermaid 代码块，有才动态拉库。
 */
let mermaidMod = null

/**
 * 从当前主题变量里读出 mermaid 要用的几个色。
 * 写死浅色的话，深色模式下会画出一块刺眼的白底图。
 */
function readTheme() {
  const cs = getComputedStyle(document.body)
  const v = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback
  const dark = document.body.dataset.theme === 'dark'
  return {
    dark,
    primaryColor: v('--c-field', '#f5f5f5'),
    primaryBorderColor: v('--c-accent', '#303030'),
    primaryTextColor: v('--c-ink', '#1a1a1a'),
    lineColor: v('--c-faint', '#b8b8b8'),
    secondaryColor: v('--c-chip', '#f5f5f7'),
    tertiaryColor: v('--c-code-bg', '#fafafa'),
    textColor: v('--c-text', '#333333')
  }
}

async function loadMermaid() {
  if (mermaidMod) return mermaidMod
  const m = await import('mermaid')
  mermaidMod = m.default
  return mermaidMod
}

/**
 * 每次渲染前重新 initialize。
 * 主题可能在两次渲染之间被切过，只初始化一次的话图不会跟着变。
 */
function configure(mermaid) {
  const t = readTheme()
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    securityLevel: 'strict',
    htmlLabels: false,
    fontFamily: '"Weixin", "PingFang SC", -apple-system, sans-serif',
    themeVariables: {
      primaryColor: t.primaryColor,
      primaryBorderColor: t.primaryBorderColor,
      primaryTextColor: t.primaryTextColor,
      lineColor: t.lineColor,
      secondaryColor: t.secondaryColor,
      tertiaryColor: t.tertiaryColor,
      textColor: t.textColor,
      fontSize: '14px'
    },
    flowchart: { curve: 'basis', padding: 12, htmlLabels: false },
    sequence: { actorMargin: 40 },
    gantt: { fontSize: 13 }
  })
  return mermaid
}

/** 渲染一段 mermaid 源码成 svg，失败返回 null */
export async function renderMermaidSvg(code) {
  const mermaid = configure(await loadMermaid())
  const id = 'mmd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  try {
    const { svg } = await mermaid.render(id, code)
    return svg
  } catch {
    // 语法错就画不出来，调用方自行决定怎么提示
    document.getElementById('d' + id)?.remove()
    return null
  }
}

/**
 * 阅读态用：把 ```mermaid 代码块就地换成图。画不出来就原样保留代码块。
 */
export async function renderMermaid(root) {
  if (!root) return
  const codes = [...root.querySelectorAll('pre > code.language-mermaid')]
  if (!codes.length) return

  const mermaid = configure(await loadMermaid())
  let i = 0
  for (const code of codes) {
    const src = (code.textContent || '').trim()
    const pre = code.parentElement
    if (!pre || !src) continue
    try {
      const { svg } = await mermaid.render('mmd-' + Date.now() + '-' + i++, src)
      const box = document.createElement('div')
      box.className = 'mermaid-block'
      box.innerHTML = svg
      pre.replaceWith(box)
    } catch {
      pre.classList.add('mermaid-error')
      pre.setAttribute('title', '这段 mermaid 语法有问题，画不出来，原文保留在这里')
    }
  }
}
