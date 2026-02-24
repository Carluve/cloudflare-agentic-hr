# 07 — Infraestructura y Deploy

## Prerrequisitos

```bash
# Node.js 18+
node --version   # debe ser >= 18

# Instalar Wrangler CLI (herramienta oficial de Cloudflare)
npm install -g wrangler

# Verificar instalación
wrangler --version

# Login con tu cuenta Cloudflare
wrangler login
# → Abre el navegador para autorizar
```

---

## schema.sql — Base de datos D1

```sql
-- Ejecutar con: wrangler d1 execute hr-agent-db --file=schema.sql

-- Sesiones de empleados
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  employee_id  TEXT NOT NULL,
  employee_name TEXT,
  department   TEXT,
  created_at   INTEGER DEFAULT (unixepoch()),
  last_active  INTEGER,
  status       TEXT DEFAULT 'active'
);

-- Mensajes del historial de conversaciones
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  role        TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool')),
  content     TEXT NOT NULL,
  created_at  INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

-- Solicitudes de permiso creadas por el agente
CREATE TABLE IF NOT EXISTS leave_requests (
  id               TEXT PRIMARY KEY,   -- Ej: SOL-2847
  session_id       TEXT,
  employee_id      TEXT NOT NULL,
  leave_type       TEXT NOT NULL,      -- vacation | medical | personal
  start_date       TEXT NOT NULL,      -- YYYY-MM-DD
  end_date         TEXT NOT NULL,      -- YYYY-MM-DD
  days_requested   INTEGER,
  status           TEXT DEFAULT 'pending',  -- pending | approved | rejected | cancelled
  approver         TEXT,
  approver_email   TEXT,
  reason           TEXT,
  requires_document INTEGER DEFAULT 0, -- 0 | 1
  created_at       INTEGER DEFAULT (unixepoch()),
  resolved_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_requests_employee ON leave_requests(employee_id);

-- Eventos del agente (para observabilidad y replay de sesiones)
CREATE TABLE IF NOT EXISTS agent_events (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  payload     TEXT,   -- JSON serializado
  timestamp   INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_events_session ON agent_events(session_id);
```

---

## Setup completo paso a paso

### Paso 1: Crear el proyecto

```bash
# Clonar o crear el proyecto base
mkdir hr-agent-demo && cd hr-agent-demo

# Inicializar monorepo
npm init -y

# Crear estructura de carpetas
mkdir -p workers/agent/src
mkdir -p workers/mcp-policies/src/tools
mkdir -p workers/mcp-policies/src/data
mkdir -p workers/mcp-cases/src/tools
mkdir -p frontend/employee-portal/{css,js/panels}
mkdir -p frontend/admin-panel/{css,js/panels}
```

### Paso 2: Crear servicios de Cloudflare

```bash
# ── D1 Database ──────────────────────────────────────────────
wrangler d1 create hr-agent-db
# IMPORTANTE: copia el "database_id" que aparece en la salida
# Ejemplo: database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Aplicar el schema
wrangler d1 execute hr-agent-db --file=schema.sql

# Verificar que las tablas se crearon
wrangler d1 execute hr-agent-db --command="SELECT name FROM sqlite_master WHERE type='table'"

# ── KV Namespace ─────────────────────────────────────────────
wrangler kv:namespace create HR_SESSIONS
# IMPORTANTE: copia el "id" que aparece en la salida

# ── R2 Bucket ────────────────────────────────────────────────
wrangler r2 bucket create hr-audio-recordings

# ── AI Gateway ───────────────────────────────────────────────
# Esto se hace desde el dashboard web:
# 1. Ve a: dash.cloudflare.com
# 2. Sección: AI → AI Gateway
# 3. "Create Gateway" → Nombre: "hr-agent-demo"
# 4. Copia la URL del gateway
```

### Paso 3: Actualizar wrangler.toml con los IDs

```bash
# En workers/agent/wrangler.toml:
# - Reemplaza database_id con el ID de D1
# - Reemplaza id del KV con el ID del namespace
# - Reemplaza AI_GATEWAY_URL con la URL del AI Gateway
# - Reemplaza MCP_POLICIES_URL y MCP_CASES_URL
#   (primero deploy los MCP workers para obtener sus URLs)
```

### Paso 4: Añadir secretos

```bash
# En el directorio workers/agent/
cd workers/agent

wrangler secret put ANTHROPIC_API_KEY
# → Te pedirá escribir el valor (empieza con sk-ant-...)

wrangler secret put SESSION_SECRET
# → Escribe cualquier string aleatorio largo, ej: "hr-demo-secret-2025-xyz"
```

### Paso 5: Deploy de los Workers

```bash
# ── 1. Deploy MCP Policies (primero, para obtener su URL) ────
cd workers/mcp-policies
npm install
wrangler deploy
# Guarda la URL: https://mcp-policies.TU_USUARIO.workers.dev

# ── 2. Deploy MCP Cases ──────────────────────────────────────
cd ../mcp-cases
npm install
wrangler deploy
# Guarda la URL: https://mcp-cases.TU_USUARIO.workers.dev

# ── 3. Actualizar wrangler.toml del agent con las URLs ────────
# Edita workers/agent/wrangler.toml:
# MCP_POLICIES_URL = "https://mcp-policies.TU_USUARIO.workers.dev"
# MCP_CASES_URL = "https://mcp-cases.TU_USUARIO.workers.dev"

# ── 4. Deploy del Agent Worker ───────────────────────────────
cd ../agent
npm install
wrangler deploy
# URL: https://hr-agent-worker.TU_USUARIO.workers.dev

# ── 5. Deploy del Frontend (Cloudflare Pages) ────────────────
cd ../../frontend

# Actualizar CONFIG.AGENT_URL en los archivos JS del frontend
# con la URL del agent worker del paso 4

wrangler pages deploy employee-portal --project-name=hr-employee-portal
# URL: https://hr-employee-portal.pages.dev

wrangler pages deploy admin-panel --project-name=hr-admin-panel
# URL: https://hr-admin-panel.pages.dev
```

---

## Desarrollo local

```bash
# Correr el agent worker en local (puerto 8787)
cd workers/agent
wrangler dev

# En otra terminal: MCP Policies (puerto 8788)
cd workers/mcp-policies
wrangler dev --port 8788

# En otra terminal: MCP Cases (puerto 8789)
cd workers/mcp-cases
wrangler dev --port 8789

# Para el frontend: cualquier servidor estático
# Opción simple:
cd frontend/employee-portal
npx serve .
# → http://localhost:3000

# Recuerda actualizar CONFIG.AGENT_URL = 'http://localhost:8787'
# en los archivos main.js del frontend para desarrollo local
```

---

## Verificación del deploy

```bash
# Verificar que el agent responde
curl https://hr-agent-worker.TU_USUARIO.workers.dev/health

# Verificar MCP Policies
curl https://mcp-policies.TU_USUARIO.workers.dev/health

# Verificar MCP Cases
curl https://mcp-cases.TU_USUARIO.workers.dev/health

# Ver logs en tiempo real del agent worker
wrangler tail hr-agent-worker

# Crear una sesión de prueba
curl -X POST https://hr-agent-worker.TU_USUARIO.workers.dev/session/new \
  -H "Content-Type: application/json" \
  -d '{"employee_id": "EMP-0042"}'
# Debe retornar: {"session_id": "...", "employee": {...}}
```

---

## Comandos útiles de debugging

```bash
# Ver logs del Worker en tiempo real
wrangler tail hr-agent-worker --format=pretty

# Ver contenido de la base de datos
wrangler d1 execute hr-agent-db --command="SELECT * FROM sessions ORDER BY created_at DESC LIMIT 10"
wrangler d1 execute hr-agent-db --command="SELECT * FROM leave_requests ORDER BY created_at DESC LIMIT 10"

# Ver keys del KV
wrangler kv:key list --namespace-id=TU_KV_ID

# Listar Durable Objects activos
# (desde el dashboard: Workers & Pages → tu worker → Durable Objects)

# Ver costos y uso en AI Gateway
# Dashboard: AI → AI Gateway → hr-agent-demo → Logs
```

---

## Estructura de costos estimada (demo)

| Servicio | Costo en demo (~100 sesiones) |
|---|---|
| Cloudflare Workers (Requests) | Gratis (límite: 100K req/día) |
| Cloudflare D1 | Gratis (límite: 5M rows/mes) |
| Cloudflare KV | Gratis (límite: 100K reads/día) |
| Cloudflare Pages | Gratis |
| Workers AI (Whisper) | ~$0.001 por transcripción |
| Anthropic Claude 3.7 (con thinking) | ~$0.10–0.30 por sesión |
| **Total estimado por sesión** | **~$0.15–0.35 USD** |

---

## Checklist de producción

```
☐ wrangler deploy exitoso en los 3 workers
☐ Secretos añadidos (ANTHROPIC_API_KEY, SESSION_SECRET)
☐ wrangler.toml tiene los IDs correctos de D1 y KV
☐ AI Gateway URL actualizada en wrangler.toml
☐ URLs de MCP workers actualizadas en wrangler.toml del agent
☐ CONFIG.AGENT_URL actualizado en JS del frontend
☐ Frontend deployado en Cloudflare Pages
☐ Health checks de los 3 workers responden OK
☐ Test end-to-end: crear sesión → enviar mensaje → recibir respuesta SSE
☐ Test de voz: grabar audio → transcripción → respuesta del agente
☐ Panel admin: conectar con session ID → ver thinking stream
☐ Datos de demo (EMP-0042) funcionan correctamente
☐ AI Gateway logs visibles en el dashboard de Cloudflare
```
