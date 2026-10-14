'use client'

import React, { useEffect, useRef, useState } from 'react'

import { DIMENSION_UNITS, PORTFOLIO_MAX, PORTFOLIO_MIN, yearChoices } from '@/members/forms/schemas'
import { cn } from '@/utilities/ui'

import { api } from '../api'
import { sendPicture } from '../sendPicture'
import { UploadProgress, type UploadState } from '../UploadProgress'
import { SelectField, TextField } from '../fields'
import { Roller, type RollerOption } from '../Roller'
import type { StepProps, Values } from './steps'

type Image = { id: number; thumbnail: string | null }

/** A picture on its way: shown at once from the artist's own file, while it is sent and checked */
type Pending = {
  key: string
  name: string
  preview: string
  state: UploadState
}

const ACCEPT = 'image/jpeg,image/png,image/webp'

const YEARS: RollerOption[] = yearChoices().map((y) => ({ value: y, label: String(y) }))

/** "12,5" or "12.5", and nothing else */
const decimal = (value: string) =>
  value
    .replace(',', '.')
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1')

/**
 * Three to ten works, each a picture and a few facts. A chosen picture shows straight away, from
 * the artist's own file, with a bar that fills as it is sent; it goes to the server one at a time
 * (straight to Blob storage in production), is checked and cleaned there, and settles into place
 * as a work to describe.
 */
export const PortfolioStep: React.FC<StepProps> = ({ values, set, errors }) => {
  const works: Values[] = values.works ?? []
  const [images, setImages] = useState<Record<number, Image>>({})
  // Pictures sent in this visit, shown from the artist's file rather than downloaded again
  const [local, setLocal] = useState<Record<number, string>>({})
  const [pending, setPending] = useState<Pending[]>([])
  const [fresh, setFresh] = useState<number | null>(null)
  const [mode, setMode] = useState<'blob' | 'direct'>('direct')
  const [prefix, setPrefix] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const urls = useRef<string[]>([])

  useEffect(() => {
    void api<{ mode: 'blob' | 'direct'; uploadPrefix: string; images: Image[] }>(
      '/next/members/portfolio',
    ).then((r) => {
      if (!r.ok) return
      setMode(r.data.mode)
      setPrefix(r.data.uploadPrefix)
      setImages(Object.fromEntries(r.data.images.map((i) => [i.id, i])))
    })
  }, [])

  // The previews are the browser's own copies of the files; let them go when the step closes
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const update = (key: string, change: Partial<Pending>) =>
    setPending((all) => all.map((p) => (p.key === key ? { ...p, ...change } : p)))

  const sendOne = async (file: File, key: string): Promise<Image | null> => {
    const result = await sendPicture<{ image: Image }>(file, { mode, prefix }, (state) =>
      update(key, { state }),
    )
    if (!result.ok) {
      setProblem(`${file.name}: ${result.data.message ?? 'That picture could not be added.'}`)
      return null
    }
    return result.data.image
  }

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setProblem(null)
    const room = PORTFOLIO_MAX - works.length
    const chosen = Array.from(files).slice(0, Math.max(0, room))
    if (files.length > chosen.length) setProblem(`You can add up to ${PORTFOLIO_MAX} works.`)
    const queue = chosen.map((file, i) => {
      const preview = URL.createObjectURL(file)
      urls.current.push(preview)
      return {
        file,
        item: {
          key: `${Date.now()}-${i}-${file.name}`,
          name: file.name,
          preview,
          state: { phase: 'waiting' },
        } satisfies Pending,
      }
    })
    if (input.current) input.current.value = ''
    setPending((all) => [...all, ...queue.map((q) => q.item)])

    let current = works
    for (const { file, item } of queue) {
      let image: Image | null = null
      try {
        image = await sendOne(file, item.key)
      } catch {
        setProblem(`${file.name}: that picture could not be sent. Please try again.`)
      }
      if (!image) {
        update(item.key, { state: { phase: 'failed' } })
        continue
      }
      const added = image
      update(item.key, { state: { phase: 'done' } })
      // A moment at full, then it settles into the list as a work
      await new Promise((r) => setTimeout(r, 250))
      setImages((all) => ({ ...all, [added.id]: added }))
      setLocal((all) => ({ ...all, [added.id]: item.preview }))
      setPending((all) => all.filter((p) => p.key !== item.key))
      setFresh(added.id)
      current = [...current, { image: added.id, unit: 'cm' }]
      set('works', current)
    }
  }

  const move = (from: number, to: number) => {
    const next = [...works]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item!)
    set('works', next)
  }

  const sending = pending.some((p) => p.state.phase !== 'failed')
  const total = works.length + pending.filter((p) => p.state.phase !== 'failed').length

  return (
    <div>
      <p className="measure">
        Add between {PORTFOLIO_MIN} and {PORTFOLIO_MAX} works that show what you do best. A few
        clear, evenly lit photographs say more than many. JPEG, PNG or WebP, up to 25 MB each.
      </p>
      <p className="muted measure mt-3 text-base">
        We remove the hidden details cameras add to photographs, including where they were taken,
        before keeping them. Only our team sees these pictures.
      </p>

      {errors.works && (
        <p className="mt-6 text-base italic text-destructive" id="field-works">
          {errors.works}
        </p>
      )}

      <ol className="mt-10 grid gap-y-10">
        {works.map((work, i) => {
          const image = images[work.image]
          const src = local[work.image] ?? image?.thumbnail
          const unit = work.unit ?? 'cm'
          return (
            <li
              className={cn(
                'grid gap-x-8 gap-y-6 border-t border-border pt-8 md:grid-cols-[12rem_1fr]',
                fresh === work.image && 'work-settle',
              )}
              key={`${work.image}-${i}`}
            >
              <div>
                <div className="aspect-square w-full overflow-hidden bg-surface md:w-48">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element -- the artist's own file, or an access-checked private one
                    <img
                      alt={work.title ? `Your work: ${work.title}` : `Work ${i + 1}`}
                      className="size-full object-contain"
                      src={src}
                    />
                  ) : (
                    <span className="muted flex size-full items-center justify-center text-sm">
                      Picture {i + 1}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5">
                  <button
                    className="link link-caps min-h-11"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                    type="button"
                  >
                    Up<span className="sr-only"> (move work {i + 1} earlier)</span>
                  </button>
                  <button
                    className="link link-caps min-h-11"
                    disabled={i === works.length - 1}
                    onClick={() => move(i, i + 1)}
                    type="button"
                  >
                    Down<span className="sr-only"> (move work {i + 1} later)</span>
                  </button>
                  <button
                    className="link link-caps min-h-11"
                    onClick={() =>
                      set(
                        'works',
                        works.filter((_, j) => j !== i),
                      )
                    }
                    type="button"
                  >
                    Remove<span className="sr-only"> work {i + 1}</span>
                  </button>
                </div>
              </div>
              <div className="grid gap-y-7">
                <TextField
                  errors={errors}
                  label="Title"
                  name={`works.${i}.title`}
                  onValue={(v) => set(`works.${i}.title`, v)}
                  value={work.title}
                />
                <TextField
                  errors={errors}
                  hint="For example, oil on canvas."
                  label="Medium"
                  name={`works.${i}.medium`}
                  onValue={(v) => set(`works.${i}.medium`, v)}
                  value={work.medium}
                />
                <div className="grid gap-x-10 gap-y-7 sm:grid-cols-[1fr_13rem]">
                  <TextField
                    errors={errors}
                    hint="Leave it empty if the work is not for sale."
                    inputMode="numeric"
                    label="Price (₹)"
                    name={`works.${i}.priceInr`}
                    onValue={(v) => set(`works.${i}.priceInr`, v.replace(/[^\d]/g, ''))}
                    optional
                    value={work.priceInr}
                  />
                  <Roller
                    error={errors[`works.${i}.year`]}
                    label="Year made"
                    name={`works.${i}.year`}
                    onValue={(v) => set(`works.${i}.year`, v)}
                    options={YEARS}
                    value={work.year}
                  />
                </div>
                <fieldset>
                  <legend className="label mb-1">Size</legend>
                  <p className="muted mb-3 text-base">
                    Decimals are fine. Leave depth empty for a flat work.
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
                    <TextField
                      errors={errors}
                      inputMode="decimal"
                      label="Width"
                      name={`works.${i}.width`}
                      onValue={(v) => set(`works.${i}.width`, decimal(v))}
                      value={work.width}
                    />
                    <TextField
                      errors={errors}
                      inputMode="decimal"
                      label="Height"
                      name={`works.${i}.height`}
                      onValue={(v) => set(`works.${i}.height`, decimal(v))}
                      value={work.height}
                    />
                    <TextField
                      errors={errors}
                      inputMode="decimal"
                      label="Depth"
                      name={`works.${i}.depth`}
                      onValue={(v) => set(`works.${i}.depth`, decimal(v))}
                      optional
                      value={work.depth}
                    />
                    <SelectField
                      errors={errors}
                      label="Unit"
                      name={`works.${i}.unit`}
                      onValue={(v) => set(`works.${i}.unit`, v)}
                      options={DIMENSION_UNITS.map(({ value, label }) => ({ value, label }))}
                      value={unit}
                    />
                  </div>
                </fieldset>
              </div>
            </li>
          )
        })}
        {pending.map((p) => (
          <li
            className="work-arrive grid gap-x-8 gap-y-4 border-t border-border pt-8 md:grid-cols-[12rem_1fr]"
            key={p.key}
          >
            <div className="aspect-square w-full overflow-hidden bg-surface md:w-48">
              {/* eslint-disable-next-line @next/next/no-img-element -- the artist's own file, before it is sent */}
              <img
                alt=""
                className={cn(
                  'size-full object-contain transition-opacity duration-500',
                  p.state.phase === 'failed'
                    ? 'opacity-30'
                    : p.state.phase !== 'done' && 'opacity-70',
                )}
                src={p.preview}
              />
            </div>
            <div className="self-center">
              <p className="text-base">{p.name}</p>
              <UploadProgress className="mt-3" name={p.name} state={p.state} />
              {p.state.phase === 'failed' && (
                <button
                  className="link link-caps mt-1 min-h-11"
                  onClick={() => setPending((all) => all.filter((x) => x.key !== p.key))}
                  type="button"
                >
                  Clear<span className="sr-only"> {p.name}</span>
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 border-t border-border pt-8">
        <p aria-live="polite" className="text-base" role="status">
          {sending
            ? `Adding ${pending.filter((p) => p.state.phase !== 'failed').length === 1 ? 'a picture' : 'pictures'}. You can keep writing meanwhile.`
            : `${works.length} of ${PORTFOLIO_MAX} works added.`}
        </p>
        {problem && (
          <p className="mt-2 text-base italic text-destructive" role="alert">
            {problem}
          </p>
        )}
        {total < PORTFOLIO_MAX && (
          <label
            className={cn(
              'btn btn-outline mt-5 min-h-11 cursor-pointer',
              sending && 'pointer-events-none opacity-60',
            )}
          >
            {works.length === 0 ? 'Choose pictures' : 'Add more pictures'}
            <input
              accept={ACCEPT}
              className="sr-only"
              disabled={sending}
              multiple
              onChange={(e) => add(e.target.files)}
              ref={input}
              type="file"
            />
          </label>
        )}
      </div>
    </div>
  )
}
