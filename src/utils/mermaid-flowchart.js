// Keep the layout and the author's edge semantics. Only the standard triangular
// Mermaid markers become open arrowheads; circles, crosses and bare ends stay native.
export function flowchartTheme(dark) {
  const green = dark ? '#accb94' : '#537d32'
  const purple = dark ? '#c6b9e1' : '#6c5fa8'
  const coral = dark ? '#e7ac91' : '#ba502d'
  const text = dark ? '#24241f' : '#ffffff'
  const line = dark ? '#aaa99e' : '#92938d'
  return {
    themeVariables: { lineColor: line },
    themeCSS: `
      .flowchart-link.edge-thickness-normal { stroke-width:1.6px; }
      .node.default .text-inner-tspan[font-weight="normal"] { font-weight:600; }
      .node.flow-step { --flow-fill:${green}; }
      .node.flow-terminal { --flow-fill:${coral}; }
      .node.flow-decision { --flow-fill:${purple}; }
      .node:is(.flow-step,.flow-terminal,.flow-decision) > .label-container:not(g),
      .node.flow-terminal > g.label-container > path[fill]:not([fill="none"]) {
        fill:var(--flow-fill); stroke:var(--flow-fill);
      }
      .node.flow-terminal > g.label-container > path[fill="none"] { stroke:var(--flow-fill); }
      .node:is(.flow-step,.flow-terminal,.flow-decision) .label text,
      .node:is(.flow-step,.flow-terminal,.flow-decision) .text-inner-tspan { fill:${text}; }
    `
  }
}

function styleDefaultNodes(svg) {
  for (const node of svg.querySelectorAll('g.node.default[data-look="classic"]')) {
    const shape = node.querySelector(':scope > .label-container')
    if (!shape || node.querySelector('.label-container[style*=":"], .label-container [style*=":"], .label[style*=":"]')) continue
    if (shape.matches('rect.basic')) {
      node.classList.add(Number(shape.getAttribute('rx')) > 0 ? 'flow-terminal' : 'flow-step')
    } else if (shape.localName === 'polygon') {
      const points = [...shape.points]
      if (points.length === 4 && points[0].x === points[2].x && points[1].y === points[3].y) node.classList.add('flow-decision')
    } else if (shape.matches('circle.basic, g.basic.outer-path') && (shape.localName === 'circle' ||
        (shape.children.length === 2 && shape.querySelector(':scope > path[fill="none"]')))) {
      node.classList.add('flow-terminal')
    }
  }
}

export function polishFlowchart(svg, dark, paper) {
  styleDefaultNodes(svg)
  const line = dark ? '#aaa99e' : '#92938d'
  for (const marker of svg.querySelectorAll('marker.marker')) {
    const direction = /-point(Start|End)(?:-margin)?(?:_[\w-]+)?$/.exec(marker.id)?.[1]
    if (!direction) continue
    // Mermaid reserves room at the endpoint. Put the tip on the end of the
    // existing line so it doesn't protrude into a node or leave a detached V.
    const start = direction === 'Start'
    marker.setAttribute('viewBox', '0 0 12 12')
    marker.setAttribute('markerWidth', '11')
    marker.setAttribute('markerHeight', '11')
    marker.setAttribute('refX', start ? '2' : '10')
    marker.setAttribute('refY', '6')
    const path = document.createElementNS(svg.namespaceURI, 'path')
    path.setAttribute('d', start ? 'M 8 1.5 L 2 6 L 8 10.5' : 'M 4 1.5 L 10 6 L 4 10.5')
    path.style.cssText = 'fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round'
    const authorStroke = marker.firstElementChild?.getAttribute('stroke')
    path.style.stroke = authorStroke || (CSS.supports('stroke', 'context-stroke') ? 'context-stroke' : line)
    marker.replaceChildren(path)
  }

  for (const label of svg.querySelectorAll('.edgeLabel .label')) {
    const text = label.querySelector('text')
    const rect = label.querySelector('rect.background')
    if (!rect || !text?.textContent.trim()) continue
    const box = text.getBBox()
    rect.setAttribute('x', String(box.x - 6))
    rect.setAttribute('y', String(box.y - 2))
    rect.setAttribute('width', String(box.width + 12))
    rect.setAttribute('height', String(box.height + 4))
    rect.style.opacity = '1'
    rect.style.fillOpacity = '1'
    rect.style.fill = paper ? '#fff' : `var(--c-surface, ${dark ? '#202020' : '#fff'})`
  }
}
