import assert from 'node:assert/strict'
import { apply } from '../plugins/reader-workspace/index.js'

const original = process.env.READER_TOKEN
try {
  const registered = []
  const ctx = { tools: { register: definition => registered.push(definition) } }
  delete process.env.READER_TOKEN
  apply(ctx)
  assert.equal(registered.length, 0, '未连接时不应显示不可用的 Agent 工具')

  process.env.READER_TOKEN = 'test-only'
  apply(ctx)
  assert.equal(registered.length, 14)
  const create = registered.find(tool => tool.name === 'reader_create')
  assert(create)
  assert(create.parameters.required.includes('requestId'))
  assert.equal(create.parameters.additionalProperties, false)
  assert.equal(typeof create.output.render, 'function')
  await assert.rejects(create.execute({ name: 'Example', content: '# Hi', requestId: 'x' }, {}), /缺少参数：dir/)
  await assert.rejects(create.execute({ dir: 'Example', name: 1, content: '# Hi', requestId: 'x' }, {}), /参数.name无效/)
  console.log('PASS: installable bundle imports without host package links and registers 14 valid tools')
} finally {
  if (original === undefined) delete process.env.READER_TOKEN
  else process.env.READER_TOKEN = original
}
