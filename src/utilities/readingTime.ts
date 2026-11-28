type Node = { text?: unknown; children?: unknown }

const countWords = (node: unknown): number => {
  if (!node || typeof node !== 'object') return 0
  const { text, children } = node as Node
  const own = typeof text === 'string' ? text.split(/\s+/).filter(Boolean).length : 0
  return own + (Array.isArray(children) ? children.reduce((n, c) => n + countWords(c), 0) : 0)
}

/** Minutes to read a rich-text body, at 200 words a minute, never less than one */
export const readingMinutes = (content: unknown): number => {
  const root = content && typeof content === 'object' ? (content as { root?: unknown }).root : null
  return Math.max(1, Math.round(countWords(root) / 200))
}
