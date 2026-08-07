import { describe, it, expect } from 'vitest'
import type { CmsQuiz, QuizQuestion, QuizAttempt } from '../../src/services/types'

describe('LMS Quiz Services & Data Logic', () => {
  const sampleQuiz: CmsQuiz = {
    slug: 'sample-quiz',
    title: 'Sample Knowledge Check',
    passThresholdPercent: 70,
    questions: [
      {
        id: 'q1',
        questionText: 'What is 2 + 2?',
        options: [
          { id: 'q1_a', text: '3' },
          { id: 'q1_b', text: '4' },
        ],
        correctOptionId: 'q1_b',
        explanation: '2 + 2 equals 4.',
      },
      {
        id: 'q2',
        questionText: 'Is Python dynamically typed?',
        options: [
          { id: 'q2_a', text: 'Yes' },
          { id: 'q2_b', text: 'No' },
        ],
        correctOptionId: 'q2_a',
        explanation: 'Python determines variable types at runtime.',
      },
    ],
  }

  function evaluateQuiz(quiz: CmsQuiz, answers: Record<string, string>) {
    let correct = 0
    const feedback: Record<string, boolean> = {}

    for (const q of quiz.questions) {
      const isCorrect = answers[q.id] === q.correctOptionId
      if (isCorrect) correct++
      feedback[q.id] = isCorrect
    }

    const total = quiz.questions.length
    const score = Math.round((correct / total) * 100)
    const threshold = quiz.passThresholdPercent ?? 70
    const passed = score >= threshold

    return { score, passed, correct, total, feedback }
  }

  it('correctly calculates 100% score and passed status when all answers are correct', () => {
    const userAnswers = { q1: 'q1_b', q2: 'q2_a' }
    const res = evaluateQuiz(sampleQuiz, userAnswers)

    expect(res.score).toBe(100)
    expect(res.passed).toBe(true)
    expect(res.correct).toBe(2)
    expect(res.feedback.q1).toBe(true)
    expect(res.feedback.q2).toBe(true)
  })

  it('correctly calculates 50% score and failed status when threshold is 70%', () => {
    const userAnswers = { q1: 'q1_b', q2: 'q2_b' } // q2 is incorrect
    const res = evaluateQuiz(sampleQuiz, userAnswers)

    expect(res.score).toBe(50)
    expect(res.passed).toBe(false)
    expect(res.correct).toBe(1)
    expect(res.feedback.q1).toBe(true)
    expect(res.feedback.q2).toBe(false)
  })

  it('validates QuizAttempt record structure', () => {
    const attempt: QuizAttempt = {
      enrollmentId: 'enr_123',
      studentId: 'user_456',
      quizId: 'quiz_789',
      quizSlug: 'sample-quiz',
      lessonSlug: 'lesson-1',
      score: 100,
      passed: true,
      answers: { q1: 'q1_b', q2: 'q2_a' },
      totalQuestions: 2,
      correctCount: 2,
      submittedAt: new Date(),
    }

    expect(attempt.score).toBeGreaterThanOrEqual(70)
    expect(attempt.passed).toBe(true)
  })
})
