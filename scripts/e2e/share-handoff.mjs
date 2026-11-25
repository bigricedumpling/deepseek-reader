import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export async function verifyShareHandoff({send, ev, root, appUrl, sleep}) {
  const lib = '分享范围验证'
  const file = lib + '/阅读笔记.md'
  fs.mkdirSync(path.join(root, lib), {recursive:true})
  fs.writeFileSync(path.join(root, file), '# 阅读笔记\n\n不应写进提示词的正文样本。\n')
  await send('Page.navigate', {url:new URL('doc/' + file.slice(0, -3) + '?lib=' + lib, appUrl).href})
  async function wait(condition) {
    for (let i = 0; i < 100; i++) {
      if (await ev('return !!(' + condition + ')')) return
      await sleep(50)
    }
    throw Error('分享面板未就绪 ' + condition)
  }
  await wait('window.__reader?.currentLoaded && !window.__reader.isGuest && document.querySelector(".doc-more > button")')
  const id = await ev('return window.__reader.currentSourceId')
  assert(id)
  // This is a disposable tab. Simulate clipboard permissions without touching the user's clipboard.
  await ev(`Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{
      writeText:async text => { window.shareText = text }
    }})
    document.querySelector('.doc-more > button').click()`)
  const entry = '[...document.querySelectorAll(".more-menu button")].find(b => b.textContent.trim() === "通过 Agent 分享")'
  await wait(entry)
  await ev(entry + '.click()')
  const copy = 'document.querySelector(".share-copy")'
  await wait(copy)
  const scope = value => 'document.querySelector(\'.share-body input[value="' + value + '"]\')'
  for (const choice of ['document','library']) {
    if (choice === 'library') await ev(scope(choice) + '.click()')
    assert(await ev('return ' + scope(choice) + '.checked'))
    await ev('window.shareText = ""; ' + copy + '.click()')
    await wait('window.shareText && ' + copy + '.textContent.includes("已复制")')
    const content = await ev('return window.shareText')
    const selection = JSON.parse(content.split('\n').find(line => line.startsWith('所选范围')).split('（JSON） ')[1])
    assert.equal(selection.localService, appUrl)
    const expected = choice === 'document' ? {document:file, id} : {library:lib}
    assert.deepEqual(selection, {...expected, localService:appUrl})
    assert(!content.includes('不应写进提示词的正文样本'))
  }
  await ev('navigator.clipboard.writeText = async () => { throw Error("denied") }; document.execCommand = () => false; ' + copy + '.click()')
  await wait('document.activeElement.matches(".share-body textarea")')
  assert(await ev('const area = document.activeElement; return area.readOnly && area.selectionEnd === area.value.length && area.value === window.shareText'))
  await send('Input.dispatchKeyEvent', {type:'keyDown', key:'Escape', code:'Escape'})
  await wait('document.activeElement === ' + entry)
  await ev(entry + '.click()')
  await wait(scope('document') + '?.checked')
  const guestFixture = await fetch(new URL('api/access', appUrl), {
    method:'PUT', headers:{'content-type':'application/json'}, body:JSON.stringify({path:lib, shared:true})
  }).then(response => response.json())
  assert(guestFixture.ok)
  await send('Page.navigate', {url:new URL('onlyread/' + file.slice(0, -3) + '?lib=' + lib, appUrl).href})
  await wait('window.__reader?.isGuest && document.querySelector(".doc-more > button")')
  await ev('document.querySelector(".doc-more > button").click()')
  await wait('document.querySelector(".more-menu")')
  assert(!(await ev('return !!(' + entry + ')')), '访客不应获得所有者分享入口')
}
