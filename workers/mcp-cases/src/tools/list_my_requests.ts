const DEMO_REQUEST_HISTORY = [
  {
    request_id: 'SOL-1101',
    leave_type: 'vacation',
    leave_type_label: 'Vacaciones',
    start_date: '2025-02-10',
    end_date: '2025-02-14',
    days: 5,
    status: 'approved',
    status_label: 'Aprobado',
    approver: 'Ana García'
  },
  {
    request_id: 'SOL-0892',
    leave_type: 'medical',
    leave_type_label: 'Permiso Médico',
    start_date: '2025-01-15',
    end_date: '2025-01-17',
    days: 3,
    status: 'approved',
    status_label: 'Aprobado',
    approver: 'Ana García'
  }
]

export async function listMyRequests(
  input: { employee_id: string; status?: string },
  _env: any
) {
  let requests = DEMO_REQUEST_HISTORY

  if (input.status && input.status !== 'all') {
    requests = requests.filter(r => r.status === input.status)
  }

  return {
    employee_id: input.employee_id,
    requests,
    total: requests.length
  }
}
