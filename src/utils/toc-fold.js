/**
 * 目录里的折叠状态。
 *
 * 折叠状态属于阅读偏好；「哪些标题是折叠标题」则是文档元数据，由服务端保存。
 *
 * 按文档存 localStorage：
 *
 *   { "调研/数据调研.md": { "2|数据来源|0": true } }
 *
 * 键是「级别|标题文字|同名第几个」：不存位置，所以正文里插入删除、标题挪位置都不会串。
 * 标题改了名，旧键自然失效（那一节展开），这比"折叠状态错位"要好。
 */
import { ref, watch } from 'vue'
import { API_BASE } from './api.js'

const STORE_KEY = 'reader.tocFolds'

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

const folds = ref(load())

/** 折叠状态本身（正文折叠插件要 watch 它，两处联动） */
export const foldState = folds

/** 当前文档路径（目录面板在文档切换时写入） */
export const foldDoc = ref('')
export const foldableState = ref({})

export function foldableKeys() {
  return foldableState.value[foldDoc.value] || {}
}

export function isFoldable(key) {
  return !!foldableKeys()[key]
}

async function loadFoldable(path) {
  if (!path) return
  try {
    const res = await fetch(API_BASE + '/api/foldable?path=' + encodeURIComponent(path))
    const json = await res.json()
    if (!json.ok) return
    foldableState.value = { ...foldableState.value, [path]: json.data.keys || {} }
  } catch {
    /* 暂时离线仍可阅读正文，折叠标题稍后重新打开文档再取。 */
  }
}

watch(foldDoc, loadFoldable, { immediate: true })

export async function setFoldable(key, on) {
  const path = foldDoc.value
  if (!path) throw new Error('尚未选中文档')
  const res = await fetch(API_BASE + '/api/foldable', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, key, on })
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || '保存标题类型失败')
  foldableState.value = { ...foldableState.value, [path]: json.data.keys || {} }
  if (!on) unfoldKeys(key)
}

let saveTimer = null
function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(folds.value))
    } catch {
      /* 写不了就算了，只是下次打开全展开 */
    }
  }, 400)
}

export function foldKey(level, text, nth) {
  return level + '|' + String(text).trim() + '|' + nth
}

export function foldedKeys() {
  return folds.value[foldDoc.value] || {}
}

export function isFolded(key) {
  return !!foldedKeys()[key]
}

function write(next) {
  folds.value = { ...folds.value, [foldDoc.value]: next }
  persist()
}

export function toggleFold(key) {
  if (!isFoldable(key)) return
  const next = { ...foldedKeys() }
  if (next[key]) delete next[key]
  else next[key] = true
  write(next)
}

/** 展开若干标题（当前读到的小节被收着时，自动把它露出来） */
export function unfoldKeys(keys) {
  const list = Array.isArray(keys) ? keys : [keys]
  const next = { ...foldedKeys() }
  let hit = false
  for (const k of list) {
    if (next[k]) {
      delete next[k]
      hit = true
    }
  }
  if (hit) write(next)
}
