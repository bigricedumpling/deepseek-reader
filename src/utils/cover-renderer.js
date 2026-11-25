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

// Translucent folds share one sweep. A fold narrows along its path, so the
// ground colour remains visible between the lighter lip and the deeper overlap.
function paintRibbons(ctx, colors, t, seed) {
  paintField(ctx, colors, t, seed, false)
  for (let layer = 0; layer < 4; layer++) {
    const top = .18 + .19 * layer
    const gradient = ctx.createLinearGradient(.05, top - .16, .28, top + .66)
    gradient.addColorStop(0, ink(colors[layer % colors.length], .91))
    gradient.addColorStop(.55, ink(mix(colors[layer % colors.length], colors[(layer + 1) % colors.length], .34), .76))
    gradient.addColorStop(1, ink(colors[(layer + 1) % colors.length], .46))
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.moveTo(0, 1)
    for (let i = 0; i <= 64; i++) {
      const x = i / 64
      const turn = 4.75 * x + seed + .72 * t
      const edge = top + .2 * Math.sin(turn + layer * .7)
        + .09 * Math.sin(6.4 * x + .68 * seed - .38 * t + layer * .87)
      ctx.lineTo(x, edge)
    }
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

// The tiny bitmap is scaled on a square grid. Dither follows the colour
// transition on fixed screen coordinates, so the texture does not shimmer.
const pixelSurfaces = new WeakMap()
const threshold4 = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5]

function pixelSurface(canvas, cols, rows, colors) {
  const key = colors.join('|')
  let surface = pixelSurfaces.get(canvas)
  if (!surface) {
    const bitmap = canvas.ownerDocument.createElement('canvas')
    const pen = bitmap.getContext('2d')
    if (!pen) return null
    surface = { bitmap, pen }
    pixelSurfaces.set(canvas, surface)
  }
  if (!surface.image || surface.bitmap.width !== cols || surface.bitmap.height !== rows) {
    surface.bitmap.width = cols
    surface.bitmap.height = rows
    surface.image = surface.pen.createImageData(cols, rows)
    surface.sweep = new Float32Array(cols)
    surface.bend = new Float32Array(cols)
  }
  if (surface.key !== key) {
    const [a,b,c] = colors
    const tones = [mix(a, [32,38,54], .43), a, b, colors[3] || mix(b,c,.53), c, mix(c,[32,38,54],.36)]
    const inks = []
    for (let i = 1; i < tones.length; i++) {
      const left = oklab(tones[i - 1]), right = oklab(tones[i])
      inks.push(tones[i - 1], srgb(left.map((value, k) => (value + right[k]) * .5)))
    }
    inks.push(tones.at(-1))
    surface.inks = inks
    surface.key = key
  }
  return surface
}

function paintPixels(ctx, w, h, colors, t, seed) {
  const cell = Math.max(1, Math.round(h / 72), Math.ceil(w / 340))
  const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell)
  const surface = pixelSurface(ctx.canvas, cols, rows, colors)
  if (!surface) return
  const { bitmap, pen, image, sweep, bend, inks } = surface
  for (let col = 0; col < cols; col++) {
    const x = (col + .5) / cols
    sweep[col] = .13 + .65 * x + .16 * Math.sin(3.8 * x + seed + t * .36)
    bend[col] = .48 + .24 * Math.sin(4.2 * x + seed * .7 - t * .27)
  }
  const last = inks.length - 1
  const data = image.data
  for (let row = 0; row < rows; row++) {
    const y = (row + .5) / rows - .5
    const shift = .065 * Math.cos(3.1 * y + seed - t * .37)
    const matrixRow = (row & 3) * 4
    for (let col = 0; col < cols; col++) {
      const tone = Math.min(last, Math.max(0, (sweep[col] + y * bend[col] + shift) * last))
      const level = Math.floor(tone)
      const threshold = (threshold4[matrixRow + (col & 3)] + .5) / 16
      const color = inks[level + (tone - level > threshold ? 1 : 0)]
      const offset = (row * cols + col) * 4
      data[offset] = color[0]
      data[offset + 1] = color[1]
      data[offset + 2] = color[2]
      data[offset + 3] = 255
    }
  }
  pen.putImageData(image, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(bitmap, 0, 0, cols * cell, rows * cell)
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
