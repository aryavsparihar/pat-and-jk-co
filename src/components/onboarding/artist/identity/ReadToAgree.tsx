'use client'

import React, { useRef, useState } from 'react'

export const AGREE_PHRASE = 'I AGREE'

/**
 * Agreement given in so many words, to a document read in full: the privacy policy before
 * identity details are given, the Partner/Trade Program agreement before a partner applies.
 * Ticking the box opens the document in a dialog; once it has been read to the end, the person
 * confirms, then types I AGREE. Only then is the box ticked. Unticking withdraws it here, before
 * anything is sent. The server records when, against which version, and how.
 */
export const ReadToAgree: React.FC<{
  /** Field name, for error links: field-<id> */
  id: string
  agreed: boolean
  onAgreed: (agreed: boolean) => void
  /** What the box says the person agrees to */
  label: React.ReactNode
  /** The dialog's heading */
  title: string
  /** The document, in a sentence: "the privacy policy" */
  documentName: string
  /** The document itself, rendered on the server */
  body: React.ReactNode
  error?: string
}> = ({ id, agreed, onAgreed, label, title, documentName, body: text, error }) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [readToEnd, setReadToEnd] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [typed, setTyped] = useState('')

  // Scrolling to the end of the policy is what counts as reading it to the end (a policy short
  // enough to fit needs no scrolling)
  const checkEnd = () => {
    const el = body.current
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReadToEnd(true)
  }

  const open = () => {
    setConfirmed(false)
    setTyped('')
    dialog.current?.showModal()
    body.current?.scrollTo({ top: 0 })
    requestAnimationFrame(checkEnd)
  }

  const agree = () => {
    onAgreed(true)
    dialog.current?.close()
  }

  return (
    <div className="border-t border-border pt-8" id={`field-${id}`}>
      <label className="flex min-h-11 cursor-pointer items-start gap-4 py-2">
        <input
          aria-describedby={error ? `field-${id}-error` : `field-${id}-hint`}
          aria-invalid={error ? true : undefined}
          checked={agreed}
          className="mt-1 size-5 shrink-0 cursor-pointer accent-[var(--primary)]"
          onChange={(e) => (e.target.checked ? open() : onAgreed(false))}
          type="checkbox"
        />
        <span className="measure">{label}</span>
      </label>
      <p className="muted ml-9 text-base" id={`field-${id}-hint`}>
        {agreed
          ? `Thank you. You read ${documentName} and agreed to it.`
          : `Ticking the box opens ${documentName}. Read it to the end, then confirm.`}
      </p>
      {error && (
        <p className="ml-9 mt-1 text-base italic text-destructive" id={`field-${id}-error`}>
          {error}
        </p>
      )}

      <dialog
        aria-labelledby={`${id}-dialog-title`}
        className="privacy-dialog m-auto flex h-[min(92dvh,52rem)] w-[min(100%-2rem,46rem)] flex-col bg-background p-0 text-[var(--text)] open:flex [&:not([open])]:hidden"
        ref={dialog}
      >
        <div className="border-b border-border px-6 pb-4 pt-6 sm:px-8">
          <h2 className="display-sm" id={`${id}-dialog-title`}>
            {title}
          </h2>
          <p className="muted mt-1 text-base">Please read it to the end.</p>
        </div>
        <div
          aria-label={documentName.charAt(0).toUpperCase() + documentName.slice(1)}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 sm:px-8"
          onScroll={checkEnd}
          ref={body}
          role="region"
          tabIndex={0}
        >
          {text}
        </div>
        <div className="grid gap-y-4 border-t border-border px-6 py-5 sm:px-8">
          <label
            className={`flex min-h-11 items-start gap-4 ${readToEnd ? 'cursor-pointer' : 'opacity-60'}`}
          >
            <input
              checked={confirmed}
              className="mt-1 size-5 shrink-0 accent-[var(--primary)]"
              disabled={!readToEnd}
              onChange={(e) => setConfirmed(e.target.checked)}
              type="checkbox"
            />
            <span>
              I have read {documentName} to the end.
              {!readToEnd && (
                <span className="muted block text-base">Scroll to the end to continue.</span>
              )}
            </span>
          </label>
          {confirmed && (
            <div className="step-in">
              <label className="label mb-1 block" htmlFor={`${id}-typed`}>
                Type {AGREE_PHRASE} to confirm
              </label>
              <input
                autoCapitalize="characters"
                autoComplete="off"
                className="w-full max-w-xs border-0 border-b border-input bg-transparent px-0 py-2 text-[1.15rem] tracking-wider focus:border-primary focus:outline-none"
                id={`${id}-typed`}
                onChange={(e) => setTyped(e.target.value)}
                spellCheck={false}
                value={typed}
              />
              <p className="muted mt-1 text-base">In capitals, as shown.</p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <button
              className="btn btn-solid min-h-11"
              disabled={!(readToEnd && confirmed && typed === AGREE_PHRASE)}
              onClick={agree}
              type="button"
            >
              Agree
            </button>
            <button
              className="link link-caps min-h-11"
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Not now
            </button>
          </div>
        </div>
      </dialog>
    </div>
  )
}
