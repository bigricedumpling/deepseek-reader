<template><div class="gradient-cover" :class="[cover.preset,{'is-animated':animate}]" :style="style"><canvas ref="canvas" aria-hidden="true" /></div></template>
<script setup>
import {ref,computed,onMounted,onBeforeUnmount,watch} from 'vue'
const props=defineProps({cover:{type:Object,required:true}}),canvas=ref(null),visible=ref(true),reduced=ref(false)
const animate=computed(()=>props.cover.animated&&!reduced.value&&visible.value)
const style=computed(()=>({'--g1':props.cover.colors?.[0]||'#c7d2fe','--g2':props.cover.colors?.[1]||'#fbcfe8','--g3':props.cover.colors?.[2]||'#bae6fd'}))
let gl,program,frame,observer,media
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
function toLab(hex){const rgb=[0,2,4].map(i=>parseInt(hex.slice(1+i,3+i),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);const l=Math.cbrt(.4122214708*rgb[0]+.5363325363*rgb[1]+.0514459929*rgb[2]),m=Math.cbrt(.2119034982*rgb[0]+.6806995451*rgb[1]+.1073969566*rgb[2]),s=Math.cbrt(.0883024619*rgb[0]+.2817188376*rgb[1]+.6299787005*rgb[2]);return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s]}
function draw(time=0){if(!gl||!program)return;const c=canvas.value;const w=Math.min(1600,c.clientWidth*devicePixelRatio),h=Math.min(700,c.clientHeight*devicePixelRatio);if(c.width!==w||c.height!==h){c.width=w;c.height=h}gl.viewport(0,0,c.width,c.height);gl.uniform1f(gl.getUniformLocation(program,'t'),animate.value?time*.00012*(props.cover.speed||1):0);gl.uniform1f(gl.getUniformLocation(program,'seed'),props.cover.seed||0);gl.uniform1f(gl.getUniformLocation(program,'mode'),['mist','ribbon','grain','mesh'].indexOf(props.cover.preset));for(let i=0;i<3;i++){const lab=toLab(props.cover.colors?.[i]||['#c7d2fe','#fbcfe8','#bae6fd'][i]);gl.uniform3f(gl.getUniformLocation(program,'c'+i),...lab)}gl.drawArrays(gl.TRIANGLES,0,6);if(animate.value)frame=requestAnimationFrame(draw)}
function refresh(){cancelAnimationFrame(frame);frame=requestAnimationFrame(draw)}
onMounted(()=>{media=matchMedia('(prefers-reduced-motion: reduce)');reduced.value=media.matches;media.addEventListener('change',onMotion);observer=new IntersectionObserver(entries=>{visible.value=entries[0].isIntersecting});observer.observe(canvas.value);try{gl=canvas.value.getContext('webgl',{alpha:false,preserveDrawingBuffer:true});if(!gl)return;program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 p; varying vec2 uv; void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}'));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 uv; uniform float t,seed,mode; uniform vec3 c0,c1,c2;
void main(){
  vec2 p=uv;
  vec2 flow=vec2(sin(p.y*7.+t+seed)+sin(p.x*4.-t*.6),cos(p.x*6.-t*.7)+cos(p.y*4.+seed))*.023;
  p+=flow;
  float a=sin(p.x*5.+p.y*3.+t+seed)*.5+.5;
  float b=cos(p.y*5.-p.x*2.-t*.7)*.5+.5;
  if(mode==1.)a=sin(p.x*8.+sin(p.y*5.+t)*2.+t)*.5+.5;
  if(mode==3.){a=smoothstep(0.,1.,distance(p,vec2(.3+.1*sin(t),.3)));b=smoothstep(0.,.8,distance(p,vec2(.8,.7)));}
  vec3 lab=mix(mix(c0,c1,a),c2,b*.65);
  float l=lab.x+.3963377774*lab.y+.2158037573*lab.z;
  float m=lab.x-.1055613458*lab.y-.0638541728*lab.z;
  float s=lab.x-.0894841775*lab.y-1.291485548*lab.z;
  vec3 linear=vec3(4.0767416621*l*l*l-3.3077115913*m*m*m+.2309699292*s*s*s,-1.2684380046*l*l*l+2.6097574011*m*m*m-.3413193965*s*s*s,-.0041960863*l*l*l-.7034186147*m*m*m+1.707614701*s*s*s);
  vec3 color=mix(12.92*linear,1.055*pow(max(linear,0.),vec3(1./2.4))-.055,step(vec3(.0031308),linear));
  float grain=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233))+seed*13.17)*43758.5453)-.5;
  color=clamp(color+grain*(mode==2.?.075:.035),0.,1.);
  gl_FragColor=vec4(color,1.);
}`));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('link');gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);refresh()}catch{program=null}})
function onMotion(e){reduced.value=e.matches}
watch([()=>props.cover,animate],refresh,{deep:true})
onBeforeUnmount(()=>{cancelAnimationFrame(frame);observer?.disconnect();media?.removeEventListener('change',onMotion);gl?.getExtension('WEBGL_lose_context')?.loseContext()})
</script>
<style scoped>.gradient-cover{width:100%;height:100%;background:radial-gradient(ellipse at 20% 30%,var(--g1),transparent 75%),radial-gradient(ellipse at 80% 60%,var(--g2),var(--g3))}.gradient-cover canvas{width:100%;height:100%;display:block}@media print{canvas{max-height:220px}}</style>
