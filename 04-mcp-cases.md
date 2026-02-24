# 04 — MCP Server: HR Cases

## Propósito

Worker que gestiona el ciclo de vida de solicitudes de permisos. Tiene **efectos secundarios**: crea registros en D1, simula notificaciones por email. Recibe llamadas del Agent Worker vía `POST /call`.

## Archivos a crear

```
workers/mcp-cases/
├── src/
│   ├── index.ts
│   └── tools/
│       ├── get_leave_balance.ts
│       ├── create_leave_request.ts
│       ├── get_request_status.ts
│       ├── list_my_requests.ts
│       ├── notify_approver.ts
│       └── cancel_request.ts
└── wrangler.toml
```

---

## index.ts — Entry Point

```typescript
import { getLeaveBalance } from './tools/get_leave_balance'
import { createLeaveRequest } from './tools/create_leave_request'
import { getRequestStatus } from './tools/get_request_status'
import { listMyRequests } from './tools/list_my_requests'
import { notifyApprover } from './tools/notify_approver'
import { cancelRequest } from './tools/cancel_request'

interface Env {
  DB: D1Database
}

const TOOLS: Record<string, (input: any, env: Env) => Promise<any>> = {
  get_leave_balance: getLeaveBalance,
  create_leave_request: createLeaveRequest,
  get_request_status: getRequestStatus,
  list_my_requests: listMyRequests,
  notify_approver: notifyApprover,
  cancel_request: cancelRequest,
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

    const url = new URL(request.url)

    if (url.pathname === '/call' && request.method === 'POST') {
      const { tool, input } = await request.json() as { tool: string; input: any }

      const handler = TOOLS[tool]
      if (!handler) {
        return new Response(
          JSON.stringify({ error: `Tool '${tool}' not found` }),
          { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        )
      }

      try {
        const result = await handler(input, env)
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        })
      } catch (error) {
        return new Response(
          JSON.stringify({ error: String(error) }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        )
      }
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, tools: Object.keys(TOOLS) }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response('Not found', { status: 404 })
  }
}
```

---

## tools/get_leave_balance.ts

```typescript
// Datos de demo hardcoded — en prod vendría de D1 o de un HRIS externo
const DEMO_BALANCES: Record<string, Record<string, { available: number; used: number; total: number }>> = {
  'EMP-0042': {
    vacation: { available: 18, used: 2, total: 20 },
    medical:  { available: 12, used: 3, total: 15 },
    personal: { available: 3,  used: 0, total: 3  },
  }
}

export async function getLeaveBalance(input: { employee_id: string; leave_type: string }, env: any) {
  const balances = DEMO_BALANCES[input.employee_id] ?? DEMO_BALANCES['EMP-0042']
  const balance = balances[input.leave_type]

  if (!balance) {
    return { error: `Tipo de permiso '${input.leave_type}' no reconocido` }
  }

  return {
    employee_id: input.employee_id,
    leave_type: input.leave_type,
    available: balance.available,
    used: balance.used,
    total: balance.total,
    year: new Date().getFullYear(),
    message: balance.available > 0
      ? `Tienes ${balance.available} días disponibles de ${balance.total} totales.`
      : `Has agotado tu permiso de ${input.leave_type} este año.`
  }
}
```

---

## tools/create_leave_request.ts

```typescript
interface CreateLeaveInput {
  employee_id: string
  leave_type: 'vacation' | 'medical' | 'personal'
  start_date: string   // YYYY-MM-DD
  end_date: string     // YYYY-MM-DD
  reason?: string
  requires_document?: boolean
}

// Mapa de managers de demo
const MANAGERS: Record<string, { name: string; email: string }> = {
  'EMP-0042': { name: 'Ana García', email: 'ana.garcia@empresa.com' }
}

export async function createLeaveRequest(input: CreateLeaveInput, env: any) {
  // Calcular días laborables entre fechas (simplificado)
  const start = new Date(input.start_date)
  const end = new Date(input.end_date)
  const diffTime = Math.abs(end.getTime() - start.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1

  const requestId = `SOL-${Math.floor(1000 + Math.random() * 9000)}`
  const manager = MANAGERS[input.employee_id] ?? MANAGERS['EMP-0042']

  // En producción: insertar en D1
  // await env.DB.prepare(`
  //   INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, days_requested, status, approver)
  //   VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  // `).bind(requestId, input.employee_id, input.leave_type, input.start_date, input.end_date, diffDays, manager.name).run()

  const leaveTypeLabels: Record<string, string> = {
    vacation: 'Vacaciones',
    medical: 'Permiso Médico',
    personal: 'Asuntos Personales'
  }

  return {
    request_id: requestId,
    employee_id: input.employee_id,
    leave_type: input.leave_type,
    leave_type_label: leaveTypeLabels[input.leave_type] ?? input.leave_type,
    start_date: input.start_date,
    end_date: input.end_date,
    days_requested: diffDays,
    status: 'pending',
    approver: manager.name,
    approver_email: manager.email,
    requires_document: input.requires_document ?? (input.leave_type === 'medical' && diffDays >= 2),
    created_at: new Date().toISOString(),
    dates: `${formatDate(input.start_date)} — ${formatDate(input.end_date)}`,
    message: `Solicitud ${requestId} creada correctamente. Pendiente de aprobación de ${manager.name}.`
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}
```

---

## tools/get_request_status.ts

```typescript
// En demo: retornar estado simulado
// En prod: consultar D1
const DEMO_REQUESTS: Record<string, any> = {}

export async function getRequestStatus(input: { request_id: string }, env: any) {
  // Intentar recuperar de demo store
  const request = DEMO_REQUESTS[input.request_id]

  if (!request) {
    // Para la demo, si no existe en memoria retornar datos ficticios
    return {
      request_id: input.request_id,
      status: 'pending',
      status_label: 'Pendiente de aprobación',
      approver: 'Ana García',
      created_at: new Date().toISOString(),
      message: `La solicitud ${input.request_id} está pendiente de revisión por Ana García.`
    }
  }

  return request
}
```

---

## tools/list_my_requests.ts

```typescript
// Datos de demo
const DEMO_REQUEST_HISTORY = [
  {
    request_id: 'SOL-1101',
    leave_type: 'vacation',
    leave_type_label: 'Vacaciones',
    start_date: '2025-02-10',
    end_date: '2025-02-14',
    days: 5,
    status: 'approved',
    status_label: 'Aprobado',
    approver: 'Ana García'
  },
  {
    request_id: 'SOL-0892',
    leave_type: 'medical',
    leave_type_label: 'Permiso Médico',
    start_date: '2025-01-15',
    end_date: '2025-01-17',
    days: 3,
    status: 'approved',
    status_label: 'Aprobado',
    approver: 'Ana García'
  }
]

export async function listMyRequests(input: { employee_id: string; status?: string }, env: any) {
  let requests = DEMO_REQUEST_HISTORY

  if (input.status && input.status !== 'all') {
    requests = requests.filter(r => r.status === input.status)
  }

  return {
    employee_id: input.employee_id,
    requests,
    total: requests.length
  }
}
```

---

## tools/notify_approver.ts

```typescript
export async function notifyApprover(input: { request_id: string; channel?: string }, env: any) {
  const channel = input.channel ?? 'email'

  // En producción: enviar email real via SendGrid/Resend, o mensaje de Slack
  // En demo: simular el envío

  console.log(`[NOTIFY] Sending ${channel} notification for request ${input.request_id}`)

  return {
    sent: true,
    request_id: input.request_id,
    channel,
    recipient: 'ana.garcia@empresa.com',
    recipient_name: 'Ana García',
    timestamp: new Date().toISOString(),
    message: `Notificación enviada a Ana García por ${channel === 'email' ? 'correo electrónico' : 'Slack'}.`
  }
}
```

---

## tools/cancel_request.ts

```typescript
export async function cancelRequest(input: { request_id: string; reason?: string }, env: any) {
  // En prod: verificar que existe, que está en estado pending, y actualizar en D1
  return {
    request_id: input.request_id,
    status: 'cancelled',
    reason: input.reason ?? 'Cancelado por el empleado',
    cancelled_at: new Date().toISOString(),
    message: `La solicitud ${input.request_id} ha sido cancelada correctamente.`
  }
}
```

---

## wrangler.toml

```toml
name = "mcp-cases"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "hr-agent-db"
database_id = "REEMPLAZAR_CON_TU_DATABASE_ID"
```
