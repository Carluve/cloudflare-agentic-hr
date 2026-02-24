let callCount = 0
const pendingCalls = new Map()  // callId → elemento DOM

export function initMCPInspector() {
  // nada que inicializar
}

export function handleToolCall(data) {
  callCount++
  document.getElementById('tool-call-count').textContent =
    `${callCount} call${callCount !== 1 ? 's' : ''}`

  const container = document.getElementById('mcp-content')
  container.querySelector('.panel-empty')?.remove()

  const el = document.createElement('div')
  el.className = 'mcp-call mcp-call-pending'
  el.id = `mcp-${data.callId}`
  el.innerHTML = `
    <div class="mcp-call-header">
      <span class="mcp-arrow-out">▶</span>
      <span class="mcp-server">${escapeHtml(data.server ?? 'MCP')}</span>
      <span class="mcp-tool-name">${escapeHtml(data.tool)}</span>
      <span class="mcp-spinner">⟳</span>
    </div>
    <div class="mcp-params">
      <pre>${JSON.stringify(data.params, null, 2)}</pre>
    </div>
  `
  container.appendChild(el)
  pendingCalls.set(data.callId, el)
  container.scrollTop = container.scrollHeight
}

export function handleToolResult(data) {
  const el = pendingCalls.get(data.callId)
  if (!el) return

  el.classList.remove('mcp-call-pending')
  el.classList.add('mcp-call-done')
  el.querySelector('.mcp-spinner')?.remove()

  const result = data.result
  const summary = result?.message ?? result?.error ?? JSON.stringify(result).slice(0, 100)

  const resultEl = document.createElement('div')
  resultEl.className = 'mcp-result'
  resultEl.innerHTML = `
    <span class="mcp-arrow-in">◀</span>
    <span class="mcp-result-text">${escapeHtml(summary)}</span>
    <span class="mcp-duration">${data.duration_ms}ms</span>
  `

  // Click para ver payload completo en el event-detail
  resultEl.addEventListener('click', (e) => {
    e.stopPropagation()
    const detail = document.getElementById('event-detail')
    const json = document.getElementById('event-detail-json')
    json.textContent = JSON.stringify(data.result, null, 2)
    detail.classList.toggle('hidden')
  })

  el.appendChild(resultEl)
  pendingCalls.delete(data.callId)
}

function escapeHtml(str) {
  return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
