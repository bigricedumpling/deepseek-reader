import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { resolveEntry, documentRoutePath, findRoutedDocument } from '../src/utils/routes.js'
import { loadRouteAliases, redirectForAlias } from '../server/route-aliases.js'

for (const base of ['', '/plugins/reader']) {
  assert.equal(resolveEntry(base + '/', '', base), base + '/')
  assert.equal(resolveEntry(base + '/doc/', '', base), base + '/doc/')
  assert.equal(resolveEntry(base + '/doc/', '?choose=1', base), base + '/doc/?choose=1')
  assert.equal(resolveEntry(base + '/onlyread/', '', base), base + '/onlyread/')
  const own = new URL(resolveEntry(base + '/edit/First/Notes', '?lib=Second&token=obsolete', base), 'http://localhost')
  assert.equal(own.pathname, base + '/doc/First/Notes')
  assert.equal(own.searchParams.get('lib'), 'First')
  assert.equal(own.searchParams.has('token'), false)
  assert.doesNotThrow(() => resolveEntry(base + '/doc/%broken', '', base))
}

const files = ['Draft/Review.html.md', 'Draft/Review.html', 'Draft/Review.pdf', 'Draft/Review.md'].map(file => ({ file }))
for (const node of files) assert.equal(findRoutedDocument(files, documentRoutePath(node.file)), node)
assert.equal(findRoutedDocument(files, 'Draft/Review').file, 'Draft/Review.md')
assert.equal(findRoutedDocument(files.slice(1, 2), 'Draft/Review').file, 'Draft/Review.html')

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'typocket-routes-'))
try {
  const firstData = path.join(temporary, 'one')
  const secondData = path.join(temporary, 'two')
  const id = createHash('sha256').update(firstData).digest('hex').slice(0, 24)
  const fixture = {
    libraries: { First: 'Library' },
    prefixes: { First: 'Library/First', Sample: 'Library' },
    documents: { 'Library/First/Heading': 'Library/Archive/Heading' }
  }
  fs.writeFileSync(path.join(temporary, id + '.json'), JSON.stringify(fixture))
  const first = loadRouteAliases(firstData, temporary)
  const second = loadRouteAliases(secondData, temporary)
  for (const [before, expected] of [
    ['/doc/First/Heading.md?view=1', '/doc/Library/Archive/Heading.md?view=1&lib=Library'],
    ['/onlyread/Sample/Overview', '/onlyread/Library/Overview?lib=Library'],
    ['/edit/First%2FNotes', '/edit/Library/First/Notes?lib=Library'],
    ['/doc/?lib=First', '/doc/?lib=Library'],
    ['/?lib=First', '/?lib=Library']
  ]) {
    const url = new URL(before, 'http://localhost')
    const location = redirectForAlias(url, first)
    assert.ok(location)
    for (const base of ['', '/prefix']) {
      const next = new URL(location, new URL(base + before, url.origin))
      assert.equal(next.pathname + next.search, base + expected)
    }
    assert.equal(redirectForAlias(url, second), '', 'a different instance keeps its original URL')
    assert.equal(redirectForAlias(new URL(expected, url.origin), first), '', 'canonical URL does not redirect')
  }
  assert.equal(redirectForAlias(new URL('http://localhost/api/tree?lib=First'), first), '')
  assert.equal(redirectForAlias(new URL('http://localhost/doc/%broken'), first), '')
  assert.equal(redirectForAlias(new URL('http://localhost/doc/constructor/Notes'), first), '')
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
console.log('PASS: generic routes, per-instance bookmark aliases, nested prefixes, extensions and malformed paths')
