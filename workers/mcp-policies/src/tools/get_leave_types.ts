export async function getLeaveTypes(_input: any) {
  return {
    leave_types: [
      { id: 'vacation',  name: 'Vacaciones',         days_per_year: 20,  requires_document: false },
      { id: 'medical',   name: 'Permiso Médico',      days_per_year: 15,  requires_document: true,  note: 'Justificante en 72h para 2+ días' },
      { id: 'personal',  name: 'Asuntos Personales',  days_per_year: 3,   requires_document: false },
      { id: 'maternity', name: 'Maternidad',           days_per_year: 112, requires_document: true },
      { id: 'paternity', name: 'Paternidad',           days_per_year: 112, requires_document: true },
    ]
  }
}
