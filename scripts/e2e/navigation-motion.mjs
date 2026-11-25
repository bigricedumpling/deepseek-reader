import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

async function followRow(rowSelector, markerSelector, clickSelector) {
  const row = document.querySelector(rowSelector)
  const oldTop = row.getBoundingClientRect().top
  document.querySelector(clickSelector).click()
  const start = performance.now()
  let error = 0
  do {
    await new Promise(requestAnimationFrame)
    const mark = row.querySelector(markerSelector) || document.querySelector(markerSelector)
    if (!mark) throw Error(rowSelector + ' 的选中背景消失')
    error = Math.max(error, Math.abs(row.getBoundingClientRect().top - mark.getBoundingClientRect().top))
  } while (performance.now() - start < 430)
  return { distance:Math.abs(row.getBoundingClientRect().top-oldTop), error }
}

// Sample the rendered marker. A translated rigid rectangle and a simple
// crossfade each fail a different assertion even when the final row is correct.
async function sampleSelection(from, to, marker, button, reverse) {
  const row = selector => document.querySelector(selector)
  const click = selector => (button ? row(selector).querySelector(button) : row(selector)).click()
  const box = element => element.getBoundingClientRect()
  const start = box(row(from)), end = box(row(to))
  const distance = end.top - start.top
  const result = { distance, passedMiddle:false, stretched:false, fadedFrom:false, fadedTo:false, reversed:false }
  let expected = to, settled = 0, reversedPose
  const deadline = performance.now() + 5000
  click(to)
  do {
    await new Promise(requestAnimationFrame)
    const marks = [...document.querySelectorAll(marker)]
    for (const mark of marks) {
      const rect = box(mark), opacity = Number(getComputedStyle(mark).opacity)
      if (opacity <= .01 || rect.height === 0) continue
      const progress = (rect.top + rect.height / 2 - start.top - start.height / 2) / distance
      const middle = progress > .15 && progress < .85
      if (middle) result.passedMiddle = true
      if (rect.height > Math.max(start.height, end.height) + 1.5) result.stretched = true
      if (opacity < .97 && Math.abs(progress) < .15) result.fadedFrom = true
      if (opacity < .97 && Math.abs(1 - progress) < .15) result.fadedTo = true
      if (reverse && middle && !result.reversed && row(to).matches('.is-on,.is-current')) {
        // Freeze a painted frame so an asynchronous library read cannot finish
        // the outgoing motion before the reversal. Compare the first frame of
        // the return to exactly what was visible at interruption.
        const outgoing = mark.getAnimations().find(animation => animation.effect?.target === mark)
        if (!outgoing) continue
        outgoing.pause()
        await outgoing.ready
        reversedPose = box(mark)
        result.reversed = true
        expected = from
        click(from)
      }
    }
    const target = row(expected)
    const current = target?.querySelector(marker)
    if (reversedPose && target.matches('.is-on,.is-current') && current) {
      const returning = current.getAnimations().find(animation => animation.effect?.target === current)
      if (returning) {
        const time = returning.currentTime
        returning.currentTime = 0
        const first = box(current)
        result.reversalJump = Math.max(Math.abs(first.top - reversedPose.top), Math.abs(first.bottom - reversedPose.bottom))
        returning.currentTime = time
        reversedPose = null
      }
    }
    const aligned = current && Math.abs(box(current).top - box(target).top) < .75 &&
      Math.abs(box(current).height - box(target).height) < .75
    const finished = marks.length === 1 && aligned && target.matches('.is-on,.is-current') &&
      !current.getAnimations().some(animation => animation.playState === 'running')
    settled = finished ? settled + 1 : 0
    if (settled >= 3) return result
  } while (performance.now() < deadline)
  throw Error('选中高亮未在目标行落定 ' + expected + ' ' + JSON.stringify(result))
}

async function measureOutline(rail, index = 104) {
  const scroller = document.getElementById('main-scroll-container')
  const target = document.querySelectorAll('.ProseMirror h2')[index]
  const dest = scroller.scrollTop + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 90
  const original = Element.prototype.getBoundingClientRect
  let reads = 0
  Element.prototype.getBoundingClientRect = function () {
    if (this instanceof HTMLHeadingElement) reads++
    return original.call(this)
  }
  try {
    scroller.scrollTo({top:dest,behavior:'instant'})
    for (let i = 0; i < 5; i++) await new Promise(requestAnimationFrame)
    const active = rail ? document.querySelector('.rail-toc-stop.active')?.getAttribute('aria-label')
      : document.querySelector('.toc-item.is-active')?.textContent.trim()
    const markersVisible = !!document.querySelector('.rail-toc-stops')?.clientHeight
    return { reads, active, markersVisible, target:target.textContent.trim() }
  } finally { Element.prototype.getBoundingClientRect = original }
}

export async function verifyNavigationMotion({send, ev, root, appUrl, sleep}) {
  const lib = '导航动效检查'
  const activeFile = lib + '/99-阅读/长文.md'
  const chunks = Array.from({length:128}, (_, i) => '## 章节 ' + i + '\n\n' + '行文示例。'.repeat(24) + '\n')
  for (const file of [activeFile, ...Array.from({length:5}, (_, i) => lib + '/00-资料/' + i + '.md')]) {
    fs.mkdirSync(path.dirname(path.join(root,file)), {recursive:true})
    fs.writeFileSync(path.join(root,file), file === activeFile ? '# 长文\n\n' + chunks.join('\n') : '# 资料\n')
  }
  const ready = async expr => {
    for (let i=0; i<120; i++) {
      if (await ev('return ' + expr)) return
      await sleep(60)
    }
    throw Error('导航测试未就绪 ' + expr)
  }
  const click = selector => ev('document.querySelector(' + JSON.stringify(selector) + ').click()')
  const follow = (...args) => ev('return ('+followRow.toString()+')('+args.map(x=>JSON.stringify(x)).join(',')+')')
  const viewport = width => send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:width<500})
  const media = value => send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value}]})
  try {
    await viewport(1180)
    await media('no-preference')
    await send('Page.navigate',{url:new URL('doc/' + activeFile.slice(0,-3) + '?lib=' + lib, appUrl).href})
    await ready("document.querySelectorAll('.ProseMirror h2').length === 128")
    if (await ev("return document.querySelector('.sidebar-toggle').getAttribute('aria-expanded')==='false'")) await click('.sidebar-toggle')
    if (!(await ev("return !!document.querySelector('.lib-panel')"))) await click('.kb-list-btn')
    await ready("!!document.querySelector('.lib-row.is-current .lib-more')")
    await sleep(420)
    await click('.lib-row.is-current .lib-more')
    const pinSelector = await ev(`const pin = [...document.querySelectorAll('.tree-menu button')].find(el=>el.textContent.includes('置顶')); pin.id='test-pin-target'; return '#test-pin-target'`)
    const pinned = await follow('.lib-row.is-current', '.lib-row-blob', pinSelector)
    assert(pinned.error<1, '置顶时底色离开了选中行 '+JSON.stringify(pinned))
    const folder = '.cat-row[data-path="' + lib + '/00-资料"] .folder-toggle'
    const current = '.cat-row[data-path="' + lib + '/99-阅读"] .folder-toggle'
    for (const selector of [folder, current]) {
      if (await ev('return document.querySelector(' + JSON.stringify(selector) + ').getAttribute("aria-expanded")==="false"')) await click(selector)
    }
    await sleep(400)
    for (let i = 0; i < 2; i++) {
      const result = await follow('.doc-row.is-on', '.doc-row-blob', folder)
      assert(result.distance>80 && result.error<1, '折叠目录时底色脱离了文档 '+JSON.stringify(result))
    }
    if (await ev("return document.querySelector('.toc-panel').classList.contains('is-collapsed')")) await click('.rail-toc-handle')
    for (const rail of [false,true]) {
      if (rail) await click('.toc-collapse-chip')
      await ev("document.getElementById('main-scroll-container').scrollTo({top:0,behavior:'instant'})")
      await sleep(500)
      const result = await ev('return ('+measureOutline.toString()+')('+rail+')')
      if (rail && !result.markersVisible) {
        assert.equal(result.reads, 0, '隐藏的目录标记应停止测量正文')
        await click('.rail-toc-handle')
        await ready("document.querySelector('.toc-item.is-active')?.textContent.trim()==='章节 104'")
        await click('.toc-collapse-chip')
      } else {
        assert.equal(result.active, result.target, '长文当前位置应匹配实际标题 '+JSON.stringify(result))
        assert(result.reads <= 22, '每次滚动只需测量少量正文标题 '+JSON.stringify(result))
      }
    }

    // A touch-only tablet has a single outline button. Opening it must pick up
    // the current chapter; attaching a mouse should also wake the compact rail.
    await send('Emulation.setTouchEmulationEnabled', {enabled:true, maxTouchPoints:1})
    await ready("document.querySelector('.rail-toc-handle')?.checkVisibility() && document.querySelector('.rail-toc-stops')?.clientHeight===0")
    const touch = await ev('return ('+measureOutline.toString()+')(true, 67)')
    assert.equal(touch.reads, 0, '触屏上的隐藏目录标记应停止测量正文')
    await click('.rail-toc-handle')
    await ready("document.querySelector('.toc-item.is-active')?.textContent.trim()==='章节 67'")
    await click('.toc-collapse-chip')
    await ready("document.querySelector('.rail-toc-stops')?.clientHeight===0")
    await send('Emulation.setTouchEmulationEnabled', {enabled:false})
    if (await ev("return !matchMedia('(hover:none), (pointer:coarse)').matches")) {
      await ready("document.querySelector('.rail-toc-stop.active')?.getAttribute('aria-label')==='章节 67'")
    }
    await click('.sidebar-toggle')
    await sleep(380)
    // Use a real keyboard event so :focus-visible follows keyboard modality.
    for (const type of ['keyDown','keyUp']) await send('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab'})
    await ev("document.querySelector('.kb-title-label').focus()")
    for (const type of ['keyDown','keyUp']) await send('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab'})
    assert(await ev("return document.activeElement.matches('.kb-list-btn') && getComputedStyle(document.activeElement).visibility==='visible'"), '收起时可用键盘访问知识库切换')
    await viewport(360)
    await ev("document.querySelector('.sidebar-toggle').focus()")
    await sleep(250)
    assert(await ev("return getComputedStyle(document.querySelector('.kb-list-btn')).visibility==='hidden'"), '紧凑触屏不可停在隐藏按钮')
    await media('reduce')
    await viewport(1180)
    if (await ev("return document.querySelector('.sidebar-toggle').getAttribute('aria-expanded')==='false'")) await click('.sidebar-toggle')
    await sleep(100)
    const reduced = await follow('.doc-row.is-on','.doc-row-blob',folder)
    assert(reduced.error<1 && reduced.distance>80, '减少动态时行与选择要一起就位')
    // Start the actual formatted recovery reader, then navigate through its outline.
    const fallbackFile = lib + '/00-资料/恢复阅读.md'
    fs.writeFileSync(path.join(root, fallbackFile), '# 恢复阅读\n\n' + chunks.join('\n'))
    await ev(`await window.__reader.loadTree()
      const Editor = window.__crepe.editor.constructor, make = Editor.make
      Editor.make = function(...args) {
        Editor.make = make
        const editor = make.apply(this,args)
        editor.create = async () => { throw Error('模拟启动失败') }
        return editor
      }
      await window.__reader.select(${JSON.stringify(fallbackFile)})`)
    await ready("document.querySelectorAll('.source-reading article h2').length===128")
    if (await ev("return document.querySelector('.toc-panel').classList.contains('is-collapsed')")) await click('.rail-toc-handle')
    await ready("document.querySelectorAll('.toc-item').length===129")
    await ev("document.querySelectorAll('.toc-item')[105].click()")
    await ready(`(() => { const t=document.querySelectorAll('.source-reading article h2')[104].getBoundingClientRect().top
      return Math.abs(t-document.getElementById('main-scroll-container').getBoundingClientRect().top-90)<2 })()`)
    await ready("document.querySelector('.toc-item.is-active')?.textContent.trim()==='章节 104'")

    // Keep all destinations in the same visible list. Library changes exercise
    // the real async switch; document changes exercise independent tree rows.
    const libraries = Array.from({length:8}, (_, i) => 'Motion ' + i)
    const entry = i => i === 1 ? '1.pdf' : i + '.md'
    for (const name of libraries) {
      const dir = path.join(root, name)
      fs.mkdirSync(dir)
      for (let i = 0; i < (name === libraries[0] ? 8 : 1); i++) {
        const file = path.join(dir, entry(i))
        if (i === 1) fs.copyFileSync(new URL('../../demo/产品白皮书.pdf', import.meta.url), file)
        else fs.writeFileSync(file, '# Note ' + i + '\n')
      }
    }
    await send('Page.navigate', {url:new URL('doc/Motion%200/0?lib=Motion%200', appUrl).href})
    await ready('window.__reader?.currentPath === "Motion 0/0.md" && !!document.querySelector(".ProseMirror")')
    if (await ev("return document.querySelector('.sidebar-toggle').getAttribute('aria-expanded')==='false'")) await click('.sidebar-toggle')
    if (!(await ev("return !!document.querySelector('.lib-panel')"))) await click('.kb-list-btn')
    await click('.tree-sort-control > button')
    await ev("const name = [...document.querySelectorAll('.tree-sort-control [role=menuitemradio]')].find(el => el.textContent.trim() === '按名称'); name.click()")
    for (const isLibrary of [false, true]) {
      const row = i => isLibrary ? '.lib-row[data-path="Motion ' + i + '"]' : '.doc-row[data-file="Motion 0/' + entry(i) + '"]'
      const marker = isLibrary ? '.lib-row-blob' : '.doc-row-blob'
      const sample = (from, to, reverse = false) => ev('return (' + sampleSelection.toString() + ')(...' +
        JSON.stringify([row(from), row(to), marker, isLibrary ? null : '.doc-title,.pdf-title', reverse]) + ')')
      await ready('!!document.querySelector(' + JSON.stringify(row(0) + ' ' + marker) + ')')
      await ev('document.querySelector(' + JSON.stringify(row(0)) + ').scrollIntoView({block:"start",behavior:"instant"})')
      await media('no-preference')
      const near = await sample(0, 1)
      assert(near.stretched && near.passedMiddle, marker + ' 相邻选择应有连续的伸展与收束 ' + JSON.stringify(near))
      const back = await sample(1, 0, true)
      assert(back.reversed && back.reversalJump <= 1, marker + ' 反向选择应从可见轮廓续接 ' + JSON.stringify(back))
      const far = await sample(1, 7)
      assert(!far.passedMiddle && far.fadedFrom && far.fadedTo, marker + ' 跨多行应在两端退场和出现 ' + JSON.stringify(far))
      await media('reduce')
      const quiet = await sample(7, 6)
      assert(!quiet.passedMiddle && !quiet.stretched && !quiet.fadedFrom && !quiet.fadedTo,
        marker + ' 减少动态时应直接落定 ' + JSON.stringify(quiet))
    }
  } finally {
    await send('Emulation.setTouchEmulationEnabled', {enabled:false})
    await media('no-preference')
    await send('Emulation.clearDeviceMetricsOverride')
  }
}
