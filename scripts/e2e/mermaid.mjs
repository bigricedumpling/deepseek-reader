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
    throw Error('Mermaid: ' + label)
  }
  const labels = () => ev(`return [...document.querySelectorAll('.ProseMirror .mermaid-preview > svg')].map(svg =>
    [...svg.querySelectorAll('text, foreignObject')].map(n => n.textContent.trim()).join(' '))`)
  async function diagramsReady(edited = false, withTemplate = false) {
    await wait('inline flowchart, mindmap and sequence labels', async () => {
      const [chart, tree, sequenceText, template] = await labels()
      return ['Inputs', edited ? 'Ready' : 'Draft', 'Review'].every(label => chart?.includes(label))
        && ['Ideas', 'Research', 'Sources', 'Writing'].every(label => tree?.includes(label))
        && sequenceText?.includes('Save now') && sequenceText.includes('Done')
        && (!withTemplate || template?.includes('下一步'))
    })
  }

  await send('Page.navigate', { url: route('doc') })
  await diagramsReady()
  assert.equal(await ev("return document.querySelectorAll('.ProseMirror .mermaid-preview-error').length"), 1)
  assert(await ev(`return !window.__reader.isDirty && [...document.querySelectorAll('.ProseMirror .mermaid-preview > svg')].every(svg =>
    !svg.closest('.milkdown-code-block').querySelector('.cm-content').checkVisibility())`), 'valid diagrams should open as figures')
  assert.equal(disk(), original, 'drawing the diagrams changed the authored file')

  const block = "document.querySelector('.ProseMirror .milkdown-code-block')"
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

  await ev(`const pm = document.querySelector('.ProseMirror')
    const paragraph = [...pm.querySelectorAll('p')].find(n => n.textContent === 'End of notes.')
    pm.focus(); getSelection().collapse(paragraph, paragraph.childNodes.length)`)
  for (const type of ['keyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  }
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
    await diagramsReady(true, true)
    assert.equal(await ev("return document.querySelectorAll('.ProseMirror .mermaid-preview-error').length"), 1)
    assert(await ev(`const diagrams = [...document.querySelectorAll('.ProseMirror .mermaid-preview > svg')]
      return diagrams.length === 4 && diagrams.every(svg => {
        const rect = svg.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && rect.width <= innerWidth + 1
      })`), 'a diagram overflows a narrow reading viewport')
    assert.equal(disk(), saved)
  } finally {
    await send('Emulation.clearDeviceMetricsOverride')
  }
}
