/**
 * "I’m writing about": the contact form's subjects, in the founder's four groups (his brief of
 * 25 November 2026, section 8, and the Contact design). Each says which inbox it goes to: privacy
 * and data to compliance@, accounts and the website to tech@, everything else to business@
 * (section 11). Some add a short note under the list, as the design words them.
 *
 * The values are what links use (/contact?about=working-for-pjk) and what is stored.
 */

export type Inbox = 'business' | 'tech' | 'compliance'

export type TopicNote = {
  /** Text before the link, the link's words and where it goes, and text after it */
  before: string
  link?: { label: string; href: string }
  after?: string
}

export type Topic = { value: string; label: string; inbox: Inbox; note?: TopicNote }

export type TopicGroup = { label: string; topics: Topic[] }

export const TOPIC_GROUPS: TopicGroup[] = [
  {
    label: 'PAT & J.K. Co.',
    topics: [
      { value: 'general', label: 'General enquiry', inbox: 'business' },
      { value: 'partnership', label: 'A partnership or collaboration', inbox: 'business' },
      {
        value: 'working-for-pjk',
        label: 'Working for PJK',
        inbox: 'business',
        note: {
          before: 'See ',
          link: { label: 'current openings', href: '/collaborate#openings' },
          after: ', and attach your CV or portfolio below.',
        },
      },
      { value: 'suppliers', label: 'Suppliers and services', inbox: 'business' },
      { value: 'press', label: 'Press and media', inbox: 'business' },
      { value: 'visiting', label: 'Visiting the office, by appointment', inbox: 'business' },
    ],
  },
  {
    label: 'Phulhaar Gallery',
    topics: [
      {
        value: 'commission',
        label: 'Commissioning a work',
        inbox: 'business',
        note: {
          before:
            'Tell us what you have in mind, with the size, your budget and any references attached.',
        },
      },
      { value: 'trade-account', label: 'A trade account', inbox: 'business' },
      {
        value: 'represented',
        label: 'Being represented as an artist',
        inbox: 'business',
        note: {
          before: 'To apply, please use the ',
          link: { label: 'artist application', href: '/collaborate/artists' },
          after: '.',
        },
      },
      {
        value: 'guest-curator',
        label: 'Becoming a guest curator',
        inbox: 'business',
        note: {
          before: 'Please use the ',
          link: { label: 'guest curator form', href: '/collaborate/curators' },
          after: '.',
        },
      },
    ],
  },
  {
    label: 'Curatorial support',
    topics: [
      {
        value: 'curatorial-collection',
        label: 'For a collection or an event',
        inbox: 'business',
      },
      {
        value: 'curatorial-set',
        label: 'For a film, stage or photo set',
        inbox: 'business',
        note: { before: 'Tell us about the production, its dates and the look you are after.' },
      },
    ],
  },
  {
    label: 'Help',
    topics: [
      { value: 'account', label: 'My account or application', inbox: 'tech' },
      { value: 'website', label: 'Website problem', inbox: 'tech' },
      { value: 'privacy', label: 'Privacy and my data', inbox: 'compliance' },
    ],
  },
]

const ALL = TOPIC_GROUPS.flatMap((group) => group.topics.map((topic) => ({ ...topic, group })))

/** The subject with that value, and its group; undefined for anything else */
export const topicFor = (value: unknown) =>
  typeof value === 'string' ? ALL.find((topic) => topic.value === value) : undefined

/** "Phulhaar Gallery: Commissioning a work", as the subject line and the record show it */
export const topicTitle = (value: string): string => {
  const topic = topicFor(value)
  return topic ? `${topic.group.label}: ${topic.label}` : value
}

/** What the visitor is told above the list, before choosing */
export const BUYING_NOTE = {
  before:
    'Buying a work, or asking about an order or a work’s provenance? These are handled by Phulhaar Gallery at ',
  link: { label: 'phulhaar.com', href: 'https://phulhaar.com' },
  after: ', which opens in early 2027.',
}
