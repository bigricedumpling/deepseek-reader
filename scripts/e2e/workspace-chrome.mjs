import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

export async function verifyWorkspaceChrome({send, ev, root, appUrl, sleep}) {
  const libraries = ['图', '交互设计方案与技术验证资料库']
  const files = libraries.map((lib, i) => lib + '/' + ['索引', '排版细节'][i] + '.md')
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive:true})
    fs.writeFileSync(path.join(root, file), '# ' + path.basename(file, '.md') + '\n\n## 第一节\n\n正文。\n')
  }
  const viewport = (width, mobile = false) => send('Emulation.setDeviceMetricsOverride', {width,height:800,deviceScaleFactor:1,mobile})
  const ready = async file => {
    for (let i = 0; i < 100; i++) {
      if (await ev('return window.__reader?.currentLoaded && window.__reader.currentPath === ' + JSON.stringify(file) + ' && !!document.querySelector(".doc-tab.is-active")')) return
      await sleep(80)
    }
    throw Error('跨库测试文档未就绪')
  }
  async function select(file) {
    await ev('return window.__reader.select(' + JSON.stringify(file) + ')')
    await ready(file)
  }
  function track(file) {
    const strip = document.querySelector('.doc-tabs')
    const tabs = [...strip.querySelectorAll('.doc-tab-main')]
    const trigger = tabs.find(el => el.title === file)
    const more = document.querySelector('.doc-more > button')
    const frames = []
    let arrival = 0
    return new Promise((resolve, reject) => {
      function tick(time) {
        const box = el => el.getBoundingClientRect()
        const titles = [...document.querySelectorAll('.kb-title-text')].filter(n => Number(getComputedStyle(n).opacity) > .15 && n.checkVisibility())
        frames.push({
          strip:box(strip).left, more:box(more).left, first:box(tabs[0]).left + strip.scrollLeft,
          selected:strip.querySelector('.doc-tab.is-active .doc-tab-main')?.title,
          titles:titles.length, overlap:document.querySelector('.kb-title-label').getBoundingClientRect().right - document.querySelector('.sidebar-actions').getBoundingClientRect().left,
          outside:document.documentElement.scrollWidth > innerWidth
        })
        if (frames.length === 1) trigger.click()
        if (!arrival && frames.at(-1).selected === file && window.__reader.currentLoaded) arrival = time
        if (arrival && time - arrival >= 400) resolve(frames)
        else if (frames.length > 240) reject(Error('跨库标签未完成切换'))
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }
  async function capture(file) {
    const frames = await ev('return await (' + track.toString() + ')(' + JSON.stringify(file) + ')')
    const range = key => Math.max(...frames.map(f => f[key])) - Math.min(...frames.map(f => f[key]))
    const metrics = {strip:range('strip'),more:range('more'),first:range('first'),titles:Math.max(...frames.map(f=>f.titles))}
    assert(metrics.strip <= 1 && metrics.more <= 1 && metrics.first <= 1, '切换知识库时左右控件挤动了标签栏')
    assert(metrics.titles <= 1, '两个知识库名称在同一位置重影')
    assert(!frames.some(f => f.outside || f.overlap > 1), '顶栏溢出或标题压住操作按钮')
  }
  try {
    await viewport(1180)
    await send('Page.navigate', {url:new URL('doc/' + files[0].slice(0, -3) + '?lib=' + libraries[0], appUrl).href})
    await ready(files[0])
    await ev('const s=window.__reader; for(const f of s.tabs.slice()) if(f !== s.currentPath) s.closeTab(f)')
    await select(files[1])
    await select(files[0])
    if (await ev('return document.querySelector(".sidebar-toggle").getAttribute("aria-expanded") === "true"')) {
      await ev('document.querySelector(".sidebar-toggle").click()')
    }
    await ev('await document.fonts.ready')
    await sleep(430)
    await capture(files[1])
    await capture(files[0])
    await ev('document.querySelector(".sidebar-toggle").click()')
    await sleep(350)
    await capture(files[1])
    const expandsCorrectly = await ev(`
      const toggle = document.querySelector('.sidebar-toggle')
      toggle.click()
      toggle.click()
      await new Promise(resolve => setTimeout(resolve, 500))
      return toggle.getAttribute('aria-expanded') === 'true' && !document.querySelector('.side-header.is-compact')
    `)
    assert(expandsCorrectly, '反向开合时，较早的收起回调覆盖了最终的展开状态')
    const grip = await ev(`
      const r = document.querySelector('.file-nav-resize').getBoundingClientRect()
      return {x:r.x + r.width/2, y:r.y + r.height/2, width:document.querySelector('.app-sidebar > aside').getBoundingClientRect().width}
    `)
    const dx = grip.width > 330 ? -60 : 60
    await send('Input.dispatchMouseEvent', {type:'mousePressed', x:grip.x, y:grip.y, button:'left', clickCount:1})
    try {
      await send('Input.dispatchMouseEvent', {type:'mouseMoved', x:grip.x+dx, y:grip.y, buttons:1})
      const widths = await ev(`await new Promise(requestAnimationFrame)
        return ['.app-sidebar > aside','#app-topbar-left'].map(sel=>document.querySelector(sel).getBoundingClientRect().width)`)
      assert(widths.every(w => Math.abs(w - grip.width - dx) <= 1), '拖动时侧栏与顶栏应同步跟手 ' + JSON.stringify(widths))
    } finally {
      await send('Input.dispatchMouseEvent', {type:'mouseReleased', x:grip.x+dx, y:grip.y, button:'left', clickCount:1})
    }
    if (await ev('return !!document.querySelector(".toc-panel:not(.is-collapsed)")')) {
      await ev('document.querySelector(".toc-collapse-chip").click()')
      await sleep(500)
    }
    const offset = await ev(`
      document.querySelector('.rail-toc-handle').click()
      await new Promise(requestAnimationFrame)
      const trigger = document.querySelector('.doc-reading > button')
      trigger.click()
      await new Promise(resolve => setTimeout(resolve, 530))
      const panel = document.querySelector('.reading-panel')
      if (!panel) throw Error('打开目录时阅读设置意外关闭')
      const delta = Math.abs(panel.getBoundingClientRect().right - trigger.getBoundingClientRect().right)
      trigger.click()
      return delta
    `)
    assert(offset <= 1, '顶栏移动后，阅读设置与 Aa 按钮错开 ' + Math.round(offset) + 'px')
    await viewport(390, true)
    await sleep(350)
    await capture(files[0])
  } finally {
    await send('Emulation.clearDeviceMetricsOverride')
  }
}
