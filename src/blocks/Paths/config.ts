import type { Block } from 'payload'

import { eyebrowField, headingField, introField } from '@/fields/common'

const path = (
  name: 'artists' | 'partners',
  defaults: { heading: string; text: string; linkLabel: string },
) => ({
  name,
  type: 'group' as const,
  fields: [
    { name: 'heading', type: 'text' as const, required: true, defaultValue: defaults.heading },
    { name: 'text', type: 'textarea' as const, required: true, defaultValue: defaults.text },
    { name: 'linkLabel', type: 'text' as const, required: true, defaultValue: defaults.linkLabel },
  ],
})

/**
 * The two ways in: apply as an artist (to /collaborate/artists) or as a partner
 * (/collaborate/partners), with a line for members who only need to sign in. The words are the
 * editor's; where each path leads is fixed, because the onboarding lives there.
 */
export const Paths: Block = {
  slug: 'paths',
  interfaceName: 'PathsBlock',
  labels: { singular: 'Ways to work with us', plural: 'Ways to work with us' },
  fields: [
    eyebrowField(),
    headingField(),
    introField(),
    path('artists', {
      heading: 'Artists',
      text: 'Show and sell your work through Phulhaar Gallery by PJK.',
      linkLabel: 'Apply as an artist',
    }),
    path('partners', {
      heading: 'Partners',
      text: 'Curators, interior designers and decorators; designers and engineers; galleries, institutions and businesses.',
      linkLabel: 'Apply as a partner',
    }),
    {
      name: 'signInText',
      type: 'text',
      defaultValue: 'Already applied? Sign in to see where your application has got to.',
      admin: { description: 'A line beneath the two paths, linking to the member sign-in.' },
    },
  ],
}
