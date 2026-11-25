import assert from 'node:assert/strict'
import { mergeDocument } from '../src/utils/merge-document.js'

function verify(label, base, local, remote, expected) {
  assert.equal(mergeDocument(base, local, remote), expected, label)
  assert.equal(mergeDocument(base, remote, local), expected, label + ' (reversed)')
}

verify('adjacent lines', 'a\nb\n', 'A\nb\n', 'a\nB\n', 'A\nB\n')
verify('several separate changes', 'a\nb\nc\nd\ne\n', 'A\nb\nc\nd\nE\n', 'a\nb\nC\nd\ne\n', 'A\nb\nC\nd\nE\n')
verify('shared edit and independent edit', 'a\nb\nc\n', 'A\nb\nC\n', 'A\nb\nc\n', 'A\nb\nC\n')
verify('different insertions at the same place', 'a\n', 'a\nb\n', 'a\nc\n', null)
verify('identical insertions', 'a\n', 'a\nb\n', 'a\nb\n', 'a\nb\n')
verify('delete vs edit', 'a\nb\nc\n', 'a\nc\n', 'a\nB\nc\n', null)
verify('removing the last newline vs an appended line', 'a\n', 'a', 'a\nb\n', null)
verify('two new line endings must not fuse', 'a\n', 'a\r', 'a\n\nb\n', null)
verify('empty result', 'content', '', 'content', '')
verify('competing creation', '', 'one', 'two', null)
verify('changes at opposite ends', 'a\nb\nc', 'b\nc', 'a\nb\nC', 'b\nC')
verify('preserve exact mixed line endings', '\uFEFF甲\r\n乙\n尾', '\uFEFF甲\r\n乙\n尾👋', '\uFEFF壹\r\n乙\n尾', '\uFEFF壹\r\n乙\n尾👋')
verify('ambiguous repeated line deletion', 'a\nx\nx\nz\n', 'a\nx\nz\n', 'a\nX\nx\nz\n', null)
verify('neighbor replacements around duplicate deletions', 'a\nx\nx\nz\n', 'A\nx\nz\n', 'a\nx\nZ\n', null)
verify('neighbor replacements around duplicate insertions', 'a\nx\nz\n', 'A\nx\nx\nz\n', 'a\nx\nx\nZ\n', null)
verify('truncate against append', 'a\n', '', 'a\nx\n', null)
verify('reorder vs edit', 'a\nb\nc\nd\ne\n', 'a\nd\nc\nb\ne\n', 'a\nb\nC\nd\ne\n', null)
verify('insert next to an edit', 'a\nb\nc\n', 'a\nx\nb\nc\n', 'a\nB\nc\n', 'a\nx\nB\nc\n')
verify('competing replacements of one line', 'first\nsecond\n', '1\nsecond\n', 'one\nsecond\n', null)
verify('missing common base', undefined, 'local', 'disk', null)

const rows = Array.from({ length: 20000 }, (_, i) => '行 ' + i + '\n')
const left = rows.map((s, i) => i % 37 === 0 ? 'L' + s : s)
const right = rows.map((s, i) => i % 37 === 19 ? 'R' + s : s)
verify('large document with interleaved edits', rows.join(''), left.join(''), right.join(''),
  rows.map((s, i) => i % 37 === 19 ? right[i] : left[i]).join(''))
console.log('Three-way Markdown merge passed')
