let thinkingEl = null
let isFirstThinking = true

export function initThinking() {
  thinkingEl = document.getElementById('thinking-content')
}

export function handleThinkingDelta(data) {
  if (!thinkingEl) return

  if (isFirstThinking) {
    thinkingEl.innerHTML = ''
    isFirstThinking = false

    const block = document.createElement('div')
    block.className = 'thinking-block'
    block.innerHTML = '<span class="thinking-cursor">▋</span>'
    thinkingEl.appendChild(block)
  }

  const block = thinkingEl.lastElementChild
  const cursor = block.querySelector('.thinking-cursor')

  // Insertar texto antes del cursor parpadeante
  const textNode = document.createTextNode(data.content)
  block.insertBefore(textNode, cursor)

  thinkingEl.scrollTop = thinkingEl.scrollHeight
}

export function clearThinking() {
  isFirstThinking = true
  if (thinkingEl) {
    thinkingEl.innerHTML = '<div class="panel-empty">El razonamiento aparecerá aquí...</div>'
  }
}
