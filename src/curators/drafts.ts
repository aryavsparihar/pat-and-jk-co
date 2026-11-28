/**
 * The two letters the team sends a guest curator from the Curators screen (the founder's
 * CuratorEmails design), as drafts: the screen opens each for editing before it goes. Plain text,
 * so the browser can show it; src/curators/emails.ts lays it out and sends it.
 */

export type CuratorEmailKind = 'talk' | 'decline'

const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] || fullName

/** The draft each button opens: the subject and the letter, as the design words them */
export const curatorEmailDraft = (
  kind: CuratorEmailKind,
  curator: { reference: string; fullName: string; keepOnFile: boolean },
): { subject: string; body: string } => {
  const ref = curator.reference
  const paragraphs =
    kind === 'talk'
      ? [
          'We have looked through your portfolio with real interest, and would like to talk about working together.',
          'Guest curators work with us one project at a time. Before any project begins, we agree its scope, dates and fee with you in writing.',
          `Please write to hello@pjk.co.in with two or three times that suit you for a first conversation, quoting ${ref}. We work on Indian Standard Time, and are happy to find an hour that suits yours.`,
        ]
      : [
          'Thank you for your application, and for the care you put into it. We are not able to offer you a project at the moment.',
          curator.keepOnFile
            ? 'As you asked, we will keep your application on file for 12 months, and write if a later project suits your work. If you would rather we deleted it now, write to compliance@pjk.co.in.'
            : 'We will delete your application within 90 days.',
        ]
  return {
    subject: 'Your application to curate with PJK',
    body: [`Dear ${firstName(curator.fullName)},`, ...paragraphs].join('\n\n'),
  }
}
