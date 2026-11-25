import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function recordTabFrames({files, actions, trackHandoff}) {
  const strip = document.querySelector('.doc-tabs')
  const tabFile = button => button.title || button.dataset.tooltip
  const canShapeWaist = typeof CSS.registerProperty === 'function' &&
    CSS.supports('clip-path', 'shape(from 0 0, curve to 100% 0 with 25% 0 / 75% 0, close)')
  const frames = []
  let actionIndex = 0
  let actionFrame = 0
  let endedAt = null
  return new Promise((resolve, reject) => {
    function tick(time) {
      const active = strip.querySelector('.doc-tab.is-active')
      const marker = active?.querySelector('.doc-tab-indicator:not(.is-departing)')
      if (!marker) { reject(Error('缺少选中标签背景')); return }
      // Content coordinates stay stable when the tab strip scrolls.
      const stripLeft = strip.getBoundingClientRect().left
      const origin = stripLeft - strip.scrollLeft
      const box = active.getBoundingClientRect()
      const fill = marker.getBoundingClientRect()
      const style = getComputedStyle(marker)
      const frame = {
        time, active: files.indexOf(tabFile(active.querySelector('.doc-tab-main'))),
        left: fill.left - origin, right: fill.right - origin, height: fill.height,
        goalLeft: box.left - origin + parseFloat(style.left),
        goalRight: box.right - origin - parseFloat(style.right),
        goalHeight: box.height - parseFloat(style.top) - parseFloat(style.bottom),
        contour: canShapeWaist ? style.clipPath : null,
        waist: parseFloat(style.getPropertyValue('--tab-waist')) || 0,
        opacity: Number(style.opacity), scroll: strip.scrollLeft, viewport: strip.clientWidth, stripLeft,
        chipGap: stripLeft - document.querySelector('.side-header').getBoundingClientRect().right
      }
      const departing = trackHandoff ? strip.querySelector('.doc-tab-indicator.is-departing') : null
      if (trackHandoff) {
        frame.tabPositions = [...strip.querySelectorAll('.doc-tab')].map(el => el.getBoundingClientRect().left - origin)
        const firstOpacity = el => {
          const value = el.getAnimations()[0]?.effect.getKeyframes()[0].opacity
          return value == null ? null : Number(value)
        }
        frame.initialOpacity = firstOpacity(marker)
        frame.departures = [...strip.querySelectorAll('.doc-tab-indicator')].filter(el => el !== marker).map(el => {
          const rect = el.getBoundingClientRect()
          return {left:rect.left - origin, right:rect.right - origin,
            opacity:Number(getComputedStyle(el).opacity), initialOpacity:firstOpacity(el)}
        })
      }
      frames.push(frame)
      const action = actions[actionIndex]
      // Reverse while the old marker is visibly in flight; normal navigation
      // includes an async document load whose duration depends on the machine.
      const first = frames[actionFrame]
      const travel = Math.abs(frame.goalRight - first.right)
      const inFlight = frame.active === actions[actionIndex - 1]?.to && travel > 8 &&
        Math.abs(frame.right - first.right) >= travel * .18
      const handoff = action?.duringHandoff && frame.active === actions[actionIndex - 1]?.to &&
        frame.departures?.some(fill => fill.opacity > first.opacity * .08 && fill.opacity < first.opacity * .92)
      if (action && (!actionIndex || (action.duringHandoff ? handoff : inFlight))) {
        const button = [...strip.querySelectorAll('.doc-tab-main')].find(el => tabFile(el) === files[action.to])
        if (!button) { reject(Error('找不到目标标签')); return }
        if (action.duringHandoff) {
          // Hold a partially painted frame while the real document loads. A
          // slow runner must still exercise interruption of both endpoints.
          for (const el of [marker, departing]) {
            const animation = el.getAnimations()[0]
            animation.pause()
            animation.currentTime = animation.effect.getTiming().duration * .4
          }
          frame.interrupted = [Number(getComputedStyle(marker).opacity), Number(getComputedStyle(departing).opacity)]
        }
        frame.action = actionIndex
        actionFrame = frames.length - 1
        actionIndex++
        if (action.close) button.closest('.doc-tab').querySelector('.doc-tab-x').click()
        else button.click()
        if (actionIndex === actions.length) endedAt = time
      }
      if (endedAt !== null && time - endedAt >= 550) resolve(frames)
      else if (time - frames[0].time > 3500) reject(Error('标签切换未完成'))
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

export async function verifyTabMotion({send, ev, root, appUrl, sleep}) {
  const lib = '标签背景测试'
  const otherLib = '跨知识库资料与交互设计参考文档集合'
  const files = ['S14', '跨文档导航与原文排版验证', '00-索引', '调查记录一', '调查记录二', '调查记录三', '来源说明', '00-索引']
    .map((name, i) => (i === 1 || i === 7 ? otherLib : lib) + '/' + name + '.md')
  for (const library of [lib, otherLib]) fs.mkdirSync(path.join(root, library))
  for (const file of files) fs.writeFileSync(path.join(root, file), '# ' + path.basename(file, '.md') + '\n\n' + file + '\n')
  const media = value => send('Emulation.setEmulatedMedia', {features:[{ name:'prefers-reduced-motion', value }]})
  const settle = () => sleep(400)
  const capture = (actions, trackHandoff = false) => ev('return await (' + recordTabFrames.toString() + ')(' + JSON.stringify({files, actions, trackHandoff}) + ')')
  async function readerShows(file) {
    const library = file.split('/')[0]
    const current = await ev(`return {
      file:window.__reader.currentPath, library:document.querySelector('.kb-title-text')?.textContent,
      text:document.querySelector('.ProseMirror')?.textContent, url:decodeURIComponent(location.pathname),
      query:new URL(location.href).searchParams.get('lib')
    }`)
    assert(current.file === file && current.library === library && current.text?.includes(file) &&
      current.url.endsWith('/' + file.slice(0,-3)) && current.query === library, '跨库切换后正文、侧栏和地址应指向同一份文档 ' + file)
  }
  function aligned(frame, expected) {
    assert.equal(frame.active, expected, '选中目标出错')
    assert(Math.abs(frame.left - frame.goalLeft) <= 1 && Math.abs(frame.right - frame.goalRight) <= 1,
      '选中背景与目标标签未对齐')
    assert(Math.abs(frame.height - frame.goalHeight) <= .5, '选中背景停稳后仍然变扁')
  }

  function checkLiquidTravel(frames, from, to) {
    const first = frames[0], last = frames.at(-1)
    aligned(first, from)
    aligned(last, to)
    const center = f => (f.left + f.right) / 2
    const width = f => f.right - f.left
    const distance = center(last) - center(first)
    const direction = Math.sign(distance)
    assert(Math.abs(width(last) - width(first)) > 40, '夹具应包含明显不同宽度的标签')

    // A wider destination expands even a rigid marker. Compare both widths at
    // the same center position to isolate the stretch caused by a trailing edge.
    const stretch = []
    const squeeze = []
    for (let i = 1; i < frames.length; i++) {
      const f = frames[i]
      const progress = (center(f) - center(first)) / distance
      const rigidWidth = width(first) + (width(last) - width(first)) * progress
      if (progress > .02 && progress < .98) {
        stretch.push(width(f) - rigidWidth)
        squeeze.push(f.goalHeight - f.height)
      }
      for (const side of ['left', 'right']) {
        assert((f[side] - frames[i - 1][side]) * direction >= -1, '背景边缘在途中反向抖动')
        assert((f[side] - last[side]) * direction <= 1, '背景边缘越过目标')
      }
    }
    assert(stretch.length >= 2, '相邻标签背景直接跳到了终点')
    assert(Math.max(...stretch) >= 3 && Math.min(...stretch) >= -1, '未呈现沿前进方向的拖尾')
    if (last.contour !== null) {
      // WebKit can animate the custom length while keeping the resolved clip
      // frozen when var() is placed directly in a WAAPI clip-path keyframe.
      const movingCurves = frames.filter(f => f.waist > .2 && f.contour !== 'none').map(f => f.contour)
      assert(new Set(movingCurves).size >= 2, '腰深变化时，背景实际裁剪轮廓应随之变化')
      assert.equal(last.contour, 'none', '停稳后应释放裁剪并恢复标签原有圆角')
    }
    assert(Math.max(...stretch) <= 24, '背景拖尾过长')
    assert(Math.max(...squeeze) >= .35 && Math.max(...squeeze) <= 3, '背景应轻微收窄再恢复原高')
  }

  await media('no-preference')
  try {
    await send('Page.navigate', {url:new URL('doc/' + files[0].slice(0,-3) + '?lib=' + lib, appUrl).href})
    let ready = false
    for (let i = 0; i < 100 && !ready; i++) {
      ready = await ev(`return window.__reader?.currentPath === ${JSON.stringify(files[0])} && !!window.__fold?.view()?.dom?.checkVisibility()`)
      if (!ready) await sleep(100)
    }
    assert(ready, '测试文档未打开')
    await ev(`const s = window.__reader; for (const file of s.tabs.slice()) if (file !== s.currentPath) s.closeTab(file)`)
    for (const file of files.slice(1,3)) await ev('await window.__reader.select(' + JSON.stringify(file) + ')')
    await ev('await window.__reader.select(' + JSON.stringify(files[0]) + '); await document.fonts.ready')
    await settle()

    await ev(`const toggle = document.querySelector('.sidebar-toggle')
      if (toggle.getAttribute('aria-expanded') === 'true') toggle.click()`)
    await settle()
    const forward = await capture([{to:1}])
    checkLiquidTravel(forward, 0, 1)
    assert(Math.abs(forward[0].stripLeft - forward.at(-1).stripLeft) > 10 &&
      forward.every(frame => Math.abs(frame.chipGap - forward[0].chipGap) <= 1 && frame.chipGap <= 12),
      '相邻标签跨库时，标签栏应跟随变宽或变窄的库名并保持紧凑间距')
    await readerShows(files[1])
    const backward = await capture([{to:0}])
    checkLiquidTravel(backward, 1, 0)
    await ev('await window.__reader.select(' + JSON.stringify(files[1]) + ')')
    await settle()

    const reverse = await capture([{to:0}, {to:1}])
    const turn = reverse.findIndex(f => f.action === 1)
    const oldTarget = reverse[turn]
    assert(turn > 0 && Math.abs(oldTarget.right - oldTarget.goalRight) > 12, '未测到途中反向')
    const resumed = reverse.slice(turn + 1).findIndex(f => f.active === 1)
    assert(resumed >= 0)
    const change = turn + 1 + resumed
    for (const side of ['left','right']) {
      const span = Math.abs(reverse[0][side] - oldTarget[side === 'left' ? 'goalLeft' : 'goalRight'])
      const jump = Math.abs(reverse[change][side] - reverse[change - 1][side])
      const dt = reverse[change].time - reverse[change - 1].time
      if (dt < 35) assert(jump < Math.max(3, span * dt / 70), '打断动画时从过期位置重新起步')
    }
    aligned(reverse.at(-1), 1)

    // B closes while C moves into its slot. Combining C's layout shift with a
    // second selection translation used to fling the fill underneath A.
    const middle = await capture([{to:1, close:true}])
    const oldLeft = middle[0].left
    aligned(middle[0], 1)
    aligned(middle.at(-1), 2)
    assert(Math.abs(middle.at(-1).left - oldLeft) < 1, '右侧的标签应接替原位置')
    assert(middle.every(f => f.left >= oldLeft - 1), '关闭中间标签时选中背景越过左侧邻居')

    await ev('await window.__reader.select(' + JSON.stringify(files[1]) + ')')
    await settle()
    const closing = await capture([{to:0, close:true}])
    assert(closing[0].left - closing.at(-1).left > 30, '关闭左邻居应释放标签空间')
    for (const frame of closing) aligned(frame,1)

    for (const file of files.slice(3)) await ev('await window.__reader.select(' + JSON.stringify(file) + ')')
    // Both endpoints must be visible, otherwise scrolling masks a sweep across
    // the middle tabs and the offscreen fast path can hide the regression.
    await send('Emulation.setDeviceMetricsOverride', {width:1920,height:900,deviceScaleFactor:1,mobile:false})
    await settle()
    const far = await capture([{to:2}], true)
    const source = far[0], target = far.at(-1)
    aligned(source, 7)
    aligned(target, 2)
    assert(source.right <= source.scroll + source.viewport + 1 && target.left >= source.scroll - 1 &&
      source.left - target.right > 260, '远距用例需要两个同时可见且中间隔着多个标签的端点')
    const near = (fill, endpoint) => Math.max(Math.abs(fill.left - endpoint.left), Math.abs(fill.right - endpoint.right)) <= 16
    const fading = (fill, endpoint) => fill.opacity > endpoint.opacity * .02 && fill.opacity < endpoint.opacity * .98
    for (const frame of far) {
      assert(Math.abs(frame.scroll - source.scroll) < 1, '同屏切换不应带动整条标签栏滚动')
      assert(frame.tabPositions.length === source.tabPositions.length &&
        frame.tabPositions.every((left,i) => Math.abs(left-source.tabPositions[i]) <= 1), '远距跨库切换不应让其他标签跳动')
      const fills = [frame, ...frame.departures].filter(fill => fill.opacity > source.opacity * .02)
      assert(fills.every(fill => near(fill, source) || near(fill, target)), '远距高亮扫过了无关标签')
    }
    assert(far.some(frame => frame.departures.some(fill => near(fill, source) && fading(fill, source))), '旧位置应有退场')
    assert(far.some(frame => frame.active === 2 && near(frame, target) && fading(frame, target)), '目标位置应有落定')
    assert.equal(target.departures.length, 0, '停稳后仍有多余的高亮')
    await readerShows(files[2])

    const returnTrip = await capture([{to:7}, {to:2, duringHandoff:true}], true)
    aligned(returnTrip.at(-1), 2)
    const interruption = returnTrip.find(f => f.interrupted).interrupted
    const resumedHandoff = returnTrip.find(f => f.active === 2 && f.initialOpacity !== null && f.departures.length)
    assert(resumedHandoff && Math.abs(resumedHandoff.initialOpacity - interruption[1]) <= .001 &&
      Math.abs(resumedHandoff.departures[0].initialOpacity - interruption[0]) <= .001, '远距折返时两端应保持当前透明度')
    assert(returnTrip.every(frame => frame.departures.length <= 1 &&
      [frame, ...frame.departures].every(fill => near(fill, source) || near(fill, target))),
      '远距切换中途折返时应在两端衔接，且最多保留一个退场背景')
    assert.equal(returnTrip.at(-1).departures.length, 0, '折返完成后仍有退场残影')

    await media('reduce')
    const quietFar = await capture([{to:7}], true)
    for (const frame of quietFar) {
      aligned(frame, frame.active)
      assert(frame.departures.length === 0 && Math.abs(frame.opacity - source.opacity) < .01, '减少动态时远距选择应直接就位')
    }
    await media('no-preference')
    await send('Emulation.clearDeviceMetricsOverride')
    const strip = await ev(`const strip = document.querySelector('.doc-tabs'); strip.style.maxWidth = '250px'; return strip.scrollWidth`)
    assert(strip > 250, '滚动夹具不够宽')
    await settle()
    await ev(`document.querySelector('.doc-tabs').scrollLeft = 0`)
    const scrolled = await capture([{to:6}])
    const visible = scrolled.at(-1)
    aligned(visible,6)
    assert(visible.scroll > 10 && visible.left >= visible.scroll - 1 && visible.right <= visible.scroll + visible.viewport + 1,
      '屏幕外选中的标签应滚到视窗内')

    await ev('await window.__reader.select(' + JSON.stringify(files[2]) + ')')
    await settle()
    const offscreen = await ev(`const strip = document.querySelector('.doc-tabs')
      const file = [...strip.querySelectorAll('.doc-tab')].find(tab => {
        const delta = tab.offsetLeft + tab.offsetWidth + 10 - strip.clientWidth - strip.scrollLeft
        return delta > 110 && delta < strip.clientWidth - 10
      })?.querySelector('.doc-tab-main')
      return file?.title || file?.dataset.tooltip`)
    const outside = files.indexOf(offscreen)
    assert(outside >= 0, '需要一个距视窗边缘适中、会触发自动滚动的标签')
    const follow = await capture([{to:outside}])
    aligned(follow.at(-1), outside)
    const fromScroll = follow[0].scroll, toScroll = follow.at(-1).scroll
    assert(toScroll - fromScroll > 96 && toScroll - fromScroll < follow[0].viewport, '自动滚动测试需要介于 96 像素和一屏之间的位移')
    assert(follow.every(f => Math.abs(f.scroll - fromScroll) <= 1 || Math.abs(f.scroll - toScroll) <= 1),
      '远处标签的自动滚动不应高速扫过中间一排标签')

    await media('reduce')
    const reduced = await capture([{to:5}])
    for (const f of reduced) aligned(f,f.active)
    aligned(reduced.at(-1),5)

    const longLibrary = '排版研究（文献、摘录与写作示例）'
    const duplicate = longLibrary + '/00-索引.md'
    fs.mkdirSync(path.join(root, longLibrary))
    fs.writeFileSync(path.join(root, duplicate), '# 同名文档\n')
    await ev(`document.querySelector('.doc-tabs').style.removeProperty('max-width')
      await window.__reader.select(${JSON.stringify(duplicate)})`)
    for (const icon of ['', 'icon:draft']) {
      if (icon) await ev('await window.__reader.savePageMeta({icon:' + JSON.stringify(icon) + '})')
      for (const width of [1440, 390, 320]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height:800, deviceScaleFactor:1, mobile:width < 500 })
        await settle()
        const layout = await ev(`const tab = document.querySelector('.doc-tab.is-active.has-context')
          const main = tab.querySelector('.doc-tab-main')
          const icon = main.querySelector('.content-icon')
          const context = main.querySelector('.doc-tab-context')
          const contextBox = context.getBoundingClientRect()
          const dot = main.querySelector('.doc-tab-dot').getBoundingClientRect()
          const close = tab.querySelector('.doc-tab-x').getBoundingClientRect()
          return { iconWidth:icon?.getBoundingClientRect().width || 0, label:main.getAttribute('aria-label'), clipped:context.scrollWidth > context.clientWidth,
            gap:close.left - contextBox.right, dotGap:dot.left - contextBox.right, closeGap:close.left - dot.right }`)
        assert.equal(layout.iconWidth, icon ? 16 : 0, '自定义图标保持原尺寸，纯文字标签无图标')
        assert(layout.clipped && layout.label.includes(longLibrary), '同名文件的长库名应缩略，并保留完整可访问名称')
        assert(layout.gap >= 0 && layout.gap <= 16, '同名标签的库名和关闭按钮间不应有多余空白 ' + width + 'px ' + JSON.stringify(layout))
        assert(layout.dotGap >= 1 && layout.closeGap >= 1, '保存状态点应有自己的位置，避免遮住库名或关闭按钮 ' + width + 'px ' + JSON.stringify(layout))
      }
    }
  } finally {
    await send('Emulation.clearDeviceMetricsOverride')
    await media('no-preference')
  }
}
