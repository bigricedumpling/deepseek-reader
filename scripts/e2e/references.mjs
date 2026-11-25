import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export async function verifyReferences({ send, ev, root, appUrl, sleep }) {
  const library = '引用验收'
  const targetLibrary = '资料验收'
  for (const dir of [library, targetLibrary]) fs.mkdirSync(path.join(root, dir))
  fs.writeFileSync(path.join(root, library, '移动索引.md'), '# 移动索引\n\n[原资料](notes.md#结论)\n')
  for (const dir of [library, targetLibrary]) {
    fs.writeFileSync(path.join(root, dir, 'notes.md'), '# ' + dir + '的原稿\n\n## 结论\n')
  }
  const paragraphs = Array.from({ length: 85 }, (_, i) => '第' + i + '段用于阅读定位。').join('\n\n')
  fs.writeFileSync(path.join(root, library, '索引.md'), '# 索引\n\n' + paragraphs + '\n\n[目标章节](../资料验收/原文.md#目标小节)\n\n[第三页](../资料验收/说明.pdf#page=3)\n\n' + paragraphs)
  fs.writeFileSync(path.join(root, targetLibrary, '原文.md'), '# 原文\n\n' + paragraphs + '\n\n## 目标小节\n\n结论。\n\n' + paragraphs)
  fs.copyFileSync(fileURLToPath(new URL('../../demo/产品白皮书.pdf', import.meta.url)), path.join(root, targetLibrary, '说明.pdf'))
  async function until(description, test, navigating = false) {
    for (let i = 0; i < 140; i++) {
      try {
        if (await ev('return Boolean(' + test + ')')) return
      } catch (error) {
        // An evaluation in the previous document can lose its JS context at
        // commit. Confirm that the same page target still exists before polling
        // the new document. Ordinary evaluation and navigation errors propagate.
        const lostContext = /^(Inspected target navigated or closed|Execution context was destroyed\.?|Cannot find context with specified id)$/.test(error.message)
        if (!navigating || !lostContext) throw error
        await send('Page.getFrameTree')
      }
      await sleep(60)
    }
    throw Error('引用导航未完成：' + description)
  }
  const arrived = (description, test) => until(description, test, true)
  async function traverse(offset) {
    const { currentIndex, entries } = await send('Page.getNavigationHistory')
    const entry = entries[currentIndex + offset]
    assert.ok(entry, '浏览器应保留前进和后退条目')
    await send('Page.navigateToHistoryEntry', { entryId: entry.id })
  }
  const box = "document.getElementById('main-scroll-container')"
  const link = "document.querySelector('.ProseMirror a[href*=原文], .ProseMirror a[data-doc-target$=\"原文.md\"], .ProseMirror [data-doc-target$=\"原文.md\"]')"
  const chapter = "[...document.querySelectorAll('.ProseMirror h2')].find(x=>x.textContent==='目标小节')"
  const located = '(()=>{const h=' + chapter + ';if(!h)return false;const y=h.getBoundingClientRect().top-' + box + '.getBoundingClientRect().top;return y>=0&&y<=125})()'
  await send('Page.navigate', {url: new URL('doc/'+library+'/索引?lib='+library,appUrl).href})
  await arrived('索引可编辑', link)
  await ev(link + '.scrollIntoView({block:"center",behavior:"instant"})')
  const before = await ev('return ' + box + '.scrollTop')
  assert(before > 500)
  await ev(link + '.closest("a").click()')
  await until('跨库直达章节', located)
  assert(decodeURIComponent(await ev('return location.hash')) === '#目标小节')
  await traverse(-1)
  await arrived('后退恢复索引位置', link + ' && Math.abs(' + box + '.scrollTop - ' + before + ') < 3')
  await traverse(1)
  await arrived('前进到同一节', located)
  const previousPage = await ev('return performance.timeOrigin')
  await send('Page.reload')
  await arrived('重载带章节的地址', 'performance.timeOrigin !== ' + previousPage + ' && ' + located)
  // A back action can arrive before Vue mounts on a fresh page. Only the history
  // entry knows this exact scroll offset if the local reading cache is unavailable.
  const earlyBack = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: "if (location.hash && history.state?.typocketReference) { localStorage.removeItem('reader.pos'); history.back() }"
  })
  try {
    await send('Page.reload')
    await arrived('冷启动时后退恢复索引', "document.querySelector('.ProseMirror a[href*=\"page=3\"]')" + ' && Math.abs(' + box + '.scrollTop - ' + before + ') < 3')
  } finally {
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: earlyBack.identifier })
  }
  const advanced = await ev('const scroller = ' + box + '; scroller.scrollTop += 110; return scroller.scrollTop')
  const indexPage = await ev('return performance.timeOrigin')
  await send('Page.reload')
  await arrived('刷新停在刚读到的新位置', 'performance.timeOrigin !== ' + indexPage + ' && ' + link + ' && Math.abs(' + box + '.scrollTop - ' + advanced + ') < 3')
  await ev("document.querySelector('.ProseMirror a[href*=\"page=3\"]').click()")
  await until('PDF 第三页', "document.querySelector('[aria-label=\"PDF 页码\"]')?.value==='3' && document.querySelector('.pdf-paper canvas')?.clientHeight>100")
  await traverse(-1)
  await arrived('从 PDF 返回', link + ' && Math.abs(' + box + '.scrollTop - ' + advanced + ') < 3')
  async function moveThroughMenu(file, destination) {
    const row = 'document.querySelector(' + JSON.stringify('[data-file="' + file + '"]') + ')'
    await until('文件树中的 ' + file,row)
    await ev(row + '.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:100,clientY:240}))')
    const move = '[...document.querySelectorAll(".tree-menu button")].find(el=>el.textContent.trim().startsWith("移动到"))'
    await until('移动菜单',move)
    await ev(move+'.click()')
    const choice = '[...document.querySelectorAll(".transfer-dialog .destination-name")].find(el=>el.textContent===' + JSON.stringify(destination) + ')'
    await until('目标知识库',choice)
    await ev(choice+'.closest("button").click()')
    const confirm = 'document.querySelector(".transfer-actions button:last-child:not(:disabled)")'
    await until('移动确认',confirm)
    await ev(confirm+'.click()')
    await until('完成移动','!document.querySelector(".transfer-dialog")')
  }
  await send('Page.navigate', {url: new URL('doc/'+library+'/移动索引?lib='+library,appUrl).href})
  const refLink = 'document.querySelector(".ProseMirror a[href]")'
  await arrived('索引原链接',refLink+'?.getAttribute("href")==="notes.md#结论"')
  // Move the target while the index is open. Plant another note at its former name.
  await moveThroughMenu(library + '/notes.md',targetLibrary)
  fs.writeFileSync(path.join(root,library,'notes.md'),'# 同名的另一篇\n')
  await until('当前编辑器采用重定向后的引用',refLink+'?.getAttribute("href")?.includes("..")')
  // Then move the index itself and immediately open its rebased relative link.
  await moveThroughMenu(library + '/移动索引.md',targetLibrary)
  await until('已移动索引显示相邻链接',refLink+' && !'+refLink+'.getAttribute("href").includes("..")')
  await ev(refLink+'.click()')
  await until('原资料身份保持不变',"document.querySelector('.ProseMirror h1')?.textContent===" + JSON.stringify(library+'的原稿'))

}
