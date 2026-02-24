# 02 — Agent Core (Durable Object)

## Archivos a crear

```
workers/agent/
├── src/
│   ├── index.ts          ← Entry point: HTTP router + WebSocket
│   ├── agent.ts          ← HRAgentSession Durable Object
│   ├── stream.ts         ← SSE broadcaster
│   ├── stt.ts            ← Speech-to-Text con Workers AI Whisper
│   ├── prompts.ts        ← System prompt del agente
│   └── types.ts          ← Tipos TypeScript compartidos
└── wrangler.toml
```

---

## types.ts

```typescript
export interface Env {
  AGENT_SESSION: DurableObjectNamespace
  AI: Ai
  DB: D1Database
  HR_SESSIONS: KVNamespace
  AUDIO_BUCKET: R2Bucket
  MCP_POLICIES_URL: string
  MCP_CASES_URL: string
  AI_GATEWAY_URL: string
  ANTHROPIC_API_KEY: string
  SESSION_SECRET: string
}

export interface EmployeeContext {
  employee_id: string
  name: string
  department: string
  manager: string
  manager_email: string
  hire_date: string
}

export interface Message {
  role: 'user' | 'assistant' | 'tool'
  content: string | ContentBlock[]
}

export interface ContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result'
  [key: string]: any
}

export interface SSEConnection {
  controller: ReadableStreamDefaultController
  sessionId: string
}

export interface MCPCallRequest {
  tool: string
  input: Record<string, any>
}

export interface MCPCallResponse {
  success: boolean
  result?: any
  error?: string
}
```

---

## index.ts — Entry Point y Router

```typescript
import { HRAgentSession } from './agent'
export { HRAgentSession }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // CORS headers para el frontend en Pages
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // ── Rutas ────────────────────────────────────────────────────
    if (url.pathname === '/session/new' && request.method === 'POST') {
      return handleNewSession(request, env, corsHeaders)
    }

    if (url.pathname === '/chat' && request.method === 'POST') {
      return forwardToAgent(request, env, 'chat', corsHeaders)
    }

    if (url.pathname === '/audio' && request.headers.get('Upgrade') === 'websocket') {
      return forwardToAgent(request, env, 'audio', corsHeaders)
    }

    if (url.pathname.startsWith('/sse/')) {
      const sessionId = url.pathname.split('/sse/')[1]
      return forwardToAgentSSE(request, env, sessionId, corsHeaders)
    }

    return new Response('Not found', { status: 404 })
  }
}

async function handleNewSession(request: Request, env: Env, corsHeaders: object): Promise<Response> {
  const { employee_id } = await request.json() as { employee_id: string }
  const sessionId = crypto.randomUUID()

  // Guardar sesión en KV
  await env.HR_SESSIONS.put(sessionId, JSON.stringify({ employee_id, created_at: Date.now() }), {
    expirationTtl: 86400 // 24 horas
  })

  // Obtener datos del empleado (en demo: datos hardcoded, en prod: desde D1/LDAP)
  const employee = getEmployeeContext(employee_id)

  return new Response(JSON.stringify({ session_id: sessionId, employee }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  })
}

async function forwardToAgent(request: Request, env: Env, type: string, corsHeaders: object): Promise<Response> {
  const sessionId = request.headers.get('X-Session-Id')
  if (!sessionId) return new Response('Missing X-Session-Id', { status: 401 })

  const sessionData = await env.HR_SESSIONS.get(sessionId)
  if (!sessionData) return new Response('Session not found', { status: 404 })

  // Obtener o crear el Durable Object para esta sesión
  const doId = env.AGENT_SESSION.idFromName(sessionId)
  const stub = env.AGENT_SESSION.get(doId)

  // Añadir sessionId al request para que el DO lo tenga
  const newRequest = new Request(request.url, {
    method: request.method,
    headers: { ...Object.fromEntries(request.headers), 'X-Session-Id': sessionId },
    body: request.body
  })

  return stub.fetch(newRequest)
}

async function forwardToAgentSSE(request: Request, env: Env, sessionId: string, corsHeaders: object): Promise<Response> {
  const doId = env.AGENT_SESSION.idFromName(sessionId)
  const stub = env.AGENT_SESSION.get(doId)
  return stub.fetch(new Request(`${new URL(request.url).origin}/sse`, {
    headers: { 'X-Session-Id': sessionId }
  }))
}

// Demo: datos fijos del empleado (en prod vendría de D1 o LDAP)
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
```

---

## agent.ts — HRAgentSession Durable Object

```typescript
import { Agent } from 'agents'
import Anthropic from '@anthropic-ai/sdk'
import { buildSystemPrompt } from './prompts'
import { transcribeAudio } from './stt'
import type { Env, Message, EmployeeContext, MCPCallRequest, MCPCallResponse } from './types'

export class HRAgentSession extends Agent<Env> {
  private messages: Message[] = []
  private employee: EmployeeContext | null = null
  private sseConnections: Map<string, ReadableStreamDefaultController> = new Map()
  private requestCounter = 0

  // ── Manejo de conexiones ───────────────────────────────────────

  async onConnect(connection: any, ctx: any) {
    // No hacer nada al conectar — el estado se inicializa con el primer mensaje
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // Suscripción SSE
    if (url.pathname === '/sse') {
      return this.handleSSESubscription(request)
    }

    // Mensaje de texto
    if (url.pathname === '/chat' && request.method === 'POST') {
      const { text } = await request.json() as { text: string }
      const sessionId = request.headers.get('X-Session-Id')!
      this.processMessage(text, sessionId)  // async sin await — responde vía SSE
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response('Not found', { status: 404 })
  }

  private handleSSESubscription(request: Request): Response {
    const sessionId = request.headers.get('X-Session-Id')!
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()

    const connectionId = crypto.randomUUID()
    
    // Guardar referencia para broadcast
    const controller = {
      enqueue: (data: string) => writer.write(encoder.encode(data)),
      close: () => writer.close()
    }
    this.sseConnections.set(connectionId, controller as any)

    // Limpiar al desconectar
    request.signal?.addEventListener('abort', () => {
      this.sseConnections.delete(connectionId)
    })

    // Evento inicial
    this.sendToConnection(connectionId, 'session_ready', {
      employee: this.employee
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    })
  }

  // ── Broadcast de eventos ───────────────────────────────────────

  private broadcast(eventName: string, payload: Record<string, any>) {
    const data = JSON.stringify({ event: eventName, timestamp: Date.now(), ...payload })
    const message = `data: ${data}\n\n`
    
    for (const [id, controller] of this.sseConnections) {
      try {
        (controller as any).enqueue(message)
      } catch {
        this.sseConnections.delete(id)
      }
    }
  }

  // ── Pipeline principal ─────────────────────────────────────────

  async processMessage(text: string, sessionId: string) {
    // Emitir paso al portal del empleado
    this.broadcast('agent_step', {
      step: 'thinking',
      description: 'Analizando tu consulta...',
      icon: '🧠'
    })

    // Agregar al historial
    this.messages.push({ role: 'user', content: text })

    // Llamar al LLM con streaming
    await this.runAgentLoop(sessionId)
  }

  async processAudio(audioBlob: ArrayBuffer, sessionId: string) {
    this.broadcast('agent_step', {
      step: 'transcribing',
      description: 'Transcribiendo audio...',
      icon: '🎤'
    })

    const transcription = await transcribeAudio(audioBlob, this.env)
    
    this.broadcast('transcription_chunk', {
      text: transcription.text,
      confidence: transcription.confidence,
      isFinal: true
    })

    await this.processMessage(transcription.text, sessionId)
  }

  // ── Ciclo del agente (ReAct) ───────────────────────────────────

  private async runAgentLoop(sessionId: string) {
    const client = new Anthropic({
      baseURL: `${this.env.AI_GATEWAY_URL}/anthropic`,
      apiKey: this.env.ANTHROPIC_API_KEY,
    })

    const tools = this.getToolDefinitions()

    let continueLoop = true
    
    while (continueLoop) {
      continueLoop = false  // Solo continúa si hay tool_use

      const stream = await client.messages.stream({
        model: 'claude-3-7-sonnet-latest',
        max_tokens: 16000,
        thinking: { type: 'enabled', budget_tokens: 8000 },
        system: buildSystemPrompt(this.employee),
        tools,
        messages: this.messages as any,
      })

      const toolCalls: any[] = []
      let responseText = ''
      const startTime = Date.now()

      // Procesar el stream chunk a chunk
      for await (const event of stream) {
        
        if (event.type === 'content_block_delta') {
          
          if (event.delta.type === 'thinking_delta') {
            // Stream del razonamiento → panel admin
            this.broadcast('thinking_delta', {
              content: event.delta.thinking
            })
          }
          
          if (event.delta.type === 'text_delta') {
            // Stream de la respuesta → portal empleado
            responseText += event.delta.text
            this.broadcast('response_delta', {
              content: event.delta.text
            })
          }
        }

        if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          toolCalls.push({ ...event.content_block, input: '' })
          continueLoop = true
        }

        if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
          if (toolCalls.length > 0) {
            toolCalls[toolCalls.length - 1].input += event.delta.partial_json
          }
        }
      }

      // Emitir métricas
      const usage = (await stream.finalMessage()).usage
      this.broadcast('metrics_update', {
        tokens: usage.input_tokens + usage.output_tokens,
        latency_ms: Date.now() - startTime,
        toolCalls: toolCalls.length,
        cost_usd: ((usage.input_tokens * 3 + usage.output_tokens * 15) / 1_000_000).toFixed(4)
      })

      // Agregar respuesta del asistente al historial
      const assistantContent = await stream.finalMessage()
      this.messages.push({ role: 'assistant', content: assistantContent.content as any })

      if (responseText) {
        this.broadcast('response_complete', { fullText: responseText })
      }

      // Ejecutar tool calls si los hay
      if (toolCalls.length > 0 && continueLoop) {
        const toolResults = await this.executeToolCalls(toolCalls)
        
        // Agregar resultados al historial para la siguiente iteración
        this.messages.push({
          role: 'user',
          content: toolResults
        })
      }
    }

    // Persistir en D1
    await this.persistSession(sessionId)
    
    this.broadcast('session_end', {
      summary: 'Conversación completada'
    })
  }

  // ── Ejecución de herramientas MCP ─────────────────────────────

  private async executeToolCalls(toolCalls: any[]): Promise<any[]> {
    const results = []

    for (const call of toolCalls) {
      // Parsear el input JSON acumulado
      let input = {}
      try {
        input = JSON.parse(call.input)
      } catch {
        input = {}
      }

      // Emitir: el agente está llamando a esta herramienta
      this.broadcast('tool_call', {
        tool: call.name,
        server: this.getServerForTool(call.name),
        params: input,
        callId: call.id
      })

      this.broadcast('agent_step', {
        step: 'tool_call',
        description: this.getToolDescription(call.name),
        icon: '🔧'
      })

      const startTime = Date.now()
      const result = await this.callMCP(call.name, input)
      
      // Emitir resultado
      this.broadcast('tool_result', {
        callId: call.id,
        result,
        duration_ms: Date.now() - startTime
      })

      // Si el MCP creó una solicitud, emitir evento especial para la UI
      if (call.name === 'create_leave_request' && result.success) {
        this.broadcast('request_created', {
          requestId: result.result.request_id,
          type: result.result.leave_type,
          status: result.result.status,
          approver: result.result.approver,
          dates: result.result.dates
        })
      }

      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: JSON.stringify(result)
      })
    }

    return results
  }

  private async callMCP(toolName: string, input: any): Promise<MCPCallResponse> {
    const serverUrl = toolName.startsWith('policy_') || 
                      ['search_policy', 'get_policy_detail', 'get_leave_types', 'get_benefit_info', 'get_faq'].includes(toolName)
      ? this.env.MCP_POLICIES_URL
      : this.env.MCP_CASES_URL

    try {
      const response = await fetch(`${serverUrl}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: toolName, input })
      })

      if (!response.ok) {
        return { success: false, error: `MCP error: ${response.status}` }
      }

      const result = await response.json()
      return { success: true, result }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // ── Tool definitions para el LLM ──────────────────────────────

  private getToolDefinitions() {
    return [
      // MCP Policies
      {
        name: 'search_policy',
        description: 'Busca en el manual de políticas internas de RRHH. Úsalo cuando el empleado pregunta sobre vacaciones, permisos, beneficios u otras políticas.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Término de búsqueda' },
            category: { type: 'string', enum: ['leave', 'benefits', 'conduct', 'remote_work', 'compensation'], description: 'Categoría opcional para filtrar' }
          },
          required: ['query']
        }
      },
      {
        name: 'get_policy_detail',
        description: 'Obtiene el texto completo de una política específica por su ID.',
        input_schema: {
          type: 'object',
          properties: {
            policy_id: { type: 'string', description: 'ID de la política (ej: POL-001)' }
          },
          required: ['policy_id']
        }
      },
      {
        name: 'get_leave_types',
        description: 'Lista todos los tipos de permiso disponibles en la empresa.',
        input_schema: { type: 'object', properties: {} }
      },
      // MCP Cases
      {
        name: 'get_leave_balance',
        description: 'Obtiene los días disponibles de un tipo de permiso para el empleado actual. SIEMPRE llama a esto antes de crear una solicitud.',
        input_schema: {
          type: 'object',
          properties: {
            employee_id: { type: 'string', description: 'ID del empleado' },
            leave_type: { type: 'string', enum: ['vacation', 'medical', 'personal', 'maternity', 'paternity'] }
          },
          required: ['employee_id', 'leave_type']
        }
      },
      {
        name: 'create_leave_request',
        description: 'Crea una solicitud formal de permiso. Solo llamar después de verificar el balance con get_leave_balance.',
        input_schema: {
          type: 'object',
          properties: {
            employee_id: { type: 'string' },
            leave_type: { type: 'string', enum: ['vacation', 'medical', 'personal'] },
            start_date: { type: 'string', description: 'Formato YYYY-MM-DD' },
            end_date: { type: 'string', description: 'Formato YYYY-MM-DD' },
            reason: { type: 'string', description: 'Motivo opcional' },
            requires_document: { type: 'boolean', description: 'Si requiere justificante' }
          },
          required: ['employee_id', 'leave_type', 'start_date', 'end_date']
        }
      },
      {
        name: 'get_request_status',
        description: 'Obtiene el estado actual de una solicitud de permiso.',
        input_schema: {
          type: 'object',
          properties: {
            request_id: { type: 'string', description: 'ID de la solicitud (ej: SOL-2847)' }
          },
          required: ['request_id']
        }
      },
      {
        name: 'list_my_requests',
        description: 'Lista todas las solicitudes de un empleado.',
        input_schema: {
          type: 'object',
          properties: {
            employee_id: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'all'], description: 'Filtrar por estado' }
          },
          required: ['employee_id']
        }
      },
      {
        name: 'notify_approver',
        description: 'Envía notificación al manager. SIEMPRE llamar después de create_leave_request.',
        input_schema: {
          type: 'object',
          properties: {
            request_id: { type: 'string' },
            channel: { type: 'string', enum: ['email', 'slack'], default: 'email' }
          },
          required: ['request_id']
        }
      }
    ]
  }

  // ── Helpers ────────────────────────────────────────────────────

  private getServerForTool(toolName: string): string {
    const policyTools = ['search_policy', 'get_policy_detail', 'get_leave_types', 'get_benefit_info', 'get_faq']
    return policyTools.includes(toolName) ? 'MCP Policies' : 'MCP Cases'
  }

  private getToolDescription(toolName: string): string {
    const descriptions: Record<string, string> = {
      search_policy: 'Buscando en políticas de RRHH...',
      get_policy_detail: 'Leyendo detalle de política...',
      get_leave_balance: 'Verificando días disponibles...',
      create_leave_request: 'Creando solicitud formal...',
      get_request_status: 'Consultando estado de solicitud...',
      list_my_requests: 'Listando tus solicitudes...',
      notify_approver: 'Notificando al manager...',
    }
    return descriptions[toolName] ?? `Ejecutando ${toolName}...`
  }

  private async persistSession(sessionId: string) {
    // Guardar el historial en D1 para recuperarlo si se reconecta
    try {
      await this.env.DB.prepare(
        'INSERT OR REPLACE INTO sessions (id, employee_id, last_active) VALUES (?, ?, ?)'
      ).bind(sessionId, this.employee?.employee_id, Date.now()).run()
    } catch {
      // No bloquear si falla la persistencia
    }
  }
}
```

---

## prompts.ts — System Prompt

```typescript
import type { EmployeeContext } from './types'

export function buildSystemPrompt(employee: EmployeeContext | null): string {
  const today = new Date().toLocaleDateString('es-ES', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  })

  return `Eres el Asistente de Recursos Humanos de Empresa Demo S.A.
Tu objetivo es ayudar a los empleados con sus consultas de RRHH de forma autónoma, empática y precisa.
Hoy es ${today}.

EMPLEADO ACTUAL:
- Nombre: ${employee?.name ?? 'Empleado'}
- ID: ${employee?.employee_id ?? 'desconocido'}
- Departamento: ${employee?.department ?? 'desconocido'}
- Manager: ${employee?.manager ?? 'desconocido'} (${employee?.manager_email ?? ''})
- Fecha de incorporación: ${employee?.hire_date ?? 'desconocida'}

CAPACIDADES:
- Puedes consultar políticas internas con search_policy y get_policy_detail.
- Puedes gestionar solicitudes de permisos con las herramientas de casos.
- SIEMPRE verifica el balance de días con get_leave_balance antes de crear una solicitud.
- SIEMPRE notifica al manager con notify_approver después de crear una solicitud.

REGLAS:
- Habla en español. Sé empático: los permisos médicos son situaciones sensibles.
- Nunca inventes información sobre políticas. Usa siempre las herramientas.
- Informa al empleado de cada paso: "Estoy verificando tu balance...", "Creando tu solicitud...".
- Si no tienes días disponibles, explícalo claramente y sugiere alternativas.
- Si no puedes resolver algo, indica: "Te recomiendo contactar directamente con el equipo de RRHH."
- Sé conciso en las respuestas finales. No repitas lo que ya se mostró en los pasos de progreso.`
}
```

---

## stt.ts — Speech-to-Text

```typescript
import type { Env } from './types'

export async function transcribeAudio(
  audioBlob: ArrayBuffer, 
  env: Env
): Promise<{ text: string; confidence: number }> {
  
  const result = await env.AI.run('@cf/openai/whisper', {
    audio: [...new Uint8Array(audioBlob)],
  })

  return {
    text: result.text ?? '',
    confidence: 0.95  // Whisper no retorna confidence score, usar valor alto por defecto
  }
}
```

---

## wrangler.toml

```toml
name = "hr-agent-worker"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[ai]
binding = "AI"

[[durable_objects.bindings]]
name = "AGENT_SESSION"
class_name = "HRAgentSession"

[[migrations]]
tag = "v1"
new_classes = ["HRAgentSession"]

[[d1_databases]]
binding = "DB"
database_name = "hr-agent-db"
database_id = "REEMPLAZAR_CON_TU_DATABASE_ID"

[[kv_namespaces]]
binding = "HR_SESSIONS"
id = "REEMPLAZAR_CON_TU_KV_ID"

[[r2_buckets]]
binding = "AUDIO_BUCKET"
bucket_name = "hr-audio-recordings"

[vars]
MCP_POLICIES_URL = "https://mcp-policies.USUARIO.workers.dev"
MCP_CASES_URL = "https://mcp-cases.USUARIO.workers.dev"
AI_GATEWAY_URL = "https://gateway.ai.cloudflare.com/v1/ACCOUNT_ID/hr-demo"

# Secretos — añadir con:
# wrangler secret put ANTHROPIC_API_KEY
# wrangler secret put SESSION_SECRET
```

---

## package.json

```json
{
  "name": "hr-agent-worker",
  "version": "1.0.0",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "types": "wrangler types"
  },
  "dependencies": {
    "agents": "latest",
    "@anthropic-ai/sdk": "^0.30.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.0.0",
    "typescript": "^5.0.0",
    "wrangler": "^3.0.0"
  }
}
```
