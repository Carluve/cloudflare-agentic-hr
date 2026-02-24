let currentBotBubble = null
let currentStepsList = null

export function initChat() {
  const input     = document.getElementById('message-input')
  const btnSend   = document.getElementById('btn-send')
  const btnMyReqs = document.getElementById('btn-my-requests')

  // Habilitar botón cuando hay texto
  input.addEventListener('input', () => {
    btnSend.disabled = input.value.trim() === '' || APP.isProcessing
    // Auto-resize textarea
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 120) + 'px'
  })

  // Enviar con Enter (Shift+Enter = nueva línea)
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
  btnMyReqs.addEventListener('click', openRequestsModal)
  document.getElementById('btn-close-modal').addEventListener('click', closeRequestsModal)

  // Cerrar modal clicando fuera
  document.getElementById('modal-requests').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeRequestsModal()
  })
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

  addUserBubble(text)

  currentBotBubble = addBotBubble()
  currentStepsList = currentBotBubble.querySelector('.message-steps')

  updateStatus('thinking')
  document.getElementById('btn-send').disabled = true

  try {
    const res = await fetch(`${APP.config.AGENT_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': APP.sessionId
      },
      body: JSON.stringify({ text })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    // La respuesta llega por SSE
  } catch (error) {
    appendToBotBubble('Lo siento, hubo un error de conexión. Por favor intenta de nuevo.')
    finishProcessing()
  }
}

// ── Renderizado de burbujas ───────────────────────────────────

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

export function appendToBotBubble(text) {
  if (!currentBotBubble) return
  const textEl = currentBotBubble.querySelector('.message-text')
  textEl.textContent += text
  scrollToBottom()
}

export function addAgentStep(description, icon) {
  if (!currentStepsList) return
  const el = document.createElement('div')
  el.className = 'agent-step step-pending'
  el.innerHTML = `
    <span class="step-icon">${icon ?? '⟳'}</span>
    <span class="step-text">${escapeHtml(description)}</span>
  `
  currentStepsList.appendChild(el)
  scrollToBottom()
  return el
}

export function markLastStepDone() {
  if (!currentStepsList) return
  const steps = currentStepsList.querySelectorAll('.agent-step')
  if (steps.length === 0) return
  const last = steps[steps.length - 1]
  last.className = 'agent-step step-done'
  last.querySelector('.step-icon').textContent = '✓'
}

export function showRequestCard(data) {
  const card = document.createElement('div')
  card.className = 'request-card'
  card.innerHTML = `
    <div class="request-card-header">
      <span class="request-card-icon">📋</span>
      <div>
        <div class="request-card-id">${escapeHtml(data.requestId ?? '')}</div>
        <div class="request-card-type">${escapeHtml(data.type ?? 'Solicitud de permiso')}</div>
      </div>
      <span class="request-card-status status-pending">Pendiente</span>
    </div>
    <div class="request-card-details">
      <div class="request-detail">
        <span class="detail-label">Fechas</span>
        <span class="detail-value">${escapeHtml(data.dates ?? '—')}</span>
      </div>
      <div class="request-detail">
        <span class="detail-label">Aprobador</span>
        <span class="detail-value">${escapeHtml(data.approver ?? '—')}</span>
      </div>
    </div>
  `
  document.getElementById('messages').appendChild(card)
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

// ── Helpers ───────────────────────────────────────────────────

function updateStatus(state) {
  const badge = document.getElementById('agent-status')
  const labels = {
    idle:       { text: 'Disponible',    cls: 'status-idle' },
    thinking:   { text: 'Pensando...',   cls: 'status-thinking' },
    calling:    { text: 'Consultando...', cls: 'status-calling' },
    responding: { text: 'Respondiendo...', cls: 'status-responding' },
  }
  const s = labels[state] ?? labels.idle
  badge.className = `status-badge ${s.cls}`
  badge.querySelector('.status-text').textContent = s.text
}

function scrollToBottom() {
  const el = document.getElementById('messages')
  el.scrollTop = el.scrollHeight
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function openRequestsModal() {
  document.getElementById('modal-requests').classList.remove('hidden')
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
