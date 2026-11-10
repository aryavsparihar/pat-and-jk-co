/** The text of a rich-text node and everything inside it */
export const nodeText = (node: unknown): string => {
  const n = node as { text?: string; children?: unknown[] }
  if (typeof n?.text === 'string') return n.text
  return (n?.children ?? []).map(nodeText).join('')
}

/** "5. Technical Security Safeguards" -> "5-technical-security-safeguards", for links to a heading */
export const headingId = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
