import { onBeforeUnmount, onMounted } from 'vue'

export function useReveal() {
  let observer = null

  onMounted(() => {
    const nodes = [...document.querySelectorAll('[data-reveal]')]
    if (!('IntersectionObserver' in window) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-inview')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0 })
    nodes.forEach(node => {
      node.classList.add('will-reveal')
      observer.observe(node)
    })
  })

  onBeforeUnmount(() => observer?.disconnect())
}
