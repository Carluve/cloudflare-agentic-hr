const DEMO_BALANCES: Record<string, Record<string, { available: number; used: number; total: number }>> = {
  'EMP-0042': {
    vacation: { available: 18, used: 2,  total: 20 },
    medical:  { available: 12, used: 3,  total: 15 },
    personal: { available: 3,  used: 0,  total: 3  },
  }
}

export async function getLeaveBalance(
  input: { employee_id: string; leave_type: string },
  _env: any
) {
  const balances = DEMO_BALANCES[input.employee_id] ?? DEMO_BALANCES['EMP-0042']
  const balance = balances[input.leave_type]

  if (!balance) {
    return { error: `Tipo de permiso '${input.leave_type}' no reconocido` }
  }

  return {
    employee_id: input.employee_id,
    leave_type: input.leave_type,
    available: balance.available,
    used: balance.used,
    total: balance.total,
    year: new Date().getFullYear(),
    message: balance.available > 0
      ? `Tienes ${balance.available} días disponibles de ${balance.total} totales.`
      : `Has agotado tu permiso de ${input.leave_type} este año.`
  }
}
