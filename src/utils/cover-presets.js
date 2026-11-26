export const coverPalettes = [
  ['#bdd8c8', '#f4d9b9', '#76a6a8'],
  ['#625a93', '#ecc7da', '#8ed1d8'],
  ['#71394d', '#dd806c', '#f6dcb1'],
  ['#95afcf', '#edf0ec', '#9389ac']
]

export const coverPaletteNames = ['青瓷', '霞紫', '陶红', '蓝灰']

export const coverShapes = [
  ['mist', '柔雾'], ['mesh', '色域'], ['grain', '颗粒'], ['pixel', '像素']
]

// Use the exact same deterministic frame for the swatch, preview, and applied cover.
const defaults = [
  ['mist', 0, 27], ['mesh', 1, 21], ['grain', 2, 12], ['pixel', 3, 57]
]
export const patternCovers = defaults.map(([preset, palette, seed]) => ({
  type: 'gradient', preset, colors: [...coverPalettes[palette]], seed,
  animated: true, height: 'medium', position: 50
}))

export function randomCover() {
  const pick = items => items[Math.floor(Math.random() * items.length)]
  return {
    type: 'gradient',
    preset: pick(coverShapes)[0],
    colors: [...pick(coverPalettes)],
    seed: Math.floor(Math.random() * 1000),
    animated: true,
    height: 'medium',
    position: 50
  }
}
