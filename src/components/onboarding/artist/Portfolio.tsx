'use client'

import { upload } from '@vercel/blob/client'
import React, { useEffect, useRef, useState } from 'react'

import { PORTFOLIO_MAX, PORTFOLIO_MIN } from '@/members/forms/schemas'

import { api } from '../api'
import { TextField } from '../fields'
import type { StepProps, Values } from './steps'

type Image = { id: number; thumbnail: string | null }

const ACCEPT = 'image/jpeg,image/png,image/webp'

/**
 * Three to ten works, each a picture and a few facts. Pictures go to the server one at a time
 * (straight to Blob storage in production), are checked and cleaned there, and come back as a
 * thumbnail; each becomes a work to describe.
 */
export const PortfolioStep: React.FC<StepProps> = ({ values, set, errors }) => {
  const works: Values[] = values.works ?? []
  const [images, setImages] = useState<Record<number, Image>>({})
  const [mode, setMode] = useState<'blob' | 'direct'>('direct')
  const [prefix, setPrefix] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

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

  const sendOne = async (file: File): Promise<Image | null> => {
    let result
    if (mode === 'blob') {
      const blob = await upload(`${prefix}${file.name.replace(/[^\w.-]/g, '_')}`, file, {
        access: 'public',
        handleUploadUrl: '/next/members/portfolio/upload-token',
        contentType: file.type,
      })
      result = await api<{ image: Image }>('/next/members/portfolio', {
        body: { blobUrl: blob.url },
      })
    } else {
      const form = new FormData()
      form.append('file', file)
      result = await api<{ image: Image }>('/next/members/portfolio', { body: form })
    }
    if (!result.ok) {
      setProblem(`${file.name}: ${result.data.message ?? 'That picture could not be added.'}`)
      return null
    }
    return result.data.image
  }

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setProblem(null)
    let current = works
    for (const file of Array.from(files)) {
      if (current.length >= PORTFOLIO_MAX) {
        setProblem(`You can add up to ${PORTFOLIO_MAX} works.`)
        break
      }
      setBusy(`Adding ${file.name}…`)
      try {
        const image = await sendOne(file)
        if (image) {
          setImages((all) => ({ ...all, [image.id]: image }))
          current = [...current, { image: image.id }]
          set('works', current)
        }
      } catch {
        setProblem(`${file.name}: that picture could not be sent. Please try again.`)
      }
    }
    setBusy(null)
    if (input.current) input.current.value = ''
  }

  const move = (from: number, to: number) => {
    const next = [...works]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item!)
    set('works', next)
  }

  return (
    <div>
      <p className="measure">
        Add between {PORTFOLIO_MIN} and {PORTFOLIO_MAX} works that show what you do best. Clear,
        evenly lit photographs are better than many. JPEG, PNG or WebP, up to 25 MB each.
      </p>
      <p className="muted measure mt-3 text-base">
        We remove the hidden details cameras add to photographs, including where they were taken,
        before keeping them. These pictures are seen only by our team.
      </p>

      {errors.works && (
        <p className="mt-6 text-base italic text-destructive" id="field-works">
          {errors.works}
        </p>
      )}

      <ol className="mt-10 grid gap-y-10">
        {works.map((work, i) => {
          const image = images[work.image]
          return (
            <li
              className="grid gap-x-8 gap-y-6 border-t border-border pt-8 md:grid-cols-[12rem_1fr]"
              key={`${work.image}-${i}`}
            >
              <div>
                <div className="aspect-square w-full overflow-hidden bg-surface md:w-48">
                  {image?.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element -- access-checked private file
                    <img
                      alt={work.title ? `Your work: ${work.title}` : `Work ${i + 1}`}
                      className="size-full object-contain"
                      src={image.thumbnail}
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
                <p className="label -mb-2 border-t border-border pt-6">Details</p>
                <div className="grid gap-x-8 gap-y-7 sm:grid-cols-[1fr_8rem]">
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
                  <TextField
                    errors={errors}
                    inputMode="numeric"
                    label="Year"
                    name={`works.${i}.year`}
                    onValue={(v) => set(`works.${i}.year`, v)}
                    type="number"
                    value={work.year}
                  />
                </div>
                <TextField
                  errors={errors}
                  hint="e.g. Oil on canvas"
                  label="Medium"
                  name={`works.${i}.medium`}
                  onValue={(v) => set(`works.${i}.medium`, v)}
                  value={work.medium}
                />
                <div className="grid grid-cols-3 gap-x-6">
                  <TextField
                    errors={errors}
                    inputMode="decimal"
                    label="Width (cm)"
                    name={`works.${i}.widthCm`}
                    onValue={(v) => set(`works.${i}.widthCm`, v)}
                    type="number"
                    value={work.widthCm}
                  />
                  <TextField
                    errors={errors}
                    inputMode="decimal"
                    label="Height (cm)"
                    name={`works.${i}.heightCm`}
                    onValue={(v) => set(`works.${i}.heightCm`, v)}
                    type="number"
                    value={work.heightCm}
                  />
                  <TextField
                    errors={errors}
                    inputMode="decimal"
                    label="Depth (cm)"
                    name={`works.${i}.depthCm`}
                    onValue={(v) => set(`works.${i}.depthCm`, v)}
                    optional
                    type="number"
                    value={work.depthCm}
                  />
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      <div className="mt-10 border-t border-border pt-8">
        <p aria-live="polite" className="text-base" role="status">
          {busy ?? `${works.length} of ${PORTFOLIO_MAX} works added.`}
        </p>
        {problem && (
          <p className="mt-2 text-base italic text-destructive" role="alert">
            {problem}
          </p>
        )}
        {works.length < PORTFOLIO_MAX && (
          <label className="btn btn-outline mt-5 min-h-11 cursor-pointer">
            {works.length === 0 ? 'Choose pictures' : 'Add more pictures'}
            <input
              accept={ACCEPT}
              className="sr-only"
              disabled={Boolean(busy)}
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
