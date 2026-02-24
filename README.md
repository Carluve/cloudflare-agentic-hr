# HR Intranet AI Agent

Demo de un agente inteligente de Recursos Humanos construido 100% sobre **Cloudflare Workers + Agents SDK**. Los empleados pueden chatear o hablar por voz para consultar políticas internas y gestionar solicitudes de permiso. Todo el tráfico de IA pasa por **Cloudflare AI Gateway** para logging, caché y control de costes.

---

## Índice

1. [Qué hace](#qué-hace)
2. [Arquitectura](#arquitectura)
3. [Stack tecnológico](#stack-tecnológico)
4. [Estructura del repositorio](#estructura-del-repositorio)
5. [Requisitos previos](#requisitos-previos)
6. [Configuración del entorno](#configuración-del-entorno)
7. [Desarrollo local](#desarrollo-local)
8. [Despliegue en producción](#despliegue-en-producción)
9. [Componentes principales](#componentes-principales)
10. [API del agente](#api-del-agente)
11. [Eventos SSE](#eventos-sse)
12. [Datos de demo](#datos-de-demo)
13. [Coste estimado](#coste-estimado)

---

## Qué hace

El sistema expone **dos portales**:

| Portal | URL | Descripción |
|--------|-----|-------------|
| **Empleado** | `frontend/employee-portal/` | Chat texto + voz con el agente de RRHH |
| **Observabilidad** | `frontend/admin-panel/` | Panel técnico en tiempo real: thinking stream, MCP inspector, métricas |

El empleado puede:
- Preguntar sobre políticas internas (vacaciones, permisos médicos, teletrabajo, etc.)
- Consultar sus días disponibles de cada tipo de permiso
- Crear solicitudes formales de permiso (se genera un `SOL-XXXX`)
- Ver el estado de sus solicitudes anteriores

El agente internamente:
1. Usa **Extended Thinking** de Claude 3.7 Sonnet para razonar antes de responder
2. Llama a herramientas MCP para buscar políticas o gestionar solicitudes
3. Emite eventos SSE en tiempo real al frontend (deltas de texto, pasos del agente, resultados de herramientas)

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE EDGE                         │
│                                                             │
│  ┌──────────────┐    ┌──────────────────────────────────┐   │
│  │   Employee   │    │        Agent Worker              │   │
│  │   Portal     │───▶│   (Cloudflare Agents SDK)        │   │
│  │  (CF Pages)  │◀───│   HRAgentSession                 │   │
│  └──────────────┘SSE │   Durable Object por sesión      │   │
│                      └────────────┬─────────────────────┘   │
│  ┌──────────────┐                 │                          │
│  │ Admin Panel  │                 │ fetch /call              │
│  │  (CF Pages)  │◀───SSE          │                          │
│  └──────────────┘                 ▼                          │
│                      ┌────────────┴─────────────────────┐   │
│                      │       Cloudflare AI Gateway       │   │
│                      └───────────┬──────────────┬────────┘   │
│                                  │              │             │
│                            Anthropic       Workers AI        │
│                          Claude 3.7        (Whisper)         │
│                           Sonnet                             │
│                                                             │
│  ┌────────────────────┐  ┌───────────────────────────────┐  │
│  │  MCP Policies      │  │  MCP Cases                    │  │
│  │  (CF Worker)       │  │  (CF Worker)                  │  │
│  │  - search_policy   │  │  - get_leave_balance          │  │
│  │  - get_policy_     │  │  - create_leave_request       │  │
│  │    detail          │  │  - list_my_requests           │  │
│  │  - get_leave_types │  │  - notify_approver            │  │
│  │  - get_benefit_    │  │  - get_request_status         │  │
│  │    info            │  │  - cancel_request             │  │
│  │  - get_faq         │  │                               │  │
│  └────────────────────┘  └───────────────────┬───────────┘  │
│                                               │              │
│                                   ┌───────────▼──────────┐  │
│                                   │   Cloudflare D1      │  │
│                                   │   (SQLite)           │  │
│                                   │   sessions           │  │
│                                   │   messages           │  │
│                                   │   leave_requests     │  │
│                                   │   agent_events       │  │
│                                   └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Flujo de una conversación:**

1. El empleado escribe o graba audio en el portal
2. Si es audio → el Agent Worker transcribe con Whisper (vía AI Gateway)
3. El mensaje se añade al historial del Durable Object
4. Se abre un stream con Claude 3.7 Sonnet (vía AI Gateway) con Extended Thinking activado
5. El LLM emite deltas de thinking y texto → el Durable Object los broadcastea por SSE
6. Si Claude decide usar una herramienta, el agente llama al MCP correspondiente
7. El resultado del tool vuelve al LLM y continúa el ciclo (ReAct loop)
8. Al finalizar, la sesión se persiste en D1

---

## Stack tecnológico

| Servicio | Rol |
|----------|-----|
| **Cloudflare Workers** | Runtime de todos los backends |
| **Cloudflare Agents SDK** (`agents` npm) | Durable Object con estado por sesión |
| **Cloudflare AI Gateway** | Proxy unificado LLM: logging, caché, rate-limit |
| **Workers AI — Whisper** | Speech-to-Text en el edge |
| **Cloudflare D1** | SQLite: conversaciones + solicitudes |
| **Cloudflare KV** | Caché de sesiones activas |
| **Cloudflare R2** | Almacenamiento de grabaciones de audio |
| **Cloudflare Pages** | Hosting del frontend estático |
| **Anthropic Claude 3.7 Sonnet** | LLM con Extended Thinking (8 000 tokens) |
| **MCP Protocol** | Protocolo de herramientas del agente (HTTP custom) |
| **Vanilla JS + HTML/CSS** | Frontend sin frameworks |

---

## Estructura del repositorio

```
cloudflare-agentic-hr/
├── CLAUDE.md                    # Instrucciones para Claude Code
├── README.md                    # Este archivo
├── schema.sql                   # Schema D1 (4 tablas)
├── package.json                 # Scripts raíz del monorepo
│
├── specs/                       # Especificaciones detalladas
│   ├── 01-architecture.md
│   ├── 02-agent-core.md
│   ├── 03-mcp-policies.md
│   ├── 04-mcp-cases.md
│   ├── 05-frontend-employee.md
│   ├── 06-frontend-admin.md
│   └── 07-infrastructure.md
│
├── workers/
│   ├── agent/                   # Worker principal + Durable Object
│   │   ├── src/
│   │   │   ├── index.ts         # Router HTTP: /session, /chat, /audio, /sse
│   │   │   ├── agent.ts         # HRAgentSession — ciclo ReAct, streaming SSE
│   │   │   ├── prompts.ts       # System prompt en español con contexto del empleado
│   │   │   ├── stt.ts           # Transcripción de audio con Whisper (vía AI Gateway)
│   │   │   └── types.ts         # Interfaces TypeScript (Env, Message, EmployeeContext…)
│   │   ├── package.json
│   │   └── wrangler.toml        # Bindings: DO, AI, D1, KV, R2, AI Gateway
│   │
│   ├── mcp-policies/            # MCP Server de políticas HR (solo lectura)
│   │   ├── src/
│   │   │   ├── index.ts         # Router POST /call + GET /health
│   │   │   ├── data/
│   │   │   │   └── policies.ts  # 5 políticas + 4 FAQs precargadas
│   │   │   └── tools/
│   │   │       ├── search_policy.ts
│   │   │       ├── get_policy_detail.ts
│   │   │       ├── get_leave_types.ts
│   │   │       ├── get_benefit_info.ts
│   │   │       └── get_faq.ts
│   │   ├── package.json
│   │   └── wrangler.toml
│   │
│   └── mcp-cases/               # MCP Server de solicitudes (escritura en D1)
│       ├── src/
│       │   ├── index.ts         # Router POST /call con binding D1
│       │   └── tools/
│       │       ├── get_leave_balance.ts
│       │       ├── create_leave_request.ts
│       │       ├── get_request_status.ts
│       │       ├── list_my_requests.ts
│       │       ├── notify_approver.ts
│       │       └── cancel_request.ts
│       ├── package.json
│       └── wrangler.toml
│
└── frontend/
    ├── employee-portal/         # Portal del empleado
    │   ├── index.html
    │   ├── css/styles.css
    │   └── js/
    │       ├── main.js          # Estado de la app, inicialización de sesión
    │       ├── chat.js          # Renderizado de mensajes, modales de solicitud
    │       ├── sse.js           # Listener SSE → dispatcher de eventos
    │       └── voice.js         # MediaRecorder + visualizador Web Audio
    │
    └── admin-panel/             # Panel de observabilidad técnica
        ├── index.html
        ├── css/observatory.css
        └── js/
            ├── main.js          # Conexión SSE, dispatch a paneles
            └── panels/
                ├── transcription.js  # Display de transcripción en vivo
                ├── thinking.js       # Stream del Extended Thinking
                ├── mcp-inspector.js  # Inspector de tool calls / results
                ├── metrics.js        # Tokens, latencia, coste por sesión
                └── timeline.js       # Timeline de eventos SSE
```

---

## Requisitos previos

- [Node.js](https://nodejs.org/) ≥ 18
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) ≥ 3.x
  ```bash
  npm install -g wrangler
  wrangler login
  ```
- Cuenta en [Cloudflare](https://cloudflare.com) con acceso a Workers, D1, KV, R2 y AI Gateway
- API Key de [Anthropic](https://console.anthropic.com/) (empieza por `sk-ant-…`)

---

## Configuración del entorno

### 1. Cloudflare AI Gateway

Desde el [Dashboard de Cloudflare](https://dash.cloudflare.com):

```
AI → AI Gateway → Create Gateway
Nombre: hr-demo
```

Copia la URL resultante: `https://gateway.ai.cloudflare.com/v1/<ACCOUNT_ID>/hr-demo`

### 2. Base de datos D1

```bash
# Crear la base de datos
wrangler d1 create hr-agent-db

# Copiar el database_id que devuelve el comando y pegarlo en
# workers/agent/wrangler.toml → [[d1_databases]] database_id

# Aplicar el schema
wrangler d1 execute hr-agent-db --file=schema.sql
```

### 3. KV Namespace

```bash
wrangler kv:namespace create HR_SESSIONS
# Pegar el id en workers/agent/wrangler.toml → [[kv_namespaces]] id
```

### 4. R2 Bucket (opcional, para guardar audios)

```bash
wrangler r2 bucket create hr-audio-recordings
```

### 5. Variables en `wrangler.toml`

Edita `workers/agent/wrangler.toml` y reemplaza los placeholders:

```toml
[vars]
MCP_POLICIES_URL    = "https://mcp-policies.<TU_USUARIO>.workers.dev"
MCP_CASES_URL       = "https://mcp-cases.<TU_USUARIO>.workers.dev"
AI_GATEWAY_URL      = "https://gateway.ai.cloudflare.com/v1/<ACCOUNT_ID>/hr-demo"
CLOUDFLARE_GATEWAY_ID = "hr-demo"
```

### 6. Secretos

```bash
cd workers/agent
wrangler secret put ANTHROPIC_API_KEY   # sk-ant-…
wrangler secret put SESSION_SECRET      # string aleatorio seguro
```

---

## Desarrollo local

```bash
# Instalar dependencias de todos los paquetes
npm install

# Arrancar todos los servicios en paralelo
npm run dev
```

O individualmente:

```bash
# Worker principal (agente)     → http://localhost:8787
npm run dev:agent

# MCP Policies                  → http://localhost:8788
npm run dev:policies

# MCP Cases                     → http://localhost:8789
npm run dev:cases

# Portal del empleado           → http://localhost:3000
npm run dev:employee

# Panel de observabilidad       → http://localhost:3001
npm run dev:admin
```

> En desarrollo local, actualiza las URLs de los MCP en `wrangler.toml` a `http://localhost:8788` y `http://localhost:8789`.

---

## Despliegue en producción

```bash
# 1. Desplegar MCP servers primero (necesitamos sus URLs)
npm run deploy:policies
npm run deploy:cases

# 2. Actualizar wrangler.toml del agente con las URLs de producción
#    MCP_POLICIES_URL / MCP_CASES_URL

# 3. Desplegar el agente principal
npm run deploy:agent

# 4. Desplegar los frontends en Cloudflare Pages
npm run deploy:frontend
```

Para verificar que todo funciona:

```bash
# Health check de los MCP servers
curl https://mcp-policies.<TU_USUARIO>.workers.dev/health
curl https://mcp-cases.<TU_USUARIO>.workers.dev/health

# Crear sesión de prueba
curl -X POST https://hr-agent-worker.<TU_USUARIO>.workers.dev/session/new \
  -H "Content-Type: application/json" \
  -d '{"employee_id": "EMP-0042"}'
```

---

## Componentes principales

### `HRAgentSession` — Durable Object (`workers/agent/src/agent.ts`)

El núcleo del sistema. Una instancia por sesión de empleado. Mantiene en memoria:

- `messages[]` — historial de la conversación (formato Anthropic)
- `employee` — contexto del empleado (id, nombre, manager, balances)
- `sseConnections` — mapa de conexiones SSE activas (portal + admin panel)

**Ciclo ReAct** (`runAgentLoop`):

```
1. Crear Anthropic client con baseURL → AI Gateway
2. Llamar a claude.messages.stream() con Extended Thinking
3. Por cada evento del stream:
   - thinking_delta  → broadcast 'thinking_delta'
   - text_delta      → broadcast 'response_delta'
   - tool_use start  → acumular tool call
4. Al finalizar:
   - Si hay tool calls → callMCP() → añadir resultados → repetir loop
   - Si no → broadcast 'response_complete' + persistir en D1
```

### MCP Policies (`workers/mcp-policies/`)

Worker sin estado. Acepta `POST /call` con `{ tool, input }` y devuelve JSON.

| Tool | Descripción |
|------|-------------|
| `search_policy` | Búsqueda por texto en las políticas (con filtro de categoría) |
| `get_policy_detail` | Texto completo de una política por su `POL-XXX` |
| `get_leave_types` | Lista todos los tipos de permiso disponibles |
| `get_benefit_info` | Información de un beneficio específico |
| `get_faq` | Preguntas frecuentes de RRHH |

### MCP Cases (`workers/mcp-cases/`)

Worker con binding D1. Acepta `POST /call` con `{ tool, input }`.

| Tool | Descripción |
|------|-------------|
| `get_leave_balance` | Días disponibles por tipo de permiso |
| `create_leave_request` | Crea una solicitud (`SOL-XXXX`) en D1 |
| `get_request_status` | Estado de una solicitud existente |
| `list_my_requests` | Historial de solicitudes del empleado |
| `notify_approver` | Envía notificación al manager (email/slack) |
| `cancel_request` | Cancela una solicitud pendiente |

### AI Gateway — todos los modelos pasan por aquí

| Modelo | Configuración |
|--------|--------------|
| Claude 3.7 Sonnet | `baseURL: ${AI_GATEWAY_URL}/anthropic` en el Anthropic SDK |
| Whisper (Workers AI) | `env.AI.run('@cf/openai/whisper', input, { gateway: { id } })` |

Esto centraliza en un único dashboard todo el tráfico LLM: latencias, tokens consumidos, coste y caché.

---

## API del agente

Base URL: `https://hr-agent-worker.<TU_USUARIO>.workers.dev`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/session/new` | Crea sesión, devuelve `{ sessionId }` |
| `POST` | `/session/:id/chat` | Envía mensaje de texto (respuesta por SSE) |
| `POST` | `/session/:id/audio` | Envía audio base64 (transcribe + responde por SSE) |
| `GET`  | `/session/:id/sse` | Abre stream SSE |
| `POST` | `/session/:id/init` | Inicializa contexto del empleado |

**Cabecera requerida:** `X-Session-Id: <sessionId>`

---

## Eventos SSE

Todos los eventos tienen la forma:

```json
{ "event": "<nombre>", "timestamp": 1234567890, ...payload }
```

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `session_ready` | `{ employee, sessionId }` | Conexión SSE establecida |
| `thinking_delta` | `{ content }` | Fragmento del Extended Thinking |
| `response_delta` | `{ content }` | Fragmento de texto de la respuesta |
| `response_complete` | `{ fullText }` | Respuesta completa |
| `agent_step` | `{ step, description, icon }` | Paso visible del agente |
| `tool_call` | `{ tool, server, params, callId }` | Antes de ejecutar un tool |
| `tool_result` | `{ callId, result, duration_ms }` | Resultado del tool |
| `metrics_update` | `{ tokens, latency_ms, toolCalls, cost_usd }` | Métricas de la llamada LLM |
| `request_created` | `{ requestId, type, status, approver, dates }` | Solicitud de permiso creada |
| `transcription_chunk` | `{ text, confidence, isFinal }` | Transcripción de audio |
| `session_end` | `{ summary }` | Fin del ciclo del agente |

---

## Schema de base de datos

```sql
-- Sessions activas
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  last_active INTEGER NOT NULL
);

-- Historial de mensajes
CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  role        TEXT NOT NULL,      -- 'user' | 'assistant'
  content     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- Solicitudes de permiso
CREATE TABLE leave_requests (
  id              TEXT PRIMARY KEY,  -- SOL-XXXX
  employee_id     TEXT NOT NULL,
  leave_type      TEXT NOT NULL,
  start_date      TEXT NOT NULL,
  end_date        TEXT NOT NULL,
  reason          TEXT,
  status          TEXT DEFAULT 'pending',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- Eventos del agente (para observabilidad)
CREATE TABLE agent_events (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

---

## Datos de demo

El sistema viene preconfigurado con este empleado ficticio:

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
    "medical":  { "available": 12, "used": 3, "total": 15 },
    "personal": { "available": 3,  "used": 0, "total": 3  }
  }
}
```

Preguntas de demo para probar el agente:

- *"¿Cuántos días de vacaciones me quedan?"*
- *"Necesito pedir 3 días de vacaciones del 10 al 12 de marzo"*
- *"¿Cuál es la política de teletrabajo?"*
- *"¿Qué documentación necesito para un permiso médico?"*
- *"Muéstrame mis solicitudes pendientes"*

---

## Coste estimado

Por sesión media (5-8 turnos de conversación):

| Componente | Coste aprox. |
|-----------|-------------|
| Claude 3.7 Sonnet (input) | ~$0.06 |
| Claude 3.7 Sonnet (output + thinking) | ~$0.18 |
| Workers AI Whisper | ~$0.01 por minuto de audio |
| D1 / KV / R2 | < $0.001 |
| **Total por sesión** | **~$0.15 – $0.35** |

Cloudflare AI Gateway añade caché de respuestas, lo que puede reducir el coste en consultas repetidas de políticas.

---

## Convenciones del código

- **TypeScript** en todos los Workers
- **Vanilla JS** en el frontend (sin React, Vue ni Svelte)
- IDs de solicitudes: `SOL-XXXX` (ej: `SOL-2847`)
- IDs de empleados: `EMP-XXXX` (ej: `EMP-0042`)
- IDs de políticas: `POL-XXX` (ej: `POL-001`)
- Errores: `{ error: string, code: string }` con HTTP status apropiado
- Eventos SSE: `{ event: string, timestamp: number, ...payload }`
