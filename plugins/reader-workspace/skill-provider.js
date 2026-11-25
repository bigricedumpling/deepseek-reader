import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const skillPath = fileURLToPath(new URL('./skills/reader-workspace/SKILL.md', import.meta.url))
let bundledSkill

export function getReaderSkill() {
  if (bundledSkill) return bundledSkill
  // This packaged file uses single-line name and description fields in its YAML header.
  const document = readFileSync(skillPath, 'utf8').replaceAll('\r\n', '\n')
  const parts = /^---\n([\s\S]+?)\n---\n([\s\S]+)$/.exec(document)
  const name = parts?.[1].match(/^name:\s*(reader-workspace)\s*$/m)?.[1]
  const field = parts?.[1].match(/^description:[ \t]*(.+)$/m)?.[1].trim()
  if (!name || !field) throw Error('Missing Typocket skill name or description')
  const description = field.startsWith('"') ? JSON.parse(field) : field
  bundledSkill = Object.freeze({ name, description, content: parts[2].trim() })
  return bundledSkill
}

export function registerReaderSkill(registry) {
  const { name, description, content } = getReaderSkill()
  const summary = {
    name, description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'typocket',
    source: 'bundled',
    resourceBase: { kind: 'directory', path: dirname(skillPath) },
  }
  // DSH's BUNDLED_SKILL_RANK. Keep the standalone package independent of host modules.
  const candidate = { ...summary, rank: 600, locator: skillPath }
  registry.registerProvider(() => ({
    name: summary.provider,
    list: async () => [candidate],
    get: async () => ({ ...summary, content }),
  }))
}
