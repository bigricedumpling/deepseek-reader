import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { digest, fault } from '../storage/workspace.js'
import { maxVideoBytes, videoTypes } from './video-types.js'

export function resources(repo) {
  repo.db.exec('CREATE TABLE IF NOT EXISTS asset_aliases (path TEXT PRIMARY KEY,id TEXT NOT NULL)')
  function legacy(doc) {
    if (!/\.md$/i.test(doc)) return
    const n=repo.node(doc), dir=path.posix.dirname(doc), folder=path.join(repo.root,dir,'.配图')
    if (!n || !fs.existsSync(folder)) return
    const prefix=digest(doc).slice(0,16)+'-'
    for (const name of fs.readdirSync(folder)) {
      if(!name.startsWith(prefix)||!/^\w{16}-\w{64}\.(png|jpe?g|webp|gif)$/i.test(name))continue
      const rel=path.posix.join(dir,'.配图',name)
      if(!repo.db.prepare('SELECT id FROM assets WHERE path=?').get(rel))repo.db.prepare('INSERT INTO assets VALUES (?,?,?,?)').run(randomUUID(),rel,n.id,'')
    }
  }
  function beforeMove(from) {
    const walk=rel=>{
      const st=fs.lstatSync(path.join(repo.root,rel));if(st.isSymbolicLink())return
      if(st.isDirectory()){
        repo.node(rel,'folder')
        for(const name of fs.readdirSync(path.join(repo.root,rel)))if(!name.startsWith('.'))walk(path.posix.join(rel,name))
      }else if(/\.(md|pdf|html?)$/i.test(rel)){repo.node(rel,/\.md$/i.test(rel)?'doc':'preview');legacy(rel)}
    };walk(from)
    for(const a of repo.db.prepare('SELECT * FROM assets').all())if(a.path.startsWith(from+'/'))repo.db.prepare('INSERT OR REPLACE INTO asset_aliases VALUES (?,?)').run(a.path,a.id)
  }
  function find(rel,id){return id?repo.db.prepare('SELECT * FROM assets WHERE id=?').get(id):repo.db.prepare('SELECT * FROM assets WHERE path=? OR id=(SELECT id FROM asset_aliases WHERE path=?)').get(rel,rel)}
  function upload(doc,mime,encoded, { allowVideo = false } = {}){
    if (allowVideo && Object.hasOwn(videoTypes, mime)) {
      if (!encoded || encoded.length > Math.ceil(maxVideoBytes / 3) * 4 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        throw fault('INVALID_VIDEO', '视频内容无效或超过 50 MB')
      }
      const bytes = Buffer.from(encoded, 'base64')
      if (!bytes.length || bytes.length > maxVideoBytes || !validVideo(bytes, mime)) {
        throw fault('INVALID_VIDEO', '视频内容无效或超过 50 MB')
      }
      return save(doc, mime, '.' + videoTypes[mime], bytes)
    }
    const ext={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif'}[mime]
    if(!ext)throw fault('INVALID_IMAGE','只支持 PNG、JPEG、WebP 和 GIF')
    if(!encoded||encoded.length>14*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw fault('INVALID_IMAGE','图片数据无效或超过 10 MB')
    const bytes=Buffer.from(encoded,'base64')
    const valid=mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mime==='image/gif'?['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6)):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'
    if(!valid||!bytes.length||bytes.length>10*1024*1024)throw fault('INVALID_IMAGE','图片内容或大小无效')
    return save(doc, mime, ext, bytes)
  }
  function save(doc, mime, ext, bytes) {
    const n=repo.node(doc);if(!n)throw fault('NOT_FOUND','文档不存在',404)
    const mediaKey = Object.hasOwn(videoTypes, mime) ? mime + ':' : ''
    const id=digest(n.id+':'+mediaKey+digest(bytes)),rel='.reader/assets/'+id+ext
    if(!fs.existsSync(path.join(repo.root,rel)))repo.write(path.join(repo.root,rel),bytes)
    repo.db.prepare('INSERT OR IGNORE INTO assets VALUES (?,?,?,?)').run(id,rel,n.id,mime)
    return {id,path:rel,doc,url:'/api/file?asset='+id}
  }
  return {legacy,beforeMove,find,upload}
}

function validVideo(bytes, mime) {
  if (mime === 'video/webm') {
    // EBML and a WebM document type in the header.
    return bytes.length >= 4 && bytes.readUInt32BE(0) === 0x1a45dfa3 && bytes.subarray(0, 128).includes('webm')
  }
  if (mime === 'video/ogg') return bytes.toString('ascii', 0, 4) === 'OggS'
  return bytes.length >= 16 && ['ftyp', 'moov', 'mdat', 'wide', 'free'].includes(bytes.toString('ascii', 4, 8))
}
