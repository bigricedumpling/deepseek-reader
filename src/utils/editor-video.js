import { $nodeSchema, $view } from '@milkdown/kit/utils'
import { parseFragment } from 'parse5'
import { playableVideoUrl, videoMarkdown, videoScale } from './video-format.js'

// Match only the editor's own markup. Other HTML video markup stays source-backed.
export function managedVideoBlock(value) {
  if (!/^<video\s[^>]*\bdata-typocket-video\b/i.test(value)) return null
  const [video, extra] = parseFragment(value.trim()).childNodes
  if (extra || video?.tagName !== 'video' || video.childNodes.length) return null
  const attrs = Object.fromEntries(video.attrs.map(attr => [attr.name, attr.value]))
  if (!Object.hasOwn(attrs, 'data-typocket-video') || !playableVideoUrl(attrs.src)) return null
  const keys = ['data-typocket-video', 'controls', 'playsinline', 'preload', 'src', 'title', 'style']
  if (Object.keys(attrs).some(key => !keys.includes(key))) return null
  const width = /^width:\s*([\d.]+)%\s*;?$/.exec(attrs.style || '')
  if (attrs.style && !width) return null
  return { src: attrs.src, caption: attrs.title || '', scale: videoScale(width?.[1]) }
}

export const videoBlockSchema = $nodeSchema('reader_video', () => ({
  group: 'block',
  atom: true,
  draggable: true,
  attrs: { src: { default: '' }, caption: { default: '' }, scale: { default: 100 } },
  parseDOM: [{
    tag: 'video[data-typocket-video]',
    getAttrs: element => managedVideoBlock(element.outerHTML) || false,
  }],
  toDOM(node) {
    const template = document.createElement('template')
    template.innerHTML = videoMarkdown(node.attrs)
    const video = template.content.firstChild
    const src = playableVideoUrl(node.attrs.src)
    if (src) video.setAttribute('src', src)
    else video.removeAttribute('src')
    return video
  },
  parseMarkdown: {
    match: node => node.type === 'typocketVideo',
    runner: (state, node, type) => state.addNode(type, node.attrs),
  },
  toMarkdown: {
    match: node => node.type.name === 'reader_video',
    runner: (state, node) => state.addNode('html', undefined, videoMarkdown(node.attrs)),
  },
}))

export function videoBlockView({ docFile, onEdit, readonly }) {
  return $view(videoBlockSchema.node, () => (node, view, getPos) => {
    const dom = document.createElement('div')
    dom.className = 'reader-video-block milkdown-image-block'
    dom.contentEditable = 'false'
    const wrapper = document.createElement('div')
    wrapper.className = 'image-wrapper'
    const video = document.createElement('video')
    video.controls = true
    video.playsInline = true
    video.preload = 'metadata'
    const playbackError = document.createElement('span')
    playbackError.className = 'reader-video-caption'
    playbackError.textContent = '无法播放此视频'
    playbackError.hidden = true
    playbackError.setAttribute('role', 'status')
    video.addEventListener('error', () => { playbackError.hidden = false })
    wrapper.append(video)
    const caption = document.createElement('input')
    caption.className = 'caption-input'
    caption.placeholder = '添加图注'
    caption.setAttribute('aria-label', '视频图注')
    const readCaption = document.createElement('div')
    readCaption.className = 'caption-input'
    const handle = document.createElement('div')
    handle.className = 'image-resize-handle'
    if (!readonly) wrapper.append(handle)
    dom.append(wrapper, playbackError, readonly ? readCaption : caption)

    function setAttribute(name, value) {
      const pos = getPos()
      if (!view.editable || pos == null || node.attrs[name] === value) return
      onEdit()
      view.dispatch(view.state.tr.setNodeAttribute(pos, name, value))
    }
    const paintWidth = scale => wrapper.style.setProperty('--reader-image-ratio', String(videoScale(scale) / 100))
    const paintNativeWidth = () => {
      wrapper.style.setProperty('--reader-image-width', video.videoWidth ? video.videoWidth + 'px' : '100%')
    }
    function refresh(previous) {
      if (previous?.attrs.src !== node.attrs.src) {
        playbackError.hidden = true
        const src = playableVideoUrl(node.attrs.src, docFile)
        if (src) video.setAttribute('src', src)
        else video.removeAttribute('src')
        paintNativeWidth()
      }
      paintWidth(node.attrs.scale)
      if (caption !== document.activeElement) caption.value = node.attrs.caption
      caption.hidden = !node.attrs.caption && caption !== document.activeElement
      readCaption.textContent = node.attrs.caption
      readCaption.hidden = !node.attrs.caption
    }
    caption.addEventListener('change', () => setAttribute('caption', caption.value))
    caption.addEventListener('blur', () => { caption.hidden = !node.attrs.caption })
    caption.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      caption.blur()
      view.focus()
    })
    video.addEventListener('loadedmetadata', paintNativeWidth)
    let cancelResize
    handle.addEventListener('pointerdown', event => {
      if (!view.editable || event.button !== 0 || !event.isPrimary || !video.videoWidth || !video.clientWidth) return
      event.preventDefault()
      cancelResize?.()
      const height = video.getBoundingClientRect().height
      const scale = videoScale(node.attrs.scale)
      const nextScale = y => Math.max(5, Math.min(100, Math.round(scale * (height + y - event.clientY) / height)))
      const move = e => { if (e.pointerId === event.pointerId) paintWidth(nextScale(e.clientY)) }
      const finish = e => {
        if (e.pointerId !== event.pointerId) return
        cancelResize()
        if (e.type === 'pointerup' && e.clientY !== event.clientY) setAttribute('scale', nextScale(e.clientY))
      }
      const endEvents = ['pointerup', 'pointercancel', 'lostpointercapture']
      cancelResize = () => {
        handle.removeEventListener('pointermove', move)
        for (const type of endEvents) handle.removeEventListener(type, finish)
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
        cancelResize = null
        paintWidth(node.attrs.scale)
      }
      handle.setPointerCapture(event.pointerId)
      handle.addEventListener('pointermove', move)
      for (const type of endEvents) handle.addEventListener(type, finish)
    })
    refresh()
    return {
      dom,
      stopEvent(event) {
        if (event.dataTransfer?.types.includes('Files') && /^(dragenter|dragover|drop)$/.test(event.type)) return false
        return event.target === video || event.target === caption || event.target === handle
      },
      ignoreMutation: () => true,
      selectNode: () => dom.classList.add('ProseMirror-selectednode'),
      deselectNode: () => dom.classList.remove('ProseMirror-selectednode'),
      update(next) {
        if (next.type !== node.type) return false
        const previous = node
        node = next
        refresh(previous)
        return true
      },
      destroy() {
        cancelResize?.()
        video.pause()
        video.removeAttribute('src')
        video.load()
      },
    }
  })
}
