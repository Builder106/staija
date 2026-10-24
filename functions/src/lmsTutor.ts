/**
 * lmsTutor.ts — Full-History & Streaming AI STEM Tutor for STAIJA LMS.
 *
 * Provides context-aware, progressive tutoring for African scholars in StepUp Scholars
 * and Dynamerge. Supports streaming callable responses, structured whiteboard pages
 * (Mermaid, KaTeX formulas, study notes), multi-mode pedagogical workflows, and
 * persistent session archives.
 */

import { onCall, HttpsError, type CallableResponse } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore } from 'firebase-admin/firestore'
import Groq from 'groq-sdk'
import { z } from 'zod'

const GROQ_API_KEY = defineSecret('GROQ_API_KEY')

export type TutorPageKind = 'mermaid' | 'geometry' | 'notes' | 'freehand'

export interface TutorPageSnapshot {
  id: string
  title: string
  kind: TutorPageKind
  content: string
  createdAt: number
  updatedAt?: number
}

export type TutorStreamEvent =
  | { type: 'message-start'; sessionId: string; messageId: string }
  | { type: 'text-delta'; messageId: string; text: string }
  | { type: 'page-start'; pageId: string; kind: TutorPageKind }
  | { type: 'page-complete'; page: TutorPageSnapshot }
  | { type: 'suggestions'; items: string[] }
  | { type: 'done'; sessionId: string; messageId: string }
  | { type: 'error'; code: string; retryable: boolean }

export interface AskLmsTutorOutput {
  sessionId: string
  messageId: string
  reply: string
  suggestedFollowUps: string[]
  pages?: TutorPageSnapshot[]
}

export interface TutorSessionSummary {
  id: string
  userId: string
  lessonId: string
  lessonTitle: string
  courseTitle?: string | null
  program?: string | null
  mode: string
  lastMessage?: string
  messageCount: number
  createdAt: number
  updatedAt: number
}

export interface TutorSessionMessageDoc {
  id: string
  sessionId: string
  userId: string
  role: 'user' | 'assistant'
  content: string
  suggestedFollowUps?: string[]
  createdAt: number
}

export interface TutorSessionDetailResponse {
  session: TutorSessionSummary
  messages: TutorSessionMessageDoc[]
  pages: TutorPageSnapshot[]
}

export interface SaveTutorPageResponse {
  ok: boolean
  page: TutorPageSnapshot
}

export interface TutorAnnotationDoc {
  id: string
  pageId: string
  authorUid: string
  authorName: string
  authorRole: string
  content: string
  createdAt: number
}

export interface SaveTutorAnnotationResponse {
  ok: boolean
  annotation: TutorAnnotationDoc
}

export interface DeleteTutorSessionResponse {
  ok: boolean
}

export interface SetTutorMemoryPreferenceResponse {
  ok: boolean
  memoryEnabled: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const AskLmsTutorInputSchema = z.object({
  sessionId: z.string().nullish(),
  lessonId: z.string().nullish(),
  studentQuestion: z.string().min(1, 'Question cannot be empty.').max(4000),
  clientMessageId: z.string().nullish(),
  mode: z.enum(['standard', 'socratic', 'deep', 'diagram', 'practice']).nullish(),
  lessonTitle: z.string().nullish(),
  lessonBodyPlain: z.string().nullish(),
  courseTitle: z.string().nullish(),
  program: z.string().nullish(),
  chatHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .nullish(),
  questionContext: z
    .object({
      questionId: z.string().nullish(),
      questionText: z.string().nullish(),
      userAnswerText: z.string().nullish(),
      studentAnswer: z.string().nullish(),
      correctAnswer: z.string().nullish(),
      explanation: z.string().nullish(),
    })
    .nullish(),
})

export type AskLmsTutorInput = z.infer<typeof AskLmsTutorInputSchema>

const BASE_SYSTEM_PROMPT = `You are STAIJA's Visual & Interactive AI STEM Tutor, dedicated to supporting African scholars in the StepUp Scholars and Dynamerge learning programs.

Your core goals:
1. Explain STEM concepts clearly, with academic rigor formatted for accessibility and engagement.
2. Whenever a visual diagram, flowchart, mindmap, or process flow would help explain the topic, include a valid Mermaid diagram block (e.g. \`\`\`mermaid\ngraph TD\n  A --> B\n\`\`\`). Keep Mermaid node names simple and clean without unescaped brackets.
3. When explaining coordinate geometry, vectors, function plots, physics kinematics, optics, or mathematical models, include an interactive declarative geometry block using \`\`\`geometry
{
  "title": "Diagram Title",
  "boundingBox": [-10, 10, 10, -10],
  "elements": [
    {"kind": "point", "coords": [0, 0], "name": "A"},
    {"kind": "line", "point1": [-5, 5], "point2": [0, 0]},
    {"kind": "functiongraph", "fn": "sin(x)", "name": "f(x)"}
  ]
}
\`\`\`. Supported elements: "point" ("coords"), "line" / "segment" ("point1", "point2" or "start", "end"), "circle" ("center", "radius"), "polygon" ("vertices"), "vector" ("point1", "point2" or "start", "end"), "functiongraph" (with safe math formula "fn"), "slider" ("name", "point1", "point2", "range": [min, init, max]), and "text" ("coords", "text"). Never output raw executable JavaScript.
4. Use KaTeX/LaTeX formatting for equations (e.g. $$ E = mc^2 $$ or \\( x^2 + y^2 = z^2 \\)) when explaining math, chemistry, physics, or algorithmic concepts.
5. Keep explanations structured with clean subheadings, bullet points, and practical real-world examples relevant to technology, science, and African contexts where applicable.
6. End every response with 2-3 short, relevant follow-up questions or prompt suggestions the student can ask next. Format these at the very bottom as a JSON block:
\`\`\`json
{
  "followUps": ["Can you give another example?", "Show me a flowchart of how this works", "How is this used in real software?"]
}
\`\`\`
`

function getModeGuidance(mode?: string): string {
  switch (mode) {
    case 'socratic':
      return 'Pedagogical Mode: SOCRATIC DIALOGUE. Guide the student to deduce the answer themselves through targeted inquiry, progressive hints, and conceptual questions. Never give away the full final solution immediately.'
    case 'deep':
      return 'Pedagogical Mode: DEEP THEORY & RIGOR. Provide rigorous theoretical foundations, mathematical derivations with KaTeX, underlying mechanisms, and citations to canonical science or literature.'
    case 'diagram':
      return 'Pedagogical Mode: VISUAL CONCEPT MAP. Prioritize creating informative Mermaid flowcharts or sequence diagrams that map out processes, hierarchies, and cause-and-effect relationships.'
    case 'practice':
      return 'Pedagogical Mode: PRACTICE & RETRIEVAL. Present a targeted, realistic scenario or practice problem for the student to solve based on this lesson, followed by guidance on how to approach it.'
    case 'standard':
    default:
      return 'Pedagogical Mode: STANDARD TUTORING. Provide clear, accessible, and structured explanations with practical examples, bullet points, and visual clarity.'
  }
}

export const askLmsTutor = onCall(
  { secrets: [GROQ_API_KEY], timeoutSeconds: 120, memory: '512MiB' },
  async (request, response?: CallableResponse<TutorStreamEvent>): Promise<AskLmsTutorOutput> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in to ask the AI Tutor.')
    }
    const uid = request.auth.uid

    const parseResult = AskLmsTutorInputSchema.safeParse(request.data)
    if (!parseResult.success) {
      const msg = parseResult.error.issues.map((i) => i.message).join('; ')
      throw new HttpsError('invalid-argument', `Invalid request: ${msg}`)
    }

    const rawData = parseResult.data
    const studentQuestion = rawData.studentQuestion
    const sessionId = rawData.sessionId || undefined
    const lessonId = rawData.lessonId || undefined
    const clientMessageId = rawData.clientMessageId || undefined
    const mode = rawData.mode || 'standard'
    const lessonTitle = rawData.lessonTitle || undefined
    const lessonBodyPlain = rawData.lessonBodyPlain || undefined
    const courseTitle = rawData.courseTitle || undefined
    const program = rawData.program || undefined
    const chatHistory = rawData.chatHistory || []
    const questionContext = rawData.questionContext || undefined

    const apiKey = GROQ_API_KEY.value()
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'GROQ_API_KEY secret is missing.')
    }

    const db = getFirestore()

    // 1. Resolve authoritative lesson data from Firestore mirror if lessonId is provided
    let authoritativeTitle = lessonTitle || 'Lesson'
    let authoritativeBody = lessonBodyPlain || ''

    if (lessonId) {
      try {
        let lessonDoc = await db.collection('cms_lessons').doc(lessonId).get()
        if (!lessonDoc.exists) {
          const slugSnap = await db.collection('cms_lessons').where('slug', '==', lessonId).limit(1).get()
          if (!slugSnap.empty) {
            lessonDoc = slugSnap.docs[0]
          }
        }
        if (lessonDoc.exists) {
          const lData = lessonDoc.data()
          if (lData?.title) authoritativeTitle = lData.title
          if (lData?.summary) authoritativeBody = lData.summary
          if (typeof lData?.body === 'string') {
            authoritativeBody = lData.body
          } else if (lData?.body && typeof lData.body === 'object') {
            authoritativeBody = JSON.stringify(lData.body).slice(0, 3000)
          }
        }
      } catch (err) {
        console.warn('Could not load authoritative lesson context:', err)
      }
    }

    // 2. Resolve or initialize persistent tutor session
    const resolvedSessionId = sessionId || `ts_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const sessionRef = db.collection('tutor_sessions').doc(resolvedSessionId)
    const sessionSnap = await sessionRef.get()

    // 3. Idempotent retry guard: if clientMessageId already exists in this session, return existing answer
    if (clientMessageId) {
      const existingUserMsgSnap = await sessionRef
        .collection('messages')
        .where('clientMessageId', '==', clientMessageId)
        .limit(1)
        .get()

      if (!existingUserMsgSnap.empty) {
        const uMsg = existingUserMsgSnap.docs[0].data()
        const nextAssistantSnap = await sessionRef
          .collection('messages')
          .where('role', '==', 'assistant')
          .where('createdAt', '>=', uMsg.createdAt)
          .orderBy('createdAt', 'asc')
          .limit(1)
          .get()

        if (!nextAssistantSnap.empty) {
          const aDoc = nextAssistantSnap.docs[0]
          const aData = aDoc.data()
          return {
            sessionId: resolvedSessionId,
            messageId: aDoc.id,
            reply: aData.content,
            suggestedFollowUps: aData.suggestedFollowUps || [],
          }
        }
      }
    }

    // 4. Save incoming user message
    const userMsgId = `msg_${Date.now()}_u`
    await sessionRef.collection('messages').doc(userMsgId).set({
      id: userMsgId,
      sessionId: resolvedSessionId,
      userId: uid,
      role: 'user',
      content: studentQuestion,
      clientMessageId: clientMessageId || null,
      createdAt: Date.now(),
    })

    // 5. Load cross-lesson student memory summary if enabled
    let memoryPrompt = ''
    try {
      const memDoc = await db.collection('tutor_memory').doc(uid).get()
      if (memDoc.exists) {
        const m = memDoc.data()
        if (m?.memoryEnabled !== false && m?.summary) {
          memoryPrompt = `\n=== STUDENT LEARNING PROFILE & PROGRESS ===\n${m.summary.slice(0, 800)}\n`
        }
      }
    } catch (err) {
      console.warn('Failed to load tutor memory summary:', err)
    }

    // 6. Build LLM prompt context
    let contextHeader = `=== LESSON CONTEXT ===\nCourse: ${courseTitle || 'STAIJA STEM Course'}\nProgram: ${program || 'STAIJA Learning Program'}\nLesson: ${authoritativeTitle}\n`
    if (authoritativeBody) {
      contextHeader += `\nLesson Content Summary:\n${authoritativeBody.slice(0, 3000)}\n`
    }
    if (questionContext) {
      contextHeader += `\n=== QUIZ QUESTION CONTEXT ===\nQuestion: ${questionContext.questionText}\nStudent Answer: ${questionContext.studentAnswer || questionContext.userAnswerText || 'Not specified'}\nCorrect Answer: ${questionContext.correctAnswer || 'Not disclosed'}\nReference Explanation: ${questionContext.explanation || 'None'}\n`
    }

    const modePrompt = getModeGuidance(mode)
    const combinedSystemPrompt = `${BASE_SYSTEM_PROMPT}\n${modePrompt}${memoryPrompt}`

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: combinedSystemPrompt },
      { role: 'user', content: contextHeader },
    ]

    const recentHistory = chatHistory.slice(-6)
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      })
    }

    messages.push({
      role: 'user',
      content: studentQuestion,
    })

    const groq = new Groq({ apiKey })
    const assistantMsgId = `msg_${Date.now()}_a`
    let fullReply = ''

    try {
      const stream = await groq.chat.completions.create({
        messages,
        model: 'openai/gpt-oss-120b',
        temperature: mode === 'deep' ? 0.4 : 0.6,
        max_tokens: 1800,
        stream: true,
      })

      if (request.acceptsStreaming && response) {
        await response.sendChunk({
          type: 'message-start',
          sessionId: resolvedSessionId,
          messageId: assistantMsgId,
        })
      }

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || ''
        if (delta) {
          fullReply += delta
          if (request.acceptsStreaming && response) {
            await response.sendChunk({
              type: 'text-delta',
              messageId: assistantMsgId,
              text: delta,
            })
          }
        }
      }

      // 7. Parse follow-ups & auto-extract Mermaid cards
      let cleanReply = fullReply
      let suggestedFollowUps: string[] = []

      const jsonMatch = fullReply.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1])
          if (Array.isArray(parsed.followUps)) {
            suggestedFollowUps = parsed.followUps.slice(0, 3)
          }
          cleanReply = fullReply.replace(/```json\s*[\s\S]*?\s*```/, '').trim()
        } catch {
          // Fallback below
        }
      }

      if (suggestedFollowUps.length === 0) {
        suggestedFollowUps = [
          'Can you break this down further?',
          'Show me a visual flowchart of this process.',
          'Give me a practical exercise to test my understanding.',
        ]
      }

      const pages: TutorPageSnapshot[] = []
      const mermaidRegex = /```mermaid\s*([\s\S]*?)\s*```/g
      let mMatch: RegExpExecArray | null
      while ((mMatch = mermaidRegex.exec(cleanReply)) !== null) {
        const pageId = `page_${Date.now()}_${pages.length}`
        const page: TutorPageSnapshot = {
          id: pageId,
          title: `${authoritativeTitle} Concept Map`,
          kind: 'mermaid',
          content: mMatch[1].trim(),
          createdAt: Date.now(),
        }
        pages.push(page)
        await sessionRef.collection('pages').doc(pageId).set({
          ...page,
          sessionId: resolvedSessionId,
          userId: uid,
        })
        if (request.acceptsStreaming && response) {
          await response.sendChunk({
            type: 'page-complete',
            page,
          })
        }
      }

      const geometryRegex = /```(?:geometry|jsxgraph)\s*([\s\S]*?)\s*```/gi
      let gMatch: RegExpExecArray | null
      while ((gMatch = geometryRegex.exec(cleanReply)) !== null) {
        const pageId = `page_${Date.now()}_${pages.length}`
        let pageTitle = `${authoritativeTitle} Interactive Geometry`
        try {
          const parsedGeo = JSON.parse(gMatch[1].trim()) as { title?: string }
          if (parsedGeo.title && typeof parsedGeo.title === 'string') {
            pageTitle = parsedGeo.title
          }
        } catch {
          // ignore parse error
        }

        const page: TutorPageSnapshot = {
          id: pageId,
          title: pageTitle,
          kind: 'geometry',
          content: gMatch[1].trim(),
          createdAt: Date.now(),
        }
        pages.push(page)
        await sessionRef.collection('pages').doc(pageId).set({
          ...page,
          sessionId: resolvedSessionId,
          userId: uid,
        })
        if (request.acceptsStreaming && response) {
          await response.sendChunk({
            type: 'page-complete',
            page,
          })
        }
      }

      if (request.acceptsStreaming && response) {
        await response.sendChunk({
          type: 'suggestions',
          items: suggestedFollowUps,
        })
        await response.sendChunk({
          type: 'done',
          sessionId: resolvedSessionId,
          messageId: assistantMsgId,
        })
      }

      // 8. Persist assistant message and update session metadata
      await sessionRef.collection('messages').doc(assistantMsgId).set({
        id: assistantMsgId,
        sessionId: resolvedSessionId,
        userId: uid,
        role: 'assistant',
        content: cleanReply,
        suggestedFollowUps,
        createdAt: Date.now(),
      })

      const prevMessageCount = sessionSnap.exists ? (sessionSnap.data()?.messageCount || 0) : 0
      const prevCreatedAt = sessionSnap.exists ? (sessionSnap.data()?.createdAt || Date.now()) : Date.now()

      await sessionRef.set(
        {
          id: resolvedSessionId,
          userId: uid,
          lessonId: lessonId || 'general',
          lessonTitle: authoritativeTitle,
          courseTitle: courseTitle || null,
          program: program || null,
          mode,
          lastMessage: cleanReply.slice(0, 160),
          updatedAt: Date.now(),
          messageCount: prevMessageCount + 2,
          createdAt: prevCreatedAt,
        },
        { merge: true },
      )

      // 9. Update cross-lesson memory summary
      try {
        const memRef = db.collection('tutor_memory').doc(uid)
        const memSnap = await memRef.get()
        const existingSummary = memSnap.exists ? (memSnap.data()?.summary || '') : ''
        const summarySnippet = `Studied ${authoritativeTitle}: inquired "${studentQuestion.slice(0, 70)}".`
        const updatedSummary = existingSummary ? `${existingSummary} ${summarySnippet}`.slice(-750) : summarySnippet

        await memRef.set(
          {
            uid,
            summary: updatedSummary,
            memoryEnabled: memSnap.exists ? (memSnap.data()?.memoryEnabled !== false) : true,
            updatedAt: Date.now(),
          },
          { merge: true },
        )
      } catch (err) {
        console.warn('Could not update tutor memory:', err)
      }

      return {
        sessionId: resolvedSessionId,
        messageId: assistantMsgId,
        reply: cleanReply,
        suggestedFollowUps,
        pages,
      }
    } catch (err) {
      console.error('askLmsTutor Groq API error:', err)
      if (request.acceptsStreaming && response) {
        await response.sendChunk({
          type: 'error',
          code: 'ai_inference_failed',
          retryable: true,
        })
      }
      throw new HttpsError('internal', 'AI Tutor encountered an error processing your request.')
    }
  },
)

export const listTutorSessions = onCall(
  { timeoutSeconds: 30, memory: '256MiB' },
  async (request): Promise<TutorSessionSummary[]> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.')
    }
    const uid = request.auth.uid
    const db = getFirestore()
    const { studentId, lessonId, limit = 20 } = (request.data || {}) as {
      studentId?: string
      lessonId?: string
      limit?: number
    }

    let targetUid = uid
    if (studentId && studentId !== uid) {
      const userDoc = await db.collection('users').doc(uid).get()
      const role = userDoc.data()?.role
      if (role !== 'admin' && role !== 'staff') {
        const enrollmentSnap = await db
          .collection('enrollments')
          .where('mentorId', '==', uid)
          .where('studentId', '==', studentId)
          .limit(1)
          .get()
        if (enrollmentSnap.empty) {
          throw new HttpsError('permission-denied', 'Not authorized to view student tutor sessions.')
        }
      }
      targetUid = studentId
    }

    let queryRef = db
      .collection('tutor_sessions')
      .where('userId', '==', targetUid)

    if (lessonId) {
      queryRef = queryRef.where('lessonId', '==', lessonId)
    }

    const snap = await queryRef.limit(100).get()
    const docs = snap.docs.map((d) => d.data() as TutorSessionSummary)
    docs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    return docs.slice(0, Math.min(limit, 50))
  },
)

export const getTutorSession = onCall(
  { timeoutSeconds: 30, memory: '256MiB' },
  async (request): Promise<TutorSessionDetailResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.')
    }
    const uid = request.auth.uid
    const db = getFirestore()
    const { sessionId } = (request.data || {}) as { sessionId: string }
    if (!sessionId) {
      throw new HttpsError('invalid-argument', 'sessionId is required.')
    }

    const sessionDoc = await db.collection('tutor_sessions').doc(sessionId).get()
    if (!sessionDoc.exists) {
      throw new HttpsError('not-found', 'Tutor session not found.')
    }
    const session = sessionDoc.data() as TutorSessionSummary

    if (session.userId !== uid) {
      const userDoc = await db.collection('users').doc(uid).get()
      const role = userDoc.data()?.role
      if (role !== 'admin' && role !== 'staff') {
        const enrollmentSnap = await db
          .collection('enrollments')
          .where('mentorId', '==', uid)
          .where('studentId', '==', session.userId)
          .limit(1)
          .get()
        if (enrollmentSnap.empty) {
          throw new HttpsError('permission-denied', 'Not authorized.')
        }
      }
    }

    const [msgSnap, pagesSnap] = await Promise.all([
      db.collection('tutor_sessions').doc(sessionId).collection('messages').orderBy('createdAt', 'asc').get(),
      db.collection('tutor_sessions').doc(sessionId).collection('pages').orderBy('createdAt', 'desc').get(),
    ])

    return {
      session,
      messages: msgSnap.docs.map((d) => d.data() as TutorSessionMessageDoc),
      pages: pagesSnap.docs.map((d) => d.data() as TutorPageSnapshot),
    }
  },
)

export const saveTutorPage = onCall(
  { timeoutSeconds: 30, memory: '256MiB' },
  async (request): Promise<SaveTutorPageResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.')
    }
    const uid = request.auth.uid
    const db = getFirestore()
    const { sessionId, pageId, title, kind, content } = (request.data || {}) as {
      sessionId: string
      pageId?: string
      title: string
      kind: TutorPageKind
      content: string
    }
    if (!sessionId || !title || !content) {
      throw new HttpsError('invalid-argument', 'sessionId, title, and content are required.')
    }

    const sessionRef = db.collection('tutor_sessions').doc(sessionId)
    const sessionDoc = await sessionRef.get()
    if (!sessionDoc.exists || sessionDoc.data()?.userId !== uid) {
      throw new HttpsError('permission-denied', 'Cannot modify pages on this session.')
    }

    const resolvedPageId = pageId || `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const pageRef = sessionRef.collection('pages').doc(resolvedPageId)
    const existingPage = await pageRef.get()

    const pageData: TutorPageSnapshot = {
      id: resolvedPageId,
      title,
      kind: kind || 'notes',
      content,
      createdAt: existingPage.exists ? existingPage.data()?.createdAt : Date.now(),
      updatedAt: Date.now(),
    }

    await pageRef.set({ ...pageData, sessionId, userId: uid }, { merge: true })
    return { ok: true, page: pageData }
  },
)

export const saveTutorAnnotation = onCall(
  { timeoutSeconds: 30, memory: '256MiB' },
  async (request): Promise<SaveTutorAnnotationResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.')
    }
    const uid = request.auth.uid
    const db = getFirestore()
    const { sessionId, pageId, content } = (request.data || {}) as {
      sessionId: string
      pageId: string
      content: string
    }
    if (!sessionId || !pageId || !content) {
      throw new HttpsError('invalid-argument', 'sessionId, pageId, and content are required.')
    }

    const userDoc = await db.collection('users').doc(uid).get()
    const userData = userDoc.data() || {}
    const role = (userData.role as string) || 'student'
    const name = (userData.displayName as string) || (userData.name as string) || 'User'

    const annotationId = `ann_${Date.now()}`
    const annotation: TutorAnnotationDoc = {
      id: annotationId,
      pageId,
      authorUid: uid,
      authorName: name,
      authorRole: role,
      content,
      createdAt: Date.now(),
    }

    await db
      .collection('tutor_sessions')
      .doc(sessionId)
      .collection('pages')
      .doc(pageId)
      .collection('annotations')
      .doc(annotationId)
      .set(annotation)

    return { ok: true, annotation }
  },
)

export const deleteTutorSession = onCall(
  { timeoutSeconds: 30, memory: '256MiB' },
  async (request): Promise<DeleteTutorSessionResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.')
    }
    const uid = request.auth.uid
    const db = getFirestore()
    const { sessionId } = (request.data || {}) as { sessionId: string }
    if (!sessionId) {
      throw new HttpsError('invalid-argument', 'sessionId is required.')
    }

    const sessionRef = db.collection('tutor_sessions').doc(sessionId)
    const sessionDoc = await sessionRef.get()
    if (!sessionDoc.exists) return { ok: true }
    if (sessionDoc.data()?.userId !== uid) {
      throw new HttpsError('permission-denied', "Cannot delete another user's tutor session.")
    }

    const [messages, pages] = await Promise.all([
      sessionRef.collection('messages').get(),
      sessionRef.collection('pages').get(),
    ])

    const batch = db.batch()
    messages.docs.forEach((doc) => batch.delete(doc.ref))
    pages.docs.forEach((doc) => batch.delete(doc.ref))
    batch.delete(sessionRef)
    await batch.commit()

    return { ok: true }
  },
)

export const setTutorMemoryPreference = onCall(
  { timeoutSeconds: 30, memory: '256MiB' },
  async (request): Promise<SetTutorMemoryPreferenceResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.')
    }
    const uid = request.auth.uid
    const db = getFirestore()
    const { enabled } = (request.data || {}) as { enabled: boolean }

    await db.collection('tutor_memory').doc(uid).set(
      {
        uid,
        memoryEnabled: !!enabled,
        updatedAt: Date.now(),
      },
      { merge: true },
    )

    return { ok: true, memoryEnabled: !!enabled }
  },
)
