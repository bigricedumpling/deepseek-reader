#!/usr/bin/env node
import readline from 'node:readline'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readerDataDirectory } from '../platform.js'
import { sharePrompt } from './share-prompt.mjs'
import { BRAND_NAME } from '../brand.js'
import { getReaderSkill } from '../skill-provider.js'
import manifest from '../package.json' with { type: 'json' }
import { fileURLToPath } from 'node:url'
const str={type:'string'},obj=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false})
const source=obj({kind:{type:'string',enum:['conversation','workspace-file','import','manual']},workspace:str,reference:str,note:str},['kind'])
export const definitions=[
 ['reader_libraries','列出此连接可访问的知识库。保存文档前先选知识库。','GET','agent-libs',obj({})],
 ['reader_tree','列出已授权知识库的文件。', 'GET','tree',obj({lib:str},['lib'])],
 ['reader_read','读取文档及 revision。更新前必须先读取。','GET','doc',obj({id:str,path:str})],
 ['reader_search','在指定知识库中搜索正文。','GET','search',obj({lib:str,q:str},['lib','q'])],
 ['reader_create','在所选知识库中新建文档，可附私人来源记录。重试必须使用相同 requestId。','POST','doc',obj({dir:str,name:str,content:str,source,requestId:str},['dir','name','content','requestId'])],
 ['reader_update','使用读取时的 revision 保存。冲突时重新读取并合并，不强制覆盖。','PUT','doc',obj({id:str,path:str,content:str,revision:str,requestId:str},['content','revision','requestId'])],
 ['reader_rename','重命名文档并更新相关正文引用，保留稳定标识、资源归属、权限及旧路径别名。','PATCH','doc',obj({id:str,path:str,name:str,requestId:str},['name','requestId'])],
 ['reader_move','移动文档并更新授权范围内指向它的正文引用。','PUT','move/doc',obj({file:str,dir:str,requestId:str},['file','dir','requestId'])],
 ['reader_metadata','读取图标、封面和版式元数据及版本。','GET','metadata',obj({id:str,path:str})],
 ['reader_set_metadata','带版本号更新页面元数据。','PUT','metadata',obj({id:str,path:str,revision:str,meta:{type:'object'},requestId:str},['revision','meta','requestId'])],
 ['reader_sources','读取文档的私人来源记录。','GET','sources',obj({id:str,path:str})],
 ['reader_add_source','给现有文档补充一条私人来源记录。','POST','sources',obj({id:str,path:str,source,requestId:str},['source','requestId'])],
 ['reader_upload_image','给已有文档保存图片，data 是图片的 base64 内容。','POST','asset',obj({path:str,mime:str,data:str,requestId:str},['path','mime','data','requestId'])],
 ['reader_history','查看文档历史版本。','GET','history',obj({id:str,path:str,version:str})]
]
const defaultOrigin = 'http://127.0.0.1:8090/'
const loopback = new Set(['127.0.0.1', '[::1]', 'localhost'])

async function connection(options) {
  const explicitRoot = process.env.DOCS_ROOT || process.env.DSH_READER_DATA_DIR
  const directory = path.resolve(explicitRoot || readerDataDirectory())
  const identity = createHash('sha256').update(directory).digest('hex').slice(0, 24)
  const expectedIdentity = options.expectedIdentity || (explicitRoot ? identity : undefined)
  const explicitUrl = options.baseUrl || process.env.READER_URL
  if (explicitUrl) return { base: explicitUrl, expectedIdentity, explicit: true }
  const record = path.join(path.dirname(directory), 'runtime', identity, 'service.json')
  let binding
  try {
    binding = JSON.parse(await readFile(record, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return { base: defaultOrigin, expectedIdentity }
    throw Error('无法读取 Typocket 的服务记录，请检查本机插件连接。')
  }
  if (binding?.kind === 'managed' && binding.identity === identity &&
      Number.isInteger(binding.port) && binding.port > 0 && binding.port <= 65535) {
    return { base: 'http://127.0.0.1:' + binding.port + '/', expectedIdentity: identity }
  }
  if (binding?.kind === 'existing' && typeof binding.url === 'string') return { base: binding.url, expectedIdentity }
  throw Error('Typocket 服务记录与所选知识库目录不匹配。')
}

async function verifyLocal(base, expectedIdentity, signal) {
  const get = async route => {
    const res = await fetch(new URL('api/' + route, base), { signal, redirect: 'error' })
    const result = await res.json()
    if (!res.ok || !result.ok) throw Error('Typocket 本机管理服务未就绪或只允许访客访问。')
    return result.data
  }
  let result
  try {
    result = await Promise.all([get('instance'), get('me')])
  } catch (error) {
    if (signal.aborted) throw error
    throw Error('无法连接本机 Typocket 管理服务，请先启动或检查连接地址。', { cause: error })
  }
  const [instance, me] = result
  if (instance?.product !== 'reader' || instance.protocol !== 1 || !instance.identity || me?.role !== 'owner') {
    throw Error('目标地址不是已验证的本机 Typocket 管理服务。')
  }
  if (expectedIdentity && instance.identity !== expectedIdentity) throw Error('目标 Typocket 使用不同的知识库目录。')
  return instance
}

export async function callTool(name, args = {}, options = {}) {
  const def = definitions.find(item => item[0] === name)
  if (!def) throw Error('Unknown tool')
  const [, , method, route, schema] = def
  for (const key of schema.required) if (args[key] === undefined) throw Error('Missing ' + key)
  for (const key of Object.keys(args)) if (!Object.hasOwn(schema.properties, key)) throw Error('Unknown argument ' + key)
  const endpoint = await connection(options)
  const base = new URL(endpoint.base)
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw Error('Typocket 连接地址无效。')
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/'
  const local = loopback.has(base.hostname)
  const token = process.env.READER_TOKEN
  if (!local && (!endpoint.explicit || base.protocol !== 'https:' || !token)) throw Error('远程连接需要显式 HTTPS 地址及已有 READER_TOKEN。')
  const requestSignal = () => {
    const timeout = AbortSignal.timeout(30000)
    return options.signal ? AbortSignal.any([timeout, options.signal]) : timeout
  }
  const headers = { 'content-type': 'application/json' }
  if (token) {
    if (!endpoint.explicit || (local && options.authorizeLocal)) {
      let instance
      try {
        instance = await verifyLocal(base, endpoint.expectedIdentity, requestSignal())
      } catch (error) {
        // A deliberately configured older service may hide its directory until
        // login. The host must then authorize the write without a directory.
        if (!endpoint.explicit || endpoint.expectedIdentity || options.signal?.aborted) throw error
      }
      await options.authorizeLocal?.(instance || {})
    }
    headers['x-reader-agent'] = token
  } else {
    const instance = await verifyLocal(base, endpoint.expectedIdentity, requestSignal())
    if (method !== 'GET' && instance.capabilities?.localAgentWrites !== true) {
      throw Error('请更新并重新启动本机 Typocket 服务，以启用可追溯的 Agent 写入。')
    }
    await options.authorizeLocal?.(instance)
    headers['x-typocket-client'] = 'local-agent'
  }
  const url = new URL('api/' + route, base)
  if (method === 'GET') {
    for (const [key, value] of Object.entries(args)) url.searchParams.set(key, String(value))
  }
  const res = await fetch(url, {
    method, headers, signal: requestSignal(), redirect: 'error',
    ...(method === 'GET' ? {} : { body: JSON.stringify(args) })
  })
  const out = await res.json()
  const file = out?.data?.file || out?.data?.path
  if (out.ok && file && ['reader_create', 'reader_read', 'reader_rename', 'reader_move'].includes(name)) {
    const segments = file.replace(/\.md$/i, '').split('/').map(encodeURIComponent).join('/')
    const page = new URL('doc/' + segments, base)
    page.searchParams.set('lib', file.split('/')[0])
    out.data.url = page.toString()
  }
  return out
}
const tools=definitions.map(([name,description,method,,inputSchema])=>({name,description,inputSchema,annotations:{readOnlyHint:method==='GET',destructiveHint:method!=='GET',idempotentHint:true,openWorldHint:false}}))
const shareBrief = {
  name:'share_snapshot', description:'为选定的文档或知识库准备临时只读分享提示词。',
  arguments:[
    {name:'scope', description:'document 或 library', required:true},
    {name:'target', description:'包含知识库的完整文档路径，或一个知识库名称', required:true},
    {name:'id', description:'单篇文档的稳定标识（可选）'}
  ]
}
const mcpVersions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
async function dispatch(m){
 if(m.id===undefined)return
 let result,error
 try{
 if(m.method==='initialize')result={protocolVersion:mcpVersions.includes(m.params?.protocolVersion) ? m.params.protocolVersion : mcpVersions[0],capabilities:{tools:{},prompts:{}},instructions:getReaderSkill().content,serverInfo:{name:'reader-workspace',version:manifest.version}}
 else if(m.method==='ping')result={}
 else if(m.method==='prompts/list')result={prompts:[shareBrief]}
 else if(m.method==='prompts/get'){
   if(m.params?.name!==shareBrief.name)error={code:-32602,message:'Unknown prompt'}
   else {
     try {
       const text=sharePrompt(BRAND_NAME,m.params.arguments || {})
       result={description:shareBrief.description,messages:[{role:'user',content:{type:'text',text}}]}
     } catch(e){error={code:-32602,message:e.message}}
   }
 }
 else if(m.method==='tools/list')result={tools}
 else if(m.method==='tools/call'){const out=await callTool(m.params?.name,m.params?.arguments);result={content:[{type:'text',text:JSON.stringify(out)}],isError:!out.ok}}
 else error={code:-32601,message:'Method not found'}
 }catch(e){if(m.method==='tools/call')result={content:[{type:'text',text:JSON.stringify({ok:false,error:e.message})}],isError:true};else error={code:-32603,message:e.message}}
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,...(error?{error}:{result})})+'\n')
}
// Node 24.0 and 24.1 do not yet expose import.meta.main.
const direct = import.meta.main ?? (process.argv[1] && existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)))
if(direct && process.argv.includes('--stdio')){
 const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});let queue=Promise.resolve();lines.on('line',line=>{queue=queue.then(async()=>{try{await dispatch(JSON.parse(line))}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n')}})})
}else if(direct && process.argv[2]){
 try{const out=await callTool(process.argv[2],JSON.parse(process.argv[3]||'{}'));process.stdout.write(JSON.stringify(out,null,2)+'\n');if(!out.ok)process.exitCode=1}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1}
}
