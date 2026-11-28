import type { Application, Member } from '@/payload-types'

import { ARTIST_STEPS } from './forms/schemas'

/**
 * Where an artist's or trade application stands, as the member sees it (the founder's
 * AccountStart design and brief of 25 November 2026, section 11), in order:
 *
 *   not-sent   Not sent yet
 *   sent       Sent. We are reading it.
 *   question   We have a question for you (with a link to reply)
 *   confirm    Approved. Please confirm who you are
 *   checking   We are checking your details
 *   ready      Your agreement is ready to sign (only once the team marks identity as checked)
 *   signed     Signed. Welcome (member ID shown; the account tabs appear)
 *   declined   Not this time (with a short, kind letter by email)
 *   withdrawn  Withdrawn
 */

export type StatusKey =
  | 'not-sent'
  | 'sent'
  | 'question'
  | 'confirm'
  | 'checking'
  | 'ready'
  | 'signed'
  | 'declined'
  | 'withdrawn'

export type StatusLink = { label: string; href: string }

export type ApplicationStatus = {
  key: StatusKey
  line: string
  detail: string | null
  link: StatusLink | null
}

/** Where the identity check has got to, from the member's identity record */
export type IdentityProgress = { sent: boolean; checked: boolean }

export const longDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      })
    : ''

const formOf = (type: 'artist' | 'partner') =>
  type === 'artist' ? '/collaborate/artists' : '/collaborate/partners'

const agreementOf = (type: 'artist' | 'partner') =>
  type === 'artist' ? '/collaborate/artist-agreement' : '/collaborate/trade-agreement'

export const applicationStatus = (
  application: Application & { type: 'artist' | 'partner' },
  member: Pick<Member, 'artistId' | 'partnerId'>,
  identity: IdentityProgress,
): ApplicationStatus => {
  const type = application.type
  const id = type === 'artist' ? member.artistId : member.partnerId
  switch (application.stage) {
    case 'draft': {
      const done = new Set(application.completedSteps ?? [])
      const next = ARTIST_STEPS.findIndex((s) => !done.has(s))
      const step = next === -1 ? ARTIST_STEPS.length : next + 1
      const saved = `Last saved ${longDate(application.updatedAt)}.`
      return {
        key: 'not-sent',
        line: 'Not sent yet',
        detail: type === 'artist' ? `Step ${step} of ${ARTIST_STEPS.length}. ${saved}` : saved,
        link: { label: 'Carry on', href: formOf(type) },
      }
    }
    case 'submitted':
    case 'under-review':
      return {
        key: 'sent',
        line: 'Sent. We are reading it.',
        detail: `Sent on ${longDate(application.submittedAt)}. We will write to you within seven days.`,
        link: { label: 'View what you sent', href: formOf(type) },
      }
    case 'changes-requested':
      return {
        key: 'question',
        line: 'We have a question for you',
        detail: application.decisionNote?.trim() || null,
        link: { label: 'Reply', href: formOf(type) },
      }
    case 'approved':
      if (id)
        return {
          key: 'signed',
          line: 'Signed. Welcome',
          detail: `Your member ID is ${id}. Please quote it whenever you write to us.`,
          link: null,
        }
      if (identity.checked)
        return {
          key: 'ready',
          line: 'Your agreement is ready to sign',
          detail: 'We have checked your details. Your member ID is issued when you sign.',
          link: { label: 'Read and sign the agreement', href: agreementOf(type) },
        }
      if (identity.sent)
        return {
          key: 'checking',
          line: 'We are checking your details',
          detail:
            'We will email you once we have, and your agreement will then be ready to sign here.',
          link: null,
        }
      return {
        key: 'confirm',
        line: 'Approved. Please confirm who you are',
        detail:
          'We would like to work with you. Before we send our agreement, we need to be sure who you are. It takes about five minutes.',
        link: {
          label: 'Confirm who you are',
          href: type === 'artist' ? '/account/verify' : '/account/verify?for=partner',
        },
      }
    case 'rejected':
      return { key: 'declined', line: 'Not this time', detail: null, link: null }
    case 'withdrawn':
      return {
        key: 'withdrawn',
        line: 'Withdrawn',
        detail: application.withdrawnAt ? `On ${longDate(application.withdrawnAt)}.` : null,
        link: null,
      }
  }
}
