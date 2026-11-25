/** Move focus through the visible, enabled choices without invoking the selected action. */
export function navigateMenu(event) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const choices = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]
    .filter(button => button.getClientRects().length)
  if (!choices.length) return
  const index = choices.indexOf(document.activeElement)
  let next
  switch (event.key) {
    case 'Home': next = 0; break
    case 'End': next = choices.length - 1; break
    case 'ArrowUp': next = (index - 1 + choices.length) % choices.length; break
    default: next = (index + 1) % choices.length
  }
  event.preventDefault()
  choices[next].focus()
}
