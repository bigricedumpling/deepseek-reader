import fs from 'node:fs'
import path from 'node:path'
import { randomUUID, randomBytes } from 'node:crypto'
import { digest, fault } from '../storage/workspace.js'
import { recordSource } from './sources.js'

export function documentRoutes(repo,{share,assertFile,assertMd,assertVisible}) {
  function current(body,url) {
    const id=body.id||url.searchParams.get('id')
    const rel=id?repo.byId(id)?.path:body.path||body.file||url.searchParams.get('path')
    if(!rel)throw fault('NOT_FOUND','找不到文档',404)
    assertVisible(rel);const abs=assertFile(rel)
    if(!fs.existsSync(abs))throw fault('NOT_FOUND','文档不存在',404)
    return repo.node(rel)
  }
  function validateMeta(value) {
    const out={}
    for(const key of Object.keys(value||{}))if(!['icon','description','cover','layout'].includes(key))throw fault('INVALID_METADATA','不支持的页面属性：'+key)
    if(value.icon!==undefined){const icon=String(value.icon);if(icon.length>200000||(!icon.startsWith('data:image/')&&!icon.startsWith('/')&&icon.length>40))throw fault('INVALID_METADATA','图标无效');if(/^data:image\/(?!png|jpeg|webp|gif)/.test(icon))throw fault('INVALID_METADATA','图标格式无效');out.icon=icon}
    if(value.description!==undefined)out.description=String(value.description).slice(0,1000)
    if(value.layout!==undefined){if(!['default','narrow','wide','full'].includes(value.layout))throw fault('INVALID_METADATA','版式无效');out.layout=value.layout}
    if(value.cover!==undefined){
      const c=value.cover
      if(c===null)out.cover=null
      else{
        if(!['gradient','image'].includes(c.type))throw fault('INVALID_METADATA','封面类型无效')
        if(c.type==='image' && !/^[a-f\d-]{32,64}$/i.test(c.asset||''))throw fault('INVALID_METADATA','封面资源无效')
        if(c.colors!==undefined&&!Array.isArray(c.colors))throw fault('INVALID_METADATA','颜色无效')
        const colors=(c.colors||['#dbeafe','#e9d5ff','#fce7f3']).slice(0,4)
        if(colors.length<3)throw fault('INVALID_METADATA','至少需要三种颜色')
        if(colors.some(x=>!/^#[a-f\d]{6}$/i.test(x)))throw fault('INVALID_METADATA','颜色无效')
        out.cover={type:c.type,asset:c.asset||'',preset:['mist','ribbon','grain','mesh'].includes(c.preset)?c.preset:'mist',colors,animated:!!c.animated,height:['small','medium','large'].includes(c.height)?c.height:'medium',position:Math.max(0,Math.min(100,Number.isFinite(Number(c.position))?Number(c.position):50)),seed:Math.max(0,Number(c.seed)||0),speed:Math.max(1,Math.min(3,Number(c.speed)||1)),grain:Math.max(0,Math.min(1,Number(c.grain)||0))}
      }
    }
    return out
  }
  return {
    'GET /sources':async(body,url)=>{
      const n=current(body,url)
      const sources=repo.db.prepare('SELECT id,kind,workspace,reference,note,at FROM sources WHERE node=? ORDER BY at DESC,id DESC').all(n.id)
      return {ok:true,data:{id:n.id,path:n.path,sources}}
    },
    'POST /sources':async(body,url)=>{
      const n=current(body,url)
      const id=recordSource(repo,n.id,body.source)
      return {ok:true,data:{id,path:n.path,documentId:n.id}}
    },
    'GET /metadata':async(body,url)=>{const n=current(body,url);return {ok:true,data:{id:n.id,path:n.path,meta:n.meta,revision:digest(JSON.stringify(n.meta))}}},
    'PUT /metadata':async(body,url)=>{
      const n=current(body,url),revision=digest(JSON.stringify(n.meta))
      if(body.revision!==revision)throw fault('CONFLICT','页面设置已变化，请重新打开设置',409,{meta:n.meta,revision})
      const patch=validateMeta(body.meta)
      if(patch.cover?.type==='image'){
        const a=repo.db.prepare('SELECT owner FROM assets WHERE id=?').get(patch.cover.asset)
        if(!a||a.owner!==n.id)throw fault('FORBIDDEN','封面必须属于当前文档',403)
      }
      const meta={...n.meta,...patch}
      repo.db.prepare('UPDATE nodes SET meta=? WHERE id=?').run(JSON.stringify(meta),n.id)
      return {ok:true,data:{id:n.id,path:n.path,meta,revision:digest(JSON.stringify(meta))}}
    },
    'GET /resolve':async(body,url)=>{
      const id=url.searchParams.get('id'),n=id?repo.byId(id):repo.node(repo.resolve(url.searchParams.get('path')||''))
      if(!n || n.path.split('/').some(x=>x.startsWith('.')) || !fs.existsSync(path.join(repo.root,n.path)))throw fault('NOT_FOUND','文档不存在',404)
      assertFile(n.path)
      return {ok:true,data:{id:n.id,path:n.path,meta:n.meta}}
    },
    'GET /history':async(body,url)=>{
      const n=current(body,url)
      const items=repo.db.prepare('SELECT id,revision,at FROM versions WHERE node=? ORDER BY at DESC LIMIT 100').all(n.id)
      const id=url.searchParams.get('version')
      const v=id&&repo.db.prepare('SELECT * FROM versions WHERE id=? AND node=?').get(id,n.id)
      if(id&&!v)throw fault('NOT_FOUND','版本不存在',404)
      return {ok:true,data:{items,...(v?{content:fs.readFileSync(path.join(repo.root,v.path),'utf8')}: {})}}
    },
    'GET /search':async(body,url,ctx)=>{
      const query=String(url.searchParams.get('q')||'').trim().slice(0,200),lib=url.searchParams.get('lib')||''
      if(!query)return {ok:true,data:{hits:[]}}
      const hits=[]
      for(const n of repo.db.prepare("SELECT * FROM nodes WHERE kind='doc'").all()){
        if(lib&&n.path!==lib&&!n.path.startsWith(lib+'/'))continue
        if(n.path.split('/').some(x=>x.startsWith('.'))||!fs.existsSync(path.join(repo.root,n.path)))continue
        if(ctx.role!=='owner'&&!share.isShared(n.path))continue
        let abs;try{abs=assertMd(n.path)}catch{continue}
        const lines=fs.readFileSync(abs,'utf8').split('\n')
        for(let i=0;i<lines.length;i++)if(lines[i].toLocaleLowerCase().includes(query.toLocaleLowerCase())){
          hits.push({id:n.id,file:n.path,name:path.basename(n.path,'.md'),line:i+1,text:lines[i].slice(0,400)});if(hits.length>=100)return {ok:true,data:{hits,truncated:true}}
        }
      }
      return {ok:true,data:{hits,truncated:false}}
    },
    'GET /agent-keys':async()=>({ok:true,data:repo.db.prepare('SELECT id,name,scopes,permissions,expires,revoked FROM credentials').all().map(r=>({...r,scopes:JSON.parse(r.scopes),permissions:JSON.parse(r.permissions)}))}),
    'POST /agent-keys':async body=>{
      if(!Array.isArray(body.scopes)||!body.scopes.length)throw fault('INVALID_SCOPE','请选择抽屉')
      const scopes=body.scopes.map(rel=>{assertVisible(rel);if(rel.includes('/')||!fs.statSync(path.join(repo.root,rel)).isDirectory())throw fault('INVALID_SCOPE','抽屉范围无效');return repo.node(rel,'folder').id})
      const permissions=body.write?['read','write']:['read'],token=randomBytes(32).toString('hex'),id=randomUUID()
      const expires=Date.now()+Math.max(1,Math.min(365,Number(body.days)||30))*86400000
      repo.db.prepare('INSERT INTO credentials VALUES (?,?,?,?,?,?,0)').run(id,digest(token),String(body.name||'Agent').slice(0,80),JSON.stringify(scopes),JSON.stringify(permissions),expires)
      return {ok:true,data:{id,token,expires,permissions}}
    },
    'DELETE /agent-keys':async body=>{repo.db.prepare('UPDATE credentials SET revoked=1 WHERE id=?').run(String(body.id));return {ok:true}},
    'GET /audit':async()=>({ok:true,data:repo.db.prepare('SELECT * FROM operations ORDER BY at DESC LIMIT 100').all()}),
    'GET /metadata-export':async()=>({ok:true,data:{schemaVersion:2,nodes:repo.db.prepare('SELECT * FROM nodes').all(),assets:repo.db.prepare('SELECT * FROM assets').all(),settings:repo.db.prepare('SELECT * FROM settings').all(),aliases:repo.db.prepare('SELECT * FROM aliases').all(),sources:repo.db.prepare('SELECT * FROM sources').all()}})
  }
}
