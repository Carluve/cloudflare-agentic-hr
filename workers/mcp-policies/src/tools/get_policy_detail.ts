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
