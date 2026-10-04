import {ref,computed} from 'vue'
import MarkdownIt from 'markdown-it'
import {API_BASE} from '../utils/api'
import {fileManagerAvailable,revealInFileManager} from '../utils/reveal'
export function useWorkspaceHistory({store,libPanel,managerOpen,managerSection,openTransfer}){
const tempPreviews = ref([])
const previewQuery = ref('')
const filteredPreviews = computed(() => tempPreviews.value.filter(item => !previewQuery.value || String(item.title || '').toLocaleLowerCase().includes(previewQuery.value.toLocaleLowerCase())))
const selectedPreview = ref(null)
const previewActionError = ref('')
const previewArchived = ref(false)
const previewLoading = ref(false)
let listRequest=0
function canResolvePreviewInDsh(item) { return window.parent !== window && /^dsh-resource:\/\/file\/session\//.test(item?.reference || '') }
function canRevealItem(item) { return fileManagerAvailable() && !!item && (/^(?:\/|[A-Za-z]:[\\/])/.test(item.sourcePath || item.reference || '') || canResolvePreviewInDsh(item)) }
const canRevealPreview = computed(() => canRevealItem(selectedPreview.value))
const canOpenPreviewInDsh = computed(() => canResolvePreviewInDsh(selectedPreview.value))
const safeMarkdown = new MarkdownIt({ html: false, linkify: true })
const safeLinkRule = safeMarkdown.renderer.rules.link_open || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options))
safeMarkdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const href = tokens[index].attrGet('href') || ''
  if (href && !/^(?:https?:\/\/|#)/i.test(href)) {
    tokens[index].attrSet('href', '#')
    tokens[index].attrSet('title', '请在 DSH 打开源文件中的链接')
  }
  return safeLinkRule(tokens, index, options, env, self)
}
const selectedPreviewHtml = computed(() => safeMarkdown.render(selectedPreview.value?.content || ''))
function previewSourceLabel(reference) {
  try {
    const uri = new URL(reference)
    if (uri.protocol === 'dsh-resource:') return decodeURIComponent(uri.pathname.split('/').slice(3).join('/')) || '工作区文件'
  } catch { /* 旧记录可能只有路径 */ }
  return String(reference || '').split('/').pop() || '工作区文件'
}
function onPreviewLink(event) { if (event.target.closest?.('a[href="#"]')) event.preventDefault() }
async function loadPreviews() {
  const request=++listRequest
  previewLoading.value=true;previewActionError.value='';tempPreviews.value=[]
  try {
    const response = await fetch(API_BASE + '/api/workspace-previews?archived=' + (previewArchived.value ? '1' : '0'), { cache: 'no-store' })
    const json = await response.json()
    if (!json.ok) throw Error(json.error || '读取工作区浏览记录失败')
    if(request===listRequest)tempPreviews.value = json.data || []
  } catch (error) { if(request===listRequest)previewActionError.value = String(error.message || error) }
  finally{if(request===listRequest)previewLoading.value=false}
}
async function openPreviews() {
  window.dispatchEvent(new Event('reader-overlay-open'))
  libPanel.open = false
  managerSection.value = 'previews'
  previewArchived.value = false
  previewQuery.value = ''
  selectedPreview.value = null
  managerOpen.value = true
  await loadPreviews()
}
async function setPreviewFilter(value) { previewArchived.value = value==='hidden'; previewQuery.value='';selectedPreview.value = null; await loadPreviews() }
async function selectPreview(id) {
  try {
    previewActionError.value = ''
    const response = await fetch(API_BASE + '/api/workspace-preview?id=' + encodeURIComponent(id), { cache: 'no-store' })
    const json = await response.json()
    if (!json.ok) throw Error(json.error || '预览读取失败')
    selectedPreview.value = json.data
    return json.data
  } catch (error) { previewActionError.value = String(error.message || error); return null }
}
async function collectPreviewFromList(item) {
  const record = await selectPreview(item.id)
  if (record) await openTransfer('collect', 'preview', record.id)
}
async function showPreviewInFileManager(item = selectedPreview.value) {
  if (!item) return
  try {
    previewActionError.value = ''
    let sourcePath = ''
    if (!/^(?:\/|[A-Za-z]:[\\/])/.test(item.sourcePath || item.reference || '') && canResolvePreviewInDsh(item)) {
      const requestId = crypto.randomUUID()
      sourcePath = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { window.removeEventListener('message', onMessage); reject(Error('无法取得原文件位置，请在 DSH 中重新打开文件后再试')) }, 5000)
        function onMessage(event) {
          if (event.source !== window.parent || event.data?.type !== 'dsh-reader:resolved-source' || event.data.requestId !== requestId) return
          clearTimeout(timeout); window.removeEventListener('message', onMessage)
          resolve(String(event.data.sourcePath || ''))
        }
        window.addEventListener('message', onMessage)
        window.parent.postMessage({ type: 'dsh-reader:resolve-source', requestId, reference: item.reference }, '*')
      })
      if (!sourcePath) throw Error('无法取得原文件位置')
    }
    await revealInFileManager('', item.id, sourcePath)
    if (sourcePath) item.sourcePath = sourcePath
  }
  catch (error) { previewActionError.value = String(error.message || error) }
}
function openPreviewInDsh(item = selectedPreview.value) {
  window.parent.postMessage({ type: 'dsh-reader:open-source', reference: item.reference }, '*')
}
async function archivePreview(id, archived) {
  try {
    const response = await fetch(API_BASE + '/api/workspace-preview/archive', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, archived }) })
    const json = await response.json()
    if (!json.ok) throw Error(json.error || '更新浏览记录失败')
    selectedPreview.value = null
    await loadPreviews()
  } catch (error) { previewActionError.value = String(error.message || error) }
}

return {tempPreviews,previewQuery,filteredPreviews,selectedPreview,previewActionError,previewArchived,canResolvePreviewInDsh,canRevealItem,canRevealPreview,canOpenPreviewInDsh,selectedPreviewHtml,previewSourceLabel,onPreviewLink,loadPreviews,openPreviews,setPreviewFilter,previewLoading,selectPreview,collectPreviewFromList,showPreviewInFileManager,openPreviewInDsh,archivePreview}
}
