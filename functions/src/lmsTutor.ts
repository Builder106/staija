/**
 * askLmsTutor — Interactive AI Tutor callable function using Groq LLM (llama-3.3-70b-versatile).
 *
 * Provides context-aware tutoring for STAIJA students studying lesson content or
 * seeking help on quiz questions. Output includes structured Markdown, Mermaid concept maps,
 * and LaTeX mathematical formatting.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import Groq from 'groq-sdk'

const GROQ_API_KEY = defineSecret('GROQ_API_KEY')

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface QuizQuestionHelpContext {
  questionText: string
  userAnswerText?: string
  explanation?: string
}

export interface AskLmsTutorInput {
  lessonTitle: string
  lessonBodyPlain: string
  courseTitle?: string
  program?: string
  studentQuestion: string
  chatHistory?: ChatMessage[]
  questionContext?: QuizQuestionHelpContext
}

export interface AskLmsTutorOutput {
  reply: string
  suggestedFollowUps: string[]
}

const SYSTEM_PROMPT = `You are STAIJA's Visual & Interactive AI STEM Tutor, dedicated to supporting African scholars in the StepUp Scholars and Dynamerge learning programs.

Your core goals:
1. Explain STEM concepts clearly, with academic rigor formatted for accessibility and engagement.
2. Whenever a visual diagram, flowchart, mindmap, or process flow would help explain the topic, include a valid Mermaid diagram block (e.g. \`\`\`mermaid\ngraph TD\n  A --> B\n\`\`\`). Keep Mermaid node names simple and clean without unescaped brackets.
3. Use KaTeX/LaTeX formatting for equations (e.g. $$ E = mc^2 $$ or \\( x^2 + y^2 = z^2 \\)) when explaining math or physics concepts.
4. Keep explanations structured with short headings, bullet points, and practical real-world examples relevant to technology, science, and African contexts where applicable.
5. End every response with 2-3 short, relevant follow-up questions or prompt suggestions the student can ask next. Format these at the very bottom as JSON block:
\`\`\`json
{
  "followUps": ["Can you give another example?", "Show me a flowchart of how this works", "How is this used in real software?"]
}
\`\`\`
`

export const askLmsTutor = onCall(
  { secrets: [GROQ_API_KEY] },
  async (request): Promise<AskLmsTutorOutput> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in to ask the AI Tutor.')
    }

    const {
      lessonTitle,
      lessonBodyPlain,
      courseTitle,
      program,
      studentQuestion,
      chatHistory = [],
      questionContext,
    } = request.data as AskLmsTutorInput

    if (!studentQuestion || !studentQuestion.trim()) {
      throw new HttpsError('invalid-argument', 'Question cannot be empty.')
    }

    const apiKey = GROQ_API_KEY.value()
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'GROQ_API_KEY secret is missing.')
    }

    const groq = new Groq({ apiKey })

    // Build context window
    let contextHeader = `=== LESSON CONTEXT ===\nCourse: ${courseTitle || 'STAIJA Course'}\nProgram: ${program || 'STAIJA Program'}\nLesson: ${lessonTitle}\n\nContent:\n${lessonBodyPlain.slice(0, 3000)}\n`

    if (questionContext) {
      contextHeader += `\n=== QUIZ QUESTION CONTEXT ===\nQuestion: ${questionContext.questionText}\nStudent Answer: ${questionContext.userAnswerText || 'Not specified'}\nReference Explanation: ${questionContext.explanation || 'None'}\n`
    }

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: contextHeader },
    ]

    // Append history (up to last 6 messages)
    const recentHistory = chatHistory.slice(-6)
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      })
    }

    // Append latest question
    messages.push({
      role: 'user',
      content: studentQuestion,
    })

    try {
      const completion = await groq.chat.completions.create({
        messages,
        model: 'llama-3.3-70b-versatile',
        temperature: 0.6,
        max_tokens: 1500,
      })

      const rawReply = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response. Please try asking your question again.'

      // Extract JSON follow-up block if present
      let reply = rawReply
      let suggestedFollowUps: string[] = []

      const jsonMatch = rawReply.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1])
          if (Array.isArray(parsed.followUps)) {
            suggestedFollowUps = parsed.followUps.slice(0, 3)
          }
          // Strip out the json block from the displayed reply text
          reply = rawReply.replace(/```json\s*[\s\S]*?\s*```/, '').trim()
        } catch {
          // If JSON parsing fails, fallback to default follow-up prompts
        }
      }

      if (suggestedFollowUps.length === 0) {
        suggestedFollowUps = [
          'Can you break this down further?',
          'Show me a visual flowchart of this process.',
          'Give me a practical exercise to test my understanding.',
        ]
      }

      return {
        reply,
        suggestedFollowUps,
      }
    } catch (err: unknown) {
      console.error('askLmsTutor Groq API error:', err)
      throw new HttpsError('internal', 'AI Tutor encountered an error processing your request.')
    }
  },
)
