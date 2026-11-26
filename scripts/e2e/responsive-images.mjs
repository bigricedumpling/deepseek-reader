import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export async function verifyResponsiveImages({send, ev, root, appUrl, sleep}) {
  const lib = 'Image study'
  const file = lib + '/Illustrations.md'
  const folder = path.join(root, lib)
  fs.mkdirSync(folder)
  function figure(name, width, height) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="#ccc"/>
      <rect width="4%" height="100%" fill="red"/>
      <rect x="96%" width="4%" height="100%" fill="blue"/>
    </svg>`
    fs.writeFileSync(path.join(folder, name), svg)
    return '/api/file?path=' + encodeURIComponent(lib + '/' + name)
  }
  const panorama = figure('panorama.svg', 1800, 400)
  const detail = figure('detail.svg', 150, 36)
  const columns = ['~~~reader-columns', JSON.stringify({
    version: 1, columns: ['Column text', `![](${panorama} "Column figure")`]
  }), '~~~'].join('\n')
  const markdown = [
    '# Illustrations', `![Coastal panorama](${panorama} "Panorama")`, `![0.60](${panorama} "Scaled")`,
    `![2026](${detail} "Detail")`, `Inline ![edges](${panorama}) illustration.`, columns
  ].join('\n\n') + '\n'
  const docPath = path.join(root, file)
  fs.writeFileSync(docPath, markdown)
  const route = mode => new URL(mode + '/' + lib + '/Illustrations?lib=' + encodeURIComponent(lib), appUrl).href
  const imageSelector = '.ProseMirror .milkdown-image-block .image-wrapper img'
  async function until(label, read) {
    for (let i = 0; i < 100; i++) {
      if (await read()) return
      await sleep(70)
    }
    throw Error(label)
  }
  const geometry = () => ev(`return [...document.querySelectorAll('.ProseMirror img')].map(img => {
    const rect = img.getBoundingClientRect(), block = img.closest('.milkdown-image-block, p').getBoundingClientRect()
    return {w:rect.width, h:rect.height, room:block.width, native:img.naturalWidth, nativeH:img.naturalHeight,
      inColumn:!!img.closest('.reader-column'), inside:rect.left >= block.left-1 && rect.right <= block.right+1}
  })`)
  async function ready() {
    await until('Images did not load', async () => {
      const rows = await geometry()
      return rows.length === 5 && rows.every(row => row.native > 0 && row.w > 0)
    })
  }
  async function fitted(label, firstRatio = 1) {
    await ready()
    const ratios = [firstRatio, .6, 1, 1, 1]
    let last
    try {
      await until(label, async () => {
        last = await geometry()
        return last.length === ratios.length && last.every(({w,h,room,native,nativeH,inside},i) => {
          const expectedWidth = Math.min(room, native) * ratios[i]
          return inside && Math.abs(w - expectedWidth) < 2 && Math.abs(h - w*nativeH/native) < 1
        })
      })
    } catch {
      throw Error(label + ': ' + JSON.stringify(last))
    }
    return last
  }
  const resize = (width) => send('Emulation.setDeviceMetricsOverride', {width, height:850, deviceScaleFactor:1, mobile:false})
  const setSidebar = (open) => ev(`const button=document.querySelector('.sidebar-toggle')
    if ((button.getAttribute('aria-expanded')==='true')!==${open}) button.click()`)

  try {
    await resize(1060)
    await send('Page.navigate', {url:route('doc')})
    await ready()
    await setSidebar(true)
    await sleep(480)
    const expanded = await fitted('Sidebar open')
    const readAlt = () => ev(`return [...document.querySelectorAll(${JSON.stringify(imageSelector)})].slice(0,3).map(image => image.alt)`)
    assert.deepEqual(await readAlt(), ['Coastal panorama','Scaled','2026'], 'Editor lost authored descriptions or read an image ratio as text')
    assert(expanded[4].inColumn && expanded[4].room < expanded[0].room * .6, 'Figure is not in a split column')
    await setSidebar(false)
    await until('Sidebar did not change the available column', async () => (await geometry())[0]?.room > expanded[0].room + 10)
    await fitted('Sidebar closed')
    await resize(390)
    const phone = await fitted('Narrow reading column')
    assert(phone[4].inColumn && phone[4].room > phone[0].room * .9, 'Stacked column width on phone')
    await resize(1280)
    await fitted('Expanding the reading column')
    assert.equal(fs.readFileSync(docPath,'utf8'),markdown,'Layout changes modified an authored image width')

    // Resize an image through the editor's normal handle, then reopen it in read-only mode.
    await resize(390)
    await fitted('Column before the narrow-screen drag')
    const target = await ev(`const image = document.querySelector(${JSON.stringify(imageSelector)})
      image.scrollIntoView({block:'center', behavior:'instant'})
      const rect=image.getBoundingClientRect(), handle=image.parentElement.querySelector('.image-resize-handle').getBoundingClientRect()
      return {x:handle.x+handle.width/2,y:handle.y+handle.height/2,endY:handle.y+handle.height/2-rect.height*.22}`)
    await send('Input.dispatchMouseEvent', {type:'mouseMoved', x:target.x, y:target.y})
    await send('Input.dispatchMouseEvent', {type:'mousePressed', button:'left', buttons:1, clickCount:1, x:target.x, y:target.y})
    await send('Input.dispatchMouseEvent', {type:'mouseMoved', button:'left', buttons:1, x:target.x, y:target.endY})
    await send('Input.dispatchMouseEvent', {type:'mouseReleased', button:'left', buttons:0, clickCount:1, x:target.x, y:target.endY})
    let ratio
    await until('Dragging the image did not save its width', () => {
      const match = fs.readFileSync(docPath,'utf8').match(/<!-- typocket:scale=(0\.\d+) -->/)
      ratio=Number(match?.[1])
      return Math.abs(ratio-.78) < .02
    })
    const afterDrag = fs.readFileSync(docPath,'utf8')
    const resized = markdown.replace('"Panorama")', '"Panorama")<!-- typocket:scale=' + ratio.toFixed(2) + ' -->')
    assert.equal(afterDrag, resized, 'Resizing rewrote the image description, caption or surrounding Markdown')
    await fitted('Narrow-screen drag', ratio)
    async function historyKey(redo) {
      await ev("document.querySelector('.ProseMirror').focus()")
      const modifiers = (process.platform === 'darwin' ? 4 : 2) | (redo ? 8 : 0)
      for (const type of ['keyDown','keyUp']) {
        await send('Input.dispatchKeyEvent',{type, key:redo ? 'Z' : 'z', code:'KeyZ', windowsVirtualKeyCode:90, modifiers})
      }
    }
    await historyKey(false)
    await fitted('Undo image resize')
    await until('Undo did not restore the original image markup', () => fs.readFileSync(docPath,'utf8') === markdown)
    await historyKey(true)
    await fitted('Redo image resize', ratio)
    await until('Redo did not restore the saved image width', () => fs.readFileSync(docPath,'utf8') === afterDrag)
    for (const permission of [{shared:true},{locked:true}]) {
      const response = await fetch(new URL('api/access',appUrl), {
        method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:lib, ...permission})
      })
      assert.equal((await response.json()).ok,true)
    }
    await send('Page.navigate', {url:route('onlyread')})
    await until('Read-only route was not ready', () => ev("return window.__reader?.isGuest && !!document.querySelector('.ProseMirror[contenteditable=false]')"))
    await fitted('Read-only phone', ratio)
    assert.deepEqual(await readAlt(), ['Coastal panorama','Scaled','2026'], 'Read-only view lost authored image descriptions')
    const staticOutput = await ev(`const { readingDocument } = await import('/src/utils/safe-reading.js')
      const host = document.createElement('div')
      host.className = 'crepe-host source-reading'
      Object.assign(host.style, {position:'fixed', visibility:'hidden', left:'0', width:'360px'})
      const skin = host.appendChild(document.createElement('div'))
      skin.className = 'milkdown'
      const article = skin.appendChild(document.createElement('article'))
      article.className = 'ProseMirror'
      const source = ${JSON.stringify(afterDrag)}
      article.append(readingDocument(source))
      document.body.append(host)
      try {
        const images = [...article.querySelectorAll('img')].slice(0,3)
        await Promise.all(images.map(image => image.decode()))
        const sizes = [360,800].map(width => {
          host.style.width = width + 'px'
          return images.map(image => ({
            width:image.getBoundingClientRect().width, height:image.getBoundingClientRect().height,
            room:image.closest('p').getBoundingClientRect().width
          }))
        })
        const plain = readingDocument(source, {allowHtml:false})
        return {alt:images.map(image => image.alt), sizes, leakedScale:
          [article,plain].some(surface => surface.textContent.includes('typocket:scale'))}
      } finally { host.remove() }`)
    assert.deepEqual(staticOutput.alt, ['Coastal panorama','Scaled','2026'])
    assert(!staticOutput.leakedScale, 'The saved image scale appeared as reading text')
    assert(staticOutput.sizes[1][0].room > staticOutput.sizes[0][0].room + 100, 'Static test did not resize the column')
    for (const [first, second, small] of staticOutput.sizes) {
      assert(Math.abs(first.width - first.room * ratio) < 2 && Math.abs(first.height - first.width / 4.5) < 1, JSON.stringify(first))
      assert(Math.abs(second.width - second.room * .6) < 2, JSON.stringify(second))
      assert.deepEqual([small.width,small.height], [150,36])
    }
    assert(await ev("return ![...document.querySelectorAll('.image-resize-handle')].some(handle => handle.getClientRects().length)"), 'Read-only images expose resize handles')
    await resize(1280)
    await fitted('Read-only desktop', ratio)
    assert.equal(fs.readFileSync(docPath,'utf8'),afterDrag,'Read-only layout rewrote image markup')
  } finally {
    await send('Emulation.clearDeviceMetricsOverride')
  }
}
