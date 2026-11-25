// All coordinates are relative to the cover. Exports and the editor draw the same first frame.
import { coverPalettes } from './cover-presets.js'

const TAU = Math.PI * 2
const textures = new WeakMap()
const ramps = new Map()

// Native gradients blend their stops in sRGB. Perceptual intermediate stops keep
// complementary hues and the lightness of pale colors from sinking in the middle.
function oklab([r, g, b]) {
  const linear = value => (value /= 255) <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
  r = linear(r); g = linear(g); b = linear(b)
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b)
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b)
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b)
  return [.2104542553*l + .793617785*m - .0040720468*s,
    1.9779984951*l - 2.428592205*m + .4505937099*s, .0259040371*l + .7827717662*m - .808675766*s]
}
function srgb([L, a, b]) {
  const l = (L + .3963377774*a + .2158037573*b) ** 3
  const m = (L - .1055613458*a - .0638541728*b) ** 3
  const s = (L - .0894841775*a - 1.291485548*b) ** 3
  const encode = v => Math.max(0, Math.min(255,
    Math.round(255 * (v <= .0031308 ? 12.92*v : 1.055*Math.pow(v, 1/2.4) - .055))))
  return [encode(4.0767416621*l - 3.3077115913*m + .2309699292*s),
    encode(-1.2684380046*l + 2.6097574011*m - .3413193965*s), encode(-.0041960863*l - .7034186147*m + 1.707614701*s)]
}
function addRamp(fill, colors) {
  const key = colors.join('|')
  let stops = ramps.get(key)
  if (!stops) {
    const labs = colors.map(oklab)
    stops = []
    for (let i = 0; i < labs.length - 1; i++) {
      for (let k = 0; k < 4; k++) {
        const t = k / 4
        const blend = labs[i].map((v, channel) => v + t * (labs[i + 1][channel] - v))
        stops.push([(i + t) / (labs.length - 1), ink(srgb(blend))])
      }
    }
    stops.push([1, ink(colors.at(-1))])
    if (ramps.size >= 48) ramps.delete(ramps.keys().next().value)
    ramps.set(key, stops)
  }
  for (const [offset, color] of stops) fill.addColorStop(offset, color)
}

function rgb(hex) {
  const value = parseInt(hex.slice(1), 16)
  return [value >> 16, (value >> 8) & 255, value & 255]
}
function mix(a, b, weight) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * weight))
}
function ink(color, alpha = 1) {
  return 'rgba(' + color.join(',') + ',' + alpha + ')'
}
function wash(ctx, color, x, y, radiusX, radiusY) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(radiusX, radiusY)
  const fill = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  fill.addColorStop(0, ink(color))
  fill.addColorStop(.35, ink(color, .86))
  fill.addColorStop(1, ink(color, 0))
  ctx.fillStyle = fill
  ctx.fillRect(-1, -1, 2, 2)
  ctx.restore()
}

function paintField(ctx, colors, t, seed, soft) {
  const [a, b, c] = colors
  const field = ctx.createLinearGradient(0, 1, .83, 0)
  addRamp(field, colors)
  ctx.fillStyle = field
  ctx.fillRect(0, 0, 1, 1)
  const x = .36 + .18 * Math.sin(seed + t)
  const y = .52 + .25 * Math.cos(seed * 2 - t)
  wash(ctx, a, x - .13, y - .24, soft ? .75 : .49, .9)
  wash(ctx, c, .74 + .13 * Math.cos(t + seed), .64 + .23 * Math.sin(t - seed), soft ? .7 : .42, .87)
  wash(ctx, b, x + .17, .57 + .22 * Math.sin(seed - t), soft ? .44 : .31, .74)
  if (soft) wash(ctx, mix(b, [255,255,255], .24), .58 + .11 * Math.cos(seed + t), .15, .45, .52)
}

function ridge(x, t, seed, layer) {
  return .25 + layer * .17
    + .16 * Math.sin(4.8 * x + seed + t + layer * .67)
    + .11 * Math.sin(7.3 * x - .6 * t + seed * .7 + layer * .93)
}

// Small horizontal differences between bands reveal the shape of the flowing surface.
function paintRibbons(ctx, colors, t, seed) {
  paintField(ctx, colors, t, seed, false)
  for (let i = 0; i < 5; i++) {
    const top = .11 + .14 * i
    const gradient = ctx.createLinearGradient(0, top - .12, .24, top + .6)
    gradient.addColorStop(0, ink(colors[i % colors.length], .94))
    gradient.addColorStop(1, ink(colors[(i + 1) % colors.length], .48))
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.moveTo(0, 1)
    for (let j = 0; j <= 80; j++) ctx.lineTo(j / 80, ridge(j / 80, t, seed, i))
    ctx.lineTo(1, 1)
    ctx.closePath()
    ctx.fill()
  }
}

function paperTexture(canvas, seed) {
  const cached = textures.get(canvas)
  if (cached?.seed === seed) return cached.tile
  const tile = canvas.ownerDocument.createElement('canvas')
  tile.width = tile.height = 96
  const pen = tile.getContext('2d')
  if (!pen) return null
  const image = pen.createImageData(96, 96)
  let state = (Math.round(seed * 5000) + 1) >>> 0
  for (let i = 0; i < image.data.length; i += 4) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    const value = state & 0x80000000 ? 255 : 0
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value
    image.data[i + 3] = (state >>> 23) & 127
  }
  pen.putImageData(image, 0, 0)
  textures.set(canvas, { seed, tile })
  return tile
}

// Pixel silhouettes stay on one square grid at any aspect ratio.
function paintPixels(ctx, w, h, colors, t, seed) {
  const [a, b, c] = colors
  const cell = Math.max(2, Math.round(h / 54))
  const cols = Math.ceil(w / cell)
  const rows = Math.ceil(h / cell)
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, ink(mix(c, a, .22)))
  sky.addColorStop(.72, ink(b))
  sky.addColorStop(1, ink(a))
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = ink(colors[3] || mix(b, [255, 255, 245], .54))
  const radius = Math.max(3, Math.round(rows * .115))
  const cx = Math.round(cols * (.64 + .12 * Math.sin(seed + .4 * t)))
  const cy = Math.round(rows * (.25 + .065 * Math.sin(seed - .6 * t)))
  for (let y = -radius; y <= radius; y++) {
    const dx = Math.floor(Math.sqrt(radius * radius - y * y))
    ctx.fillRect((cx - dx) * cell, (cy + y) * cell, (dx * 2 + 1) * cell, cell)
  }
  for (let band = 0; band < 3; band++) {
    const color = [mix(b, a, .42), mix(c, a, .55), mix(a, [28, 34, 48], .38)][band]
    ctx.fillStyle = ink(color)
    for (let col = 0; col < cols; col++) {
      const x = (col + .5) / cols
      const edge = .45 + band * .14 + .1 * Math.sin(x * 6 + seed + t * (.48 + band * .15) + band)
        + .043 * Math.cos(x * 15 - seed - t * .33 + band)
      const row = Math.round(rows * edge)
      ctx.fillRect(col * cell, row * cell, cell, h - row * cell)

    }
  }
}

function paintHalftone(ctx, w, h, colors, t, seed) {
  const [a, b, c] = colors
  const base = ctx.createLinearGradient(0, 0, w, h)
  base.addColorStop(0, ink(b))
  base.addColorStop(.62, ink(colors[3] || mix(b, c, .55)))
  base.addColorStop(1, ink(c))
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)
  const step = Math.max(3, h / 25, w / 155)
  ctx.fillStyle = ink(mix(a, [25, 34, 46], .26))
  ctx.beginPath()
  for (let row = -1; row <= h / step; row++) {
    const y = (row + .5) * step
    for (let x = (row % 2) * step / 2; x < w + step; x += step) {
      const dist = Math.abs(y / h - ridge(x / w, t, seed, 1))
      const radius = step * (.07 + .39 * Math.exp(-13 * dist * dist))
      ctx.moveTo(x + radius, y)
      ctx.arc(x, y, radius, 0, TAU)
    }
  }
  ctx.fill()
}

/** Draw the frame in seconds into the provided HTML canvas, including detached export canvases. */
export function renderCoverFrame(canvas, cover, seconds = 0) {
  const ctx = canvas?.getContext('2d')
  if (!ctx || !canvas.width || !canvas.height) return false
  const { width: w, height: h } = canvas
  const colors = coverPalettes[0].map((fallback, i) =>
    rgb(/^#[0-9a-f]{6}$/i.test(cover.colors?.[i]) ? cover.colors[i] : fallback))
  if (/^#[0-9a-f]{6}$/i.test(cover.colors?.[3])) colors.push(rgb(cover.colors[3]))
  const seed = ((Number(cover.seed) || 0) * 2.399963) % TAU
  const t = seconds * .39 * (Number(cover.speed) || 1)
  ctx.save()
  if (cover.preset === 'pixel') paintPixels(ctx, w, h, colors, t, seed)
  else if (cover.preset === 'halftone') paintHalftone(ctx, w, h, colors, t, seed)
  else {
    ctx.scale(w, h)
    if (cover.preset === 'ribbon') paintRibbons(ctx, colors, t, seed)
    else paintField(ctx, colors, t, seed, cover.preset === 'mist')
    if (cover.preset === 'grain') {
      const texture = paperTexture(canvas, seed)
      if (texture) {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.globalAlpha = .29 + Math.min(1, Number(cover.grain) || 0) * .28
        ctx.fillStyle = ctx.createPattern(texture, 'repeat')
        ctx.fillRect(0, 0, w, h)
      }
    }
  }
  ctx.restore()
  return true
}
