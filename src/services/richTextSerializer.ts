/**
 * Bidirectional converter between Contentful's RichText document and
 * TipTap's ProseMirror-based document. The shapes are similar but
 * naming and link handling differ:
 *
 *   - Contentful blocks: document, paragraph, heading-1..6, hr,
 *     blockquote, ordered-list, unordered-list, list-item.
 *   - TipTap blocks:     doc, paragraph, heading (level: N),
 *                        horizontalRule, blockquote, orderedList,
 *                        bulletList, listItem.
 *
 *   - Contentful marks: bold, italic, underline, code (matches TipTap
 *     once you load extension-underline).
 *
 *   - Links are the awkward part. In TipTap, a link is a *mark* on
 *     a text node:
 *       { type: 'text', text: 'hi', marks: [{ type: 'link', attrs: { href } }] }
 *     In Contentful, a hyperlink is an *inline* that wraps text:
 *       { nodeType: 'hyperlink', data: { uri }, content: [{ nodeType: 'text', value, marks } ] }
 *     Conversion has to flatten/group accordingly.
 *
 * Embedded entries/assets in the body and table support are
 * intentionally not handled — Phase 1.5 ships without inline embeds in
 * lesson bodies. Add when needed.
 */

import {
  BLOCKS,
  INLINES,
  MARKS,
  type Block,
  type Document,
  type Inline,
  type Mark,
  type Node,
  type Text,
  type TopLevelBlock,
} from '@contentful/rich-text-types';

// TipTap / ProseMirror types are loose JSON. We keep a local minimal
// shape that's sufficient for the serializer.
export interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface TipTapTextNode {
  type: 'text';
  text: string;
  marks?: TipTapMark[];
}
export interface TipTapBlockNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: TipTapMark[];
}
export type TipTapNode = TipTapTextNode | TipTapBlockNode;

export interface TipTapDoc {
  type: 'doc';
  content: TipTapNode[];
}

// ---------- Contentful → TipTap ----------

const HEADING_LEVELS: Record<string, number> = {
  [BLOCKS.HEADING_1]: 1,
  [BLOCKS.HEADING_2]: 2,
  [BLOCKS.HEADING_3]: 3,
  [BLOCKS.HEADING_4]: 4,
  [BLOCKS.HEADING_5]: 5,
  [BLOCKS.HEADING_6]: 6,
};

export function contentfulToTipTap(doc: Document | undefined | null): TipTapDoc {
  if (!doc || !doc.content) return { type: 'doc', content: [{ type: 'paragraph' }] };
  const out: TipTapNode[] = [];
  for (const node of doc.content) {
    const converted = convertCfNode(node);
    if (converted) out.push(...converted);
  }
  // TipTap requires at least one block; an empty doc breaks the editor.
  if (out.length === 0) out.push({ type: 'paragraph' });
  return { type: 'doc', content: out };
}

function convertCfNode(node: Node): TipTapNode[] | null {
  if (isText(node)) {
    return [convertCfText(node)];
  }

  // Inline hyperlink → flatten its text children, applying a `link`
  // mark to each. Multi-paragraph hyperlinks aren't allowed in
  // Contentful so we don't have to worry about block boundaries.
  if (node.nodeType === INLINES.HYPERLINK) {
    const uri = (node as Inline).data?.uri ?? '';
    const out: TipTapTextNode[] = [];
    for (const child of (node as Inline).content) {
      if (isText(child)) {
        const t = convertCfText(child);
        const linkMark: TipTapMark = { type: 'link', attrs: { href: uri } };
        t.marks = [...(t.marks ?? []), linkMark];
        out.push(t);
      }
    }
    return out;
  }

  // Block-level nodes.
  const block = node as Block;
  if (block.nodeType === BLOCKS.PARAGRAPH) {
    return [{ type: 'paragraph', content: convertChildren(block.content) }];
  }
  if (block.nodeType in HEADING_LEVELS) {
    return [
      {
        type: 'heading',
        attrs: { level: HEADING_LEVELS[block.nodeType] },
        content: convertChildren(block.content),
      },
    ];
  }
  if (block.nodeType === BLOCKS.UL_LIST) {
    return [{ type: 'bulletList', content: convertChildren(block.content) }];
  }
  if (block.nodeType === BLOCKS.OL_LIST) {
    return [{ type: 'orderedList', content: convertChildren(block.content) }];
  }
  if (block.nodeType === BLOCKS.LIST_ITEM) {
    return [{ type: 'listItem', content: convertChildren(block.content) }];
  }
  if (block.nodeType === BLOCKS.QUOTE) {
    return [{ type: 'blockquote', content: convertChildren(block.content) }];
  }
  if (block.nodeType === BLOCKS.HR) {
    return [{ type: 'horizontalRule' }];
  }

  // Unknown / unsupported (embeds, tables) — drop silently. The editor
  // will skip them rather than crash.
  return null;
}

function convertChildren(content: Node[] | undefined): TipTapNode[] {
  if (!content) return [];
  const out: TipTapNode[] = [];
  for (const c of content) {
    const converted = convertCfNode(c);
    if (converted) out.push(...converted);
  }
  return out;
}

function convertCfText(node: Text): TipTapTextNode {
  const marks = (node.marks ?? []).map(m => ({ type: m.type })) as TipTapMark[];
  const tt: TipTapTextNode = { type: 'text', text: node.value };
  if (marks.length > 0) tt.marks = marks;
  return tt;
}

function isText(node: Node): node is Text {
  return node.nodeType === 'text';
}

// ---------- TipTap → Contentful ----------

const LEVEL_TO_HEADING: Record<number, BLOCKS> = {
  1: BLOCKS.HEADING_1,
  2: BLOCKS.HEADING_2,
  3: BLOCKS.HEADING_3,
  4: BLOCKS.HEADING_4,
  5: BLOCKS.HEADING_5,
  6: BLOCKS.HEADING_6,
};

export function tipTapToContentful(doc: TipTapDoc | null | undefined): Document {
  if (!doc || !doc.content || doc.content.length === 0) {
    return emptyDocument();
  }
  const content: TopLevelBlock[] = [];
  for (const node of doc.content) {
    const converted = convertTtNode(node);
    if (converted) content.push(...(converted as TopLevelBlock[]));
  }
  return {
    nodeType: BLOCKS.DOCUMENT,
    data: {},
    content,
  };
}

export function emptyDocument(): Document {
  return {
    nodeType: BLOCKS.DOCUMENT,
    data: {},
    content: [
      {
        nodeType: BLOCKS.PARAGRAPH,
        data: {},
        content: [],
      } as TopLevelBlock,
    ],
  };
}

function convertTtNode(node: TipTapNode): (Block | Inline)[] | null {
  if (isTtText(node)) {
    // A text node at the doc level shouldn't happen in TipTap, but if
    // it does we wrap it in a paragraph rather than crashing.
    return [
      {
        nodeType: BLOCKS.PARAGRAPH,
        data: {},
        content: convertTtTextWithLink(node),
      } as Block,
    ];
  }

  const block = node as TipTapBlockNode;
  switch (block.type) {
    case 'paragraph':
      return [
        {
          nodeType: BLOCKS.PARAGRAPH,
          data: {},
          content: convertInlineChildren(block.content),
        } as Block,
      ];
    case 'heading': {
      const level = (block.attrs?.level as number) ?? 1;
      const tag = LEVEL_TO_HEADING[level] ?? BLOCKS.HEADING_2;
      return [
        {
          nodeType: tag,
          data: {},
          content: convertInlineChildren(block.content),
        } as Block,
      ];
    }
    case 'bulletList':
      return [
        {
          nodeType: BLOCKS.UL_LIST,
          data: {},
          content: convertBlockChildren(block.content),
        } as Block,
      ];
    case 'orderedList':
      return [
        {
          nodeType: BLOCKS.OL_LIST,
          data: {},
          content: convertBlockChildren(block.content),
        } as Block,
      ];
    case 'listItem':
      return [
        {
          nodeType: BLOCKS.LIST_ITEM,
          data: {},
          content: convertBlockChildren(block.content),
        } as Block,
      ];
    case 'blockquote':
      return [
        {
          nodeType: BLOCKS.QUOTE,
          data: {},
          content: convertBlockChildren(block.content),
        } as Block,
      ];
    case 'horizontalRule':
      return [
        {
          nodeType: BLOCKS.HR,
          data: {},
          content: [],
        } as Block,
      ];
    default:
      // codeBlock and other unsupported types fall through; drop them
      // silently so a paste of an unsupported node doesn't crash the
      // serializer.
      return null;
  }
}

function convertBlockChildren(content: TipTapNode[] | undefined): Block[] {
  if (!content) return [];
  const out: Block[] = [];
  for (const c of content) {
    const converted = convertTtNode(c);
    if (converted) out.push(...(converted as Block[]));
  }
  return out;
}

function convertInlineChildren(content: TipTapNode[] | undefined): (Text | Inline)[] {
  if (!content) return [];
  const out: (Text | Inline)[] = [];
  for (const c of content) {
    if (isTtText(c)) {
      out.push(...convertTtTextWithLink(c));
    } else {
      // Block child inside an inline context — shouldn't happen but
      // we recurse defensively.
      const sub = convertTtNode(c);
      if (sub) out.push(...(sub as Inline[]));
    }
  }
  return out;
}

// Convert a TipTap text node, splitting off the link mark into a
// Contentful hyperlink wrapper if present.
function convertTtTextWithLink(node: TipTapTextNode): (Text | Inline)[] {
  const linkMark = node.marks?.find(m => m.type === 'link');
  const otherMarks = (node.marks ?? []).filter(m => m.type !== 'link');
  const cfMarks: Mark[] = otherMarks
    .map(m => ({ type: mapMarkType(m.type) }))
    .filter(m => !!m.type)
    .map(m => ({ type: m.type as MARKS }));

  const text: Text = {
    nodeType: 'text',
    value: node.text,
    marks: cfMarks,
    data: {},
  };

  if (linkMark) {
    const href = (linkMark.attrs?.href as string) ?? '';
    return [
      {
        nodeType: INLINES.HYPERLINK,
        data: { uri: href },
        content: [text],
      } as Inline,
    ];
  }
  return [text];
}

function mapMarkType(type: string): MARKS | '' {
  switch (type) {
    case 'bold':
    case 'strong':
      return MARKS.BOLD;
    case 'italic':
    case 'em':
      return MARKS.ITALIC;
    case 'underline':
      return MARKS.UNDERLINE;
    case 'code':
      return MARKS.CODE;
    default:
      return '';
  }
}

function isTtText(node: TipTapNode): node is TipTapTextNode {
  return node.type === 'text';
}
