# 01 — Arquitectura del Sistema

## Diagrama de flujo completo

```
Usuario (voz o texto)
        │
        ▼
┌───────────────────────────────┐
│   Cloudflare Pages            │
│   /employee-portal  (HTML/JS) │  ← Portal del empleado
│   /admin-panel      (HTML/JS) │  ← Panel de observabilidad
└──────────┬────────────────────┘
           │ HTTP POST /chat  (texto)
           │ WebSocket /audio  (voz)
           │ GET /sse/:sessionId  (eventos)
           ▼
┌───────────────────────────────┐
│   workers/agent               │
│   Cloudflare Worker           │
│   Entry point / Router        │
│                               │
│   Routes:                     │
│   POST /session/new           │
│   POST /chat                  │
│   WS   /audio                 │
│   GET  /sse/:sessionId        │
└──────────┬────────────────────┘
           │ Durable Object stub
           ▼
┌───────────────────────────────────────────────────────┐
│   HRAgentSession — Durable Object (Agents SDK)        │
│                                                       │
│   Estado persistente:                                 │
│   - messages[]          historial completo            │
│   - employeeContext     datos del empleado            │
│   - sseConnections[]    clientes SSE suscritos        │
│                                                       │
│   Ciclo ReAct:                                        │
│   onMessage → [STT?] → addToHistory →                 │
│   callLLM(stream) → processChunks →                   │
│   [tool_use? → callMCP → addToolResult → continue]    │
│   → finalResponse → persistToD1                       │
└──────┬──────────────────────────┬────────────────────┘
       │                          │
       ▼ AI Gateway               ▼ fetch() HTTP
┌──────────────┐    ┌─────────────────────────────────┐
│ Anthropic    │    │  workers/mcp-policies            │
│ Claude 3.7   │    │  POST /call                      │
│ (streaming)  │    │  Tools: search_policy,           │
│ + thinking   │    │         get_policy_detail,       │
└──────────────┘    │         get_leave_types,         │
                    │         get_benefit_info,        │
┌──────────────┐    │         get_faq                  │
│ Workers AI   │    └─────────────────────────────────┘
│ Whisper STT  │
│ (audio blob) │    ┌─────────────────────────────────┐
└──────────────┘    │  workers/mcp-cases               │
                    │  POST /call                      │
┌──────────────┐    │  Tools: get_leave_balance,       │
│ Cloudflare   │    │         create_leave_request,    │
│ D1 (SQLite)  │    │         get_request_status,      │
│ sessions     │    │         list_my_requests,        │
│ messages     │    │         notify_approver,         │
│ leave_reqs   │    │         cancel_request           │
│ agent_events │    └─────────────────────────────────┘
└──────────────┘
```

---

## Protocolo de comunicación frontend ↔ backend

### 1. Crear sesión

```
POST /session/new
Body: { employee_id: string }
Response: { session_id: string, employee: EmployeeContext }
```

### 2. Enviar mensaje de texto

```
POST /chat
Headers: X-Session-Id: <session_id>
Body: { text: string }
Response: 200 OK (inmediato — la respuesta llega por SSE)
```

### 3. Enviar audio

```
WebSocket /audio
Headers: X-Session-Id: <session_id>
Cliente envía: Blob de audio (webm/opus, chunks de ~250ms)
Servidor responde con SSE al finalizar la transcripción
```

### 4. Suscribirse a eventos SSE

```
GET /sse/:sessionId
Response: text/event-stream
```

---

## Catálogo de eventos SSE

Todos los eventos siguen la estructura:
```typescript
interface SSEEvent {
  event: string
  timestamp: number
  sessionId: string
  [key: string]: any
}
```

| Evento | Payload adicional | Destino UI |
|---|---|---|
| `session_ready` | `{ employee }` | Ambos portales |
| `transcription_chunk` | `{ text, confidence, isFinal }` | Panel admin |
| `thinking_delta` | `{ content }` | Panel admin |
| `agent_step` | `{ step, description, icon }` | Portal empleado |
| `tool_call` | `{ tool, server, params, callId }` | Panel admin |
| `tool_result` | `{ callId, result, duration_ms }` | Panel admin |
| `response_delta` | `{ content }` | Portal empleado |
| `response_complete` | `{ fullText }` | Portal empleado |
| `request_created` | `{ requestId, type, status, approver, dates }` | Portal empleado |
| `metrics_update` | `{ tokens, latency_ms, toolCalls, cost_usd }` | Panel admin |
| `session_end` | `{ totalTokens, duration_ms, summary }` | Ambos |
| `error` | `{ message, code }` | Ambos |

---

## Decisiones de diseño

### Por qué Durable Objects y no Workers stateless
El agente necesita mantener el historial completo de la conversación entre mensajes. Un Worker stateless perdería el contexto en cada petición. El Durable Object garantiza que la misma instancia (con su estado en memoria) atiende todos los mensajes de una sesión.

### Por qué SSE y no WebSocket bidireccional
SSE es unidireccional (servidor → cliente) y mucho más simple de implementar y depurar. El cliente envía mensajes via HTTP POST normal. Para el audio sí se usa WebSocket porque necesitamos streaming bidireccional.

### Por qué dos MCP Servers separados
Separación de responsabilidades clara. El MCP de políticas es read-only (no modifica nada). El MCP de casos tiene efectos secundarios (crea solicitudes, envía emails). Tenerlos separados también permite escalarlos y versionar independientemente.

### Por qué fetch() para llamar a los MCP y no el SDK oficial de MCP
Los MCP Servers viven en Workers de Cloudflare accesibles por HTTP. La llamada es un simple `POST /call` con `{ tool, input }`. Esto es más simple que el transporte stdio del SDK oficial de MCP, y funciona perfectamente en el entorno de Workers.
