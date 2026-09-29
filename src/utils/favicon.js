import {h,render} from 'vue'
import {iconNames} from './icon-catalog.js'
import {assetUrl,API_BASE} from './api.js'
const svgUri=svg=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)
const escapeXml=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))
const cache=new Map()
export function faviconHref(value) {
 const icon=String(value||'')
 if(!icon||icon==='__SITE_ICON__')return API_BASE+'/favicon.svg'
 if(/^(data:image\/|\/|https?:\/\/)/.test(icon))return assetUrl(icon)
 if(cache.has(icon))return cache.get(icon)
 let href
 if(icon.startsWith('icon:')){
  const component=iconNames[icon.slice(5)]||iconNames.file,host=document.createElement('div')
  render(h(component,{size:64,weight:'fill'}),host)
  const svg=host.querySelector('svg');svg.setAttribute('xmlns','http://www.w3.org/2000/svg')
  const style=document.createElementNS('http://www.w3.org/2000/svg','style')
  style.textContent=':root{color:#454545}@media(prefers-color-scheme:dark){:root{color:#dedede}}'
  svg.prepend(style);href=svgUri(svg.outerHTML);render(null,host)
 }else{
  href=svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="32" y="51" text-anchor="middle" font-size="54" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">'+escapeXml(icon)+'</text></svg>')
 }
 cache.set(icon,href);return href
}
export function setFavicon(value){
 const href=faviconHref(value),previous=[...document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"]')]
 if(previous.length===1&&previous[0].getAttribute('href')===href)return
 const link=document.createElement('link');link.rel='icon';link.href=href
 if(href.startsWith('data:image/svg+xml')||/\.svg(?:[?#]|$)/i.test(href)){link.type='image/svg+xml';link.sizes='any'}
 document.head.append(link);previous.forEach(el=>el.remove())
}
