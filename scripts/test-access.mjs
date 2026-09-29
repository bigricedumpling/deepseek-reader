import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
const root=fs.mkdtempSync(path.join(os.tmpdir(),'reader-access-'))
process.env.DOCS_ROOT=root
process.env.READER_PASSWORD='test-only-password'
for(const dir of ['Public','Private','Demo','Demo/Protected'])fs.mkdirSync(path.join(root,dir),{recursive:true})
for(const dir of ['Public','Private','Demo','Demo/Protected'])fs.writeFileSync(path.join(root,dir,'doc.md'),'# Original\n')
fs.writeFileSync(path.join(root,'.分享.json'),JSON.stringify({shared:{Public:true,Private:false,Demo:true},locked:{Public:true,Demo:false,'Demo/Protected':true}}))
const {handleApi,share}=await import('../server/content-api.js')
const {roleOf}=await import('../server/share.js')
async function request(method,url,body,role='guest'){
 if(method==='PUT'&&url==='/api/doc'&&!body.revision){const doc=await request('GET','/api/doc?path='+encodeURIComponent(body.path),null,'owner');body={...body,revision:doc.data.revision}}
 const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{method,url,headers:{'content-type':'application/json'},socket:{remoteAddress:'test'}})
 return new Promise(resolve=>handleApi(req,{statusCode:200,setHeader(){},end(s){resolve({status:this.statusCode,...JSON.parse(s)})}},{role}))
}
try{
 assert.equal(roleOf({headers:{cookie:'reader_session='+share.token('owner')},socket:{}},new URL('http://localhost/api/me'),share),'owner')
 assert.equal(roleOf({headers:{'x-reader-mode':'owner'},socket:{}},new URL('http://localhost/'),share),'guest')
 assert.equal(roleOf({headers:{'x-reader-view':'public',cookie:'reader_session='+share.token('owner')},socket:{}},new URL('http://localhost/'),share),'guest','公开视角不能被管理会话覆盖')
 assert.equal(roleOf({headers:{referer:'https://example.test/onlyread/Public/doc',cookie:'reader_session='+share.token('owner')},socket:{}},new URL('http://localhost/api/file'),share),'guest','原生资源请求保持公开视角')
 assert.equal(roleOf({headers:{cookie:'reader_session=%broken'},socket:{}},new URL('http://localhost/'),share),'guest')
 assert.equal((await request('GET','/api/colw?file=Private/doc.md')).ok,false)
 assert.equal((await request('GET','/api/colw?file=Demo/doc.md')).ok,true)
 assert.equal((await request('GET','/api/colw?file=Demo/../Private/doc.md')).ok,false)
 assert.equal((await request('DELETE','/api/session')).ok,true)
 assert.equal((await request('GET','/api/doc?path=Private/doc.md')).ok,false)
 assert.equal((await request('GET','/api/tree?lib=Private')).ok,false)
 const tree=await request('GET','/api/tree');assert(!JSON.stringify(tree).includes('Private'))
 for(const role of ['guest']) for(const [method,url,body] of [
 ['PUT','/api/doc',{path:'Public/doc.md',content:'bad'}],['PATCH','/api/doc',{path:'Public/doc.md',name:'bad'}],
 ['DELETE','/api/category',{path:'Public'}],['POST','/api/doc',{dir:'Public',name:'bad'}],
 ['PUT','/api/order',{parent:'Public',names:['doc.md']}],['PUT','/api/move/doc',{file:'Public/doc.md',dir:'Demo'}],
 ['PUT','/api/move/doc',{file:'Demo/doc.md',dir:'Public'}],['DELETE','/api/category',{path:'Demo'}],
 ['PUT','/api/foldable',{path:'Public/doc.md',key:'1|Original|0',on:true}],['PUT','/api/share',{path:'Public',editable:true}]
 ]) assert.equal((await request(method,url,body,role)).ok,false,method+url+role)
 assert.equal((await request('PUT','/api/doc',{path:'Demo/doc.md',content:'# Changed\n'})).ok,true)
 assert.equal((await request('POST','/api/doc',{dir:'Demo',name:'new'})).ok,true)
 assert.equal((await request('PUT','/api/access',{path:'Public',locked:false,password:'wrong'},'owner')).ok,false)
 assert.equal((await request('PUT','/api/access',{path:'Public/doc.md',locked:false,password:process.env.READER_PASSWORD})).ok,false)
 assert.equal((await request('PUT','/api/access',{path:'Public',locked:false,password:process.env.READER_PASSWORD})).ok,true)
 assert.equal((await request('PUT','/api/doc',{path:'Public/doc.md',content:'# Changed\n'})).ok,true)
 assert.equal((await request('PUT','/api/access',{path:'Public',locked:true,password:process.env.READER_PASSWORD})).ok,true)
 assert.equal((await request('PUT','/api/doc',{path:'Public/doc.md',content:'# Admin edit\n'},'owner')).ok,true)
 assert.equal(share.isLocked('Public'),true,'管理员编辑不能解锁访客权限')
 assert.equal((await request('PUT','/api/doc',{path:'Public/doc.md',content:'bad'})).ok,false)
 assert.equal(fs.readFileSync(path.join(root,'Public/doc.md'),'utf8'),'# Admin edit\n')
 assert.equal((await request('GET','/api/doc?path=Demo/../Private/doc.md')).ok,false)
 assert.equal((await request('PUT','/api/move/doc',{file:'Private/doc.md',dir:'Demo'},'owner')).ok,true)
 assert.equal(share.isShared('Demo/doc 2.md'),false,'moving private content must preserve privacy')
 share.setShared('Demo',false)
 assert.equal(share.isLocked('Demo'),false,'隐藏不应自动锁定')
 share.setLocked('Demo',true)
 assert.equal(share.isShared('Demo'),false,'锁定不应改变公开状态')
 share.setShared('Demo',true)
 assert.equal(share.isLocked('Demo'),true,'公开不应自动解锁')
 share.setLocked('Demo',false)
 assert.equal(share.isShared('Demo'),true,'解锁不应改变公开状态')
 console.log('公开范围、继承锁、管理密码、读写/移动/删除/排序防绕过与公开示例编辑均通过')
}finally{fs.rmSync(root,{recursive:true,force:true})}
