import { Agent } from 'agents'
import Anthropic from '@anthropic-ai/sdk'
import { buildSystemPrompt } from './prompts'
import { transcribeAudio } from './stt'
import type { Env, Message, EmployeeContext, MCPCallResponse } from './types'

export class HRAgentSession extends Agent<Env> {
  private messages: Message[] = []
  private employee: EmployeeContext | null = null
  private sseConnections: Map<string, any> = new Map()

  // ── Manejo de conexiones ───────────────────────────────────────

  async onConnect(_connection: any, _ctx: any) {
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

    // Inicializar contexto del empleado
    if (url.pathname === '/init' && request.method === 'POST') {
      const { employee } = await request.json() as { employee: EmployeeContext }
      this.employee = employee
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Audio vía POST con base64
    if (url.pathname === '/audio' && request.method === 'POST') {
      const { audio } = await request.json() as { audio: string }
      const sessionId = request.headers.get('X-Session-Id')!
      const binaryStr = atob(audio)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
      this.processAudio(bytes.buffer, sessionId)  // async sin await
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

    const controller = {
      enqueue: (data: string) => writer.write(encoder.encode(data)),
      close: () => writer.close()
    }
    this.sseConnections.set(connectionId, controller)

    // Limpiar al desconectar
    request.signal?.addEventListener('abort', () => {
      this.sseConnections.delete(connectionId)
    })

    // Evento inicial
    this.sendToConnection(connectionId, 'session_ready', {
      employee: this.employee,
      sessionId
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    })
  }

  private sendToConnection(connectionId: string, eventName: string, payload: Record<string, any>) {
    const controller = this.sseConnections.get(connectionId)
    if (!controller) return
    const data = JSON.stringify({ event: eventName, timestamp: Date.now(), ...payload })
    try {
      controller.enqueue(`data: ${data}\n\n`)
    } catch {
      this.sseConnections.delete(connectionId)
    }
  }

  // ── Broadcast de eventos ───────────────────────────────────────

  private broadcast(eventName: string, payload: Record<string, any>) {
    const data = JSON.stringify({ event: eventName, timestamp: Date.now(), ...payload })
    const message = `data: ${data}\n\n`

    for (const [id, controller] of this.sseConnections) {
      try {
        controller.enqueue(message)
      } catch {
        this.sseConnections.delete(id)
      }
    }
  }

  // ── Pipeline principal ─────────────────────────────────────────

  async processMessage(text: string, sessionId: string) {
    this.broadcast('agent_step', {
      step: 'thinking',
      description: 'Analizando tu consulta...',
      icon: '🧠'
    })

    this.messages.push({ role: 'user', content: text })

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

      for await (const event of stream) {

        if (event.type === 'content_block_delta') {

          if (event.delta.type === 'thinking_delta') {
            this.broadcast('thinking_delta', {
              content: event.delta.thinking
            })
          }

          if (event.delta.type === 'text_delta') {
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

      const finalMsg = await stream.finalMessage()

      // Emitir métricas
      const usage = finalMsg.usage
      this.broadcast('metrics_update', {
        tokens: usage.input_tokens + usage.output_tokens,
        latency_ms: Date.now() - startTime,
        toolCalls: toolCalls.length,
        cost_usd: ((usage.input_tokens * 3 + usage.output_tokens * 15) / 1_000_000).toFixed(4)
      })

      // Agregar respuesta del asistente al historial
      this.messages.push({ role: 'assistant', content: finalMsg.content as any })

      if (responseText) {
        this.broadcast('response_complete', { fullText: responseText })
      }

      // Ejecutar tool calls si los hay
      if (toolCalls.length > 0 && continueLoop) {
        const toolResults = await this.executeToolCalls(toolCalls)
        this.messages.push({ role: 'user', content: toolResults })
      }
    }

    await this.persistSession(sessionId)

    this.broadcast('session_end', {
      summary: 'Conversación completada'
    })
  }

  // ── Ejecución de herramientas MCP ─────────────────────────────

  private async executeToolCalls(toolCalls: any[]): Promise<any[]> {
    const results = []

    for (const call of toolCalls) {
      let input = {}
      try {
        input = JSON.parse(call.input)
      } catch {
        input = {}
      }

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

      this.broadcast('tool_result', {
        callId: call.id,
        result,
        duration_ms: Date.now() - startTime
      })

      if (call.name === 'create_leave_request' && result.success) {
        this.broadcast('request_created', {
          requestId: result.result.request_id,
          type: result.result.leave_type_label,
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
    const policyTools = ['search_policy', 'get_policy_detail', 'get_leave_types', 'get_benefit_info', 'get_faq']
    const serverUrl = policyTools.includes(toolName)
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
      get_leave_types: 'Listando tipos de permiso...',
      get_leave_balance: 'Verificando días disponibles...',
      create_leave_request: 'Creando solicitud formal...',
      get_request_status: 'Consultando estado de solicitud...',
      list_my_requests: 'Listando tus solicitudes...',
      notify_approver: 'Notificando al manager...',
    }
    return descriptions[toolName] ?? `Ejecutando ${toolName}...`
  }

  private async persistSession(sessionId: string) {
    try {
      await this.env.DB.prepare(
        'INSERT OR REPLACE INTO sessions (id, employee_id, last_active) VALUES (?, ?, ?)'
      ).bind(sessionId, this.employee?.employee_id, Date.now()).run()
    } catch {
      // No bloquear si falla la persistencia
    }
  }
}
