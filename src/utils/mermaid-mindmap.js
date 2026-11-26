// Mermaid assigns a section to each root child and carries it through that subtree.
// Give each family a stronger fill for its branch and a quieter one for its leaves.
const lightBranches = [
  { branch: '#e5eddb', leaf: '#f2f5ed', outline: '#94a77f' },
  { branch: '#e8e4f3', leaf: '#f5f3f9', outline: '#a49aba' },
  { branch: '#f6e4dc', leaf: '#fbf2ed', outline: '#c59d88' }
]
const darkBranches = [
  { branch: '#384c3d', leaf: '#2a352d', outline: '#81957a' },
  { branch: '#464054', leaf: '#332f3c', outline: '#958ba7' },
  { branch: '#544037', leaf: '#3a302b', outline: '#b18f7e' }
]

export function mindmapTheme(dark) {
  const branches = dark ? darkBranches : lightBranches
  const ink = dark ? '#f1eee8' : '#36362f'
  const root = dark ? '#e3ad94' : '#9b4e35'
  const rootInk = dark ? '#29211d' : '#fffaf5'
  const themeVariables = { cScale0: root, cScaleLabel0: rootInk, cScaleInv0: root }
  const sections = []
  // cScale0 is reserved for the root. Mermaid cycles over eleven numbered sections.
  for (let section = 0; section < 11; section++) {
    const { branch, leaf, outline } = branches[section % branches.length]
    const index = section + 1
    themeVariables['cScale' + index] = leaf
    themeVariables['cScaleLabel' + index] = ink
    themeVariables['cScaleInv' + index] = outline
    sections.push(`.mindmap-node.section-${section} { --branch-fill:${branch}; --branch-outline:${outline}; }`)
  }
  return {
    themeVariables,
    themeCSS: `
      ${sections.join('\n')}
      .mindmap-node > .node-bkg, .mindmap-node > .label-container {
        stroke:var(--branch-outline); stroke-width:1px;
      }
      .mindmap-node.mindmap-branch > .node-bkg, .mindmap-node.mindmap-branch > .label-container {
        fill:var(--branch-fill); stroke-width:1.35px;
      }
      .mindmap-node.section-root > .node-bkg, .mindmap-node.section-root > .label-container {
        fill:${root}; stroke:${root}; stroke-width:1.5px;
      }
      .mindmap-node.section-root .label text, .mindmap-node.section-root .text-inner-tspan {
        fill:${rootInk};
      }
      .mindmap-node.section-root .text-inner-tspan[font-weight="normal"] { font-weight:600; }
      .mindmap-node .label text { text-anchor:middle; }
      .mindmap-node > .node-line- { stroke:none; }
      path.edge[class*="edge-depth-"] {
        stroke:${dark ? '#9e9a8e' : '#938f84'}; stroke-width:1.25px; stroke-linecap:round;
      }
      path.edge.edge-depth-1 { stroke-width:1.85px; }
    `
  }
}

export function centerMindmapLabels(svg) {
  // Only edges carry depth. Match their numeric target to the scoped node id
  // so the first-level treatment also works when sections repeat on large maps.
  for (const edge of svg.querySelectorAll('path.edge-depth-1')) {
    const target = /^edge_\d+_(\d+)$/.exec(edge.getAttribute('data-id'))?.[1]
    if (target) svg.getElementById(svg.id + '-node_' + target)?.classList.add('mindmap-branch')
  }
  for (const node of svg.querySelectorAll('g.mindmap-node')) {
    const shape = node.querySelector(':scope > .label-container, :scope > .node-bkg')
    const label = node.querySelector(':scope > g.label')
    if (!shape || !label || label.querySelector('foreignObject, image, use') || !label.querySelector('text')) continue
    const box = shape.getBBox()
    const text = label.getBBox()
    if (!text.width || !text.height) continue
    // Clouds and polygons can have their own translation. The label transform
    // is relative to the node, so measure the shape's centre in that space.
    const shapeToNode = node.getCTM().inverse().multiply(shape.getCTM())
    const center = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(shapeToNode)
    label.setAttribute('transform', `translate(${center.x - text.x - text.width / 2} ${center.y - text.y - text.height / 2})`)
  }
}
