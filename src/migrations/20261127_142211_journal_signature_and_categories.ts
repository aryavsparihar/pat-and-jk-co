import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The Journal, to the founder's brief of 25 November 2026 (section 6):
 *
 * - a post can end with the proprietor's signature (a new checkbox);
 * - the categories become News, Artists and Notes. The three there were are renamed, not
 *   deleted: Announcements becomes News, Gallery Artists and Craft Notes, so every post keeps
 *   its category;
 * - the first post, "Introducing PAT & J.K. Co.", takes the wording of his design
 *   (JournalPost.html), keeps its date of 20 September 2026, goes under News and ends with his
 *   signature. Its earlier wording stays in the post's history in the admin.
 *
 * A database without the PJK brand, its categories or the post is left alone.
 */
const TENANT = 'pjk'
const POST = 'introducing-pat-and-jk-co'
const RENAMES = [
  { from: 'announcements', slug: 'news', title: 'News' },
  { from: 'gallery', slug: 'artists', title: 'Artists' },
  { from: 'craft', slug: 'notes', title: 'Notes' },
] as const

const EXCERPT =
  'Why the house came first, what its ventures will share, and where Phulhaar Gallery begins.'

/** The body: P a paragraph, H a heading, Q a quotation, L a paragraph with [links](/path) */
const BODY: [string, string][] = [
  [
    'P',
    'PAT & J.K. Co., or PJK, is a house in Kathua, in India\u2019s far north, for ventures in art and craft. This is the first entry in its Journal, and the plainest account we can give of why it exists and how it means to work.',
  ],
  ['H', 'Why a house first'],
  [
    'P',
    'Every small venture spends its first year on things that have nothing to do with why it exists: a name, a website, the books, the suppliers, the contracts, a way of answering enquiries. By the time all of that is settled, the attention that should have gone into the work has gone into the scaffolding instead.',
  ],
  [
    'P',
    'We would rather build the scaffolding once, build it properly, and keep it. So PJK holds what every venture needs and none should have to invent for itself: the standard of the work, the way people are dealt with, the daily running and the technology underneath. What is left to each venture is the thing it was started to do.',
  ],
  ['H', 'Each under its own name'],
  [
    'P',
    'Every venture under PJK trades under its own name, speaks in its own voice and answers to its own clients. A gallery should feel like a gallery. Nobody choosing a painting wants the sense of dealing with the art wing of a holding company.',
  ],
  [
    'P',
    'What the ventures share stays out of sight: one standard, and the same few people behind the scenes, who will not let a shortcut through.',
  ],
  ['H', 'What passes between them'],
  [
    'P',
    'The real value of a house lies in what travels from one venture to the next. A supplier who has proved reliable for one can be trusted by the next. A lesson about how a material ages, how a client wishes to be spoken to, or how long a thing honestly takes to make is paid for once, and then kept. Each new venture therefore begins further along than the last, and is expected to add something of its own before the next one starts.',
  ],
  ['H', 'The first: Phulhaar Gallery'],
  [
    'P',
    'Our first venture is Phulhaar Gallery, for fine art and craft. A phulhaar is a garland, and the name describes the work: each artist distinct, the gallery the thread between them.',
  ],
  [
    'P',
    'Phulhaar does two things. It chooses work worth living with, and it helps that work find the right room, alongside the curators, interior designers, architects and stylists who know those rooms best. Every piece it offers will carry a certificate signed by its artist and a record of where it came from. Phulhaar opens soon at phulhaar.com.',
  ],
  ['H', 'How we mean to grow'],
  [
    'P',
    'Slowly, and on purpose. A new venture begins when it is ready to stand on its own, never to fill a space on a page.',
  ],
  [
    'Q',
    'We would rather have three ventures we are proud of than ten we find ourselves explaining.',
  ],
  [
    'P',
    'We plan in decades. That is an unfashionable thing to say and an easy thing to claim, so the only fair way to judge it is to watch what we do over a long time.',
  ],
  ['H', 'What you can hold us to'],
  [
    'L',
    'The principles we work by are set out on our [About page](/about), so that we can be held to them. They cover how we choose, how we describe what we sell, how we price, and how we deal with artists, partners and collectors. Our [privacy policy](/privacy) sets out what we do with anything we learn about you. Both apply to every venture under PJK.',
  ],
  [
    'P',
    'When there is news worth having, such as a new venture or a change you should know about, it will appear here first.',
  ],
]

const text = (value: string) => ({
  type: 'text',
  text: value,
  format: 0,
  mode: 'normal',
  style: '',
  detail: 0,
  version: 1,
})
const block = (type: string, children: unknown[], extra: Record<string, unknown> = {}) => ({
  type,
  children,
  format: '',
  indent: 0,
  version: 1,
  direction: 'ltr',
  ...extra,
})
const link = (label: string, url: string) =>
  block('link', [text(label)], {
    version: 3,
    fields: { linkType: 'custom', url, newTab: false },
  })
/** "See our [About page](/about)." as text and link nodes */
const inline = (line: string) =>
  line
    .split(/(\[[^\]]+\]\([^)]+\))/)
    .filter(Boolean)
    .map((part) => {
      const found = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
      return found ? link(found[1], found[2]) : text(part)
    })

const content = () => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: BODY.map(([kind, line]) =>
      kind === 'H'
        ? block('heading', [text(line)], { tag: 'h2' })
        : kind === 'Q'
          ? block('quote', [text(line)])
          : block('paragraph', inline(line), { textFormat: 0, textStyle: '' }),
    ),
  },
})

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" ADD COLUMN "signed_by_proprietor" boolean DEFAULT false;
  ALTER TABLE "_posts_v" ADD COLUMN "version_signed_by_proprietor" boolean DEFAULT false;`)

  const tenant = (
    await payload.find({
      collection: 'tenants',
      where: { slug: { equals: TENANT } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
  ).docs[0]
  if (!tenant) return payload.logger.info('No PJK brand on this database: the Journal left alone.')

  let news: number | null = null
  for (const rename of RENAMES) {
    const found = (
      await payload.find({
        collection: 'categories',
        where: {
          and: [{ tenant: { equals: tenant.id } }, { slug: { in: [rename.from, rename.slug] } }],
        },
        limit: 2,
        depth: 0,
        overrideAccess: true,
        req,
      })
    ).docs
    const category = found.find((c) => c.slug === rename.slug) ?? found[0]
    const saved = category
      ? await payload.update({
          collection: 'categories',
          id: category.id,
          data: { title: rename.title, slug: rename.slug },
          overrideAccess: true,
          context: { disableRevalidate: true },
          req,
        })
      : await payload.create({
          collection: 'categories',
          data: { title: rename.title, slug: rename.slug, tenant: tenant.id } as never,
          overrideAccess: true,
          context: { disableRevalidate: true },
          req,
        })
    if (rename.slug === 'news') news = saved.id
  }

  const post = (
    await payload.find({
      collection: 'posts',
      where: { and: [{ tenant: { equals: tenant.id } }, { slug: { equals: POST } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
  ).docs[0]
  if (!post) return payload.logger.info('No first Journal post on this database: left alone.')
  await payload.update({
    collection: 'posts',
    id: post.id,
    data: {
      title: 'Introducing PAT & J.K. Co.',
      excerpt: EXCERPT,
      content: content() as never,
      categories: news ? [news] : post.categories,
      signedByProprietor: true,
    },
    draft: false,
    overrideAccess: true,
    context: { disableRevalidate: true },
    req,
  })
  payload.logger.info('The first Journal post now has the founder’s wording and signature.')
}

// The categories keep their new names and the post its new wording (the old one is in its history)
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" DROP COLUMN "signed_by_proprietor";
  ALTER TABLE "_posts_v" DROP COLUMN "version_signed_by_proprietor";`)
}
