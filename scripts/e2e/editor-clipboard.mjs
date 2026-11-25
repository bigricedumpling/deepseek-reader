import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export async function verifyEditorClipboard({ send, ev, root, appUrl, sleep }) {
  const lib = '剪贴检查'
  const file = lib + '/记录.md'
  fs.mkdirSync(path.join(root, lib))
  fs.writeFileSync(path.join(root, file), '# 记录\n\n## 小节甲\n\n请看 **要点** 和 [依据](https://example.org/link)，公式 $x_1$ 也保留。\n\n粘贴位置\n\n不应出现在交接里的文字。\n')
  async function wait(name, fn, attempts = 100) {
    for (let i = 0; i < attempts; i++) {
      if (await fn()) return
      await sleep(60)
    }
    throw Error('等待 ' + name)
  }
  await send('Page.navigate', {url:new URL('doc/' + lib + '/记录?lib=' + lib, appUrl).href})
  await wait('示例就绪', () => ev("return !!document.querySelector('.ProseMirror p strong')"))
  // Model the system clipboard in this isolated tab; never replace the user's actual clipboard.
  await ev(`
    window.testItems = []
    Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{
      write: async items => { window.testItems = items },
      writeText: async text => { window.testHandoff = text },
      read: async () => window.testItems
    }})
  `)
  let preview = false
  const inEditor = script => {
    const target = preview ? "document.getElementById('handoff-preview').contentWindow" : 'window'
    return ev(`return (async win => { const { document, navigator } = win; ${script} })(${target})`)
  }
  function feedback(pattern) {
    return inEditor(`
      const nodes = document.createTreeWalker(document.body, win.NodeFilter.SHOW_TEXT)
      while (nodes.nextNode()) {
        const node = nodes.currentNode
        if (!${pattern}.test(node.textContent)) continue
        const el = node.parentElement
        if (!el?.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        const box = range.getBoundingClientRect()
        if (box.width <= 4 || box.height <= 4 ||
            box.bottom <= 0 || box.top >= win.innerHeight || box.right <= 0 || box.left >= win.innerWidth) continue
        // Ignore clipped announcers that exist for a screen reader only.
        const parent = el.getBoundingClientRect()
        if (parent.width <= 2 || parent.height <= 2) continue
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      }
      return null
    `)
  }
  async function select(selector) {
    await inEditor(`
      const p = document.querySelector(${JSON.stringify(selector)})
      const view = p.closest('.ProseMirror')
      view.focus()
      const range = document.createRange()
      range.selectNodeContents(p)
      const selection = win.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      document.dispatchEvent(new win.Event('selectionchange'))
    `)
    await sleep(65)
  }
  async function menu(selector) {
    await select(selector)
    await inEditor(`
      const el = document.querySelector(${JSON.stringify(selector)})
      const range = document.createRange()
      range.selectNodeContents(el)
      const box = range.getBoundingClientRect()
      el.dispatchEvent(new win.MouseEvent('contextmenu', {button:2,bubbles:true,cancelable:true,
        clientX:box.left+2, clientY:box.top+Math.min(8,box.height/2)}))
    `)
    await wait('右键菜单', () => inEditor("return !!document.querySelector('.editor-context-menu .ctx-item')"))
  }
  async function choose(label) {
    await inEditor(`
      const item = [...document.querySelectorAll('.ctx-item')].find(el=>el.querySelector('.ctx-label')?.textContent===${JSON.stringify(label)})
      if (!item || item.disabled) throw Error('菜单操作不可用')
      item.click()
    `)
    await wait('菜单退场', () => inEditor("return !document.querySelector('.editor-context-menu')"))
  }
  const first = '.ProseMirror p:nth-of-type(1)'
  const target = '.ProseMirror p:nth-of-type(2)'
  async function clickToolbar() {
    const point = await ev(`
      const btn = document.querySelector('[data-toolbar-item=copy-agent]')
      const rect = btn?.getBoundingClientRect()
      if (!rect?.width || !rect.height) return null
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    `)
    assert(point, '选区工具条缺少交接入口')
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
    return point
  }

  await select(first)
  await wait('浮动工具条可点击', () => ev(`
    const btn = document.querySelector('[data-toolbar-item=copy-agent]')
    const box = btn?.getBoundingClientRect()
    return box && btn.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
  `))
  function toolbarAppearance() {
    return ev(`
      const btn = document.querySelector('[data-toolbar-item=copy-agent]')
      const icons = [...btn.querySelectorAll('svg')].filter(icon => icon.checkVisibility())
      return { width: btn.getBoundingClientRect().width, icons: icons.map(icon => icon.innerHTML) }
    `)
  }
  const idle = await toolbarAppearance()
  assert.equal(idle.icons.length, 1, '工具条按钮只显示一个操作图标')
  const selectedText = await ev('return getSelection().toString()')
  const button = await clickToolbar()
  await wait('点击工具条后即刻显示已复制', () => feedback(/已复制/), 10)
  const copied = await toolbarAppearance()
  assert.equal(copied.icons.length, 1, '成功时只应看见确认图标')
  assert.notDeepEqual(copied.icons, idle.icons, '成功后应切换图标')
  assert.equal(copied.width, idle.width, '切换图标时工具条不能伸缩')
  const success = await feedback(/已复制/)
  assert(Math.abs(success.x - button.x) < 100 && Math.abs(success.y - button.y) < 90, '复制反馈应出现在所点按钮附近')
  assert.equal(await ev('return getSelection().toString()'), selectedText, '复制后应保留选区')
  await wait('成功提示自动退场', async () => !await feedback(/已复制/))
  assert.deepEqual(await toolbarAppearance(), idle, '确认消退后恢复原图标和尺寸')
  await ev(`
    window.testHandoff = ''
    navigator.clipboard.writeText = () => new Promise((resolve, reject) => { window.denyClipboard = reject })
    window.originalExecCommand = document.execCommand
    document.execCommand = () => false
  `)
  await clickToolbar()
  await wait('等待剪贴板授权时有进度提示', () => feedback(/正在复制|等待.*剪贴板/))
  assert(!await feedback(/已复制/), '系统剪贴板尚未写入，不能报告成功')
  await ev("window.denyClipboard(new Error('denied'))")
  await wait('剪贴板拒绝后有可见反馈', () => feedback(/未能复制|复制失败|无法复制|未复制|剪贴板权限/), 10)
  assert.equal(await ev("return window.testHandoff"), '')
  await ev(`
    navigator.clipboard.writeText = async text => { window.testHandoff = text }
    document.execCommand = window.originalExecCommand
  `)
  await menu(first)
  await choose('复制给 Agent')
  await wait('右键交接成功提示', () => feedback(/已复制/), 10)
  const handoff = await ev("return window.testHandoff")
  assert(handoff.includes(file) && handoff.includes('小节甲') && handoff.includes('要点') && handoff.includes('x_1'), handoff)
  assert.match(handoff, /文档 ID：[^\s]+/)
  assert(!handoff.includes('不应出现在交接里的文字'))
  await menu(first)
  await choose('复制')
  const types = await ev('return window.testItems[0]?.types')
  assert.deepEqual(new Set(types), new Set(['text/plain','text/html']))
  await menu(target)
  await choose('粘贴')
  const preserved = await ev(`
    const p=document.querySelector(${JSON.stringify(target)})
    return [p.querySelector('strong')?.textContent,p.querySelector('a')?.getAttribute('href'),p.querySelector('[data-type="math_inline"]')?.dataset.value]
  `)
  assert.deepEqual(preserved, ['要点','https://example.org/link','x_1'])
  await wait('结构和公式保存', () => (fs.readFileSync(path.join(root,file),'utf8').match(/\$x_1\$/g)||[]).length === 2)
  await menu(first)
  await choose('剪切')
  assert.equal(await ev('return document.querySelectorAll(".ProseMirror strong").length'), 1)
  await ev("window.testItems=[new ClipboardItem({'text/plain':new Blob(['第一段\\n\\n第二段'],{type:'text/plain'})})]")
  await menu(target)
  await choose('粘贴')
  assert(await ev("return ['第一段','第二段'].every(text=>[...document.querySelectorAll('.ProseMirror p')].some(p=>p.textContent===text))"))
  await ev(`
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg=='), c=>c.charCodeAt(0))
    window.testItems=[new ClipboardItem({'image/png':new Blob([png],{type:'image/png'})})]
  `)
  await menu(target)
  await choose('粘贴')
  await wait('图片上传并落盘', () => fs.readFileSync(path.join(root,file),'utf8').includes('/api/file?asset='))
  await ev("navigator.clipboard.read=async()=>{throw Error('denied')}")
  await menu('.ProseMirror p:last-of-type')
  const beforeDeniedPaste = await ev('return document.querySelector(".ProseMirror").textContent')
  await choose('粘贴')
  assert.equal(await ev('return document.querySelector(".ProseMirror").textContent'), beforeDeniedPaste)
  assert(await ev("return [...document.querySelectorAll('[role=alert]')].some(n=>n.textContent.includes('读取剪贴板'))"))
  await ev("navigator.clipboard.write=async()=>{throw Error('denied')}; document.execCommand=()=>false")
  await menu('.ProseMirror p:last-of-type')
  const before = await ev('return document.querySelector(".ProseMirror").textContent')
  await choose('剪切')
  assert.equal(await ev('return document.querySelector(".ProseMirror").textContent'),before)
  assert(await ev("return [...document.querySelectorAll('[role=alert]')].some(n=>n.textContent.includes('复制失败'))"))

  // A DSH workspace document runs read-only inside the host's preview frame.
  preview = true
  await ev(`
    const frame = document.createElement('iframe')
    frame.id = 'handoff-preview'
    frame.style.cssText = 'position:fixed;inset:0;width:95vw;height:85vh;z-index:9999'
    const onReady = event => {
      if (event.source !== frame.contentWindow || event.data?.type !== 'dsh-reader-preview:ready') return
      window.removeEventListener('message', onReady)
      frame.contentWindow.postMessage({
        type: 'dsh-reader-preview:update', filePath: '/private/desk/brief.md',
        title: 'brief.md', text: '# 计划\\n\\n工作区选段。', eof: true, version: 1
      }, location.origin)
    }
    window.addEventListener('message', onReady)
    frame.src = '/preview/index.html'
    document.body.append(frame)
  `)
  try {
    await wait('工作区只读预览', () => inEditor("return !!document.querySelector('.ProseMirror p')"))
    await inEditor(`Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async text => { win.testHandoff = text } }
    })`)
    await menu('.ProseMirror p')
    await choose('复制给 Agent')
    await wait('预览内的复制结果', () => feedback(/已复制/), 10)
    const quote = await inEditor('return win.testHandoff')
    assert(quote.includes('brief.md') && quote.includes('工作区选段') && !quote.includes('/private/desk') && !quote.includes('文档 ID'), quote)
  } finally {
    await ev("document.getElementById('handoff-preview')?.remove()")
  }
}
