-- Ejecutar con: wrangler d1 execute hr-agent-db --file=schema.sql

-- Sesiones de empleados
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  employee_id   TEXT NOT NULL,
  employee_name TEXT,
  department    TEXT,
  created_at    INTEGER DEFAULT (unixepoch()),
  last_active   INTEGER,
  status        TEXT DEFAULT 'active'
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
  id                TEXT PRIMARY KEY,   -- Ej: SOL-2847
  session_id        TEXT,
  employee_id       TEXT NOT NULL,
  leave_type        TEXT NOT NULL,      -- vacation | medical | personal
  start_date        TEXT NOT NULL,      -- YYYY-MM-DD
  end_date          TEXT NOT NULL,      -- YYYY-MM-DD
  days_requested    INTEGER,
  status            TEXT DEFAULT 'pending',  -- pending | approved | rejected | cancelled
  approver          TEXT,
  approver_email    TEXT,
  reason            TEXT,
  requires_document INTEGER DEFAULT 0,  -- 0 | 1
  created_at        INTEGER DEFAULT (unixepoch()),
  resolved_at       INTEGER
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
