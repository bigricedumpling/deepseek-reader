import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Fragment, Slice } from '@milkdown/kit/prose/model'
import { dropPoint } from '@milkdown/kit/prose/transform'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { videoMime } from './video-format.js'

const mediaKey = new PluginKey('reader-media-paste')

export function showVideoPicker(view, picker) {
  view.dispatch(view.state.tr.setMeta(mediaKey, { picker }))
}

export function mediaPaste({ uploadImage, uploadVideo, onError, onEdit }) {
  return $prose(() => {
    const key = mediaKey
    let alive = true
    function insert(view, event, files, target) {
      event.preventDefault()
      const id = crypto.randomUUID()
      const video = files.some(videoMime)
      view.dispatch(view.state.tr.setMeta(key, {
        add: { id, ...target, label: video ? '正在保存视频…' : '正在保存图片…' },
      }))
      void (async () => {
        try {
          const media = []
          for (const file of files) {
            const isVideo = !file.type.startsWith('image/')
            const src = await (isVideo ? uploadVideo(file) : uploadImage(file))
            media.push({ src, type: isVideo ? 'reader_video' : 'image-block' })
          }
          if (!alive || !view.editable) return
          const pending = key.getState(view.state).uploads.get(id)
          if (!pending) return
          const nodes = media.map(({ src, type }) => view.state.schema.nodes[type].create({ src }))
          const slice = new Slice(Fragment.fromArray(nodes), 0, 0)
          const tr = view.state.tr
          if (pending.bookmark) {
            tr.setSelection(pending.bookmark.resolve(tr.doc)).replaceSelection(slice)
          } else {
            const position = dropPoint(tr.doc, pending.position, slice)
            if (position == null) throw new Error('无法在此位置插入视频')
            tr.replace(position, position, slice)
          }
          onEdit()
          view.dispatch(tr.setMeta(key, { remove: id }).scrollIntoView())
        } catch (error) {
          if (alive) onError(error.message)
        } finally {
          if (alive && key.getState(view.state).uploads.has(id)) view.dispatch(view.state.tr.setMeta(key, { remove: id }))
        }
      })()
      return true
    }
    return new Plugin({
      key,
      state: {
        init: () => ({ uploads: new Map(), picker: null }),
        apply(tr, old) {
          const next = new Map([...old.uploads].map(([id, item]) => [id, item.bookmark
            ? { ...item, bookmark: item.bookmark.map(tr.mapping) }
            : { ...item, position: tr.mapping.map(item.position, 1) }]))
          const action = tr.getMeta(key)
          if (action?.add) next.set(action.add.id, action.add)
          if (action?.remove) next.delete(action.remove)
          const picker = action && 'picker' in action ? action.picker :
            old.picker && { ...old.picker, pos: tr.mapping.map(old.picker.pos), to: tr.mapping.map(old.picker.to) }
          return { uploads: next, picker }
        },
      },
      props: {
        decorations(state) {
          const widgets = []
          const { uploads, picker } = key.getState(state)
          if (picker) {
            widgets.push(Decoration.widget(picker.pos, picker.element, { side: -1, stopEvent: () => true }))
            if (picker.hideLine && picker.to > picker.pos) {
              widgets.push(Decoration.node(picker.pos, picker.to, { class: 'reader-video-slash-line' }))
            }
          }
          for (const [id, item] of uploads) {
            const position = item.bookmark ? item.bookmark.resolve(state.doc).from : item.position
            widgets.push(Decoration.widget(position, () => {
              const el = document.createElement('span')
              el.className = 'reader-upload-status'
              el.textContent = item.label
              return el
            }, { key: id }))
          }
          return DecorationSet.create(state.doc, widgets)
        },
        handleDOMEvents: {
          paste(view, event) {
            const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/') || videoMime(file))
            return view.editable && files.length ? insert(view, event, files, { bookmark: view.state.selection.getBookmark() }) : false
          },
          dragover(view, event) {
            if (!view.editable || !event.dataTransfer?.types.includes('Files') || !event.target.closest?.('.reader-video-block')) return false
            event.preventDefault()
            return true
          },
          drop(view, event) {
            const files = [...(event.dataTransfer?.files || [])].filter(file => !file.type.startsWith('image/') && videoMime(file))
            if (!view.editable || !files.length) return false
            const point = view.posAtCoords({ left: event.clientX, top: event.clientY })
            return insert(view, event, files, { position: point?.pos ?? view.state.selection.to })
          },
        },
      },
      view: () => ({ destroy() { alive = false } }),
    })
  })
}
