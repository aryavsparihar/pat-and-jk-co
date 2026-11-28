'use client'

import React, { useRef, useState } from 'react'

import { BotCheckHelp } from '@/components/turnstile/BotCheckHelp'
import { type BotCheckProblem, useTurnstile } from '@/components/turnstile/useTurnstile'
import {
  ACCEPT,
  allowedName,
  CONTACT_ERRORS,
  FILE_MAX_BYTES,
  FILES_MAX,
  MESSAGE_MAX,
  NAME_MAX,
  SENT_MESSAGE,
  tooLarge,
  wrongType,
} from '@/contact/rules'
import { BUYING_NOTE, type TopicNote, TOPIC_GROUPS, topicFor } from '@/contact/topics'
import { TURNSTILE_FIELD } from '@/security/turnstile'
import { HONEYPOT_FIELD } from '@/utilities/honeypot'

/**
 * The contact form of the founder's design (Contact.html; his brief, sections 8 and 12): name,
 * email, what it is about (the subject decides the inbox), the message, and up to three files.
 *
 * The browser's own messages are replaced with the founder's wording (setCustomValidity), so
 * they read the same in every browser. Files travel in parts after the message
 * (src/contact/flow.ts), each part small enough for one request.
 */

type Errors = Partial<Record<'name' | 'email' | 'about' | 'message' | 'files', string>>

const megabytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** The founder's line for an empty or malformed field, set as the browser's own message */
const browserMessage = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
  el.setCustomValidity('')
  if (el.validity.valueMissing)
    el.setCustomValidity(el.name === 'about' ? CONTACT_ERRORS.about : CONTACT_ERRORS.required)
  else if (el.validity.typeMismatch) el.setCustomValidity(CONTACT_ERRORS.email)
}

const Note: React.FC<{ note: TopicNote }> = ({ note }) => (
  <>
    {note.before}
    {note.link && <a href={note.link.href}>{note.link.label}</a>}
    {note.after}
  </>
)

/** Why a chosen file cannot go, in the founder's words; null if it can */
const fileProblem = (file: File) =>
  !allowedName(file.name)
    ? wrongType(file.name)
    : file.size > FILE_MAX_BYTES
      ? tooLarge(file.name)
      : null

type Post = { ok: boolean; status: number; data: Record<string, unknown> }

const post = async (
  url: string,
  body: BodyInit,
  headers: Record<string, string>,
): Promise<Post> => {
  const response = await fetch(url, { method: 'POST', body, headers, credentials: 'same-origin' })
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: response.ok, status: response.status, data }
}

export const ContactForm: React.FC<{ about: string; formToken: string }> = ({
  about: initialAbout,
  formToken,
}) => {
  const [about, setAbout] = useState(initialAbout)
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<Errors>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [botProblem, setBotProblem] = useState<BotCheckProblem | null>(null)
  const { element: botCheck, getToken } = useTurnstile('contact')
  const picker = useRef<HTMLInputElement>(null)

  const topic = topicFor(about)

  const addFiles = (chosen: FileList | null) => {
    if (!chosen?.length) return
    const next = [...files, ...Array.from(chosen)]
    if (next.length > FILES_MAX) {
      setErrors((e) => ({ ...e, files: CONTACT_ERRORS.tooMany }))
      return
    }
    const wrong = next.map(fileProblem).find(Boolean)
    setErrors((e) => ({ ...e, files: wrong ?? undefined }))
    if (!wrong) setFiles(next)
  }

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    for (const el of Array.from(form.elements)) {
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      )
        browserMessage(el)
    }
    if (!form.reportValidity()) return
    const data = new FormData(form)

    setProblem(null)
    setErrors({})
    setBotProblem(null)
    setSending(true)
    try {
      const human = await getToken()
      if (human.problem) {
        setBotProblem(human.problem)
        return
      }
      const started = await post(
        '/next/contact',
        JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          about: data.get('about'),
          message: data.get('message'),
          files: files.map((f) => ({ name: f.name, size: f.size })),
          formToken,
          [HONEYPOT_FIELD]: data.get(HONEYPOT_FIELD) ?? '',
          ...(human.token ? { [TURNSTILE_FIELD]: human.token } : {}),
        }),
        { 'Content-Type': 'application/json' },
      )
      if (!started.ok) {
        setErrors((started.data.errors as Errors) ?? {})
        setProblem(String(started.data.message ?? CONTACT_ERRORS.failed))
        return
      }
      if (started.data.sent) {
        setSent(true)
        return
      }

      // The files, part by part, then the message goes
      const id = Number(started.data.id)
      const token = String(started.data.token)
      const partBytes = Number(started.data.partBytes)
      for (const [index, file] of files.entries()) {
        const parts = Math.ceil(file.size / partBytes)
        for (let part = 0; part < parts; part++) {
          setProgress(
            parts > 1
              ? `Sending “${file.name}”: part ${part + 1} of ${parts}…`
              : `Sending “${file.name}”…`,
          )
          const chunk = file.slice(part * partBytes, (part + 1) * partBytes)
          const result = await post(
            `/next/contact/part?id=${id}&file=${index}&part=${part}`,
            chunk,
            { 'Content-Type': 'application/octet-stream', 'X-Upload-Token': token },
          )
          if (!result.ok) {
            setErrors((result.data.errors as Errors) ?? {})
            setProblem(String(result.data.message ?? CONTACT_ERRORS.failed))
            return
          }
        }
      }
      setProgress('Sending your message…')
      const finished = await post('/next/contact/finish', JSON.stringify({ id, token }), {
        'Content-Type': 'application/json',
      })
      if (!finished.ok) {
        setErrors((finished.data.errors as Errors) ?? {})
        setProblem(String(finished.data.message ?? CONTACT_ERRORS.failed))
        return
      }
      setSent(true)
    } catch {
      setProblem(CONTACT_ERRORS.offline)
    } finally {
      setSending(false)
      setProgress(null)
    }
  }

  if (sent) {
    return (
      <div className="border border-[#c7d3ca] bg-[#eef2ec] px-7 py-6" role="status">
        <p className="house-small mb-1.5 text-[#2f5a42]">Message sent</p>
        <p className="m-0 text-lg leading-relaxed">{SENT_MESSAGE}</p>
      </div>
    )
  }

  const describedBy = (name: keyof Errors, ...more: string[]) =>
    [...more, errors[name] && `contact-${name}-error`].filter(Boolean).join(' ') || undefined
  const fieldError = (name: keyof Errors) =>
    errors[name] ? (
      <p className="mt-2 text-base italic text-destructive" id={`contact-${name}-error`}>
        {errors[name]}
      </p>
    ) : null

  return (
    <form className="contact-form flex flex-col gap-7" noValidate onSubmit={send}>
      <div className="flex flex-wrap gap-7">
        <div className="min-w-0 flex-[1_1_200px]">
          <label className="contact-label" htmlFor="contact-name">
            Name *
          </label>
          <input
            aria-describedby={describedBy('name')}
            aria-invalid={errors.name ? true : undefined}
            autoComplete="name"
            className="contact-input"
            id="contact-name"
            maxLength={NAME_MAX}
            name="name"
            onInput={(e) => browserMessage(e.currentTarget)}
            required
            type="text"
          />
          {fieldError('name')}
        </div>
        <div className="min-w-0 flex-[1_1_200px]">
          <label className="contact-label" htmlFor="contact-email">
            Email *
          </label>
          <input
            aria-describedby={describedBy('email')}
            aria-invalid={errors.email ? true : undefined}
            autoComplete="email"
            className="contact-input"
            id="contact-email"
            maxLength={254}
            name="email"
            onInput={(e) => browserMessage(e.currentTarget)}
            required
            type="email"
          />
          {fieldError('email')}
        </div>
      </div>

      <div>
        <p className="contact-note mb-[18px]">
          <Note note={BUYING_NOTE} />
        </p>
        <label className="contact-label" htmlFor="contact-about">
          I’m writing about *
        </label>
        <div className="relative">
          <select
            aria-describedby={describedBy('about', topic?.note ? 'contact-about-note' : '')}
            aria-invalid={errors.about ? true : undefined}
            className="contact-input contact-select"
            id="contact-about"
            name="about"
            onChange={(e) => {
              setAbout(e.target.value)
              browserMessage(e.currentTarget)
            }}
            required
            value={about}
          >
            <option disabled value="">
              Please choose…
            </option>
            {TOPIC_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.topics.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <svg
            aria-hidden
            className="pointer-events-none absolute right-1 top-[19px]"
            fill="none"
            height="8"
            stroke="currentColor"
            strokeWidth="1.4"
            viewBox="0 0 12 8"
            width="12"
          >
            <path d="M1 1.5l5 5 5-5" />
          </svg>
        </div>
        {topic?.note && (
          <p className="mt-2.5 text-[15px] leading-normal text-[#3b4a40]" id="contact-about-note">
            <Note note={topic.note} />
          </p>
        )}
        {fieldError('about')}
      </div>

      <div>
        <label className="contact-label" htmlFor="contact-message">
          Message *
        </label>
        <textarea
          aria-describedby={describedBy('message')}
          aria-invalid={errors.message ? true : undefined}
          className="contact-textarea"
          id="contact-message"
          maxLength={MESSAGE_MAX}
          name="message"
          onInput={(e) => browserMessage(e.currentTarget)}
          required
          rows={6}
        />
        {fieldError('message')}

        <div className="mt-3.5 flex flex-wrap items-center gap-x-[18px] gap-y-2.5">
          <button
            aria-describedby={describedBy('files', 'contact-files-hint')}
            className="contact-attach"
            disabled={files.length >= FILES_MAX}
            onClick={() => picker.current?.click()}
            type="button"
          >
            <svg
              aria-hidden
              fill="none"
              height="16"
              stroke="currentColor"
              strokeWidth="1.3"
              viewBox="0 0 14 16"
              width="14"
            >
              <path d="M12 7.5L7 12.5a3.5 3.5 0 01-5-5L7.5 2a2.3 2.3 0 013.3 3.3L5.5 10.6a1.2 1.2 0 01-1.7-1.7L8.5 4.2" />
            </svg>
            Attach files
          </button>
          <input
            accept={ACCEPT}
            className="sr-only"
            multiple
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
            ref={picker}
            tabIndex={-1}
            type="file"
          />
          <span className="text-[15px] text-[#56665b]" id="contact-files-hint">
            Optional. Up to three files, 10 MB each: PDF, JPG, PNG or Word.
          </span>
        </div>
        {files.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {files.map((file, index) => (
              <li
                className="flex flex-wrap items-center gap-x-4 text-base"
                key={`${file.name}-${index}`}
              >
                <span className="min-w-0 break-all">
                  {file.name} <span className="text-[#56665b]">({megabytes(file.size)})</span>
                </span>
                <button
                  className="link min-h-11 text-[15px]"
                  disabled={sending}
                  onClick={() => {
                    setFiles(files.filter((_, i) => i !== index))
                    setErrors((e) => ({ ...e, files: undefined }))
                  }}
                  type="button"
                >
                  Remove<span className="sr-only"> {file.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {fieldError('files')}
      </div>

      {/* Honeypot: invisible to people, tempting to bots */}
      <div aria-hidden className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
        <label htmlFor={HONEYPOT_FIELD}>Company website</label>
        <input autoComplete="off" id={HONEYPOT_FIELD} name={HONEYPOT_FIELD} tabIndex={-1} />
      </div>

      <p className="m-0 text-base leading-normal text-[#3b4a40]">
        PAT &amp; J.K. Co. will use these details only to reply to you.{' '}
        <a href="/privacy">Privacy policy</a>
      </p>

      {botProblem && <BotCheckHelp email="hello@pjk.co.in" problem={botProblem} />}
      {botCheck}

      <div aria-live="polite" role="status">
        {progress && <p className="m-0 text-base text-[#3b4a40]">{progress}</p>}
      </div>
      {problem && (
        <p className="m-0 text-base italic text-destructive" role="alert">
          {problem}
        </p>
      )}

      <div>
        <button className="house-btn" disabled={sending} type="submit">
          {sending ? 'Sending…' : 'Send message'}
        </button>
      </div>
    </form>
  )
}
