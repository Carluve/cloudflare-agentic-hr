import { HRAgentSession } from './agent'
import type { Env, EmployeeContext } from './types'

export { HRAgentSession }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'hr-agent-worker' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    // ── Rutas ─────────────────────────────────────────────────────
    if (url.pathname === '/session/new' && request.method === 'POST') {
      return handleNewSession(request, env, corsHeaders)
    }

    if (url.pathname === '/chat' && request.method === 'POST') {
      return forwardToAgent(request, env, corsHeaders)
    }

    if (url.pathname === '/audio' && request.method === 'POST') {
      return forwardToAgent(request, env, corsHeaders)
    }

    if (url.pathname.startsWith('/sse/')) {
      const sessionId = url.pathname.split('/sse/')[1]
      return forwardToAgentSSE(request, env, sessionId, corsHeaders)
    }

    return new Response('Not found', { status: 404 })
  }
}

async function handleNewSession(
  request: Request,
  env: Env,
  corsHeaders: object
): Promise<Response> {
  const { employee_id } = await request.json() as { employee_id: string }
  const sessionId = crypto.randomUUID()

  // Guardar sesión en KV
  await env.HR_SESSIONS.put(
    sessionId,
    JSON.stringify({ employee_id, created_at: Date.now() }),
    { expirationTtl: 86400 }  // 24 horas
  )

  const employee = getEmployeeContext(employee_id)

  // Inicializar el Durable Object con el contexto del empleado
  const doId = env.AGENT_SESSION.idFromName(sessionId)
  const stub = env.AGENT_SESSION.get(doId)
  await stub.fetch(new Request('https://internal/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
    body: JSON.stringify({ employee })
  }))

  return new Response(JSON.stringify({ session_id: sessionId, employee }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  })
}

async function forwardToAgent(
  request: Request,
  env: Env,
  corsHeaders: object
): Promise<Response> {
  const sessionId = request.headers.get('X-Session-Id')
  if (!sessionId) {
    return new Response(
      JSON.stringify({ error: 'Missing X-Session-Id', code: 'MISSING_SESSION' }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }

  const sessionData = await env.HR_SESSIONS.get(sessionId)
  if (!sessionData) {
    return new Response(
      JSON.stringify({ error: 'Session not found', code: 'SESSION_NOT_FOUND' }),
      { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }

  const doId = env.AGENT_SESSION.idFromName(sessionId)
  const stub = env.AGENT_SESSION.get(doId)

  const url = new URL(request.url)
  const newRequest = new Request(`https://internal${url.pathname}`, {
    method: request.method,
    headers: { ...Object.fromEntries(request.headers), 'X-Session-Id': sessionId },
    body: request.body
  })

  const response = await stub.fetch(newRequest)
  return new Response(response.body, {
    status: response.status,
    headers: { ...Object.fromEntries(response.headers), ...corsHeaders }
  })
}

async function forwardToAgentSSE(
  request: Request,
  env: Env,
  sessionId: string,
  corsHeaders: object
): Promise<Response> {
  const doId = env.AGENT_SESSION.idFromName(sessionId)
  const stub = env.AGENT_SESSION.get(doId)
  const response = await stub.fetch(new Request('https://internal/sse', {
    headers: { 'X-Session-Id': sessionId }
  }))
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...corsHeaders
    }
  })
}

// Demo: datos fijos del empleado
function getEmployeeContext(employee_id: string): EmployeeContext {
  const employees: Record<string, EmployeeContext> = {
    'EMP-0042': {
      employee_id: 'EMP-0042',
      name: 'Carlos López',
      department: 'Ingeniería',
      manager: 'Ana García',
      manager_email: 'ana.garcia@empresa.com',
      hire_date: '2022-03-15',
    }
  }
  return employees[employee_id] ?? employees['EMP-0042']
}
