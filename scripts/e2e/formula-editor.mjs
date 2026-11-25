import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

export async function runFormulaEditor({ send, ev, root, appUrl, sleep }) {
  await send('Emulation.clearDeviceMetricsOverride')
  await send('Emulation.setTouchEmulationEnabled', { enabled: false })
  const source = [
    '\uFEFF# 测试公式', '', '甲 $\\frac{1}{x}$ 乙 \\(x+y\\)。', '',
    '$$', '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', '$$', '',
    '\\[y^2\\]', '', '$$z+1$$ (3)', '', '$$z\\tag{4}$$ (4)', '', '关系 $x<y>z$。', '', '前一行', '$$z_2$$ (S_1)', '下一行', '', '> - $$', '>   a+b', '>   $$', '', '$x$$y$', '', '[^1]: $x_i$', '', '另见[^1] 和 https://a.example/$p$/test 。', '', '```latex', '\\frac{demo}{only}', '```', '', '**加粗** 和 _斜体_。', '', '😀 $long_{value}$ 后接 __强调__ 和 *示例*。', '',
    '| 格式 | 内容 |', '| --- | --- |', '| **结果** | $a+b$ 后有 *注释* |', '', '尾段', ''
  ].join('\n')
  const file = path.join(root, '内容', '公式编辑.md')
  fs.writeFileSync(file,source)
  async function until(read) {
    for (let n = 0; n < 70; n++) { if (await read()) return; await sleep(100) }
    throw Error('等待公式状态超时：' + read.toString())
  }
  async function open(name = '公式编辑') {
    // Disk writes finish before the client receives its save acknowledgement.
    // Wait for both sides before exercising a real browser navigation.
    await until(() => ev('return !window.__reader?.isDirty && !window.__reader?.saving'))
    const previousPage = await ev('return performance.timeOrigin')
    await send('Page.navigate', { url: new URL('doc/内容/' + name + '?lib=内容', appUrl).href })
    const target = JSON.stringify('内容/' + name + '.md')
    const heading = JSON.stringify(name === '分栏公式' ? '# 分栏' : '# 测试公式')
    await until(() => ev(`return performance.timeOrigin !== ${previousPage}
      && window.__reader?.currentPath === ${target}
      && window.__baseline?.trimStart().startsWith(${heading})
      && window.__baseline.includes('尾段') && !!window.__fold?.view()`))
  }
  async function clickFormula(value, keyboard = false) {
    const found = await ev(`const node = [...document.querySelectorAll('.ProseMirror [data-math-display]')].find(node => node.dataset.value === ${JSON.stringify(value)})
      if (!node) return false
      if (${keyboard}) { node.focus(); node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) }
      else node.dispatchEvent(new PointerEvent('pointerdown', {button:0,bubbles:true}))
      return true`)
    assert(found, value)
    await until(() => ev('return !!document.querySelector("#formula-source")'))
  }
  async function typeFormula(value) {
    await ev(`const t = document.querySelector('#formula-source'); t.value = ${JSON.stringify(value)}; t.dispatchEvent(new Event('input',{bubbles:true}))`)
  }
  async function apply() {
    await ev("document.querySelector('.formula-editor footer button:last-child').click()")
    await until(() => ev("return !document.querySelector('.formula-editor')"))
  }
  await open()
  assert(await ev("return document.querySelector('.crepe-host').getBoundingClientRect().width > 0"))
  assert.deepEqual(await ev("return [...document.querySelectorAll('.ProseMirror [data-math-display]')].map(e=>e.dataset.mathDisplay)"),
    ['false','false','true','true','true','true','false','true','true','false','false','false','false','false'])
  assert.deepEqual(await ev("return [...document.querySelectorAll('.ProseMirror .math-number')].map(n=>n.textContent)"), ['(3)','(S_1)'])
  assert.equal(await ev("return document.querySelectorAll('.ProseMirror .katex-tag').length"), 1)
  assert.equal(await ev("return document.querySelectorAll('.ProseMirror .milkdown-code-block').length"),1)
  assert.deepEqual(await ev("return [...document.querySelectorAll('.ProseMirror strong')].map(n=>n.textContent)"), ['加粗','强调','结果'])
  assert.deepEqual(await ev("return [...document.querySelectorAll('.ProseMirror em')].map(n=>n.textContent)"), ['斜体','示例','注释'])
  await clickFormula('x+y')
  assert.equal(await ev("return document.querySelectorAll('.formula-preview .katex-display').length"),0)
  await typeFormula('\\frac{')
  assert(await ev("return document.querySelector('.formula-editor footer button:last-child').disabled"))
  assert(await ev("return document.querySelector('#formula-source').getAttribute('aria-invalid')==='true' && !!document.querySelector('#formula-error')?.innerText.trim()"))
  await ev("document.querySelector('.formula-editor footer button:first-child').click()")
  await until(() => ev("return !document.querySelector('.formula-editor')"))
  assert.equal(fs.readFileSync(file,'utf8'), source)
  await clickFormula('x+y',true)
  const inline = '\\sqrt{a}+\\{b\\}'
  await typeFormula(inline); await apply()
  await until(() => fs.readFileSync(file,'utf8').includes(inline))
  const firstEdit = source.replace('x+y',inline)
  assert.equal(fs.readFileSync(file,'utf8'), firstEdit)
  // Use the same key sequence as a person in the editor.
  const meta = process.platform === 'darwin' ? 4 : 2
  await send('Input.dispatchKeyEvent', {type:'keyDown', key:'z', code:'KeyZ', modifiers:meta, windowsVirtualKeyCode:90})
  await send('Input.dispatchKeyEvent', {type:'keyUp', key:'z', code:'KeyZ', modifiers:meta, windowsVirtualKeyCode:90})
  await until(() => fs.readFileSync(file,'utf8')===source)
  await clickFormula('y^2')
  assert.equal(await ev("return document.querySelectorAll('.formula-preview .katex-display').length"),1)
  const block = '\\begin{aligned}a&=b\\\\c&=d\\end{aligned}'
  await typeFormula(block); await apply()
  const blockEdit = source.replace('y^2',block)
  await until(() => fs.readFileSync(file,'utf8').includes(block))
  assert.equal(fs.readFileSync(file,'utf8'),blockEdit)
  await open()
  assert(await ev(`return [...document.querySelectorAll('.ProseMirror [data-type=reader_math_block]')].some(n=>n.dataset.value===${JSON.stringify(block)}&&n.querySelector('.katex .mtable'))`))
  // Create a new display formula by typing two dollars and pressing Enter.
  await ev("const pm=document.querySelector('.crepe-host .ProseMirror'),end=[...pm.querySelectorAll('p')].at(-1);pm.focus();getSelection().collapse(end,end.childNodes.length)")
  const enter = async () => {
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
  }
  await enter()
  await send('Input.insertText',{text:'$$'})
  await enter()
  await until(() => ev("return !!document.querySelector('#formula-source')"))
  await typeFormula('k^3'); await apply()
  await until(() => fs.readFileSync(file,'utf8').includes('$$\nk^3\n$$'))
  await open()
  assert(await ev("return [...document.querySelectorAll('[data-type=reader_math_block]')].some(n=>n.dataset.value==='k^3')"))
  const cursorAfterTail = () => ev("const pm=document.querySelector('.crepe-host .ProseMirror'),end=[...pm.querySelectorAll('p')].find(p=>p.textContent==='尾段');pm.focus();getSelection().collapse(end,end.childNodes.length)")
  await cursorAfterTail()
  await enter()
  await send('Input.insertText',{text:'/'})
  await until(() => ev("return !!document.querySelector('.milkdown-slash-menu [data-index]')"))
  assert(await ev("const menu=document.querySelector('.milkdown-slash-menu'), item=[...menu.querySelectorAll('li[data-index]')].find(n=>n.textContent.trim()==='公式'); if(!item)return false; item.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));item.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));return true"))
  await until(() => ev("return !!document.querySelector('#formula-source')"))
  await typeFormula('m+n'); await apply()
  await until(() => fs.readFileSync(file,'utf8').includes('$$\nm+n\n$$'))
  await cursorAfterTail()
  await enter()
  await send('Input.insertText',{text:'q+1'})
  await ev("const pm=document.querySelector('.ProseMirror'),t=[...pm.querySelectorAll('p')].find(p=>p.textContent==='q+1').firstChild;pm.focus();getSelection().setBaseAndExtent(t,0,t,3);document.dispatchEvent(new Event('selectionchange'))")
  await until(() => ev("return !!document.querySelector('[data-toolbar-item=latex]')?.getClientRects().length"))
  await ev("document.querySelector('[data-toolbar-item=latex]').dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}))")
  await until(() => ev("return document.querySelector('#formula-source')?.value==='q+1'"))
  await apply()
  await until(() => fs.readFileSync(file,'utf8').includes('$q+1$'))
  await cursorAfterTail()
  await enter()
  for (const char of '$u^2$') await send('Input.insertText',{text:char})
  await until(() => ev("return [...document.querySelectorAll('[data-type=math_inline]')].some(n=>n.dataset.value==='u^2')"))
  await until(() => fs.readFileSync(file,'utf8').includes('$u^2$'))
  await open()
  assert(await ev("return [...document.querySelectorAll('[data-type=math_inline]')].some(n=>n.dataset.value==='u^2' && n.querySelector('.katex'))"))
  // A column is a Markdown string inside JSON. Verify untouched strings,
  // metadata, compact formatting, and the outer fence survive a formula edit.
  const columnsFile = path.join(root, '内容', '分栏公式.md')
  const columnsSource = [
    '# 分栏', '', '文首 $k$', '', '~~~~reader-columns',
    '{"version":1, "columns":["左 $a_i$","右 \\\\[b_j\\\\]"],"custom":"保留"}', '~~~~', '', '尾段', ''
  ].join('\n')
  fs.writeFileSync(columnsFile, columnsSource)
  await open('分栏公式')
  assert(await ev("return document.querySelector('.crepe-host').getBoundingClientRect().width>0"))
  assert.deepEqual(await ev("return [...document.querySelectorAll('.reader-columns [data-math-display]')].map(n=>n.dataset.value)"),['a_i','b_j'])
  await clickFormula('a_i')
  await typeFormula('a_j'); await apply()
  await until(() => fs.readFileSync(columnsFile,'utf8').includes('$a_j$'))
  assert.equal(fs.readFileSync(columnsFile,'utf8'), columnsSource.replace('$a_i$', '$a_j$'))
  await open('分栏公式')
  assert.deepEqual(await ev("return [...document.querySelectorAll('.reader-columns [data-math-display]')].map(n=>n.dataset.value)"),['a_j','b_j'])
  console.log('PASS: editor formula source, display, labels, invalid input, cancel, undo, toolbar/slash/typed input, disk save and reopen')
}
