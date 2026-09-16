/**
 * 导出当前文档。
 *
 * 原先挂在 App.vue 上、靠 DocView 往上传一个 export 事件。
 * 但它要的东西（当前文档的正文、标题）DocView 本来就有，
 * 绕一圈上传只是让 App 多背一个和布局无关的职责，所以搬过来了。
 */

/** 触发一次浏览器下载 */
function download(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function useExport(getDoc, getRaw) {
  /** 导出 markdown 源文件 */
  function exportMarkdown() {
    const doc = getDoc()
    if (!doc) return
    download(
      doc.name + '.md',
      new Blob([getRaw()], { type: 'text/markdown;charset=utf-8' })
    )
  }

  /**
   * 导出 PDF：交给浏览器打印。
   * 版面靠 style.css 里的 @media print 控制，这里只负责唤起打印面板。
   */
  function exportPdf() {
    window.print()
  }

  return { exportMarkdown, exportPdf }
}
