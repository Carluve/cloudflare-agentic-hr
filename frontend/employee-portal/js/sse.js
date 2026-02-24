import { appendToBotBubble, addAgentStep, markLastStepDone, showRequestCard, finishProcessing } from './chat.js'

export function initSSE(sessionId, agentUrl) {
  const url = `${agentUrl}/sse/${sessionId}`
  const source = new EventSource(url)

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      handleSSEEvent(data)
    } catch (e) {
      console.warn('SSE parse error:', e)
    }
  }

  source.onerror = () => {
    console.warn('SSE connection lost. Reconnecting...')
    // EventSource reconecta automáticamente
  }

  console.log('SSE conectado para sesión', sessionId)
}

function handleSSEEvent(data) {
  switch (data.event) {

    case 'session_ready':
      console.log('Sesión lista:', data.employee)
      break

    case 'agent_step':
      addAgentStep(data.description, data.icon)
      break

    case 'tool_result':
      markLastStepDone()
      break

    case 'response_delta':
      appendToBotBubble(data.content)
      break

    case 'response_complete':
      // Nada extra — la burbuja ya tiene el texto completo
      break

    case 'request_created':
      showRequestCard(data)
      break

    case 'session_end':
      finishProcessing()
      break

    case 'error':
      appendToBotBubble(`⚠️ ${data.message ?? 'Error desconocido'}`)
      finishProcessing()
      break

    // thinking_delta, tool_call, metrics_update → solo al panel admin
  }
}
