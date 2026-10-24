export interface PublicQuizQuestion {
  id: string
  questionText: string
  options: { id: string; text: string }[]
}

export interface QuizAnswerKey {
  correctOptionId: string
  explanation?: string
}

export type QuizAnswerKeys = Record<string, QuizAnswerKey>

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Quiz questions must be objects.')
  }
  return value as Record<string, unknown>
}

export function publicQuizQuestions(value: unknown): PublicQuizQuestion[] {
  if (!Array.isArray(value)) throw new Error('Quiz questions must be an array.')
  const seen = new Set<string>()
  return value.map((raw) => {
    const question = record(raw)
    if (typeof question.id !== 'string' || !question.id || seen.has(question.id)) {
      throw new Error('Quiz question IDs must be unique and nonempty.')
    }
    seen.add(question.id)
    if (typeof question.questionText !== 'string' || !Array.isArray(question.options)) {
      throw new Error('Quiz questions need text and options.')
    }
    const optionIds = new Set<string>()
    const options = question.options.map((rawOption) => {
      const option = record(rawOption)
      if (typeof option.id !== 'string' || !option.id || optionIds.has(option.id)) {
        throw new Error('Quiz option IDs must be unique and nonempty.')
      }
      if (typeof option.text !== 'string') throw new Error('Quiz options need text.')
      optionIds.add(option.id)
      return { id: option.id, text: option.text }
    })
    if (options.length < 2) throw new Error('Quiz questions need at least two options.')
    return { id: question.id, questionText: question.questionText, options }
  })
}

export function splitQuizQuestions(value: unknown): {
  questions: PublicQuizQuestion[]
  answerKeys: QuizAnswerKeys
} {
  const questions = publicQuizQuestions(value)
  const answerKeys: QuizAnswerKeys = {}
  for (const [index, question] of questions.entries()) {
    const raw = record((value as unknown[])[index])
    const correctOptionId = raw.correctOptionId
    if (
      typeof correctOptionId !== 'string' ||
      !question.options.some((option) => option.id === correctOptionId)
    ) {
      throw new Error(`Quiz question ${question.id} needs a valid correct option.`)
    }
    if (raw.explanation !== undefined && typeof raw.explanation !== 'string') {
      throw new Error(`Quiz question ${question.id} has an invalid explanation.`)
    }
    answerKeys[question.id] = {
      correctOptionId,
      ...(raw.explanation === undefined ? {} : { explanation: raw.explanation }),
    }
  }
  return { questions, answerKeys }
}

export function mergeQuizQuestions(
  questions: PublicQuizQuestion[],
  answerKeys: QuizAnswerKeys,
): Array<PublicQuizQuestion & QuizAnswerKey> {
  return questions.map((question) => ({
    ...question,
    correctOptionId: answerKeys[question.id]?.correctOptionId ?? '',
    explanation: answerKeys[question.id]?.explanation,
  }))
}
