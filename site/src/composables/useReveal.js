import { onBeforeUnmount, onMounted } from 'vue'

export function useReveal() {
  let observer = null

  onMounted(() => {
    const nodes = [...document.querySelectorAll('[data-reveal]')]
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach(node => node.classList.add('is-inview'))
      return
    }
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-inview')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.12 })
    nodes.forEach(node => observer.observe(node))
  })

  onBeforeUnmount(() => observer?.disconnect())
}
