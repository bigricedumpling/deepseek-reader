import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export async function verifyConcurrentEdits({ send, ev, root, appUrl, sleep }) {
  const library = '并发保存回归'
  const localLine = '正文起点'
  const otherLine = '附件清单'
  const base = name => '# ' + name + '\n\n' + localLine + '\n\n' + otherLine + '\n\n保留 **强调** 和 `行内代码`。\n'
  const view = 'window.__fold?.view()'
  const modal = '.conflict-dialog[role="dialog"]'
  const cases = ['独立段落', '手动合并', '重叠修订', '使用磁盘', '打开改稿']
  fs.mkdirSync(path.join(root, library))
  for (const name of cases) fs.writeFileSync(path.join(root, library, name + '.md'), base(name))

  async function until(label, test) {
    for (let i = 0; i < 100; i++) {
      if (await test()) return
      await sleep(100)
    }
    throw new Error('等待超时：' + label)
  }
  async function open(name, text) {
    const file = library + '/' + name + '.md'
    await send('Page.navigate', { url: new URL('doc/' + library + '/' + name + '?lib=' + library, appUrl).href })
    await until(name + ' 已打开', () => ev(`return window.__reader?.currentPath === ${JSON.stringify(file)}
      && ${view}?.dom?.checkVisibility() && ${view}.dom.textContent.includes(${JSON.stringify(text)})`))
    await ev(`
      const dialogs = window.__conflictDialogs = new Set()
      const watch = new MutationObserver(() => {
        for (const node of document.querySelectorAll(${JSON.stringify(modal)})) dialogs.add(node)
      })
      watch.observe(document.body, {childList:true,subtree:true})
      for (const node of document.querySelectorAll(${JSON.stringify(modal)})) dialogs.add(node)
    `)
    return file
  }
  async function appendText(line, suffix) {
    await ev(`
      const editor = ${view}
      const paragraph = [...editor.dom.querySelectorAll('p')].find(p => p.textContent === ${JSON.stringify(line)})
      if (!paragraph) throw Error('没有找到指定的测试段落')
      editor.focus()
      getSelection().collapse(paragraph.firstChild, paragraph.firstChild.length)
      document.dispatchEvent(new Event('selectionchange'))
    `)
    await until('光标定位到段尾', () => ev(`const pos = ${view}.state.selection.$from
      return pos.parent.textContent === ${JSON.stringify(line)} && pos.parentOffset === ${line.length}`))
    await send('Input.insertText', { text: suffix })
  }
  async function agentWrite(file, content) {
    const endpoint = new URL('api/doc', appUrl)
    endpoint.searchParams.set('path', file)
    const headers = { 'Content-Type': 'application/json', 'X-Typocket-Client': 'local-agent' }
    const before = await (await fetch(endpoint, { headers })).json()
    assert(before.ok, JSON.stringify(before))
    const response = await fetch(new URL('api/doc', appUrl), {
      method: 'PUT', headers, body: JSON.stringify({ path:file, content, revision:before.data.revision })
    })
    const result = await response.json()
    assert(result.ok, JSON.stringify(result))
  }
  async function race(name, remote) {
    const file = await open(name, localLine)
    // Hold the first real autosave until the Agent commits. This fixes the order
    // of the two writes without relying on the editor's debounce duration.
    await ev(`
      const original = window.fetch
      const gate = window.__saveGate = {}
      window.fetch = async function(input, options) {
        if (options?.method === 'PUT' && new URL(input, location.href).pathname === '/api/doc'
          && JSON.parse(options.body).path === ${JSON.stringify(file)}) {
          window.fetch = original
          await new Promise(resolve => { gate.release = resolve })
        }
        return original.call(window, input, options)
      }
    `)
    await appendText(localLine, '，我改过')
    await until('浏览器开始保存 ' + name, () => ev('return !!window.__saveGate.release'))
    try {
      await agentWrite(file, remote)
    } finally {
      await ev('window.__saveGate.release()')
    }
    return file
  }
  async function clickDialog(text) {
    await ev(`
      const dialog = document.querySelector(${JSON.stringify(modal)})
      const button = [...dialog.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})
      if (!button || button.disabled) throw Error('操作不可用：' + ${JSON.stringify(text)})
      button.click()
    `)
  }
  async function openConflict(local, remote) {
    await until('显示双方的实际内容', () => ev(`const fields = document.querySelectorAll('.conflict-columns textarea')
      return fields[0]?.value === ${JSON.stringify(local)} && fields[1]?.value === ${JSON.stringify(remote)}`))
  }
  async function manualDraft(content) {
    await clickDialog('手动合并')
    await ev(`const field = document.querySelector('.merged-text'); field.focus(); field.select()`)
    await send('Input.insertText', { text: content })
    assert.equal(await ev("return document.querySelector('.merged-text').value"), content)
  }
  async function settled(file, expected, count, visibleText) {
    await until(file + ' 的两份改动已处理', () => ev(`return !window.__reader.isDirty
      && !document.querySelector(${JSON.stringify(modal)}) && ${view}?.dom.textContent.includes(${JSON.stringify(visibleText)})`))
    assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), expected, '保存应逐字节保留两边的结果')
    assert.equal(await ev('return window.__conflictDialogs.size'), count, '多弹出了一次冲突确认')
  }
  const local = name => base(name).replace(localLine, localLine + '，我改过')
  const remote = name => base(name).replace(localLine, localLine + '，Agent 改过')
  const integrated = name => base(name).replace(localLine, '双方确认的正文')

  const first = cases[0]
  const preceding = 'Agent 新插入了一段。\n\n'
  const external = base(first).replace(localLine, preceding + localLine).replace(otherLine, '附件增加一项')
  const file = await race(first, external)
  const combined = local(first).replace(localLine, preceding + localLine).replace(otherLine, '附件增加一项')
  await settled(file, combined, 0, '附件增加一项')
  await until('外部在光标前插入段落后，仍聚焦本地改过的段尾', () => ev(`const editor = ${view}
    const pos = editor.state.selection.$head
    return editor.hasFocus() && pos.parent.textContent === ${JSON.stringify(localLine + '，我改过')} &&
      pos.parentOffset === pos.parent.content.size`))
  await send('Input.insertText', { text: '，接着写' })
  await until('合并后无须重新点击即可在原处输入', () => fs.readFileSync(path.join(root, file), 'utf8') === combined.replace('，我改过', '，我改过，接着写'))
  assert.equal(await ev('return window.__conflictDialogs.size'), 0)

  const second = cases[1]
  const manual = await race(second, remote(second))
  await openConflict(local(second), remote(second))
  await manualDraft(integrated(second))
  await agentWrite(manual, remote(second).replace(otherLine, '新附件'))
  await clickDialog('保存合并结果')
  const resolved = integrated(second).replace(otherLine, '新附件')
  await settled(manual, resolved, 1, '新附件')

  const third = cases[2]
  const overlap = await race(third, remote(third))
  await openConflict(local(third), remote(third))
  await manualDraft(integrated(third))
  const changedAgain = base(third).replace(localLine, 'Agent 再次修改同一段')
  await agentWrite(overlap, changedAgain)
  await clickDialog('保存合并结果')
  await until('同段再次变化时保留草稿并显示最新磁盘版本', () => ev(`
    return document.querySelector('.merged-text')?.value === ${JSON.stringify(integrated(third))}
      && document.querySelectorAll('.conflict-columns textarea')[1]?.value === ${JSON.stringify(changedAgain)}
      && !document.querySelector('.merged-text').disabled
  `))
  assert.equal(fs.readFileSync(path.join(root, overlap), 'utf8'), changedAgain, '旧版本确认不能覆盖新修改')
  await clickDialog('保存合并结果')
  await settled(overlap, integrated(third), 1, '双方确认的正文')

  const fourth = cases[3]
  const discarded = await race(fourth, remote(fourth))
  await openConflict(local(fourth), remote(fourth))
  await clickDialog('使用磁盘版本')
  const latest = remote(fourth).replace(otherLine, '磁盘上的最新附件')
  await agentWrite(discarded, latest)
  await clickDialog('放弃我的修改，使用磁盘版本')
  await settled(discarded, latest, 1, '磁盘上的最新附件')
  await open(second, '新附件')
  await settled(manual, resolved, 0, '双方确认的正文')
  const fileFromActivity = await open(cases[4], localLine)
  const revised = base(cases[4]).replace(otherLine, 'Agent 更新附件')
  async function enterActivity(text) {
    await ev("document.querySelector('button[aria-label=更多工具]').click()")
    await ev("Array.from(document.querySelectorAll('.workspace-tools-menu button')).find(b => b.textContent.includes('Agent')).click()")
    await until('Agent 记录显示新正文', () => ev('return document.querySelector(".activity-detail")?.textContent.includes(' + JSON.stringify(text) + ')'))
    await ev("Array.from(document.querySelectorAll('.activity-detail button')).find(b => b.textContent === '打开文档').click()")
  }
  await agentWrite(fileFromActivity, revised)
  await enterActivity('Agent 更新附件')
  await settled(fileFromActivity, revised, 0, 'Agent 更新附件')

  const secondRevision = revised.replace('Agent 更新附件', 'Agent 再次更新附件')
  await agentWrite(fileFromActivity, secondRevision)
  // Type while the activity's document read is in flight. A stale response must
  // preserve those keystrokes and use the normal revision-aware save path.
  await ev(`
    const original = window.fetch
    window.fetch = async function(input, options) {
      const target = new URL(input, location.href)
      if (target.pathname === '/api/doc' && target.searchParams.get('path') === ${JSON.stringify(fileFromActivity)}
          && (!options?.method || options.method === 'GET')) {
        window.fetch = original
        const response = await original.call(window, input, options)
        await new Promise(resolve => { window.__releaseActivityRead = resolve })
        return response
      }
      return original.call(window, input, options)
    }
  `)
  await enterActivity('Agent 再次更新附件')
  await until('等待取回最新正文', () => ev('return !!window.__releaseActivityRead'))
  try { await appendText(localLine, '，我仍在写') }
  finally { await ev('window.__releaseActivityRead()') }
  await settled(fileFromActivity, secondRevision.replace(localLine, localLine + '，我仍在写'), 0, 'Agent 再次更新附件')

}
