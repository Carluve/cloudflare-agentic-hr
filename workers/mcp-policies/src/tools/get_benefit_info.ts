const BENEFITS = [
  {
    id: 'BEN-001',
    name: 'Seguro Médico Privado',
    description: 'Cobertura médica privada para el empleado y su familia directa. Incluye consultas, especialistas, hospitalización y urgencias.',
    provider: 'Adeslas',
    coverage: 'Empleado + cónyuge + hijos menores de 26 años',
    cost_employee: '0€/mes (la empresa cubre el 100%)'
  },
  {
    id: 'BEN-002',
    name: 'Ticket Restaurante',
    description: 'Cheques restaurante para comidas en días laborables.',
    amount: '11€/día laborable',
    format: 'Tarjeta prepago Sodexo',
    tax_exempt: true
  },
  {
    id: 'BEN-003',
    name: 'Seguro de Vida',
    description: 'Cobertura de 2 veces el salario anual bruto en caso de fallecimiento o invalidez permanente.',
    beneficiaries: 'Designados por el empleado'
  },
  {
    id: 'BEN-004',
    name: 'Plan de Formación',
    description: 'Hasta 1.500€/año para formación profesional relacionada con el puesto. Cursos, certificaciones, conferencias.',
    process: 'Solicitar aprobación previa al manager y RRHH'
  },
  {
    id: 'BEN-005',
    name: 'Flexibilidad Horaria',
    description: 'Horario flexible entre 7:00 y 10:00 para la entrada, y salida correspondiente. Core hours de 10:00 a 16:00.',
    applies_to: 'Todos los empleados de oficina'
  },
]

export async function getBenefitInfo(input: { benefit_id?: string; query?: string }) {
  if (input.benefit_id) {
    const benefit = BENEFITS.find(b => b.id === input.benefit_id)
    return benefit ?? { error: `Beneficio ${input.benefit_id} no encontrado` }
  }

  if (input.query) {
    const queryLower = input.query.toLowerCase()
    const results = BENEFITS.filter(b =>
      b.name.toLowerCase().includes(queryLower) ||
      b.description.toLowerCase().includes(queryLower)
    )
    return { benefits: results, total: results.length }
  }

  return { benefits: BENEFITS, total: BENEFITS.length }
}
