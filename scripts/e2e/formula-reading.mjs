import assert from 'node:assert/strict'

const fence = (name, value) => ['~~~' + name, JSON.stringify(value), '~~~'].join('\n')
const callout = fence('reader-block', { version: 1, type: 'callout', icon: '💡', content: String.raw`提示 $\alpha^2$。` })
const columns = fence('reader-columns', { version: 1, columns: [String.raw`左 $\beta_i$`, String.raw`右 $\gamma_j$`] })
const matrix = String.raw`\begin{pmatrix}1 & 2 \\ 3 & 4\end{pmatrix}`
const long = Array.from({ length: 70 }, (_, i) => 'x_{' + i + '}').join('+')
const table = String.raw`| 范数 | 备注 |
| :--- | ---: |
| $\|x\|$ | 保留一 |
| $\left|x\right|$ | 保留二 |`
const docs = [
  '# 数学排版', String.raw`中文 $\text{中文A}$，分数 \(\frac{1}{1+x}\)。`,
  '$$' + matrix + '$$', String.raw`\[\sqrt{x_1^2+y_2^2}\] (2)`,
  String.raw`$$q=2\tag{3}$$ (3)`, '$$' + long + '$$',
  '$$a+b$$ 后面的文字', table, callout, columns,
  '~~~tex\n\\(示例\\)\n~~~',
  '<span style="color:#123456;font-weight:700;position:sticky" id="typeset-sample">颜色</span>',
].join('\n\n')

async function verifyInBrowser(markdown, pluginDocument) {
  const { readingDocument, readingSnapshot } = await import('/src/utils/safe-reading.js')
  const container = document.createElement('div')
  container.className = 'crepe-host source-reading'
  Object.assign(container.style, { width: '288px', position: 'fixed', visibility: 'hidden' })
  const skin = container.appendChild(document.createElement('div'))
  skin.className = 'milkdown'
  const article = skin.appendChild(document.createElement('article'))
  article.className = 'ProseMirror'
  article.append(readingDocument(markdown))
  document.body.append(container)
  const frame = document.createElement('iframe')
  frame.width = '320'
  Object.assign(frame.style, { position: 'fixed', left: '-10000px' })
  const onReady = e => {
    if (e.source === frame.contentWindow && e.data?.type === 'dsh-reader-preview:ready') {
      frame.contentWindow.postMessage({
        type: 'dsh-reader-preview:update', title: '公式.md', filePath: 'test/公式.md',
        text: pluginDocument, eof: true, version: 1,
      }, location.origin)
    }
  }
  try {
    await document.fonts.ready
    const snapshots = readingSnapshot(markdown)
    const formulas = [...article.querySelectorAll('annotation')].map(n => n.textContent)
    const viewport = [...article.querySelectorAll('.math-block > .katex-display')].find(n => n.scrollWidth > n.clientWidth)
    const tag = article.querySelector('.katex-html > .katex-tag')
    const formulaEdge = tag?.previousElementSibling?.getBoundingClientRect().right
    const foreground = article.querySelector('#typeset-sample')
    window.addEventListener('message', onReady)
    frame.src = '/preview/index.html'
    document.body.append(frame)
    const expected = ['\\alpha^2', '\\beta_i', '\\gamma_j']
    let preview = [], visibleReaders = 0
    const until = performance.now() + 14000
    while (performance.now() < until) {
      const readers = [...(frame.contentDocument?.querySelectorAll('.preview-reader .ProseMirror') || [])]
        .filter(reader => reader.getClientRects().length)
      visibleReaders = readers.length
      preview = readers.flatMap(reader => [...reader.querySelectorAll('annotation')].map(n => n.textContent))
      if (expected.every(tex => preview.includes(tex))) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return {
      formulas, snapshotCount: snapshots.querySelectorAll('annotation').length,
      snapshotInteractive: !!snapshots.querySelector('[id], [role="button"], [href], [tabindex]'),
      tags: article.querySelectorAll('.katex-tag').length,
      outerLabels: [...article.querySelectorAll('.math-number')].map(n => n.textContent),
      tagSeparated: !!tag && formulaEdge <= tag.getBoundingClientRect().left + 1,
      longScroll: viewport ? [viewport.clientWidth, viewport.scrollWidth] : null,
      tail: article.innerText.includes('后面的文字') || article.textContent.includes('后面的文字'),
      styles: [foreground?.style.color, foreground?.style.fontWeight, foreground?.style.position],
      tableAlignment: [...article.querySelectorAll('th')].map(n => n.style.textAlign),
      tableNotes: [...article.querySelectorAll('tbody tr > td:last-child')].map(n => n.textContent),
      texSample: article.querySelector('code.language-tex')?.textContent.trim(),
      radical: !!article.querySelector('.katex .sqrt svg path'),
      error: !!article.querySelector('.katex-error'), preview, visibleReaders,
    }
  } finally {
    window.removeEventListener('message', onReady)
    frame.remove()
    container.remove()
  }
}

export async function verifyFormulaReading(ev) {
  const pluginDocument = ['# DSH Markdown', callout, columns].join('\n\n')
  const out = await ev('return (' + verifyInBrowser.toString() + ')(' + JSON.stringify(docs) + ', ' + JSON.stringify(pluginDocument) + ')', 45000)
  for (const tex of [matrix, long, String.raw`\text{中文A}`, String.raw`\|x\|`, String.raw`\left|x\right|`, '\\alpha^2', '\\beta_i', '\\gamma_j']) {
    assert(out.formulas.includes(tex), '公式源码有变化 ' + tex)
  }
  assert.equal(out.formulas.length, out.snapshotCount)
  assert.equal(out.snapshotInteractive, false)
  assert.deepEqual(out.outerLabels, ['(2)'])
  assert.equal(out.tags, 1)
  assert(out.tagSeparated, '公式编号覆盖了表达式')
  assert(out.longScroll && out.longScroll[1] > out.longScroll[0] && out.longScroll[0] <= 288)
  assert(out.radical && out.tail && !out.error)
  assert.deepEqual(out.tableAlignment, ['left', 'right'])
  assert.deepEqual(out.tableNotes, ['保留一', '保留二'])
  assert.deepEqual(out.styles, ['rgb(18, 52, 86)', '700', ''])
  assert.equal(out.texSample, '\\(示例\\)')
  assert.equal(out.visibleReaders, 1, 'DSH 只应呈现一个阅读视图')
  assert.deepEqual(out.preview, ['\\alpha^2', '\\beta_i', '\\gamma_j'], 'DSH 预览的提示与分栏公式发生变化')
}
