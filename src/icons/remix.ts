/*
 * 兼容层：页面仍然按 Ph* 名字引用图标，实际渲染 Remix Icon。
 * 这样不需要为了换图标库去改几十个模板；以后可以逐步换成 RIcon。
 */
import { defineComponent, h, type PropType } from 'vue'
import { remixIcons } from './remix-data'

type Weight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'

function make(name: string, base: string) {
  return defineComponent({
    name,
    props: {
      size: { type: [Number, String], default: 16 },
      weight: { type: String as PropType<Weight>, default: 'regular' },
      color: { type: String, default: '' },
      mirrored: { type: Boolean, default: false }
    },
    setup(props, { attrs }) {
      return () => {
        const data = remixIcons[base]
        if (!data) return null
        const fill = props.weight === 'fill' || props.weight === 'duotone'
        const body = fill ? data.fill : data.line
        const size = typeof props.size === 'number' ? props.size : props.size
        const style = {
          flexShrink: 0,
          ...(props.mirrored ? { transform: 'scaleX(-1)' } : {})
        }
        return h('svg', {
          ...attrs,
          class: ['remix-icon', attrs.class, props.mirrored ? 'remix-mirrored' : ''],
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: props.color || 'currentColor',
          'aria-hidden': attrs['aria-hidden'] ?? 'true',
          innerHTML: body,
          style: attrs.style ? [style, attrs.style] : style
        })
      }
    }
  })
}

export const PhArchive = make('PhArchive', 'archive')
export const PhArrowClockwise = make('PhArrowClockwise', 'refresh')
export const PhArrowLeft = make('PhArrowLeft', 'arrow-left')
export const PhArrowRight = make('PhArrowRight', 'arrow-right')
export const PhArrowSquareOut = make('PhArrowSquareOut', 'external-link')
export const PhArrowsHorizontal = make('PhArrowsHorizontal', 'arrow-left-right')
export const PhArrowsInLineHorizontal = make('PhArrowsInLineHorizontal', 'contract-left-right')
export const PhArrowsInSimple = make('PhArrowsInSimple', 'fullscreen-exit')
export const PhArrowsOutLineHorizontal = make('PhArrowsOutLineHorizontal', 'expand-left-right')
export const PhArrowsOutSimple = make('PhArrowsOutSimple', 'fullscreen')
export const PhArrowsVertical = make('PhArrowsVertical', 'arrow-up-down')
export const PhBookOpen = make('PhBookOpen', 'book-open')
export const PhBookmarks = make('PhBookmarks', 'bookmark-3')
export const PhBooks = make('PhBooks', 'book-shelf')
export const PhBriefcase = make('PhBriefcase', 'briefcase-4')
export const PhCamera = make('PhCamera', 'camera')
export const PhCaretDoubleLeft = make('PhCaretDoubleLeft', 'arrow-left-double')
export const PhCaretDoubleRight = make('PhCaretDoubleRight', 'arrow-right-double')
export const PhCaretDown = make('PhCaretDown', 'arrow-down-s')
export const PhCaretLeft = make('PhCaretLeft', 'arrow-left-s')
export const PhCaretRight = make('PhCaretRight', 'arrow-right-s')
export const PhChalkboard = make('PhChalkboard', 'artboard')
export const PhChatCircle = make('PhChatCircle', 'chat-3')
export const PhCheck = make('PhCheck', 'check')
export const PhCheckSquare = make('PhCheckSquare', 'checkbox')
export const PhCircleHalf = make('PhCircleHalf', 'contrast')
export const PhClockCounterClockwise = make('PhClockCounterClockwise', 'history')
export const PhClipboard = make('PhClipboard', 'clipboard')
export const PhCode = make('PhCode', 'code')
export const PhCoffee = make('PhCoffee', 'cup')
export const PhCompass = make('PhCompass', 'compass')
export const PhCopy = make('PhCopy', 'file-copy')
export const PhCube = make('PhCube', 'box-3')
export const PhDotsThree = make('PhDotsThree', 'more')
export const PhExport = make('PhExport', 'download-2')
export const PhEye = make('PhEye', 'eye')
export const PhEyeSlash = make('PhEyeSlash', 'eye-off')
export const PhFileHtml = make('PhFileHtml', 'file-code')
export const PhFilePdf = make('PhFilePdf', 'file-pdf')
export const PhFilePlus = make('PhFilePlus', 'file-add')
export const PhFileText = make('PhFileText', 'file-text')
export const PhFlask = make('PhFlask', 'flask')
export const PhFlower = make('PhFlower', 'flower')
export const PhFolder = make('PhFolder', 'folder')
export const PhFolderSimple = make('PhFolderSimple', 'folder-3')
export const PhFolderSimplePlus = make('PhFolderSimplePlus', 'folder-add')
export const PhGitDiff = make('PhGitDiff', 'git-branch')
export const PhGraduationCap = make('PhGraduationCap', 'graduation-cap')
export const PhGraph = make('PhGraph', 'line-chart')
export const PhHandGrabbing = make('PhHandGrabbing', 'drag-move-2')
export const PhHouse = make('PhHouse', 'home')
export const PhImage = make('PhImage', 'image')
export const PhInfo = make('PhInfo', 'information')
export const PhLeaf = make('PhLeaf', 'leaf')
export const PhLightbulb = make('PhLightbulb', 'lightbulb')
export const PhListDashes = make('PhListDashes', 'list-unordered')
export const PhLock = make('PhLock', 'lock')
export const PhLockOpen = make('PhLockOpen', 'lock-unlock')
export const PhMagnifyingGlass = make('PhMagnifyingGlass', 'search')
export const PhMapTrifold = make('PhMapTrifold', 'map')
export const PhMoon = make('PhMoon', 'moon')
export const PhMusicNotes = make('PhMusicNotes', 'music-2')
export const PhNotebook = make('PhNotebook', 'booklet')
export const PhPalette = make('PhPalette', 'palette')
export const PhParagraph = make('PhParagraph', 'paragraph')
export const PhPencilLine = make('PhPencilLine', 'edit')
export const PhPencilSimple = make('PhPencilSimple', 'pencil')
export const PhPlanet = make('PhPlanet', 'planet')
export const PhPlus = make('PhPlus', 'add')
export const PhPrinter = make('PhPrinter', 'printer')
export const PhPushPin = make('PhPushPin', 'pushpin')
export const PhRocket = make('PhRocket', 'rocket')
export const PhScissors = make('PhScissors', 'scissors')
export const PhShapes = make('PhShapes', 'shapes')
export const PhShuffle = make('PhShuffle', 'shuffle')
export const PhSidebarSimple = make('PhSidebarSimple', 'layout-left')
export const PhSlidersHorizontal = make('PhSlidersHorizontal', 'filter-3')
export const PhSmiley = make('PhSmiley', 'emotion-happy')
export const PhSortAscending = make('PhSortAscending', 'sort-asc')
export const PhSpinnerGap = make('PhSpinnerGap', 'loader-4')
export const PhSquaresFour = make('PhSquaresFour', 'apps-2')
export const PhStack = make('PhStack', 'archive-2')
export const PhStar = make('PhStar', 'star')
export const PhStudent = make('PhStudent', 'user-star')
export const PhSun = make('PhSun', 'sun')
export const PhTable = make('PhTable', 'table')
export const PhTerminal = make('PhTerminal', 'terminal-box')
export const PhTextAa = make('PhTextAa', 'font-size-2')
export const PhTextAlignCenter = make('PhTextAlignCenter', 'align-center')
export const PhTextAlignLeft = make('PhTextAlignLeft', 'align-left')
export const PhTextAlignRight = make('PhTextAlignRight', 'align-right')
export const PhTextB = make('PhTextB', 'bold')
export const PhTextIndent = make('PhTextIndent', 'indent-increase')
export const PhTextItalic = make('PhTextItalic', 'italic')
export const PhTranslate = make('PhTranslate', 'translate-2')
export const PhTrash = make('PhTrash', 'delete-bin')
export const PhUserCircle = make('PhUserCircle', 'account-circle')
export const PhWarningCircle = make('PhWarningCircle', 'error-warning')
export const PhX = make('PhX', 'close')

/** A small funnel for the manager filter; Remix has no funnel in the bundled subset. */
export const PhFunnel = defineComponent({
  name: 'PhFunnel',
  props: {
    size: { type: [Number, String], default: 16 },
    color: { type: String, default: '' }
  },
  setup(props, { attrs }) {
    return () => h('svg', {
      ...attrs,
      class: ['remix-icon', attrs.class],
      viewBox: '0 0 24 24',
      width: props.size,
      height: props.size,
      fill: 'none',
      stroke: props.color || 'currentColor',
      'stroke-width': 1.7,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': attrs['aria-hidden'] ?? 'true',
      style: attrs.style
    }, [h('path', { d: 'M4 5h16l-6 7v6l-4 2v-8L4 5Z' })])
  }
})
