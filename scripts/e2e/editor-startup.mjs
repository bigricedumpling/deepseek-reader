import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { chooseReadingSetting } from './reading-settings.mjs'

export async function verifyEditorStartupRecovery({ ev, root, file, sleep }) {
  const contents = () => fs.readFileSync(path.join(root, file))
  const original = contents()
  async function until(description, predicate) {
    for (let i = 0; i < 100; i++) {
      if (await ev(predicate)) return
      await sleep(100)
    }
    throw Error('等待超时：' + description)
  }

  const initial = path.posix.join(path.posix.dirname(file), '编辑器启动定位.md')
  const initialText = '# 编辑器启动定位\n\n切换前的正文。\n'
  fs.writeFileSync(path.join(root, initial), initialText, { flag:'wx' })
  await ev(`await window.__reader.loadTree(); await window.__reader.select(${JSON.stringify(initial)})`)
  await until('打开用于切换的文档', `return window.__reader.currentPath === ${JSON.stringify(initial)}
    && window.__fold?.view()?.dom?.checkVisibility() && window.__baseline === ${JSON.stringify(initialText)}`)
  await ev(`
    // Crepe and Milkdown assign create on each instance. Wrap the real factory
    // once so a retry goes through the original startup path.
    const Editor = window.__crepe.editor.constructor
    const make = Editor.make
    window.__startupFailureCount = 0
    Editor.make = function(...args) {
      Editor.make = make
      const editor = make.apply(this, args)
      editor.create = async () => { window.__startupFailureCount++; throw Error('模拟编辑器启动失败') }
      return editor
    }
    await window.__reader.select(${JSON.stringify(file)})
  `)
  await until('启动失败时显示排版正文和重试入口', `
    const article = document.querySelector('.source-reading article')
    const action = document.querySelector('.editor-shell [role=status] button')
    return window.__startupFailureCount === 1 && article?.checkVisibility() && !article.isContentEditable
      && ['h1','h2','blockquote','strong','em','table','.katex'].every(selector => article.querySelector(selector))
      && !article.textContent.includes('# 混合排版') && !document.querySelector('.editor-shell textarea:not([hidden])')
      && action?.checkVisibility() && action.textContent.trim() === '重试'
  `)
  const chartSelector = '.source-reading .mermaid-preview > svg'
  await until('启动恢复阅读页保留有效图表和错误源码', `
    const svg = document.querySelector(${JSON.stringify(chartSelector)})
    const error = document.querySelector('.source-reading .mermaid-preview-error')
    const labels = [...(svg?.querySelectorAll('text,foreignObject') || [])].map(el => el.textContent)
    return labels.some(label => label.includes('Start')) && labels.some(label => label.includes('End'))
      && error?.checkVisibility() && error.nextElementSibling?.querySelector('code')?.textContent.includes('A[Missing bracket')
  `)
  const appearance = await ev(`const svg = document.querySelector(${JSON.stringify(chartSelector)})
    return { theme: document.body.dataset.theme, id: svg.id, fill: getComputedStyle(svg.querySelector('.node rect')).fill }`)
  const nextTheme = appearance.theme === 'dark' ? 'light' : 'dark'
  const themeLabel = { dark: '深色', light: '浅色', sepia: '柔和' }
  try {
    await chooseReadingSetting(ev, '外观', themeLabel[nextTheme])
    await until('阅读主题同步到当前图表', `
      const svg = document.querySelector(${JSON.stringify(chartSelector)})
      return document.body.dataset.theme === ${JSON.stringify(nextTheme)}
        && svg && svg.id !== ${JSON.stringify(appearance.id)}
        && getComputedStyle(svg.querySelector('.node rect')).fill !== ${JSON.stringify(appearance.fill)}
        && document.querySelector('.source-reading .mermaid-preview-error + pre code')?.textContent.includes('A[Missing bracket')
    `)
  } finally {
    await chooseReadingSetting(ev, '外观', themeLabel[appearance.theme])
    await ev("document.querySelector('button[aria-label=阅读设置]').click()")
  }
  assert.deepEqual(contents(), original, '启动失败时不得改写文件')
  await ev("document.querySelector('.editor-shell [role=status] button').click()")
  await until('点击重试后富文本编辑器恢复', `
    const editor = window.__fold?.view()?.dom
    return window.__startupFailureCount === 1 && editor?.checkVisibility() && editor.isContentEditable
      && editor.querySelector('h1')?.textContent === '混合排版' && editor.querySelector('table') && !!editor.querySelector('.katex')
      && !document.querySelector('.source-reading') && !document.querySelector('.editor-shell [role=status] button')
  `)
  assert.deepEqual(contents(), original, '重试只应重新启动编辑器')
}
