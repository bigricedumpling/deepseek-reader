#!/usr/bin/env node
import readline from 'node:readline'
import { pathToFileURL } from 'node:url'
const str={type:'string'},obj=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false})
const source=obj({kind:{type:'string',enum:['conversation','workspace-file','import','manual']},workspace:str,reference:str,note:str},['kind'])
export const definitions=[
 ['reader_libraries','列出此连接已经授权的抽屉。跨工作区保存前先选目标抽屉。','GET','agent-libs',obj({})],
 ['reader_tree','列出已授权抽屉的文件。', 'GET','tree',obj({lib:str},['lib'])],
 ['reader_read','读取文档及 revision。更新前必须先读取。','GET','doc',obj({id:str,path:str})],
 ['reader_search','在指定抽屉内检索正文。','GET','search',obj({lib:str,q:str},['lib','q'])],
 ['reader_create','直接在目标抽屉新建文档，可附私人来源记录。重试必须使用相同 requestId。','POST','doc',obj({dir:str,name:str,content:str,source,requestId:str},['dir','name','content','requestId'])],
 ['reader_update','使用读取时的 revision 保存。冲突时重新读取并合并，不强制覆盖。','PUT','doc',obj({id:str,path:str,content:str,revision:str,requestId:str},['content','revision','requestId'])],
 ['reader_rename','重命名文档并保留稳定标识、资源归属、权限及旧路径别名。','PATCH','doc',obj({id:str,path:str,name:str,requestId:str},['name','requestId'])],
 ['reader_move','移动文档，只能在授权范围内移动。','PUT','move/doc',obj({file:str,dir:str,requestId:str},['file','dir','requestId'])],
 ['reader_metadata','读取图标、封面和版式元数据及版本。','GET','metadata',obj({id:str,path:str})],
 ['reader_set_metadata','带版本号更新页面元数据。','PUT','metadata',obj({id:str,path:str,revision:str,meta:{type:'object'},requestId:str},['revision','meta','requestId'])],
 ['reader_sources','读取文档的私人来源记录。','GET','sources',obj({id:str,path:str})],
 ['reader_add_source','给现有文档补充一条私人来源记录。','POST','sources',obj({id:str,path:str,source,requestId:str},['source','requestId'])],
 ['reader_upload_image','给已有文档保存图片，data 是图片的 base64 内容。','POST','asset',obj({path:str,mime:str,data:str,requestId:str},['path','mime','data','requestId'])],
 ['reader_history','查看文档历史版本。','GET','history',obj({id:str,path:str,version:str})]
]
export async function callTool(name,args={},options={}){
 const def=definitions.find(x=>x[0]===name);if(!def)throw Error('Unknown tool')
 const base=process.env.READER_URL||'http://127.0.0.1:8090',token=process.env.READER_TOKEN
 if(!token)throw Error('请在阅读器的 Agent 连接中生成令牌并设置 READER_TOKEN')
 const url=new URL(base.replace(/\/$/,'')+'/api/'+def[3]);if(url.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('远程连接必须使用 HTTPS')
 const method=def[2],schema=def[4];for(const k of schema.required)if(args[k]===undefined)throw Error('Missing '+k)
 for(const k of Object.keys(args))if(!Object.hasOwn(schema.properties,k))throw Error('Unknown argument '+k)
 if(method==='GET')for(const[k,v]of Object.entries(args))url.searchParams.set(k,String(v))
 const timeout=AbortSignal.timeout(30000)
 const signal=options.signal?AbortSignal.any([timeout,options.signal]):timeout
 const res=await fetch(url,{method,headers:{'content-type':'application/json','x-reader-agent':token},...(method==='GET'?{}:{body:JSON.stringify(args)}),signal,redirect:'error'})
 const out=await res.json()
 const file=out?.data?.file||out?.data?.path
 if(out.ok && file && ['reader_create','reader_read','reader_rename','reader_move'].includes(name)){
  const segments=file.replace(/\.(md|pdf)$/i,'').split('/').map(encodeURIComponent).join('/')
  const lib=file.split('/')[0]
  const page=new URL(base.replace(/\/$/,'')+'/doc/'+segments)
  page.searchParams.set('lib',lib)
  out.data.url=page.toString()
 }
 return out
}
const tools=definitions.map(([name,description,method,,inputSchema])=>({name,description,inputSchema,annotations:{readOnlyHint:method==='GET',destructiveHint:method!=='GET',idempotentHint:true,openWorldHint:false}}))
async function dispatch(m){
 if(m.id===undefined)return
 let result,error
 try{
 if(m.method==='initialize')result={protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'reader-workspace',version:'1.0.0'}}
 else if(m.method==='ping')result={}
 else if(m.method==='tools/list')result={tools}
 else if(m.method==='tools/call'){const out=await callTool(m.params?.name,m.params?.arguments);result={content:[{type:'text',text:JSON.stringify(out)}],isError:!out.ok}}
 else error={code:-32601,message:'Method not found'}
 }catch(e){if(m.method==='tools/call')result={content:[{type:'text',text:JSON.stringify({ok:false,error:e.message})}],isError:true};else error={code:-32603,message:e.message}}
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,...(error?{error}:{result})})+'\n')
}
const direct=process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href
if(direct && process.argv.includes('--stdio')){
 const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});let queue=Promise.resolve();lines.on('line',line=>{queue=queue.then(async()=>{try{await dispatch(JSON.parse(line))}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n')}})})
}else if(direct && process.argv[2]){
 try{const out=await callTool(process.argv[2],JSON.parse(process.argv[3]||'{}'));process.stdout.write(JSON.stringify(out,null,2)+'\n');if(!out.ok)process.exitCode=1}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1}
}
