<template>
  <div>
    <template v-for="node in view" :key="node.type + ':' + (node.file || node.path)">
      <!-- 目录：递归渲染，层级就是磁盘上的目录层级 -->
      <div v-if="node.type === 'folder'" class="mb-1.5">
        <div v-if="showLineBefore(node)" class="drop-line" />
        <div
          class="cat-row group/cat"
          :class="{ 'is-drop': tree.dropInto === node.path, 'is-on': containsCurrent(node), 'is-dragging': isDragging(node) }"
          :data-level="depth"
          :style="{ paddingLeft: 8 + depth * 11 + 'px' }"
          :draggable="!store.isGuest"
          @click="emit('toggle', node.path)"
          @dragstart="tree.start(node, $event)"
          @dragover="tree.overRow(node, $event)"
          @drop.prevent="tree.drop()"
          @dragend="tree.end()"
        >
          <span class="w-3.5 shrink-0 flex items-center justify-center text-[var(--c-sub)]">
            <PhCaretDown v-if="!isCollapsed(node.path)" :size="11" />
            <PhCaretRight v-else :size="11" />
          </span>
          <PhFolderSimple
            :size="14"
            class="ml-1 shrink-0 text-[var(--c-sub)]"
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
          <span v-else class="cat-name ml-2 text-[12.5px] text-[var(--c-sub)] truncate" :title="node.name">{{ node.name }}</span>
          <PhEyeSlash
            v-if="store.shareInfo.shared?.[node.path] === false"
            :size="11"
            class="share-eye"
            title="不对外分享"
          />
          <button
            v-if="!store.isGuest"
            class="icon-btn xs acts-btn"
            title="更多操作"
            @click.stop="tree.openMenu('folder', node, $event)"
          >
            <PhDotsThree :size="16" weight="bold" />
          </button>
        </div>

        <div v-show="!isCollapsed(node.path) || !!query">
          <DocTree
            :nodes="node.children"
            :current-path="currentPath"
            :collapsed="collapsed"
            :query="query"
            :sort-mode="sortMode"
            :depth="depth + 1"
            :parent="node.path"
            @select="emit('select', $event)"
            @create-doc="emit('create-doc', $event)"
            @create-category="emit('create-category', $event)"
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

      <!-- 文档 / PDF：名字就是文件名，正文里怎么写标题都不影响这里 -->
      <template v-else>
      <div v-if="showLineBefore(node)" class="drop-line" />
      <div
        class="doc-row group/doc"
        :class="{ 'is-on': node.file === currentPath, 'is-dragging': isDragging(node), 'is-pdf': node.type === 'pdf' }"
        :data-level="depth"
        :style="{ paddingLeft: 26 + depth * 11 + 'px' }"
        :draggable="!store.isGuest"
        @dragstart="tree.start(node, $event)"
        @dragover="tree.overRow(node, $event)"
        @drop.prevent="tree.drop()"
        @dragend="tree.end()"
      >
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
          :title="node.file"
          @click="emit('select', node.file)"
          @dblclick="tree.editStart('doc', node)"
        >
          <PhFilePdf v-if="node.type === 'pdf'" :size="13" class="doc-kind" />
          <PhFileHtml v-else-if="node.type === 'h5'" :size="13" class="doc-kind" />
          <span class="truncate">{{ node.name }}</span>
        </button>
        <PhEyeSlash
          v-if="store.shareInfo.shared?.[node.file] === false"
          :size="11"
          class="share-eye"
          title="不对外分享"
        />
        <span class="doc-time">{{ relTime(node.mtime) }}</span>
        <button
          v-if="!store.isGuest" class="icon-btn xs acts-btn"
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
import { ref, computed, inject, nextTick, watch } from 'vue'
import { PhFolderSimple, PhCaretRight, PhCaretDown, PhFilePdf, PhFileHtml, PhDotsThree, PhEyeSlash } from '@phosphor-icons/vue'
import { useDocsStore } from '../stores/docs'

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
const emit = defineEmits([
  'select', 'create-doc', 'create-category', 'delete-doc', 'delete-category', 'toggle'
])

const store = useDocsStore()
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
    } else if (!q || n.name.toLowerCase().includes(q)) {
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

/** 当前这篇在不在这个目录底下：图标实心 + 目录名高亮 */
function containsCurrent(node) {
  if (!props.currentPath) return false
  const walk = (n) => (n.type === 'doc' ? n.file === props.currentPath : (n.children || []).some(walk))
  return (node.children || []).some(walk)
}

function parentDir(node) {
  const i = node.file.lastIndexOf('/')
  return i < 0 ? '' : node.file.slice(0, i)
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

/**
 * 提交改名。空值或没变就当作取消。
 *
 * 开头必须核对 editing 是不是还停在同一个目标上：回车会触发一次提交，
 * 紧接着 blur 又触发一次，第二次拿的还是改名前的旧路径，接口会报「文档不存在」。
 * 先把 editing 清掉，就等于给后面那次上了锁。
 */
async function commitRename(kind, node) {
  const key = kind === 'doc' ? 'doc:' + node.file : 'cat:' + node.path
  if (editing.value !== key) return
  editing.value = ''
  const el = Array.isArray(editEl.value) ? editEl.value[0] : editEl.value
  const next = (el?.value || '').trim()
  if (!next || next === node.name) return
  try {
    if (kind === 'doc') await store.renameDoc(node.file, next)
    else await store.renameCategory(node.path, next)
  } catch (e) {
    store.error = String(e.message || e)
  }
}

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
/* 「不对外分享」那个小眼睛：跟名字留一点距离、跟行内的文字对齐 */
.share-eye {
  flex-shrink: 0;
  margin-left: 5px;
  align-self: center;
  opacity: 0.5;
}
</style>
