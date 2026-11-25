import assert from 'node:assert/strict'
import { unzipSync, strFromU8 } from 'fflate'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import { execFileSync, fork, spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const runtime = process.env.READER_TEST_RUNTIME || fileURLToPath(new URL('../../', import.meta.url))
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'typocket-export-'))
const docs = path.join(temp, 'docs')
const profile = path.join(temp, 'chrome')
const downloads = path.join(temp, 'downloads')
fs.mkdirSync(downloads)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64')
let cors = true
const images = http.createServer((req, res) => {
  if (cors) res.setHeader('Access-Control-Allow-Origin', '*')
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }).end(png)
})
let app, chrome, socket
async function waitFor(label, read, ms = 30000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const result = await read()
    if (result) return result
    await sleep(90)
  }
  throw Error('Timed out waiting for ' + label)
}
async function stop(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return
  const stopped = once(child, 'exit')
  child.kill()
  await stopped
}
try {
  images.listen(0, '127.0.0.1')
  await once(images, 'listening')
  const remote = 'http://127.0.0.1:' + images.address().port + '/figure.png'
  app = fork(path.join(runtime, 'server/serve.js'), [], {
    env: { ...process.env, PORT: '0', DOCS_ROOT: docs, DIST_DIR: path.join(runtime, 'dist'), READER_RUNTIME_DIR: path.join(temp, 'run') }, silent: true,
  })
  const [{ port }] = await once(app, 'message', { signal: AbortSignal.timeout(20000) })
  const base = 'http://127.0.0.1:' + port
  async function api(method, route, data) {
    const response = await fetch(base + '/api/' + route, {
      method, headers: { 'Content-Type': 'application/json' }, body: data && JSON.stringify(data),
    })
    const result = await response.json()
    assert(result.ok, result.error)
    return result.data
  }
  await api('POST', 'lib', { name: 'Samples' })
  const paragraphs = Array.from({ length: 92 }, (_, i) => 'Print section ' + (i + 1) + '. ' + 'Sample text for pagination. '.repeat(4))
  const markdown = [
    '# FIRST-PAGE', 'Editable text', '![Local figure](./figure.png)', '![Remote figure](' + remote + ')',
    '| Column | Value |\n| --- | --- |\n| TableCell | 42 |\n' + Array.from({length: 70}, (_, i) => '| Cell' + (i + 1) + ' | Data |').join('\n'),
    '~~~js\nconst codeMarker = 42\n' + Array.from({length: 130}, (_, i) => '// CodeLine' + (i + 1)).join('\n') + '\n~~~', 'Formula $x^2+y^2=z^2$.', ...paragraphs, 'LAST-PAGE',
  ].join('\n\n') + '\n'
  const mathematics = [
    'Before $x^2$ after and `$literal$`.',
    '$$a=b$$ (7)',
    String.raw`$$x=y\tag{8}$$ (8)`,
    String.raw`$$\frac{1}{\sqrt{x^2+1}}=\int_0^1 t^2\,dt$$`,
    String.raw`$$\begin{pmatrix}1&2\\3&4\end{pmatrix}$$`,
    '$$\\text{FIRSTTERM}+' + '123456+'.repeat(17) + '\\text{LASTTERM}$$',
    '~~~reader-columns\n' + JSON.stringify({ version: 1, columns: [
      '~~~reader-block\n' + JSON.stringify({ version: 1, type: 'callout', content: 'Nested $a_1$' }) + '\n~~~',
      'Other column',
    ] }) + '\n~~~',
  ].join('\n\n')
  const source = path.join(temp, 'source.md')
  fs.writeFileSync(source, markdown)
  const { file } = await api('POST', 'import-workspace-doc', {
    name: 'Report', dir: 'Samples', reference: source, workspace: temp, content: markdown,
    assets: [{ reference: './figure.png', mime: 'image/png', base64: png.toString('base64') }],
  })
  const meta = await api('GET', 'metadata?path=' + encodeURIComponent(file))
  const cover = { type: 'gradient', preset: 'pixel', height: 'small', animated: true,
    colors: ['#18364a', '#77aaaa', '#e6cc9a'], seed: 17 }
  const updated = await api('PUT', 'metadata', { path: file, revision: meta.revision, meta: { cover } })
  assert.equal(updated.meta.cover.preset, cover.preset)
  const report = path.join(docs, file)
  const browser = process.env.CHROME_BIN || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome')
  chrome = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' })
  const debugFile = path.join(profile, 'DevToolsActivePort')
  await waitFor('Chrome', () => fs.existsSync(debugFile))
  const debug = fs.readFileSync(debugFile, 'utf8').split('\n')[0]
  const pages = await (await fetch('http://127.0.0.1:' + debug + '/json/list')).json()
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let sequence = 0
  const calls = new Map()
  socket.onmessage = event => {
    const msg = JSON.parse(event.data)
    const call = calls.get(msg.id)
    if (!call) return
    calls.delete(msg.id)
    clearTimeout(call.timer)
    if (msg.error) call.reject(Error(msg.error.message))
    else call.resolve(msg.result)
  }
  function send(method, params = {}) {
    const id = ++sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { calls.delete(id); reject(Error('Chrome timeout: ' + method)) }, 45000)
      calls.set(id, { resolve, reject, timer })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  async function clickExport(label) {
    await evaluate("document.querySelector('.doc-more button').click()")
    await waitFor('export menu action', () => evaluate("Array.from(document.querySelectorAll('.more-menu button')).some(b=>b.textContent.trim()==='导出')"))
    await evaluate("Array.from(document.querySelectorAll('.more-menu button')).find(b=>b.textContent.trim()==='导出').click()")
    await waitFor('export menu item', () => evaluate("!!document.querySelector('.export-menu button')"))
    await evaluate("Array.from(document.querySelectorAll('.export-menu button')).find(b=>b.textContent.includes(" + JSON.stringify(label) + ")).click()")
  }
  const url = base + '/doc/Samples/Report?lib=Samples'
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads })
  const slowdown = Number(process.env.READER_TEST_CPU_RATE || 1)
  if (slowdown > 1) await send('Emulation.setCPUThrottlingRate', { rate: slowdown })
  const started = performance.now()
  await send('Page.navigate', { url })
  await waitFor('editable report', () => evaluate("document.querySelector('.ProseMirror[contenteditable=true]')?.textContent.includes('LAST-PAGE')"))
  const ready = Math.round(performance.now() - started)
  if (slowdown > 1) await send('Emulation.setCPUThrottlingRate', { rate: 1 })
  await evaluate("const p=document.querySelector('.ProseMirror p');p.closest('[contenteditable]').focus();const r=document.createRange();r.selectNodeContents(p);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r)")
  await send('Input.insertText', { text: ' SAVED-EDIT' })
  await waitFor('save to isolated workspace', () => fs.readFileSync(report, 'utf8').includes('SAVED-EDIT'))
  await send('Page.reload', { ignoreCache: true })
  await waitFor('reopened edit', () => evaluate("document.querySelector('.ProseMirror')?.textContent.includes('SAVED-EDIT')"))
  // Exercise export independently of editor normalization, from the saved Markdown snapshot.
  const beforeMath = await api('GET', 'doc?path=' + encodeURIComponent(file))
  await api('PUT', 'doc', { path: file, revision: beforeMath.revision,
    content: beforeMath.content.replace('SAVED-EDIT', () => 'SAVED-EDIT\n\n' + mathematics) })
  await send('Page.reload', { ignoreCache: true })
  await waitFor('math document snapshot', () => evaluate("document.querySelector('.editor-shell')?.textContent.includes('LASTTERM')"))
  await clickExport('Markdown')
  await waitFor('Markdown download', () => fs.existsSync(path.join(downloads, 'Report.md')))
  assert.equal(fs.readFileSync(path.join(downloads, 'Report.md'), 'utf8'), fs.readFileSync(report, 'utf8'))
  await clickExport('Markdown 和附件')
  const bundle = path.join(downloads, 'Report.zip')
  await waitFor('editable Markdown bundle', async () => {
    const error = await evaluate("document.querySelector('.doc-notice')?.innerText")
    if (error) throw Error(error)
    return fs.existsSync(bundle)
  })
  const entries = unzipSync(fs.readFileSync(bundle))
  const portable = strFromU8(entries['Report.md'])
  assert(portable.includes('![Local figure](attachments/001.png)') && portable.includes('![Remote figure](attachments/002.png)'))
  assert.deepEqual(Buffer.from(entries['attachments/001.png']), png)
  assert.deepEqual(Buffer.from(entries['attachments/002.png']), png)
  assert(portable.includes('SAVED-EDIT') && portable.includes('LASTTERM'))
  await clickExport('网页')
  const html = path.join(downloads, 'Report.html')
  await waitFor('HTML download', async () => {
    const error = await evaluate("document.querySelector('.doc-notice')?.innerText")
    if (error) throw Error(error)
    return fs.existsSync(html)
  })
  // Use the menu entry, then materialize the browser's real print layout through CDP.
  await evaluate('window.print = () => { window.auditPrint = true }')
  await clickExport('PDF')
  assert(await evaluate('window.auditPrint'))
  await evaluate('document.fonts.ready.then(()=>true)')
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false })
  const pdfPath = path.join(temp, 'report.pdf')
  fs.writeFileSync(pdfPath, Buffer.from(pdf.data, 'base64'))
  const sheets = execFileSync(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' }).trimEnd().split('\f')
  assert(sheets.length > 1 && sheets.every(p => p.trim()), 'each PDF page must contain text')
  assert.match(sheets[0], /FIRST-PAGE/)
  assert.match(sheets.at(-1), /LAST-PAGE/)
  assert.match(sheets.join(' '), /TableCell/)
  assert.match(sheets.join(' '), /codeMarker/)
  const paper = sheets.join(' ')
  assert.deepEqual(Array.from(paper.matchAll(/CodeLine(\d+)/g), m => Number(m[1])), Array.from({length: 130}, (_, i) => i + 1))
  assert.deepEqual(Array.from(paper.matchAll(/Cell(\d+)\s+Data/g), m => Number(m[1])), Array.from({length: 70}, (_, i) => i + 1))
  assert.equal(new Set([...sheets.join(' ').matchAll(/Print section\s+(\d+)/g)].map(m => Number(m[1]))).size, paragraphs.length)
  assert.match(paper, /FIRSTTERM/)
  assert.match(paper, /LASTTERM/)
  const bbox = execFileSync(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-bbox', pdfPath, '-'], { encoding: 'utf8' })
  const formulaPage = bbox.split('<page ').find(page => page.includes('LASTTERM'))
  const pageWidth = Number(formulaPage.match(/width="([\d.]+)"/)?.[1])
  const words = Array.from(formulaPage.matchAll(/<word xMin="([\d.-]+)"[^>]* xMax="([\d.-]+)"[^>]*>([^<]*)<\/word>/g))
  const ends = words.filter(word => /(?:FIRST|LAST)TERM/.test(word[3]))
  assert.equal(ends.length, 2, 'both extreme ends of the long formula reach the print surface')
  assert(ends.every(word => Number(word[1]) > 0 && Number(word[2]) < pageWidth), 'no formula ink extends beyond the page edges')
  cors = false
  await clickExport('Markdown 和附件')
  await waitFor('incomplete Markdown bundle rejected', () => evaluate("document.querySelector('.doc-notice')?.innerText.includes('无法打包附件')"))
  assert.equal(fs.readdirSync(downloads).filter(file => file.endsWith('.zip')).length, 1)
  await evaluate("document.querySelector('.doc-notice-close').click()")
  await clickExport('网页')
  await waitFor('named cross-origin failure', () => evaluate("document.querySelector('.doc-notice')?.innerText.includes('Remote figure')"))
  assert.equal(fs.readdirSync(downloads).filter(file => file.endsWith('.html')).length, 1)
  const saved = (await api('GET', 'doc?path=' + encodeURIComponent(file))).content
  await api('DELETE', 'doc', { path: file })
  assert(!fs.existsSync(report))
  const trash = await api('GET', 'trash')
  await api('POST', 'trash/restore', { trashId: trash.items[0].id })
  assert.equal(fs.readFileSync(report, 'utf8'), saved)
  assert.equal(fs.readFileSync(source, 'utf8'), markdown)
  // The library cover is page metadata. HTML and PDF include the saved full
  // artwork while Markdown-with-attachments remains an ordinary Markdown handoff.
  const artFile = (await api('POST', 'doc', {dir:'Samples', name:'Artwork', content:'# Print proof\n'})).file
  const artMeta = await api('GET', 'metadata?path=' + encodeURIComponent(artFile))
  await api('PUT', 'metadata', {path:artFile, revision:artMeta.revision, meta:{
    cover:{type:'artwork', artwork:'overlap', height:'small', position:65}
  }})
  await send('Page.navigate', {url:base + '/doc/Samples/Artwork?lib=Samples'})
  await waitFor('saved full artwork on the document', () => evaluate("document.querySelector('.editor-shell') && document.querySelector('.cover-plane img[src$=\"/covers/overlap.webp\"]')?.naturalWidth > 500"))
  await clickExport('Markdown 和附件')
  const artZip = path.join(downloads, 'Artwork.zip')
  await waitFor('artwork Markdown export', () => fs.existsSync(artZip))
  const artEntries = unzipSync(fs.readFileSync(artZip))
  assert.deepEqual(Object.keys(artEntries), ['Artwork.md'])
  assert.equal(strFromU8(artEntries['Artwork.md']), fs.readFileSync(path.join(docs, artFile), 'utf8'))
  await clickExport('网页')
  const artHtml = path.join(downloads, 'Artwork.html')
  await waitFor('artwork HTML export', () => fs.existsSync(artHtml))
  const artSource = fs.readFileSync(path.join(runtime, 'dist/covers/overlap.webp'))
  assert(fs.readFileSync(artHtml, 'utf8').includes('data:image/webp;base64,' + artSource.toString('base64')))
  await evaluate("document.querySelector('.cover-actions button').click()")
  await waitFor('featured choices', () => evaluate("!!document.querySelector('.cover-picker input[value=resonance]')"))
  await evaluate("document.querySelector('.cover-picker input[value=resonance]').click()")
  await waitFor('unsaved print preview', () => evaluate("document.querySelector('.cover-plane img[src$=\"/covers/resonance.webp\"]')?.naturalWidth > 500"))
  await evaluate(`window.addEventListener('beforeprint', () => {
    const img = document.querySelector('.typocket-print .page-cover.small img')
    window.printedArtwork = [img?.getAttribute('src'), img?.style.objectPosition]
  }, {once:true})`)
  const artPdf = await send('Page.printToPDF', {printBackground:true, preferCSSPageSize:true, displayHeaderFooter:false})
  const printedArtwork = await evaluate('window.printedArtwork')
  assert(printedArtwork[0].endsWith('/covers/overlap.webp'))
  assert.match(printedArtwork[1], /^(center|50%) 65%$/)
  const artPdfPath = path.join(temp, 'artwork.pdf')
  fs.writeFileSync(artPdfPath, Buffer.from(artPdf.data, 'base64'))
  const printImages = execFileSync(process.env.PDFIMAGES_BIN || 'pdfimages', ['-list', artPdfPath], {encoding:'utf8'})
  assert(/^\s*1\s+\d+\s+image\s+/m.test(printImages), 'the PDF first page embeds the library artwork')
  await send('Network.enable')
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
  await send('Page.navigate', {url:pathToFileURL(artHtml).href})
  await waitFor('offline artwork and crop', () => evaluate("document.querySelector('.page-cover.small img')?.naturalWidth > 500 && getComputedStyle(document.querySelector('.page-cover img')).objectPosition === '50% 65%'"))
  await send('Page.navigate', { url: pathToFileURL(html).href })
  await waitFor('offline file', () => evaluate("location.protocol==='file:' && document.body?.textContent.includes('LAST-PAGE')"))
  assert.equal(await evaluate("document.querySelectorAll('img').length"), 3)
  assert(await evaluate("document.querySelector('.page-cover.small img')?.naturalWidth > 100"))
  assert(await evaluate("!document.querySelector('.page-cover canvas, .page-cover button')"))
  const distinctColors = await evaluate(`(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 48
    canvas.height = 16
    const ctx = canvas.getContext('2d')
    ctx.drawImage(document.querySelector('.page-cover img'), 0, 0, 48, 16)
    return new Set(new Uint32Array(ctx.getImageData(0, 0, 48, 16).data.buffer)).size
  })()`)
  assert(distinctColors > 2, 'the offline cover retains its rendered artwork')
  assert(await evaluate("Array.from(document.images).every(i=>i.src.startsWith('data:image/') && i.complete && i.naturalWidth>0)"))
  assert(await evaluate("!!document.querySelector('math') && document.querySelector('table').textContent.includes('TableCell') && document.querySelector('pre code').textContent.includes('codeMarker')"))
  const math = await evaluate(`(() => {
    const equations = [...document.querySelectorAll('math')]
    const long = equations.find(eq => eq.textContent.includes('LASTTERM'))
    const matrix = equations.find(eq => eq.querySelector('annotation')?.textContent.includes('begin{pmatrix}'))
    return {
      semantics: equations.every(eq => eq.querySelector('semantics > annotation[encoding="application/x-tex"]')),
      fraction: !!document.querySelector('math mfrac msqrt'),
      matrix: [...matrix.querySelectorAll('mtable mtr')].map(row => [...row.querySelectorAll('mtd')].map(cell => cell.textContent)),
      number: document.querySelector('.math-block > .math-number')?.textContent,
      nested: !!document.querySelector('.reader-column .reader-rich-callout math msub'),
      taggedOnce: [...document.querySelectorAll('math mtext,.math-number')].filter(el => el.textContent === '(8)').length === 1,
      literal: [...document.querySelectorAll('code')].some(c => c.textContent === '$literal$'),
      inline: !!document.querySelector('p .export-math-inline math:not([display="block"])'),
      longFit: !!long?.parentElement.style.getPropertyValue('--export-math-fit'),
    }
  })()`)
  assert.deepEqual(math, { semantics: true, fraction: true, matrix: [['1','2'],['3','4']], number: '(7)', nested: true, taggedOnce: true, literal: true, inline: true, longFit: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: false })
  assert(await evaluate(`(() => {
    const block = [...document.querySelectorAll('.export-math-block')].find(el => el.textContent.includes('LASTTERM'))
    return block.scrollWidth > block.clientWidth && block.getBoundingClientRect().right <= innerWidth
      && getComputedStyle(block).overflowX === 'auto' && document.documentElement.scrollWidth <= innerWidth
  })()`), 'long block math scrolls within its column in the offline file')
  console.log('PASS: isolated workflow, saved edit, byte-identical Markdown, editable ZIP with attachments, offline HTML, embedded static and procedural covers, printed saved artwork during trial, two figures, CORS failure, ' + sheets.length + ' nonempty PDF pages, trash restore; browser ready ' + ready + ' ms at ' + slowdown + 'x CPU slowdown')
} finally {
  socket?.close()
  await stop(chrome)
  await stop(app)
  images.closeAllConnections()
  if (images.listening) await new Promise(resolve => images.close(resolve))
  if (process.env.READER_KEEP_TEST_OUTPUT === '1') console.log('Isolated sample output: ' + temp)
  else fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
