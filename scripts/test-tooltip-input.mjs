import assert from 'node:assert/strict'
import { installTooltips } from '../src/utils/tooltips.js'
const handlers = {}, pending = new Map(); let sequence = 0, hover = true
function element(title = '', parentElement = null) {
  const attrs = new Map(title ? [['title', title]] : []), classes = new Set()
  return { parentElement, dataset: {}, textContent: '', isConnected: true, style: {}, offsetWidth: 80, offsetHeight: 24,
    classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x) },
    getAttribute: x => attrs.get(x), hasAttribute: x => attrs.has(x), setAttribute: (x,v) => attrs.set(x,v), removeAttribute: x => attrs.delete(x),
    matches(selector) {
      if (selector === '[data-tooltip]') return this.dataset.tooltip !== undefined
      if (selector.startsWith('[')) return attrs.has(selector.slice(1, -1))
      if (selector.startsWith('.')) return classes.has(selector.slice(1))
      if (selector === 'input' || selector === 'input:focus') return false
      throw Error('Unexpected selector: ' + selector)
    },
    closest(selector) {
      const selectors = selector.split(',').map(part => part.trim())
      for (let node = this; node; node = node.parentElement) {
        if (selectors.some(part => node.matches(part))) return node
      }
      return null
    },
    querySelectorAll(selector) { assert.equal(selector, 'span,input'); return [] },
    contains(node) { for (; node; node = node.parentElement) if (node === this) return true; return false }, getBoundingClientRect(){return {left:20,top:60,bottom:80,width:24}} }
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

// The SVG inside a button resolves to its labelled parent. Authored content
// with a native title stays outside application tooltip behavior.
const button = element('Copy for Agent'), icon = element('', button)
hover = true
fire('pointerover', {pointerType:'mouse', target:icon}); flush()
assert.equal(visible(), true)
assert.equal(tooltip.textContent, 'Copy for Agent')
fire('pointerout', {target:icon, relatedTarget:null})
for (const section of ['editor', 'reader']) {
  const content = element()
  if (section === 'editor') content.classList.add('ProseMirror')
  else content.setAttribute('data-user-content', '')
  const authored = element('Original title', content)
  fire('pointerdown', {pointerType:'touch', target:authored})
  fire('pointerover', {pointerType:'mouse', target:authored}); flush()
  assert.equal(visible(), false)
  assert.equal(authored.getAttribute('title'), 'Original title')
}

// An action result can appear before or during the hover delay.
fire('pointerover', {pointerType:'mouse', target:icon})
button.setAttribute('data-feedback-active', '')
flush(); assert.equal(visible(), false)
fire('keydown', {key:'Tab'}); fire('focusin', {target:button}); flush()
assert.equal(visible(), false)
button.removeAttribute('data-feedback-active')
fire('focusin', {target:button}); flush()
assert.equal(visible(), true)
console.log('PASS: touch suppression and accessible names, mouse and keyboard triggers, expanded controls, authored content and action feedback')
