'use client'

import React, { useRef, useState } from 'react'

import { api } from '../onboarding/api'
import { CheckGroup, ErrorSummary, type Errors, TextArea, TextField } from '../onboarding/fields'
import { UploadProgress } from '../onboarding/UploadProgress'
import { usePictures } from '../onboarding/usePictures'

export type ProfileValues = {
  displayName: string
  bio: string
  statement: string
  links: { label: string; url: string }[]
  portrait: number | null
  mediums: string[]
  exhibitions: { title: string; venue: string; year: number | null }[]
  review: { state: string; note: string | null }
  isPublic: boolean
}

/**
 * The artist's public profile. Saving sends it to our team; it is shown only once approved, and
 * an approved profile stays up while a change is being looked at.
 */
export const ProfileForm: React.FC<{
  initial: ProfileValues
  mediums: readonly { value: string; label: string }[]
}> = ({ initial, mediums }) => {
  const [v, setV] = useState(initial)
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { pictures, send, busy, problem, uploading } = usePictures()
  const input = useRef<HTMLInputElement>(null)

  const set = <K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) =>
    setV((all) => ({ ...all, [key]: value }))

  const setPortrait = async (files: FileList | null) => {
    const [picture] = await send(files, 1)
    if (picture) set('portrait', picture.id)
    if (input.current) input.current.value = ''
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setErrors({})
    setMessage(null)
    const { review: _r, isPublic: _p, ...body } = v
    const result = await api<{ profile: ProfileValues }>('/next/members/portal/profile', {
      body: {
        ...body,
        portrait: body.portrait ?? undefined,
        links: body.links.filter((l) => l.url.trim()),
        exhibitions: body.exhibitions.filter((e) => e.title.trim()),
      },
    })
    setSaving(false)
    if (!result.ok) {
      setErrors(result.data.errors ?? {})
      if (!result.data.errors) setMessage(result.data.message ?? 'Your profile could not be saved.')
      return
    }
    setV(result.data.profile)
    setMessage(
      'Saved, and sent to our team. We will email you once it is public, or if we would like a change.',
    )
  }

  const portrait = v.portrait ? pictures[v.portrait] : null

  return (
    <form noValidate onSubmit={save}>
      {v.review.state === 'changes-requested' && v.review.note && (
        <div className="mb-10 border-l-2 border-primary bg-surface py-5 pl-6 pr-4">
          <p className="font-medium">A note from us</p>
          <p className="measure mt-2 whitespace-pre-line">{v.review.note}</p>
        </div>
      )}
      {v.review.state === 'pending' && (
        <p className="mb-8 text-base" role="status">
          Waiting for our review.
          {v.isPublic ? ' The profile we approved before is public meanwhile.' : ''}
        </p>
      )}
      <ErrorSummary errors={errors} />
      {message && (
        <p className="mb-8 text-base text-primary" role="status">
          {message}
        </p>
      )}

      <div className="grid gap-y-8">
        <TextField
          errors={errors}
          hint="As you would like it shown with your work."
          label="Your name"
          name="displayName"
          onValue={(x) => set('displayName', x)}
          value={v.displayName}
        />

        <div>
          <p className="label mb-1">Portrait</p>
          <p className="muted mb-3 text-base">Optional. A photograph of you, or of you at work.</p>
          <div className="flex flex-wrap items-end gap-6">
            {portrait?.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Your portrait"
                className="size-32 bg-surface object-cover"
                src={portrait.thumbnail}
              />
            ) : (
              <div aria-hidden className="size-32 bg-surface" />
            )}
            <div className="flex flex-wrap gap-x-6">
              <label className="btn btn-outline min-h-11 cursor-pointer" htmlFor="portrait-file">
                {v.portrait ? 'Choose another' : 'Choose a picture'}
              </label>
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                id="portrait-file"
                onChange={(e) => setPortrait(e.target.files)}
                ref={input}
                type="file"
              />
              {v.portrait && (
                <button
                  className="link min-h-11"
                  onClick={() => set('portrait', null)}
                  type="button"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <p aria-live="polite" className="mt-2 text-base" role="status">
            {busy ?? ''}
          </p>
          {uploading && (
            <UploadProgress className="mt-2" name={uploading.name} state={uploading.state} />
          )}
          {problem && <p className="text-base italic text-destructive">{problem}</p>}
        </div>

        <TextArea
          errors={errors}
          label="Biography"
          limit={2000}
          name="bio"
          onValue={(x) => set('bio', x)}
          optional
          rows={6}
          value={v.bio}
        />
        <TextArea
          errors={errors}
          label="Artist statement"
          limit={2000}
          name="statement"
          onValue={(x) => set('statement', x)}
          optional
          rows={6}
          value={v.statement}
        />
        <CheckGroup
          error={errors.mediums}
          legend="Mediums"
          name="mediums"
          onValue={(x) => set('mediums', x)}
          options={mediums}
          value={v.mediums}
        />

        <fieldset>
          <legend className="label mb-2">Links</legend>
          <p className="muted mb-4 text-base">Your website or Instagram, up to five.</p>
          <div className="grid gap-y-6">
            {v.links.map((link, i) => (
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-[12rem_1fr_auto]" key={i}>
                <TextField
                  errors={errors}
                  label="Label"
                  name={`links.${i}.label`}
                  onValue={(x) =>
                    set(
                      'links',
                      v.links.map((l, j) => (j === i ? { ...l, label: x } : l)),
                    )
                  }
                  optional
                  value={link.label}
                />
                <TextField
                  errors={errors}
                  label="Address"
                  name={`links.${i}.url`}
                  onValue={(x) =>
                    set(
                      'links',
                      v.links.map((l, j) => (j === i ? { ...l, url: x } : l)),
                    )
                  }
                  type="url"
                  value={link.url}
                />
                <button
                  className="link min-h-11 self-end"
                  onClick={() =>
                    set(
                      'links',
                      v.links.filter((_, j) => j !== i),
                    )
                  }
                  type="button"
                >
                  Remove<span className="sr-only"> link {i + 1}</span>
                </button>
              </div>
            ))}
          </div>
          {v.links.length < 5 && (
            <button
              className="link link-caps mt-4 min-h-11"
              onClick={() => set('links', [...v.links, { label: '', url: '' }])}
              type="button"
            >
              Add a link
            </button>
          )}
        </fieldset>

        <fieldset>
          <legend className="label mb-2">Exhibitions</legend>
          <div className="grid gap-y-6">
            {v.exhibitions.map((ex, i) => (
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-[1fr_1fr_7rem_auto]" key={i}>
                <TextField
                  errors={errors}
                  label="Title"
                  name={`exhibitions.${i}.title`}
                  onValue={(x) =>
                    set(
                      'exhibitions',
                      v.exhibitions.map((e, j) => (j === i ? { ...e, title: x } : e)),
                    )
                  }
                  value={ex.title}
                />
                <TextField
                  errors={errors}
                  label="Where"
                  name={`exhibitions.${i}.venue`}
                  onValue={(x) =>
                    set(
                      'exhibitions',
                      v.exhibitions.map((e, j) => (j === i ? { ...e, venue: x } : e)),
                    )
                  }
                  optional
                  value={ex.venue}
                />
                <TextField
                  errors={errors}
                  inputMode="numeric"
                  label="Year"
                  name={`exhibitions.${i}.year`}
                  onValue={(x) =>
                    set(
                      'exhibitions',
                      v.exhibitions.map((e, j) =>
                        j === i ? { ...e, year: x ? Number(x) : null } : e,
                      ),
                    )
                  }
                  optional
                  value={ex.year ?? ''}
                />
                <button
                  className="link min-h-11 self-end"
                  onClick={() =>
                    set(
                      'exhibitions',
                      v.exhibitions.filter((_, j) => j !== i),
                    )
                  }
                  type="button"
                >
                  Remove<span className="sr-only"> exhibition {i + 1}</span>
                </button>
              </div>
            ))}
          </div>
          <button
            className="link link-caps mt-4 min-h-11"
            onClick={() =>
              set('exhibitions', [...v.exhibitions, { title: '', venue: '', year: null }])
            }
            type="button"
          >
            Add an exhibition
          </button>
        </fieldset>
      </div>

      <div className="mt-14 border-t border-border pt-8">
        <button className="btn btn-solid min-h-11" disabled={saving || Boolean(busy)} type="submit">
          {saving ? 'Saving…' : 'Save and send for review'}
        </button>
      </div>
    </form>
  )
}

/** Phone and postal address: changed at once, never shown to the public */
export const ContactForm: React.FC<{
  initial: { phone: string; contactAddress: Record<string, string | null | undefined> }
}> = ({ initial }) => {
  const [phone, setPhone] = useState(initial.phone)
  const [address, setAddress] = useState<Record<string, string>>(
    Object.fromEntries(
      ['line1', 'line2', 'landmark', 'city', 'district', 'state', 'postalCode', 'country'].map(
        (k) => [k, initial.contactAddress[k] ?? ''],
      ),
    ),
  )
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setErrors({})
    setMessage(null)
    const result = await api('/next/members/portal/contact', {
      body: { phone, contactAddress: address },
    })
    setSaving(false)
    if (!result.ok) {
      setErrors(result.data.errors ?? {})
      setMessage(result.data.errors ? null : (result.data.message ?? 'That could not be saved.'))
      return
    }
    setMessage('Saved.')
  }

  const field = (key: string, label: string, optional = true) => (
    <TextField
      errors={errors}
      label={label}
      name={`contactAddress.${key}`}
      onValue={(x) => setAddress((a) => ({ ...a, [key]: x }))}
      optional={optional}
      value={address[key]}
    />
  )

  return (
    <form noValidate onSubmit={save}>
      <ErrorSummary errors={errors} />
      <div className="grid gap-y-8">
        <TextField
          autoComplete="tel"
          className="max-w-sm"
          errors={errors}
          label="Phone"
          name="phone"
          onValue={setPhone}
          optional
          type="tel"
          value={phone}
        />
        <fieldset className="grid gap-y-8">
          <legend className="label mb-2">Postal address</legend>
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {field('line1', 'Address line 1')}
            {field('line2', 'Address line 2')}
          </div>
          {field('landmark', 'Landmark')}
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-3">
            {field('city', 'City or town')}
            {field('district', 'District')}
            {field('state', 'State')}
          </div>
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {field('postalCode', 'PIN code')}
            {field('country', 'Country')}
          </div>
        </fieldset>
      </div>
      <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
        <button className="btn btn-outline min-h-11" disabled={saving} type="submit">
          {saving ? 'Saving…' : 'Save contact details'}
        </button>
        <p aria-live="polite" className="text-base text-primary" role="status">
          {message ?? ''}
        </p>
      </div>
    </form>
  )
}
