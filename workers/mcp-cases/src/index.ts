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

    // Health check
    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(
        JSON.stringify({ ok: true, service: 'mcp-cases', tools: Object.keys(TOOLS) }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    if (url.pathname === '/call' && request.method === 'POST') {
      const { tool, input } = await request.json() as { tool: string; input: any }

      const handler = TOOLS[tool]
      if (!handler) {
        return new Response(
          JSON.stringify({ error: `Tool '${tool}' not found`, code: 'TOOL_NOT_FOUND' }),
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
          JSON.stringify({ error: String(error), code: 'TOOL_ERROR' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        )
      }
    }

    return new Response('Not found', { status: 404 })
  }
}
