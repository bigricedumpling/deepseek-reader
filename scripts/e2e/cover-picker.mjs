import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export async function verifyCoverPicker({ send, ev, root, appUrl, sleep }) {
  const lib = 'Cover studio', file = lib + '/Materials.md'
  const url = new URL('doc/' + lib + '/Materials?lib=' + encodeURIComponent(lib), appUrl).href
  fs.mkdirSync(path.join(root, lib))
  fs.writeFileSync(path.join(root, file), '# Materials\n\nLight passes through both layers.\n')
  async function saved() {
    const result = await fetch(new URL('api/metadata?path=' + encodeURIComponent(file), appUrl)).then(r => r.json())
    assert(result.ok)
    return result.data.meta.cover ?? null
  }
  async function until(read, label) {
    for (let i = 0; i < 160; i++) {
      const result = await read()
      if (result) return result
      await sleep(50)
    }
    throw Error('Cover picker timed out: ' + label)
  }
  const wait = expression => until(() => ev('return !!(' + expression + ')'), expression)
  const expectSaved = (label, predicate) => until(async () => predicate(await saved()), label)
  const radio = id => '.cover-picker input[type=radio][value="' + id + '"]'
  const inHeader = id => '[...document.querySelectorAll(".cover-plane img,.page-cover img")].some(i=>i.complete && i.naturalWidth && new URL(i.src).pathname.endsWith("/' + id + '.webp"))'
  async function click(selector) {
    const node = 'document.querySelector(' + JSON.stringify(selector) + ')'
    await wait(node)
    await ev(node + '.click()')
  }
  async function tab(label) {
    const option = '[...document.querySelectorAll(".cover-picker [role=tab]")].find(b => b.textContent.trim() === ' + JSON.stringify(label) + ')'
    await wait(option)
    await ev(option + '.click()')
  }
  async function checkBodyWidth(label) {
    const [visible, content] = await ev(`const body=document.querySelector('.cover-body')
      return [body.clientWidth,body.scrollWidth]`)
    assert.equal(content, visible, label + ' must fit without horizontal scrolling')
  }
  async function checkTiles(ids) {
    const nodes = await ev(`return [...document.querySelectorAll('.cover-tile')].map(label=>{
      const input=label.querySelector('input');return [input.value, label.innerText.trim(), input.getAttribute('aria-label')]
    })`)
    assert.deepEqual(nodes.map(n => n[0]), ids)
    assert(nodes.every(([, text, accessibleName]) => !text && accessibleName?.trim()))
  }
  const trigger = '.page-header-controls button:last-child', edit = '.cover-actions button'
  const close = () => click('.cover-close')
  const closed = () => wait('!document.querySelector(".cover-picker")')
  const colors = () => ev('return [...document.querySelectorAll(".cover-custom input")].map(i=>i.value)')
  await send('Page.navigate', { url })
  await wait('document.querySelector(".ProseMirror h1")?.textContent === "Materials"')
  await click(trigger)
  const inkSeries = ['ink-index', 'ink-leaf', 'ink-margin']
  const gallery = [...inkSeries, 'overlap', 'resonance', 'register']
  await wait(`document.querySelectorAll('.cover-tile img').length === ${gallery.length} && [...document.querySelectorAll('.cover-tile img')].every(im => im.complete && im.naturalWidth)`)
  await checkTiles(gallery)
  assert(await ev(`return [...document.querySelectorAll('.cover-tile')].every(tile =>
    new URL(tile.querySelector('img').src).pathname.endsWith('/' + tile.querySelector('input').value + '-thumb.webp'))`))
  assert.equal(await saved(), null)
  assert(await ev('return !document.querySelector(".page-cover, .cover-done, .cover-cancel")'))
  for (const id of inkSeries) {
    await click(radio(id))
    await wait(`document.querySelector('.cover-plane svg[data-cover-ink="${id}"] use')?.getAttribute('href')?.endsWith('/covers/${id}-ink.svg#nib')`)
    const activeTiles = await ev(`return [...document.querySelectorAll('.cover-tile svg.cover-ink-pass')]
      .map(svg => [svg.dataset.coverInk, svg.closest('.cover-tile').querySelector('input:checked')?.value])`)
    assert.deepEqual(activeTiles, [[id, id]], 'only the newly selected thumbnail draws its ink stroke')
    assert(await ev(`const svg=document.querySelector('.cover-plane svg[data-cover-ink="${id}"]')
      const img=svg.parentElement.querySelector('.document-cover-image'), viewport=img.getBoundingClientRect()
      const aspect=img.naturalWidth/img.naturalHeight, box=svg.getBoundingClientRect()
      const w=Math.max(viewport.width,viewport.height*aspect), h=w/aspect
      return Math.abs(svg.viewBox.baseVal.width/svg.viewBox.baseVal.height-aspect)<.001 &&
        Math.abs(box.width-w)<1 && Math.abs(box.height-h)<1 &&
        Math.abs(box.left-viewport.left-(viewport.width-w)/2)<1 && Math.abs(box.top-viewport.top-(viewport.height-h)/2)<1`),
      'the new ink must trace the same crop as the printed line on ' + id)
    await wait(inHeader(id))
    await expectSaved('first click writes full artwork ' + id, c => c?.artwork === id)
  }

  await checkBodyWidth('Selected artwork and its actions')
  await wait('!document.querySelector(".cover-ink-pass")')
  await click(radio('ink-margin'))
  await sleep(150)
  assert(await ev('return !document.querySelector(".cover-ink-pass")'), 'reselecting the dry illustration should leave it still')

  await click(radio('ink-leaf'))
  await wait(`document.querySelector('.cover-plane [data-cover-ink="ink-leaf"]')`)
  await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion', value:'reduce'}]})
  try {
    await wait('!document.querySelector(".cover-ink-pass")')
    await ev('performance.clearResourceTimings()')
    await click(radio('ink-index'))
    await wait(inHeader('ink-index'))
    await expectSaved('ink choice with reduced motion', c => c?.artwork === 'ink-index')
    assert(await ev(`return !document.querySelector('.cover-ink-pass') &&
      !performance.getEntriesByType('resource').some(entry => entry.name.endsWith('-ink.svg'))`))
  } finally {
    await send('Emulation.setEmulatedMedia', {features:[]})
  }
  await close()
  await closed()
  await send('Page.reload')
  await wait(inHeader('ink-index'))
  assert(await ev(`return !document.querySelector('.cover-ink-pass') &&
    !performance.getEntriesByType('resource').some(entry => entry.name.endsWith('-ink.svg'))`),
    'opening a saved document must not replay its cover stroke')
  await click(edit)

  // A rejected choice leaves the saved cover intact and allows another selection.
  await ev(`const original=window.fetch; window.fetch=function(input,init) {
    if(init?.method==='PUT' && new URL(input.url || input,location.href).pathname.endsWith('/api/metadata')) {
      window.fetch=original
      return Promise.resolve(Response.json({ok:false,error:'封面测试写入失败'}, {status:503}))
    }
    return original.call(this,input,init)
  }`)
  await click(radio('resonance'))
  await wait('document.querySelector(".cover-picker [role=alert]")?.textContent.trim()')
  assert.equal((await saved()).artwork, 'ink-index')

  // Hold the first real metadata write while two more choices and a dismissal arrive.
  await ev(`const original=window.fetch; window.fetch=async function(input,init) {
    if(init?.method==='PUT' && new URL(input.url || input,location.href).pathname.endsWith('/api/metadata')) {
      window.fetch=original
      await new Promise(resolve=>{window.finishCoverWrite=resolve})
    }
    return original.call(this,input,init)
  }`)
  await click(radio('overlap'))
  await wait('typeof window.finishCoverWrite==="function"')
  await click(radio('resonance'))
  await click(radio('register'))
  await wait(inHeader('register'))
  await close()
  await ev('window.finishCoverWrite()')
  await closed()
  await expectSaved('last choice survives closing during an earlier write', c => c?.artwork === 'register')
  const timeOrigin = await ev('return performance.timeOrigin')
  await send('Page.reload')
  await wait('performance.timeOrigin !== '+timeOrigin)
  await wait(inHeader('register'))
  await click(edit)
  await wait('document.querySelector(' + JSON.stringify(radio('register')) + ')?.checked')
  await tab('图案')
  await checkTiles(['mist','mesh','grain','pixel'])
  await click(radio('mesh'))
  await wait('document.querySelector(".page-cover canvas,.cover-plane canvas")')
  await expectSaved('pattern saved on selection', c => c?.preset === 'mesh')
  await click('.cover-adjust')
  await click('.cover-swatches button:nth-child(2)')
  await checkBodyWidth('Pattern settings')
  const palette = await colors()
  assert.equal(palette.length, 3)
  await expectSaved('palette saved without confirmation', c => c?.colors.join() === palette.join())
  const seed = (await saved()).seed
  await click('.cover-shuffle')
  await expectSaved('shuffle keeps chosen colors', c => c?.seed !== seed && c?.colors.join() === palette.join())
  await click(radio('pixel'))
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape' })
  await closed()
  await expectSaved('escape preserves applied pattern', c => c?.preset === 'pixel')

  if (await ev('return !!document.querySelector(".doc-tools.over-outline")')) {
    await click('.toc-collapse-chip')
    await wait('!document.querySelector(".doc-tools.over-outline")')
  }
  await click(edit)
  await tab('上传')
  await ev(`const c=document.createElement('canvas'); c.width=1000;c.height=240;
    const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,500,240);ctx.fillStyle='#101010';ctx.fillRect(500,0,500,240);
    const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
    const input=document.querySelector('.cover-picker input[type=file]');
    const transfer=new DataTransfer();transfer.items.add(new File([blob],'Two inks '.repeat(20)+'.png',{type:'image/png'}));
    input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));`)
  await expectSaved('upload applies immediately', c => c?.type === 'image' && c.asset)
  await checkBodyWidth('Long uploaded filename')
  await wait('document.querySelector(".doc-topbar.over-cover .doc-tools[data-cover-surface=dark]")')
  await wait('document.querySelector(".doc-topbar.over-cover .doc-tab[data-cover-surface=light]")')
  await click('.cover-adjust')
  await ev(`const slider=document.querySelector('.cover-position-row input[type=range]')
    for (const n of [39,54,76]) {slider.value=n;slider.dispatchEvent(new Event('input',{bubbles:true}))}`)
  assert.notEqual((await saved()).position, 76)
  await ev('document.querySelector(".cover-position-row input").dispatchEvent(new Event("change",{bubbles:true}))')
  await expectSaved('crop saved when the slider settles', c => c?.position === 76)
  await close()
  await closed()
  await send('Emulation.setDeviceMetricsOverride', {width:390,height:740,deviceScaleFactor:1,mobile:false})
  try {
    await click(edit)
    await wait('document.querySelector(".cover-picker [role=tab][aria-selected=true]")?.textContent.trim()==="上传"')
    await checkBodyWidth('Narrow upload settings')
    await tab('图库')
    await checkBodyWidth('Narrow gallery')
    assert(await ev(`const panel=document.querySelector('.cover-picker'), rect=panel.getBoundingClientRect();
      return rect.left>=0 && rect.right<=innerWidth+1 && rect.bottom<=innerHeight+1 && panel.scrollWidth<=panel.clientWidth+1`), 'narrow picker must fit')
    await click(radio('ink-leaf'))
    await expectSaved('narrow gallery choice', c => c?.artwork === 'ink-leaf')
    await click('.cover-remove')
    await expectSaved('remove persists immediately', c => c === null)
    await wait('!document.querySelector(".page-cover")')
    if (await ev('return !!document.querySelector(".cover-close")')) await close()
    await closed()
    await click(trigger)
    await close()
    await closed()
    assert.equal(await saved(), null)
  } finally {
    await send('Emulation.clearDeviceMetricsOverride')
  }

  // Opening the picker must preserve a retired cover until its owner changes it.
  const archivedCovers = [
    {type:'gradient', preset:'ribbon', height:'small', animated:false, seed:513,
      colors:['#315072','#c4baab','#dda871','#b8c6c3']},
    {type:'artwork', artwork:'refraction', height:'large', position:38}
  ]
  for (const cover of archivedCovers) {
    const metadata = await fetch(new URL('api/metadata?path=' + encodeURIComponent(file), appUrl)).then(r=>r.json())
    const updated = await fetch(new URL('api/metadata', appUrl), {method:'PUT', headers:{'content-type':'application/json'},
      body:JSON.stringify({path:file, revision:metadata.data.revision, meta:{cover}})}).then(r=>r.json())
    assert(updated.ok, updated.error)
    const previousTimeOrigin = await ev('return performance.timeOrigin')
    await send('Page.reload')
    await wait('performance.timeOrigin !== '+previousTimeOrigin)
    const artwork = cover.type === 'artwork'
    await wait(artwork ? inHeader(cover.artwork) : 'document.querySelector(".cover-plane canvas,.page-cover canvas")')
    await click(edit)
    await tab(artwork ? '图库' : '图案')
    await checkTiles(artwork ? gallery : ['mist','mesh','grain','pixel'])
    await close()
    await closed()
    assert.deepEqual(await saved(), updated.data.meta.cover)
  }
}
