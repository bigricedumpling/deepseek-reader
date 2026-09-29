#!/usr/bin/env node
import readline from 'node:readline'
const str={type:'string'},obj=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false})
const definitions=[
 ['reader_tree','列出已授权知识库的文件。', 'GET','tree',obj({lib:str},['lib'])],
 ['reader_read','读取文档及 revision。更新前必须先读取。','GET','doc',obj({id:str,path:str})],
 ['reader_search','在指定知识库内检索正文。','GET','search',obj({lib:str,q:str},['lib','q'])],
 ['reader_create','新建文档。重试必须使用相同 requestId。','POST','doc',obj({dir:str,name:str,content:str,requestId:str},['dir','name','content','requestId'])],
 ['reader_update','使用读取时的 revision 保存。冲突时重新读取并合并，不强制覆盖。','PUT','doc',obj({id:str,path:str,content:str,revision:str,requestId:str},['content','revision','requestId'])],
 ['reader_rename','重命名文档并保留稳定标识、资源归属、权限及旧路径别名。','PATCH','doc',obj({id:str,path:str,name:str,requestId:str},['name','requestId'])],
 ['reader_move','移动文档，只能在授权范围内移动。','PUT','move/doc',obj({file:str,dir:str,requestId:str},['file','dir','requestId'])],
 ['reader_metadata','读取图标、封面和版式元数据及版本。','GET','metadata',obj({id:str,path:str})],
 ['reader_set_metadata','带版本号更新页面元数据。','PUT','metadata',obj({id:str,path:str,revision:str,meta:{type:'object'},requestId:str},['revision','meta','requestId'])],
 ['reader_history','查看文档历史版本。','GET','history',obj({id:str,path:str,version:str})]
]
export async function callTool(name,args={}){
 const def=definitions.find(x=>x[0]===name);if(!def)throw Error('Unknown tool')
 const base=process.env.READER_URL||'http://127.0.0.1:8090',token=process.env.READER_TOKEN
 if(!token)throw Error('请在阅读器的 Agent 连接中生成令牌并设置 READER_TOKEN')
 const url=new URL(base.replace(/\/$/,'')+'/api/'+def[3]);if(url.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('远程连接必须使用 HTTPS')
 const method=def[2],schema=def[4];for(const k of schema.required)if(args[k]===undefined)throw Error('Missing '+k)
 for(const k of Object.keys(args))if(!Object.hasOwn(schema.properties,k))throw Error('Unknown argument '+k)
 if(method==='GET')for(const[k,v]of Object.entries(args))url.searchParams.set(k,String(v))
 const res=await fetch(url,{method,headers:{'content-type':'application/json','x-reader-agent':token},...(method==='GET'?{}:{body:JSON.stringify(args)}),signal:AbortSignal.timeout(30000),redirect:'error'})
 return await res.json()
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
if(process.argv.includes('--stdio')){
 const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});let queue=Promise.resolve();lines.on('line',line=>{queue=queue.then(async()=>{try{await dispatch(JSON.parse(line))}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n')}})})
}else if(process.argv[2]){
 try{const out=await callTool(process.argv[2],JSON.parse(process.argv[3]||'{}'));process.stdout.write(JSON.stringify(out,null,2)+'\n');if(!out.ok)process.exitCode=1}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1}
}
