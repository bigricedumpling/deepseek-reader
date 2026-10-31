import {iconSvg} from './icon-catalog.js'
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
  const markup=iconSvg(icon.slice(5),'fill',64)
  const style='<style>:root{color:#454545}@media(prefers-color-scheme:dark){:root{color:#dedede}}</style>'
  href=svgUri(markup.replace(/(<svg[^>]*>)/, '$1'+style))
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
