import { POLICIES } from '../data/policies'

export async function searchPolicy(input: { query: string; category?: string }) {
  const { query, category } = input
  const queryLower = query.toLowerCase()

  let results = POLICIES

  if (category) {
    results = results.filter(p => p.category === category)
  }

  results = results
    .filter(p =>
      p.title.toLowerCase().includes(queryLower) ||
      p.summary.toLowerCase().includes(queryLower) ||
      p.content.toLowerCase().includes(queryLower) ||
      p.tags.some(tag => tag.toLowerCase().includes(queryLower))
    )
    .slice(0, 3)

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
