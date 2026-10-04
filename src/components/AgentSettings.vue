<template>
  <Teleport to="body">
    <Transition name="overlay" appear @after-leave="$emit('close')">
      <div v-if="visible" class="reader-modal-shade" @click.self="visible = false">
        <section ref="dialog" tabindex="-1" class="reader-dialog" role="dialog" aria-modal="true" aria-label="Agent 访问">
          <header><span>Agent 访问</span><button aria-label="关闭" @click="visible = false">×</button></header>
          <template v-if="!token"><p class="agent-purpose">选择允许 Agent 读取或修改的知识库。阅读器本身无需此授权。</p>
            <label>连接名称<input v-model="name" placeholder="例如：DSH" /></label>
            <div class="agent-scope-heading"><span>可访问的知识库</span><button type="button" @click="toggleAll">{{ allSelected ? '取消全选' : '选择全部' }}</button></div>
            <div class="agent-scopes" role="group" aria-label="可访问的知识库">
              <label v-for="library in libraries" :key="library.path">
                <input v-model="scopes" type="checkbox" :value="library.path" />
                <span>{{ library.name }}</span>
              </label>
            </div>
            <label><input type="checkbox" v-model="write" />允许修改文档</label>
            <label>有效期<select v-model="days"><option :value="7">7 天</option><option :value="30">30 天</option><option :value="90">90 天</option></select></label>
            <button class="reader-button" :disabled="busy || !scopes.length" @click="create">创建连接</button>
          </template>
          <template v-else>
            <p>仅显示一次，请保存到 DSH 的本机配置。</p>
            <textarea readonly :value="token" aria-label="连接令牌" />
            <button class="reader-button" @click="copy">{{ copied ? '已复制' : '复制令牌' }}</button>
            <details class="agent-setup"><summary>配置到 DSH</summary><p>READER_URL：当前阅读器地址<br />READER_TOKEN：此令牌</p></details>
          </template>
          <div class="agent-list">
            <div v-for="key in keys.filter(x => !x.revoked)" :key="key.id">
              <span>{{ key.name }}<small>{{ key.scopes.length }} 个知识库，{{ key.permissions.includes('write') ? '可读写' : '只读' }}，{{ new Date(key.expires).toLocaleDateString() }} 到期</small></span>
              <button :disabled="busy" @click="revoke(key.id)">撤销</button>
            </div>
          </div>
          <p v-if="error" class="reader-error">{{ error }}</p>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import {useDialogFocus} from '../composables/useDialogFocus'
import { API_BASE } from '../utils/api'

const props = defineProps({ library: String })
defineEmits(['close'])
const visible = ref(true)
const dialog = ref(null)
useDialogFocus(visible, dialog, () => { visible.value = false })
const name = ref('DSH')
const scopes = ref(props.library ? [props.library] : [])
const write = ref(false)
const days = ref(30)
const token = ref('')
const keys = ref([])
const libraries = ref([])
const busy = ref(false)
const error = ref('')
const copied = ref(false)
const allSelected = computed(() => libraries.value.length > 0 && libraries.value.every(l => scopes.value.includes(l.path)))

function toggleAll() { scopes.value = allSelected.value ? [] : libraries.value.map(l => l.path) }
async function request(method, route, body) {
  const res = await fetch(API_BASE + '/api/' + route, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const out = await res.json()
  if (!out.ok) throw Error(out.error)
  return out.data
}
async function run(fn) { busy.value = true; error.value = ''; try { await fn() } catch (e) { error.value = e.message } finally { busy.value = false } }
async function refresh() { keys.value = await request('GET', 'agent-keys') }
function create() { run(async () => { const out = await request('POST', 'agent-keys', { name: name.value, scopes: scopes.value, write: write.value, days: days.value }); token.value = out.token; await refresh() }) }
function revoke(id) { run(async () => { await request('DELETE', 'agent-keys', { id }); await refresh() }) }
async function copy() { try { await navigator.clipboard.writeText(token.value); copied.value = true } catch { error.value = '请手动选中并复制令牌' } }
onMounted(() => run(async () => { await refresh(); const out = await request('GET', 'libs'); libraries.value = out.libs || out; scopes.value = scopes.value.filter(x => libraries.value.some(l => l.path === x)); if (!scopes.value.length && libraries.value.length) scopes.value = [libraries.value[0].path] }))
</script>

<style scoped>
.agent-scope-heading { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
.agent-scope-heading button { color: var(--c-muted); font-size: 12px; }
.agent-scopes { max-height: 160px; overflow: auto; padding: 5px 0; }
.agent-scopes label { display: flex; align-items: center; gap: 8px; margin: 0; padding: 5px 0; }
.agent-scopes input[type=checkbox] { margin-right: 0; }
.agent-list { margin-top: 20px; max-height: 180px; overflow: auto; }
.agent-list > div { display: flex; justify-content: space-between; gap: 10px; padding: 10px 0; border-top: 1px solid var(--c-line); }
small { display: block; color: var(--c-faint); font-size: 11px; margin-top: 4px; }
.agent-setup{margin-top:16px;color:var(--c-sub);font-size:12px}.agent-setup summary{cursor:pointer}.agent-setup p{margin:8px 0 0}
</style>
