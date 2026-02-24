interface CreateLeaveInput {
  employee_id: string
  leave_type: 'vacation' | 'medical' | 'personal'
  start_date: string   // YYYY-MM-DD
  end_date: string     // YYYY-MM-DD
  reason?: string
  requires_document?: boolean
}

const MANAGERS: Record<string, { name: string; email: string }> = {
  'EMP-0042': { name: 'Ana García', email: 'ana.garcia@empresa.com' }
}

const leaveTypeLabels: Record<string, string> = {
  vacation: 'Vacaciones',
  medical:  'Permiso Médico',
  personal: 'Asuntos Personales'
}

export async function createLeaveRequest(input: CreateLeaveInput, _env: any) {
  const start = new Date(input.start_date)
  const end = new Date(input.end_date)
  const diffTime = Math.abs(end.getTime() - start.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1

  const requestId = `SOL-${Math.floor(1000 + Math.random() * 9000)}`
  const manager = MANAGERS[input.employee_id] ?? MANAGERS['EMP-0042']

  // En producción: insertar en D1
  // await env.DB.prepare(`
  //   INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, days_requested, status, approver)
  //   VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  // `).bind(requestId, input.employee_id, input.leave_type, input.start_date, input.end_date, diffDays, manager.name).run()

  const requiresDoc = input.requires_document ?? (input.leave_type === 'medical' && diffDays >= 2)

  return {
    request_id: requestId,
    employee_id: input.employee_id,
    leave_type: input.leave_type,
    leave_type_label: leaveTypeLabels[input.leave_type] ?? input.leave_type,
    start_date: input.start_date,
    end_date: input.end_date,
    days_requested: diffDays,
    status: 'pending',
    approver: manager.name,
    approver_email: manager.email,
    requires_document: requiresDoc,
    created_at: new Date().toISOString(),
    dates: `${formatDate(input.start_date)} — ${formatDate(input.end_date)}`,
    message: `Solicitud ${requestId} creada correctamente. Pendiente de aprobación de ${manager.name}.`
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}
