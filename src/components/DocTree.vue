<template>
  <div>
    <template v-for="node in view" :key="node.type + ':' + (node.file || node.path)">
      <!-- 目录：递归渲染，层级就是磁盘上的目录层级 -->
      <div v-if="node.type === 'folder'" class="tree-folder">
        <div v-if="showLineBefore(node)" class="drop-line" />
        <div
          class="cat-row group/cat"
          @contextmenu="contextRow($event,'folder',node)"
          :class="{ 'is-drop': tree.dropInto === node.path, 'is-on': containsCurrent(node), 'is-parent': isCurrentParent(node), 'is-dragging': isDragging(node), 'is-batch-selected': batch.checked(node), 'is-editing': isEditing('cat', node) }"
          :data-level="depth"
          :data-path="node.path"
          :style="{ paddingLeft: 8 + depth * 11 + 'px' }"
          :draggable="!batch.mode && store.canEdit(node)"
          @click="batch.mode ? batch.toggle(node) : emit('toggle', node.path)"
          @dragstart="tree.start(node, $event)"
          @dragover="tree.overRow(node, $event)"
          @drop.prevent="tree.drop()"
          @dragend="tree.end()"
        >
          <button v-if="batch.mode" class="batch-check" role="checkbox" :aria-label="'选择' + node.name" :aria-checked="batch.checked(node)" :disabled="!batch.canToggle(node)" @click.stop="batch.toggle(node)"><PhCheck v-if="batch.checked(node)" :size="11" weight="bold" /></button>
          <span class="w-3.5 shrink-0 flex items-center justify-center text-[var(--c-sub)]" @click.stop="emit('toggle', node.path)">
            <PhCaretRight :size="11" class="tree-caret" :class="{ 'is-open': !isCollapsed(node.path) }" />
          </span>
          <PhFolderSimple
            :size="14"
            class="cat-icon ml-1 shrink-0 text-[var(--c-sub)]"
            :class="{ 'is-current': isCurrentParent(node) }"
            :weight="containsCurrent(node) ? 'fill' : 'regular'"
          />
          <input
            v-if="isEditing('cat', node)"
            ref="editEl"
            v-model="tree.edit.value"
            class="cat-edit"
            @click.stop
            @keydown.enter.prevent="tree.editCommit()"
            @keydown.esc.prevent="tree.editCancel()"
            @blur="tree.editCommit()"
          />
          <span v-else class="cat-name ml-2 text-[12.5px] text-[var(--c-sub)] truncate" :title="store.isGuest ? node.name + '（' + (store.canEdit(node) ? '可编辑' : '只读') + '）' : node.name" :draggable="store.canEdit(node)">{{ node.name }}</span>
          <span class="row-acts">
            <button
              v-if="!store.isGuest && !batch.mode && store.canEdit(node)"
              class="icon-btn xs row-create-btn"
              title="在此文件夹中新建文档"
              aria-label="在此文件夹中新建文档"
              @click.stop="tree.startCreate('doc', node.path)"
            >
              <PhPlus :size="14" />
            </button>
            <button
              v-if="!store.isGuest && !batch.mode && store.canEdit(node)"
              class="icon-btn xs row-create-btn"
              title="在此文件夹中新建子文件夹"
              aria-label="在此文件夹中新建子文件夹"
              @click.stop="tree.startCreate('folder', node.path)"
            >
              <PhFolderSimplePlus :size="14" />
            </button>
            <button
              v-if="canReveal && !batch.mode"
              class="icon-btn xs row-finder"
              :title="fileManagerLabel(true)"
              :aria-label="fileManagerLabel(true)"
              @click.stop="revealNode(node.path)"
            >
              <PhFolderSimple :size="14" />
            </button>
            <button
              v-if="!store.isGuest && !batch.mode"
              class="icon-btn xs acts-btn"
              title="更多操作"
              @click.stop="tree.openMenu('folder', node, $event)"
            >
              <PhDotsThree :size="16" weight="bold" />
            </button>
          </span>
        </div>

        <div class="tree-children" :class="{ 'is-collapsed': isCollapsed(node.path) && !query }">
          <div class="tree-children-inner">
            <div v-if="tree.create && tree.create.parent === node.path" class="tree-create-row" :style="{ paddingLeft: 28 + depth * 11 + 'px' }">
              <component :is="tree.create.kind === 'doc' ? PhFilePlus : PhFolderSimplePlus" :size="14" />
              <input v-model="tree.create.value" class="tree-create-input" :placeholder="tree.create.kind === 'doc' ? '文档名称' : '文件夹名称'" @keydown.enter.prevent="tree.createCommit()" @keydown.esc.prevent="tree.createCancel()" @blur="tree.createCommit()" />
            </div>
            <DocTree
              :nodes="node.children"
              :current-path="currentPath"
              :collapsed="collapsed"
              :query="query"
              :sort-mode="sortMode"
              :depth="depth + 1"
              :parent="node.path"
              @select="emit('select', $event)"
              @delete-doc="emit('delete-doc', $event)"
              @delete-category="emit('delete-category', $event)"
              @toggle="emit('toggle', $event)"
            />
            <p
              v-if="!node.children.length"
              class="text-[12px] text-[var(--c-faint)] py-2"
              :style="{ paddingLeft: 22 + depth * 11 + 'px' }"
            >
              空目录
            </p>
          </div>
        </div>
      </div>

      <!-- 文档 / PDF：名字就是文件名，正文里怎么写标题都不影响这里 -->
      <template v-else>
      <div v-if="showLineBefore(node)" class="drop-line" />
      <div
        class="doc-row group/doc"
        @contextmenu="contextRow($event,'file',node)"
        :class="{ 'is-on': node.file === currentPath, 'is-dragging': isDragging(node), 'is-pdf': node.type === 'pdf', 'is-batch-selected': batch.checked(node) }"
        :data-level="depth"
        :data-file="node.file"
        :style="{ paddingLeft: 26 + depth * 11 + 'px' }"
        :draggable="!batch.mode && store.canEdit(node)"
        @dragstart="tree.start(node, $event)"
        @dragover="tree.overRow(node, $event)"
        @drop.prevent="tree.drop()"
        @dragend="tree.end()"
      >
        <button v-if="batch.mode" class="batch-check" role="checkbox" :aria-label="'选择' + node.name" :aria-checked="batch.checked(node)" :disabled="!batch.canToggle(node)" @click.stop="batch.toggle(node)"><PhCheck v-if="batch.checked(node)" :size="11" weight="bold" /></button>
        <input
          v-if="isEditing('doc', node)"
          ref="editEl"
          v-model="tree.edit.value"
          class="doc-title doc-edit"
          @click.stop
          @keydown.enter.prevent="tree.editCommit()"
          @keydown.esc.prevent="tree.editCancel()"
          @blur="tree.editCommit()"
        />
        <button
          v-else
          :class="node.type === 'pdf' || node.type === 'h5' ? 'pdf-title' : 'doc-title'"
          :draggable="store.canEdit(node)"
          :title="store.isGuest ? node.name + '（' + (guestEditable(node) ? '可编辑' : '只读') + '）' : node.file"
          @click="batch.mode ? batch.toggle(node) : emit('select', node.file)"
          @dblclick="!batch.mode && store.canEdit(node) && tree.editStart('doc', node)"
        >
          <ContentIcon v-if="node.meta?.icon" :value="node.meta.icon" :size="14" class="doc-kind" /><PhFilePdf v-else-if="node.type === 'pdf'" :size="13" class="doc-kind" />
          <PhFileHtml v-else-if="node.type === 'h5'" :size="13" class="doc-kind" />
          <span class="truncate">{{ node.name }}</span>
        </button>
        <span class="doc-time">{{ relTime(node.mtime) }}</span>
        <button
          v-if="canReveal && !batch.mode"
          class="icon-btn xs row-finder"
          :title="fileManagerLabel(false)"
          :aria-label="fileManagerLabel(false)"
          @click.stop="revealNode(node.file)"
        >
          <PhFolderSimple :size="14" />
        </button>
        <button
          v-if="!store.isGuest && !batch.mode"
          class="icon-btn xs acts-btn"
          title="更多操作"
          @click.stop="tree.openMenu('file', node, $event)"
        >
          <PhDotsThree :size="16" weight="bold" />
        </button>
      </div>
      </template>
    </template>
    <div v-if="showLineAtEnd" class="drop-line" />
  </div>
</template>

<script setup>
function contextRow(e,kind,node){if(store.isGuest||e.target.closest('input,textarea,[contenteditable=true]'))return;e.preventDefault();e.stopPropagation();if(!batch.mode)tree.openMenu(kind,node,e)}

import ContentIcon from './ContentIcon.vue'
import { ref, computed, inject, nextTick, watch } from 'vue'
import { PhFolderSimple, PhCaretRight, PhFilePdf, PhFileHtml, PhDotsThree, PhCheck, PhPlus, PhFolderSimplePlus, PhFilePlus } from '../icons/remix'
import { useDocsStore } from '../stores/docs'
import { useFileManager } from '../composables/useFileManager'

const props = defineProps({
  nodes: { type: Array, required: true },
  currentPath: { type: String, default: '' },
  collapsed: { type: Object, required: true },
  query: { type: String, default: '' },
  sortMode: { type: String, default: 'name' },
  depth: { type: Number, default: 0 },
  /** 这一层挂在哪个目录下（拖拽排序要知道是不是同一层） */
  parent: { type: String, default: '' }
})
const batch = inject('batch')
const emit = defineEmits([
  'select', 'delete-doc', 'delete-category', 'toggle'
])

const store = useDocsStore()
const { canReveal, reveal, label: fileManagerLabel } = useFileManager()
function revealNode(path) {
  return reveal(path)
}
function guestEditable(node) { return node.type === 'doc' && store.canEdit(node) }
/** 拖拽状态住在 Sidebar，递归层里直接用 */
const tree = inject('tree')

/* ---------- 过滤与排序 ---------- */

/**
 * 每个层级都过一遍：文档在前、目录在后，各自按名字。
 * 搜索时只留有命中的文档，目录只要下面还有命中就留着（空目录不显示）。
 */
function arrange(nodes, q) {
  const out = []
  for (const n of nodes || []) {
    // 目录是唯一的容器，其它（md、pdf）都是文件
    if (n.type === 'folder') {
      const kids = arrange(n.children, q)
      // 空目录也留着（磁盘上有就显示），搜索时才把没命中的目录收掉
      if (kids.length || !q) out.push({ ...n, children: kids })
    } else if (!q || n.name.toLowerCase().includes(q) || String(n.file || '').toLowerCase().includes(q)) {
      out.push(n)
    }
  }
  /*
   * 手动档：接口给什么顺序就什么顺序 —— 文档和目录是混着排的，这里再排一次就把拖拽结果盖掉了。
   * 另外两档是纯显示排序：文档在前、目录在后，各自按规则排。
   */
  if (props.sortMode === 'manual') return out
  const files = out.filter((n) => n.type !== 'folder')
  const foldersOut = out.filter((n) => n.type === 'folder')
  if (props.sortMode === 'recent') files.sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
  else files.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
  foldersOut.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
  return [...files, ...foldersOut]
}

const view = computed(() => arrange(props.nodes, props.query.trim().toLowerCase()))

/* ---------- 拖拽落点提示 ---------- */

/** 落点线画在这一行前面（文档和目录都算，按这一层渲染出来的顺序数） */
function showLineBefore(node) {
  const at = tree.dropAt
  if (!at || at.parent !== props.parent) return false
  const key = node.type === 'folder' ? node.path : node.file
  const i = view.value.findIndex((n) => (n.type === 'folder' ? n.path : n.file) === key)
  return i >= 0 && at.index === i
}

/** 落在这层最后一行后面 */
const showLineAtEnd = computed(() => {
  const at = tree.dropAt
  return !!at && at.parent === props.parent && at.index >= view.value.length
})

/** 这一行是不是正在被拖 */
function isDragging(node) {
  const d = tree.drag
  if (!d) return false
  return d.kind === 'folder' ? d.path === node.path : d.path === node.file
}

function isCollapsed(path) {
  return props.collapsed.has(path)
}


/** 当前这篇在不在这个目录底下：路径上的目录图标实心 */
function containsCurrent(node) {
  if (!props.currentPath) return false
  const walk = (n) => (n.type !== 'folder' ? n.file === props.currentPath : (n.children || []).some(walk))
  return (node.children || []).some(walk)
}

/** 直接包含当前文档的那一层目录：只有一个，用来承接“选中”的视觉。 */
function isCurrentParent(node) {
  if (!props.currentPath) return false
  const cut = props.currentPath.lastIndexOf('/')
  return cut > 0 && node.path === props.currentPath.slice(0, cut)
}

/* ---------- 原位改名 ---------- */

/** 改名状态住在 Sidebar（菜单和递归层都要用），输入框只负责显示与聚焦 */
const editEl = ref(null)

function isEditing(kind, node) {
  const e = tree.edit
  if (!e || e.kind !== kind) return false
  return kind === 'doc' ? e.node.file === node.file : e.node.path === node.path
}

// 轮到自己改名时才把输入框聚焦选中（递归层每一层都会收到这个 watch）
watch(
  () => tree.edit,
  async (e) => {
    if (!e) return
    const mine = props.nodes.some((n) => (e.kind === 'doc' ? n.file === e.node.file : n.path === e.node.path))
    if (!mine) return
    await nextTick()
    const el = Array.isArray(editEl.value) ? editEl.value[0] : editEl.value
    el?.focus()
    el?.select?.()
  }
)

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
  return (d.getMonth() + 1) + '月' + d.getDate() + '日'
}
</script>


<style scoped>
.row-create-btn{opacity:0;transition:opacity .12s ease,background .12s ease}
.cat-row:hover .row-create-btn,.cat-row:focus-within .row-create-btn{opacity:1}
.row-acts{display:flex;align-items:center;flex-shrink:0;min-width:0;max-width:0;overflow:hidden;padding-left:4px;opacity:0;pointer-events:none;transition:max-width 180ms var(--motion-snap),opacity 120ms ease}
.cat-row:hover .row-acts,.cat-row:focus-within .row-acts{max-width:120px;opacity:1;pointer-events:auto}
.cat-row.is-editing .row-acts{max-width:0;opacity:0;pointer-events:none}
.row-acts .row-create-btn,.row-acts .row-finder{opacity:1}
.cat-row .acts-btn{margin-left:0}
.tree-create-row{display:flex;align-items:center;gap:8px;min-height:30px;padding-right:10px;color:var(--c-sub);font-size:12.5px}
.tree-create-row>svg{flex:none;color:var(--c-faint)}
.tree-create-input{min-width:0;flex:1;height:24px;padding:0 4px;border:0;border-radius:5px;background:var(--c-field);color:var(--c-ink);font:12.5px var(--font-sans);outline:1px solid var(--c-accent)}
.row-finder { opacity: 0; transition: opacity .12s ease, background .12s ease; }
.cat-row:hover .row-finder, .cat-row:focus-within .row-finder,
.doc-row:hover .row-finder, .doc-row:focus-within .row-finder,
.row-finder:focus-visible { opacity: 1; }
.tree-caret { transition: transform 180ms var(--motion-snap); }
.tree-caret.is-open { transform: rotate(90deg); }
.tree-folder { margin-bottom: 0; }
.tree-children { display: grid; grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows 210ms var(--motion-snap), opacity 170ms ease; }
.tree-children.is-collapsed { grid-template-rows: 0fr; opacity: 0; }
.tree-children-inner { overflow: hidden; min-height: 0; }

</style>
