export const coverPalettes = [
  ['#bdd8c8', '#f4d9b9', '#76a6a8'],
  ['#625a93', '#ecc7da', '#8ed1d8'],
  ['#71394d', '#dd806c', '#f6dcb1'],
  ['#95afcf', '#edf0ec', '#9389ac'],
  ['#647d66', '#e1e6aa', '#9bbfab'],
  ['#eebf93', '#edc9ce', '#9c90b0'],
  ['#536778', '#b8c8c3', '#ebe4cf'],
  ['#b3795e', '#ead29a', '#789995']
]

export const coverShapes = [
  ['mist', '柔雾'], ['mesh', '色域'], ['ribbon', '流线'],
  ['grain', '颗粒'], ['pixel', '像素'], ['halftone', '网印']
]

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
