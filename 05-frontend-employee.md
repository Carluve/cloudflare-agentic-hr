# 05 — Frontend: Portal del Empleado

## Propósito

Interfaz de chat que ve el empleado. Diseño corporativo limpio. Permite chatear por texto o voz. Muestra el progreso del agente en tiempo real (pasos intermedios) y una card de confirmación cuando se crea una solicitud.

## Archivos a crear

```
frontend/employee-portal/
├── index.html
├── css/
│   └── styles.css
└── js/
    ├── main.js       ← Inicialización y estado de la app
    ├── chat.js       ← Lógica de chat y renderizado
    ├── sse.js        ← Conexión SSE y manejo de eventos
    └── voice.js      ← Grabación de audio y Web Audio API
```

---

## Paleta de colores y diseño

```css
:root {
  --primary:        #1B6CA8;   /* Azul corporativo */
  --primary-dark:   #145a8f;
  --accent:         #F6821F;   /* Naranja Cloudflare */
  --bg:             #F4F6F9;   /* Fondo gris claro */
  --surface:        #FFFFFF;   /* Cards y burbujas */
  --text:           #1A1A2E;   /* Texto principal */
  --text-muted:     #6B7280;   /* Texto secundario */
  --success:        #10B981;   /* Checkmarks verdes */
  --step-pending:   #F59E0B;   /* Pasos en progreso */
  --bubble-user-bg: #1B6CA8;   /* Burbuja del usuario */
  --bubble-bot-bg:  #FFFFFF;   /* Burbuja del agente */
  --border:         #E5E7EB;
  --shadow:         0 2px 8px rgba(0,0,0,0.08);
  --radius:         12px;
}
```

---

## index.html — Estructura completa

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HR Assistant — Empresa Demo</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <!-- ── Header ─────────────────────────────────────────────── -->
  <header class="header">
    <div class="header-left">
      <div class="logo">
        <span class="logo-icon">⚡</span>
        <span class="logo-text">HR Assistant</span>
      </div>
      <div id="agent-status" class="status-badge status-idle">
        <span class="status-dot"></span>
        <span class="status-text">Disponible</span>
      </div>
    </div>
    <div class="header-right">
      <span class="employee-name" id="employee-name">Cargando...</span>
      <button class="btn-outline" id="btn-my-requests">Mis solicitudes</button>
    </div>
  </header>

  <!-- ── Main Layout ────────────────────────────────────────── -->
  <main class="main-layout">
    
    <!-- Chat Area -->
    <section class="chat-container">
      <div id="messages" class="messages-list">
        <!-- Los mensajes se insertan aquí dinámicamente -->
        <!-- Mensaje de bienvenida inicial -->
        <div class="message message-bot" id="welcome-message">
          <div class="message-avatar">🤖</div>
          <div class="message-content">
            <p>¡Hola! Soy tu asistente de Recursos Humanos. Puedo ayudarte con:</p>
            <div class="quick-actions">
              <button class="quick-btn" data-text="¿Cuántos días de vacaciones me quedan?">
                🏖️ Mis vacaciones
              </button>
              <button class="quick-btn" data-text="Quiero solicitar un permiso">
                📋 Solicitar permiso
              </button>
              <button class="quick-btn" data-text="¿Cuál es la política de teletrabajo?">
                🏠 Política teletrabajo
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Input Bar -->
      <div class="input-bar">
        <button id="btn-voice" class="btn-voice" title="Hablar">
          <span class="mic-icon">🎤</span>
          <canvas id="voice-visualizer" class="voice-visualizer" width="60" height="32"></canvas>
        </button>
        <textarea
          id="message-input"
          class="message-input"
          placeholder="Escribe tu consulta o pulsa el micrófono..."
          rows="1"
        ></textarea>
        <button id="btn-send" class="btn-send" disabled>
          <span>▶</span>
        </button>
      </div>
    </section>

  </main>

  <!-- ── Modal: Mis Solicitudes ─────────────────────────────── -->
  <div id="modal-requests" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Mis Solicitudes</h2>
        <button class="modal-close" id="btn-close-modal">✕</button>
      </div>
      <div id="requests-list" class="requests-list">
        <!-- Se carga dinámicamente -->
      </div>
    </div>
  </div>

  <script src="js/main.js" type="module"></script>
</body>
</html>
```

---

## js/main.js — Estado global e inicialización

```javascript
import { initChat, sendMessage } from './chat.js'
import { initSSE } from './sse.js'
import { initVoice } from './voice.js'

// ── Configuración ────────────────────────────────────────────
const CONFIG = {
  AGENT_URL: 'https://hr-agent-worker.TU_USUARIO.workers.dev',
  // En desarrollo: 'http://localhost:8787'
  EMPLOYEE_ID: 'EMP-0042',  // En prod: obtener del auth/cookie
}

// ── Estado global de la app ──────────────────────────────────
window.APP = {
  sessionId: null,
  employee: null,
  isProcessing: false,
  config: CONFIG,
}

// ── Inicialización ───────────────────────────────────────────
async function init() {
  try {
    // 1. Crear sesión con el agente
    const res = await fetch(`${CONFIG.AGENT_URL}/session/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: CONFIG.EMPLOYEE_ID })
    })
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

    console.log('✅ HR Assistant inicializado. Sesión:', session_id)

  } catch (error) {
    console.error('Error inicializando la app:', error)
    showError('No se pudo conectar con el asistente. Recarga la página.')
  }
}

function showError(msg) {
  const messagesEl = document.getElementById('messages')
  messagesEl.innerHTML += `
    <div class="message message-error">
      <span>⚠️ ${msg}</span>
    </div>
  `
}

init()
```

---

## js/chat.js — Lógica de chat

```javascript
let currentBotBubble = null
let currentStepsList = null

export function initChat() {
  const input = document.getElementById('message-input')
  const btnSend = document.getElementById('btn-send')
  const btnMyRequests = document.getElementById('btn-my-requests')

  // Habilitar botón enviar cuando hay texto
  input.addEventListener('input', () => {
    btnSend.disabled = input.value.trim() === '' || APP.isProcessing
    // Auto-resize textarea
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 120) + 'px'
  })

  // Enviar con Enter (Shift+Enter para nueva línea)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!btnSend.disabled) triggerSend()
    }
  })

  btnSend.addEventListener('click', triggerSend)

  // Quick actions del mensaje de bienvenida
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => sendTextMessage(btn.dataset.text))
  })

  // Modal de solicitudes
  btnMyRequests.addEventListener('click', openRequestsModal)
  document.getElementById('btn-close-modal').addEventListener('click', closeRequestsModal)
}

function triggerSend() {
  const input = document.getElementById('message-input')
  const text = input.value.trim()
  if (!text) return
  input.value = ''
  input.style.height = 'auto'
  sendTextMessage(text)
}

export async function sendTextMessage(text) {
  if (APP.isProcessing) return
  APP.isProcessing = true

  // Agregar burbuja del usuario
  addUserBubble(text)

  // Preparar burbuja del agente con estado "pensando"
  currentBotBubble = addBotBubble()
  currentStepsList = addStepsList(currentBotBubble)

  updateStatus('thinking')
  document.getElementById('btn-send').disabled = true

  try {
    await fetch(`${APP.config.AGENT_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': APP.sessionId
      },
      body: JSON.stringify({ text })
    })
    // La respuesta llega por SSE — este fetch solo inicia el procesamiento
  } catch (error) {
    appendToBotBubble('Lo siento, hubo un error de conexión. Por favor intenta de nuevo.')
    finishProcessing()
  }
}

// ── Renderizado de burbujas ──────────────────────────────────

function addUserBubble(text) {
  const el = document.createElement('div')
  el.className = 'message message-user'
  el.innerHTML = `<div class="message-bubble">${escapeHtml(text)}</div>`
  document.getElementById('messages').appendChild(el)
  scrollToBottom()
}

function addBotBubble() {
  const el = document.createElement('div')
  el.className = 'message message-bot message-streaming'
  el.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-body">
      <div class="message-steps"></div>
      <div class="message-text"></div>
    </div>
  `
  document.getElementById('messages').appendChild(el)
  scrollToBottom()
  return el
}

function addStepsList(bubble) {
  return bubble.querySelector('.message-steps')
}

export function appendToBotBubble(text) {
  if (!currentBotBubble) return
  const textEl = currentBotBubble.querySelector('.message-text')
  textEl.textContent += text
  scrollToBottom()
}

export function addAgentStep(description, icon, done = false) {
  if (!currentStepsList) return
  const stepId = 'step-' + Date.now()
  const el = document.createElement('div')
  el.id = stepId
  el.className = `agent-step ${done ? 'step-done' : 'step-pending'}`
  el.innerHTML = `
    <span class="step-icon">${done ? '✓' : icon ?? '⟳'}</span>
    <span class="step-text">${escapeHtml(description)}</span>
  `
  currentStepsList.appendChild(el)
  scrollToBottom()
  return stepId
}

export function markStepDone(stepId) {
  const el = document.getElementById(stepId)
  if (el) {
    el.className = 'agent-step step-done'
    el.querySelector('.step-icon').textContent = '✓'
  }
}

export function showRequestCard(data) {
  const messagesEl = document.getElementById('messages')
  const card = document.createElement('div')
  card.className = 'request-card'
  card.innerHTML = `
    <div class="request-card-header">
      <span class="request-card-icon">📋</span>
      <div>
        <div class="request-card-id">${data.requestId}</div>
        <div class="request-card-type">${data.type ?? 'Solicitud de permiso'}</div>
      </div>
      <span class="request-card-status status-pending">Pendiente</span>
    </div>
    <div class="request-card-details">
      <div class="request-detail">
        <span class="detail-label">Fechas</span>
        <span class="detail-value">${data.dates ?? '—'}</span>
      </div>
      <div class="request-detail">
        <span class="detail-label">Aprobador</span>
        <span class="detail-value">${data.approver ?? '—'}</span>
      </div>
    </div>
  `
  messagesEl.appendChild(card)
  scrollToBottom()
}

export function finishProcessing() {
  APP.isProcessing = false
  currentBotBubble?.classList.remove('message-streaming')
  currentBotBubble = null
  currentStepsList = null
  updateStatus('idle')
  document.getElementById('btn-send').disabled = false
}

// ── Helpers ──────────────────────────────────────────────────

function updateStatus(state) {
  const badge = document.getElementById('agent-status')
  const labels = {
    idle: { text: 'Disponible', class: 'status-idle' },
    thinking: { text: 'Pensando...', class: 'status-thinking' },
    calling: { text: 'Consultando...', class: 'status-calling' },
    responding: { text: 'Respondiendo...', class: 'status-responding' },
  }
  const s = labels[state] ?? labels.idle
  badge.className = `status-badge ${s.class}`
  badge.querySelector('.status-text').textContent = s.text
}

function scrollToBottom() {
  const el = document.getElementById('messages')
  el.scrollTop = el.scrollHeight
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function openRequestsModal() {
  document.getElementById('modal-requests').classList.remove('hidden')
  // Cargar solicitudes del empleado
  // En demo: mostrar datos hardcoded
  document.getElementById('requests-list').innerHTML = `
    <div class="request-item">
      <span class="ri-id">SOL-1101</span>
      <span class="ri-type">Vacaciones</span>
      <span class="ri-dates">10-14 Feb 2025</span>
      <span class="ri-status status-approved">Aprobado</span>
    </div>
    <div class="request-item">
      <span class="ri-id">SOL-0892</span>
      <span class="ri-type">Médico</span>
      <span class="ri-dates">15-17 Ene 2025</span>
      <span class="ri-status status-approved">Aprobado</span>
    </div>
  `
}

function closeRequestsModal() {
  document.getElementById('modal-requests').classList.add('hidden')
}
```

---

## js/sse.js — Manejo de eventos en tiempo real

```javascript
import { appendToBotBubble, addAgentStep, showRequestCard, finishProcessing } from './chat.js'

export function initSSE(sessionId, agentUrl) {
  const url = `${agentUrl}/sse/${sessionId}`
  const source = new EventSource(url)

  source.onmessage = (event) => {
    const data = JSON.parse(event.data)
    handleSSEEvent(data)
  }

  source.onerror = () => {
    console.warn('SSE connection lost. Reconnecting...')
    // EventSource reconecta automáticamente
  }

  console.log('📡 SSE conectado para sesión', sessionId)
}

function handleSSEEvent(data) {
  switch (data.event) {

    case 'agent_step':
      addAgentStep(data.description, data.icon)
      break

    case 'response_delta':
      appendToBotBubble(data.content)
      break

    case 'response_complete':
      // La respuesta está completa — nada extra que hacer
      break

    case 'request_created':
      showRequestCard(data)
      break

    case 'session_end':
      finishProcessing()
      break

    case 'error':
      appendToBotBubble(`⚠️ ${data.message}`)
      finishProcessing()
      break

    // Los eventos thinking_delta, tool_call, tool_result
    // van al panel admin — aquí los ignoramos
  }
}
```

---

## js/voice.js — Grabación de audio

```javascript
import { sendAudioMessage } from './chat.js'

let mediaRecorder = null
let audioChunks = []
let isRecording = false
let analyser = null
let animationFrame = null

export function initVoice() {
  const btnVoice = document.getElementById('btn-voice')
  
  // Pulsar y mantener para grabar, soltar para enviar
  btnVoice.addEventListener('mousedown', startRecording)
  btnVoice.addEventListener('mouseup', stopRecording)
  btnVoice.addEventListener('touchstart', startRecording, { passive: true })
  btnVoice.addEventListener('touchend', stopRecording)
}

async function startRecording() {
  if (APP.isProcessing) return
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    
    // Setup Web Audio API para visualizador
    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    drawVisualizer()

    // Setup MediaRecorder
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
    audioChunks = []
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data)
    }

    mediaRecorder.start(250)  // Chunks cada 250ms
    isRecording = true
    
    document.getElementById('btn-voice').classList.add('recording')
    
  } catch (error) {
    console.error('Error accediendo al micrófono:', error)
    alert('No se pudo acceder al micrófono. Verifica los permisos del navegador.')
  }
}

async function stopRecording() {
  if (!mediaRecorder || !isRecording) return
  isRecording = false
  
  cancelAnimationFrame(animationFrame)
  clearVisualizer()
  document.getElementById('btn-voice').classList.remove('recording')

  mediaRecorder.stop()
  mediaRecorder.stream.getTracks().forEach(track => track.stop())

  // Esperar a que se procesen todos los chunks
  await new Promise(resolve => { mediaRecorder.onstop = resolve })

  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
  
  if (audioBlob.size > 1000) {  // Ignorar grabaciones muy cortas (ruido)
    await sendAudioToAgent(audioBlob)
  }
}

async function sendAudioToAgent(audioBlob) {
  // La transcripción la hace el Worker con Whisper
  // Aquí solo enviamos el blob de audio
  const formData = new FormData()
  formData.append('audio', audioBlob, 'recording.webm')

  // Para la demo, se puede convertir a base64 y enviar vía WebSocket
  // O enviar como multipart/form-data
  // Simplificación: convertir a ArrayBuffer y enviar vía fetch
  const arrayBuffer = await audioBlob.arrayBuffer()
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

  // En una implementación real usarías WebSocket para streaming
  // Para la demo, POST normal con base64
  APP.isProcessing = true
  try {
    await fetch(`${APP.config.AGENT_URL}/audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': APP.sessionId
      },
      body: JSON.stringify({ audio: base64, mimeType: 'audio/webm' })
    })
  } catch (error) {
    console.error('Error enviando audio:', error)
    APP.isProcessing = false
  }
}

function drawVisualizer() {
  const canvas = document.getElementById('voice-visualizer')
  const ctx = canvas.getContext('2d')
  const dataArray = new Uint8Array(analyser.frequencyBinCount)

  function draw() {
    animationFrame = requestAnimationFrame(draw)
    analyser.getByteFrequencyData(dataArray)
    
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    const barWidth = 3
    const barGap = 2
    const bars = Math.floor(canvas.width / (barWidth + barGap))
    const step = Math.floor(dataArray.length / bars)
    
    ctx.fillStyle = '#F6821F'
    for (let i = 0; i < bars; i++) {
      const value = dataArray[i * step] / 255
      const barHeight = value * canvas.height
      const x = i * (barWidth + barGap)
      const y = (canvas.height - barHeight) / 2
      ctx.fillRect(x, y, barWidth, barHeight)
    }
  }
  draw()
}

function clearVisualizer() {
  const canvas = document.getElementById('voice-visualizer')
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}
```

---

## CSS — Estilos principales (extracto clave)

```css
/* Estructura */
.main-layout { display: flex; height: calc(100vh - 64px); }
.chat-container { flex: 1; display: flex; flex-direction: column; }
.messages-list { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }

/* Burbujas */
.message { display: flex; gap: 12px; max-width: 80%; }
.message-user { align-self: flex-end; flex-direction: row-reverse; }
.message-user .message-bubble { background: var(--primary); color: white; border-radius: 18px 18px 4px 18px; padding: 12px 16px; }
.message-bot .message-body { background: var(--surface); border-radius: 4px 18px 18px 18px; padding: 16px; box-shadow: var(--shadow); min-width: 200px; }

/* Pasos del agente */
.agent-step { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); padding: 4px 0; }
.step-pending .step-icon { color: var(--step-pending); animation: spin 1s linear infinite; }
.step-done .step-icon { color: var(--success); }
@keyframes spin { to { transform: rotate(360deg); } }

/* Card de solicitud */
.request-card { background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--accent); border-radius: var(--radius); padding: 16px; margin: 8px 0; }
.request-card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }

/* Input bar */
.input-bar { display: flex; gap: 8px; padding: 16px; border-top: 1px solid var(--border); background: var(--surface); }
.message-input { flex: 1; resize: none; border: 1px solid var(--border); border-radius: 24px; padding: 10px 16px; font-size: 14px; outline: none; }
.message-input:focus { border-color: var(--primary); }
.btn-send { background: var(--primary); color: white; border: none; border-radius: 50%; width: 42px; height: 42px; cursor: pointer; font-size: 18px; }
.btn-voice { background: none; border: 1px solid var(--border); border-radius: 24px; padding: 6px 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.btn-voice.recording { background: #FEE2E2; border-color: #EF4444; animation: pulse 1s ease infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }

/* Status badge */
.status-badge { display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
.status-idle { background: #D1FAE5; color: #065F46; }
.status-thinking { background: #FEF3C7; color: #92400E; }
.status-calling { background: #DBEAFE; color: #1E40AF; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.status-thinking .status-dot, .status-calling .status-dot { animation: blink 1s ease infinite; }
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
```
