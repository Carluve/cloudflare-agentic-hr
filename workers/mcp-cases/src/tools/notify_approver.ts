export async function notifyApprover(
  input: { request_id: string; channel?: string },
  _env: any
) {
  const channel = input.channel ?? 'email'

  // En producción: enviar email real via SendGrid/Resend, o mensaje de Slack
  // En demo: simular el envío
  console.log(`[NOTIFY] Sending ${channel} notification for request ${input.request_id}`)

  return {
    sent: true,
    request_id: input.request_id,
    channel,
    recipient: 'ana.garcia@empresa.com',
    recipient_name: 'Ana García',
    timestamp: new Date().toISOString(),
    message: `Notificación enviada a Ana García por ${channel === 'email' ? 'correo electrónico' : 'Slack'}.`
  }
}
