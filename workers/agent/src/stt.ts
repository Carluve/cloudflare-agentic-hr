import type { Env } from './types'

export async function transcribeAudio(
  audioBlob: ArrayBuffer,
  env: Env
): Promise<{ text: string; confidence: number }> {

  const result = await env.AI.run(
    '@cf/openai/whisper',
    { audio: [...new Uint8Array(audioBlob)] },
    { gateway: { id: env.CLOUDFLARE_GATEWAY_ID, skipCache: false, cacheTtl: 3600 } }
  )

  return {
    text: result.text ?? '',
    confidence: 0.95  // Whisper no retorna confidence score, usar valor alto por defecto
  }
}
