import { initTranscription, handleTranscriptionChunk } from './panels/transcription.js'
import { initThinking, handleThinkingDelta, clearThinking } from './panels/thinking.js'
import { initMCPInspector, handleToolCall, handleToolResult } from './panels/mcp-inspector.js'
import { initMetrics, handleMetricsUpdate } from './panels/metrics.js'
import { initTimeline, addTimelineEvent, clearTimeline } from './panels/timeline.js'

const CONFIG = {
  AGENT_URL: 'https://hr-agent-worker.USUARIO.workers.dev',
  // En desarrollo local usar: 'http://localhost:8787'
}

let eventSource = null

function init() {
  initTranscription()
  initThinking()
  initMCPInspector()
  initMetrics()
  initTimeline()

  document.getElementById('btn-connect').addEventListener('click', promptConnect)
  document.getElementById('btn-clear').addEventListener('click', clearAll)

  // Auto-conectar si hay sessionId en la URL: /admin?session=XXXX
  const params = new URLSearchParams(window.location.search)
  const sessionParam = params.get('session')
  if (sessionParam) connectToSession(sessionParam)
}

function promptConnect() {
  const id = prompt('Pega el Session ID del portal del empleado:')
  if (id) connectToSession(id.trim())
}

function connectToSession(id) {
  if (eventSource) eventSource.close()

  setLiveStatus('waiting')

  eventSource = new EventSource(`${CONFIG.AGENT_URL}/sse/${id}`)

  eventSource.onopen = () => setLiveStatus('active')

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      dispatchEvent(data)
      addTimelineEvent(data)
    } catch (e) {
      console.warn('SSE parse error:', e)
    }
  }

  eventSource.onerror = () => setLiveStatus('error')
}

// ── Dispatch de eventos a los paneles ─────────────────────────

function dispatchEvent(data) {
  switch (data.event) {
    case 'session_ready':
      document.getElementById('session-employee').textContent =
        data.employee?.name ?? 'Empleado desconocido'
      break

    case 'transcription_chunk':
      handleTranscriptionChunk(data)
      break

    case 'thinking_delta':
      handleThinkingDelta(data)
      break

    case 'tool_call':
      handleToolCall(data)
      break

    case 'tool_result':
      handleToolResult(data)
      break

    case 'metrics_update':
      handleMetricsUpdate(data)
      break

    case 'session_end':
      setLiveStatus('idle')
      break
  }
}

function clearAll() {
  clearThinking()
  clearTimeline()

  const transcriptionEl = document.getElementById('transcription-content')
  if (transcriptionEl) transcriptionEl.innerHTML = '<div class="panel-empty">Esperando audio...</div>'

  const mcpEl = document.getElementById('mcp-content')
  if (mcpEl) mcpEl.innerHTML = '<div class="panel-empty">Sin llamadas a herramientas aún</div>'

  document.getElementById('tool-call-count').textContent = '0 calls'

  const detail = document.getElementById('event-detail')
  if (detail) detail.classList.add('hidden')
}

function setLiveStatus(status) {
  const el = document.getElementById('live-indicator')
  if (!el) return
  const labels = {
    active:  { cls: 'live-active',  text: 'Live' },
    waiting: { cls: 'live-waiting', text: 'Conectando...' },
    idle:    { cls: 'live-idle',    text: 'Completado' },
    error:   { cls: 'live-error',   text: 'Desconectado' },
  }
  const s = labels[status] ?? labels.waiting
  el.className = `live-indicator ${s.cls}`
  el.innerHTML = `<span class="live-dot"></span><span>${s.text}</span>`
}

init()
