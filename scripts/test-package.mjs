import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import { coverArtworkCatalog } from '../server/cover-artwork-catalog.js'
const root=fileURLToPath(new URL('../',import.meta.url))
const manifest=JSON.parse(fs.readFileSync(path.join(root,'plugins/reader-workspace/package.json'),'utf8'))
const archive=process.argv[2]||path.join(root,`${manifest.name}-${manifest.version}.tgz`)
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'reader-package-'))
try{
 const entries=execFileSync('tar',['-tf',archive],{encoding:'utf8'}).trim().split(/\r?\n/)
 assert(entries.includes('package/runtime/dist/index.html'))
 assert(entries.includes('package/runtime/server/serve.js'))
 for (const { id, archived } of coverArtworkCatalog) {
   assert(entries.includes('package/runtime/dist/covers/' + id + '.webp'))
   if (!archived) assert(entries.includes('package/runtime/dist/covers/' + id + '-thumb.webp'))
 }
 for (const id of ['ink-index','ink-leaf','ink-margin']) {
   assert(entries.includes('package/runtime/dist/covers/' + id + '-ink.svg'), 'missing ink overlay for ' + id)
 }
 assert(entries.includes('package/runtime/dist/licenses/Met-Ejiri.txt'))
 assert(entries.includes('package/platform.js'))
 assert(!entries.some(name=>/(?:^|\/)(?:\.runtime|route-aliases)\//.test(name)), 'deployment-specific route mappings must stay local')
 assert(entries.includes('package/runtime/dist/pdfjs/LICENSE'))
 assert(entries.some(name=>name.includes('pdf.worker')&&name.endsWith('.mjs')))
 assert(!entries.some(name=>/state\.sqlite|\.admin-password|\.分享\.json|service\.json|runtime\/dist\/kb\.json|Weixin\.otf|\.知识库\.json/.test(name)),'private runtime data must not be packaged')
 execFileSync('tar',['-xf',archive,'-C',temp])
 const env={...process.env,READER_TEST_RUNTIME:path.join(temp,'package/runtime'),READER_TEST_PLUGIN:path.join(temp,'package')}
 execFileSync(process.execPath,[path.join(root,'scripts/test-managed-server.mjs')],{stdio:'inherit',env})
 execFileSync(process.execPath,[path.join(root,'scripts/test-plugin.mjs')],{stdio:'inherit',env})
 console.log(`PASS: actual archive ${entries.length} entries, ${(fs.statSync(archive).size/1e6).toFixed(2)} MB; runtime startup and privacy checks`)
}finally{fs.rmSync(temp,{recursive:true,force:true})}
