# HR Intranet AI Agent — Master Spec

## Qué es este proyecto

Demo de un agente inteligente de Recursos Humanos construido 100% sobre **Cloudflare Workers + Agents SDK**. Los empleados pueden hablar o escribir para consultar políticas internas y gestionar solicitudes de permisos. El sistema tiene dos portales: uno para el empleado y uno de observabilidad técnica en tiempo real.

## Para Claude Code: cómo usar estas specs

Lee los archivos en este orden antes de escribir cualquier código:

1. `CLAUDE.md` ← estás aquí, léelo completo
2. `01-architecture.md` — stack, diagrama, decisiones técnicas
3. `02-agent-core.md` — Durable Object, ciclo ReAct, streaming SSE
4. `03-mcp-policies.md` — MCP Server de políticas de HR
5. `04-mcp-cases.md` — MCP Server de gestión de solicitudes
6. `05-frontend-employee.md` — Portal del empleado
7. `06-frontend-admin.md` — Panel de observabilidad
8. `07-infrastructure.md` — wrangler.toml, D1, KV, deploy

---

## Stack tecnológico

| Servicio | Uso |
|---|---|
| Cloudflare Workers | Runtime de todos los backends |
| Cloudflare Agents SDK (`agents` npm) | Durable Object con estado por sesión |
| Cloudflare AI Gateway | Proxy LLM con logging automático |
| Workers AI — Whisper | Speech-to-Text en el edge |
| Cloudflare D1 (SQLite) | Base de datos: conversaciones + solicitudes |
| Cloudflare KV | Caché de sesiones activas |
| Cloudflare Pages | Hosting del frontend estático |
| Anthropic Claude 3.7 Sonnet | LLM con extended thinking |
| MCP Protocol | Protocolo de herramientas del agente |

---

## Estructura del monorepo

```
hr-agent-demo/
├── CLAUDE.md                   ← este archivo
├── specs/                      ← todos los .md de specs
├── workers/
│   ├── agent/                  ← Worker principal + Durable Object
│   ├── mcp-policies/           ← MCP Server de políticas HR
│   └── mcp-cases/              ← MCP Server de solicitudes
├── frontend/
│   ├── employee-portal/        ← Portal del empleado (HTML/JS/CSS)
│   └── admin-panel/            ← Panel de observabilidad
├── schema.sql                  ← Schema D1
└── package.json
```

---

## Convenciones de código

- **TypeScript** en todos los Workers
- **No frameworks** en el frontend (vanilla JS + CSS) para máxima simplicidad
- Todos los Workers exportan `default` handler + Durable Object class cuando aplica
- Los eventos SSE siempre tienen la forma `{ event: string, ...payload, timestamp: number }`
- Los IDs de solicitudes tienen formato `SOL-XXXX` (ej: `SOL-2847`)
- Los IDs de empleados tienen formato `EMP-XXXX` (ej: `EMP-0042`)
- Errores siempre retornan `{ error: string, code: string }` con HTTP status apropiado

---

## Variables de entorno requeridas

```toml
# Secretos (wrangler secret put)
ANTHROPIC_API_KEY     # Clave de Anthropic
SESSION_SECRET        # String aleatorio para firmar JWT

# Variables públicas (wrangler.toml [vars])
MCP_POLICIES_URL      # https://mcp-policies.usuario.workers.dev
MCP_CASES_URL         # https://mcp-cases.usuario.workers.dev
AI_GATEWAY_URL        # https://gateway.ai.cloudflare.com/v1/ACCOUNT/hr-demo
```

---

## Modelo LLM

```typescript
model: "claude-3-7-sonnet-latest"
thinking: { type: "enabled", budget_tokens: 8000 }
max_tokens: 16000
```

El extended thinking es **obligatorio** — es el feature más importante de la demo.

---

## Datos de demo precargados

Para la demo usar siempre este empleado ficticio:

```json
{
  "employee_id": "EMP-0042",
  "name": "Carlos López",
  "department": "Ingeniería",
  "manager": "Ana García",
  "manager_email": "ana.garcia@empresa.com",
  "hire_date": "2022-03-15",
  "leave_balance": {
    "vacation": { "available": 18, "used": 2, "total": 20 },
    "medical": { "available": 12, "used": 3, "total": 15 },
    "personal": { "available": 3, "used": 0, "total": 3 }
  }
}
```
