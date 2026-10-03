'use client'

import React from 'react'

/**
 * The application's steps as a garland: a gold string with a bead for each step. A finished step
 * is a leaf-green bead with a tick, the current one a magenta flower, and those ahead are open.
 * Each finished or reachable step is a button that goes back to it. Colour is never the only
 * signal: every bead also has its words, read out in full to screen readers.
 */
export const GarlandProgress = <S extends string>({
  steps,
  titles,
  current,
  completed,
  onGo,
}: {
  steps: readonly S[]
  titles: Record<S, string>
  current: S
  completed: readonly string[]
  onGo: (step: S) => void
}) => {
  const firstOpen = steps.findIndex((s) => !completed.includes(s))
  const index = steps.indexOf(current)
  return (
    <nav aria-label="Application steps">
      <p className="label sm:hidden">
        Step {index + 1} of {steps.length}: {titles[current]}
      </p>
      <ol
        className="relative mt-3 grid sm:mt-0"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {/* The string the beads hang on */}
        <span
          aria-hidden
          className="absolute left-[calc(100%/var(--n)/2)] right-[calc(100%/var(--n)/2)] top-[1.375rem] h-px"
          style={{ ['--n' as string]: steps.length, background: 'var(--gold)' }}
        />
        {steps.map((step, i) => {
          const done = completed.includes(step)
          const here = step === current
          const reachable = done || i <= firstOpen
          return (
            <li className="relative flex justify-center" key={step}>
              <button
                aria-current={here ? 'step' : undefined}
                className="group flex min-h-11 min-w-11 flex-col items-center gap-2 disabled:cursor-default"
                disabled={!reachable}
                onClick={() => onGo(step)}
                type="button"
              >
                <span aria-hidden className="relative flex size-11 items-center justify-center">
                  <span
                    className="flex size-6 items-center justify-center rounded-full border transition-transform duration-300 group-enabled:group-hover:scale-110 motion-reduce:transition-none"
                    style={
                      here
                        ? {
                            background: 'var(--accent)',
                            borderColor: 'var(--accent)',
                            boxShadow:
                              '0 0 0 4px color-mix(in oklab, var(--accent) 18%, transparent)',
                          }
                        : done
                          ? { background: 'var(--leaf)', borderColor: 'var(--leaf)' }
                          : { background: 'var(--background)', borderColor: 'var(--gold)' }
                    }
                  >
                    {done && !here && (
                      <svg
                        className="size-3.5"
                        fill="none"
                        stroke="var(--background)"
                        strokeWidth="2.5"
                        viewBox="0 0 16 16"
                      >
                        <path d="M3.5 8.5l3 3 6-7" />
                      </svg>
                    )}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`hidden max-w-[9ch] text-center text-[0.8rem] leading-tight sm:block ${here ? 'font-medium' : ''} ${reachable ? '' : 'opacity-60'}`}
                >
                  {titles[step]}
                </span>
                <span className="sr-only">
                  {`Step ${i + 1}: ${titles[step]}${here ? ', you are here' : done ? ', saved' : reachable ? '' : ', not yet'}`}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
