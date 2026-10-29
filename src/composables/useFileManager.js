import { computed } from 'vue'
import { useDocsStore } from '../stores/docs'
import { fileManagerAvailable, fileManagerLabel, revealInFileManager } from '../utils/reveal'

/**
 * Finder/Explorer integration shared by the library panel, manager and tree.
 * Keeping availability, labels and error handling in one place means the rows
 * cannot drift apart or expose a control that silently does nothing.
 */
export function useFileManager() {
  const store = useDocsStore()
  const canReveal = computed(() => !store.isGuest && fileManagerAvailable())

  async function reveal(path) {
    try {
      await revealInFileManager(path)
    } catch (error) {
      store.setError(error?.message || String(error))
    }
  }

  return { canReveal, reveal, label: fileManagerLabel }
}
