// Interactive covers and their detached HTML / print stills share this renderer.
export async function verifyCoverMaterials({ ev, moduleBase = '/src/utils/' }) {
  return ev(`
    const {renderCoverFrame} = await import(${JSON.stringify(moduleBase + 'cover-renderer.js')})
    const {patternCovers, coverPalettes} =
      await import(${JSON.stringify(moduleBase + 'cover-presets.js')})
    const doc = document.implementation.createHTMLDocument('cover fixture')
    const create = doc.createElement.bind(doc)
    let surfaces = 0
    doc.createElement = (...args) => {
      if (args[0] === 'canvas') surfaces++
      return create(...args)
    }
    function canvas(w,h) {
      const c = doc.createElement('canvas'); c.width=w; c.height=h
      c.getContext('2d', {willReadFrequently:true})
      return c
    }
    function assert(ok, label) { if (!ok) throw Error(label) }
    const sampler=canvas(64,26), ctx=sampler.getContext('2d')
    function pixels(source) {
      ctx.drawImage(source,0,0,64,26)
      return ctx.getImageData(0,0,64,26).data
    }
    function difference(a,b) {
      let delta=0
      for(let i=0;i<a.length;i+=4) delta+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])
      return delta/(a.length*.75)
    }
    assert(patternCovers.map(c=>c.preset).sort().join()==='grain,mesh,mist,pixel','Four selectable cover styles')
    assert(coverPalettes.length===4,'Four palettes')
    const metrics = {}
    const archived = ['ribbon', 'halftone'].map(preset => ({...patternCovers[0], preset}))
    for (const cover of [...patternCovers, ...archived]) {
      const id=cover.preset
      for (const [w,h] of [[540,160],[122,46]]) {
        const c=canvas(w,h), still=canvas(w,h)
        assert(renderCoverFrame(c,cover,0),id+' first frame')
        const first=pixels(c)
        const allocations=surfaces
        renderCoverFrame(c,cover,3)
        const motion=difference(first,pixels(c))
        assert(motion>.07,id+' no visible motion at '+w+': '+motion)
        assert(surfaces===allocations,id+' recreated a material surface during motion')
        renderCoverFrame(c,cover,0)
        renderCoverFrame(still,JSON.parse(JSON.stringify(cover)),0)
        assert(difference(first,pixels(c))===0 && difference(first,pixels(still))===0,id+' non-repeatable still')
        renderCoverFrame(c,{...cover,seed:cover.seed+1},0)
        assert(difference(first,pixels(c))>1, id+' ignores seed')
        const custom={...cover,colors:['#334457','#b65777','#bddad2','#dfc663'],speed:.5,grain:.4}
        renderCoverFrame(c,custom,2)
        renderCoverFrame(still,{...custom,speed:1},1)
        assert(difference(pixels(c),pixels(still))===0,id+' custom speed or export mismatch')
        if (w===540) metrics[id]=+motion.toFixed(2)
      }
    }
    return metrics
  `)
}
