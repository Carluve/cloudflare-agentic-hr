const EVENT_META = {
  session_ready:       { icon: '🟢', color: '#10B981', label: 'Inicio' },
  transcription_chunk: { icon: '🎤', color: '#6366F1', label: 'STT' },
  thinking_delta:      { icon: '💭', color: '#8B5CF6', label: 'Thinking' },
  agent_step:          { icon: '⚡', color: '#F59E0B', label: 'Step' },
  tool_call:           { icon: '▶', color: '#3B82F6', label: 'Tool' },
  tool_result:         { icon: '◀', color: '#10B981', label: 'Result' },
  response_delta:      { icon: '💬', color: '#F6821F', label: 'Response' },
  request_created:     { icon: '📋', color: '#F6821F', label: 'Request' },
  metrics_update:      { icon: '📊', color: '#6B7280', label: 'Metrics' },
  session_end:         { icon: '🏁', color: '#EF4444', label: 'Fin' },
}

// Eventos que se agrupan en un único nodo (contador)
const GROUPED = new Set(['thinking_delta', 'response_delta', 'transcription_chunk'])

let sessionStart = null

export function initTimeline() {
  // nada que inicializar
}

export function addTimelineEvent(data) {
  if (!sessionStart) sessionStart = data.timestamp

  const meta = EVENT_META[data.event]
  if (!meta) return

  // Nodos agrupados: solo actualizar contador
  if (GROUPED.has(data.event)) {
    const existing = document.getElementById(`tl-${data.event}`)
    if (existing) {
      const counter = existing.querySelector('.tl-counter')
      if (counter) counter.textContent = parseInt(counter.textContent || '1') + 1
      return
    }
  }

  const track = document.getElementById('timeline-track')
  const elapsed = ((data.timestamp - sessionStart) / 1000).toFixed(1)

  const node = document.createElement('div')
  node.className = 'tl-node'
  node.id = `tl-${data.event}`
  node.style.setProperty('--tl-color', meta.color)
  node.innerHTML = `
    <div class="tl-dot" title="${data.event}">
      <span>${meta.icon}</span>
    </div>
    <div class="tl-label">${meta.label}</div>
    <div class="tl-time">+${elapsed}s</div>
    ${GROUPED.has(data.event) ? '<div class="tl-counter">1</div>' : ''}
  `

  node.addEventListener('click', () => {
    const detail = document.getElementById('event-detail')
    const json = document.getElementById('event-detail-json')
    json.textContent = JSON.stringify(data, null, 2)
    detail.classList.remove('hidden')
  })

  track.appendChild(node)
  track.scrollLeft = track.scrollWidth
}

export function clearTimeline() {
  sessionStart = null
  const track = document.getElementById('timeline-track')
  if (track) track.innerHTML = ''
}
