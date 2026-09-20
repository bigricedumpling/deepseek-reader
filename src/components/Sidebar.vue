<template>
  <!--
    收起与展开是同一个 aside，宽度做过渡。
    原来是 v-if / v-else 两个 aside，切换时整个节点被替换，宽度是硬跳的，
    跟右边目录的 transition: width 也不一致。
  -->
  <aside
    class="h-screen flex flex-col flex-shrink-0 bg-[var(--c-panel)] border-r border-[var(--c-line)] select-none z-30 relative overflow-hidden transition-[width] duration-[220ms] ease-out"
    :style="{ width: (collapsed ? 52 : width) + 'px' }"
  >
    <!-- 收起态：只留一条窄栏 -->
    <div v-if="collapsed" class="flex flex-col items-center h-full w-[52px] py-4 gap-1.5 shrink-0">
      <button class="brand-logo sm" title="知识库 / 换图标" @click.stop="openKbMenu($event)">
        <img :src="logo" alt="" />
      </button>
      <button class="rail-btn mt-1.5" title="展开侧栏" @click="emit('toggle-collapse')">
        <PhSidebarSimple :size="17" />
      </button>
      <button v-if="!isGuest" class="rail-btn" title="在根目录新建文档" @click="emit('create-doc', '')">
        <PhPlus :size="17" />
      </button>
      <button class="rail-btn" title="检索" @click="expandAndSearch">
        <PhMagnifyingGlass :size="17" />
      </button>
      <div class="w-6 h-px bg-[var(--c-line)] my-2" />
      <button
        v-for="f in topFolders"
        :key="f.path"
        class="rail-btn"
        :class="{ 'is-on': folderHasCurrent(f) }"
        :title="f.name"
        @click="expandTo(f.path)"
      >
        <PhFolderSimple :size="17" :weight="folderHasCurrent(f) ? 'fill' : 'regular'" />
      </button>
      <div class="flex-1" />
      <button class="rail-btn" title="展开侧栏" @click="emit('toggle-collapse')">
        <PhCaretDoubleRight :size="15" />
      </button>
    </div>

    <!-- 展开态 -->
    <template v-else>
      <!--
        品牌：标题两行可以直接改，图标点一下换。
        图标缩到 96px 存成 data URL 放 localStorage——原图动辄几百 KB，
        整个塞进去会撑爆配额，而且侧栏里只显示 22px，没必要留原图。
      -->
      <div class="px-4 pt-5 pb-3 flex items-start gap-2.5 shrink-0">
        <button class="brand-logo" title="知识库 / 换图标" @click.stop="openKbMenu($event)">
          <img :src="logo" alt="" />
        </button>
        <input ref="logoInput" type="file" accept="image/*" class="hidden" @change="onPickLogo" />
        <div class="min-w-0 flex-1">
          <input
            v-for="(line, i) in brandLines"
            :key="i"
            v-model="brandLines[i]"
            class="brand-line brand-input"
            spellcheck="false"
            :title="'第 ' + (i + 1) + ' 行标题，可以直接改'"
            @keydown.enter.prevent="$event.target.blur()"
          />
        </div>
        <button class="icon-btn -mr-1" title="收起侧栏" @click="emit('toggle-collapse')">
          <PhSidebarSimple :size="16" />
        </button>
      </div>


    <!--
      logo 菜单：两级。
      第一级就两个选择（切换知识库 / 替换图标）；选"切换"之后面板就地翻到库列表，
      顶上给一个返回箭头 —— 一个面板两层内容，不用算第二个浮层的位置。
    -->
    <transition name="pop">
      <div v-if="kbMenu.open" class="kb-menu ui-font" :style="kbMenu.style" @click.stop>
        <!-- 两级内容之间也走一点过渡：换页时淡入 + 轻微横移 -->
        <transition name="kb-swap" mode="out-in">
          <div v-if="kbMenu.page === 'root'" key="root" class="kb-page">
            <button class="kb-item" @click="kbMenu.page = 'list'">
              <PhStack :size="14" class="kb-item-icon" />
              <span class="kb-item-name">切换知识库</span>
              <PhCaretRight :size="11" class="kb-item-arrow" />
            </button>
          <button class="kb-item" @click="pickLogo">
            <PhImage :size="14" class="kb-item-icon" />
            <span class="kb-item-name">替换图标</span>
          </button>
          </div>

          <div v-else key="list" class="kb-page">
            <button class="kb-back" @click="kbMenu.page = 'root'">
              <PhCaretLeft :size="12" />
              知识库
            </button>
            <button
              v-for="lib in kbMenu.libs"
              :key="lib.name"
              class="kb-item is-lib"
          :class="{ 'is-current': lib.current, 'is-soon': lib.soon }"
          :disabled="lib.current || lib.soon"
          @click="goLib(lib)"
        >
          <img class="kb-item-logo" :src="lib.icon || siteIcon" alt="" />
          <span class="kb-item-name">{{ lib.name }}</span>
          <PhCheck v-if="lib.current" :size="12" weight="bold" />
              <span v-else-if="lib.soon" class="kb-soon">待建</span>
            </button>
          </div>
        </transition>
      </div>
    </transition>

    <!-- 新建文档（新建目录在下面工具条那一排的文件夹按钮，不重复放） -->
    <div v-if="!isGuest" class="px-3 pt-2 pb-3">
      <button
        class="newdoc-btn w-full h-9 flex items-center justify-center gap-1.5 rounded-lg text-[13px] text-[var(--c-ink)]"
        title="在根目录新建文档"
        @click="emit('create-doc', '')"
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
          title="在当前列表里筛选"
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
        <button v-if="!isGuest" class="icon-btn" title="新建分类" @click="emit('create-category')">
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
          class="w-full h-7 px-2.5 rounded-md bg-[var(--c-field)] border border-[var(--c-line)] text-[12.5px] outline-none focus:border-[var(--color-ds)]/50 transition-colors"
          placeholder="筛选文档"
          @keydown.esc="closeSearch"
        />
      </div>
    </transition>

    <!-- 树里那个「…」的菜单：teleport 出去，免得被侧栏的滚动裁掉 -->
    <Teleport to="body">
      <div v-if="tree.menu.open" class="tree-menu" :style="tree.menu.style">
        <button
          v-for="it in menuItems"
          :key="it.id"
          class="tree-menu-item"
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
      @mousedown="startResize"
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
          @click="emit('select', doc.file)"
        >
          <button class="doc-title" :title="doc.file">
            <span class="truncate">{{ doc.name }}</span>
            <span v-if="doc.dir" class="doc-dir">{{ doc.dir }}</span>
          </button>
        </div>
        <p v-if="!visibleCount" class="text-[12px] text-[var(--c-faint)] px-3 py-3 text-center">
          {{ query ? '没有匹配的文档' : '还没有文档' }}
        </p>
      </template>

      </nav>
    </template>
  </aside>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, reactive, provide } from 'vue'
// 菜单里的图标：树的操作、分组与排序
import {
  PhSidebarSimple, PhPlus, PhMagnifyingGlass, PhSlidersHorizontal, PhFolderSimple,
  PhCaretDoubleRight, PhCheck, PhFolderSimplePlus, PhArrowClockwise,
  PhFilePlus, PhPencilSimple, PhTrash, PhListDashes, PhSortAscending, PhClockCounterClockwise,
  PhEye, PhEyeSlash, PhImage, PhStack, PhCaretLeft, PhCaretRight,
  PhHandGrabbing
} from '@phosphor-icons/vue'
import { useDocsStore } from '../stores/docs'
import DocTree from './DocTree.vue'
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

/*
 * 左上角的名字与图标 —— 从服务端读，不存 localStorage。
 *
 * 两个站点在同一域名下（/deepseek/reader/ 与 /deepseek/demo/），localStorage 按域名共享：
 * 前端一写回就互相串味，打开过示例库、主站的名字也被顶掉。
 * 而且以前写回用的键是写死的，注入的独立键根本读不到，
 * 所以「按实例分开键名」也解决不了。改成服务端按实例给：品牌从哪来由服务端决定，
 * 前端只负责显示；本地改只改当前这次会话，不落盘。
 */
/** 图标存成 data URL 放 localStorage，先缩到这个边长，配额才扛得住 */
const LOGO_SIZE = 96

/*
 * 品牌来自构建时注入的 VITE_BRAND（形如「第一行|第二行」），
 * 与 VITE_BASE 一个机制 —— 每个实例构建自己的那一份，不依赖运行时环境变量，
 * 也不经过 localStorage（同域名下两个站点共用一个存储，写回就会串味）。
 */
const brandLines = ref(
  String(import.meta.env.VITE_BRAND || '').split('|').filter(Boolean).length
    ? String(import.meta.env.VITE_BRAND).split('|')
    : ['Agent（设计方向）', '笔试题交付']
)

const logoInput = ref(null)

/* ---------- logo 菜单：切换知识库 / 替换图标 ---------- */

const kbMenu = reactive({ open: false, page: 'root', style: {}, libs: [] })

async function openKbMenu(e) {
  if (kbMenu.open) {
    kbMenu.open = false
    return
  }
  const r = e.currentTarget.getBoundingClientRect()
  kbMenu.style = { left: Math.round(r.left) + 'px', top: Math.round(r.bottom + 6) + 'px' }
  kbMenu.page = 'root'
  kbMenu.libs = []
  kbMenu.open = true
  try {
    const res = await fetch(API_BASE + '/kb.json', { cache: 'no-store' })
    const data = await res.json()
    kbMenu.libs = (Array.isArray(data?.libs) ? data.libs : []).filter((l) => l && l.href)
  } catch {
    /* 读不到就只显示"替换图标" */
  }
}

function goLib(lib) {
  if (!lib || lib.current) return
  kbMenu.open = false
  location.href = lib.href
}

function pickLogo() {
  kbMenu.open = false
  logoInput?.click()
}

/* 点别处关掉 */
function onDocClickClose() {
  kbMenu.open = false
}
onMounted(() => document.addEventListener('click', onDocClickClose))
onBeforeUnmount(() => document.removeEventListener('click', onDocClickClose))
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
const siteIcon = import.meta.env.VITE_SITE_ICON || '/favicon.svg'
const logo = computed(() => customLogo.value || import.meta.env.VITE_LOGO || siteIcon)

/**
 * 换图标。
 *
 * 先等比缩到 96px 再转 data URL：用户随手丢进来的图可能几 MB，
 * 直接存 localStorage 会超配额而且拖慢每次读写；侧栏里只显示 22px，留原图没意义。
 */
function onPickLogo(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, LOGO_SIZE / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      cv.getContext('2d').drawImage(img, 0, 0, w, h)
      try {
        customLogo.value = cv.toDataURL('image/png')
        localStorage.setItem(LOGO_STORE, customLogo.value)
      } catch {
        /* 存不下就只当次生效，不打断 */
        customLogo.value = String(reader.result)
      }
    }
    img.src = String(reader.result)
  }
  reader.readAsDataURL(file)
}

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
  /** 「…」菜单：浮在 body 上，不被侧栏的滚动裁掉 */
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
  /** 落在空白处：挪到根目录末尾 */
  overRoot(e) {
    if (!this.drag || e.defaultPrevented) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    this.dropInto = ''
    this.dropAt = null
  },
  async drop() {
    const d = this.drag
    const into = this.dropInto
    const at = this.dropAt
    this.end()
    if (!d) return
    // 拖过就切手动排序，否则列表会按「按名称」立刻重排，白拖
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
      const names = entriesOf(at.parent)
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

  /* ---------- 「…」菜单 ---------- */

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
    const close = () => this.closeMenu()
    this.onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', this.onKey)
    // 下一次点击（不管点在哪）就关掉；菜单项自己的点击会先跑完动作
    setTimeout(() => document.addEventListener('click', close, { once: true }), 0)
  },
  closeMenu() {
    if (!this.menu.open) return
    this.menu.open = false
    document.removeEventListener('keydown', this.onKey)
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
  const items = []
  if (tree.menu.kind === 'folder') {
    items.push({ id: 'new-doc', label: '新建文档', icon: PhFilePlus }, { id: 'new-folder', label: '新建目录', icon: PhFolderSimplePlus })
  }
  items.push({ id: 'rename', label: '重命名', icon: PhPencilSimple })
  // 对外可见性：默认整库都能看，这里只负责把个别标成"不分享"
  const path = tree.menu.kind === 'folder' ? node?.path : node?.file
  const priv = path && store.shareInfo.shared?.[path] === false
  items.push({
    id: 'share',
    label: priv ? '恢复对外分享' : '不对外分享',
    icon: priv ? PhEye : PhEyeSlash
  })
  items.push({ id: 'delete', label: tree.menu.kind === 'folder' ? '删除目录' : '删除', icon: PhTrash, danger: true })
  return items
})

function onMenuPick(item) {
  const kind = tree.menu.kind
  const node = tree.menu.node
  tree.closeMenu()
  if (!node) return
  if (item.id === 'share') {
    const path = kind === 'folder' ? node.path : node.file
    const priv = store.shareInfo.shared?.[path] === false
    guardShare(() => store.setShared(path, priv))
    return
  }
  if (item.id === 'new-doc') emit('create-doc', node.path)
  else if (item.id === 'new-folder') emit('create-category', node.path)
  // 菜单里用 folder/file 区分，改名状态里用 cat/doc（跟输入框的判断一致）
  else if (item.id === 'rename') tree.editStart(kind === 'folder' ? 'cat' : 'doc', node)
  else if (item.id === 'delete') emit(kind === 'folder' ? 'delete-category' : 'delete-doc', node)
}

/** 某一层现在是哪些条目（名字列表，目录名 / 带扩展名的文件名），顺序就是服务端给的顺序 */
function entriesOf(parent) {
  return (nodesOf(parent) || []).map((n) => (n.type === 'folder' ? n.name : n.file.slice(n.file.lastIndexOf('/') + 1)))
}

/** 从子节点列表里找一个目录，给拖拽算顺序用 */
function parentOf(p) {
  const i = String(p).lastIndexOf('/')
  return i < 0 ? '' : p.slice(0, i)
}

function nodesOf(parent) {
  let list = props.nodes
  if (!parent) return list
  for (const seg of String(parent).split('/')) {
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
    await store.loadTree()
    if (store.currentPath && !store.isDirty) await store.reload()
  } catch (e) {
    store.error = String(e.message || e)
  }
}

/* ---------- 拖拽调宽 ---------- */

function startResize(e) {
  e.preventDefault()
  const startX = e.clientX
  const startW = props.width
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  function onMove(ev) {
    emit('update:width', Math.max(180, Math.min(420, startW + (ev.clientX - startX))))
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
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
  else list.sort(byName)
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
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<style scoped>
/* logo 菜单：两级面板，跟应用其他浮层一套质感 */
/* 两级之间：淡入 + 轻微横移，方向跟着"前进/后退" */
.kb-swap-enter-active,
.kb-swap-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}
.kb-swap-enter-from {
  opacity: 0;
  transform: translateX(6px);
}
.kb-swap-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}

.kb-menu {
  position: fixed;
  z-index: 90;
  min-width: 196px;
  padding: 5px;
  background: var(--c-pop);
  border: 1px solid var(--c-line);
  border-radius: 10px;
  box-shadow: var(--c-pop-shadow);
}
.kb-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 8px;
  border-radius: 7px;
  font-size: 12.5px;
  color: var(--c-sub);
  text-align: left;
  transition: background 0.15s ease, color 0.15s ease;
}
.kb-item:hover:not(:disabled) {
  background: var(--c-hover);
  color: var(--c-ink);
}
.kb-item:disabled {
  cursor: default;
}
.kb-item-icon {
  color: var(--c-faint);
  flex-shrink: 0;
}
.kb-item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kb-item-arrow {
  color: var(--c-faint);
}
.kb-item.is-current {
  color: var(--c-ink);
}
.kb-item.is-soon {
  color: var(--c-faint);
}
.kb-soon {
  font-size: 10.5px;
  color: var(--c-faint);
}
.kb-back {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 5px 8px 7px;
  font-size: 11.5px;
  color: var(--c-faint);
}
.kb-back:hover {
  color: var(--c-ink);
}
.kb-item-logo {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  flex-shrink: 0;
}

.kb-menu-sep {
  display: none;
}
.kb-menu-title,
.kb-menu-empty {
  display: none;
}
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
  border-radius: 5px;
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
  border-radius: 6px;
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


/* 新建文档：在面板底上要看得见，靠一圈描边和一点投影浮起来 */
.newdoc-btn {
  background: var(--c-pop);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05), 0 0 0 1px var(--c-line);
  transition: box-shadow 0.16s ease, transform 0.12s ease;
}
.newdoc-btn:hover {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.09), 0 0 0 1px var(--c-line);
}
.newdoc-btn:active {
  transform: scale(0.985);
}

.rail-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
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
  border-radius: 10px;
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
  border-radius: 6px;
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
