# 03 — MCP Server: HR Policies

## Propósito

Worker que expone una API de herramientas para consultar las políticas internas de RRHH. Es **read-only** — no modifica ningún dato. Recibe llamadas del Agent Worker vía `POST /call`.

## Archivos a crear

```
workers/mcp-policies/
├── src/
│   ├── index.ts          ← Entry point y router de tools
│   ├── data/
│   │   └── policies.ts   ← Datos de demo (políticas hardcoded)
│   └── tools/
│       ├── search_policy.ts
│       ├── get_policy_detail.ts
│       ├── get_leave_types.ts
│       ├── get_benefit_info.ts
│       └── get_faq.ts
└── wrangler.toml
```

---

## index.ts — Entry Point

```typescript
import { searchPolicy } from './tools/search_policy'
import { getPolicyDetail } from './tools/get_policy_detail'
import { getLeaveTypes } from './tools/get_leave_types'
import { getBenefitInfo } from './tools/get_benefit_info'
import { getFaq } from './tools/get_faq'

const TOOLS: Record<string, (input: any) => Promise<any>> = {
  search_policy: searchPolicy,
  get_policy_detail: getPolicyDetail,
  get_leave_types: getLeaveTypes,
  get_benefit_info: getBenefitInfo,
  get_faq: getFaq,
}

export default {
  async fetch(request: Request): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    if (request.method === 'POST' && new URL(request.url).pathname === '/call') {
      const { tool, input } = await request.json() as { tool: string; input: any }

      const handler = TOOLS[tool]
      if (!handler) {
        return new Response(
          JSON.stringify({ error: `Tool '${tool}' not found`, code: 'TOOL_NOT_FOUND' }),
          { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        )
      }

      try {
        const result = await handler(input)
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        })
      } catch (error) {
        return new Response(
          JSON.stringify({ error: String(error), code: 'TOOL_ERROR' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        )
      }
    }

    // Health check
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, tools: Object.keys(TOOLS) }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    return new Response('Not found', { status: 404 })
  }
}
```

---

## data/policies.ts — Base de conocimiento de demo

```typescript
export interface Policy {
  id: string
  title: string
  category: 'leave' | 'benefits' | 'conduct' | 'remote_work' | 'compensation'
  summary: string
  content: string
  version: string
  updated_at: string
  tags: string[]
}

export const POLICIES: Policy[] = [
  {
    id: 'POL-001',
    title: 'Política de Vacaciones Anuales',
    category: 'leave',
    summary: 'Los empleados tienen derecho a 20 días hábiles de vacaciones anuales pagadas.',
    content: `## Vacaciones Anuales

Los empleados de Empresa Demo S.A. tienen derecho a 20 días hábiles de vacaciones anuales remuneradas.

**Acumulación:**
- Empleados con menos de 1 año: días proporcionales al tiempo trabajado
- Empleados con 1-5 años: 20 días hábiles/año
- Empleados con más de 5 años: 25 días hábiles/año

**Planificación:**
- Las vacaciones deben solicitarse con al menos 2 semanas de antelación
- El manager debe aprobar las fechas en un plazo de 3 días hábiles
- No es posible acumular más de 30 días

**Caducidad:**
- Los días no disfrutados pueden trasladarse al año siguiente hasta un máximo de 5 días
- Los días restantes caducan el 31 de marzo del año siguiente`,
    version: '2.1',
    updated_at: '2024-09-01',
    tags: ['vacaciones', 'días libres', 'permiso', 'descanso']
  },
  {
    id: 'POL-002',
    title: 'Política de Permiso Médico',
    category: 'leave',
    summary: 'Los empleados tienen hasta 15 días de permiso médico remunerado por año, con justificante.',
    content: `## Permiso Médico

**Días disponibles:** 15 días hábiles por año natural, remunerados al 100%.

**Requisitos:**
- Permisos de 1 día: no requieren justificante
- Permisos de 2 o más días consecutivos: requieren justificante médico en un plazo de 72 horas
- El empleado debe notificar a su manager antes de las 9:00 AM del primer día de ausencia

**Proceso:**
1. Notificar al manager y crear solicitud en el sistema
2. Adjuntar justificante médico si aplica
3. El sistema aprueba automáticamente permisos con justificante válido

**Baja por enfermedad prolongada:**
- Si la baja supera los 15 días, se activa el protocolo de incapacidad temporal
- La empresa complementa la prestación de la Seguridad Social hasta el 100% del salario durante los primeros 60 días`,
    version: '1.8',
    updated_at: '2024-11-15',
    tags: ['médico', 'enfermedad', 'baja', 'salud', 'permiso médico']
  },
  {
    id: 'POL-003',
    title: 'Política de Teletrabajo',
    category: 'remote_work',
    summary: 'Los empleados pueden teletrabajar hasta 3 días por semana, con acuerdo del manager.',
    content: `## Política de Teletrabajo

**Modalidad híbrida:** Mínimo 2 días presenciales en oficina, máximo 3 días en remoto por semana.

**Elegibilidad:**
- Empleados con más de 3 meses de antigüedad
- Roles que no requieren presencia física obligatoria
- Acuerdo previo con el manager directo

**Equipamiento:**
- La empresa proporciona portátil y monitor para el trabajo en remoto
- El empleado debe disponer de conexión a internet estable (mínimo 20 Mbps)
- VPN obligatoria para acceso a sistemas internos

**Horario:**
- Se mantiene el horario laboral habitual
- Disponibilidad en herramientas de comunicación (Slack, email) en horario de trabajo
- Reuniones de equipo programadas con 48h de antelación`,
    version: '3.0',
    updated_at: '2025-01-10',
    tags: ['teletrabajo', 'remoto', 'híbrido', 'trabajo desde casa', 'WFH']
  },
  {
    id: 'POL-004',
    title: 'Permiso de Maternidad y Paternidad',
    category: 'leave',
    summary: 'Permiso de maternidad: 16 semanas. Permiso de paternidad: 16 semanas.',
    content: `## Permisos de Maternidad y Paternidad

**Maternidad:**
- 16 semanas remuneradas al 100%
- Las 6 primeras semanas son obligatorias tras el parto
- Las 10 semanas restantes pueden distribuirse en los 12 meses siguientes al nacimiento

**Paternidad:**
- 16 semanas remuneradas al 100% (igual que maternidad desde 2021)
- Las primeras 6 semanas son obligatorias e ininterrumpidas
- Las 10 semanas restantes pueden tomarse hasta que el menor cumpla 12 meses

**Documentación:**
- Libro de familia o certificado de nacimiento
- Solicitud formal con al menos 2 semanas de antelación (salvo urgencia)`,
    version: '2.0',
    updated_at: '2024-03-01',
    tags: ['maternidad', 'paternidad', 'nacimiento', 'bebé', 'hijo']
  },
  {
    id: 'POL-005',
    title: 'Política de Gastos y Dietas',
    category: 'compensation',
    summary: 'Reembolso de gastos de viaje, comidas y alojamiento para viajes de empresa.',
    content: `## Política de Gastos

**Viajes nacionales:**
- Dieta de comida: hasta 25€/día
- Dieta de cena: hasta 35€/día si pernocta fuera
- Alojamiento: hasta 120€/noche (hoteles de categoría estándar)
- Transporte: preferiblemente tren o avión en clase turista

**Viajes internacionales:**
- Dietas según tabla de países (disponible en intranet)
- Vuelos de más de 6 horas: clase business permitida con aprobación de dirección

**Proceso de reembolso:**
- Presentar facturas en el sistema de gastos en un plazo de 30 días
- Gastos superiores a 500€ requieren aprobación previa del manager
- Pago en nómina del mes siguiente a la justificación`,
    version: '1.5',
    updated_at: '2024-07-01',
    tags: ['gastos', 'dietas', 'viajes', 'reembolso', 'viaje de empresa']
  },
]

export const FAQ_DATA = [
  {
    question: 'cuántos días de vacaciones',
    answer: 'Tienes derecho a 20 días hábiles de vacaciones al año (25 si llevas más de 5 años en la empresa). Ver política POL-001 para detalles sobre acumulación y caducidad.'
  },
  {
    question: 'cómo solicitar permiso',
    answer: 'Puedes pedirme directamente que cree tu solicitud. Solo dime el tipo de permiso (vacaciones, médico, personal), las fechas y yo me encargo del resto: verifico tu balance, creo la solicitud y notifico a tu manager.'
  },
  {
    question: 'teletrabajo días',
    answer: 'Puedes teletrabajar hasta 3 días por semana, con un mínimo de 2 días presenciales en oficina. Necesitas acuerdo con tu manager. Ver política POL-003.'
  },
  {
    question: 'permiso médico justificante',
    answer: 'Para 1 día no necesitas justificante. Para 2 o más días consecutivos, debes presentar justificante médico en 72 horas. Tienes 15 días de permiso médico remunerado al año.'
  },
]
```

---

## tools/search_policy.ts

```typescript
import { POLICIES } from '../data/policies'

export async function searchPolicy(input: { query: string; category?: string }) {
  const { query, category } = input
  const queryLower = query.toLowerCase()

  let results = POLICIES

  // Filtrar por categoría si se especifica
  if (category) {
    results = results.filter(p => p.category === category)
  }

  // Búsqueda por relevancia: buscar en título, resumen, contenido y tags
  results = results
    .filter(p =>
      p.title.toLowerCase().includes(queryLower) ||
      p.summary.toLowerCase().includes(queryLower) ||
      p.content.toLowerCase().includes(queryLower) ||
      p.tags.some(tag => tag.toLowerCase().includes(queryLower))
    )
    .slice(0, 3)  // Máximo 3 resultados

  return {
    results: results.map(p => ({
      id: p.id,
      title: p.title,
      category: p.category,
      summary: p.summary,
      relevance_excerpt: p.content.slice(0, 300) + '...'
    })),
    total: results.length
  }
}
```

---

## tools/get_policy_detail.ts

```typescript
import { POLICIES } from '../data/policies'

export async function getPolicyDetail(input: { policy_id: string }) {
  const policy = POLICIES.find(p => p.id === input.policy_id)

  if (!policy) {
    return { error: `Política ${input.policy_id} no encontrada` }
  }

  return {
    id: policy.id,
    title: policy.title,
    category: policy.category,
    content: policy.content,
    version: policy.version,
    updated_at: policy.updated_at
  }
}
```

---

## tools/get_leave_types.ts

```typescript
export async function getLeaveTypes(_input: any) {
  return {
    leave_types: [
      { id: 'vacation',   name: 'Vacaciones',           days_per_year: 20, requires_document: false },
      { id: 'medical',    name: 'Permiso Médico',        days_per_year: 15, requires_document: true,  note: 'Justificante en 72h para 2+ días' },
      { id: 'personal',   name: 'Asuntos Personales',   days_per_year: 3,  requires_document: false },
      { id: 'maternity',  name: 'Maternidad',            days_per_year: 112, requires_document: true },
      { id: 'paternity',  name: 'Paternidad',            days_per_year: 112, requires_document: true },
    ]
  }
}
```

---

## tools/get_faq.ts

```typescript
import { FAQ_DATA } from '../data/policies'

export async function getFaq(input: { question: string }) {
  const queryLower = input.question.toLowerCase()
  
  const match = FAQ_DATA.find(faq =>
    faq.question.split(' ').some(word => queryLower.includes(word))
  )

  return {
    answer: match?.answer ?? 'No encontré una respuesta directa. Prueba con search_policy para buscar en las políticas.',
    source: 'FAQ de RRHH'
  }
}
```

---

## wrangler.toml

```toml
name = "mcp-policies"
main = "src/index.ts"
compatibility_date = "2025-01-01"
```
