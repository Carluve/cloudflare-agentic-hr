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
