import { searchPolicy } from './tools/search_policy'
import { getPolicyDetail } from './tools/get_policy_detail'
import { getLeaveTypes } from './tools/get_leave_types'
import { getBenefitInfo } from './tools/get_benefit_info'
import { getFaq } from './tools/get_faq'

const TOOLS: Record<string, (input: any) => Promise<any>> = {
  search_policy: searchPolicy,
  get_policy_detail: getPolicyDetail,
  get_leave_types: getLeaveTypes,
  get_benefit_info: getBenefitInfo,
  get_faq: getFaq,
}

export default {
  async fetch(request: Request): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    const url = new URL(request.url)

    // Health check
    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(
        JSON.stringify({ ok: true, service: 'mcp-policies', tools: Object.keys(TOOLS) }),
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
        const result = await handler(input)
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
