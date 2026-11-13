'use client'

import React, { useRef, useState } from 'react'

import type { Run } from '@/help/request'
import { BotCheckHelp } from '@/components/turnstile/BotCheckHelp'
import { useVisibleTurnstile } from '@/components/turnstile/useTurnstile'
import { TURNSTILE_FIELD } from '@/security/turnstile'
import { HONEYPOT_FIELD } from '@/utilities/honeypot'

import styles from './help.module.css'

// The same limits the server holds to (src/help/request.ts)
const MAX_FILES = 5
const MAX_BYTES = 4 * 1024 * 1024
const ACCEPT = 'image/*,.heic,.heif,application/pdf'

type Format = { b?: true; i?: true; h?: string }

/**
 * The details box as paragraphs of runs, the only shape the server takes: plain text, bold, italic
 * and links. Whatever else the browser put in the box (it differs between browsers) is read as
 * plain text, so nothing but those three ever leaves the page.
 */
const serialise = (root: HTMLElement): Run[][] => {
  const paragraphs: Run[][] = [[]]
  const current = () => paragraphs[paragraphs.length - 1]
  const walk = (node: Node, format: Format) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? ''
      if (t) current().push({ t, ...format })
      return
    }
    if (!(node instanceof HTMLElement)) return
    if (node.tagName === 'BR') {
      paragraphs.push([])
      return
    }
    const block = ['DIV', 'P', 'LI'].includes(node.tagName)
    if (block && current().length) paragraphs.push([])
    const next: Format = { ...format }
    const weight = node.style.fontWeight
    if (['B', 'STRONG'].includes(node.tagName) || weight === 'bold' || Number(weight) >= 600)
      next.b = true
    if (['I', 'EM'].includes(node.tagName) || node.style.fontStyle === 'italic') next.i = true
    const href = node.tagName === 'A' ? node.getAttribute('href') : null
    if (href) next.h = href
    node.childNodes.forEach((child) => walk(child, next))
    if (block && current().length) paragraphs.push([])
  }
  root.childNodes.forEach((child) => walk(child, {}))
  // Neighbouring runs with the same formatting become one
  return paragraphs.map((runs) =>
    runs.reduce<Run[]>((merged, run) => {
      const last = merged[merged.length - 1]
      if (last && last.b === run.b && last.i === run.i && last.h === run.h) last.t += run.t
      else merged.push({ ...run })
      return merged
    }, []),
  )
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

type Sent = { ticket: string; email: string; acknowledged: boolean }

export const HelpForm: React.FC<{ formToken: string }> = ({ formToken }) => {
  const [requestType, setRequestType] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [dropping, setDropping] = useState(false)
  const [empty, setEmpty] = useState(true)
  const [linking, setLinking] = useState(false)
  const [linkAddress, setLinkAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<Sent | null>(null)
  const area = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const bot = useVisibleTurnstile('help-request')

  const idLabel =
    requestType === 'artist'
      ? 'Artist ID'
      : requestType === 'partner'
        ? 'Trade Partner ID'
        : 'Artist / Trade Partner ID'

  const format = (command: 'bold' | 'italic') => {
    area.current?.focus()
    document.execCommand(command)
  }

  // The link address is typed in the toolbar, so the words chosen are remembered meanwhile
  const startLink = () => {
    const selection = window.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    if (!range || range.collapsed || !area.current?.contains(range.commonAncestorContainer)) {
      setError('Select the words to turn into a link first.')
      return
    }
    setError(null)
    savedRange.current = range.cloneRange()
    setLinkAddress('')
    setLinking(true)
  }

  const addLink = () => {
    const typed = linkAddress.trim()
    const range = savedRange.current
    setLinking(false)
    if (!typed || !range) return
    const href = /^(https?:|mailto:)/i.test(typed) ? typed : `https://${typed}`
    area.current?.focus()
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.execCommand('createLink', false, href)
    savedRange.current = null
  }

  // Pasted text arrives as plain text: formatting and pictures from elsewhere are left behind
  const paste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
  }

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return
    const next = [...files]
    for (const file of Array.from(incoming)) {
      if (
        !/^image\//.test(file.type) &&
        file.type !== 'application/pdf' &&
        !/\.hei[cf]$/i.test(file.name)
      ) {
        setError(`"${file.name}" is not a picture or a PDF.`)
        return
      }
      next.push(file)
    }
    if (next.length > MAX_FILES) return setError(`Attach up to ${MAX_FILES} files.`)
    if (next.reduce((sum, f) => sum + f.size, 0) > MAX_BYTES)
      return setError('The attachments come to more than 4 MB together.')
    setError(null)
    setFiles(next)
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (sending) return
    const details = area.current ? serialise(area.current) : []
    if (!details.some((runs) => runs.some((run) => run.t.trim()))) {
      setError('Describe your request.')
      area.current?.focus()
      return
    }
    if (bot.enabled && !bot.token) {
      setError('Please wait for the check below to finish, then send again.')
      return
    }
    const data = new FormData(event.currentTarget)
    data.set('details', JSON.stringify(details))
    data.set('formToken', formToken)
    data.delete('attachments')
    files.forEach((file) => data.append('attachments', file, file.name))
    if (bot.token) data.set(TURNSTILE_FIELD, bot.token)

    setSending(true)
    setError(null)
    try {
      const response = await fetch('/next/help/request', { method: 'POST', body: data })
      const body = (await response.json().catch(() => ({}))) as {
        ticket?: string
        acknowledged?: boolean
        message?: string
      }
      if (response.ok && body.ticket) {
        setSent({
          ticket: body.ticket,
          email: String(data.get('email') ?? ''),
          acknowledged: body.acknowledged !== false,
        })
        window.scrollTo({ top: 0 })
        return
      }
      if (response.ok) {
        setError('Your request could not be sent. Please reload the page and try again.')
      } else {
        setError(
          response.status === 413
            ? 'The attachments are too large. Please keep them under 4 MB together.'
            : (body.message ?? 'Something went wrong. Please try again.'),
        )
      }
      bot.reset()
    } catch {
      setError('Your request could not be sent. Check your connection and try again.')
      bot.reset()
    } finally {
      setSending(false)
    }
  }

  if (sent)
    return (
      <div className={styles.card} role="status">
        <p>Thank you. Your request has been received and logged.</p>
        <div className={styles.ticket}>
          <div className={styles.ticketLabel}>Ticket number</div>
          <div className={styles.ticketValue}>{sent.ticket}</div>
        </div>
        <p>
          {sent.acknowledged
            ? `A copy of your request is on its way to ${sent.email}. Please quote the ticket number in any correspondence about it.`
            : 'Please note the ticket number and quote it in any correspondence about this request.'}
        </p>
      </div>
    )

  return (
    <form className={styles.card} onSubmit={submit}>
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="help-type">
            Request type <span className={styles.req}>*</span>
          </label>
          <select
            className={styles.input}
            id="help-type"
            name="requestType"
            onChange={(e) => setRequestType(e.target.value)}
            required
            value={requestType}
          >
            <option value="">Select your request type</option>
            <option value="artist">I am an Artist</option>
            <option value="partner">I am a Trade Partner</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="help-nature">
            Nature of request <span className={styles.req}>*</span>
          </label>
          <select className={styles.input} defaultValue="" id="help-nature" name="nature" required>
            <option value="">Choose one</option>
            <option value="technical">Technical Issue / Inquiry</option>
            <option value="business">Business Inquiry</option>
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="help-email">
          Email address <span className={styles.req}>*</span>
        </label>
        <input
          autoComplete="email"
          className={styles.input}
          id="help-email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="help-id">
            {idLabel} <span className={styles.req}>*</span>
          </label>
          <input
            autoCapitalize="characters"
            autoComplete="off"
            className={styles.input}
            id="help-id"
            maxLength={40}
            name="memberCode"
            required
            type="text"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="help-name">
            Full name <span className={styles.req}>*</span>
          </label>
          <input
            autoComplete="name"
            className={styles.input}
            id="help-name"
            maxLength={120}
            name="name"
            required
            type="text"
          />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="help-device">
            Device
          </label>
          <input
            className={styles.input}
            id="help-device"
            maxLength={120}
            name="device"
            placeholder="e.g. Laptop, Phone, Tablet"
            type="text"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="help-browser">
            Browser
          </label>
          <input
            className={styles.input}
            id="help-browser"
            maxLength={120}
            name="browser"
            placeholder="e.g. Chrome, Safari, Edge"
            type="text"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.check}>
          <input name="clearedCache" type="checkbox" value="yes" />
          <span className={styles.fine}>
            I have already cleared my browser&rsquo;s cache and cookies (recommended first step).
          </span>
        </label>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="help-subject">
          Subject <span className={styles.fine}>(optional)</span>
        </label>
        <input
          className={styles.input}
          id="help-subject"
          maxLength={200}
          name="subject"
          type="text"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} id="help-details-label">
          Describe your request in detail <span className={styles.req}>*</span>
        </label>
        <div className={styles.editor}>
          <div aria-label="Formatting" className={styles.tools} role="toolbar">
            <button
              aria-label="Bold"
              className={styles.tool}
              onClick={() => format('bold')}
              onMouseDown={(e) => e.preventDefault()}
              type="button"
            >
              <b>B</b>
            </button>
            <button
              aria-label="Italic"
              className={styles.tool}
              onClick={() => format('italic')}
              onMouseDown={(e) => e.preventDefault()}
              type="button"
            >
              <i>I</i>
            </button>
            <button
              aria-pressed={linking}
              className={styles.tool}
              onClick={startLink}
              onMouseDown={(e) => e.preventDefault()}
              type="button"
            >
              Link
            </button>
            {linking && (
              <div className={styles.linkRow}>
                <input
                  aria-label="Link address"
                  autoFocus
                  className={styles.input}
                  onChange={(e) => setLinkAddress(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addLink()
                    }
                    if (e.key === 'Escape') setLinking(false)
                  }}
                  placeholder="https://"
                  type="url"
                  value={linkAddress}
                />
                <button className={styles.tool} onClick={addLink} type="button">
                  Add
                </button>
                <button className={styles.tool} onClick={() => setLinking(false)} type="button">
                  Cancel
                </button>
              </div>
            )}
          </div>
          <div
            aria-labelledby="help-details-label"
            aria-multiline="true"
            className={styles.area}
            contentEditable
            data-empty={empty}
            data-placeholder="Please share the details of your request here."
            onInput={(e) => setEmpty(!e.currentTarget.textContent?.trim())}
            onPaste={paste}
            ref={area}
            role="textbox"
            suppressContentEditableWarning
            tabIndex={0}
          />
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Attachments</span>
        <label
          className={`${styles.drop}${dropping ? ` ${styles.dropping}` : ''}`}
          onDragLeave={() => setDropping(false)}
          onDragOver={(e) => {
            e.preventDefault()
            setDropping(true)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDropping(false)
            addFiles(e.dataTransfer.files)
          }}
        >
          <input
            accept={ACCEPT}
            hidden
            multiple
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
            type="file"
          />
          Add files or drop them here
          <br />
          <span className={styles.fine}>Images, PDFs and screenshots, up to 4 MB in all</span>
        </label>
        {files.length > 0 && (
          <ul className={styles.files}>
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <span>
                  {file.name} <span className={styles.fine}>({megabytes(file.size)})</span>
                </span>
                <button
                  className={styles.remove}
                  onClick={() => setFiles(files.filter((_, i) => i !== index))}
                  type="button"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Hidden from people and from screen readers; bots fill it in */}
      <div aria-hidden className={styles.hidden}>
        <label htmlFor={HONEYPOT_FIELD}>Company website</label>
        <input autoComplete="off" id={HONEYPOT_FIELD} name={HONEYPOT_FIELD} tabIndex={-1} />
      </div>

      {bot.element && <div className={styles.field}>{bot.element}</div>}
      {bot.problem && <BotCheckHelp problem={bot.problem} email="hello@pjk.co.in" />}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button className={styles.submit} disabled={sending} type="submit">
        {sending ? 'Sending…' : 'Send Request'}
      </button>
    </form>
  )
}
