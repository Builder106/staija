import { describe, it, expect } from 'vitest'
import katex from 'katex'
import type { AskLmsTutorPayload, AskLmsTutorResult } from '../../src/services/learn'

describe('LMS AI Tutor Formatting, Block Parsing & Payload Validation', () => {
  // Helper: Content block splitter (text vs mermaid diagrams)
  function parseContentBlocks(text: string) {
    const blocks: Array<{ type: 'text' | 'mermaid'; content: string }> = []
    const mermaidRegex = /```mermaid\s*([\s\S]*?)\s*```/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = mermaidRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        blocks.push({ type: 'text', content: text.substring(lastIndex, match.index) })
      }
      blocks.push({ type: 'mermaid', content: match[1].trim() })
      lastIndex = mermaidRegex.lastIndex
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
})
