import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const flow = 'flowchart TD\n  A[Inputs] --> B[Draft]\n  B --> C[Review]'
const broken = 'flowchart TD\n  A[Unclosed'
const mindmap = 'mindmap\n  root((Ideas))\n    Research\n      Sources\n    Writing'
const sequence = 'sequenceDiagram\n  User->>Editor: Save now\n  Editor-->>User: Done'
const fence = source => ['```mermaid', source, '```'].join('\n')

export async function verifyMermaid({ send, ev, root, appUrl, sleep }) {
  const lib = 'Diagram study'
  const file = path.join(root, lib, 'Diagrams.md')
  const original = ['# Diagrams', fence(flow), fence(broken), fence(mindmap), fence(sequence), 'End of notes.'].join('\n\n') + '\n'
  fs.mkdirSync(path.dirname(file))
  fs.writeFileSync(file, original)
  const disk = () => fs.readFileSync(file, 'utf8')
  const route = type => new URL(type + '/' + lib + '/Diagrams?lib=' + encodeURIComponent(lib), appUrl).href
  async function wait(label, test) {
    for (let i = 0; i < 180; i++) {
      if (await test()) return
      await sleep(80)
    }
    const visible = await ev(`return [...document.querySelectorAll('.ProseMirror .milkdown-code-block')].map(block=>({ source: block.querySelector('code,.cm-content')?.textContent.slice(0,60), svg: !!block.querySelector('.mermaid-preview svg'), error: !!block.querySelector('.mermaid-preview-error') }))`)
    throw Error('Mermaid: ' + label + ' blocks=' + JSON.stringify(visible))
  }
  const blockAt = index => "document.querySelectorAll('.ProseMirror .milkdown-code-block')[" + index + "]"
  async function inspectBlock(index, words, options) {
    const target = blockAt(index)
    const label = (options.narrow ? 'read-only ' : '') + (words ? words.join(', ') : 'syntax error')
    // Crepe mounts code blocks as they approach the viewport and retires distant ones.
    // Check each in reading order, including when a preceding diagram increases the page height.
    await wait(label, async () => {
      const state = await ev(`const block=${target}
        if (!block) return null
        block.scrollIntoView({block:'center', behavior:'instant'})
        const svg=block.querySelector('.mermaid-preview > svg'), source=block.querySelector('.cm-content')
        const bounds=svg?.getBoundingClientRect()
        return { error:!!block.querySelector('.mermaid-preview-error'),
          labels: svg && [...svg.querySelectorAll('text, foreignObject')].map(n=>n.textContent.trim()).join(' '),
          sourceHidden: source && !source.checkVisibility(),
          fits: bounds && bounds.height>0 && bounds.width>0 && bounds.width<=innerWidth+1 }`)
      if (!state) return false
      if (!words) return state.error
      return !state.error && words.every(word => state.labels?.includes(word)) &&
        (!options.previewOnly || state.sourceHidden) && (!options.narrow || state.fits)
    })
  }
  async function diagramsReady(edited = false, withTemplate = false, options = {}) {
    const expected = [['Inputs', edited ? 'Ready' : 'Draft', 'Review'], null,
      ['Ideas','Research','Sources','Writing'], ['Save now','Done']]
    if (withTemplate) expected.push(['下一步'])
    for (const [index, words] of expected.entries()) await inspectBlock(index, words, options)
  }

  await send('Page.navigate', { url: route('doc') })
  await diagramsReady(false, false, {previewOnly:true})
  assert(await ev('return !window.__reader.isDirty'))
  assert.equal(disk(), original, 'drawing the diagrams changed the authored file')

  const block = "document.querySelector('.ProseMirror .milkdown-code-block')"
  await ev(block + ".scrollIntoView({block:'center', behavior:'instant'})")
  await wait('source toggle available', () => ev('return !!'+block+".querySelector('.preview-toggle-button')"))
  await ev(block + ".querySelector('.preview-toggle-button').click()")
  await wait('editable diagram source', () => ev('return ' + block + ".querySelector('.cm-content').checkVisibility()"))
  const point = await ev(`const source = ${block}.querySelector('.cm-content')
    source.scrollIntoView({block: 'center', behavior: 'instant'})
    const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode, start = node.textContent.indexOf('Draft')
      if (start !== -1) {
        const word = document.createRange()
        word.setStart(node, start); word.setEnd(node, start + 5)
        const rect = word.getBoundingClientRect()
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      }
    }
    throw Error('Could not find the diagram label in CodeMirror')`)
  for (const clickCount of [1, 2]) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, button: 'left', clickCount, ...point })
    }
  }
  assert.equal(await ev('return getSelection().toString()'), 'Draft')
  await send('Input.insertText', { text: 'Ready' })
  await diagramsReady(true)
  const edited = original.replace('B[Draft]', 'B[Ready]')
  await wait('saved source preserves newlines, indentation and adjacent fences', () => disk() === edited)

  const paragraphPoint = await ev(`const p = [...document.querySelectorAll('.ProseMirror p')].find(n=>n.textContent==='End of notes.')
    p.scrollIntoView({block:'center',behavior:'instant'})
    const end=document.createRange(); end.selectNodeContents(p.firstChild); end.collapse(false)
    const rect=end.getBoundingClientRect()
    return { x:rect.right+1, y:rect.top+rect.height/2 }`)
  for (const type of ['mousePressed','mouseReleased']) {
    await send('Input.dispatchMouseEvent', {type, button:'left', clickCount:1, ...paragraphPoint})
  }
  await wait('caret at the end of the last paragraph', () => ev(`const range=getSelection()?.rangeCount && getSelection().getRangeAt(0)
    const node=range?.startContainer
    return range?.collapsed && node?.textContent==='End of notes.' && range.startOffset===node.textContent.length &&
      document.activeElement?.classList.contains('ProseMirror') &&
      window.__fold.view().state.selection.$from.parent.textContent === 'End of notes.'`))
  for (const type of ['keyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  }
  await wait('new paragraph is ready for the slash', () => ev(`const pos = window.__fold.view().state.selection.$from
    return pos.parent.type.name === 'paragraph' && pos.parent.content.size === 0 && getSelection()?.anchorNode?.parentElement?.closest('.ProseMirror') != null`))
  await send('Input.insertText', { text: '/' })
  const item = "[...document.querySelectorAll('.milkdown-slash-menu li[data-index]')].find(n => n.textContent.trim() === '思维导图')"
  await wait('mindmap in slash menu', () => ev('return !!' + item))
  await ev(`const item = ${item}
    for (const event of ['pointerdown','pointerup']) item.dispatchEvent(new PointerEvent(event, { bubbles: true }))`)
  await diagramsReady(true, true)
  await wait('inserted template saves as standard Markdown', () => disk().includes(fence('mindmap\n  root((主题))\n    想法\n    下一步')))
  const saved = disk()
  assert(saved.startsWith(edited.trimEnd()), 'inserting the new diagram rewrote an earlier block')

  for (const permission of [{ shared: true }, { locked: true }]) {
    const result = await fetch(new URL('api/access', appUrl), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: lib, ...permission }),
    }).then(r => r.json())
    assert.equal(result.ok, true)
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 700, deviceScaleFactor: 1, mobile: false })
  try {
    await send('Page.navigate', { url: route('onlyread') })
    await wait('read-only route', () => ev("return window.__reader?.isGuest && !!document.querySelector('.ProseMirror[contenteditable=false]')"))
    await diagramsReady(true, true, {previewOnly:true, narrow:true})
    assert.equal(disk(), saved)
  } finally {
    await send('Emulation.clearDeviceMetricsOverride')
  }
}
