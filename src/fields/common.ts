import type { TextField, TextareaField } from 'payload'

/** Small spaced-caps label shown above a heading, e.g. "WHO WE ARE". */
export const eyebrowField = (overrides: Partial<TextField> = {}): TextField => ({
  name: 'eyebrow',
  type: 'text',
  admin: {
    description: 'Short label shown above the heading in small capitals (optional).',
  },
  ...overrides,
})

export const headingField = (overrides: Partial<TextField> = {}): TextField => ({
  name: 'heading',
  type: 'text',
  admin: {
    description: 'Wrap words in *asterisks* to set them in italics, e.g. "A *quiet* revolution".',
  },
  ...overrides,
})

export const introField = (overrides: Partial<TextareaField> = {}): TextareaField => ({
  name: 'intro',
  type: 'textarea',
  ...overrides,
})
