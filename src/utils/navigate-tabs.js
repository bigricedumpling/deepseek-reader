/** Move within a tablist using the same activation as a click. */
export function navigateTabs(event) {
  if (!event.target.matches('[role="tab"]')) return
  const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]:not(:disabled)')]
  const index = tabs.indexOf(event.target)
  let next
  switch (event.key) {
    case 'ArrowRight': next = (index + 1) % tabs.length; break
    case 'ArrowLeft': next = (index + tabs.length - 1) % tabs.length; break
    case 'Home': next = 0; break
    case 'End': next = tabs.length - 1; break
    default: return
  }
  event.preventDefault()
  tabs[next].click()
  tabs[next].focus()
}
