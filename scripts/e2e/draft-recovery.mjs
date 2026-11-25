import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export async function verifyDraftRecovery({ send, ev, root, appUrl, sleep }) {
  const library = '草稿回归'
  const name = '现场记录'
  const file = library + '/' + name + '.md'
  const filename = path.join(root, file)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, '# Field note\n\nTide\n\nRemote\n')
  const url = new URL('doc/' + library + '/' + name + '?lib=' + library, appUrl).href
  const records = "Object.keys(localStorage).filter(k => k.startsWith('typocket.draft:v1:'))"
  async function until(label, predicate) {
    for (let i = 0; i < 120; i++) {
      if (await predicate()) return
      await sleep(80)
    }
    throw Error('等待超时：' + label)
  }
  async function open() {
    await send('Page.navigate', { url })
    await until('打开富文本编辑器', () => ev("return window.__reader?.currentPath === " + JSON.stringify(file) + " && window.__fold?.view()?.dom.querySelector('h1')?.textContent === 'Field note'"))
  }
  async function leave() {
    await send('Page.navigate', { url: 'about:blank' })
    await until('新页面', () => ev("return location.href === 'about:blank'"))
  }
  async function append(text) {
    await ev("const view = window.__fold.view(); view.focus(); const node=view.dom.querySelector('p').firstChild; getSelection().collapse(node,node.length); document.dispatchEvent(new Event('selectionchange'))")
    await until('光标在第一段末尾', () => ev("const pos=window.__fold.view().state.selection.$from; return pos.parent.type.name==='paragraph' && pos.parentOffset===pos.parent.textContent.length"))
    await send('Input.insertText', { text })
  }
  async function click(text) {
    await ev("const btn=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===" + JSON.stringify(text) + "); if(!btn)throw Error('找不到按钮'); btn.click()")
  }
  async function blockWrites() {
    await ev(`const original=window.fetch; window.__testBlock=true; window.fetch=(u,o)=>{
      if(window.__testBlock && o?.method==='PUT' && new URL(u,location.href).pathname==='/api/doc')
        return Promise.resolve(Response.json({ok:false,error:'isolated-write-failure'},{status:503}));
      return original(u,o)
    }`)
  }
  await open()

  // Assert the shortcut sends the editor's immediate state, before autosave's debounce.
  await ev("const old=window.fetch; window.fetch=(u,o)=>{if(o?.method==='PUT' && new URL(u,location.href).pathname==='/api/doc')window.__draftPut=JSON.parse(o.body);return old(u,o)}")
  await append(' shortcut')
  assert(await ev("window.dispatchEvent(new KeyboardEvent('keydown',{key:'s',metaKey:true,bubbles:true,cancelable:true})); await Promise.resolve(); return window.__draftPut?.content.includes('Tide shortcut')"), '即时 Cmd+S 应发出最新正文')
  await until('快捷保存已落盘', () => fs.readFileSync(filename, 'utf8').includes('Tide shortcut'))

  const origin = await ev('return performance.timeOrigin')
  await append(' fast-reload')
  await send('Page.reload')
  await until('已完成整页刷新', () => ev('return performance.timeOrigin !== ' + origin + ' && !!window.__reader?.recovery && !!window.__fold?.view()'))
  assert(!fs.readFileSync(filename, 'utf8').includes('fast-reload'), '刷新前尚未触发自动保存')
  await ev(`const original=window.fetch;window.fetch=async(u,o)=>{
    if((o?.method ?? 'GET')==='GET' && new URL(u,location.href).pathname==='/api/doc'){
      window.fetch=original;await new Promise(r=>window.__releaseDraftRead=r)
    } return original(u,o)
  }`)
  await click('恢复草稿')
  await until('正在读取磁盘版本', () => ev("return !!window.__releaseDraftRead"))
  await ev("document.querySelector('[aria-label=稍后恢复草稿]').click();window.__releaseDraftRead()")
  await until('已收起草稿', () => ev("return !window.__reader.recovery"))
  await leave()
  await open()
  await until('稍后的草稿仍可恢复', () => ev("return !!window.__reader.recovery"))
  await click('恢复草稿')
  await until('立即刷新的最后输入已恢复', () => ev("return !window.__reader.isDirty && !window.__reader.saving && window.__fold.view().dom.textContent.includes('fast-reload')"))
  assert(fs.readFileSync(filename,'utf8').includes('shortcut fast-reload'))

  await blockWrites()
  await append(' offline')
  assert(await ev("const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return !e.defaultPrevented && " + records + ".some(k=>JSON.parse(localStorage[k]).text.includes('shortcut fast-reload offline'))"), '可恢复时刷新应直接继续并保护防抖中的文字')
  await until('保存失败保留在浏览器', () => ev("return document.querySelector('.doc-notice')?.textContent.includes('保留在此浏览器')"))
  await leave()
  fs.writeFileSync(filename, fs.readFileSync(filename, 'utf8').replace('Remote', 'Agent changed another paragraph'))
  await open()
  await until('草稿恢复入口', () => ev("return document.querySelector('.doc-notice')?.textContent.includes('恢复草稿')"))
  assert(!fs.readFileSync(filename,'utf8').includes('offline'))
  await click('恢复草稿')
  await until('恢复并保存不同段落修改', () => /shortcut fast-reload offline[\s\S]*Agent changed/.test(fs.readFileSync(filename, 'utf8')))
  await until('成功保存后清理恢复记录', () => ev("return " + records + ".length===0"))

  await blockWrites()
  await append(' local conflict')
  await until('保存失败后建立持久草稿', () => ev("return window.__reader?.errorKind==='save' && " + records + ".length===1"))
  await leave()
  fs.writeFileSync(filename, fs.readFileSync(filename, 'utf8').replace('Tide shortcut fast-reload offline','Agent edited this paragraph'))
  await open()
  await until('第二次恢复入口', () => ev("return !!window.__reader?.recovery"))
  await click('恢复草稿')
  await until('恢复冲突', () => ev("return !!document.querySelector('.conflict-dialog')"))
  assert(await ev("return document.querySelector('.conflict-dialog textarea').value.includes('local conflict')"))
  assert(!fs.readFileSync(filename, 'utf8').includes('local conflict'))
  await leave()
  await open()
  await until('再次打开打断的冲突', () => ev("return !!window.__reader?.recovery"))
  await click('恢复草稿')
  await until('冲突的原始版本仍在', () => ev("return !!document.querySelector('.conflict-dialog')"))
  await click('使用磁盘版本')
  await click('放弃我的修改，使用磁盘版本')
  await until('接受磁盘版清除本份草稿', () => ev("return !window.__reader.conflict && " + records + ".length===0"))
  await leave()
  await open()
  assert.equal(await ev("return !!window.__reader.recovery"), false, '不重复要求处理已解决的同一份草稿')

  await blockWrites()
  await append(' retry-online')
  await until('断网保存失败', () => ev("return window.__reader?.errorKind==='save'"))
  await ev("window.__testBlock=false;window.dispatchEvent(new Event('online'))")
  await until('恢复网络后自动落盘', () => fs.readFileSync(filename,'utf8').includes('retry-online'))
  await until('重试成功清理草稿', () => ev("return " + records + ".length===0"))

  // Distinct window identities must never overwrite or discard each other's newer work.
  assert(await ev(`const {documentDrafts}=await import('/src/utils/document-drafts.js')
    const a=documentDrafts(), b=documentDrafts(), c=documentDrafts(), scope='typocket.test-draft'
    a.checkpoint(scope,'base','r','A');b.checkpoint(scope,'base','r','B')
    const old=a.latest(scope); a.accept(old); b.checkpoint(scope,'base','r','B2'); a.finish(scope)
    const latest=c.latest(scope)
    b.finish(scope)
    return old.text==='B' && latest?.text==='B2' && !c.latest(scope)`))
  await append(' ime')
  await send('Input.imeSetComposition', { text: '输', selectionStart: 1, selectionEnd: 1 })
  assert(await ev("const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return window.__fold.view().composing && e.defaultPrevented"), '输入法尚未提交时保留离开提示')
  await send('Input.insertText', { text: '输入' })
  await until('输入法提交后保存', () => fs.readFileSync(filename,'utf8').includes('输入'))
  // A real second browsing context receives storage events while its author keeps editing.
  await blockWrites()
  await append(' window-A')
  await until('首窗口草稿', () => ev("return window.__reader.errorKind==='save'"))
  const popup = await send('Runtime.evaluate', { expression: "!!(window.__secondDraftWindow=window.open("+JSON.stringify(url)+",'_blank'))", userGesture:true, returnByValue:true })
  assert(popup.result.value, '打开第二个浏览器窗口')
  const second = 'window.__secondDraftWindow'
  await until('另一窗口看到待恢复稿', () => ev("return " + second + ".__reader?.recovery?.text.includes('window-A')"))
  await ev("const d="+second+".document; [...d.querySelectorAll('.doc-notice button')].find(b=>b.textContent==='丢弃草稿').click()")
  await append(' newer')
  await until('较旧草稿的丢弃确认已失效', () => ev("return "+second+".__reader?.recovery?.text.includes('window-A newer') && !"+second+".document.querySelector('.doc-notice')?.textContent.includes('确认丢弃')"))
  assert(await ev("return "+records+".some(k=>JSON.parse(localStorage[k]).text.includes('window-A newer'))"))
  // Discard only the exact version displayed; an author still editing can checkpoint again.
  for (const label of ['丢弃草稿','确认丢弃这份草稿']) {
    await ev("const d="+second+".document; [...d.querySelectorAll('.doc-notice button')].find(b=>b.textContent==="+JSON.stringify(label)+").click()")
  }
  await until('第二窗口丢弃确认完成', () => ev("return !"+second+".__reader.recovery && "+records+".length===0"))
  assert(await ev("return window.__reader.currentRaw.includes('window-A newer') && window.__reader.prepareToLeave() && "+records+".length===1"))
  await ev(second+".close();window.__testBlock=false;window.dispatchEvent(new Event('online'))")
  await until('仍在编写的窗口可保存', () => fs.readFileSync(filename,'utf8').includes('window-A newer'))

  // A restored workspace may contain a copy with identical IDs and content.
  assert(await ev(`const r=await fetch('/api/doc?path='+encodeURIComponent(window.__reader.currentPath)).then(r=>r.json())
    const result=await fetch('/api/doc',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...r.data,workspaceId:'another-instance',content:'wrong workspace'})}).then(r=>r.json())
    return result.code==='DOCUMENT_CHANGED'`))
  assert(!fs.readFileSync(filename,'utf8').includes('wrong workspace'))

  await blockWrites()
  await ev("const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('typocket.draft:v1:'))throw new DOMException('full','QuotaExceededError');return set.call(this,k,v)}")
  await append(' quota')
  await until('配额不足时如实提示', () => ev("return document.querySelector('.doc-notice')?.textContent.includes('复制正文')"))
  assert.equal(await ev("return " + records + ".length"), 0)
  assert(await ev("const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented"), '存储已满应保留原生离开提示')
  await ev("window.__testBlock=false;window.dispatchEvent(new Event('online'))")
  await until('临时配额失败后仍可手动保住正文', () => fs.readFileSync(filename,'utf8').includes(' quota'))
  await leave()
  await open()
  // Real removal and recreation of the same filename must not adopt the previous file's pending text.
  await blockWrites()
  await append(' for old ID only')
  await until('旧文件草稿', () => ev("return window.__reader.errorKind==='save'"))
  await leave()
  const api = new URL('api/doc', appUrl)
  async function request(method, body) {
    const res=await fetch(api, {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)})
    const result=await res.json()
    assert(result.ok,JSON.stringify(result))
    return result.data
  }
  await request('DELETE', {path:file})
  await request('POST', {dir:library,name,content:'# Field note\n\nReplacement\n'})
  await open()
  assert.equal(await ev("return !!window.__reader.recovery"),false)
  assert.equal(fs.readFileSync(filename,'utf8'),'# Field note\n\nReplacement\n')
  // Renaming the active file keeps its workspace identity for the very next edit.
  await ev("await window.__reader.renameDoc(window.__reader.currentPath,'已改名')")
  await until('已转到新路径', () => ev("return window.__reader.currentPath.endsWith('/已改名.md') && !!window.__fold.view()?.dom.querySelector('p')"))
  await blockWrites()
  await append(' after rename')
  await until('改名后可继续保护修改', () => ev("return document.querySelector('.doc-notice')?.textContent.includes('保留在此浏览器')"))
  await ev("window.__testBlock=false;window.dispatchEvent(new Event('online'))")
  await until('改名文件保存完成', () => fs.readFileSync(path.join(root,library,'已改名.md'),'utf8').includes('after rename'))

  const movedLib = library + '更名'
  const stableId = await ev('return window.__reader.currentSourceId')
  await ev("const s=window.__reader;await s.createCategory(s.activeLibrary,'第一层');await s.createCategory(s.activeLibrary,'第二层')")
  const moves = [
    [`await s.moveDoc(s.currentPath,s.activeLibrary+'/第一层')`, library+'/第一层/已改名.md'],
    [`await s.renameCategory(s.activeLibrary+'/第一层','新目录')`, library+'/新目录/已改名.md'],
    [`await s.moveCategory(s.activeLibrary+'/新目录',s.activeLibrary+'/第二层')`, library+'/第二层/新目录/已改名.md'],
    [`await s.renameLibrary(s.activeLibrary,${JSON.stringify(movedLib)})`, movedLib+'/第二层/新目录/已改名.md']
  ]
  for (const [operation, target] of moves) {
    await ev('const s=window.__reader;'+operation)
    await until('当前打开的文档随路径迁移', () => ev("return window.__reader.currentPath==="+JSON.stringify(target)+" && window.__reader.currentSourceId==="+JSON.stringify(stableId)+" && !!window.__fold?.view()?.dom.querySelector('p')"))
    await append(' moved')
    assert(await ev("const s=window.__reader;return s.prepareToLeave() && "+records+".some(k=>k.includes(s.currentSourceId) && JSON.parse(localStorage[k]).text.includes(' moved'))"))
    assert(await ev('return await window.__reader.save()'))
    assert(fs.readFileSync(path.join(root,target),'utf8').includes(' moved'))
  }

}
