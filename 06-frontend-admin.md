# 06 — Frontend: Panel de Observabilidad (Admin)

## Propósito

Panel técnico para presentaciones y demos. Se abre en una segunda pantalla o pestaña. Muestra en tiempo real el razonamiento interno del LLM, las llamadas a MCP, la transcripción de voz y métricas. Este panel es lo más impactante de la demo técnica.

## Archivos a crear

```
frontend/admin-panel/
├── index.html
├── css/
│   └── observatory.css
└── js/
    ├── main.js         ← Inicialización, SSE y dispatch de eventos
    ├── panels/
    │   ├── transcription.js   ← Panel de transcripción en vivo
    │   ├── thinking.js        ← Stream del razonamiento del LLM
    │   ├── mcp-inspector.js   ← Inspector de llamadas a herramientas
    │   ├── metrics.js         ← Métricas de tokens, latencia, costo
    │   └── timeline.js        ← Timeline de eventos
```

---

## index.html

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HR Agent Observatory</title>
  <link rel="stylesheet" href="css/observatory.css">
</head>
<body class="observatory">

  <!-- ── Top Bar ─────────────────────────────────────────────── -->
  <header class="obs-header">
    <div class="obs-brand">
      <span class="obs-logo">⚡</span>
      <span class="obs-title">HR Agent Observatory</span>
    </div>
    <div class="obs-session-info">
      <span id="session-employee">Esperando sesión...</span>
      <div id="live-indicator" class="live-indicator live-waiting">
        <span class="live-dot"></span>
        <span>Esperando</span>
      </div>
    </div>
    <div class="obs-controls">
      <button id="btn-clear" class="obs-btn">Limpiar</button>
      <button id="btn-connect" class="obs-btn obs-btn-primary">Conectar sesión</button>
    </div>
  </header>

  <!-- ── Panel Grid ─────────────────────────────────────────── -->
  <div class="obs-grid">
    
    <!-- Panel 1: Transcripción -->
    <section class="obs-panel panel-transcription">
      <div class="panel-header">
        <span class="panel-icon">🎤</span>
        <span class="panel-title">Transcripción</span>
        <span id="transcription-confidence" class="panel-badge"></span>
      </div>
      <div id="transcription-content" class="panel-content">
        <div class="panel-empty">Esperando audio...</div>
      </div>
      <div id="audio-wave" class="audio-wave">
        <canvas id="wave-canvas" width="200" height="40"></canvas>
      </div>
    </section>

    <!-- Panel 2: Thinking Stream -->
    <section class="obs-panel panel-thinking">
      <div class="panel-header">
        <span class="panel-icon">💭</span>
        <span class="panel-title">Razonamiento del Agente</span>
        <span class="panel-badge panel-badge-blue">Extended Thinking</span>
      </div>
      <div id="thinking-content" class="panel-content thinking-stream">
        <div class="panel-empty">El razonamiento aparecerá aquí...</div>
      </div>
    </section>

    <!-- Panel 3: MCP Inspector -->
    <section class="obs-panel panel-mcp">
      <div class="panel-header">
        <span class="panel-icon">🔧</span>
        <span class="panel-title">MCP Tool Calls</span>
        <span id="tool-call-count" class="panel-badge">0 calls</span>
      </div>
      <div id="mcp-content" class="panel-content mcp-list">
        <div class="panel-empty">Sin llamadas a herramientas aún</div>
      </div>
    </section>

    <!-- Panel 4: Métricas -->
    <section class="obs-panel panel-metrics">
      <div class="panel-header">
        <span class="panel-icon">📊</span>
        <span class="panel-title">Métricas</span>
      </div>
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value" id="metric-tokens">—</div>
          <div class="metric-label">Tokens</div>
        </div>
        <div class="metric-card">
          <div class="metric-value" id="metric-latency">—</div>
          <div class="metric-label">Latencia</div>
        </div>
        <div class="metric-card">
          <div class="metric-value" id="metric-tools">—</div>
          <div class="metric-label">Tool Calls</div>
        </div>
        <div class="metric-card">
          <div class="metric-value" id="metric-cost">—</div>
          <div class="metric-label">Costo USD</div>
        </div>
      </div>
      <div id="latency-chart" class="latency-chart">
        <canvas id="latency-canvas" width="240" height="60"></canvas>
      </div>
    </section>

    <!-- Panel 5: Timeline (full width) -->
    <section class="obs-panel panel-timeline">
      <div class="panel-header">
        <span class="panel-icon">⏱️</span>
        <span class="panel-title">Timeline de Eventos</span>
      </div>
      <div id="timeline-content" class="timeline-container">
        <div class="timeline-track" id="timeline-track"></div>
      </div>
      <!-- Detalle del evento seleccionado -->
      <div id="event-detail" class="event-detail hidden">
        <pre id="event-detail-json"></pre>
      </div>
    </section>

  </div>

  <script src="js/main.js" type="module"></script>
</body>
</html>
```

---

## js/main.js — Inicialización y dispatch de eventos

```javascript
import { initTranscription, handleTranscriptionChunk } from './panels/transcription.js'
import { initThinking, handleThinkingDelta, clearThinking } from './panels/thinking.js'
import { initMCPInspector, handleToolCall, handleToolResult } from './panels/mcp-inspector.js'
import { initMetrics, handleMetricsUpdate } from './panels/metrics.js'
import { initTimeline, addTimelineEvent } from './panels/timeline.js'

const CONFIG = {
  AGENT_URL: 'https://hr-agent-worker.TU_USUARIO.workers.dev',
}

let eventSource = null
let sessionId = null

function init() {
  initTranscription()
  initThinking()
  initMCPInspector()
  initMetrics()
  initTimeline()

  document.getElementById('btn-connect').addEventListener('click', promptConnect)
  document.getElementById('btn-clear').addEventListener('click', clearAll)

  // Auto-conectar si hay sessionId en la URL: /admin?session=XXXX
  const urlParams = new URLSearchParams(window.location.search)
  const sessionParam = urlParams.get('session')
  if (sessionParam) connectToSession(sessionParam)
}

function promptConnect() {
  const id = prompt('Pega el Session ID del portal del empleado:')
  if (id) connectToSession(id.trim())
}

function connectToSession(id) {
  sessionId = id
  if (eventSource) eventSource.close()

  eventSource = new EventSource(`${CONFIG.AGENT_URL}/sse/${id}`)

  eventSource.onopen = () => {
    document.getElementById('live-indicator').className = 'live-indicator live-active'
    document.getElementById('live-indicator').innerHTML = '<span class="live-dot"></span><span>Live</span>'
  }

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data)
    dispatchEvent(data)
    addTimelineEvent(data)
  }

  eventSource.onerror = () => {
    document.getElementById('live-indicator').className = 'live-indicator live-error'
    document.getElementById('live-indicator').innerHTML = '<span class="live-dot"></span><span>Desconectado</span>'
  }
}

// ── Dispatch de eventos a los paneles ────────────────────────

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
      document.getElementById('live-indicator').className = 'live-indicator live-idle'
      document.getElementById('live-indicator').innerHTML = '<span class="live-dot"></span><span>Completado</span>'
      break
  }
}

function clearAll() {
  clearThinking()
  document.getElementById('transcription-content').innerHTML = '<div class="panel-empty">Esperando audio...</div>'
  document.getElementById('mcp-content').innerHTML = '<div class="panel-empty">Sin llamadas a herramientas aún</div>'
  document.getElementById('timeline-track').innerHTML = ''
  document.getElementById('tool-call-count').textContent = '0 calls'
}

init()
```

---

## js/panels/thinking.js — Stream del razonamiento

```javascript
let thinkingEl = null
let thinkingBuffer = ''
let isFirstThinking = true

export function initThinking() {
  thinkingEl = document.getElementById('thinking-content')
}

export function handleThinkingDelta(data) {
  if (isFirstThinking) {
    thinkingEl.innerHTML = ''  // Limpiar el placeholder
    isFirstThinking = false
    
    // Crear un bloque nuevo para este pensamiento
    const block = document.createElement('div')
    block.className = 'thinking-block'
    block.innerHTML = '<span class="thinking-cursor">▋</span>'
    thinkingEl.appendChild(block)
  }

  // Añadir el texto al último bloque
  const block = thinkingEl.lastElementChild
  const cursor = block.querySelector('.thinking-cursor')
  
  // Insertar texto antes del cursor
  const textNode = document.createTextNode(data.content)
  block.insertBefore(textNode, cursor)

  // Auto-scroll
  thinkingEl.scrollTop = thinkingEl.scrollHeight
}

export function clearThinking() {
  thinkingBuffer = ''
  isFirstThinking = true
  if (thinkingEl) {
    thinkingEl.innerHTML = '<div class="panel-empty">El razonamiento aparecerá aquí...</div>'
  }
}
```

---

## js/panels/mcp-inspector.js — Inspector de herramientas

```javascript
let callCount = 0
const pendingCalls = new Map()  // callId → elemento DOM

export function initMCPInspector() {
  // Nada que inicializar
}

export function handleToolCall(data) {
  callCount++
  document.getElementById('tool-call-count').textContent = `${callCount} call${callCount !== 1 ? 's' : ''}`

  const container = document.getElementById('mcp-content')
  
  // Limpiar placeholder si existe
  container.querySelector('.panel-empty')?.remove()

  const el = document.createElement('div')
  el.className = 'mcp-call mcp-call-pending'
  el.id = `mcp-${data.callId}`
  el.innerHTML = `
    <div class="mcp-call-header">
      <span class="mcp-arrow mcp-arrow-out">▶</span>
      <span class="mcp-server">${data.server ?? 'MCP'}</span>
      <span class="mcp-tool-name">${data.tool}</span>
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
  el.querySelector('.mcp-spinner').remove()

  // Mostrar resultado resumido
  const resultEl = document.createElement('div')
  resultEl.className = 'mcp-result'
  
  const result = data.result
  const summary = result?.message ?? result?.error ?? JSON.stringify(result).slice(0, 100)
  
  resultEl.innerHTML = `
    <span class="mcp-arrow mcp-arrow-in">◀</span>
    <span class="mcp-result-text">${escapeHtml(summary)}</span>
    <span class="mcp-duration">${data.duration_ms}ms</span>
  `
  el.appendChild(resultEl)

  // Click para ver payload completo
  el.style.cursor = 'pointer'
  el.addEventListener('click', () => {
    const detail = document.getElementById('event-detail')
    const json = document.getElementById('event-detail-json')
    json.textContent = JSON.stringify(data.result, null, 2)
    detail.classList.toggle('hidden')
  })

  pendingCalls.delete(data.callId)
}

function escapeHtml(str) {
  return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
```

---

## js/panels/timeline.js — Timeline de eventos

```javascript
const EVENT_ICONS = {
  session_ready:        { icon: '🟢', color: '#10B981', label: 'Inicio' },
  transcription_chunk:  { icon: '🎤', color: '#6366F1', label: 'STT' },
  thinking_delta:       { icon: '💭', color: '#8B5CF6', label: 'Thinking' },
  agent_step:           { icon: '⚡', color: '#F59E0B', label: 'Step' },
  tool_call:            { icon: '▶', color: '#3B82F6', label: 'Tool' },
  tool_result:          { icon: '◀', color: '#10B981', label: 'Result' },
  response_delta:       { icon: '💬', color: '#F6821F', label: 'Response' },
  request_created:      { icon: '📋', color: '#F6821F', label: 'Request' },
  metrics_update:       { icon: '📊', color: '#6B7280', label: 'Metrics' },
  session_end:          { icon: '🏁', color: '#EF4444', label: 'Fin' },
}

let sessionStart = null
const eventBuffer = []  // Guardamos solo 1 evento por tipo para no saturar

export function initTimeline() {
  // Nada que inicializar
}

export function addTimelineEvent(data) {
  if (!sessionStart) sessionStart = data.timestamp

  const meta = EVENT_ICONS[data.event]
  if (!meta) return

  // Para thinking_delta y response_delta: agrupar en un solo nodo
  const grouped = ['thinking_delta', 'response_delta', 'transcription_chunk']
  if (grouped.includes(data.event)) {
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
    ${grouped.includes(data.event) ? '<div class="tl-counter">1</div>' : ''}
  `

  // Click para mostrar payload
  node.addEventListener('click', () => {
    const detail = document.getElementById('event-detail')
    const json = document.getElementById('event-detail-json')
    json.textContent = JSON.stringify(data, null, 2)
    detail.classList.remove('hidden')
  })

  track.appendChild(node)
  track.scrollLeft = track.scrollWidth
}
```

---

## CSS — Estilos del Observatorio (extracto)

```css
.observatory { background: #0F172A; color: #E2E8F0; font-family: 'Inter', sans-serif; height: 100vh; display: flex; flex-direction: column; }

/* Grid de paneles */
.obs-grid {
  flex: 1; display: grid; overflow: hidden;
  grid-template-columns: 220px 1fr 260px 200px;
  grid-template-rows: 1fr 120px;
  gap: 8px; padding: 8px;
}
.panel-transcription { grid-column: 1; grid-row: 1; }
.panel-thinking      { grid-column: 2; grid-row: 1; }
.panel-mcp           { grid-column: 3; grid-row: 1; }
.panel-metrics       { grid-column: 4; grid-row: 1; }
.panel-timeline      { grid-column: 1 / -1; grid-row: 2; }

/* Paneles */
.obs-panel { background: #1E293B; border: 1px solid #334155; border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; }
.panel-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #334155; background: #0F172A; }
.panel-title { font-size: 12px; font-weight: 600; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; }
.panel-content { flex: 1; overflow-y: auto; padding: 12px; font-size: 13px; }
.panel-empty { color: #475569; font-style: italic; text-align: center; padding: 20px; }
.panel-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #334155; color: #94A3B8; margin-left: auto; }
.panel-badge-blue { background: #1E3A5F; color: #60A5FA; }

/* Thinking stream */
.thinking-stream { font-family: 'Fira Code', monospace; font-size: 12px; line-height: 1.6; color: #C4B5FD; white-space: pre-wrap; word-break: break-word; }
.thinking-cursor { display: inline-block; animation: blink 0.7s step-end infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

/* MCP calls */
.mcp-call { border: 1px solid #334155; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; font-size: 12px; font-family: monospace; }
.mcp-call-pending { border-color: #3B82F6; }
.mcp-call-done { border-color: #10B981; }
.mcp-call-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.mcp-arrow-out { color: #3B82F6; }
.mcp-arrow-in { color: #10B981; }
.mcp-server { font-size: 11px; padding: 1px 6px; background: #1E3A5F; color: #60A5FA; border-radius: 3px; }
.mcp-tool-name { font-weight: bold; color: #F1F5F9; }
.mcp-spinner { color: #F59E0B; animation: spin 1s linear infinite; margin-left: auto; }
.mcp-params pre { color: #94A3B8; margin: 0; font-size: 11px; }
.mcp-result { display: flex; align-items: center; gap: 6px; padding-top: 6px; border-top: 1px solid #334155; }
.mcp-result-text { flex: 1; color: #86EFAC; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mcp-duration { color: #475569; font-size: 11px; }

/* Métricas */
.metrics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px; }
.metric-card { background: #0F172A; border-radius: 6px; padding: 10px; text-align: center; }
.metric-value { font-size: 22px; font-weight: bold; color: #F6821F; font-family: 'Fira Code', monospace; }
.metric-label { font-size: 11px; color: #64748B; margin-top: 2px; }

/* Timeline */
.timeline-container { padding: 16px; overflow-x: auto; }
.timeline-track { display: flex; align-items: center; gap: 0; min-width: max-content; position: relative; }
.timeline-track::before { content: ''; position: absolute; top: 18px; left: 0; right: 0; height: 2px; background: #334155; }
.tl-node { display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; position: relative; padding: 0 16px; }
.tl-dot { width: 36px; height: 36px; border-radius: 50%; background: #1E293B; border: 2px solid var(--tl-color); display: flex; align-items: center; justify-content: center; font-size: 14px; position: relative; z-index: 1; transition: transform 0.15s; }
.tl-node:hover .tl-dot { transform: scale(1.2); }
.tl-label { font-size: 10px; color: #64748B; }
.tl-time { font-size: 10px; color: #475569; font-family: monospace; }
.tl-counter { position: absolute; top: -4px; right: 8px; background: #F6821F; color: white; border-radius: 8px; font-size: 9px; padding: 1px 4px; min-width: 16px; text-align: center; }

/* Live indicator */
.live-indicator { display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
.live-active { background: rgba(16, 185, 129, 0.15); color: #34D399; }
.live-waiting { background: rgba(107, 114, 128, 0.15); color: #9CA3AF; }
.live-error { background: rgba(239, 68, 68, 0.15); color: #F87171; }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.live-active .live-dot { animation: blink 1s ease infinite; }

/* Event detail overlay */
.event-detail { background: #0F172A; border-top: 1px solid #334155; padding: 8px 14px; font-family: monospace; font-size: 12px; color: #86EFAC; max-height: 100px; overflow-y: auto; }
.event-detail.hidden { display: none; }
@keyframes spin { to { transform: rotate(360deg); } }
```
