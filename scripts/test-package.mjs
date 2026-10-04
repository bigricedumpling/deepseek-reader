import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url))
const manifest=JSON.parse(fs.readFileSync(path.join(root,'plugins/reader-workspace/package.json'),'utf8'))
const archive=process.argv[2]||path.join(root,`${manifest.name}-${manifest.version}.tgz`)
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'reader-package-'))
try{
 const entries=execFileSync('tar',['-tf',archive],{encoding:'utf8'}).trim().split(/\r?\n/)
 assert(entries.includes('package/runtime/dist/index.html'))
 assert(entries.includes('package/runtime/server/serve.js'))
 assert(entries.includes('package/platform.js'))
 assert(entries.includes('package/runtime/dist/pdfjs/LICENSE'))
 assert(entries.some(name=>name.includes('pdf.worker')&&name.endsWith('.mjs')))
 assert(!entries.some(name=>/state\.sqlite|\.admin-password|\.分享\.json|service\.json|runtime\/dist\/kb\.json|Weixin\.otf|\.知识库\.json/.test(name)),'private runtime data must not be packaged')
 execFileSync('tar',['-xf',archive,'-C',temp])
 execFileSync(process.execPath,[path.join(root,'scripts/test-managed-server.mjs')],{stdio:'inherit',env:{...process.env,READER_TEST_RUNTIME:path.join(temp,'package/runtime')}})
 console.log(`PASS: actual archive ${entries.length} entries, ${(fs.statSync(archive).size/1e6).toFixed(2)} MB; runtime startup and privacy checks`)
}finally{fs.rmSync(temp,{recursive:true,force:true})}
