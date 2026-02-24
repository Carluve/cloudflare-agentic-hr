export interface Env {
  AGENT_SESSION: DurableObjectNamespace
  AI: Ai
  DB: D1Database
  HR_SESSIONS: KVNamespace
  AUDIO_BUCKET: R2Bucket
  MCP_POLICIES_URL: string
  MCP_CASES_URL: string
  AI_GATEWAY_URL: string
  CLOUDFLARE_GATEWAY_ID: string
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
