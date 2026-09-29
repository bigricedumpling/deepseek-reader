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

  async function exportHtml() {
    const original=document.getElementById('main-scroll-container')
    if(!original)throw Error('正文尚未加载')
    const clone=original.cloneNode(true)
    const canvases=[...original.querySelectorAll('canvas')]
    for(const [i,c] of [...clone.querySelectorAll('canvas')].entries()){
      const image=document.createElement('img');image.src=canvases[i].toDataURL('image/png');image.style.cssText='width:100%;height:100%;object-fit:cover';c.replaceWith(image)
    }
    for(const icon of clone.querySelectorAll('button.page-icon')){const span=document.createElement('span');span.className='page-icon';span.innerHTML=icon.innerHTML;icon.replaceWith(span)}
    for(const el of clone.querySelectorAll('button,script,iframe,style,input,textarea,.page-header-controls,.milkdown-block-handle,.milkdown-toolbar,.lossy-banner'))el.remove()
    for(const el of clone.querySelectorAll('*'))for(const attr of [...el.attributes])if(attr.name.startsWith('on')||['contenteditable','draggable','data-reader-block'].includes(attr.name))el.removeAttribute(attr.name)
    for(const img of clone.querySelectorAll('img')){
      if(!img.src||img.src.startsWith('data:'))continue
      const u=new URL(img.src,location.href)
      if(u.origin!==location.origin)continue
      const response=await fetch(u);if(!response.ok)throw Error('图片读取失败，导出已停止以避免缺图')
      img.src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;response.blob().then(blob=>reader.readAsDataURL(blob),reject)})
    }
    const title=String(getDoc()?.name||'文档').replace(/[<>&"]/g,'')
    const css=`body{max-width:1000px;margin:40px auto;padding:0 24px;font:16px/1.8 system-ui,sans-serif;color:#252525}h1,h2,h3{line-height:1.4}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px}pre{white-space:pre-wrap;background:#f5f5f5;padding:16px;font-size:13px}blockquote{border-left:3px solid #ddd;padding-left:20px;color:#666}.page-cover{height:240px;overflow:hidden}.page-cover img{width:100%;height:100%;object-fit:cover}.page-icon{font-size:40px}.page-description,figcaption{color:#777}.reader-rich-callout{display:flex;gap:12px;background:#f5f5f5;border-radius:8px;padding:18px}.reader-rich-callout p:last-child{margin-bottom:0}.reader-columns{display:grid;grid-template-columns:repeat(var(--column-count,2),minmax(0,1fr));gap:24px}.reader-column{min-width:0}.reader-rich-columns{display:grid;grid-template-columns:1fr 1fr;gap:28px}.reader-rich-card{border:1px solid #ddd;border-radius:10px;padding:16px}.reader-rich-figure figure{display:inline-block;margin:0}@media(max-width:600px){.reader-rich-columns,.reader-columns{display:block}}`
    download(title+'.html',new Blob(['<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><style>'+css+'</style><body>'+clone.innerHTML+'</body></html>'],{type:'text/html;charset=utf-8'}))
  }
  return { exportMarkdown, exportPdf, exportHtml }
}
