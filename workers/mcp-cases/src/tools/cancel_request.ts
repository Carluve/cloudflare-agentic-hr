export async function cancelRequest(
  input: { request_id: string; reason?: string },
  _env: any
) {
  // En prod: verificar que existe, que está en pending, y actualizar en D1
  return {
    request_id: input.request_id,
    status: 'cancelled',
    reason: input.reason ?? 'Cancelado por el empleado',
    cancelled_at: new Date().toISOString(),
    message: `La solicitud ${input.request_id} ha sido cancelada correctamente.`
  }
}
