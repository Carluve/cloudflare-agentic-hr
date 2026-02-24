export async function getRequestStatus(input: { request_id: string }, _env: any) {
  // En prod: consultar D1
  // Para la demo retornamos estado simulado
  return {
    request_id: input.request_id,
    status: 'pending',
    status_label: 'Pendiente de aprobación',
    approver: 'Ana García',
    created_at: new Date().toISOString(),
    message: `La solicitud ${input.request_id} está pendiente de revisión por Ana García.`
  }
}
