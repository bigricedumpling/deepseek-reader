import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export async function verifyTabResume({ send, ev, root, appUrl, sleep }) {
  const library = '标签返回测试'
  const first = library + '/长文.md'
  const second = library + '/便笺.md'
  const middle = '定位段落，继续在这里编辑。'
  const before = '切走前'
  const after = '返回后'
  const offset = 5
  const textAtCaret = (insert) => middle.slice(0, offset) + insert + middle.slice(offset)
  const paragraphs = Array.from({ length: 220 }, (_, i) => {
    if (i === 110) return middle
    let paragraph = '第 ' + i + ' 段。这里记录阅读时的观察，以及下一次需要回看的问题。'
    if (i % 40 === 0) paragraph += ' 估算为 $x_i^2$。'
    if (i % 50 === 0) paragraph = '## 第 ' + i + ' 节\n\n' + paragraph + '\n\n| 指标 | 结果 |\n| --- | --- |\n| 检查 | 完成 |'
    return paragraph
  })
  const source = '# 长文\n\n' + paragraphs.join('\n\n') + '\n'
  const note = '# 便笺\n\n另一篇文档的原文。\n'
  fs.mkdirSync(path.join(root, library))
  fs.writeFileSync(path.join(root, first), source)
  fs.writeFileSync(path.join(root, second), note)

  async function until(description, read) {
    for (let i = 0; i < 90; i++) {
      if (await read()) return
      await sleep(100)
    }
    throw new Error('等待超时：' + description)
  }

  const view = 'window.__fold?.view()'
  const scroll = 'document.getElementById("main-scroll-container")'
  const ready = (file, content) => until(file + ' ' + content, () => ev(`
    return window.__reader?.currentPath === ${JSON.stringify(file)}
      && ${view}?.dom?.checkVisibility()
      && ${view}.dom.textContent.includes(${JSON.stringify(content)})
  `))
  async function click(selector) {
    // Recalculate after revealing the target, including when the tab strip scrolls.
    const point = await ev(`
      const item = document.querySelector(${JSON.stringify(selector)})
      if (!item) return null
      item.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})
      const rect = item.getBoundingClientRect()
      return {x:rect.left + rect.width / 2,y:rect.top + rect.height / 2}
    `)
    assert(point, '找不到 ' + selector)
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
  }
  async function placeCaret(text, at) {
    await ev(`
      const editor = ${view}
      const p = [...editor.dom.querySelectorAll('p')].find(n => n.textContent === ${JSON.stringify(text)})
      editor.focus()
      p.scrollIntoView({block:'center',behavior:'instant'})
      getSelection().collapse(p.firstChild, ${at})
      document.dispatchEvent(new Event('selectionchange'))
    `)
    await until('定位到指定段落', () => ev(`return ${view}.state.selection.$from.parentOffset === ${at}
      && ${view}.state.selection.$from.parent.textContent === ${JSON.stringify(text)}`))
  }
  async function historyKey(redo = false) {
    await ev(`${view}.focus()`)
    const modifiers = (process.platform === 'darwin' ? 4 : 2) | (redo ? 8 : 0)
    for (const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', { type, key: redo ? 'Z' : 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers })
    }
  }
  const tab = file => '.doc-tab-main[aria-label^="' + path.basename(file, '.md') + '"]'

  await send('Page.navigate', { url: new URL('doc/' + library + '/长文?lib=' + library, appUrl).href })
  await ready(first, middle)
  await ev(`await window.__reader.select(${JSON.stringify(second)})`)
  await ready(second, '另一篇文档的原文')
  await click(tab(first))
  await ready(first, middle)
  await placeCaret(middle, offset)
  await send('Input.insertText', { text: before })
  const top = await ev(`return ${scroll}.scrollTop`)
  assert(top > 200, '测试需要从文档中段切走')
  await click(tab(second))
  await ready(second, '另一篇文档的原文')
  await until('离开时保存输入', () => fs.readFileSync(path.join(root, first), 'utf8').includes(textAtCaret(before)))
  await click(tab(first))
  await ready(first, textAtCaret(before))
  await until('长文阅读位置恢复', () => ev(`return Math.abs(${scroll}.scrollTop - ${top}) <= 60`))
  const caret = await ev(`const pos = ${view}.state.selection.$from; return [pos.parent.textContent, pos.parentOffset]`)
  assert.deepEqual(caret, [textAtCaret(before), offset + before.length], '返回标签后应接着原来的位置编辑')
  await ev(`${view}.focus()`)
  await historyKey()
  await until('切回标签可撤销上次编辑', () => ev(`return !${view}.dom.textContent.includes(${JSON.stringify(before)})`))
  await click(tab(second))
  await ready(second, '另一篇文档的原文')
  await click(tab(first))
  await ready(first, middle)
  await historyKey(true)
  await until('跨标签保留重做', () => ev(`return ${view}.dom.textContent.includes(${JSON.stringify(textAtCaret(before))})`))
  await send('Input.insertText', { text: after })
  await click(tab(second))
  await ready(second, '另一篇文档的原文')
  await until('返回后继续输入并保存', () => fs.readFileSync(path.join(root, first), 'utf8').includes(textAtCaret(before + after)))
  assert.equal(fs.readFileSync(path.join(root, second), 'utf8'), note, '另一篇文档被意外改动')

  async function getDocument(file) {
    const response = await fetch(new URL('api/doc?path=' + encodeURIComponent(file), appUrl))
    const result = await response.json()
    assert(result.ok, JSON.stringify(result))
    return result.data
  }
  const original = await getDocument(first)
  const external = '其他编辑者的新正文'
  const externalParagraphs = Array.from({ length: 180 }, (_, i) => i === 90 ? external : '外部更新后的第 ' + i + ' 段。')
  fs.writeFileSync(path.join(root, first), '# 长文\n\n' + externalParagraphs.join('\n\n') + '\n')
  await click(tab(first))
  await ready(first, external)
  assert(!await ev(`return ${view}.dom.textContent.includes(${JSON.stringify(middle.slice(0, offset))})`), '外部修改后仍显示旧正文')

  await historyKey()
  assert(await ev(`return ${view}.dom.textContent.includes(${JSON.stringify(external)}) && !${view}.dom.textContent.includes(${JSON.stringify(before)})`), '外部修订不可撤回到上次打开的版本')

  // A second client replaces the parked file with identical bytes. Its path, text
  // and revision still match; only the document identity has changed.
  await placeCaret(external, 4)
  assert(await ev(`return ${scroll}.scrollTop > ${scroll}.clientHeight`), '旧文档切走前应已滚动超过一屏')
  await click(tab(second))
  await ready(second, '另一篇文档的原文')
  const parked = await getDocument(first)
  async function writeAsOtherClient(method, payload) {
    const response = await fetch(new URL('api/doc', appUrl), {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    })
    const result = await response.json()
    assert(result.ok, JSON.stringify(result))
    return result.data
  }
  await writeAsOtherClient('DELETE', { path: first })
  const recreated = await writeAsOtherClient('POST', { dir: library, name: '长文', content: parked.content })
  assert.equal(recreated.file, first)
  assert.equal(recreated.revision, parked.revision)
  assert.notEqual(recreated.id, original.id)
  assert.equal(await ev(`return window.__reader.allFiles.find(f => f.file === ${JSON.stringify(first)})?.id`),
    original.id, '侧栏尚未刷新时也应能分辨新文件')

  await click(tab(first))
  await ready(first, external)
  assert.equal(await ev('return window.__reader.currentSourceId'), recreated.id, '标签应指向实际读取的新文档')
  const position = await ev(`const pos = ${view}.state.selection.$from; return [pos.parent.textContent, pos.parentOffset]`)
  assert.notDeepEqual(position, [external, 4], '新文档不应继承旧文档的光标')
  const recreatedTop = await ev(`
    // Let the asynchronous reader settle before sampling the replacement's position.
    for (let frame = 0; frame < 6; frame++) await new Promise(requestAnimationFrame)
    return ${scroll}.scrollTop
  `)
  assert(recreatedTop < 10, '新文档应从顶部打开，实际 scrollTop=' + recreatedTop)
}
