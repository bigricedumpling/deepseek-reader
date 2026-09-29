<template>
  <!--
    桌面端横向排知识库栏与文档树；手机端知识库列表改为弹窗。
  -->
  <div class="flex h-screen flex-shrink-0">
    <!-- 手机端以弹窗出现；遮罩只在窄屏显示。 -->
    <transition name="lib-backdrop">
      <button
        v-if="libPanel.open"
        class="lib-modal-backdrop"
        aria-label="关闭知识库弹窗"
        @click="closeLibPanel"
      />
    </transition>
    <!-- 桌面端参与布局，手机端居中显示。 -->
    <transition name="lib-panel">
      <aside
        v-if="libPanel.open"
        class="lib-panel"
        :style="{ '--lib-w': libWidth + 'px' }"
        aria-label="知识库切换"
        @click.stop="onLibPanelClick"
      >
        <div class="lib-panel-head">
          <span class="lib-panel-title"><span class="lib-title-desktop">知识库</span><span class="lib-title-mobile">切换知识库</span></span>
          <span class="lib-panel-head-acts">
            <button v-if="!isGuest" class="icon-btn" title="新建知识库" @click.stop="createLib">
              <PhPlus :size="14" />
            </button>
            <button class="icon-btn" title="关闭知识库" aria-label="关闭知识库" @click="closeLibPanel">
              <PhCaretDoubleLeft :size="15" class="lib-close-desktop" />
              <PhX :size="15" class="lib-close-mobile" />
            </button>
          </span>
        </div>

        <input ref="libIconInput" type="file" accept="image/*" class="hidden" @change="onPickLibIcon" />

        <!-- 拖拽条：调面板宽度，松手后写回注册表 -->
        <div class="lib-panel-resize" title="拖动调整知识库栏宽度" @pointerdown.stop="startLibResize" />

        <div class="lib-panel-list">
          <div
            v-for="(lib, i) in libPanel.libs"
            :key="lib.path"
            class="lib-row"
            :class="{ 'is-current': isCurrentLib(lib), 'is-dragging': libDrag.from === i }"
            :draggable="!isGuest"
            @dragstart.stop="onLibDragStart(i, $event)"
            @dragover.prevent.stop="onLibDragOver(i)"
            @dragend.stop="onLibDragEnd"
          >
            <!-- 每个知识库用自己的图标 -->
            <button class="lib-icon-edit" :disabled="isGuest || lib.locked" :title="lib.locked ? '知识库已锁定' : '更换知识库图标'" @click.stop="pickLibIcon(lib, $event)"><ContentIcon class="lib-row-icon" :value="lib.icon || siteIcon" /></button>


            <button class="lib-row-name" :title="lib.name" @click="goLib(lib)">
              <input
                v-if="!isGuest && renaming === lib.name"
                ref="renameInput"
                class="lib-row-input"
                :value="renameText"
                spellcheck="false"
                @click.stop
                @input="renameText = $event.target.value"
                @keydown.enter.prevent="commitRename(lib)"
                @keydown.esc.stop.prevent="cancelRename"
                @blur="commitRename(lib)"
              />
              <template v-else>
                <span class="lib-row-text">{{ lib.name }}</span>
                <span class="lib-row-meta">{{ lib.docs }} 篇</span>
              </template>
            </button>

            <PhEyeSlash v-if="lib.shared === false" :size="13" class="share-eye" title="不对外展示" />
            <PhLock v-if="lib.locked" :size="13" class="share-eye" title="已锁定" />
            <!-- 与侧边栏一致：悬停出现三个点，操作收进菜单 -->
            <button
              class="icon-btn xs acts-btn"
              title="更多操作"
              @click.stop="openLibMenu(lib, $event)"
            >
              <PhDotsThree :size="16" weight="bold" />
            </button>
          </div>
        </div>
      </aside>
    </transition>

    <!--
      收起与展开是同一个 aside，宽度做过渡。
      原来是 v-if / v-else 两个 aside，切换时整个节点被替换，宽度是硬跳的，
      跟右边目录的 transition: width 也不一致。
    -->
    <aside
    class="h-screen flex flex-col flex-shrink-0 bg-[var(--c-panel)] border-r border-[var(--c-line)] select-none z-30 relative overflow-hidden transition-[width] duration-[220ms] ease-out"
    :class="{ 'is-reader-rail': collapsed }"
    :style="{ width: (collapsed ? 44 : width) + 'px' }"
  >
    <!--
      收起态：只留图标本身，不再另给一条竖向工具条。
      展开入口不靠专门的按钮 —— 点图标、点检索、点下面任一目录都能展开并进入，
      所以那条竖着的展开/收起图标是多余的。
      也不放"新建文档"：收起时本来就不是干活的状态。
    -->
    <div v-if="collapsed" class="reader-rail">
      <button class="brand-logo sm" title="展开侧栏" @click.stop="onRailLogo"><ContentIcon :value="logo" /></button>
      <RailToc />
    </div>

    <!-- 展开态 -->
    <template v-else>
      <!--
        品牌：标题两行可以直接改，图标点一下换。
        图标缩到 96px 存成 data URL 放 localStorage——原图动辄几百 KB，
        整个塞进去会撑爆配额，而且侧栏里只显示 22px，没必要留原图。
      -->
      <div class="px-4 pt-5 pb-3 flex items-start gap-2.5 shrink-0">
        <button class="brand-logo" title="打开知识库" @click.stop="openLibPanel">
          <ContentIcon :value="logo" />
        </button>
        <div class="min-w-0 flex-1">
          <input
            v-for="(line, i) in brandLines"
            :key="i"
            v-model="brandLines[i]"
            class="brand-line brand-input"
            :class="i === 0 ? 'is-title' : 'is-sub'"
            spellcheck="false"
            :readonly="isGuest || !currentLibEditable"
            :title="'第 ' + (i + 1) + ' 行，可以直接改'"
            @keydown.enter.prevent="$event.target.blur()"
            @change="onBrandEdited(i, $event.target.value)"
          />
        </div>
        <!--
          展开知识库：放在收起按钮左边，与它同尺寸同排。
          当前是哪个库、共有几个，走 tooltip 提示，不占版面。
        -->
        <button
          class="icon-btn"
          :title="'知识库：' + (currentLib || '未选择') + '（共 ' + libPanel.libs.length + ' 个）'"
          @click.stop="libPanel.open ? (libPanel.open = false) : openLibPanel()"
        >
          <PhStack :size="16" :weight="libPanel.open ? 'fill' : 'regular'" />
        </button>
        <!--
          收起侧栏时把知识库面板一起收掉。
          两栏各管各的开合是一开始的想法，但收起了侧栏、左边却还杵着一个面板，
          看着就是没收干净 —— 收起是"把这块收掉"的意思，范围该覆盖整块。
        -->
        <button class="icon-btn -mr-1" title="收起侧栏" @click.stop="collapseAllUI">
          <PhSidebarSimple :size="16" />
        </button>
      </div>

    <!-- 新建文档（新建目录在下面工具条那一排的文件夹按钮，不重复放） -->
    <div v-if="currentLibEditable" class="px-3 pt-2 pb-3">
      <button
        class="newdoc-btn w-full h-9 flex items-center justify-center gap-1.5 ui-round-control text-[13px] text-[var(--c-ink)]"
        title="在根目录新建文档"
        @click="emit('create-doc', currentLib || '')"
      >
        <PhPlus :size="13" weight="bold" />
        新建文档
      </button>
    </div>

    <!-- 工具条 -->
    <div class="px-3 pb-2 flex items-center gap-0.5 shrink-0">
      <span class="toolbar-label">{{ groupMode === 'category' ? '工作区' : '全部文档' }}</span>
      <span class="ml-auto flex items-center gap-0.5">
        <button
          class="icon-btn"
          :class="{ 'is-active': searchOpen }"
          title="搜索当前知识库文档"
          @click="toggleSearch"
        >
          <PhMagnifyingGlass :size="15" />
        </button>
        <div class="relative">
          <button
            class="icon-btn"
            :class="{ 'is-active': menuOpen }"
            title="分组与排序"
            @click="menuOpen = !menuOpen"
          >
            <PhSlidersHorizontal :size="15" />
          </button>
          <transition name="pop">
            <div v-if="menuOpen" class="side-menu" @click.stop>
              <p class="side-menu-title">分组方式</p>
              <button
                v-for="g in GROUPS"
                :key="g.id"
                class="side-menu-item"
                :class="{ 'is-on': groupMode === g.id }"
                @click="setGroup(g.id)"
              >
                <span class="menu-label"><component :is="g.icon" :size="13" class="menu-icon" />{{ g.label }}</span>
                <PhCheck v-if="groupMode === g.id" :size="12" weight="bold" />
              </button>
              <div class="side-menu-sep" />
              <p class="side-menu-title">排序方式</p>
              <button
                v-for="s in SORTS"
                :key="s.id"
                class="side-menu-item"
                :class="{ 'is-on': sortMode === s.id }"
                @click="setSort(s.id)"
              >
                <span class="menu-label"><component :is="s.icon" :size="13" class="menu-icon" />{{ s.label }}</span>
                <PhCheck v-if="sortMode === s.id" :size="12" weight="bold" />
              </button>
            </div>
          </transition>
        </div>
        <button class="icon-btn" title="重新扫描磁盘（在 app 外面改了文件之后点一下）" @click="rescan">
          <PhArrowClockwise :size="15" />
        </button>
        <button v-if="currentLibEditable" class="icon-btn" title="新建分类" @click="emit('create-category', currentLib || '')">
          <PhFolderSimplePlus :size="16" />
        </button>
      </span>
    </div>

    <!-- 筛选框 -->
    <transition name="slide-fade">
      <div v-if="searchOpen" class="px-3 pb-2 shrink-0">
        <input
          ref="searchEl"
          v-model="query"
          class="w-full h-7 px-2.5 ui-round-control bg-[var(--c-field)] border border-[var(--c-line)] text-[12.5px] outline-none focus:border-[var(--color-ds)]/50 transition-colors"
          placeholder="搜索文档名或路径"
          @keydown.esc="closeSearch"
        />
      </div>
    </transition>

    <!-- 树里那个…的菜单：teleport 出去，免得被侧栏的滚动裁掉 -->
    <Teleport to="body">
      <div v-if="tree.menu.open" class="tree-menu" :style="tree.menu.style">
        <button
          v-for="it in menuItems"
          :key="it.id"
          class="tree-menu-item"
          :disabled="it.disabled"
          :class="{ danger: it.danger }"
          @click="onMenuPick(it)"
        >
          <component :is="it.icon" :size="14" class="menu-icon" />
          {{ it.label }}
        </button>
      </div>
    </Teleport>

    <!-- 拖拽条：调整侧栏宽度 -->
    <div
      v-if="!collapsed"
      class="absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize group"
      title="拖动调整侧栏宽度"
      @pointerdown="startResize"
    >
      <div class="absolute inset-y-0 right-0 w-px bg-transparent group-hover:bg-[var(--c-line)] transition-colors" />
    </div>

    <!-- 文档树 -->
    <!-- 落在空白处 = 挪到根目录；行和目录各自接住自己的落点 -->
    <nav
      class="flex-1 min-h-0 overflow-y-auto no-scrollbar px-2.5 pb-4 pt-0.5"
      @dragover="tree.overRoot($event)"
      @drop.prevent="tree.drop()"
    >
      <template v-if="groupMode === 'tree'">
        <DocTree
          :nodes="nodes"
          :parent="currentLib || ''"
          :current-path="currentPath"
          :collapsed="collapsedCats"
          :query="query"
          :sort-mode="sortMode"
          @select="emit('select', $event)"
          @create-doc="emit('create-doc', $event)"
          @create-category="emit('create-category', $event)"
          @delete-doc="emit('delete-doc', $event)"
          @delete-category="emit('delete-category', $event)"
          @toggle="toggleCat"
        />
        <p v-if="!visibleCount" class="text-[12px] text-[var(--c-faint)] px-3 py-3 text-center">
          {{ query ? '没有匹配的文档' : '还没有文档' }}
        </p>
      </template>

      <template v-else>
        <div
          v-for="doc in flatDocs"
          :key="doc.file"
          class="doc-row group/doc"
          :class="{ 'is-on': doc.file === currentPath }"
          :draggable="store.canEdit(doc)"
          @dragstart="tree.start(doc, $event)"
          @dragover="tree.overRow(doc, $event)"
          @drop.prevent="tree.drop()"
          @dragend="tree.end()"
          @click="emit('select', doc.file)"
        >
          <button class="doc-title" :title="doc.file"><ContentIcon v-if="doc.meta?.icon" :value="doc.meta.icon" :size="14" />
            <span class="truncate">{{ doc.name }}</span>
            <span v-if="doc.dir" class="doc-dir">{{ doc.dir }}</span>
          </button>
          <PhEyeSlash v-if="doc.shared === false" :size="11" class="share-eye" title="不对外展示" />
          <PhLock v-if="doc.locked" :size="11" class="share-eye" title="已锁定" />
          <button class="icon-btn xs acts-btn" title="更多操作" @click.stop="tree.openMenu('file', doc, $event)"><PhDotsThree :size="16" /></button>
        </div>
        <p v-if="!visibleCount" class="text-[12px] text-[var(--c-faint)] px-3 py-3 text-center">
          {{ query ? '没有匹配的文档' : '还没有文档' }}
        </p>
      </template>

      </nav>
      <div class="workspace-footer">
        <button class="manage-entry ui-font" @click="identityOpen = !identityOpen"><PhUserCircle :size="20" /><span>{{ isGuest ? '公开访客' : '管理工作区' }}</span></button>
        <div v-if="identityOpen" class="identity-menu">
          <button @click="goEntry">切换入口</button>
          <button v-if="!isGuest" @click="agentSettings=true;identityOpen=false">Agent 连接</button>
        </div>
      </div>
    </template>
    </aside>

    <AgentSettings v-if="agentSettings" :library="currentLib" @close="agentSettings=false" />
    <IconPicker v-if="iconPicking" :save="saveLibIcon" :anchor="libIconAnchor" @close="iconPicking=false" />
    <!-- 新建 / 删除知识库的确认框：用站内统一那套，不用浏览器原生弹窗 -->
    <AppDialog
      :open="libDialog.open"
      :mode="libDialog.danger ? 'confirm' : 'prompt'"
      :title="libDialog.title"
      :message="libDialog.message"
      :placeholder="libDialog.placeholder"
      :initial="libDialog.initial"
      :confirm-text="libDialog.confirmText"
      :danger="libDialog.danger"
      @confirm="libDialog.onConfirm && libDialog.onConfirm($event)"
      @cancel="closeLibDialog"
    />
  </div>
</template>

<script setup>
import {setFavicon} from '../utils/favicon'

import AgentSettings from './AgentSettings.vue'
import ContentIcon from './ContentIcon.vue'
import IconPicker from './IconPicker.vue'
import { resizePanel } from '../utils/panel-resize'
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, reactive, provide } from 'vue'
// 菜单里的图标：树的操作、分组与排序
import {
  PhSidebarSimple, PhPlus, PhMagnifyingGlass, PhSlidersHorizontal, PhFolderSimple,
  PhSquaresFour, PhUserCircle, PhCaretDoubleRight, PhCheck, PhFolderSimplePlus, PhArrowClockwise,
  PhFilePlus, PhPencilSimple, PhTrash, PhListDashes, PhSortAscending, PhClockCounterClockwise,
  PhLock, PhLockOpen, PhEye, PhEyeSlash, PhImage, PhStack, PhCaretLeft, PhCaretRight,
  PhCaretDown, PhCaretDoubleLeft, PhX, PhHandGrabbing, PhDotsThree
} from '@phosphor-icons/vue'
import RailToc from './RailToc.vue'
import { useDocsStore } from '../stores/docs'
import DocTree from './DocTree.vue'
import AppDialog from './AppDialog.vue'
import { API_BASE } from '../utils/api'
const props = defineProps({
  nodes: { type: Array, required: true },
  currentPath: { type: String, default: '' },
  width: { type: Number, default: 236 },
  collapsed: { type: Boolean, default: false }
})
const emit = defineEmits([
  'select', 'create-doc', 'delete-doc',
  'create-category', 'delete-category', 'toggle-collapse', 'update:width'
])

/* ---------- 品牌：标题与图标 ---------- */

const store = useDocsStore()
/** 访客（分享链接进来的人）：新建、改名、删除这些入口一律不显示 */
const isGuest = computed(() => store.isGuest)
const currentLibEditable = computed(() => store.canEdit(libPanel.libs.find(l => l.name === currentLib.value)))

/*
 * 左上角的名字与图标 —— 从服务端读，不存 localStorage。
 *
 * 两个站点在同一域名下（/deepseek/reader/ 与 /deepseek/demo/），localStorage 按域名共享：
 * 前端一写回就互相串味，打开过示例库、主站的名字也被顶掉。
 * 而且以前写回用的键是写死的，注入的独立键根本读不到，
 * 所以按实例分开键名也解决不了。改成服务端按实例给：品牌从哪来由服务端决定，
 * 前端只负责显示；本地改只改当前这次会话，不落盘。
 */
/*
 * 品牌来自构建时注入的 VITE_BRAND（形如第一行|第二行），
 * 与 VITE_BASE 一个机制 —— 每个实例构建自己的那一份，不依赖运行时环境变量，
 * 也不经过 localStorage（同域名下两个站点共用一个存储，写回就会串味）。
 */
/*
 * 标题两行。
 *
 * 第一行不是一份独立数据 —— 它就是"当前知识库的名字"，真源在服务端的注册表里
 * （.知识库.json）。这里只是一份显示副本，改它等于改库名（改名会同步重命名文件夹）。
 * 第二行是副标题，纯粹给人看的，不参与任何同步。
 *
 * 以前这两行存在 localStorage 里，和目录名、注册表各存一份，
 * 于是"改了标题目录不动、改了目录标题不动"——那才是根子上的病。
 */
/* 副标题的兜底：某个库没写 sub 时用它 */
const FALLBACK_SUB = String(import.meta.env.VITE_BRAND || '').split('|')[1] || ''
const brandLines = ref(['', FALLBACK_SUB])

const libIconInput = ref(null)

/* ---------- 知识库面板：列出所有库，可切换 / 改名 / 换图标 / 管可见性 ---------- */

const libPanel = reactive({ open: false, libs: [], busy: '' })

/** 当前所在的知识库：文档根的名字（每个实例一个根，所以直接问服务端） */
/** 当前库的完整信息（图标、说明），从注册表同步过来 */
const currentLibIcon = ref('')

const currentLib = ref(
  (() => {
    try {
      const lib = String(new URLSearchParams(location.search).get('lib') || '').trim()
      return lib === '业务面' ? '面试准备' : lib
    } catch {
      return ''
    }
  })()
)

async function loadLibs() {
  try {
    const res = await fetch(API_BASE + '/api/libs', { cache: 'no-store' })
    const data = await res.json()
    libPanel.libs = (data?.data?.libs || []).filter((l) => l && l.name)
    applyConfig(data?.data?.config)
    applyCurrentLib()
  } catch {
    libPanel.libs = []
  }
}

/**
 * 把"当前库"的信息摊到各处显示：标题第一行、侧栏图标。
 *
 * 全部从同一份数据派生，所以改任何一处（标题、库列表、图标）之后
 * 只要重新调一次它，三处就一致了 —— 不需要两两之间接同步线。
 */
function applyCurrentLib() {
  const lib = libPanel.libs.find((l) => l.name === currentLib.value)
  if (!lib) return
  brandLines.value[0] = lib.name
  /* 副标题也按库走：每个知识库各说各的，不再共用主库那一句 */
  brandLines.value[1] = lib.sub || FALLBACK_SUB
  currentLibIcon.value = lib.icon || ''
  /*
   * 浏览器标签页也跟着走：标题换成当前知识库名，图标换成它的 icon。
   * 切库之后标签页还挂着上一个库的名字，等于对外显示错了身份。
   */
  document.title = lib.name

}

/*
 * 面板宽度：从注册表来，拖拽时先改本地（跟手），松手再写回。
 * 不另开 localStorage 副本 —— 偏好和知识库同源，少一份副本就少一处不一致。
 */
const libWidth = ref(236)

function applyConfig(cfg) {
  if (!cfg) return
  if (typeof cfg.panelWidth === 'number') libWidth.value = cfg.panelWidth
}

async function saveLibConfig(patch) {
  try {
    await fetch(API_BASE + '/api/lib/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    })
  } catch {
    /* 存不上就只当次生效 */
  }
}

/*
 * 拖拽排序：顺序是使用者的意图，存进注册表（不存 localStorage）。
 * 拖的时候就地预览（数组换位），松手一次性写回，只发一个请求。
 */
const libDrag = reactive({ from: -1, over: -1 })

function onLibDragStart(i, ev) {
  if (isGuest.value) return
  libDrag.from = i
  ev.dataTransfer.effectAllowed = 'move'
  /* Firefox 要求必须 setData 才会开始拖 */
  try { ev.dataTransfer.setData('text/plain', String(i)) } catch { /* 忽略 */ }
}

function onLibDragOver(i) {
  if (libDrag.from < 0 || libDrag.from === i) return
  const list = libPanel.libs
  const [moved] = list.splice(libDrag.from, 1)
  list.splice(i, 0, moved)
  libDrag.from = i
}

async function onLibDragEnd() {
  if (libDrag.from < 0) return
  libDrag.from = -1
  libDrag.over = -1
  try {
    const res = await fetch(API_BASE + '/api/lib/order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: libPanel.libs.map((l) => l.name) })
    })
    const data = await res.json()
    if (data.ok) libPanel.libs = data.data.libs || libPanel.libs
  } catch {
    /* 存不上就只当次生效 */
  }
}

function startLibResize(e) {
  const x=e.clientX, width=libWidth.value
  resizePanel(e, ev => {libWidth.value=Math.max(180,Math.min(420,width+ev.clientX-x))}, () => saveLibConfig({panelWidth:libWidth.value}))
}

/*
 * 新建知识库：建目录 + 写注册表一步到位（服务端做），
 * 名字先用 prompt 问 —— 建完立刻切过去，看到的就是刚建的那个空库。
 */
/*
 * 新建知识库的弹窗状态。
 *
 * 以前用 window.prompt —— 浏览器原生框，样式和站内完全不搭，
 * 而且不能带说明文字。站内有 AppDialog（支持 prompt 模式），直接用它。
 */
const libDialog = reactive({
  open: false,
  title: '',
  message: '',
  placeholder: '',
  initial: '',
  confirmText: '确定',
  danger: false,
  onConfirm: null
})

function closeLibDialog() {
  libDialog.open = false
  libDialog.onConfirm = null
}

function askLibDialog(opts) {
  Object.assign(libDialog, {
    open: true,
    title: '', message: '', placeholder: '', initial: '',
    confirmText: '确定', danger: false, onConfirm: null
  }, opts)
}

async function createLib() {
  askLibDialog({
    title: '新建知识库',
    message: '会同时建一个同名文件夹。建好之后可以在这里给它换图标、管对外可见性。',
    placeholder: '知识库名字',
    confirmText: '新建',
    onConfirm: (value) => { closeLibDialog(); doCreateLib(value) }
  })
}

const creatingLib = ref(false)
async function doCreateLib(value) {
  const to = String(value || '').trim()
  if (!to || creatingLib.value) return
  creatingLib.value = true
  try {
    const res = await fetch(API_BASE + '/api/lib', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: to })
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || '新建失败')
    libPanel.libs = data.data.libs || []
    const made = libPanel.libs.find((l) => l.name === to)
    if (made) await goLib(made)
  } catch (e) {
    window.alert(String(e.message || e))
  } finally {
    creatingLib.value = false
  }
}

/*
 * 收起态点图标只展开文档侧栏；展开态的品牌图标才打开知识库栏。
 */
/** 收起整个左区：知识库面板 + 文档栏 */
function collapseAllUI() {
  libPanel.open = false
  emit('toggle-collapse')
}

function onRailLogo() {
  if (props.collapsed) emit('toggle-collapse')
}

const isMobileLibView = () => window.matchMedia('(max-width: 820px)').matches

function closeLibPanel() {
  libPanel.open = false
  if (tree.menu.open) tree.closeMenu()
}

function openLibPanel() {
  libPanel.open = true
  loadLibs()
}

function isCurrentLib(lib) {
  if (!currentLib.value) {
    /* 还没问出来时，用标题第一行兜底比一下，至少不闪 */
    return lib.name === brandLines.value[0]
  }
  return lib.name === currentLib.value
}

/*
 * 切换知识库：只换地址栏里的 ?lib=<库名>，然后重新拉树。
 *
 * 不换实例、不换根目录 —— 一个知识库就是根下的一个文件夹，
 * 选了它侧边栏就只显示它（服务端按 ?lib= 裁剪），路径仍然相对文档根，
 * 所以文档读取、保存那一整套不用改。
 */
async function goLib(lib) {
  if (!lib) return
  const name = lib.path || lib.name
  if (isCurrentLib(lib)) {
    if (isMobileLibView()) closeLibPanel()
    return
  }
  // 切库会清空当前文档缓存，必须先等最新内容落盘。
  if (store.currentPath && (store.isDirty || store.saving) && !(await store.save())) return
  /*
   * 桌面保持知识库栏，便于连续切换；手机在完成切换后关闭弹窗。
   */
  const url = new URL(location.href)
  url.searchParams.set('lib', name)
  /* 换库之后当前这篇多半不属于新库，交给 ensureCurrent 重新挑一篇 */
  history.replaceState(null, '', url.toString())
  currentLib.value = name
  applyCurrentLib()
  /*
   * 用 switchLib 而不是 loadAll：它会先把"当前这篇"清掉再拉新库的树。
   * 不清的话地址栏会出现"路径属于 A 库、?lib= 指向 B 库"的自相矛盾状态。
   */
  await store.switchLib()
  if (isMobileLibView()) closeLibPanel()
}

/*
 * 知识库的…菜单：复用侧边栏那一套浮层（tree.menu），
 * 所以位置、样式、点别处关掉的行为都一样，不用另造一个。
 */
function openLibMenu(lib, ev) {
  tree.openMenu('lib', { name: lib.name, path: lib.path, docs: lib.docs, shared: lib.shared, locked: lib.locked, lockedAt: lib.lockedAt }, ev)
}

/*
 * 面板上的点击也要能把…菜单收起来。
 *
 * 菜单的关闭靠"文档上的下一次点击"，而面板容器带 @click.stop ——
 * 点击在面板范围内根本到不了 document，于是点了别处菜单还挂着。
 * 这里在面板自己这一层补一次关闭。
 */
function onLibPanelClick() {
  if (tree.menu.open) tree.closeMenu()
}

/*
 * 就地改名：点铅笔那一行变成输入框，回车或失焦提交，Esc 取消。
 * 不用弹窗 —— 改名是个高频小动作，弹一层窗打断节奏。
 */
const renaming = ref('')
const renameText = ref('')
const renameInput = ref(null)

function startRename(lib) {
  renaming.value = lib.name
  renameText.value = lib.name
  nextTick(() => {
    const el = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value
    el?.focus?.()
    el?.select?.()
  })
}

function cancelRename() {
  renaming.value = ''
  renameText.value = ''
}

/** 两个改名入口共用这一条流程；当前库改名会使所有文档路径失效。 */
async function renameLib(from, to) {
  if (!from || !to || to === from) return
  if (to.includes('/') || to.startsWith('.')) throw new Error('知识库名不能带斜杠或以点开头')
  const active = from === currentLib.value
  if (active && (store.isDirty || store.saving) && !(await store.save())) {
    throw new Error(store.error || '保存失败，未改名知识库')
  }
  libPanel.busy = from
  try {
    const data=await store.renameLibrary(from,to)
    libPanel.libs=data.libs||[]
    if(active)currentLib.value=to
    applyCurrentLib()
  } finally {
    libPanel.busy = ''
  }
}

/** 提交改名：服务端重命名文件夹，并把分享状态与图标表一起搬走 */
async function commitRename(lib) {
  const to = String(renameText.value || '').trim()
  const from = lib.name
  if (renaming.value !== from) return
  renaming.value = ''
  if (!to || to === from) return
  try {
    await renameLib(from, to)
  } catch (e) {
    window.alert(String(e.message || e))
  }
}

/** 标题第一行改库名，第二行保存为该库的副标题。 */
async function onBrandEdited(i, value) {
  const v = String(value || '').trim()
  if (i === 1) {
    if (!currentLib.value) return
    try {
      const res = await fetch(API_BASE + '/api/lib/meta', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentLib.value, sub: v })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || '副标题保存失败')
      libPanel.libs = data.data.libs || []
      applyCurrentLib()
    } catch (e) {
      applyCurrentLib()
      window.alert(String(e.message || e))
    }
    return
  }
  if (i !== 0) return
  if (!v || v === currentLib.value) {
    brandLines.value[0] = currentLib.value
    return
  }
  try {
    await renameLib(currentLib.value, v)
  } catch (e) {
    brandLines.value[0] = currentLib.value
    window.alert(String(e.message || e))
  }
}

/** 换某个知识库的图标 */
const identityOpen=ref(false), agentSettings=ref(false), iconPicking=ref(false)
const libIconTarget = ref(null), libIconAnchor=ref(null)
function pickLibIcon(lib,event) { if(lib.locked)return;libIconAnchor.value=event?.currentTarget;libIconTarget.value=lib;iconPicking.value=true }
async function saveLibIcon(icon) {
  const res=await fetch(API_BASE+'/api/lib/meta',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:libIconTarget.value.name,icon})})
  const result=await res.json();if(!result.ok)throw new Error(result.error)
  libPanel.libs=result.data.libs||[];applyCurrentLib()
}

async function onPickLibIcon(e) {
  const file = e.target.files?.[0]
  const lib = libIconTarget.value
  e.target.value = ''
  if (!file || !lib) return
  const dataUrl = await readAsDataUrl(file)
  try {
    const res = await fetch(API_BASE + '/api/lib/meta', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: lib.name, icon: dataUrl })
    })
    const data = await res.json()
    if (data.ok) {
      libPanel.libs = data.data.libs || []
      applyCurrentLib()
    }
  } catch {
    /* 换不成就算了 */
  }
}

function readAsDataUrl(file) {
  return new Promise((resolve) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = () => resolve('')
    fr.readAsDataURL(file)
  })
}

/*
 * 删除知识库 = 把那个文件夹移到回收站（不真删）。
 * 一次操作就是几百个文件，所以确认框里把篇数写清楚。
 */
async function deleteLib(lib) {
  askLibDialog({
    title: '删除知识库《' + lib.name + '》',
    message: '它的 ' + (lib.docs || 0) + ' 篇文档会被移到回收站，可以再捞回来。',
    confirmText: '移到回收站',
    danger: true,
    onConfirm: () => { closeLibDialog(); doDeleteLib(lib) }
  })
}

async function doDeleteLib(lib) {
  libPanel.busy = lib.name
  try {
    if (lib.name === currentLib.value && (store.isDirty || store.saving) && !(await store.save())) {
      throw new Error(store.error || '保存失败，未删除知识库')
    }
    const res = await fetch(API_BASE + '/api/lib', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: lib.name })
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || '删除失败')
    libPanel.libs = data.data.libs || []
    /* 删的是当前库：换到第一个剩下的库 */
    if (lib.name === currentLib.value) {
      const first = libPanel.libs[0]
      if (first) await goLib(first)
    }
  } catch (e) {
    window.alert(String(e.message || e))
  } finally {
    libPanel.busy = ''
  }
}

/*
 * 面板不随"点别处"收起。
 *
 * 两栏各有各的开合：面板由它自己的收起按钮（和左上角那个提示）控制，
 * 侧边栏由它自己的收起按钮与拖宽控制。原先面板会在任何一次文档区点击时收掉，
 * 于是拖侧边栏宽度、点一下正文，面板也跟着没了 —— 看着就像两者联动。
 */
onMounted(() => {
  /*
   * 没指定 ?lib= 时选默认库。
   *
   * 顺序：先拉库列表，再等树到手 —— 因为旧链接要靠树才能认出"它想进哪个库"
   * （老链接是 /onlyread/笔试题/xxx，没有 ?lib=，而"笔试题"现在是
   *  Agent（设计方向）库里的东西）。树还没到就只能退回第一个库。
   */
  loadLibs().then(() => {
    if (currentLib.value) return
    const pick = () => {
      const byLegacy = store.legacyLib()
      const hit = libPanel.libs.find((l) => l.name === byLegacy)
      const lib = hit || libPanel.libs[0]
      if (!lib) return
      currentLib.value = lib.name
      applyCurrentLib()
      const url = new URL(location.href)
      url.searchParams.set('lib', lib.name)
      history.replaceState(null, '', url.toString())
      /*
       * 补上 lib 之后必须重新拉树。
       *
       * 最初那次 /api/tree 是不带 lib 拉的（进来时地址栏里还没有），拿到的是整棵树 ——
       * 于是 /onlyread 这种不带 lib 的地址会显示出根下的几个知识库目录，
       * 看着就像"知识库和它内部文件夹的关系乱了"。
       */
      store.switchLib()
    }
    if (store.allFiles.length) pick()
    else {
      const stop = watch(
        () => store.allFiles.length,
        (n) => { if (n) { stop(); pick() } }
      )
      /* 树迟迟不来也不能卡住：一秒后退回第一个库 */
      setTimeout(() => { stop(); if (!currentLib.value) pick() }, 1200)
    }
  })
})
/*
 * 自己换过的图标。
 *
 * 键名按实例分开：两个站点同域名、localStorage 共享 ——
 * 共用一个键的话，主站存了虎鲸，示例库也会读出来那只虎鲸，把示例库自己的图标压掉。
 * 键名与品牌一样用构建时注入，不依赖运行时环境变量。
 */
const LOGO_STORE = String(import.meta.env.VITE_LOGO_KEY || 'reader.logo')
const customLogo = ref(localStorage.getItem(LOGO_STORE) || '')
/*
 * 图标的优先级：自己换过的 > 服务端按实例给的 > 站内默认。
 * 绝对路径：深链（/edit/某目录/某文档）之后，'./favicon.svg' 会被解析到那一层去，图就裂了。
 */
/*
 * 站内默认图标。
 *
 * 必须按实例给站点路径，不能写 '/favicon.svg' —— 那是站点根路径，
 * 主站在 /deepseek/reader/、示例库在 /deepseek/demo/，
 * 根路径那个图标不属于它们，示例库会因此显示出一张裂图。
 * 同时它要是绝对路径：深链（/edit/某目录/某文档）之后相对路径会被解析到那一层去。
 */
const siteIcon = '__SITE_ICON__'
/*
 * 图标也只有一个真源：当前知识库的 icon 字段（注册表里）。
 * customLogo 是"这个实例自己的图标"，没有库图标时兜底。
 */
const logo = computed(
  () => currentLibIcon.value || customLogo.value || import.meta.env.VITE_LOGO || siteIcon
)
watch(logo, setFavicon, {immediate:true})

/** 顶层目录：收起态那一列图标用 */
const topFolders = computed(() => props.nodes.filter((n) => n.type === 'folder'))

function folderHasCurrent(folder) {
  if (!props.currentPath) return false
  const walk = (n) => (n.type === 'doc' ? n.file === props.currentPath : (n.children || []).some(walk))
  return (folder.children || []).some(walk)
}

/* ---------- 拖拽：把文档挪进某个目录 ---------- */

/**
 * 拖拽状态住在这里，递归的 DocTree 用 inject 直接读写。
 * 落点是目录（拖到某一行上就落在它所在的那个目录），根目录 = 空白处。
 */
/**
 * 树里的拖拽、改名、菜单状态。
 *
 * 拖拽只有一套：**每个层级、每个位置都能放**。
 *   - 落在行的中间带（目录行才有）= 挪进那个目录
 *   - 落在行的上下边 = 插到这个位置（同层排序；跨层就是先挪过去再排）
 * 文档和目录用同一套手势，文档用文件路径、目录用目录路径，靠 kind 区分。
 */
const tree = reactive({
  /** 正在拖的条目：{ kind: 'doc'|'folder', path, parent, key }，空表示没在拖 */
  drag: null,
  /** 落进某个目录 */
  dropInto: null,
  /** 插到某一层的某个位置：{ parent, index } */
  dropAt: null,
  /** 原位改名：{ kind: 'doc'|'cat', node, value }，为空表示没有在改名 */
  edit: null,
  /** …菜单：浮在 body 上，不被侧栏的滚动裁掉 */
  menu: { open: false, kind: '', node: null, style: {} },

  /* ---------- 拖拽 ---------- */

  entryOf(node) {
    return node.type === 'folder' ? node.name : node.file.slice(node.file.lastIndexOf('/') + 1)
  },
  parentOfNode(node) {
    if (node.type === 'folder') {
      const i = node.path.lastIndexOf('/')
      return i < 0 ? '' : node.path.slice(0, i)
    }
    const i = node.file.lastIndexOf('/')
    return i < 0 ? '' : node.file.slice(0, i)
  },
  start(node, e) {
    if (!store.canEdit(node)) return
    this.drag = {
      kind: node.type === 'folder' ? 'folder' : 'doc',
      path: node.type === 'folder' ? node.path : node.file,
      parent: this.parentOfNode(node),
      key: this.entryOf(node)
    }
    this.dropInto = null
    this.dropAt = null
    e.dataTransfer.effectAllowed = 'move'
    // Firefox 不设 data 就不触发拖拽
    e.dataTransfer.setData('text/plain', this.drag.path)
  },
  /** 悬停在某一行上：中间带进目录，上下边插位置 */
  overRow(node, e) {
    if (!this.drag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const r = e.currentTarget.getBoundingClientRect()
    const y = (e.clientY - r.top) / r.height
    if (node.type === 'folder' && y > 0.3 && y < 0.7) {
      if (this.drag.path === node.path) return
      this.dropInto = node.path
      this.dropAt = null
      return
    }
    this.dropInto = null
    const parent = this.parentOfNode(node)
    if (parent !== this.drag.parent && node.type === 'folder' && node.path === this.drag.path) return
    // 插到这一行前面还是后面，看鼠标在行的上半还是下半
    const list = entriesOf(parent)
    const key = this.entryOf(node)
    const i = list.indexOf(key)
    if (i < 0) return
    this.dropAt = { parent, index: i + (y > 0.5 ? 1 : 0) }
  },
  /** 落在空白处：挪到当前知识库根目录末尾。 */
  overRoot(e) {
    if (!this.drag || e.defaultPrevented) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    this.dropInto = currentLib.value || ''
    this.dropAt = null
  },
  async drop() {
    if (!this.drag) return
    const d = this.drag
    const into = this.dropInto
    const at = this.dropAt
    this.end()
    if (!d) return
    const visibleMode = sortMode.value
    // 拖过就切手动排序，否则列表会按按名称立刻重排，白拖
    sortMode.value = 'manual'
    try {
      if (into !== null && into !== undefined) {
        if (into === d.parent) return
        if (d.kind === 'doc') await store.moveDoc(d.path, into)
        else await store.moveCategory(d.path, into)
        return
      }
      if (!at) return
      let path = d.path
      // 跨层插入：先挪进那一层，再排序
      if (at.parent !== d.parent) {
        if (d.kind === 'doc') {
          if (into === null && at.parent === d.parent) return
          path = (await store.moveDoc(d.path, at.parent)).file
        } else {
          path = (await store.moveCategory(d.path, at.parent)).path
        }
      }
      const key = path.slice(path.lastIndexOf('/') + 1)
      const names = entriesOf(at.parent, visibleMode)
      const from = names.indexOf(key)
      if (from < 0) return
      names.splice(from, 1)
      let to = at.index
      if (from < to) to--
      to = Math.max(0, Math.min(to, names.length))
      names.splice(to, 0, key)
      await store.reorderEntries(at.parent, names)
    } catch (e) {
      store.error = String(e.message || e)
    }
  },
  end() {
    this.drag = null
    this.dropInto = null
    this.dropAt = null
  },

  /* ---------- 原位改名 ---------- */

  editStart(kind, node) {
    if (!store.canEdit(node)) return
    this.edit = { kind, node, value: node.name }
  },
  editCancel() {
    this.edit = null
  },
  /** 提交改名：先清状态再比对，回车紧跟着的 blur 不会重复提交一次 */
  async editCommit() {
    const e = this.edit
    if (!e) return
    this.edit = null
    const next = String(e.value || '').trim()
    if (!next || next === e.node.name) return
    try {
      if (e.kind === 'doc') await store.renameDoc(e.node.file, next)
      else await store.renameCategory(e.node.path, next)
    } catch (err) {
      store.error = String(err.message || err)
    }
  },

  /* ---------- …菜单 ---------- */

  openMenu(kind, node, ev) {
    const r = ev.currentTarget.getBoundingClientRect()
    const w = 148
    this.menu = {
      open: true,
      kind,
      node,
      style: {
        width: w + 'px',
        left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px',
        top: r.bottom + 4 + 'px'
      }
    }
    /*
     * 关闭条件：点了菜单外面，或者按了 Esc。
     *
     * 以前是"下一次点击就关，不管点在哪" —— 那样在文档区随便点一下，
     * 甚至点右侧的目录栏、顶栏，菜单都会被收掉，像是被别处的操作打断。
     * 现在只在点到菜单范围之外时才关；点到菜单自己是走菜单项的动作。
     */
    const close = () => this.closeMenu()
    this.onKey = (e) => { if (e.key === 'Escape') close() }
    this.onClick = (e) => {
      const el = document.querySelector('.tree-menu')
      if (el && el.contains(e.target)) return
      close()
    }
    document.addEventListener('keydown', this.onKey)
    setTimeout(() => document.addEventListener('click', this.onClick), 0)
  },
  closeMenu() {
    if (!this.menu.open) return
    this.menu.open = false
    document.removeEventListener('keydown', this.onKey)
    if (this.onClick) {
      document.removeEventListener('click', this.onClick)
      this.onClick = null
    }
  }
})
provide('tree', tree)

/** 菜单里列什么：目录多两项新建 */
/** 改分享状态：失败了把错误显示出来（store.error 会在主区顶上提示） */
async function guardShare(fn) {
  try {
    await fn()
  } catch (e) {
    store.error = String(e.message || e)
  }
}

const menuItems = computed(() => {
  if (!tree.menu.open) return []
  const node = tree.menu.node
  const kind = tree.menu.kind
  const path = node?.path || node?.file
  const inherited = node?.lockedAt && node.lockedAt !== path
  const items = [
    { id: 'access-lock', label: inherited ? '解锁上级：' + node.lockedAt : node?.locked ? '解锁' : '锁定', icon: node?.locked ? PhLockOpen : PhLock, disabled: false },
    { id: 'access-share', label: node?.shared === false ? '对外展示' : '不对外展示', icon: node?.shared === false ? PhEye : PhEyeSlash }
  ]
  if (!store.canEdit(node)) return items
  if (kind === 'lib') {
    if (!isGuest.value) items.push({ id:'lib-icon',label:'更换图标',icon:PhImage },{ id:'lib-rename',label:'重命名',icon:PhPencilSimple },{ id:'lib-delete',label:'删除知识库',icon:PhTrash,danger:true })
  } else {
    if (kind === 'folder') items.push({id:'new-doc',label:'新建文档',icon:PhFilePlus},{id:'new-folder',label:'新建目录',icon:PhFolderSimplePlus})
    items.push({id:'rename',label:'重命名',icon:PhPencilSimple},{id:'delete',label:kind==='folder'?'删除目录':'删除',icon:PhTrash,danger:true})
  }
  return items
})

async function goEntry() {
  if ((store.isDirty || store.saving) && !(await store.save())) return
  location.assign(API_BASE + '/')
}

function onMenuPick(item) {
  const kind = tree.menu.kind
  const node = tree.menu.node
  tree.closeMenu()
  if (!node || item.disabled) return
  if (item.id.startsWith('access-')) {
    store.requestAccess(item.id === 'access-lock' && node.lockedAt ? node.lockedAt : (node.path || node.file), item.id === 'access-lock' ? { locked: !node.locked } : { shared: node.shared === false }, item.label)
    return
  }
  /* 知识库那几个动作：名字就是文件夹名，所以改名 = 重命名文件夹 */
  if (kind === 'lib') {
    const lib = { name: node.name, path: node.path, docs: node.docs, shared: node.shared }
    if (item.id === 'lib-icon') pickLibIcon(lib)
    else if (item.id === 'lib-rename') startRename(lib)
    else if (item.id === 'lib-delete') deleteLib(lib)
    return
  }
  if (item.id === 'new-doc') emit('create-doc', node.path)
  else if (item.id === 'new-folder') emit('create-category', node.path)
  // 菜单里用 folder/file 区分，改名状态里用 cat/doc（跟输入框的判断一致）
  else if (item.id === 'rename') tree.editStart(kind === 'folder' ? 'cat' : 'doc', node)
  else if (item.id === 'delete') emit(kind === 'folder' ? 'delete-category' : 'delete-doc', node)
}

/** 用用户眼前的顺序算拖拽落点；不然名称/时间视图下会落到另一行。 */
function entriesOf(parent, mode = sortMode.value) {
  let nodes = [...(nodesOf(parent) || [])]
  if (mode !== 'manual' || groupMode.value === 'flat') {
    const files = nodes.filter((n) => n.type !== 'folder')
    const folders = nodes.filter((n) => n.type === 'folder')
    if (mode === 'recent') files.sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
    else if (mode === 'name') files.sort((a, b) => byName(a, b))
    if (mode !== 'manual') folders.sort((a, b) => byName(a, b))
    nodes = [...files, ...folders]
  }
  return nodes.map((n) => (n.type === 'folder' ? n.name : n.file.slice(n.file.lastIndexOf('/') + 1)))
}

/** 从子节点列表里找一个目录，给拖拽算顺序用 */
function parentOf(p) {
  const i = String(p).lastIndexOf('/')
  return i < 0 ? '' : p.slice(0, i)
}

function nodesOf(parent) {
  let list = props.nodes
  const root = currentLib.value || ''
  if (!parent || parent === root) return list
  const relative = root && String(parent).startsWith(root + '/')
    ? String(parent).slice(root.length + 1)
    : String(parent)
  for (const seg of relative.split('/')) {
    const hit = (list || []).find((n) => n.type === 'folder' && n.name === seg)
    if (!hit) return []
    list = hit.children
  }
  return list
}


const GROUPS = [
  { id: 'tree', label: '按目录', icon: PhFolderSimple },
  { id: 'flat', label: '单列表', icon: PhListDashes }
]
const SORTS = [
  { id: 'manual', label: '手动排序', icon: PhHandGrabbing },
  { id: 'name', label: '按名称', icon: PhSortAscending },
  { id: 'recent', label: '最近更新', icon: PhClockCounterClockwise }
]

const LS = { group: 'reader.group', sort: 'reader.sort', cats: 'reader.cats' }

const groupMode = ref(localStorage.getItem(LS.group) === 'flat' ? 'flat' : 'tree')
// 默认手动：没拖过时它就是接口给的顺序（文档在前、目录在后，各自按名字）
const sortMode = ref(localStorage.getItem(LS.sort) || 'manual')
/**
 * 目录收起状态。
 *
 * 没有存过偏好（第一次用，或者清了 localStorage）时，把目录都收起来，
 * 只展开当前这篇所在的那条路径 —— 存档下面是三层、十几篇文档，
 * 全展开会把侧栏撑得很长，想找的东西反而看不见。
 */
const storedCats = localStorage.getItem(LS.cats)
const collapsedCats = ref(new Set(storedCats ? JSON.parse(storedCats) : []))
let catsInitialized = !!storedCats
watch(
  () => props.nodes,
  (nodes) => {
    if (catsInitialized || !nodes.length) return
    catsInitialized = true
    const keep = new Set()
    if (props.currentPath) {
      const parts = props.currentPath.split('/')
      for (let i = 1; i < parts.length; i++) keep.add(parts.slice(0, i).join('/'))
    }
    const next = new Set()
    const walk = (list) => {
      for (const n of list) {
        if (n.type !== 'folder') continue
        if (!keep.has(n.path)) next.add(n.path)
        walk(n.children || [])
      }
    }
    walk(nodes)
    collapsedCats.value = next
  },
  { immediate: true }
)

/*
 * 换库后重置折叠状态 —— 但必须等**新库的树到手**再重置。
 *
 * 这里踩过一次：libEpoch 一变就重置，而那一刻 props.nodes 还是旧库的树，
 * 于是拿旧路径建了折叠集合；等新树到了，里面一个路径都对不上，
 * 表现就是"一换库（或一改代码）所有文件夹全展开"。
 *
 * 所以只先记一个待办，等树真的换了（且内容确实不同）再按新树重置。
 */
let libJustSwitched = false
watch(
  () => store.libEpoch,
  () => { libJustSwitched = true }
)
watch(
  () => props.nodes,
  (nodes) => {
    if (!libJustSwitched || !nodes.length) return
    libJustSwitched = false
    collapseAll(nodes)
  }
)

/** 把这棵树里的目录全部收起 */
function collapseAll(nodes) {
  const next = new Set()
  const walk = (list) => {
    for (const n of list) {
      if (n.type !== 'folder') continue
      next.add(n.path)
      walk(n.children || [])
    }
  }
  walk(nodes)
  collapsedCats.value = next
  catsInitialized = true
}

const menuOpen = ref(false)
const searchOpen = ref(false)
const query = ref('')
const searchEl = ref(null)

watch([groupMode, sortMode], () => {
  localStorage.setItem(LS.group, groupMode.value)
  localStorage.setItem(LS.sort, sortMode.value)
})
watch(
  collapsedCats,
  (v) => localStorage.setItem(LS.cats, JSON.stringify([...v])),
  { deep: true }
)

function toggleCat(name) {
  const next = new Set(collapsedCats.value)
  next.has(name) ? next.delete(name) : next.add(name)
  collapsedCats.value = next
}
function isCollapsed(name) {
  return collapsedCats.value.has(name)
}
function expandTo(name) {
  const next = new Set(collapsedCats.value)
  next.delete(name)
  collapsedCats.value = next
  emit('toggle-collapse')
}

/**
 * 重新扫描磁盘。
 *
 * 树本来就是每次扫盘生成的，所以在 app 外面改名、挪目录、新建、删除之后，
 * 点一下这个按钮（或者刷新页面）就一致了，不需要文件监听。
 * 当前这篇没改过的话顺便把正文也重新读一遍，外面改过内容也能看到。
 */
async function rescan() {
  try {
    if(!isGuest.value){
      const result=await (await fetch(API_BASE+'/api/reconcile')).json()
      if(!result.ok)throw Error(result.error)
      if(result.data.length){const move=result.data[0];askLibDialog({title:'确认外部改名',message:move.from+' → '+move.to+'。确认后会保留原来的权限、图标和历史。',confirmText:'保留设置并继续',onConfirm:async()=>{try{const out=await(await fetch(API_BASE+'/api/reconcile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(move)})).json();if(!out.ok)throw Error(out.error);closeLibDialog();await rescan()}catch(e){store.error=e.message;closeLibDialog()}}});return}
    }
    await store.loadTree()
    if (store.currentPath && !store.isDirty) await store.reload()
  } catch (e) {
    store.error = String(e.message || e)
  }
}

/* ---------- 拖拽调宽 ---------- */

function startResize(e) {

  const startX=e.clientX, startW=props.width
  resizePanel(e, ev => emit('update:width', Math.max(180,Math.min(420,startW + (ev.clientX-startX)))), () => {})
}

function setGroup(id) {
  groupMode.value = id
  menuOpen.value = false
}
function setSort(id) {
  sortMode.value = id
  menuOpen.value = false
}

async function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (searchOpen.value) {
    await nextTick()
    searchEl.value?.focus()
  } else {
    query.value = ''
  }
}
function closeSearch() {
  searchOpen.value = false
  query.value = ''
}
async function expandAndSearch() {
  emit('toggle-collapse')
  await nextTick()
  searchOpen.value = true
  await nextTick()
  searchEl.value?.focus()
}

/* ---------- 过滤与排序 ---------- */

/** 把嵌套的树摊平成文档列表（单列表视图用） */
function flatten(nodes, dir, out) {
  for (const n of nodes || []) {
    if (n.type === 'folder') flatten(n.children, n.path, out)
    else out.push({ ...n, dir })
  }
  return out
}

const byName = (a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })

const flatDocs = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = flatten(props.nodes, '', []).filter((d) => !q || d.name.toLowerCase().includes(q))
  if (sortMode.value === 'recent') list.sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
  else if (sortMode.value === 'name') list.sort(byName)
  return list
})

/** 有命中的文档数：搜索要看整棵树（含嵌套目录） */
function countMatches(nodes, q) {
  let n = 0
  for (const x of nodes || []) {
    if (x.type === 'doc') { if (!q || x.name.toLowerCase().includes(q)) n++ }
    else n += countMatches(x.children, q)
  }
  return n
}

const visibleCount = computed(() => {
  const q = query.value.trim().toLowerCase()
  return groupMode.value === 'tree' ? countMatches(props.nodes, q) : flatDocs.value.length
})

/* ---------- 相对时间 ---------- */

function relTime(ms) {
  if (!ms) return ''
  const diff = Date.now() - ms
  const min = 60000
  if (diff < min) return '刚刚'
  if (diff < 60 * min) return Math.floor(diff / min) + '分钟'
  if (diff < 24 * 60 * min) return Math.floor(diff / (60 * min)) + '小时'
  if (diff < 30 * 24 * 60 * min) return Math.floor(diff / (24 * 60 * min)) + '天'
  const d = new Date(ms)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/* ---------- 点外面关菜单 ---------- */

function onDocClick(e) {
  if (!e.target.closest('.side-menu, .icon-btn')) menuOpen.value = false
}
function onLibEscape(e) {
  if (e.key !== 'Escape' || !libPanel.open || !isMobileLibView()) return
  if (tree.menu.open) {
    tree.closeMenu()
    return
  }
  closeLibPanel()
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
onMounted(() => document.addEventListener('keydown', onLibEscape))
onBeforeUnmount(() => document.removeEventListener('keydown', onLibEscape))
</script>

<style scoped>
/* 遮罩只属于手机弹窗，桌面知识库栏仍按原布局工作。 */
.lib-modal-backdrop, .lib-title-mobile, .lib-close-mobile { display: none; }
.lib-backdrop-enter-active, .lib-backdrop-leave-active { transition: opacity 0.2s ease; }
.lib-backdrop-enter-from, .lib-backdrop-leave-to { opacity: 0; }
/* 知识库面板：参与布局的一列，规格与内部侧边栏逐项对齐 */
.lib-panel {
  position: relative;
  width: var(--lib-w, 236px);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--c-panel);
  border-right: 1px solid var(--c-line);
  overflow: hidden;
}
.lib-panel-enter-active, .lib-panel-leave-active {
  transition: width 0.22s ease, opacity 0.22s ease;
}
.lib-panel-enter-from, .lib-panel-leave-to {
  width: 0;
  opacity: 0;
}
/* 头部：与侧边栏品牌区同高同内边距，两栏并排时基线齐 */
.lib-panel-head {
  display: flex; align-items: center; justify-content: space-between;
  height: 52px;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--c-line);
}
.lib-panel-title { font-size: 12.5px; color: var(--c-sub); }
.lib-panel-head-acts { display: flex; align-items: center; gap: 2px; }
.lib-panel-list { flex: 1; overflow-y: auto; padding: 10px 8px; }
/* 拖拽条：贴在面板右缘，与文档栏那条一个做法 */
.lib-panel-resize {
  position: absolute;
  top: 0; bottom: 0; right: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 5;
}
/* 手机端是居中的知识库弹窗，列表在弹窗内部滚动。 */
@media (max-width: 820px) {
  .lib-modal-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 59;
    width: 100%;
    height: 100%;
    background: rgba(15, 20, 30, 0.42);
  }
  .lib-title-desktop, .lib-close-desktop { display: none; }
  .lib-title-mobile, .lib-close-mobile { display: inline; }
  .lib-panel {
    position: fixed;
    left: 50%;
    top: 50%;
    bottom: auto;
    z-index: 60;
    width: min(420px, calc(100vw - 32px));
    max-height: min(560px, 76dvh);
    transform: translate(-50%, -50%);
    border: 1px solid var(--c-line);
    border-radius: var(--radius-row);
    background: var(--c-pop);
    box-shadow: 0 18px 56px rgba(0, 0, 0, 0.22);
  }
  .lib-panel-enter-from, .lib-panel-leave-to {
    transform: translate(-50%, -46%) scale(0.97);
    opacity: 0;
  }
  .lib-panel-enter-active, .lib-panel-leave-active {
    transition: transform 0.2s ease, opacity 0.2s ease;
  }
  .lib-panel-resize { display: none; }
  .lib-panel-head { height: 56px; padding-inline: 18px 12px; }
  .lib-panel-title { font-size: 15px; color: var(--c-ink); }
  .lib-panel-list { padding: 8px; }
}

/* 相邻两行之间留一点缝：不然悬停高亮挨在一起，看着像连成一块 */
.lib-row + .lib-row { margin-top: 2px; }
.lib-row {
  display: flex; align-items: center; gap: 10px;
  min-height: 46px;
  padding: 8px 10px;
  border-radius: var(--radius-row);
  transition: background 0.15s ease;
}
.lib-row.is-dragging { opacity: 0.45; }
.lib-row:hover { background: var(--c-hover); }
.lib-row.is-current { background: var(--c-hover); }
/* 图标：与侧边栏的文档图标同尺寸（13px），行内不再单独占位 */
.lib-row-icon { width: 17px; height: 17px; flex-shrink: 0; object-fit: contain; }
.lib-row-name {
  flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start;
  text-align: left; padding: 0;
}
.lib-row-text {
  font-size: 12.5px; color: var(--c-ink); min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 篇数做成和侧边栏时间戳一样的浅色小字，靠右 */
.lib-row-meta { font-size: 11px; color: var(--c-faint); margin-top: 1px; }
/* 就地改名的输入框：同一行同一字号 */
.lib-row-input {
  flex: 1; min-width: 0;
  font-size: 12.5px;
  color: var(--c-ink);
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-control);
  padding: 2px 6px;
  outline: none;
}
.lib-row-input:focus { border-color: var(--c-line); }
/* 行内操作：19px，与侧边栏的 .icon-btn.xs 一致；悬停才出现 */
.lib-row-act {
  flex-shrink: 0; width: 19px; height: 19px; border-radius: var(--radius-control);
  display: flex; align-items: center; justify-content: center;
  color: var(--c-faint); opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
}
/*
 * 面板行的操作按钮显隐。
 *
 * .acts-btn 自带的规则只认 .cat-row / .doc-row（见 style.css），
 * 面板的行是 .lib-row，不在那两个选择器里 —— 按钮会一直停在 opacity:0，
 * 看着就是"知识库里没有三个点"。这里补上自己那一条。
 */
.lib-row:hover .acts-btn,
.lib-row:focus-within .acts-btn { opacity: 1; }
.lib-row-act:hover { background: var(--c-line); color: var(--c-ink); }
/* 左上角展开知识库的提示 */
/*
 * 标题两行：第一行是主标题，第二行是副标题。
 * 副标题只是略小一点、颜色淡一点 —— 拉得太小会像注脚，反而看不出是同一组。
 * 主标题不加粗：这里本身已经是标题位，再加粗整块就太重了。
 */
.brand-line.is-title { font-size: 17px; }
.brand-line.is-sub { font-size: 14.5px; color: var(--c-sub); }
.home-link {
  display: none;
}

.brand-line {
  font-size: 17px;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--c-ink);
  white-space: nowrap;
}
/* 品牌标题直接改：平时看着是标题，悬停给一点底色，聚焦才有描边 */
.brand-input {
  display: block;
  width: 100%;
  padding: 1px 4px;
  margin-left: -4px;
  border-radius: var(--radius-control);
  background: transparent;
  border: 1px solid transparent;
  outline: none;
  transition: background 0.14s ease, border-color 0.14s ease;
}
.brand-input:hover {
  background: var(--c-hover);
}
.brand-input:focus {
  background: var(--c-field);
  border-color: var(--color-ds);
}

/* 图标：点一下换图 */
.brand-logo {
  width: 22px;
  height: 22px;
  margin-top: 3px;
  flex-shrink: 0;
  border-radius: var(--radius-control);
  overflow: hidden;
  transition: box-shadow 0.14s ease;
}
.brand-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.brand-logo:hover {
  box-shadow: 0 0 0 2px var(--c-active);
}
.brand-logo.sm {
  margin-top: 0;
}
.toolbar-label {
  font-size: 12px;
  color: var(--c-faint);
  padding-left: 6px;
  letter-spacing: 0.02em;
}


/* 新建文档使用填充底色区分状态，无描边。 */
.newdoc-btn { transition: transform .12s ease; }
.newdoc-btn:active {
  transform: scale(0.985);
}

.rail-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-control);
  color: var(--c-faint);
  transition: color 0.15s ease, background 0.15s ease, transform 0.12s ease;
}
.rail-btn:hover {
  color: var(--c-ink);
  background: var(--c-hover);
}
.rail-btn:active {
  transform: scale(0.92);
}
.rail-btn.is-on {
  color: var(--color-ds);
  background: var(--c-active);
}


/* 分组排序菜单 */
.side-menu {
  position: absolute;
  right: 0;
  top: 28px;
  z-index: 50;
  width: 148px;
  padding: 5px;
  background: var(--c-pop);
  border-radius: var(--radius-surface);
  box-shadow: var(--c-pop-shadow);
}
.side-menu-title {
  font-size: 10.5px;
  color: var(--c-faint);
  padding: 6px 8px 4px;
  letter-spacing: 0.04em;
}
.side-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 8px;
  border-radius: var(--radius-control);
  font-size: 12.5px;
  color: var(--c-text);
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
}
.side-menu-item:hover {
  background: var(--c-hover);
  color: var(--c-ink);
}
.side-menu-item.is-on {
  color: var(--color-ds);
}
.side-menu-sep {
  height: 1px;
  background: var(--c-line-soft);
  margin: 4px 0;
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>

<style scoped>
.is-reader-rail { background:transparent!important; border:0!important; overflow:visible!important; z-index:60 }
.reader-rail { width:44px; display:flex; align-items:center; flex-direction:column; padding-top:16px }
.manage-entry { margin:0 12px 10px; padding:8px 10px; display:flex; align-items:center; gap:8px; border:1px solid var(--c-line); border-radius:var(--radius-control); color:var(--c-sub); font-size:12px; text-align:left; cursor:pointer; background:var(--c-surface) }
.manage-entry:hover { background:var(--c-field); color:var(--c-text) }
.manage-entry:focus-visible { outline:2px solid var(--c-ink); outline-offset:2px }
.entry-chevron { margin-left:auto }
.tree-menu-item:disabled { opacity:.45; cursor:default }
</style>

<style scoped>
.workspace-footer{position:relative;flex-shrink:0;padding-top:8px;border-top:0}.workspace-footer .manage-entry{width:calc(100% - 24px);border:0;background:transparent;margin-bottom:12px}.workspace-footer .manage-entry span{flex:1}.identity-menu{position:absolute;bottom:60px;left:12px;right:12px;padding:6px;background:var(--c-pop);box-shadow:var(--c-pop-shadow);border:0;border-radius:var(--radius-surface);z-index:50}.identity-menu button{display:block;width:100%;padding:9px;text-align:left;font-size:12px;border-radius:var(--radius-control)}.identity-menu button:hover{background:var(--c-hover)}
</style>
<style scoped>.lib-icon-edit{display:grid;place-items:center;padding:5px;border-radius:var(--radius-control);margin-left:-5px}.lib-icon-edit:not(:disabled):hover{background:var(--c-hover)}.lib-icon-edit:disabled{cursor:default}.workspace-footer .manage-entry{gap:10px;padding:10px 8px}.workspace-footer .manage-entry:hover{background:var(--c-hover)}</style>
