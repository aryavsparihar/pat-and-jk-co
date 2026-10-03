import type { Field, FieldAccess } from 'payload'

/**
 * Anything an artist shows the public goes through staff first. A member edits a working copy;
 * staff approve it, and only then is a snapshot of it published, which is all the public ever
 * reads. Editing again leaves the published snapshot in place until the new version is approved.
 *
 * Never named "status": that is Payload's word for drafts, and this is not that mechanism.
 */

export const REVIEW_STATES = [
  { label: 'Nothing waiting', value: 'none' },
  { label: 'Waiting for review', value: 'pending' },
  { label: 'Approved and public', value: 'approved' },
  { label: 'Changes asked for', value: 'changes-requested' },
] as const
export type ReviewState = (typeof REVIEW_STATES)[number]['value']

const nobody: FieldAccess = () => false

/** The review record: state, the note to the member, who decided and when. Server-written only. */
export const reviewGroup = (name: string, label: string): Field => ({
  name,
  label,
  type: 'group',
  access: { create: nobody, update: nobody },
  admin: { readOnly: true },
  fields: [
    {
      name: 'state',
      type: 'select',
      defaultValue: 'none',
      options: REVIEW_STATES.map(({ label, value }) => ({ label, value })),
      index: true,
    },
    { name: 'note', type: 'textarea', admin: { description: 'Sent to the member.' } },
    { name: 'submittedAt', type: 'date' },
    { name: 'reviewedAt', type: 'date' },
    { name: 'reviewedBy', type: 'relationship', relationTo: 'users' },
  ],
})

/** The approved snapshot the public reads, and when it was approved. Server-written only. */
export const publishedFields = (name: string): Field[] => [
  {
    name,
    type: 'json',
    access: { create: nobody, update: nobody },
    admin: {
      readOnly: true,
      description: 'What the public sees: the last version staff approved.',
    },
  },
  {
    name: `${name}At`,
    type: 'date',
    access: { create: nobody, update: nobody },
    admin: { readOnly: true, position: 'sidebar' },
  },
]
