import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export async function verifyFind({ send, ev, root, appUrl, sleep }) {
  const src = path.join(root, '查找样本')
  fs.mkdirSync(src, { recursive: true })
  fs.writeFileSync(path.join(src, '记录.md'), '# 记录\n\n' + Array.from({ length: 16 }, (_, i) => i + ' 校准，第二处 **校准**。').join('\n\n'))
  const other = path.join(root, '未打开的资料库')
  fs.mkdirSync(other, { recursive: true })
  fs.writeFileSync(path.join(other, '想不起的文件名.md'), '# 资料\n\n这就是另一份**精确坐标**资料。\n')
  async function wait(check, label) {
    for (let i = 0; i < 120; i++) { if (await ev('return Boolean(' + check + ')')) return; await sleep(65) }
    throw Error('查找验收未达到 ' + label)
  }
  const set = (selector, value) => ev('const el=document.querySelector(' + JSON.stringify(selector) + ');el.value=' + JSON.stringify(value) + ';el.dispatchEvent(new Event("input",{bubbles:true}))')
  await send('Page.navigate', { url: new URL('doc/查找样本/记录?lib=查找样本', appUrl).href })
  await wait("document.querySelector('.ProseMirror strong')?.textContent==='校准'", '编辑器挂载')
  await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true,cancelable:true}))")
  await wait("!!document.querySelector('.doc-search-panel input')", '打开查找')
  await set('.doc-search-panel input', '校准')
  await wait("document.querySelector('.doc-search-panel [role=status]')?.textContent==='32 处'", '总数')
  const pick = n => ev("document.querySelector('.doc-search-panel button[aria-label=" + n + "]').click()")
  await pick('下一处'); await pick('下一处')
  await wait("document.querySelector('.doc-search-panel [role=status]').textContent==='2 / 32' && [...(CSS.highlights.get('typocket-find')||[])][0]?.startContainer.parentElement.closest('strong')", '第二处命中的精确范围')
  for (let i = 0; i < 20; i++) await pick('下一处')
  await wait("document.querySelector('.doc-search-panel [role=status]').textContent==='22 / 32'", '第22处')
  await pick('上一处')
  await wait("document.querySelector('.doc-search-panel [role=status]').textContent==='21 / 32'", '上一处')
  await ev("document.querySelector('.doc-search-panel [aria-label=关闭查找]').click()")
  await ev("window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true,cancelable:true}))")
  await wait("!!document.querySelector('.search-scopes button')",'侧栏范围')
  await ev("document.querySelector('.search-scopes button:last-child').click()")
  await set('[aria-label=搜索全部知识库正文]', '精确坐标')
  await wait("document.querySelector('.library-hit strong')?.textContent==='想不起的文件名'", '未进入过的库')
  await ev("document.querySelector('.library-hit').click()")
  await wait("document.querySelector('.ProseMirror h1')?.textContent==='资料' && [...(CSS.highlights.get('typocket-find')||[])][0]?.toString()==='精确坐标'",'打开文档并定位')
  assert.equal(fs.readFileSync(path.join(other, '想不起的文件名.md'),'utf8'), '# 资料\n\n这就是另一份**精确坐标**资料。\n')
}
