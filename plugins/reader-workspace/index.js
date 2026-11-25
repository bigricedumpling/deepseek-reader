import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { BRAND_NAME } from './brand.js'
import { callTool, definitions } from './scripts/reader.mjs'
import { startManagedServer } from './managed-server.js'
import { registerReaderSkill } from './skill-provider.js'

export const name = 'reader-workspace'
export const inject = ['tools', 'connection']

function validateInput(schema, value, field = '参数') {
  if (schema.type === 'integer') {
    if (!Number.isSafeInteger(value) || value < schema.minimum || value > schema.maximum) throw Error(`${field}无效`)
    return
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string' || schema.enum && !schema.enum.includes(value)) throw Error(`${field}无效`)
    return
  }
  if (schema.type !== 'object' || value === null || typeof value !== 'object' || Array.isArray(value)) throw Error(`${field}无效`)
  for (const key of schema.required || []) if (value[key] === undefined) throw Error(`缺少参数：${key}`)
  for (const [key, child] of Object.entries(value)) {
    const property = schema.properties?.[key]
    if (!property) {
      if (schema.additionalProperties === false) throw Error(`未知参数：${key}`)
      continue
    }
    validateInput(property, child, `${field}.${key}`)
  }
}

// A DSH tool runs in the plugin process. A local HTTP service does not itself
// know whether this particular DSH session may write outside its workspace.
async function authorizeLocalWrite(ctx, execution, dataDirectory, toolName, description, args, policy) {
  const agent = execution.agent
  if (!agent) throw Error('需要从 DSH Agent 会话调用知识库写入工具')
  if (policy?.mode === 'danger-full-access') return
  if (policy?.mode === 'workspace-write' && dataDirectory && policy.workspaceRoot) {
    const relative = path.relative(realpathSync(policy.workspaceRoot), realpathSync(dataDirectory))
    if (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep)) return
  }
  const approver = ctx.get?.('approval')
  if (!approver || (policy && policy.mode !== 'workspace-write')) throw Error('当前 DSH 会话没有写入该知识库的权限')
  const target = [args.path || args.file || args.id, args.dir, args.name].filter(Boolean).join(' → ')
  const label = description.split('。')[0]
  const result = await approver.request({
    agent, toolName, callId: execution.callId, signal: execution.signal,
    reason: '允许本次 Typocket 写入？' + label + '（' + target + '）'
  })
  if (result !== 'allowed-once') throw Error('本次知识库写入未获 DSH 授权')
}

async function managedUrl(managed, signal) {
  const deadline = Date.now() + 10000
  while (managed.status.state === 'starting' && Date.now() < deadline) {
    await delay(80, undefined, { signal })
  }
  if (managed.status.state !== 'ready' || !managed.status.url) {
    throw Error(managed.status.error || 'Typocket 本机服务尚未就绪，请稍后重试')
  }
  return managed.status.url
}

export function apply(ctx) {
  // Older DSH hosts may have only the document surface and tools service.
  ctx.inject?.(['skills'], skillCtx => { registerReaderSkill(skillCtx.skills) })
  let managed = { status: { state: 'starting', url: '', error: '' }, stop() {} }
  ctx.effect(() => {
    managed = startManagedServer()
    return () => managed.stop()
  }, `${BRAND_NAME} local service`)
  ctx.connection.fetch.register({
    path: '/api/reader-workspace/status', methods: ['GET'], requestBody: 'buffered',
    fetch: () => Promise.resolve(Response.json({ ...managed.status }, { headers: { 'cache-control': 'no-store' } }))
  })
  for (const [toolName, description, method, , schema] of definitions) {
    ctx.tools.register({
      name: toolName,
      description,
      parameters: schema,
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]
      },
      async execute(args, execution) {
        validateInput(schema, args)
        const signal = execution.signal
        const options = { signal }
        if (!process.env.READER_TOKEN && !process.env.READER_URL) {
          options.baseUrl = await managedUrl(managed, signal)
          if (managed.status.dataDirectory) {
            options.expectedIdentity = createHash('sha256').update(managed.status.dataDirectory).digest('hex').slice(0, 24)
          }
        }
        if (method !== 'GET') {
          const policy = ctx.get?.('sandboxPolicy')?.resolve({ session: execution.agent?.session })
          if (policy?.mode === 'read-only') throw Error('当前 DSH 会话为只读，无法写入知识库')
          options.authorizeLocal = instance => authorizeLocalWrite(ctx, execution, instance.dataDirectory, toolName, description, args, policy)
        }
        const result = await callTool(toolName, args, options)
        if (!result.ok) throw new Error([result.code, result.error].filter(Boolean).join(' ') || `${BRAND_NAME} 请求失败`)
        return result
      }
    })
  }
}
