import fs from 'node:fs'
import { launchChrome, freePort, sleep } from '../../eval/server/browser.js'
const OUT = '/tmp/h5-show'
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })
const port = await freePort(); const dir = fs.mkdtempSync('/tmp/h5s-')
const chrome = launchChrome({ port, userDataDir: dir, size: { w: 1440, h: 1000 } })
let target = null
for (let i = 0; i < 30 && !target; i++) { try { const l = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); target = l.find(t => t.type === 'page') } catch {}; if (!target) await sleep(500) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')) })
let id = 0; const pending = new Map(); const cons = []
ws.onmessage = e => { const q = JSON.parse(e.data); if (q.id && pending.has(q.id)) { const p = pending.get(q.id); pending.delete(q.id); q.error ? p.rej(new Error(q.error.message)) : p.res(q.result); return } if (q.method === 'Runtime.exceptionThrown') cons.push((q.params.exceptionDetails?.exception?.description||'').slice(0,160)) }
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.log('  求值错: ' + (r.exceptionDetails.exception?.description||'').slice(0,120)); return null } return r.result.value }
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + '/' + n + '.png', Buffer.from(r.data, 'base64')); console.log('  已存 ' + n + '.png') }
const T = 'b6829fe6692f9cc05d4e3f0f8923073e'
const FILE = 'https://zangqucheng.site/deepseek/demo/api/file?path=' + encodeURIComponent('检索控制台.html')
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 2, mobile: false })
/* 先用编辑模式种 cookie，再直接打开 H5 文件本身 */
await send('Page.navigate', { url: 'https://zangqucheng.site/deepseek/demo/edit?token=' + T }); await sleep(8000)
await send('Page.navigate', { url: FILE }); await sleep(6000)
console.log('  标题: ' + await ev('document.title'))
console.log('  标签: ' + JSON.stringify(await ev("[...document.querySelectorAll('#tabs button')].map(b=>b.innerText)")))
console.log('  指标数: ' + await ev("document.querySelectorAll('.metric').length") + '  走势图: ' + await ev("!!document.querySelector('#trend svg')") + '  环形图: ' + await ev("!!document.querySelector('#donut svg')") + '  表格行: ' + await ev("document.querySelectorAll('#rows tr').length"))
console.log('  手机屏: ' + await ev("document.querySelectorAll('.phone').length") + ' 个')
await shot('1-看板')
const click = async (sel, txt) => ev("(function(){ var e=[...document.querySelectorAll('" + sel + "')].find(x=>x.innerText.indexOf('" + txt + "')>=0); if(!e) return 'no'; e.click(); return 'ok' })()")
console.log('  切 3D: ' + await click('nav.tabs button', '三维曲面')); await sleep(4000)
console.log('    WebGL: ' + await ev("!!document.getElementById('gl').getContext('webgl')") + '  fps: ' + await ev("document.getElementById('fps').innerText"))
await shot('2-3D')
console.log('  切 Canvas: ' + await click('nav.tabs button', 'Canvas 交互')); await sleep(3500)
console.log('    粒子: ' + await ev("document.getElementById('cnt').innerText"))
await shot('3-Canvas')
console.log('  切 手机: ' + await click('nav.tabs button', '移动端页面')); await sleep(2500)
console.log('    手机屏: ' + await ev("document.querySelectorAll('.phone').length") + '  概览行: ' + await ev("document.querySelectorAll('#m-list .row').length"))
await shot('4-手机')
console.log('  切 动效: ' + await click('nav.tabs button', '过渡与动效')); await sleep(2000)
await shot('5-动效')
console.log('异常: ' + (cons.length ? JSON.stringify(cons.slice(0,3)) : '无'))
ws.close(); chrome.kill()
try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) } catch {}