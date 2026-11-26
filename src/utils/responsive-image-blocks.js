import { nextTick } from 'vue'
import { EditorStateReady, nodeViewCtx } from '@milkdown/kit/core'
import { imageBlockSchema } from '@milkdown/kit/component/image-block'
import { $viewAsync } from '@milkdown/kit/utils'
import { legacyImageRatio } from './preserved-markdown.js'

// Keep Crepe's image, caption and upload controls. Store only the authored scale
// on the node. CSS fits the image to the current column on every layout.
export function responsiveImageBlocks(onResize) {
  return $viewAsync(imageBlockSchema.node, async ctx => {
    await ctx.wait(EditorStateReady)
    const createImage = new Map(ctx.get(nodeViewCtx)).get(imageBlockSchema.node.id)
    return (node, view, getPos, ...args) => {
      const base = createImage(node, view, getPos, ...args)
      const block = base.dom
      let savedRatio = node.attrs.ratio
      let cancelDrag
      function paintRatio(ratio) {
        block.style.setProperty('--reader-image-ratio', Number.isFinite(ratio) && ratio > 0 ? ratio : 1)
      }
      function syncDescription(image = block.querySelector('.image-wrapper > img')) {
        if (!image) return
        const alt = node.attrs.alt || ''
        image.alt = alt.trim() && legacyImageRatio(alt) === null ? alt : (node.attrs.caption || '')
      }
      function syncImage(image) {
        if (!image?.matches('.image-wrapper > img')) return
        if (image.naturalWidth) block.style.setProperty('--reader-image-width', image.naturalWidth + 'px')
        syncDescription(image)
      }
      const onLoad = event => syncImage(event.target)
      function startResize(event) {
        const handle = event.target.closest?.('.image-resize-handle')
        if (!handle) return
        // The native handle also listens on pointerdown and accepts secondary pointers.
        event.stopPropagation()
        if (!view.editable || !event.isPrimary || event.button !== 0) return
        const image = block.querySelector('.image-wrapper img')
        if (!image?.naturalWidth || !image.naturalHeight || !block.clientWidth) return
        event.preventDefault()
        cancelDrag?.()
        const column = block.getBoundingClientRect().width
        const zoom = column / block.clientWidth
        const baseWidth = Math.min(column, image.naturalWidth * zoom)
        const baseHeight = baseWidth * image.naturalHeight / image.naturalWidth
        const startHeight = image.getBoundingClientRect().height
        const startY = event.clientY
        const id = event.pointerId
        const minRatio = Math.min(column, 32 * zoom) / baseWidth
        const maxRatio = column / baseWidth
        const ratioAt = y => Math.min(maxRatio, Math.max(minRatio, (startHeight + y - startY) / baseHeight))
        const move = e => {
          if (e.pointerId === id) paintRatio(ratioAt(e.clientY))
        }
        const finish = e => {
          if (e.pointerId !== id) return
          cancelDrag()
          if (e.type !== 'pointerup' || e.clientY === startY || !view.editable) return
          const ratio = Math.max(.01, Number(ratioAt(e.clientY).toFixed(2)))
          const pos = getPos()
          if (pos == null || savedRatio === ratio) return
          onResize()
          view.dispatch(view.state.tr.setNodeAttribute(pos, 'ratio', ratio))
        }
        cancelDrag = () => {
          handle.removeEventListener('pointermove', move)
          for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.removeEventListener(type, finish)
          if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id)
          cancelDrag = null
          paintRatio(savedRatio)
        }
        handle.setPointerCapture(id)
        handle.addEventListener('pointermove', move)
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(type, finish)
      }
      paintRatio(savedRatio)
      syncImage(block.querySelector('.image-wrapper > img'))
      block.addEventListener('load', onLoad, true)
      block.addEventListener('pointerdown', startResize, true)
      return {
        ...base,
        update(next, ...decorations) {
          if (!base.update(next, ...decorations)) return false
          if (next.attrs.ratio !== savedRatio || next.attrs.src !== node.attrs.src) {
            cancelDrag?.()
            savedRatio = next.attrs.ratio
            paintRatio(savedRatio)
            if (next.attrs.src !== node.attrs.src) block.style.removeProperty('--reader-image-width')
          }
          if (node.attrs.alt !== next.attrs.alt || node.attrs.caption !== next.attrs.caption) nextTick(syncDescription)
          node = next
          return true
        },
        destroy() {
          cancelDrag?.()
          block.removeEventListener('load', onLoad, true)
          block.removeEventListener('pointerdown', startResize, true)
          base.destroy()
        }
      }
    }
  }, 'ReaderResponsiveImageBlocks')
}
