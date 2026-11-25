// Each script supplies its own CDP evaluation function.
export async function openReadingSettings(ev, advanced = false) {
  await ev(`
    const findPanel = () => document.querySelector('.reading-panel')
    if (!findPanel()) {
      document.querySelector('button[aria-label="阅读设置"]').click()
      await new Promise(requestAnimationFrame)
    }
    if (${advanced}) findPanel().querySelector('details').open = true
  `)
}

export async function chooseReadingSetting(ev, group, label) {
  const advanced = ['中文加粗', '中文斜体', '段落样式', '表格宽度', '表格对齐', '阅读缩放'].includes(group)
  await openReadingSettings(ev, advanced)
  await ev(`
    const panel = document.querySelector('.reading-panel')
    const group = ${JSON.stringify(group)}, label = ${JSON.stringify(label)}
    if (group === '阅读缩放') {
      const select = panel.querySelector('select[aria-label="阅读缩放"]')
      select.value = label
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return
    }
    const row = [...panel.querySelectorAll('[role="radiogroup"]')].find(item =>
      document.getElementById(item.getAttribute('aria-labelledby'))?.textContent === group)
    const option = [...(row?.querySelectorAll('input') || [])].find(input => input.getAttribute('aria-label') === label)
    if (!option) throw Error('找不到选项 ' + group + ' / ' + label)
    option.click()
  `)
}
