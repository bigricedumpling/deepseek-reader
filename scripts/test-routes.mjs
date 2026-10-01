import assert from 'node:assert/strict'
import { resolveEntry } from '../src/utils/routes.js'
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
