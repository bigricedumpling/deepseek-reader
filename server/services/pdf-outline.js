/** Shared PDF outline extraction; runs on the client without a separate service dependency. */
const SECTION_WORD = /^(abstract|introduction|related work|background|method|methods|methodology|approach|experiment|experiments|evaluation|results|analysis|discussion|limitations|conclusion|conclusions|references|appendix|acknowledg)/i
function pdfLines(items) {
  const rows = []
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue
    const y = it.transform[5]
    let row = rows.find((r) => Math.abs(r.y - y) <= 3)
    if (!row) {
      row = { y, parts: [], size: 0 }
      rows.push(row)
    }
    row.parts.push(it.str)
    if ((it.height || 0) > row.size) row.size = it.height || 0
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => ({ text: r.parts.join('').replace(/\s+/g, ' ').trim(), size: r.size }))
}

/**
 * 有些 pdf 根本没有书签（腾讯混元那篇 ArtifactsBench 就是），
 * 那就退一步：从正文里认章节标题。
 *
 * 判据三条一起用，尽量只在真标题上命中：
 *   1. 字号明显大于这一页的正文（大 12% 以上）
 *   2. 一行很短（不超过 90 字）
 *   3. 长得像标题：`1 Introduction` / `2.1 Method` 这种编号开头，或者 Abstract 这类固定词
 * 层级按编号的点数算（1 → 一级，1.1 → 二级），固定词算一级。
 */
async function pdfTocFromText(doc) {
  const toc = []
  const pages = Math.min(doc.numPages, 80)
  for (let p = 1; p <= pages; p++) {
    let lines
    try {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent()
      lines = pdfLines(tc.items)
    } catch {
      continue
    }
    if (!lines.length) continue
    // 这一页的正文字号：按字符数加权取众数
    const weight = new Map()
    for (const l of lines) weight.set(l.size, (weight.get(l.size) || 0) + l.text.length)
    let body = 0
    let best = -1
    for (const [size, n] of weight) if (n > best) { best = n; body = size }
    for (const l of lines) {
      if (!l.text || l.text.length > 90) continue
      // 纯页码、arXiv 页眉这些不是标题
      if (/^\d+$/.test(l.text) || /^arXiv:/i.test(l.text)) continue
      const numbered = /^(\d+(?:\.\d+)*)\s*\S/.test(l.text)
      const big = l.size >= body * 1.12
      // 字号跟正文一样大的小节标题（`4.1 Evaluation Setup`、`3.1Fine-Grained Checklists`）也认：
      // 带小节编号、短、编号后面是大写字母或汉字、结尾不带句读。
      // 这样就排掉了纯数字的表格行（4.1 3.2 1.0）和正文里的 `3.5x faster than ...`。
      const smallSub = /^\d+\.\d+(?:\.\d+)*\s*[A-Z\u4e00-\u9fa5][^.|,;:]{0,58}$/.test(l.text)
      if (!smallSub && !(big && (numbered || SECTION_WORD.test(l.text)))) continue
      const m = l.text.match(/^(\d+(?:\.\d+)*)\s*(.*)$/)
      const title = m ? (m[1] + ' ' + m[2]).trim() : l.text
      const level = m ? Math.min(m[1].split('.').length, 3) : 1
      toc.push({ level, title, page: p })
    }
  }
  return toc
}


export async function readPdfOutline(doc) {
  const outline = await doc.getOutline()
  const toc = []
  const walk = async (items, level) => {
    for (const it of items || []) {
      let page = 0
      try {
        let dest = it.dest
        if (typeof dest === 'string') dest = await doc.getDestination(dest)
        if (Array.isArray(dest)) { if (typeof dest[0] === 'number') page = dest[0] + 1; else if (dest[0]) page = (await doc.getPageIndex(dest[0])) + 1 }
      } catch {
        /* 有的书签指不到具体页，那就不给页码，点了不跳 */
      }
      toc.push({ level: Math.min(level, 3), title: String(it.title || '').trim(), page })
      if (it.items && it.items.length) await walk(it.items, level + 1)
    }
  }
  await walk(outline, 1)
  // 没有书签的 pdf（不少论文都这样）就从正文里认标题
  const source = toc.length ? 'outline' : 'text'
  const finalToc = toc.length ? toc : await pdfTocFromText(doc)
  return {toc:finalToc,source}

}
