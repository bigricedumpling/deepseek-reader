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
  async function until(description, test) {
    for (let i = 0; i < 140; i++) {
      if (await ev('return Boolean(' + test + ')')) return
      await sleep(60)
    }
    throw Error('引用导航未完成：' + description)
  }
  const box = "document.getElementById('main-scroll-container')"
  const link = "document.querySelector('.ProseMirror a[href*=原文], .ProseMirror a[data-doc-target$=\"原文.md\"], .ProseMirror [data-doc-target$=\"原文.md\"]')"
  const chapter = "[...document.querySelectorAll('.ProseMirror h2')].find(x=>x.textContent==='目标小节')"
  const located = '(()=>{const h=' + chapter + ';if(!h)return false;const y=h.getBoundingClientRect().top-' + box + '.getBoundingClientRect().top;return y>=0&&y<=125})()'
  await send('Page.navigate', {url: new URL('doc/'+library+'/索引?lib='+library,appUrl).href})
  await until('索引可编辑', link)
  await ev(link + '.scrollIntoView({block:"center",behavior:"instant"})')
  const before = await ev('return ' + box + '.scrollTop')
  assert(before > 500)
  await ev(link + '.closest("a").click()')
  await until('跨库直达章节', located)
  assert(decodeURIComponent(await ev('return location.hash')) === '#目标小节')
  await ev('history.back()')
  await until('后退恢复索引位置', link + ' && Math.abs(' + box + '.scrollTop - ' + before + ') < 3')
  await ev('history.forward()')
  await until('前进到同一节', located)
  await send('Page.reload')
  await until('重载带章节的地址', located)
  await ev('history.back()')
  await until('返回索引中的 PDF 链接', "document.querySelector('.ProseMirror a[href*=\"page=3\"]')" + ' && Math.abs(' + box + '.scrollTop - ' + before + ') < 3')
  await ev("document.querySelector('.ProseMirror a[href*=\"page=3\"]').click()")
  await until('PDF 第三页', "document.querySelector('[aria-label=\"PDF 页码\"]')?.value==='3' && document.querySelector('.pdf-paper canvas')?.clientHeight>100")
  await ev('history.back()')
  await until('从 PDF 返回', link + ' && Math.abs(' + box + '.scrollTop - ' + before + ') < 3')
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
  await until('索引原链接',refLink+'?.getAttribute("href")==="notes.md#结论"')
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
