<template>
  <!--
    打开的文档，像浏览器标签一样排在这里。

    只显示文件名（和侧栏、磁盘上的名字一致），太长就渐隐；
    有未保存改动时点一个小点；点标签切换，点 × 关掉。
    只有一篇时呈现为普通标题，保留容器以完成增减标签的过渡。
  -->
  <div
    ref="strip"
    class="doc-tabs"
    :class="{ 'has-left': fadeLeft, 'has-right': fadeRight, 'single-document': items.length === 1 }"
    @wheel="onWheel"
    @scroll="updateFade"
  >
    <TransitionGroup name="tab" @before-leave="freezeLeaving" @after-enter="measure" @after-leave="measure">
      <div
        v-for="t in items"
        :key="t.file"
        class="doc-tab"
        :class="{ 'is-active': t.file === active }"
      >
        <button
          class="doc-tab-main"
          :title="t.file"
          @click="$emit('select', t.file)"
          @auxclick="onAux($event, t.file)"
        >
          <ContentIcon :value="t.icon" :size="16" />
          <span class="doc-tab-name">{{ t.name }}</span>
          <span v-if="t.dirty" class="doc-tab-dot" title="改动还在往回写的路上" />
        </button>
        <button
          v-if="items.length > 1"
          class="doc-tab-x"
          title="关掉这一篇"
          @click.stop="$emit('close', t.file)"
        >
          <PhX :size="11" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import ContentIcon from './ContentIcon.vue'
import { PhX } from '@phosphor-icons/vue'

const props = defineProps({
  /** [{ file, name, dirty }] */
  items: { type: Array, default: () => [] },
  active: { type: String, default: '' }
})

const emit = defineEmits(['select', 'close'])

const strip = ref(null)

/** 两侧还有没有看不见的标签：有就画一小段渐变，提示"这儿还能滚" */
const fadeLeft = ref(false)
const fadeRight = ref(false)

function freezeLeaving(el){el.style.width=el.offsetWidth+'px';el.style.left=el.offsetLeft+'px';el.style.top=el.offsetTop+'px'}
function measure() {
  updateFade()
  for(const el of strip.value?.querySelectorAll('.doc-tab-name')||[])el.classList.toggle('is-clipped',el.scrollWidth > el.clientWidth + 1)
}
function updateFade() {
  const el = strip.value
  if (!el) return
  fadeLeft.value = el.scrollLeft > 1
  fadeRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

/** 把当前这篇滚进可视区：标签开多了之后，切过去要能看见自己在哪 */
function scrollActiveIntoView(smooth = true) {
  const el = strip.value
  if (!el) return
  const tab = el.querySelector('.doc-tab.is-active:not(.tab-leave-active)')
  if (!tab) return
  const left = tab.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft
  const right = left + tab.offsetWidth
  const pad = 10
  if (left - pad < el.scrollLeft) {
    el.scrollTo({ left: Math.max(0, left - pad), behavior: smooth ? 'smooth' : 'auto' })
  } else if (right + pad > el.scrollLeft + el.clientWidth) {
    el.scrollTo({ left: right + pad - el.clientWidth, behavior: smooth ? 'smooth' : 'auto' })
  }
}

watch(() => props.active, () => nextTick(() => scrollActiveIntoView()))
watch(
  () => props.items,
  () => nextTick(measure)
)

let observer = null

onMounted(() => {
  nextTick(() => {
    scrollActiveIntoView(false)
    measure()
  })
  // 窗口或侧栏变宽变窄时，遮罩要不要显示可能就变了
  observer = new ResizeObserver(measure)
  if (strip.value) observer.observe(strip.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
})

/** 鼠标滚轮横着滚标签条：标签多了之后不用去够下面的滚动条 */
function onWheel(e) {
  const el = strip.value
  if (!el) return
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
  // 已经滚到头了就别拦这一次滚动：不然鼠标停在标签上时，正文/页面反而滚不动
  const atStart = el.scrollLeft <= 0
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
  if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return
  el.scrollLeft += e.deltaY
  e.preventDefault()
}

/** 中键点一下就关掉，跟浏览器一致 */
function onAux(e, file) {
  if (e.button === 1) {
    e.preventDefault()
    emit('close', file)
  }
}
</script>

<style scoped>
/*
 * 标签条本体。
 *
 * 两侧的渐变不是装饰：标签多了会横向滚，被遮住的那一边用一小段渐隐提示"还有"，
 * 只在真的溢出了才显示（靠 --fade-l / --fade-r 两个变量开关）。
 */
.doc-tabs {
  --fade-l: 0px;
  --fade-r: 0px;
  /* 关标签时那个要淡出的标签是绝对定位的，得有定位基准，不然会跳 */
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 var(--fade-l), #000 calc(100% - var(--fade-r)), transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 var(--fade-l), #000 calc(100% - var(--fade-r)), transparent 100%);
}
.doc-tabs::-webkit-scrollbar {
  display: none;
}
.doc-tabs.has-left {
  --fade-l: 18px;
}
.doc-tabs.has-right {
  --fade-r: 18px;
}

/* 开关标签、切换顺序时的过渡：位置变化靠 tab-move 平滑滑过去 */
.tab-enter-active,
.tab-leave-active,
.tab-move {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.tab-enter-from,
.tab-leave-to {
  opacity: 0;
  transform: translateX(6px) scale(0.96);
}
.tab-leave-active {
  position: absolute;
}
.doc-tab {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  max-width: 220px;
  position: relative;
  border-radius: 8px;
  transition: background 0.15s;
}
.doc-tab:hover {
  background: var(--c-hover);
}
.doc-tab.is-active {
  background: var(--c-field);
  box-shadow: none;
}
.doc-tab-main {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 8px 6px 8px 10px;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--c-sub);
  cursor: pointer;
}
.doc-tab.is-active .doc-tab-main {
  color: var(--c-ink);
}
.doc-tab-name {
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
}
.doc-tab-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-ds);
  flex-shrink: 0;
}
.doc-tab-x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-right: 4px;
  border-radius: 5px;
  color: var(--c-faint);
  opacity: 0;
  transition: opacity 0.15s;
}
.doc-tab:hover .doc-tab-x,
.doc-tab.is-active .doc-tab-x {
  opacity: 1;
}
.doc-tab-x:hover {
  background: var(--c-chip-hover);
  color: var(--c-ink);
}
</style>

<style scoped>
.doc-tab:not(:last-child):not(.is-active)::after{content:'';position:absolute;right:-1px;top:10px;bottom:10px;width:1px;background:var(--c-line)}.doc-tab:has(+ .is-active)::after{display:none}.doc-tab-name.is-clipped{mask-image:linear-gradient(to right,#000 calc(100% - 18px),transparent)}.doc-tab-main .content-icon{width:16px;height:16px}.doc-tab-x{flex-shrink:0}.doc-tabs:not(.has-left):not(.has-right){mask-image:none;-webkit-mask-image:none}
</style>
<style scoped>
.doc-tabs{min-height:36px}.doc-tab.tab-move{transition:transform 240ms cubic-bezier(.22,1,.36,1)!important}.doc-tab.tab-enter-active,.doc-tab.tab-leave-active{transition:opacity 180ms ease,transform 240ms cubic-bezier(.22,1,.36,1)!important}.doc-tab.tab-enter-from,.doc-tab.tab-leave-to{opacity:0;transform:translateY(5px) scale(.94)}.single-document .doc-tab{--smooth-fill:transparent!important;max-width:100%}.single-document .doc-tab-main{padding-left:0}.single-document .doc-tab-main .content-icon{display:none}.single-document .doc-tab-name{color:var(--c-sub)}
@media(prefers-reduced-motion:reduce){.doc-tab.tab-move,.doc-tab.tab-enter-active,.doc-tab.tab-leave-active{transition:none!important}}
</style>
