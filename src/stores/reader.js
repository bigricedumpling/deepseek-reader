/**
 * 阅读设置的唯一归属。
 *
 * 之前这套东西被劈成两半：App.vue 持有 font / theme / zoom / tracking 等 9 项往下发 props，
 * DocView.vue 自己又藏了 size 和 measure 两个 local ref。结果是 zoomStyle 去读 props.size，
 * 而根本没人往下传 size，四档字号全渲染成 15.5px —— 不报错、不崩，只是静默失效。
 *
 * 所以这里的原则是：
 *   1. 所有设置只有这一个地方持有，组件一律读 store，不再接 props、不再藏 local ref
 *   2. 落 localStorage 和落到 DOM 都在这里做，组件不碰
 *   3. 派生值（比如缩放后的字号与行宽）也在这里算，避免第二个地方又算一遍算歪
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

const KEY = {
  font: 'reader.font',
  size: 'reader.size',
  measure: 'reader.measure',
  zoom: 'reader.zoom',
  theme: 'reader.theme',
  para: 'reader.para',
  // 行距：KEY 里原来漏了这一项，setItem(undefined) 写进了名叫 undefined 的键，
  // 所以行距永远是默认值 1.95（设置面板里以前也没有这个入口，一直没暴露）
  leading: 'reader.leading',
  tracking: 'reader.tracking',
  strong: 'reader.strong',
  italic: 'reader.italic',
  tableWidth: 'reader.tableWidth',
  tableAlign: 'reader.tableAlign',
  toc: 'reader.toc',
  tocW: 'reader.tocW',
  nav: 'reader.nav',
  navW: 'reader.navW'
}

/** 早期版本存的是 song / hei，对应到现在的 serif / sans */
const FONT_MIGRATE = { song: 'serif', hei: 'sans' }
const SANS_DEFAULT_MIGRATION = 'reader.fontSansDefault.v1'

const str = (k, fallback) => localStorage.getItem(KEY[k]) || fallback
/** 0 是合法取值（字间距），所以不能用 || 兜底 */
const num = (k, fallback) => {
  const raw = localStorage.getItem(KEY[k])
  if (raw === null || raw === '') return fallback
  const v = Number(raw)
  return Number.isFinite(v) ? v : fallback
}
const bool = (k, fallback) => {
  const raw = localStorage.getItem(KEY[k])
  return raw === null ? fallback : raw === '1'
}

/**
 * 正文宽度三档。
 *
 * 放在 store 里而不是工具栏组件里：readingStyle 要用 ratio，工具栏要用 label，
 * 两边各写一份迟早对不上。ratio 是窄栏时的退让上限。
 */
/**
 * 行距三档。
 *
 * 中文排版的常识：一行里没有西文那些上下伸展的小写字母，视觉高度本来就矮，
 * 同样的 1.95 放到中文里就偏松、整段发飘。三档分别是：
 * 窄（密排、看结构）、中（默认，长时间阅读）、宽（行短或需要逐行精读时）。
 */
export const PACE_OPTIONS = [
  { id: 'narrow', label: '窄', lh: 1.6 },
  { id: 'normal', label: '中', lh: 1.8 },
  { id: 'wide', label: '宽', lh: 2.05 }
]

export const WIDTH_OPTIONS = [
  { value: 720, label: '窄', ratio: 76 },
  { value: 960, label: '中', ratio: 92 },
  { value: 0, label: '宽', ratio: 100 }
]

export const useReaderStore = defineStore('reader', () => {
  /* ---------- 正文排版 ---------- */
  const rawFont = localStorage.getItem(KEY.font)
  /* 旧默认衬线会在首次打开时自动换成当前默认字体。只迁移一次，之后手动选衬线仍会保留。 */
  const migrateOldDefault = !localStorage.getItem(SANS_DEFAULT_MIGRATION)
  const font = ref(migrateOldDefault && (rawFont === 'serif' || rawFont === 'song')
    ? 'harmony'
    : FONT_MIGRATE[rawFont] || rawFont || 'harmony')
  if (migrateOldDefault) localStorage.setItem(SANS_DEFAULT_MIGRATION, '1')
  const size = ref(num('size', 15.5))
  /** 阅读宽度，0 表示铺满可用宽度 */
  const measure = ref(num('measure', 960))
  // 行距：三档预设 + 滑块微调。默认 1.8 —— 1.95 在中文里偏松（中文没有西文那种小写字母，
  // 一行的视觉高度本来就矮，行距给大了整段就散）。窄/中/宽覆盖绝大多数场景。
  const leading = ref(num('leading', 1.8))
  const tracking = ref(num('tracking', 0))
  const paraStyle = ref(str('para', 'space'))
  const strongFace = ref(str('strong', 'black'))
  const italicFace = ref(str('italic', 'kai'))

  /* ---------- 外观 ---------- */
  const theme = ref(str('theme', 'auto'))
  const zoom = ref(num('zoom', 100))

  /* ---------- 表格 ---------- */
  const tableWidth = ref(str('tableWidth', 'measure'))
  const tableAlign = ref(str('tableAlign', 'left'))

  /* ---------- 布局 ---------- */
  const tocOpen = ref(bool('toc', true))
  const tocWidth = ref(num('tocW', 244))
  const navCollapsed = ref(bool('nav', false))
  /** 侧栏宽度，可以拖（180~420），夹在 store 里跟别的设置一起落 localStorage */
  const navWidth = ref(Math.max(180, Math.min(420, num('navW', 236))))

  /** 当前宽度档位的比例上限，窄栏时按它退让，见 readingStyle */
  const ratio = computed(() => WIDTH_OPTIONS.find((w) => w.value === measure.value)?.ratio ?? 100)

  /**
   * 缩放同时作用于字号与阅读宽度，每行字数因此基本不变，只是整体变大变小。
   *
   * 必须在这里乘算再内联下发：--reading-size 是内联样式，写在 CSS 里的 calc 会被它盖掉。
   *
   * --measure 用 min(绝对宽度, 比例)。只用绝对像素的话，可用宽度不够时三档会被容器
   * 一起卡成同一个值——实测 1200px 窗口开着目录时，窄中宽全是 629px，点了没反应。
   * 加一层比例兜底：宽裕时按 720/960 保证每行字数稳定，窄了按比例退让，三档始终有差别。
   */
  const readingStyle = computed(() => {
    const z = zoom.value / 100
    const px = Math.round(measure.value * z)
    return {
      '--reading-size': (size.value * z).toFixed(2) + 'px',
      '--measure': measure.value ? `min(${px}px, ${ratio.value}%)` : '100%'
    }
  })

  /** 跟随系统时要看系统偏好，所以不能只在切换时算一次 */
  const prefersDark = ref(
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      prefersDark.value = e.matches
    })
  }
  /**
   * 实际生效的主题。
   *
   * auto 看系统偏好，其余原样返回 —— 护眼是独立的一档，不能塌回 light，
   * 否则 data-theme 只会有 light/dark 两个值，护眼样式永远匹配不上。
   */
  const resolvedTheme = computed(() => {
    if (theme.value !== 'auto') return theme.value
    return prefersDark.value ? 'dark' : 'light'
  })
  const isDark = computed(() => resolvedTheme.value === 'dark')

  /**
   * 把设置落到 DOM 与 localStorage。
   *
   * 集中在一处是这套东西唯一的意义：以前散在两个组件里，
   * 加一个设置就得记得改三四个地方，漏一处就是点了没反应。
   */
  function apply() {
    const b = document.body
    b.dataset.font = font.value
    b.dataset.italic = italicFace.value
    b.dataset.strong = strongFace.value
    b.dataset.para = paraStyle.value
    b.dataset.table = tableWidth.value
    b.dataset.tableAlign = tableAlign.value
    b.dataset.theme = resolvedTheme.value
    b.style.setProperty('--reading-lh', String(leading.value))
    b.style.setProperty('--reading-tracking', tracking.value + 'em')

    localStorage.setItem(KEY.font, font.value)
    localStorage.setItem(KEY.size, String(size.value))
    localStorage.setItem(KEY.measure, String(measure.value))
    localStorage.setItem(KEY.leading, String(leading.value))
    localStorage.setItem(KEY.tracking, String(tracking.value))
    localStorage.setItem(KEY.para, paraStyle.value)
    localStorage.setItem(KEY.strong, strongFace.value)
    localStorage.setItem(KEY.italic, italicFace.value)
    localStorage.setItem(KEY.theme, theme.value)
    localStorage.setItem(KEY.zoom, String(zoom.value))
    localStorage.setItem(KEY.tableWidth, tableWidth.value)
    localStorage.setItem(KEY.tableAlign, tableAlign.value)
    localStorage.setItem(KEY.toc, tocOpen.value ? '1' : '0')
    localStorage.setItem(KEY.tocW, String(tocWidth.value))
    localStorage.setItem(KEY.nav, navCollapsed.value ? '1' : '0')
    localStorage.setItem(KEY.navW, String(navWidth.value))
  }

  watch(
    [
      font, size, measure, leading, tracking, paraStyle, strongFace, italicFace,
      theme, zoom, tableWidth, tableAlign, tocOpen, tocWidth, navCollapsed, navWidth, resolvedTheme
    ],
    apply,
    { immediate: true }
  )

  return {
    font, size, measure, leading, tracking, paraStyle, strongFace, italicFace,
    theme, zoom, tableWidth, tableAlign,
    tocOpen, tocWidth, navCollapsed, navWidth,
    readingStyle, isDark, resolvedTheme
  }
})
