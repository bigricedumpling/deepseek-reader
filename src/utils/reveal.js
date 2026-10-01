import { API_BASE } from './api'

export function fileManagerAvailable() {
  const platform = navigator.userAgentData?.platform || navigator.platform || ''
  const userAgent = navigator.userAgent || ''
  const tablet = /Mac/i.test(platform) && navigator.maxTouchPoints > 1
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname) && !tablet && !/iPhone|iPad|iPod|Android/i.test(platform + ' ' + userAgent)
}

export function fileManagerLabel(directory = false) {
  const platform = navigator.userAgentData?.platform || navigator.platform || ''
  if (/Mac/i.test(platform)) return directory ? '在访达中打开' : '在访达中显示'
  if (/Win/i.test(platform)) return directory ? '在文件资源管理器中打开' : '在文件资源管理器中显示'
  return directory ? '打开所在文件夹' : '显示文件位置'
}

export async function revealInFileManager(path, previewId = '', sourcePath = '') {
  const response = await fetch(API_BASE + '/api/reveal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(previewId ? { previewId, sourcePath } : { path })
  })
  const result = await response.json()
  if (!response.ok || !result.ok) throw Error(result.error || '无法定位文件')
}
