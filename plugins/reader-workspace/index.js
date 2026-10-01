import { callTool, definitions } from './scripts/reader.mjs'

export const name = 'reader-workspace'
export const inject = ['tools']

function validateInput(schema, value, field = '参数') {
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

export function apply(ctx) {
  // The browser entry works without Agent access. Do not expose tools that
  // would fail every call until an authorized Reader token is configured.
  if (!process.env.READER_TOKEN) return
  for (const [toolName, description, , , schema] of definitions) {
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
        const result = await callTool(toolName, args, { signal: execution.signal })
        if (!result.ok) throw new Error(result.error || result.code || 'Reader 请求失败')
        return result
      }
    })
  }
}
