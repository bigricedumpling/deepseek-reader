export function markdownBody(source, truncated = false) {
  source = source.replace(/^\uFEFF/, '')
  const first = /^(---|\+\+\+)[ \t]*\r?\n/.exec(source)
  if (!first) return source
  const ending = first[1] === '---' ? /^(?:---|\.\.\.)[ \t]*\r?$/m : /^\+\+\+[ \t]*\r?$/m
  const rest = source.slice(first[0].length)
  const end = ending.exec(rest)
  return end ? rest.slice(end.index + end[0].length) : truncated ? '' : source
}
