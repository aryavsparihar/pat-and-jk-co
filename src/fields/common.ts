import type { TextField, TextareaField } from 'payload'

type TextOverrides = { required?: boolean; defaultValue?: string; admin?: TextField['admin'] }

/** Small spaced-caps label shown above a heading, e.g. "WHO WE ARE". */
export const eyebrowField = (overrides: TextOverrides = {}): TextField =>
  ({
    name: 'eyebrow',
    type: 'text',
    admin: {
      description: 'Short label shown above the heading in small capitals (optional).',
    },
    ...overrides,
  }) as TextField

export const headingField = (overrides: TextOverrides = {}): TextField =>
  ({
    name: 'heading',
    type: 'text',
    admin: {
      description: 'Wrap words in *asterisks* to set them in italics, e.g. "A *quiet* revolution".',
    },
    ...overrides,
  }) as TextField

export const introField = (overrides: Partial<TextareaField> = {}): TextareaField => ({
  name: 'intro',
  type: 'textarea',
  ...overrides,
})
