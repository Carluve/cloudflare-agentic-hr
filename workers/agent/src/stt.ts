import type { Env } from './types'

export async function transcribeAudio(
  audioBlob: ArrayBuffer,
  env: Env
): Promise<{ text: string; confidence: number }> {

  const gatewayOptions: Record<string, any> = {
    id: env.CLOUDFLARE_GATEWAY_ID,
    skipCache: false,
    cacheTtl: 3600,
  }
  if (env.CF_GATEWAY_TOKEN) {
    gatewayOptions.authorization = `Bearer ${env.CF_GATEWAY_TOKEN}`
  }

  const result = await env.AI.run(
    '@cf/openai/whisper',
    { audio: [...new Uint8Array(audioBlob)] },
    { gateway: gatewayOptions }
  )

  return {
    text: result.text ?? '',
    confidence: 0.95  // Whisper no retorna confidence score, usar valor alto por defecto
  }
}
