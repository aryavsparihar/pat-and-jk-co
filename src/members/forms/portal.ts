import { z } from 'zod'

import { MEDIUMS } from './schemas'
import { isWebUrl } from './validators'

/**
 * What an approved member may send from their account. Shared by the browser and the server; the
 * server's check is the one that counts. Messages are plain and never repeat a value back.
 */

// The account forms send every field, an empty one as null, and an edit replaces what was there:
// so empty means null, which clears the field, where undefined would leave the old value in place
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Please keep this under ${max} characters.`)
    .nullish()
    .transform((v) => (v ? v : null))

const optionalNumber = (min: number, max: number, message: string) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number({ error: message }).min(min, message).max(max, message).nullable(),
  )

/**
 * Characters a file or folder name cannot hold on Windows, macOS or Google Drive's download: the
 * work's name is also its folder and file names in the artist's Drive folder
 */

/** "https://drive.google.com/drive/folders/<id>", from any of the ways Drive writes a folder link */
export const DRIVE_FOLDER =
  /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,100})(?:[/?#].*)?$/

export const driveFolderSchema = z.object({
  url: z
    .string()
    .trim()
    .max(400, 'That link is too long to be a Google Drive folder.')
    .refine(
      (v) => v === '' || DRIVE_FOLDER.test(v),
      'Please paste the link to a Google Drive folder. It starts https://drive.google.com/drive/folders/',
    )
    // Kept in one plain form, whatever was pasted: no sharing or tracking parts
    .transform((v) =>
      v ? `https://drive.google.com/drive/folders/${DRIVE_FOLDER.exec(v)![1]}` : null,
    ),
})

const MEDIUM_VALUES = MEDIUMS.map((m) => m.value) as [string, ...string[]]

export const profileSchema = z.object({
  displayName: z
    .string({ error: 'Please give the name you would like shown.' })
    .trim()
    .min(1, 'Please give the name you would like shown.')
    .max(120, 'Please keep the name under 120 characters.'),
  bio: optionalText(2000),
  statement: optionalText(2000),
  links: z
    .array(
      z.object({
        label: z.string().trim().max(60).optional(),
        url: z
          .string()
          .trim()
          .refine((v) => isWebUrl(v), 'Please give a full web address, starting https://.'),
      }),
    )
    .max(5, 'Up to five links, please.')
    .default([]),
  portrait: z.coerce.number().int().positive().optional(),
  mediums: z.array(z.enum(MEDIUM_VALUES)).max(10).default([]),
  exhibitions: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'Please give the exhibition a title.').max(160),
        venue: optionalText(160),
        year: optionalNumber(1900, new Date().getFullYear() + 1, 'Please give a year.'),
      }),
    )
    .max(30)
    .default([]),
})

export type ProfileInput = z.infer<typeof profileSchema>

export const contactSchema = z.object({
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => !v || /^\+?[\d\s-]{7,20}$/.test(v), 'Please give a phone number we can call.')
    .optional(),
  contactAddress: z
    .object({
      line1: optionalText(120),
      line2: optionalText(120),
      landmark: optionalText(120),
      city: optionalText(80),
      district: optionalText(80),
      state: optionalText(80),
      postalCode: optionalText(12),
      country: optionalText(80),
    })
    .optional(),
})

export type ContactInput = z.infer<typeof contactSchema>
