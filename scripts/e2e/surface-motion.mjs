import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

async function measurePicker(trigger, selector) {
  const frames = []
  let start
  document.querySelector(trigger).click()
  await new Promise(resolve => {
    function record(time) {
      start ??= time
      const panel = document.querySelector(selector)
      if (panel) {
        const rect = panel.getBoundingClientRect()
        const style = getComputedStyle(panel)
        frames.push({ x: rect.x, width: rect.width, filter: style.filter, transform: style.transform })
      }
      if (time - start >= 320) resolve()
      else requestAnimationFrame(record)
    }
    requestAnimationFrame(record)
  })
  return frames
}

export async function verifySurfaceMotion({ send, ev, root, appUrl, sleep }) {
  const folder = '浮层动效'
  fs.mkdirSync(path.join(root, folder))
  fs.writeFileSync(path.join(root, folder, '样本.md'), '# 样本\n\n测试正文。\n')
  fs.copyFileSync(new URL('../../demo/产品白皮书.pdf', import.meta.url), path.join(root, folder, '样本.pdf'))
  async function ready(expression) {
    for (let i = 0; i < 100; i++) {
      if (await ev('return (' + expression + ')')) return
      await sleep(75)
    }
    throw Error('浮层测试未就绪 ' + expression)
  }
  async function navigate(file) {
    await send('Page.navigate', { url: new URL('doc/' + folder + '/' + file + '?lib=' + folder, appUrl).href })
  }

  await navigate('样本')
  await ready("document.querySelector('.ProseMirror > h1')?.textContent === '样本'")
  const trigger = '.page-header-controls button:last-child'
  const popup = '.cover-picker'
  for (const value of ['no-preference', 'reduce']) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] })
    try {
      const frames = await ev('return (' + measurePicker.toString() + ')(' + JSON.stringify(trigger) + ',' + JSON.stringify(popup) + ')')
      assert(frames.length > 1, '没有捕捉到封面选择器')
      const goal = frames.at(-1)
      for (const frame of frames) {
        assert(Math.abs(goal.x - frame.x) < 1 && Math.abs(goal.width - frame.width) < 1, '封面选项在淡入时移动')
        assert.equal(frame.filter, 'none', '浮层文字在淡入时被模糊')
        assert.equal(frame.transform, 'none', '选择器应在锚点原位淡入')
      }
      assert(await ev("return document.querySelector('.cover-picker').contains(document.activeElement)"))
      await ev("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}))")
      await ready("!document.querySelector('.cover-picker')")
    } finally {
      if (value === 'reduce') await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
    }
  }
  await navigate('样本.pdf')
  await ready("document.querySelector('.pdf-paper canvas')?.clientHeight > 200 && !!document.querySelector('.textLayer span')")
  const paperY = "return document.querySelector('.pdf-paper').getBoundingClientRect().top"
  const before = await ev(paperY)
  await ev("document.querySelector('.pdf-tool').click()")
  await ready("document.activeElement.matches('.pdf-search-field input')")
  assert(Math.abs(await ev(paperY) - before) < 1, '打开查找挤动了 PDF 页面')
  await ev("document.querySelector('[aria-label=\"关闭查找\"]').click()")
  await ready("!document.querySelector('.pdf-search-pop') && document.activeElement.matches('.pdf-tool')")
  assert(Math.abs(await ev(paperY) - before) < 1, '关闭查找挤动了 PDF 页面')
}
