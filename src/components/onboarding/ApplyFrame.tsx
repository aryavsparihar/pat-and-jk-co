'use client'

import React from 'react'

/**
 * The frame of the artist application, as in the founder's designs (Apply1 to Apply5 and
 * ApplySteps, November 2026): on the first step the hero with what to have ready; on the others a
 * small side column with the wreath and the application number; and the five steps as a row of
 * beads, done in green, the current one in rose, the rest in gold outline.
 */

export const ApplyHero: React.FC = () => (
  <section className="house-hero">
    <div className="house-lab">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt="Phulhaar Gallery by PJK"
        className="h-auto w-[130px] sm:w-[170px]"
        height={170}
        src="/brand/phulhaar-logo.png"
        width={170}
      />
    </div>
    <div className="house-con">
      <p className="house-small">Apply as an artist</p>
      <h1 className="apply-h1">
        Show your work with <em>Phulhaar</em>
      </h1>
      <p className="house-lead">
        Phulhaar Gallery chooses fine art and craft with care, and places it with people who will
        live with it. Tell us about yourself and your work. It takes about fifteen minutes, and your
        answers are saved as you go.
      </p>
      <div className="apply-need">
        <div className="flex-[1_1_300px]">
          <p className="house-small mb-2">What you will need</p>
          <ul>
            <li>Photographs of three to ten of your works</li>
            <li>A short biography, a few lines long</li>
            <li>Links to your work online, if you have them</li>
          </ul>
          <p className="apply-need-note">
            No identity documents yet. If we go ahead, we will ask you to confirm who you are before
            the agreement.
          </p>
        </div>
        <p className="apply-need-aside">
          Applying is free. We read every application ourselves, and reply within seven days. Your
          share of each sale is set out in the agreement, before you sign.
        </p>
      </div>
    </div>
  </section>
)

export type StepBead<S extends string> = { step: S; label: string }

/** The five steps: a finished one is a link back to it; the current one is marked as such */
export function ApplicationSteps<S extends string>({
  steps,
  current,
  completed,
  onGo,
}: {
  steps: StepBead<S>[]
  current: S
  completed: string[]
  onGo: (step: S) => void
}) {
  const now = steps.findIndex((s) => s.step === current)
  return (
    <ol aria-label="Application steps" className="apply-steps">
      {steps.map(({ step, label }, i) => {
        const state = i === now ? 'now' : completed.includes(step) ? 'done' : 'later'
        return (
          <li
            aria-current={i === now ? 'step' : undefined}
            className="apply-step"
            data-line={i === 0 ? undefined : i <= now ? 'done' : 'later'}
            key={step}
          >
            {state === 'done' ? (
              <button className="apply-step-inner" onClick={() => onGo(step)} type="button">
                <span aria-hidden className="apply-bead apply-bead-done">
                  <svg
                    fill="none"
                    height="10"
                    stroke="#fff"
                    strokeWidth="1.8"
                    viewBox="0 0 12 10"
                    width="12"
                  >
                    <path d="M1 5l3.5 3.5L11 1" />
                  </svg>
                </span>
                <span className="apply-step-label">
                  {label}
                  <span className="sr-only">, done</span>
                </span>
              </button>
            ) : (
              <span className="apply-step-inner">
                <span aria-hidden className={`apply-bead apply-bead-${state}`} />
                <span className="apply-step-label" data-state={state}>
                  {label}
                </span>
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** The application number beside the steps: on step 1 in full, after it with the wreath */
export const ApplySide: React.FC<{ reference: string; first: boolean }> = ({ reference, first }) =>
  first ? (
    <div className="house-lab apply-side">
      <p className="house-small">Application number</p>
      <p className="apply-ref">{reference}</p>
      <p className="apply-help">Please quote it if you write to us about your application.</p>
    </div>
  ) : (
    <div className="house-lab apply-side">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" className="h-auto w-14" height={56} src="/brand/wreath.png" width={56} />
      <p className="house-small">Apply as an artist</p>
      <p className="apply-ref apply-ref-small">{reference}</p>
    </div>
  )
