import 'server-only'

import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib'

import type { AgreementDocument } from './documents'

/**
 * The agreement as the member signed it, as a PDF: the full text, word for word, with the signer's
 * execution block filled in from the record of the signing, and PAT & J.K. Co.'s lines (the DSC
 * signature and the date of approval) left blank for the officer who countersigns. Set in DejaVu
 * Serif, which has the rupee sign. Built from the same rich text the page shows, so the two match.
 */

type LexNode = {
  type: string
  tag?: string
  text?: string
  format?: number
  listType?: 'bullet' | 'number'
  value?: number
  children?: LexNode[]
}

type Run = { text: string; bold: boolean }

const A4 = { width: 595.28, height: 841.89 }
const MARGIN = { x: 56, top: 64, bottom: 64 }
const INK = rgb(0.086, 0.125, 0.102)
const MUTED = rgb(0.37, 0.4, 0.38)
const BODY = 9.5
const LEADING = 1.38

const fontDir = path.join(process.cwd(), 'src/agreements/fonts')

const textOf = (node: LexNode): string => node.text ?? (node.children ?? []).map(textOf).join('')

const runsOf = (node: LexNode): Run[] => {
  if (node.type === 'text')
    return [{ text: node.text ?? '', bold: Boolean((node.format ?? 0) & 1) }]
  if (node.type === 'linebreak') return [{ text: '\n', bold: false }]
  return (node.children ?? []).filter((c) => c.type !== 'list').flatMap(runsOf)
}

export type ExecutionValues = string[]

class Writer {
  page!: PDFPage
  y = 0
  pages: PDFPage[] = []
  constructor(
    private doc: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont,
  ) {
    this.newPage()
  }

  newPage() {
    this.page = this.doc.addPage([A4.width, A4.height])
    this.pages.push(this.page)
    this.y = A4.height - MARGIN.top
  }

  space(points: number) {
    this.y -= points
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN.bottom) this.newPage()
  }

  /** Wraps runs into lines inside [left, right], drawing them; returns nothing */
  runs(runs: Run[], { size = BODY, indent = 0, hanging = '', color = INK } = {}) {
    const left = MARGIN.x + indent
    const width = A4.width - MARGIN.x - left
    const lineHeight = size * LEADING
    // Words, keeping their font, splitting on spaces and forced breaks
    const words: { text: string; font: PDFFont; br?: boolean }[] = []
    for (const run of runs) {
      const font = run.bold ? this.bold : this.regular
      run.text.split(/(\n| +)/).forEach((piece) => {
        if (!piece) return
        if (piece === '\n') words.push({ text: '', font, br: true })
        else if (/^ +$/.test(piece)) words.push({ text: ' ', font })
        else words.push(...this.breakLong(piece, font, size, width))
      })
    }
    let line: typeof words = []
    let lineWidth = 0
    let first = true
    const flush = () => {
      while (line.length && line[line.length - 1].text === ' ') line.pop()
      this.ensure(lineHeight)
      this.y -= size
      if (first && hanging) {
        this.page.drawText(hanging, {
          x: left - this.regular.widthOfTextAtSize(hanging + ' ', size),
          y: this.y,
          size,
          font: this.regular,
          color,
        })
      }
      let x = left
      for (const word of line) {
        if (word.text) this.page.drawText(word.text, { x, y: this.y, size, font: word.font, color })
        x += word.font.widthOfTextAtSize(word.text, size)
      }
      this.y -= lineHeight - size
      line = []
      lineWidth = 0
      first = false
    }
    for (const word of words) {
      if (word.br) {
        flush()
        continue
      }
      if (word.text === ' ' && !line.length) continue
      const w = word.font.widthOfTextAtSize(word.text, size)
      if (lineWidth + w > width && line.length) flush()
      if (word.text === ' ' && !line.length) continue
      line.push(word)
      lineWidth += w
    }
    if (line.length || first) flush()
  }

  /** A word wider than the line (a long URL, a row of underscores) is split by character */
  private breakLong(text: string, font: PDFFont, size: number, width: number) {
    if (font.widthOfTextAtSize(text, size) <= width) return [{ text, font }]
    const parts: { text: string; font: PDFFont }[] = []
    let current = ''
    for (const char of text) {
      if (font.widthOfTextAtSize(current + char, size) > width) {
        parts.push({ text: current, font })
        current = ''
      }
      current += char
    }
    if (current) parts.push({ text: current, font })
    return parts
  }

  footer(left: string, right: (n: number, total: number) => string) {
    this.pages.forEach((page, i) => {
      page.drawText(left, { x: MARGIN.x, y: 32, size: 7, font: this.regular, color: MUTED })
      const text = right(i + 1, this.pages.length)
      page.drawText(text, {
        x: A4.width - MARGIN.x - this.regular.widthOfTextAtSize(text, 7),
        y: 32,
        size: 7,
        font: this.regular,
        color: MUTED,
      })
    })
  }
}

const HEADING_SIZE: Record<string, number> = { h2: 12, h3: 11, h4: 10 }

export const buildAgreementPdf = async ({
  agreement,
  values,
  memberCode,
  signedAtIst,
}: {
  agreement: AgreementDocument
  /** The signer's block, one value per agreement.executionLines entry, in order */
  values: ExecutionValues
  memberCode: string
  signedAtIst: string
}): Promise<Buffer> => {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(path.join(fontDir, 'DejaVuSerif.ttf')),
    readFile(path.join(fontDir, 'DejaVuSerif-Bold.ttf')),
  ])
  const regular = await doc.embedFont(regularBytes, { subset: true })
  const bold = await doc.embedFont(boldBytes, { subset: true })
  doc.setTitle(`${agreement.title} — ${memberCode}`)
  doc.setSubject(agreement.version)
  doc.setAuthor('PAT & J.K. Co.')
  doc.setCreator('pjk.co.in')
  doc.setProducer('pjk.co.in')
  doc.setCreationDate(new Date())
  doc.setModificationDate(new Date())

  const w = new Writer(doc, regular, bold)
  w.runs([{ text: agreement.title, bold: true }], { size: 14 })
  w.space(4)
  w.runs([{ text: `Last Updated: ${agreement.lastUpdated}`, bold: false }], { color: MUTED })
  w.runs(
    [
      {
        text: `Executed electronically by ${memberCode} at https://pjk.co.in/collaborate/${agreement.slug} on ${signedAtIst}. Pending Admin DSC Countersignature.`,
        bold: false,
      },
    ],
    { color: MUTED },
  )
  w.space(14)

  // The signer's block follows the paragraph that introduces it ("SIGNED AND ACCEPTED BY ...")
  let inSignerBlock = false
  let filled = 0
  const labels = agreement.executionLines

  const fillItem = (item: LexNode): Run[] | null => {
    const text = textOf(item).trim()
    const index = labels.findIndex((label) => text.startsWith(label))
    if (index < 0) return null
    filled++
    return [
      { text: `${labels[index]}: `, bold: true },
      { text: values[index] || '—', bold: false },
    ]
  }

  const list = (node: LexNode, depth: number) => {
    let number = 1
    for (const item of node.children ?? []) {
      if (item.type !== 'listitem') continue
      const nested = (item.children ?? []).filter((c) => c.type === 'list')
      const runs = (inSignerBlock && fillItem(item)) || runsOf(item)
      const hasText = runs.some((r) => r.text.trim())
      if (hasText) {
        const marker = node.listType === 'number' ? `${item.value ?? number}.` : '•'
        w.runs(runs, { indent: 18 + depth * 16, hanging: marker })
        w.space(3)
      }
      if (hasText || !nested.length) number++
      nested.forEach((n) => list(n, depth + 1))
    }
  }

  for (const node of agreement.text.root.children as LexNode[]) {
    if (node.type === 'heading') {
      const size = HEADING_SIZE[node.tag ?? 'h4'] ?? 10
      w.space(node.tag === 'h2' ? 14 : node.tag === 'h3' ? 9 : 5)
      w.runs([{ text: textOf(node), bold: true }], { size })
      w.space(3)
    } else if (node.type === 'list') {
      list(node, 0)
      inSignerBlock = false
      w.space(4)
    } else {
      const text = textOf(node)
      inSignerBlock = /^SIGNED AND ACCEPTED BY THE/.test(text.trim())
      if (text.trim()) w.runs(runsOf(node))
      w.space(6)
    }
  }
  if (filled !== labels.length) {
    throw new Error(`The execution block was not found in full (${filled} of ${labels.length})`)
  }

  w.footer(agreement.version, (n, total) => `${memberCode} · Page ${n} of ${total}`)
  return Buffer.from(await doc.save({ useObjectStreams: true }))
}
