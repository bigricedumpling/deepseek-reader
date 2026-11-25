import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export async function verifyCoverPicker({ send, ev, root, appUrl, sleep }) {
  const lib = 'Cover studio'
  const file = lib + '/Materials.md'
  const url = new URL('doc/' + lib + '/Materials?lib=' + encodeURIComponent(lib), appUrl).href
  fs.mkdirSync(path.join(root, lib))
  fs.writeFileSync(path.join(root, file), '# Materials\n\nLight passes through both layers.\n')
  async function saved() {
    const r = await fetch(new URL('api/metadata?path=' + encodeURIComponent(file), appUrl)).then(r => r.json())
    assert(r.ok)
    return r.data.meta.cover ?? null
  }
  async function wait(expression) {
    for (let i = 0; i < 140; i++) {
      if (await ev('return !!(' + expression + ')')) return
      await sleep(50)
    }
    throw Error('Cover picker timed out: ' + expression)
  }
  async function click(selector) {
    await wait('document.querySelector(' + JSON.stringify(selector) + ')')
    await ev('document.querySelector(' + JSON.stringify(selector) + ').click()')
  }
  async function tab(label) {
    const option = '[...document.querySelectorAll(".cover-picker [role=tab]")].find(b => b.textContent.trim() === ' + JSON.stringify(label) + ')'
    await wait(option)
    await ev(option + '.click()')
  }
  const radio = name => '.cover-picker input[type=radio][aria-label="' + name + '"]'
  const inHeader = artwork => '[...document.querySelectorAll(".cover-plane img,.page-cover img")].some(i=>i.complete && i.naturalWidth && new URL(i.src).pathname.endsWith("/' + artwork + '.webp"))'
  const trigger = '.page-header-controls button:last-child'
  const edit = '.cover-actions button'
  await send('Page.navigate', { url })
  await wait('document.querySelector(".ProseMirror h1")?.textContent === "Materials"')
  await click(trigger)
  await wait(inHeader('overlap'))
  await wait('document.querySelectorAll(".cover-tile img").length === 4 && [...document.querySelectorAll(".cover-tile img")].every(im=>im.complete && im.naturalWidth)')
  assert.equal(await saved(), null)
  await click(radio('骏州江尻'))
  await wait(inHeader('ejiri'))
  await click(radio('套印'))
  await wait(inHeader('register'))
  await click('.cover-cancel')
  await wait('!document.querySelector(".page-cover, .cover-picker")')
  assert.equal(await saved(), null)

  await click(trigger)
  await click(radio('振纹'))
  await click('.cover-done')
  await wait('!document.querySelector(".cover-picker")')
  assert.equal((await saved()).artwork, 'resonance')
  const timeOrigin = await ev('return performance.timeOrigin')
  await send('Page.reload')
  await wait('performance.timeOrigin !== '+timeOrigin)
  await wait(inHeader('resonance'))
  await click(edit)
  await wait('document.querySelector(' + JSON.stringify(radio('振纹')) + ')?.checked')
  await tab('图案')
  await click(radio('流线'))
  await wait('document.querySelector(".page-cover canvas,.cover-plane canvas")')
  await click('.cover-adjust')
  await click('.cover-swatches button:nth-child(2)')
  const colorValues = () => ev('return [...document.querySelectorAll(".cover-custom input")].map(input=>input.value)')
  const palette = await colorValues()
  assert.equal(palette.length, 3)
  await click('.cover-shuffle')
  assert.deepEqual(await colorValues(), palette)
  await click(radio('像素'))
  await click(radio('流线'))
  await wait('document.querySelector(' + JSON.stringify(radio('流线')) + ')?.checked')
  assert.deepEqual(await colorValues(), palette)
  assert.equal((await saved()).artwork, 'resonance')
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape' })
  await wait('!document.querySelector(".cover-picker")')
  await wait(inHeader('resonance'))

  // With the outline open the right controls sit on the outline's own background.
  if (await ev('return !!document.querySelector(".doc-tools.over-outline")')) {
    await click('.toc-collapse-chip')
    await wait('!document.querySelector(".doc-tools.over-outline")')
  }
  // A two-tone local upload exercises live preview and the real over-cover controls.
  await click(edit)
  await tab('上传')
  await ev(`const c=document.createElement('canvas'); c.width=1000;c.height=240;
    const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,500,240);ctx.fillStyle='#101010';ctx.fillRect(500,0,500,240);
    const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
    const input=document.querySelector('.cover-picker input[type=file]');
    const transfer=new DataTransfer();transfer.items.add(new File([blob],'Two inks.png',{type:'image/png'}));
    input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));`)
  await wait('[...document.querySelectorAll(".cover-plane img,.page-cover img")].some(im=>im.src.startsWith("blob:") && im.naturalWidth===1000)')
  await wait('document.querySelector(".doc-topbar.over-cover .doc-tools[data-cover-surface=dark]")')
  await wait('document.querySelector(".doc-topbar.over-cover .doc-tab[data-cover-surface=light]")')
  assert.equal((await saved()).artwork, 'resonance')
  await click('.cover-done')
  await wait('!document.querySelector(".cover-picker")')
  assert.equal((await saved()).type, 'image')

  await send('Emulation.setDeviceMetricsOverride', {width:390,height:740,deviceScaleFactor:1,mobile:false})
  try {
    await click(edit)
    await wait('document.querySelector(".cover-picker [role=tab][aria-selected=true]")?.textContent.trim()==="上传"')
    await tab('图库')
    await click(radio('叠片'))
    await wait(inHeader('overlap'))
    assert(await ev(`const panel=document.querySelector('.cover-picker'), rect=panel.getBoundingClientRect();
      return rect.left>=0 && rect.right<=innerWidth+1 && rect.bottom<=innerHeight+1 && panel.scrollWidth<=panel.clientWidth+1`), 'narrow picker must fit')
    await click('.cover-done')
    await wait('!document.querySelector(".cover-picker")')
    await click(edit)
    await click('.cover-remove')
    assert.equal((await saved()).artwork, 'overlap')
    await click('.cover-cancel')
    await wait('!document.querySelector(".cover-picker")')
    await wait(inHeader('overlap'))
    await click(edit)
    await click('.cover-remove')
    await click('.cover-done')
    await wait('!document.querySelector(".cover-picker,.page-cover")')
    assert.equal(await saved(), null)
  } finally {
    await send('Emulation.clearDeviceMetricsOverride')
  }
}
