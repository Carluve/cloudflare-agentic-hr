import { initChat } from './chat.js'
import { initSSE } from './sse.js'
import { initVoice } from './voice.js'

// ── Configuración ─────────────────────────────────────────────
const CONFIG = {
  AGENT_URL: 'https://hr-agent-worker.USUARIO.workers.dev',
  // En desarrollo local usar: 'http://localhost:8787'
  EMPLOYEE_ID: 'EMP-0042',
}

// ── Estado global de la app ───────────────────────────────────
window.APP = {
  sessionId: null,
  employee: null,
  isProcessing: false,
  config: CONFIG,
}

// ── Inicialización ────────────────────────────────────────────
async function init() {
  try {
    // 1. Crear sesión con el agente
    const res = await fetch(`${CONFIG.AGENT_URL}/session/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: CONFIG.EMPLOYEE_ID })
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { session_id, employee } = await res.json()

    APP.sessionId = session_id
    APP.employee = employee

    // 2. Actualizar UI con datos del empleado
    document.getElementById('employee-name').textContent = employee.name

    // 3. Inicializar SSE — recibir eventos del agente
    initSSE(session_id, CONFIG.AGENT_URL)

    // 4. Inicializar chat
    initChat()

    // 5. Inicializar voz
    initVoice()

    console.log('HR Assistant inicializado. Sesión:', session_id)

  } catch (error) {
    console.error('Error inicializando la app:', error)
    showError('No se pudo conectar con el asistente. Recarga la página.')
  }
}

function showError(msg) {
  const messagesEl = document.getElementById('messages')
  const el = document.createElement('div')
  el.className = 'message message-error'
  el.innerHTML = `<span>⚠️ ${msg}</span>`
  messagesEl.appendChild(el)
}

init()
