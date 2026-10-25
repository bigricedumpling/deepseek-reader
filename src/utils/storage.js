/**
 * localStorage 的安全封装。
 *
 * 禁用存储、配额满、隐私模式以及部分嵌入式 WebView 里，localStorage 的
 * getItem/setItem 会直接抛 SecurityError/QuotaExceededError。
 * 阅读设置、位置、折叠状态都只是偏好，丢不起整个页面：
 * 读不到就用默认值，写不进就只在本次会话里生效。
 */
export function storageGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

export function storageSet(key, value) {
  try { localStorage.setItem(key, value) } catch { /* 本次会话仍可用 */ }
}

export function storageRemove(key) {
  try { localStorage.removeItem(key) } catch { /* 已经不存在就算了 */ }
}

/** 读 JSON 偏好；内容损坏或格式不对时安静回退，不让一条坏记录卡死启动。 */
export function storageJSON(key, fallback) {
  const raw = storageGet(key)
  if (raw === null || raw === '') return fallback
  try { return JSON.parse(raw) } catch { return fallback }
}
