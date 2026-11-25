import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { openReadingSettings, chooseReadingSetting } from './reading-settings.mjs'

export async function verifyWorkspaceChrome({send, ev, root, appUrl, sleep}) {
  const libraries = ['图', '交互设计方案与技术验证资料库']
  const files = libraries.map((lib, i) => lib + '/' + ['索引', '排版细节'][i] + '.md')
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive:true})
    fs.writeFileSync(path.join(root, file), '# ' + path.basename(file, '.md') + '\n\n## 第一节\n\n正文。\n')
  }
  const meta = await fetch(new URL('api/lib/meta', appUrl), {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ name:libraries[1], icon:'📚' })
  }).then(response => response.json())
  assert(meta.ok, '测试知识库图标未就绪')
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
    const tabPath = el => el?.title || el?.dataset.tooltip
    const trigger = tabs.find(el => tabPath(el) === file)
    const more = document.querySelector('.doc-more > button')
    const frames = []
    let arrival = 0
    return new Promise((resolve, reject) => {
      function tick(time) {
        const box = el => el.getBoundingClientRect()
        const header = document.querySelector('.side-header')
        const title = header.querySelector('.kb-title-text')
        const glyph = header.querySelector('.kb-glyph-swap')
        const opacity = el => el ? Number(getComputedStyle(el).opacity) : 1
        const titles = [...document.querySelectorAll('.kb-title-text')].filter(n => Number(getComputedStyle(n).opacity) > .15 && n.checkVisibility())
        frames.push({
          viewport:innerWidth, strip:box(strip).left, more:box(more).left,
          compact:header.classList.contains('is-compact'), width:box(header).width,
          gap:box(strip).left - box(header).right,
          targetLeft:box(trigger.parentElement).left - box(strip).left,
          targetRight:box(strip).right - box(trigger.parentElement).right,
          library:title.textContent, titleOpacity:opacity(title),
          icon:glyph?.querySelector('.content-icon')?.textContent || '', iconOpacity:opacity(glyph),
          labels:tabs.map(tab => box(tab).left + strip.scrollLeft - box(strip).left),
          selected:tabPath(strip.querySelector('.doc-tab.is-active .doc-tab-main')),
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
  async function capture(file, reduced = false) {
    const frames = await ev('return await (' + track.toString() + ')(' + JSON.stringify(file) + ')')
    const range = key => Math.max(...frames.map(f => f[key])) - Math.min(...frames.map(f => f[key]))
    const scenario = `${frames[0].viewport}px 切换到 ${file}`
    const stripDrift = range('strip'), moreDrift = range('more')
    assert(moreDrift <= 1, `${scenario} 时更多菜单移位 ${moreDrift}px`)
    if (frames[0].compact) {
      assert(frames.every(frame => frame.gap >= 4 && frame.gap <= 12) && range('gap') <= 1,
        `${scenario} 时标签栏未贴着知识库按钮，间距从 ${Math.min(...frames.map(f => f.gap))} 到 ${Math.max(...frames.map(f => f.gap))}px`)
    } else {
      assert(stripDrift <= 1, `${scenario} 时展开的侧栏挤动标签栏 ${stripDrift}px`)
    }
    for (const [index, origin] of frames[0].labels.entries()) {
      const drift = Math.max(...frames.map(frame => Math.abs(frame.labels[index] - origin)))
      assert(drift <= 1, `${scenario} 时第 ${index + 1} 个标签在滚动之外又移动了 ${drift}px`)
    }
    assert(frames.every(frame => frame.titles <= 1), '两个知识库名称在同一位置重影')
    assert(!frames.some(f => f.outside || f.overlap > 1), '顶栏溢出或标题压住操作按钮')
    const first = frames[0], last = frames.at(-1)
    assert(last.targetLeft >= -1 && last.targetRight >= -1,
      `${scenario} 后选中标签仍被裁切，左右余量 ${last.targetLeft}px / ${last.targetRight}px`)
    const target = file.split('/')[0]
    assert(last.library === target && last.icon === (target === libraries[1] ? '📚' : ''), '按钮未显示目标库名和图标')
    const low = Math.min(first.width, last.width), high = Math.max(first.width, last.width)
    const between = frames.filter(f => f.width > low + 1 && f.width < high - 1)
    if (reduced) {
      assert(!between.length && frames.every(f => f.titleOpacity > .99 && f.iconOpacity > .99 &&
        (f.selected !== file || f.library === target)), '减少动态时知识库按钮应随标签立即就位')
    } else {
      if (first.compact && high - low > 8) assert(between.length, '短库名与长库名切换时按钮宽度瞬变')
      for (const [label, value] of [['library', 'titleOpacity'], ['icon', 'iconOpacity']]) {
        const fading = f => f[value] > .02 && f[value] < .96
        assert(frames.some(f => f[label] === first[label] && fading(f)), scenario + ' 旧' + label + '应有退场')
        assert(frames.some(f => f[label] === last[label] && fading(f)), scenario + ' 新' + label + '应有入场')
      }
    }
  }
  async function setFilesOpen(open) {
    await ev(`const toggle = document.querySelector('.sidebar-toggle')
      if (toggle.getAttribute('aria-expanded') !== '${open}') toggle.click()
      await new Promise(requestAnimationFrame)
      const panel = document.querySelector('.app-sidebar > aside')
      const header = document.querySelector('#app-topbar-left')
      await Promise.allSettled([panel, header].flatMap(el => el.getAnimations()).map(a => a.finished))`)
  }
  async function checkCompactTitleGap(viewportWidth) {
    const gap = await ev(`const text = document.createRange()
      text.selectNodeContents(document.querySelector('.kb-title-text'))
      return document.querySelector('.sidebar-toggle').getBoundingClientRect().left - text.getBoundingClientRect().right`)
    assert(gap >= 0 && gap <= 24, viewportWidth + 'px 窗口的收起按钮应紧贴当前短库名，实测间距 ' + gap + 'px')
  }
  try {
    await viewport(1180)
    await ev("localStorage.setItem('reader.navW', '180')")
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
    await checkCompactTitleGap(1180)
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
    await select(files[0])
    for (const size of [721, 720, 696]) {
      await viewport(size)
      await setFilesOpen(false)
      await checkCompactTitleGap(size)
      await setFilesOpen(true)
      const layout = await ev(`const panel = document.querySelector('.app-sidebar > aside').getBoundingClientRect()
        const header = document.querySelector('#app-topbar-left').getBoundingClientRect()
        const main = document.querySelector('.workspace-reader main').getBoundingClientRect()
        return {panel:panel.width, header:header.width, body:main.width, gap:main.left - panel.right}`)
      assert(Math.abs(layout.panel - grip.width - dx) <= 1 && Math.abs(layout.header - layout.panel) <= 1 &&
        Math.abs(layout.gap) <= 1 && layout.body > size / 2,
        size + 'px 窄桌面应保留拖动后的侧栏宽度，并排显示正文：' + JSON.stringify(layout))
    }
    await setFilesOpen(false)
    await send('Emulation.setTouchEmulationEnabled', {enabled:true})
    await viewport(390, true)
    await sleep(350)
    await capture(files[1])
    await capture(files[0])
    await checkCompactTitleGap(390)
    await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion', value:'reduce'}]})
    await capture(files[1], true)

    // Reopen another fixture through a full navigation, not the in-memory tab store.
    await openReadingSettings(ev)
    const previous = await ev(`return Object.fromEntries([...document.querySelectorAll('.reading-panel [role=radiogroup]')].map(row => [
      document.getElementById(row.getAttribute('aria-labelledby')).textContent,
      row.querySelector('input:checked')?.getAttribute('aria-label')
    ]))`)
    try {
      await chooseReadingSetting(ev, '字号', '大')
      await chooseReadingSetting(ev, '文档风格', '默认')
      const headingSize = () => ev("const h = document.querySelector('.ProseMirror h2'); return h && parseFloat(getComputedStyle(h).fontSize)")
      const baseline = await headingSize()
      await chooseReadingSetting(ev, '文档风格', 'Obsidian')
      const styled = await headingSize()
      assert(baseline > 0 && styled > baseline, '选择 Obsidian 后正文标题应有可见变化')
      await send('Page.navigate', {url:new URL('doc/' + files[0].slice(0, -3) + '?lib=' + libraries[0], appUrl).href})
      await ready(files[0])
      await openReadingSettings(ev)
      for (let i = 0; i < 60 && !await headingSize(); i++) await sleep(50)
      assert.equal(await headingSize(), styled, '重新打开文档后应恢复同一标题尺度')
      assert(await ev(`const checked = label => document.querySelector('.reading-panel input[aria-label="' + label + '"]').checked
        return checked('Obsidian') && checked('大')`), '文档风格和手动字号应分别保留')
    } finally {
      await chooseReadingSetting(ev, '文档风格', previous['文档风格'])
      await chooseReadingSetting(ev, '字号', previous['字号'])
      await ev("document.querySelector('button[aria-label=阅读设置]').click()")
    }
  } finally {
    await send('Emulation.setEmulatedMedia', {features:[]})
    await send('Emulation.setTouchEmulationEnabled', {enabled:false})
    await send('Emulation.clearDeviceMetricsOverride')
  }
}
