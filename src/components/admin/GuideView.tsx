import type { AdminViewServerProps } from 'payload'
import React from 'react'

const sections = [
  {
    title: 'Changing what a page says',
    steps: [
      'Open Website → Pages and choose the page.',
      'Under the Content tab, each grey bar is a block: a hero, some text, a list, a form.',
      'Click a block to open it, edit the wording, then press Publish. The live site updates within seconds.',
      'Wrap a word in *asterisks* in a heading to set it in italics.',
    ],
  },
  {
    title: 'Adding or moving a section',
    steps: [
      'Inside a page, scroll to the bottom of the Content tab and press “Add block”.',
      'Pick a block — “Text” for writing, “Image & text”, “Quote”, “Call to action”, and so on.',
      'Drag the handle on the left of any block to move it up or down. Use the ⋯ menu to duplicate or delete it.',
      'Press Preview at any time to see the page before anyone else does.',
    ],
  },
  {
    title: 'Publishing later, or undoing',
    steps: [
      'Save keeps a draft that only you can see. Publish makes it live.',
      'Next to Publish, choose “Schedule publish” to go live on a chosen date.',
      'The Versions tab keeps every published version — open an old one and restore it.',
    ],
  },
  {
    title: 'Photographs',
    steps: [
      'Upload under Website → Media, or straight from the block you are editing.',
      'Always fill in Alt text: one short sentence describing the picture, for people using screen readers.',
      'Large photographs are fine. The site makes its own smaller copies automatically.',
    ],
  },
  {
    title: 'Enquiries from the website',
    steps: [
      'Every message sent through a form appears under Enquiries → Form Submissions, newest first.',
      'To change the questions, or who gets the notification email, open Enquiries → Forms.',
    ],
  },
  {
    title: 'The people who can sign in',
    steps: [
      'Only @pjk.co.in addresses can have an account, and every sign-in needs a one-time code emailed to that address.',
      'Someone new should go to /admin-access and press “Request access”.',
      'Their request appears under Administration → Access requests. Setting it to “Approved” creates their account and emails them a link to choose a password.',
      'To stop someone signing in, set their account to “Suspended” under Administration → Users. Nothing they made is lost.',
    ],
  },
]

/** A plain-language guide, inside the panel itself, at /admin/guide. */
export const GuideView: React.FC<AdminViewServerProps> = () => (
  <div className="gutter--left gutter--right" style={{ maxWidth: 820, padding: '2rem 0 4rem' }}>
    <h1>How to use this panel</h1>
    <p style={{ opacity: 0.75, marginTop: '0.5rem', marginBottom: '2rem' }}>
      Everything on the website is edited here. Changes you publish appear on the live site within
      seconds — nothing needs to be rebuilt, and no code has to change.
    </p>

    {sections.map((section) => (
      <section key={section.title} style={{ marginBottom: '2.25rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>{section.title}</h2>
        <ol style={{ paddingLeft: '1.25rem', lineHeight: 1.7 }}>
          {section.steps.map((step) => (
            <li key={step} style={{ marginBottom: '0.35rem' }}>
              {step}
            </li>
          ))}
        </ol>
      </section>
    ))}

    <p style={{ opacity: 0.75 }}>
      Stuck, or something looks wrong? Tell the technical director rather than experimenting on the
      live site — and remember that every version is kept, so nothing is ever truly lost.
    </p>
  </div>
)

export default GuideView
