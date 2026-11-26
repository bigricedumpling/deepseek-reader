import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const flow = [
  'flowchart TD', '  A([Inputs]) --> B[Draft]', '  B -->|通过| C[Review]',
  '  B -.->|返工| D{修订}', '  D --> B', '  C --> E[归档]', '  C --> F[发布]',
  '  classDef approved fill:#dbeafe,stroke:#2563eb,color:#172554', '  class C approved',
].join('\n')
const broken = 'flowchart TD\n  A[Unclosed'
const mindmap = 'mindmap\n  root((Ideas))\n    Research\n      leaf{{Sources}}\n    Writing'
const sequence = 'sequenceDiagram\n  User->>Editor: Save now\n  Editor-->>User: Done'
const fence = (source, language = 'mermaid') => ['```' + language, source, '```'].join('\n')

// Shared by the editor and offline HTML checks. Resolve the marker actually used by
// each path, and measure the painted background against its text at the current zoom.
export function inspectFlowInk(svg) {
  const edges = [...svg.querySelectorAll('path.flowchart-link[marker-end]')]
  const openArrows = edges.length > 0 && edges.every(edge => {
    const id = edge.getAttribute('marker-end').match(/#([^)"']+)/)?.[1]
    const tip = id && svg.getElementById(id)?.querySelector('path')
    return tip && getComputedStyle(tip).fill === 'none' && getComputedStyle(tip).stroke !== 'none' &&
      !/z/i.test(tip.getAttribute('d'))
  })
  const labels = [...svg.querySelectorAll('g.edgeLabel')].filter(label => label.querySelector('text')?.textContent.trim())
  const clearLabels = labels.length > 0 && labels.every(label => {
    const text = label.querySelector('text')
    const ink = text.getBoundingClientRect()
    return [...label.querySelectorAll('rect')].some(rect => {
      const box = rect.getBoundingClientRect(), style = getComputedStyle(rect)
      return (rect.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        style.fill !== 'none' && Number(style.opacity) === 1 && Number(style.fillOpacity) === 1 &&
        box.left < ink.left && box.right > ink.right && box.top < ink.top && box.bottom > ink.bottom
    })
  })
  const surface = labels[0]?.querySelector('rect.background')
  return { openArrows, clearLabels, surface: surface && getComputedStyle(surface).fill }
}

export async function verifyMermaid({ send, ev, root, appUrl, sleep }) {
  const lib = 'Diagram study'
  const file = path.join(root, lib, 'Diagrams.md')
  const ordinaryCode = fence('const result = 42', 'js')
  const original = ['# Diagrams', fence(flow), fence(broken), fence(mindmap), fence(sequence), ordinaryCode, 'End of notes.'].join('\n\n') + '\n'
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
  async function inspectBlock(index, words, type, options) {
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
        const centered = [...(svg?.querySelectorAll('g.mindmap-node') || [])].every(node => {
          const shape = node.querySelector(':scope > .label-container, :scope > .node-bkg')?.getBoundingClientRect()
          const text = node.querySelector(':scope > .label text')?.getBoundingClientRect()
          if (!shape || !text) return false
          return Math.abs(text.x + text.width / 2 - shape.x - shape.width / 2) < 1.5 &&
            Math.abs(text.y + text.height / 2 - shape.y - shape.height / 2) < 1.5
        })
        const thinEdges = [...(svg?.querySelectorAll('.edge[class*="edge-depth-"]') || [])].every(edge =>
          parseFloat(getComputedStyle(edge).strokeWidth) <= 2)
        return { centered, thinEdges, error:!!block.querySelector('.mermaid-preview-error'),
          labels: svg && [...svg.querySelectorAll('text, foreignObject')].map(n=>n.textContent.trim()).join(' '),
          sourceHidden: source && !source.checkVisibility(),
          fits: bounds && bounds.height>0 && bounds.width>0 && bounds.width<=innerWidth+1 }`)
      if (!state) return false
      if (!words) return state.error
      return !state.error && state.centered && state.thinEdges && words.every(word => state.labels?.includes(word)) &&
        (!options.previewOnly || state.sourceHidden) && (!options.narrow || state.fits)
    })
    if (words && options.previewOnly) {
      const toolbar = await ev(`const block = ${target}
        const caption = block.querySelector('figcaption'), toggle = block.querySelector('.preview-toggle-button')
        return { caption: caption?.checkVisibility() && caption.textContent.trim(),
          toggle: toggle?.checkVisibility({ opacityProperty:true }) && toggle.textContent.trim(),
          codeTools: [...block.querySelectorAll('.language-button, .copy-button')].some(button => button.checkVisibility()) }`)
      assert.deepEqual(toolbar, { caption:type, toggle:'查看源码', codeTools:false }, label + ' preview toolbar')
    }
  }
  async function verifyFlow() {
    const appearance = await ev(`const svg = ${blockAt(0)}.querySelector('.mermaid-preview > svg')
      const byLabel = word => [...svg.querySelectorAll('g.node')].find(node => node.textContent.trim() === word)
      const review = getComputedStyle(byLabel('Review').querySelector('rect'))
      const colors = ['Inputs','修订','归档'].map(word => {
        const shape = byLabel(word).querySelector(':scope > .label-container')
        const filled = shape.matches('g') ? shape.querySelector('path[fill]:not([fill="none"])') : shape
        return getComputedStyle(filled).fill
      })
      const siblings = ['归档','发布'].map(word => byLabel(word).getBoundingClientRect()).sort((a,b) => a.x-b.x)
      const edges = [...svg.querySelectorAll('path.flowchart-link')]
      const dashed = edges.find(edge => edge.dataset.id === 'L_B_D_0')
      return {
        ...(${inspectFlowInk})(svg), fill:review.fill, stroke:review.stroke, roles:new Set(colors).size,
        dashed: !!dashed && getComputedStyle(dashed).strokeDasharray !== 'none',
        loop: edges.some(edge => edge.dataset.id === 'L_D_B_0' && edge.getTotalLength() > 0),
        row: Math.abs(siblings[0].y-siblings[1].y) < 2 && siblings[1].left-siblings[0].right > 8,
      }`)
    const { surface, ...checks } = appearance
    assert.deepEqual(checks, { openArrows:true, clearLabels:true, fill:'rgb(219, 234, 254)', stroke:'rgb(37, 99, 235)', roles:3, dashed:true, loop:true, row:true }, 'flowchart labels, author styling and branch layout')
    return surface
  }
  async function verifyMindmap() {
    const appearance = await ev(`const svg = ${blockAt(2)}.querySelector('.mermaid-preview > svg')
      const nodes = [...svg.querySelectorAll('g.mindmap-node')]
      const [root, branch, leaf, sibling] = ['Ideas','Research','Sources','Writing'].map(word => {
        const node = nodes.find(node => node.textContent.trim() === word)
        return getComputedStyle(node.querySelector(':scope > .label-container, :scope > .node-bkg'))
      })
      const edges = [...svg.querySelectorAll('path.edge[class*="edge-depth-"]')].map(edge => ({
        depth: Number(edge.getAttribute('class').match(/edge-depth-(\\d+)/)[1]), width:parseFloat(getComputedStyle(edge).strokeWidth)
      })).sort((a,b) => a.depth-b.depth)
      return { colors:new Set([root.fill, branch.fill, leaf.fill, sibling.fill]).size,
        family:branch.stroke === leaf.stroke && leaf.stroke !== sibling.stroke,
        depth:edges.length === 3 && edges[0].width > edges[2].width && edges[2].width > 0 }`)
    assert.deepEqual(appearance, { colors:4, family:true, depth:true }, 'mind map distinguishes its root, branches and leaf connections')
  }
  async function diagramsReady(edited = false, withTemplate = false, options = {}) {
    await inspectBlock(0, ['Inputs', edited ? 'Ready' : 'Draft', 'Review', '通过', '返工', '修订', '归档', '发布'], '流程图', options)
    const surface = await verifyFlow()
    await inspectBlock(1, null, null, options)
    await inspectBlock(2, ['Ideas','Research','Sources','Writing'], '思维导图', options)
    await verifyMindmap()
    await inspectBlock(3, ['Save now','Done'], '时序图', options)
    if (withTemplate) await inspectBlock(5, ['下一步'], '思维导图', options)
    return surface
  }

  const previousTheme = await ev("return localStorage.getItem('reader.theme')")
  await ev("localStorage.setItem('reader.theme', 'light')")
  await send('Page.navigate', { url: route('doc') })
  const lightSurface = await diagramsReady(false, false, {previewOnly:true})
  assert(await ev('return !window.__reader.isDirty'))
  assert.equal(disk(), original, 'drawing the diagrams changed the authored file')

  await wait('ordinary JavaScript controls', () => ev(`const block = ${blockAt(4)}
    block?.scrollIntoView({block:'center', behavior:'instant'})
    return block?.querySelector('.cm-content')?.checkVisibility() && block.querySelector('.language-button')?.checkVisibility() &&
      block.querySelector('.copy-button')?.checkVisibility() && !block.querySelector('figcaption, .preview-toggle-button')`))
  const block = "document.querySelector('.ProseMirror .milkdown-code-block')"
  await ev(block + ".scrollIntoView({block:'center', behavior:'instant'})")
  await wait('source toggle available', () => ev('return !!'+block+".querySelector('.preview-toggle-button')"))
  await ev(block + ".querySelector('.preview-toggle-button').focus()")
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13, text:'\r' })
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 })
  await wait('editable diagram source', () => ev('return ' + block + ".querySelector('.cm-content').checkVisibility()"))
  assert(await ev(`const el = ${block}
    return el.querySelector('.language-button')?.checkVisibility() && el.querySelector('.copy-button')?.checkVisibility() &&
      el.querySelector('.preview-toggle-button').textContent.trim() === '收起源码'`), 'source view restores code controls')
  await ev(block + ".querySelector('.language-button').click()")
  await wait('language picker opens', () => ev('return ' + block + ".querySelector('.language-picker input')?.checkVisibility()"))
  await ev(block + ".querySelector('.language-button').click()")
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
    await ev("localStorage.setItem('reader.theme','dark')")
    await send('Page.navigate', { url: route('onlyread') })
    await wait('read-only route', () => ev("return window.__reader?.isGuest && !!document.querySelector('.ProseMirror[contenteditable=false]')"))
    const darkSurface = await diagramsReady(true, true, {previewOnly:true, narrow:true})
    assert.equal(await ev('return document.body.dataset.theme'), 'dark')
    assert(lightSurface && darkSurface && lightSurface !== darkSurface, 'diagram label backgrounds adapt to dark reading')
    assert.equal(disk(), saved)
  } finally {
    await send('Emulation.clearDeviceMetricsOverride')
    await ev(previousTheme === null ? "localStorage.removeItem('reader.theme')" :
      "localStorage.setItem('reader.theme'," + JSON.stringify(previousTheme) + ")")
  }
}
