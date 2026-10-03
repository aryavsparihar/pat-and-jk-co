'use client'

import React, { useRef, useState } from 'react'

import { api } from '../onboarding/api'
import { ErrorSummary, type Errors, SelectField, TextArea, TextField } from '../onboarding/fields'
import { usePictures } from '../onboarding/usePictures'

export type WorkValues = {
  id?: number
  title: string
  year: number | null
  medium: string | null
  surface: string | null
  widthCm: number | null
  heightCm: number | null
  depthCm: number | null
  edition: string | null
  forSale: boolean
  priceInr: number | null
  availability: string
  description: string | null
  images: number[]
  review?: { state: string; note: string | null }
}

const AVAILABILITY = [
  { value: 'available', label: 'Available' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'sold', label: 'Sold' },
  { value: 'not-available', label: 'Not available' },
]

const empty: WorkValues = {
  title: '',
  year: null,
  medium: null,
  surface: null,
  widthCm: null,
  heightCm: null,
  depthCm: null,
  edition: null,
  forSale: true,
  priceInr: null,
  availability: 'available',
  description: null,
  images: [],
}

const MAX_PICTURES = 8

/**
 * A work in the artist's portfolio, new or existing. Saving sends it for review; it is shown to
 * the public only once our team approves it, and an approved version stays up while a change is
 * being looked at.
 */
export const WorkForm: React.FC<{ initial?: WorkValues }> = ({ initial }) => {
  const [v, setV] = useState<WorkValues>(initial ?? empty)
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { pictures, send, busy, problem } = usePictures()
  const input = useRef<HTMLInputElement>(null)

  const set = <K extends keyof WorkValues>(key: K, value: WorkValues[K]) =>
    setV((all) => ({ ...all, [key]: value }))
  const num = (s: string) => (s.trim() === '' ? null : Number(s))

  const addPictures = async (files: FileList | null) => {
    const room = MAX_PICTURES - v.images.length
    const added = await send(files, room)
    if (added.length) set('images', [...v.images, ...added.map((p) => p.id)])
    if (input.current) input.current.value = ''
  }

  const movePicture = (from: number, to: number) => {
    const next = [...v.images]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item!)
    set('images', next)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setErrors({})
    setMessage(null)
    const { id, review: _review, ...body } = v
    const result = await api<{ artwork: WorkValues }>(
      id ? `/next/members/portal/artworks/${id}` : '/next/members/portal/artworks',
      { method: id ? 'PATCH' : 'POST', body },
    )
    setSaving(false)
    if (!result.ok) {
      setErrors(result.data.errors ?? {})
      if (!result.data.errors) setMessage(result.data.message ?? 'The work could not be saved.')
      return
    }
    // A full page load: the list shows where every review stands
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/account/works?saved=1')
  }

  return (
    <form noValidate onSubmit={save}>
      {v.review?.state === 'changes-requested' && v.review.note && (
        <div className="mb-10 border-l-2 border-primary bg-surface py-5 pl-6 pr-4">
          <p className="font-medium">A note from us</p>
          <p className="measure mt-2 whitespace-pre-line">{v.review.note}</p>
        </div>
      )}
      <ErrorSummary errors={errors} />
      {message && (
        <p className="mb-8 text-base italic text-destructive" role="alert">
          {message}
        </p>
      )}

      <div className="grid gap-y-8">
        <TextField
          errors={errors}
          label="Title"
          maxLength={160}
          name="title"
          onValue={(x) => set('title', x)}
          value={v.title}
        />
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-3">
          <TextField
            errors={errors}
            inputMode="numeric"
            label="Year"
            name="year"
            onValue={(x) => set('year', num(x))}
            optional
            value={v.year ?? ''}
          />
          <TextField
            errors={errors}
            hint="Oil, watercolour, woodcut…"
            label="Medium"
            name="medium"
            onValue={(x) => set('medium', x || null)}
            optional
            value={v.medium ?? ''}
          />
          <TextField
            errors={errors}
            hint="Canvas, paper, wood panel…"
            label="Surface"
            name="surface"
            onValue={(x) => set('surface', x || null)}
            optional
            value={v.surface ?? ''}
          />
        </div>
        <fieldset>
          <legend className="label mb-2">Size, in centimetres</legend>
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-3">
            <TextField
              errors={errors}
              inputMode="decimal"
              label="Width"
              name="widthCm"
              onValue={(x) => set('widthCm', num(x))}
              optional
              value={v.widthCm ?? ''}
            />
            <TextField
              errors={errors}
              inputMode="decimal"
              label="Height"
              name="heightCm"
              onValue={(x) => set('heightCm', num(x))}
              optional
              value={v.heightCm ?? ''}
            />
            <TextField
              errors={errors}
              inputMode="decimal"
              label="Depth"
              name="depthCm"
              onValue={(x) => set('depthCm', num(x))}
              optional
              value={v.depthCm ?? ''}
            />
          </div>
        </fieldset>
        <TextField
          errors={errors}
          hint="“Unique”, or for prints, e.g. “3 of 10”."
          label="Edition"
          name="edition"
          onValue={(x) => set('edition', x || null)}
          optional
          value={v.edition ?? ''}
        />

        <fieldset>
          <legend className="label mb-2">Is it for sale?</legend>
          {([true, false] as const).map((yes) => (
            <label
              className="mr-8 inline-flex min-h-11 cursor-pointer items-center gap-3"
              key={String(yes)}
            >
              <input
                checked={v.forSale === yes}
                className="size-5 accent-[var(--primary)]"
                name="forSale"
                onChange={() => set('forSale', yes)}
                type="radio"
              />
              {yes ? 'For sale' : 'Not for sale'}
            </label>
          ))}
        </fieldset>
        {v.forSale && (
          <TextField
            className="max-w-xs"
            errors={errors}
            hint="In rupees."
            inputMode="numeric"
            label="Price (₹)"
            name="priceInr"
            onValue={(x) => set('priceInr', num(x.replace(/[,\s₹]/g, '')))}
            value={v.priceInr ?? ''}
          />
        )}
        <SelectField
          className="max-w-xs"
          errors={errors}
          label="Availability"
          name="availability"
          onValue={(x) => set('availability', x)}
          options={AVAILABILITY}
          value={v.availability}
        />
        <TextArea
          errors={errors}
          label="About the work"
          limit={2000}
          name="description"
          onValue={(x) => set('description', x || null)}
          optional
          rows={5}
          value={v.description ?? ''}
        />

        <fieldset>
          <legend className="label mb-1">Pictures</legend>
          <p className="muted mb-4 text-base" id="field-images-hint">
            Up to {MAX_PICTURES}. The first is the one shown in lists. JPEG, PNG or WebP.
          </p>
          {errors.images && (
            <p className="mb-4 text-base italic text-destructive" id="field-images">
              {errors.images}
            </p>
          )}
          <ol className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {v.images.map((id, i) => (
              <li className="grid gap-2" key={id}>
                {pictures[id]?.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={`Picture ${i + 1}`}
                    className="aspect-square w-full bg-surface object-cover"
                    src={pictures[id]!.thumbnail!}
                  />
                ) : (
                  <div className="aspect-square w-full bg-surface" />
                )}
                <div className="flex flex-wrap gap-x-4 text-base">
                  {i > 0 && (
                    <button
                      className="link min-h-11"
                      onClick={() => movePicture(i, i - 1)}
                      type="button"
                    >
                      Earlier<span className="sr-only"> (picture {i + 1})</span>
                    </button>
                  )}
                  <button
                    className="link min-h-11"
                    onClick={() =>
                      set(
                        'images',
                        v.images.filter((x) => x !== id),
                      )
                    }
                    type="button"
                  >
                    Remove<span className="sr-only"> picture {i + 1}</span>
                  </button>
                </div>
              </li>
            ))}
          </ol>
          {v.images.length < MAX_PICTURES && (
            <div className="mt-6">
              <label className="btn btn-outline min-h-11 cursor-pointer" htmlFor="work-pictures">
                Add pictures
              </label>
              <input
                accept="image/jpeg,image/png,image/webp"
                aria-describedby="field-images-hint"
                className="sr-only"
                id="work-pictures"
                multiple
                onChange={(e) => addPictures(e.target.files)}
                ref={input}
                type="file"
              />
            </div>
          )}
          <p aria-live="polite" className="mt-3 text-base" role="status">
            {busy ?? ''}
          </p>
          {problem && <p className="text-base italic text-destructive">{problem}</p>}
        </fieldset>
      </div>

      <div className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-border pt-8">
        <button className="btn btn-solid min-h-11" disabled={saving || Boolean(busy)} type="submit">
          {saving ? 'Saving…' : 'Save and send for review'}
        </button>
        <a className="link link-caps min-h-11" href="/account/works">
          Back to your works
        </a>
      </div>
      <p className="muted measure mt-6 text-base">
        Our team looks at every new or changed work before it is shown. If it is already public, the
        version we approved stays up until we have looked at the change.
      </p>
    </form>
  )
}
