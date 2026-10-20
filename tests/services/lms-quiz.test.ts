import { describe, expect, it } from 'vitest'
import { mergeQuizQuestions, publicQuizQuestions, splitQuizQuestions } from '../../functions/src/quizContent'
import { contentfulEnvironmentForProject } from '../../functions/src/contentfulEnvironment'

const questions = [{
  id: 'q1',
  questionText: 'What is 2 + 2?',
  options: [{ id: 'a', text: '3' }, { id: 'b', text: '4' }],
  correctOptionId: 'b',
  explanation: '2 + 2 equals 4.',
}]

describe('quiz content boundary', () => {
  it('keeps the two Firebase projects in their own Contentful environments', () => {
    expect(contentfulEnvironmentForProject('staija')).toBe('master')
    expect(contentfulEnvironmentForProject('staija-staging')).toBe('staging')
    expect(() => contentfulEnvironmentForProject('other')).toThrow()
  })

  it('stores answers separately from public quiz questions', () => {
    const result = splitQuizQuestions(questions)
    expect(result.questions).toEqual([{
      id: 'q1',
      questionText: 'What is 2 + 2?',
      options: [{ id: 'a', text: '3' }, { id: 'b', text: '4' }],
    }])
    expect(JSON.stringify(result.questions)).not.toContain('correctOptionId')
    expect(result.answerKeys.q1).toEqual({ correctOptionId: 'b', explanation: '2 + 2 equals 4.' })
    expect(mergeQuizQuestions(result.questions, result.answerKeys)).toEqual(questions)
  })

  it('drops unexpected answer fields from webhook content', () => {
    expect(publicQuizQuestions([{ ...questions[0], secret: 'must stay private' }])).toEqual(
      splitQuizQuestions(questions).questions,
    )
  })

  it('rejects invalid answer keys and duplicate option IDs', () => {
    expect(() => splitQuizQuestions([{ ...questions[0], correctOptionId: 'missing' }])).toThrow()
    expect(() => publicQuizQuestions([{ ...questions[0], options: [questions[0].options[0], questions[0].options[0]] }])).toThrow()
  })
})
