import { z } from 'zod'

import { countryName, phoneSchema } from '@/members/forms/schemas'
import { isWebUrl } from '@/members/forms/validators'
import { isEmail, normaliseEmail } from '@/security/constants'

import {
  CURATOR_AREAS,
  CURATOR_ERRORS as E,
  CURATOR_WANTS,
  CURATOR_YEARS,
  CV_MAX_BYTES,
  IDEA_MAX,
  NAME_MAX,
  PORTFOLIO_MAX_BYTES,
  PROJECTS_MAX,
  PROJECTS_MIN,
  TEXT_MAX,
} from './rules'

/**
 * A guest curator's application as the page sends it, checked: every problem at once, field by
 * field, in the founder's wording. The portfolio PDF and the CV are only promised here (name and
 * size); their bytes follow in parts and are checked again, for what they really are, when they
 * have all arrived (src/curators/flow.ts).
 */

export type PromisedFile = { name: string; size: number }

const tooLong = (max: number) => `Please keep this to ${max.toLocaleString('en-GB')} characters.`

const line = (max: number, message: string) =>
  z
    .string({ error: message })
    .transform((v) =>
      v
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .pipe(z.string().min(1, message).max(max, tooLong(max)))

const optionalLine = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .pipe(z.string().max(max, tooLong(max)))
    .transform((v) => v || undefined)

const optionalLink = z
  .string()
  .optional()
  .transform((v) => (v ?? '').trim())
  .refine((v) => !v || isWebUrl(v), E.link)
  .transform((v) => v || undefined)

const oneOf = (list: readonly { value: string }[], message: string) =>
  z.string({ error: message }).refine((v) => list.some((o) => o.value === v), message)

const thisYear = () => new Date().getFullYear()

const project = z.object({
  title: line(TEXT_MAX, E.projectTitle),
  year: z
    .union([z.string(), z.number()], { error: E.projectYear })
    .transform((v) => String(v).trim())
    .refine(
      (v) => /^\d{4}$/.test(v) && Number(v) >= 1950 && Number(v) <= thisYear() + 1,
      E.projectYear,
    ),
  place: line(TEXT_MAX, E.projectPlace),
  role: line(TEXT_MAX, E.projectRole),
  link: optionalLink,
})

export const curatorSchema = z.object({
  fullName: line(NAME_MAX, E.fullName),
  email: z
    .string({ error: E.email })
    .transform((v) => normaliseEmail(v))
    .refine((v) => isEmail(v), E.email),
  phone: phoneSchema,
  country: countryName,
  city: line(80, E.city),
  role: line(TEXT_MAX, E.role),
  years: oneOf(CURATOR_YEARS, E.years),
  areas: z
    .array(z.string(), { error: E.areas })
    .transform((list) => [...new Set(list)].filter((v) => CURATOR_AREAS.some((a) => a.value === v)))
    .refine((list) => list.length > 0, E.areas),
  languages: optionalLine(TEXT_MAX),
  portfolioLink: optionalLink,
  projects: z
    .array(project, { error: E.projects })
    .min(PROJECTS_MIN, E.projects)
    .max(PROJECTS_MAX, `Please tell us about ${PROJECTS_MAX} projects at most.`),
  wants: oneOf(CURATOR_WANTS, E.wants),
  idea: z
    .string()
    .optional()
    .transform((v) => (v ?? '').replace(/\r\n?/g, '\n').trim())
    .pipe(z.string().max(IDEA_MAX, tooLong(IDEA_MAX)))
    .transform((v) => v || undefined),
  fee: optionalLine(TEXT_MAX),
  start: optionalLine(TEXT_MAX),
})

export type CuratorAnswers = z.output<typeof curatorSchema>

export type CuratorInput = {
  answers: CuratorAnswers
  keepOnFile: boolean
  files: { portfolio?: PromisedFile; cv: PromisedFile }
}

const shownName = (name: unknown): string =>
  (
    String(name ?? '')
      .split(/[\\/]/)
      .pop() ?? ''
  )
    .replace(/[\u0000-\u001f\u007f]+/g, '')
    .slice(0, 120)

const promised = (value: unknown): PromisedFile | null => {
  const raw = (value ?? null) as Record<string, unknown> | null
  if (!raw || typeof raw !== 'object') return null
  const name = shownName(raw.name)
  const size = Number(raw.size)
  if (!name || !Number.isInteger(size) || size <= 0) return null
  return { name, size }
}

export type Checked =
  { ok: true; input: CuratorInput } | { ok: false; errors: Record<string, string>; message: string }

/** Every problem at once: the answers, the files, and the three boxes that must be ticked */
export const checkCurator = (body: Record<string, unknown>): Checked => {
  const errors: Record<string, string> = {}
  const parsed = curatorSchema.safeParse(body.data ?? {})
  if (!parsed.success)
    for (const issue of parsed.error.issues)
      errors[issue.path.join('.') || 'data'] ??= issue.message

  if (body.consent !== true) errors.consent = E.consent
  if (body.adult !== true) errors.adult = E.age
  if (body.accurate !== true) errors.accurate = E.accurate

  const files = (body.files ?? {}) as Record<string, unknown>
  const portfolio = files.portfolio ? promised(files.portfolio) : undefined
  if (files.portfolio && !portfolio) errors.portfolioFile = E.portfolioType
  else if (portfolio && !/\.pdf$/i.test(portfolio.name)) errors.portfolioFile = E.portfolioType
  else if (portfolio && portfolio.size > PORTFOLIO_MAX_BYTES)
    errors.portfolioFile = E.portfolioLarge
  // A link or a PDF: either will do, and the line shows even when other answers are wrong
  const link = parsed.success
    ? parsed.data.portfolioLink
    : String((body.data as Record<string, unknown> | undefined)?.portfolioLink ?? '').trim()
  if (!portfolio && !files.portfolio && !link) errors.portfolioLink ??= E.portfolio

  const cv = files.cv ? promised(files.cv) : null
  if (!files.cv) errors.cv = E.cv
  else if (!cv || !/\.(pdf|docx?)$/i.test(cv.name)) errors.cv = E.cvType
  else if (cv.size > CV_MAX_BYTES) errors.cv = E.cvLarge

  if (Object.keys(errors).length || !parsed.success || !cv)
    return { ok: false, errors, message: 'A few things need another look. They are marked below.' }
  return {
    ok: true,
    input: {
      answers: parsed.data,
      keepOnFile: body.keepOnFile === true,
      files: { ...(portfolio ? { portfolio } : {}), cv },
    },
  }
}
