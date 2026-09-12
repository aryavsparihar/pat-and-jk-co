/**
 * Tiny builders for Lexical rich-text JSON, so seed content reads like prose.
 *   root(p('Hello'), h('h2', 'Title'), ul('One', 'Two'))
 * Inline *asterisks* become italics; [label](url) becomes a link.
 */

type Node = Record<string, unknown>

const base = { format: '', indent: 0, version: 1, direction: 'ltr' as const }

const textNode = (text: string, format = 0): Node => ({
  type: 'text',
  text,
  format, // 1 = bold, 2 = italic
  style: '',
  mode: 'normal',
  detail: 0,
  version: 1,
})

/** Parses *italic* and [link](url) spans into Lexical inline nodes. */
const inline = (text: string): Node[] => {
  const nodes: Node[] = []
  const pattern = /(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index! > last) nodes.push(textNode(text.slice(last, match.index)))
    const token = match[0]
    if (token.startsWith('*')) {
      nodes.push(textNode(token.slice(1, -1), 2))
    } else {
      const [, label, url] = token.match(/\[([^\]]+)\]\(([^)]+)\)/)!
      nodes.push({
        ...base,
        type: 'link',
        version: 3,
        fields: { linkType: 'custom', url, newTab: false },
        children: [textNode(label!)],
      })
    }
    last = match.index! + token.length
  }
  if (last < text.length) nodes.push(textNode(text.slice(last)))
  return nodes
}

export const p = (text: string): Node => ({
  ...base,
  type: 'paragraph',
  textFormat: 0,
  textStyle: '',
  children: inline(text),
})

export const h = (tag: 'h2' | 'h3' | 'h4', text: string): Node => ({
  ...base,
  type: 'heading',
  tag,
  children: inline(text),
})

export const ul = (...items: string[]): Node => ({
  ...base,
  type: 'list',
  listType: 'bullet',
  start: 1,
  tag: 'ul',
  children: items.map((item, i) => ({
    ...base,
    type: 'listitem',
    value: i + 1,
    children: inline(item),
  })),
})

export const root = (...children: Node[]) => ({
  root: {
    ...base,
    type: 'root',
    children,
  },
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RichTextValue = any
