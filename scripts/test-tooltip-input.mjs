import assert from 'node:assert/strict'
import { installTooltips } from '../src/utils/tooltips.js'
const handlers = {}, pending = new Map(); let sequence = 0, hover = true
function element(title = '') {
  const attrs = new Map(title ? [['title', title]] : []), classes = new Set()
  return { dataset: {}, textContent: '', isConnected: true, style: {}, offsetWidth: 80, offsetHeight: 24,
    classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x) },
    getAttribute: x => attrs.get(x), hasAttribute: x => attrs.has(x), setAttribute: (x,v) => attrs.set(x,v), removeAttribute: x => attrs.delete(x),
    closest(){return this}, contains(x){return x===this}, getBoundingClientRect(){return {left:20,top:60,bottom:80,width:24}} }
}
let tooltip
globalThis.document = {createElement:()=>tooltip=element(),body:{append(){}},addEventListener:(name,fn)=>{handlers[name]=fn}}
globalThis.window = {setTimeout:fn=>{pending.set(++sequence,fn);return sequence},matchMedia:()=>({matches:hover}),addEventListener(){}}
globalThis.clearTimeout = id => pending.delete(id)
globalThis.MutationObserver = class {observe(){}}
globalThis.innerWidth = 375
const fire=(name,event)=>handlers[name](event), flush=()=>{for(const fn of pending.values())fn();pending.clear()}, visible=()=>tooltip.classList.contains('is-visible')
installTooltips()
const anchor=element('文档操作')
fire('pointerover',{pointerType:'touch',target:anchor});flush();assert.equal(visible(),false)
fire('pointerdown',{pointerType:'touch',target:anchor});fire('focusin',{target:anchor});flush();assert.equal(visible(),false);assert.equal(anchor.hasAttribute('title'),false);assert.equal(anchor.getAttribute('aria-label'),'文档操作')
fire('pointerover',{pointerType:'mouse',target:anchor});flush();assert.equal(visible(),true)
fire('pointerdown',{pointerType:'touch',target:anchor});assert.equal(visible(),false)
hover=false;fire('pointerover',{pointerType:'mouse',target:anchor});flush();assert.equal(visible(),false)
fire('keydown',{key:'Tab'});fire('focusin',{target:anchor});flush();assert.equal(visible(),true)
fire('keydown',{key:'Escape'});assert.equal(visible(),false)
anchor.setAttribute('aria-expanded','true');fire('focusin',{target:anchor});flush();assert.equal(visible(),false)
console.log('Tooltip input: touch suppressed, mouse hover, keyboard focus, expanded-menu suppression passed')
