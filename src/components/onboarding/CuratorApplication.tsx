'use client'

import React, { useRef, useState } from 'react'

import { BotCheckHelp } from '@/components/turnstile/BotCheckHelp'
import { useVisibleTurnstile } from '@/components/turnstile/useTurnstile'
import {
  CURATOR_ACCURATE,
  CURATOR_ADULT,
  CURATOR_AREAS,
  CURATOR_ERRORS as E,
  CURATOR_KEEP_ON_FILE,
  CURATOR_NOTICE,
  CURATOR_WANTS,
  CURATOR_YEARS,
  CV_ACCEPT,
  CV_MAX_BYTES,
  IDEA_MAX,
  PORTFOLIO_ACCEPT,
  PORTFOLIO_MAX_BYTES,
  PROJECTS_MAX,
  PROJECTS_MIN,
} from '@/curators/rules'
import { INDIA } from '@/forms/country/rules'
import { TURNSTILE_FIELD } from '@/security/turnstile'
import { HONEYPOT_FIELD } from '@/utilities/honeypot'

import { HowWeUseYourDetails } from './artist/steps'
import { CountrySelect, PhoneField } from './country'
import {
  Check,
  CheckGroup,
  ErrorSummary,
  type Errors,
  idFor,
  SelectField,
  TextArea,
  TextField,
} from './fields'

type Project = { title: string; year: string; place: string; role: string; link: string }

const emptyProject = (): Project => ({ title: '', year: '', place: '', role: '', link: '' })

const megabytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** Why a chosen file cannot go, in the founder's words; null if it can */
const portfolioProblem = (file: File) =>
  !/\.pdf$/i.test(file.name)
    ? E.portfolioType
    : file.size > PORTFOLIO_MAX_BYTES
      ? E.portfolioLarge
      : null
const cvProblem = (file: File) =>
  !/\.(pdf|docx?)$/i.test(file.name) ? E.cvType : file.size > CV_MAX_BYTES ? E.cvLarge : null

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

/** A section of the form: its small heading in the left column, the fields on the right */
const Part: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <section className="house-sec border-t border-[#e3cfa3]">
    <div className="house-lab">
      <p className="house-small">{label}</p>
    </div>
    <div className="house-con max-w-[780px]">{children}</div>
  </section>
)

/** A file chosen from the device: a button, then its name and size with a way to remove it */
const FilePick: React.FC<{
  name: string
  label: string
  hint: string
  button: string
  accept: string
  file: File | null
  error?: string
  onFile: (file: File | null) => void
}> = ({ name, label, hint, button, accept, file, error, onFile }) => {
  const input = useRef<HTMLInputElement>(null)
  const id = idFor(name)
  return (
    <div id={id}>
      <p className="label mb-1">{label}</p>
      <p className="muted mb-3 text-base" id={`${id}-hint`}>
        {hint}
      </p>
      <input
        accept={accept}
        aria-describedby={[`${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ')}
        aria-label={label}
        className="sr-only"
        onChange={(e) => {
          onFile(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
        ref={input}
        tabIndex={-1}
        type="file"
      />
      {file ? (
        <p className="flex flex-wrap items-baseline gap-x-4">
          <span className="break-all">
            {file.name} <span className="muted">({megabytes(file.size)})</span>
          </span>
          <button className="link link-caps min-h-11" onClick={() => onFile(null)} type="button">
            Remove
          </button>
        </p>
      ) : (
        <button className="apply-btn2" onClick={() => input.current?.click()} type="button">
          {button}
        </button>
      )}
      {error && (
        <p className="mt-2 text-base italic text-destructive" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * The guest curator form (the founder's ApplyCurator design): no account, one page. How the
 * details are used, about them, their practice, their work (a portfolio as a link or a PDF, the CV,
 * and two or three past projects), what they would like to work on, and the statements and bot
 * check before it is sent. The files travel in parts after the answers (src/curators/flow.ts).
 */
export const CuratorApplication: React.FC<{ formToken: string }> = ({ formToken }) => {
  const [values, setValues] = useState<Record<string, string>>({ country: INDIA })
  const [areas, setAreas] = useState<string[]>([])
  const [projects, setProjects] = useState<Project[]>(() =>
    Array.from({ length: PROJECTS_MIN }, emptyProject),
  )
  const [portfolio, setPortfolio] = useState<File | null>(null)
  const [cv, setCv] = useState<File | null>(null)
  const [ticks, setTicks] = useState({ consent: false, adult: false, accurate: false })
  const [keepOnFile, setKeepOnFile] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [reference, setReference] = useState<string | null>(null)
  const [honeypot, setHoneypot] = useState('')
  const [refused, setRefused] = useState(false)
  const bot = useVisibleTurnstile('curator')

  const set = (key: string) => (value: string) => setValues((v) => ({ ...v, [key]: value }))
  const tick = (key: keyof typeof ticks) => (value: boolean) =>
    setTicks((t) => ({ ...t, [key]: value }))
  const setProject = (index: number, key: keyof Project) => (value: string) =>
    setProjects((list) => list.map((p, i) => (i === index ? { ...p, [key]: value } : p)))

  const choose =
    (setFile: (f: File | null) => void, field: string, check: (f: File) => string | null) =>
    (file: File | null) => {
      const wrong = file ? check(file) : null
      setErrors(({ [field]: _gone, ...rest }) => (wrong ? { ...rest, [field]: wrong } : rest))
      if (!wrong) setFile(file)
    }

  const fail = (data: Record<string, unknown>) => {
    setErrors((data.errors as Errors) ?? {})
    setProblem(String(data.message ?? E.failed))
    window.scrollTo({ top: 0 })
  }

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    setErrors({})
    setProblem(null)
    setRefused(false)
    setSending(true)
    try {
      const started = await post(
        '/next/curators',
        JSON.stringify({
          data: { ...values, areas, projects },
          consent: ticks.consent,
          adult: ticks.adult,
          accurate: ticks.accurate,
          keepOnFile,
          files: {
            ...(portfolio ? { portfolio: { name: portfolio.name, size: portfolio.size } } : {}),
            ...(cv ? { cv: { name: cv.name, size: cv.size } } : {}),
          },
          formToken,
          [HONEYPOT_FIELD]: honeypot,
          [TURNSTILE_FIELD]: bot.token,
        }),
        { 'Content-Type': 'application/json' },
      )
      // A token is good for one request: the check runs again for the next
      bot.reset()
      if (!started.ok && started.data.retryCheck) return setRefused(true)
      if (!started.ok) return fail(started.data)

      // The files, part by part, in the order promised: the portfolio first, then the CV
      const id = Number(started.data.id)
      const token = String(started.data.token)
      const partBytes = Number(started.data.partBytes)
      const files = [portfolio, cv].filter((f): f is File => Boolean(f))
      for (const [index, file] of files.entries()) {
        const parts = Math.ceil(file.size / partBytes)
        for (let part = 0; part < parts; part++) {
          setProgress(
            parts > 1
              ? `Sending “${file.name}”: part ${part + 1} of ${parts}…`
              : `Sending “${file.name}”…`,
          )
          const result = await post(
            `/next/curators/part?id=${id}&file=${index}&part=${part}`,
            file.slice(part * partBytes, (part + 1) * partBytes),
            { 'Content-Type': 'application/octet-stream', 'X-Upload-Token': token },
          )
          if (!result.ok) return fail(result.data)
        }
      }
      setProgress('Sending your application…')
      const finished = await post('/next/curators/finish', JSON.stringify({ id, token }), {
        'Content-Type': 'application/json',
      })
      if (!finished.ok) return fail(finished.data)
      setReference(String(finished.data.reference))
      window.scrollTo({ top: 0 })
    } catch {
      setProblem('We could not reach our server. Please check your connection and try again.')
    } finally {
      setSending(false)
      setProgress(null)
    }
  }

  if (reference) {
    return (
      <section className="house-hero" role="status">
        <div className="house-lab">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" className="h-auto w-14" height={56} src="/brand/wreath.png" width={56} />
        </div>
        <div className="house-con max-w-[780px]">
          <p className="house-small">Guest curators</p>
          <h1 className="apply-h1">Thank you. Your application has reached us.</h1>
          <p className="house-lead">
            Your application number is{' '}
            <strong className="font-medium tracking-wider">{reference}</strong>. We read every
            application ourselves and reply within seven days. If your work suits a coming
            collection or a client’s project, we will write to arrange a conversation.
          </p>
        </div>
      </section>
    )
  }

  const wantsId = idFor('wants')

  return (
    <>
      <section className="house-hero">
        <div className="house-lab">
          <p className="house-small">Guest curators</p>
        </div>
        <div className="house-con max-w-[780px]">
          <h1 className="apply-h1">Curate with us</h1>
          <p className="house-lead">
            PJK works with guest curators one project at a time: shaping a collection for Phulhaar
            Gallery, or choosing and placing art for a private collection, an event or a film, stage
            or photography set. Each project is agreed in writing, with its scope, dates and fee,
            before it begins.
          </p>
          <p className="house-p mt-4">
            It takes about ten minutes, and you do not need an account. Have your CV and a portfolio
            to hand. Applying is free, and we reply within seven days.
          </p>
        </div>
      </section>

      <form noValidate onSubmit={send}>
        {(problem || Object.keys(errors).length > 0) && (
          <section className="house-sec border-t border-[#e3cfa3]">
            <div className="house-lab" />
            <div className="house-con max-w-[780px]">
              <ErrorSummary errors={errors} />
              {problem && Object.keys(errors).length === 0 && (
                <p className="text-base italic text-destructive" role="alert">
                  {problem}
                </p>
              )}
            </div>
          </section>
        )}

        <Part label="Before you begin">
          <HowWeUseYourDetails
            checked={ticks.consent}
            error={errors.consent}
            intro={null}
            name="consent"
            onValue={tick('consent')}
            rows={CURATOR_NOTICE}
          />
        </Part>

        <Part label="About you">
          <div className="grid gap-y-9">
            <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
              <TextField
                autoComplete="name"
                errors={errors}
                label="Your full name"
                name="fullName"
                onValue={set('fullName')}
                value={values.fullName}
              />
              <TextField
                autoComplete="email"
                errors={errors}
                inputMode="email"
                label="Email"
                name="email"
                onValue={set('email')}
                spellCheck={false}
                type="email"
                value={values.email}
              />
            </div>
            <PhoneField
              errors={errors}
              label="Phone"
              name="phone"
              onValue={set('phone')}
              value={values.phone}
            />
            <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
              <CountrySelect
                className="max-w-none"
                errors={errors}
                name="country"
                onValue={set('country')}
                value={values.country}
              />
              <TextField
                autoComplete="address-level2"
                errors={errors}
                label="City"
                name="city"
                onValue={set('city')}
                value={values.city}
              />
            </div>
            <Check
              checked={ticks.adult}
              error={errors.adult}
              label={CURATOR_ADULT}
              name="adult"
              onValue={tick('adult')}
            />
          </div>
        </Part>

        <Part label="Your practice">
          <div className="grid gap-y-9">
            <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
              <TextField
                autoComplete="organization-title"
                errors={errors}
                label="Your current role"
                name="role"
                onValue={set('role')}
                placeholder="For example, independent curator or art adviser"
                value={values.role}
              />
              <SelectField
                errors={errors}
                label="Years curating"
                name="years"
                onValue={set('years')}
                options={CURATOR_YEARS}
                placeholder="Choose…"
                value={values.years}
              />
            </div>
            <CheckGroup
              error={errors.areas}
              hint="Choose all that apply."
              legend="What do you curate?"
              name="areas"
              onValue={setAreas}
              options={CURATOR_AREAS}
              value={areas}
            />
            <TextField
              errors={errors}
              label="Languages you work in"
              name="languages"
              onValue={set('languages')}
              optional
              placeholder="For example, English, Hindi, Urdu"
              value={values.languages}
            />
          </div>
        </Part>

        <Part label="Your work">
          <div className="grid gap-y-11">
            <fieldset className="grid gap-y-4">
              <legend className="label mb-1">Portfolio</legend>
              <p className="muted -mt-2 text-base">
                A link to your portfolio, or a PDF of up to 20 MB.
              </p>
              <TextField
                autoComplete="url"
                errors={errors}
                label="Portfolio link"
                name="portfolioLink"
                onValue={set('portfolioLink')}
                placeholder="https://"
                type="url"
                value={values.portfolioLink}
              />
              <p className="muted text-base">or</p>
              <FilePick
                accept={PORTFOLIO_ACCEPT}
                button="Upload a PDF"
                error={errors.portfolioFile}
                file={portfolio}
                hint="One PDF, up to 20 MB."
                label="Portfolio PDF"
                name="portfolioFile"
                onFile={choose(setPortfolio, 'portfolioFile', portfolioProblem)}
              />
            </fieldset>

            <FilePick
              accept={CV_ACCEPT}
              button="Choose a file"
              error={errors.cv}
              file={cv}
              hint="PDF or Word, up to 5 MB."
              label="Your CV"
              name="cv"
              onFile={choose(setCv, 'cv', cvProblem)}
            />

            <fieldset className="grid gap-y-8" id={idFor('projects')}>
              <legend className="label mb-1">Two or three past projects</legend>
              <p className="muted -mt-6 text-base">
                Exhibitions, collections or placements you shaped. Tell us what your own part was.
              </p>
              {errors.projects && (
                <p className="text-base italic text-destructive">{errors.projects}</p>
              )}
              {projects.map((project, i) => (
                <div className="grid gap-y-6 border-l-2 border-[#e3cfa3] pl-5" key={i}>
                  <p className="house-small m-0">Project {i + 1}</p>
                  <div className="grid gap-x-10 gap-y-6 sm:grid-cols-[1fr_8rem]">
                    <TextField
                      errors={errors}
                      label="Title"
                      name={`projects.${i}.title`}
                      onValue={setProject(i, 'title')}
                      value={project.title}
                    />
                    <TextField
                      errors={errors}
                      inputMode="numeric"
                      label="Year"
                      maxLength={4}
                      name={`projects.${i}.year`}
                      onValue={setProject(i, 'year')}
                      value={project.year}
                    />
                  </div>
                  <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
                    <TextField
                      errors={errors}
                      label="Where, or for whom"
                      name={`projects.${i}.place`}
                      onValue={setProject(i, 'place')}
                      placeholder="A gallery, a venue or a client"
                      value={project.place}
                    />
                    <TextField
                      errors={errors}
                      label="Your role"
                      name={`projects.${i}.role`}
                      onValue={setProject(i, 'role')}
                      placeholder="For example, lead curator, or research and selection"
                      value={project.role}
                    />
                  </div>
                  <TextField
                    errors={errors}
                    label="Link"
                    name={`projects.${i}.link`}
                    onValue={setProject(i, 'link')}
                    optional
                    placeholder="https://"
                    type="url"
                    value={project.link}
                  />
                  {i >= PROJECTS_MIN && (
                    <button
                      className="link link-caps min-h-11 justify-self-start"
                      onClick={() => setProjects((list) => list.filter((_, n) => n !== i))}
                      type="button"
                    >
                      Remove this project
                    </button>
                  )}
                </div>
              ))}
              {projects.length < PROJECTS_MAX && (
                <button
                  className="link link-caps min-h-11 justify-self-start"
                  onClick={() => setProjects((list) => [...list, emptyProject()])}
                  type="button"
                >
                  Add another project
                </button>
              )}
            </fieldset>
          </div>
        </Part>

        <Part label="Working with us">
          <div className="grid gap-y-9">
            <fieldset
              aria-describedby={errors.wants ? `${wantsId}-error` : undefined}
              className="grid gap-y-3"
              id={wantsId}
            >
              <legend className="label mb-2">What would you like to work on?</legend>
              {CURATOR_WANTS.map((option) => (
                <label className="flex min-h-11 items-start gap-3 text-lg" key={option.value}>
                  <input
                    checked={values.wants === option.value}
                    className="mt-1.5 size-[18px] flex-none accent-[var(--primary)]"
                    name="wants"
                    onChange={() => set('wants')(option.value)}
                    type="radio"
                    value={option.value}
                  />
                  <span>
                    {option.label}
                    {'hint' in option && (
                      <span className="muted block text-base">{option.hint}</span>
                    )}
                  </span>
                </label>
              ))}
              {errors.wants && (
                <p className="text-base italic text-destructive" id={`${wantsId}-error`}>
                  {errors.wants}
                </p>
              )}
            </fieldset>
            <TextArea
              errors={errors}
              hint="A theme, a medium or a group of artists, in a few lines."
              label="A collection you would like to curate"
              limit={IDEA_MAX}
              name="idea"
              onValue={set('idea')}
              optional
              rows={4}
              value={values.idea}
            />
            <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
              <TextField
                errors={errors}
                hint="By project or by day, in any currency."
                label="Your usual fee"
                name="fee"
                onValue={set('fee')}
                optional
                value={values.fee}
              />
              <TextField
                errors={errors}
                label="When could you start?"
                name="start"
                onValue={set('start')}
                optional
                placeholder="For example, from January"
                value={values.start}
              />
            </div>
          </div>
        </Part>

        <Part label="Send">
          <div className="grid gap-y-4">
            <Check
              checked={ticks.accurate}
              error={errors.accurate}
              label={CURATOR_ACCURATE}
              name="accurate"
              onValue={tick('accurate')}
            />
            <Check
              checked={keepOnFile}
              label={
                <>
                  {CURATOR_KEEP_ON_FILE} <span className="muted italic">(Optional)</span>
                </>
              }
              name="keepOnFile"
              onValue={setKeepOnFile}
            />
          </div>

          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor={`${HONEYPOT_FIELD}-curator`}>Company website</label>
            <input
              autoComplete="off"
              id={`${HONEYPOT_FIELD}-curator`}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              value={honeypot}
            />
          </div>

          {bot.enabled && (
            <div className="mt-10">
              <p className="label mb-2">Security check</p>
              <div className="max-w-md">{bot.element}</div>
            </div>
          )}
          {(bot.problem ?? (refused ? 'failed' : null)) && (
            <BotCheckHelp problem={bot.problem ?? 'failed'} />
          )}

          <div className="apply-actions mt-10">
            <button
              className="house-btn"
              disabled={sending || (bot.enabled && !bot.token)}
              type="submit"
            >
              {sending ? 'Sending…' : 'Send my application'}
            </button>
          </div>
          {progress && (
            <p className="muted mt-4 text-base" role="status">
              {progress}
            </p>
          )}
          <p className="muted mt-8 text-base">
            Buying art for your own clients’ projects?{' '}
            <a className="link" href="/collaborate/partners">
              Apply for a trade account instead.
            </a>
          </p>
        </Part>
      </form>
    </>
  )
}
