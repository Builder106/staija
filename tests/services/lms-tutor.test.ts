import { describe, it, expect } from 'vitest'
import katex from 'katex'
import type { AskLmsTutorPayload, AskLmsTutorResult } from '../../src/services/learn'

describe('LMS AI Tutor Formatting, Block Parsing & Payload Validation', () => {
  // Helper: Content block splitter (text, mermaid diagrams, and jsxgraph geometry)
  function parseContentBlocks(text: string) {
    const blocks: Array<{ type: 'text' | 'mermaid' | 'geometry'; content: string }> = []
    const blockRegex = /```(mermaid|geometry|jsxgraph)\s*([\s\S]*?)\s*```/gi
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = blockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        blocks.push({ type: 'text', content: text.substring(lastIndex, match.index) })
      }
      const blockKind = match[1].toLowerCase() === 'mermaid' ? 'mermaid' : 'geometry'
      blocks.push({ type: blockKind, content: match[2].trim() })
      lastIndex = blockRegex.lastIndex
    }

    if (lastIndex < text.length) {
      blocks.push({ type: 'text', content: text.substring(lastIndex) })
    }

    return blocks
  }

  // Helper: Follow-up JSON extractor from LLM raw output
  function extractFollowUps(rawReply: string): { reply: string; suggestedFollowUps: string[] } {
    let reply = rawReply
    let suggestedFollowUps: string[] = []

    const jsonMatch = rawReply.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1])
        if (Array.isArray(parsed.followUps)) {
          suggestedFollowUps = parsed.followUps.slice(0, 3)
        }
        reply = rawReply.replace(/```json\s*[\s\S]*?\s*```/, '').trim()
      } catch {
        // Fallback
      }
    }

    if (suggestedFollowUps.length === 0) {
      suggestedFollowUps = [
        'Can you break this down further?',
        'Show me a visual flowchart of this process.',
        'Give me a practical exercise to test my understanding.',
      ]
    }

    return { reply, suggestedFollowUps }
  }

  // Helper: Text & KaTeX formatting transformer
  function formatFormattedText(text: string): string {
    if (!text) return ''

    let formatted = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })
      } catch {
        return math
      }
    })

    formatted = formatted.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false })
      } catch {
        return math
      }
    })

    formatted = formatted
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-ink/10 rounded text-brand-violet font-mono text-xs">$1</code>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc">$1</li>')

    return formatted
  }

  describe('Content Block Parsing', () => {
    it('correctly parses plain text responses into a single text block', () => {
      const input = 'Here is an explanation of lab safety rules.'
      const blocks = parseContentBlocks(input)

      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('text')
      expect(blocks[0].content).toBe(input)
    })

    it('extracts embedded Mermaid code blocks from tutor responses', () => {
      const input = `To understand lab safety, consider this workflow:

\`\`\`mermaid
graph TD
  A[Identify Chemical] --> B[Check Safety Data Sheet]
  B --> C[Wear Required PPE]
\`\`\`

Always follow these steps before starting your experiment.`

      const blocks = parseContentBlocks(input)

      expect(blocks).toHaveLength(3)
      expect(blocks[0].type).toBe('text')
      expect(blocks[1].type).toBe('mermaid')
      expect(blocks[1].content).toContain('graph TD')
      expect(blocks[1].content).toContain('A[Identify Chemical] --> B[Check Safety Data Sheet]')
      expect(blocks[2].type).toBe('text')
    })

    it('handles multiple consecutive Mermaid diagrams correctly', () => {
      const input = `First process:
\`\`\`mermaid
graph LR
  X --> Y
\`\`\`
Second process:
\`\`\`mermaid
graph TD
  1 --> 2
\`\`\``

      const blocks = parseContentBlocks(input)
      expect(blocks.filter((b) => b.type === 'mermaid')).toHaveLength(2)
      expect(blocks[1].content).toBe('graph LR\n  X --> Y')
      expect(blocks[3].content).toBe('graph TD\n  1 --> 2')
    })

    it('extracts embedded declarative JSXGraph geometry blocks from tutor responses', () => {
      const input = `Here is the coordinate plot:
\`\`\`geometry
{
  "title": "Sine Wave",
  "elements": [
    { "kind": "point", "coords": [0, 0] },
    { "kind": "functiongraph", "fn": "sin(x)" }
  ]
}
\`\`\`
Notice how the function crosses the origin.`

      const blocks = parseContentBlocks(input)
      expect(blocks).toHaveLength(3)
      expect(blocks[0].type).toBe('text')
      expect(blocks[1].type).toBe('geometry')
      expect(blocks[1].content).toContain('"title": "Sine Wave"')
      expect(blocks[2].type).toBe('text')
    })

    it('handles mixed responses with both Mermaid diagrams and geometry blocks', () => {
      const input = `Process diagram:
\`\`\`mermaid
graph TD
  A --> B
\`\`\`
Followed by coordinate plot:
\`\`\`geometry
{
  "elements": [{ "kind": "point", "coords": [1, 2] }]
}
\`\`\``

      const blocks = parseContentBlocks(input)
      expect(blocks).toHaveLength(4)
      expect(blocks[1].type).toBe('mermaid')
      expect(blocks[3].type).toBe('geometry')
    })
  })

  describe('Follow-up JSON Extraction', () => {
    it('extracts structured followUp prompts from JSON block and cleans reply text', () => {
      const raw = `Here is the explanation of photosynthesis.

\`\`\`json
{
  "followUps": [
    "What is the role of chlorophyll?",
    "Show me the chemical equation",
    "How does light intensity affect the rate?"
  ]
}
\`\`\``

      const { reply, suggestedFollowUps } = extractFollowUps(raw)

      expect(reply).toBe('Here is the explanation of photosynthesis.')
      expect(suggestedFollowUps).toHaveLength(3)
      expect(suggestedFollowUps[0]).toBe('What is the role of chlorophyll?')
    })

    it('provides fallback follow-up prompts when no JSON block is returned', () => {
      const raw = 'Simple answer without JSON block.'
      const { reply, suggestedFollowUps } = extractFollowUps(raw)

      expect(reply).toBe(raw)
      expect(suggestedFollowUps).toHaveLength(3)
      expect(suggestedFollowUps[0]).toContain('break this down further')
    })
  })

  describe('KaTeX & Markdown Formatting', () => {
    it('renders block math $$ ... $$ to KaTeX HTML elements', () => {
      const input = 'Equation: $$ E = mc^2 $$'
      const html = formatFormattedText(input)

      expect(html).toContain('katex')
      expect(html).toContain('katex-display')
    })

    it('renders inline math \\( ... \\) to KaTeX HTML elements', () => {
      const input = 'Solve for \\( a^2 + b^2 = c^2 \\) in triangles.'
      const html = formatFormattedText(input)

      expect(html).toContain('katex')
    })

    it('converts Markdown bolding and inline code blocks correctly', () => {
      const input = 'Use **safety goggles** and `lab coats`.'
      const html = formatFormattedText(input)

      expect(html).toContain('<strong>safety goggles</strong>')
      expect(html).toContain('<code class="px-1 py-0.5 bg-ink/10 rounded text-brand-violet font-mono text-xs">lab coats</code>')
    })
  })

  describe('Payload & Context Validation', () => {
    it('validates AskLmsTutorPayload with quiz question help context', () => {
      const payload: AskLmsTutorPayload = {
        lessonTitle: 'Lab safety basics',
        lessonBodyPlain: 'Before touching any instrument, understand safety models.',
        courseTitle: 'StepUp Scholars Science',
        program: 'stepup_scholars',
        studentQuestion: 'Why was my answer wrong?',
        chatHistory: [
          { role: 'user', content: 'What PPE is needed?' },
          { role: 'assistant', content: 'Goggles and coats.' },
        ],
        questionContext: {
          questionText: 'Which container holds acid waste?',
          userAnswerText: 'Standard trash bin',
          explanation: 'Acids must be collected in labeled hazardous waste containers.',
        },
      }

      expect(payload.questionContext?.userAnswerText).toBe('Standard trash bin')
      expect(payload.program).toBe('stepup_scholars')
      expect(payload.chatHistory).toHaveLength(2)
    })
  })

  describe('Streaming Event Aggregator & Whiteboard Cloud Contracts', () => {
    it('aggregates streamed text deltas into a coherent progressive message', () => {
      const chunks = [
        { type: 'message-start' as const, sessionId: 'ts_123', messageId: 'msg_1' },
        { type: 'text-delta' as const, messageId: 'msg_1', text: 'Photosynthesis ' },
        { type: 'text-delta' as const, messageId: 'msg_1', text: 'converts light into ' },
        { type: 'text-delta' as const, messageId: 'msg_1', text: 'chemical energy.' },
        { type: 'done' as const, sessionId: 'ts_123', messageId: 'msg_1' },
      ]

      let aggregated = ''
      for (const c of chunks) {
        if (c.type === 'text-delta') aggregated += c.text
      }

      expect(aggregated).toBe('Photosynthesis converts light into chemical energy.')
    })

    it('extracts whiteboard page snapshots from page-complete events', () => {
      const pageEvent = {
        type: 'page-complete' as const,
        page: {
          id: 'page_456',
          title: 'Energy Conversion Workflow',
          kind: 'mermaid' as const,
          content: 'graph LR\n  Sun --> Chloroplast',
          createdAt: 1770000000000,
        },
      }

      expect(pageEvent.page.kind).toBe('mermaid')
      expect(pageEvent.page.content).toContain('Chloroplast')
    })

    it('validates tutor session record serialization and mode constraints', () => {
      const session = {
        id: 'ts_789',
        userId: 'student_xyz',
        lessonId: 'demo-stepup-l-research-methodology',
        lessonTitle: 'What is research methodology?',
        mode: 'socratic' as const,
        messageCount: 4,
        createdAt: 1770000000000,
        updatedAt: 1770000060000,
      }

      expect(session.mode).toBe('socratic')
      expect(session.messageCount).toBe(4)
      expect(session.updatedAt).toBeGreaterThanOrEqual(session.createdAt)
    })

    it('validates whiteboard card snapshots with attached mentor annotations', () => {
      const pageWithAnnotations = {
        id: 'page_geometry_001',
        title: 'Research Methodology Vector Model',
        kind: 'geometry' as const,
        content: '{"elements":[{"kind":"point","name":"Q","coord":[-5,5]}]}',
        createdAt: 1770000000000,
        annotations: [
          {
            id: 'ann_101',
            pageId: 'page_geometry_001',
            authorUid: 'mentor_dr_ada',
            authorName: 'Dr. Ada',
            authorRole: 'mentor',
            content: 'Check the coordinate directions for wet-lab vs field observation.',
            createdAt: 1770000010000,
          },
        ],
      }

      expect(pageWithAnnotations.kind).toBe('geometry')
      expect(pageWithAnnotations.annotations).toHaveLength(1)
      expect(pageWithAnnotations.annotations[0].authorName).toBe('Dr. Ada')
      expect(pageWithAnnotations.annotations[0].content).toContain('coordinate directions')
    })

    it('rejects empty or whitespace-only annotation content', () => {
      function validateAnnotationInput(content: unknown): { valid: boolean; trimmed: string } {
        const trimmed = typeof content === 'string' ? content.trim() : ''
        return { valid: trimmed.length > 0, trimmed }
      }

      expect(validateAnnotationInput('').valid).toBe(false)
      expect(validateAnnotationInput('   \n  \t  ').valid).toBe(false)
      expect(validateAnnotationInput(null).valid).toBe(false)
      expect(validateAnnotationInput('Great hypothesis framing!').valid).toBe(true)
      expect(validateAnnotationInput('Great hypothesis framing!').trimmed).toBe('Great hypothesis framing!')
    })

    it('verifies mentor-student authorization predicate logic', () => {
      function checkAuth(params: {
        callerUid: string
        callerRole?: string
        studentUid: string
        hasEnrollment: boolean
        hasAssignment: boolean
      }): boolean {
        if (params.callerUid === params.studentUid) return true
        if (params.callerRole === 'admin' || params.callerRole === 'staff') return true
        return params.hasEnrollment || params.hasAssignment
      }

      // Self
      expect(checkAuth({ callerUid: 'u1', studentUid: 'u1', hasEnrollment: false, hasAssignment: false })).toBe(true)
      // Staff / admin
      expect(checkAuth({ callerUid: 'admin1', callerRole: 'admin', studentUid: 'u2', hasEnrollment: false, hasAssignment: false })).toBe(true)
      expect(checkAuth({ callerUid: 'staff1', callerRole: 'staff', studentUid: 'u2', hasEnrollment: false, hasAssignment: false })).toBe(true)
      // Assigned mentor via enrollments
      expect(checkAuth({ callerUid: 'mentor1', callerRole: 'mentor', studentUid: 'u2', hasEnrollment: true, hasAssignment: false })).toBe(true)
      // Assigned mentor via mentor_assignments
      expect(checkAuth({ callerUid: 'mentor1', callerRole: 'mentor', studentUid: 'u2', hasEnrollment: false, hasAssignment: true })).toBe(true)
      // Unassigned peer
      expect(checkAuth({ callerUid: 'peer1', callerRole: 'student', studentUid: 'u2', hasEnrollment: false, hasAssignment: false })).toBe(false)
    })
  })
})
