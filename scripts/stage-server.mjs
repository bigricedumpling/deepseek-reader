import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

export async function stageServer(destination) {
  const source = fileURLToPath(new URL('../server/', import.meta.url))
  fs.cpSync(source, destination, { recursive: true })
  // The installed DSH runtime has no npm dependencies of its own.
  await build({
    entryPoints: ['workspace-images.js', 'document-attachments.js'].map(name => path.join(source, 'services', name)),
    outdir: path.join(destination, 'services'), splitting: true, chunkNames: 'internal/[name]-[hash]',
    bundle: true, format: 'esm', platform: 'node', target: 'node24', mainFields: ['module', 'main']
  })
}
