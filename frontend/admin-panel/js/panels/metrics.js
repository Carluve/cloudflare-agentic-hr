export function initMetrics() {
  // nada que inicializar
}

export function handleMetricsUpdate(data) {
  const tokensEl  = document.getElementById('metric-tokens')
  const latencyEl = document.getElementById('metric-latency')
  const toolsEl   = document.getElementById('metric-tools')
  const costEl    = document.getElementById('metric-cost')

  if (tokensEl  && data.tokens   != null) tokensEl.textContent  = data.tokens.toLocaleString()
  if (latencyEl && data.latency_ms != null) latencyEl.textContent = `${data.latency_ms}ms`
  if (toolsEl   && data.toolCalls != null) toolsEl.textContent  = data.toolCalls
  if (costEl    && data.cost_usd  != null) costEl.textContent   = `$${data.cost_usd}`
}
