/**
 * 目录里的折叠状态。
 *
 * 只影响**右侧目录列表**的显示：长文读起来，目录一下拉得老长，
 * 找一个小节要在几十条里扫 —— 把它收起来，目录就短了。
 * 正文一个字都不动（正文本来就靠目录导航）。
 *
 * 按文档存 localStorage：
 *
 *   { "调研/数据调研.md": { "2|数据来源|0": true } }
 *
 * 键是「级别|标题文字|同名第几个」：不存位置，所以正文里插入删除、标题挪位置都不会串。
 * 标题改了名，旧键自然失效（那一节展开），这比"折叠状态错位"要好。
 */
import { ref } from 'vue'

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

/** 当前文档路径（目录面板在文档切换时写入） */
export const foldDoc = ref('')

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
