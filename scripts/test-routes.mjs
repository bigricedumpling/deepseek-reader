import assert from 'node:assert/strict'
import { resolveEntry } from '../src/utils/routes.js'
import { legacyInterviewDoc, legacyRootSectionPath, normalizeLibraryName } from '../src/utils/legacy-paths.js'

// 旧链接兼容：抽屉名、旧库根、面试准备内部的归类都只能按原样继续工作
assert.equal(normalizeLibraryName('业务面'), '面试准备')
assert.equal(normalizeLibraryName(' 面试准备 '), '面试准备')
assert.equal(legacyInterviewDoc('业务面/会议总结'), '面试准备/业务面/会议总结')
assert.equal(legacyInterviewDoc('面试准备/总览/下一步计划'), '面试准备/过程稿/总览/下一步计划')
assert.equal(legacyInterviewDoc('面试准备/总览/下一步计划.md'), '面试准备/过程稿/总览/下一步计划.md')
assert.equal(legacyInterviewDoc('面试准备/岗位与策略/岗位JD与目标'), '面试准备/常用资料/岗位JD与目标')
assert.equal(legacyInterviewDoc('面试准备/README'), '面试准备/README')
assert.equal(legacyRootSectionPath('面试准备/README'), '面试准备/总览/README')
assert.equal(legacyRootSectionPath('面试准备/岗位JD与目标.md'), '面试准备/岗位与策略/岗位JD与目标.md')
assert.equal(legacyRootSectionPath('别的目录/README'), '')

for (const base of ['', '/deepseek/reader']) {
  assert.equal(resolveEntry(base + '/', '', base), base + '/')
  assert.equal(resolveEntry(base + '/doc/', '', base), base + '/doc/')
  assert.equal(resolveEntry(base + '/doc/', '?choose=1', base), base + '/doc/?choose=1')
  assert.equal(resolveEntry(base + '/onlyread/', '', base), base + '/onlyread/')
  for (const [input, title] of [
    ['/onlyread/笔试题/笔试题交付：题目一', '题目一'],
    ['/onlyread/笔试题/笔试题交付：题目二', '题目二']
  ]) {
    const out = new URL(resolveEntry(base + input, '', base), 'http://localhost')
    assert.equal(decodeURIComponent(out.pathname), base + '/onlyread/Agent（设计方向）/笔试题交付：' + title)
    assert.equal(out.searchParams.get('lib'), 'Agent（设计方向）')
  }
  assert.equal(new URL(resolveEntry(base + '/edit/业务面/会议总结', '?token=obsolete', base), 'http://localhost').searchParams.has('token'), false)
  assert.doesNotThrow(() => resolveEntry(base + '/doc/%broken', '', base))
  assert.equal(decodeURIComponent(new URL(resolveEntry(base + '/doc/面试准备/简历/简历', '?lib=wrong', base), 'http://localhost').searchParams.get('lib')), '面试准备')
}
console.log('首页、三个历史公开入口、部署前缀、旧编辑入口、路径与知识库一致性及损坏编码检查通过')
