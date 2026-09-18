/**
 * Seeds the PAT and J.K. Co. brand with its complete starter website:
 * brand + domains, logos, site settings, pages, ventures, people, openings, forms and a first post.
 *
 *   pnpm seed          # only runs when the "pjk" brand doesn't exist yet
 *   pnpm seed:reset    # deletes the pjk brand's content and seeds it again
 *
 * Users are never seeded: the first account created at /admin becomes the super admin.
 * All copy is a starting draft — edit everything from the admin panel.
 */
import configPromise from '@payload-config'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { getPayload, type CollectionSlug, type Payload } from 'payload'

import { h, p, root } from './lexical'

const TENANT_SLUG = 'pjk'
const CONTACT_INBOX = process.env.CONTACT_INBOX || 'hello@pjk.co.in'
const TECHNICAL_INBOX = process.env.TECHNICAL_INBOX || 'tech@pjk.co.in'
const context = { disableRevalidate: true }

// Content that belongs to a brand, deleted on reset (order matters for relationships)
const tenantCollections: CollectionSlug[] = [
  'form-submissions',
  'redirects',
  'site-settings',
  'pages',
  'posts',
  'categories',
  'ventures',
  'people',
  'openings',
  'forms',
  'media',
]

const svgFile = (file: string, colour: string, name: string) => {
  const svg = readFileSync(path.resolve(process.cwd(), 'public/brand', file), 'utf8').replace(
    /currentColor/g,
    colour,
  )
  const data = Buffer.from(svg)
  return { data, mimetype: 'image/svg+xml', name, size: data.length }
}

const pngFile = (file: string, name: string) => {
  const data = readFileSync(path.resolve(process.cwd(), 'public/brand', file))
  return { data, mimetype: 'image/png', name, size: data.length }
}

/** Portraits produced by scripts/brand/make-portraits.mjs */
const jpgFile = (file: string, name: string) => {
  const data = readFileSync(path.resolve(process.cwd(), 'public/brand', file))
  return { data, mimetype: 'image/jpeg', name, size: data.length }
}

const pageRef = (id: number, label: string, appearance?: 'default' | 'outline' | 'text') => ({
  link: {
    type: 'reference' as const,
    reference: { relationTo: 'pages' as const, value: id },
    label,
    newTab: false,
    ...(appearance ? { appearance } : {}),
  },
})

const url = (href: string, label: string, appearance?: 'default' | 'outline' | 'text') => ({
  link: {
    type: 'custom' as const,
    url: href,
    label,
    newTab: false,
    ...(appearance ? { appearance } : {}),
  },
})

async function reset(payload: Payload, tenantId: number) {
  payload.logger.info('Removing existing PJK content…')
  for (const collection of tenantCollections) {
    await payload.delete({
      collection,
      where: { tenant: { equals: tenantId } },
      context,
      overrideAccess: true,
    })
  }
  await payload.delete({ collection: 'tenants', id: tenantId, context, overrideAccess: true })
}

async function seed() {
  const payload = await getPayload({ config: configPromise })

  const existing = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: TENANT_SLUG } },
    limit: 1,
  })

  if (existing.docs[0]) {
    if (process.env.SEED_RESET !== '1') {
      payload.logger.info(
        'The "pjk" brand already exists — nothing to do. Use `pnpm seed:reset` to start over.',
      )
      process.exit(0)
    }
    await reset(payload, existing.docs[0].id)
  }

  payload.logger.info('Seeding PAT and J.K. Co.…')

  // ── Brand ────────────────────────────────────────────────────────────
  const tenant = await payload.create({
    collection: 'tenants',
    context,
    data: {
      name: 'PAT and J.K. Co.',
      slug: TENANT_SLUG,
      domains: [{ domain: 'pjk.co.in' }, { domain: 'www.pjk.co.in' }, { domain: 'pjk.localhost' }],
    },
  })
  const t = tenant.id
  const create = <T extends CollectionSlug>(collection: T, data: Record<string, unknown>) =>
    payload.create({
      collection,
      context,
      data: { tenant: t, ...data } as never,
      overrideAccess: true,
    })

  // ── Logos ────────────────────────────────────────────────────────────
  const upload = (alt: string, file: ReturnType<typeof svgFile>) =>
    payload.create({ collection: 'media', context, data: { alt, tenant: t }, file })

  const logo = await upload(
    'PAT and J.K. Co. logo',
    svgFile('pjk-logo.svg', '#0F2A18', 'pjk-logo.svg'),
  )
  const logoOnDark = await upload(
    'PAT and J.K. Co. logo (light)',
    svgFile('pjk-logo.svg', '#F6F3EC', 'pjk-logo-light.svg'),
  )
  const ogImage = await upload('PAT and J.K. Co.', pngFile('og-default.png', 'pjk-share.png'))

  const yuvrajPortrait = await upload(
    'Yuvraj Singh Pathania, founder and creative director',
    jpgFile('people/yuvraj.jpg', 'yuvraj-singh-pathania.jpg'),
  )
  const aryaveerPortrait = await upload(
    'Aryaveer Singh Parihar, technical director',
    jpgFile('people/aryaveer.jpg', 'aryaveer-singh-parihar.jpg'),
  )

  // ── Journal categories ──────────────────────────────────────────────
  const announcements = await create('categories', {
    title: 'Announcements',
    slug: 'announcements',
  })
  await create('categories', { title: 'Gallery', slug: 'gallery' })
  await create('categories', { title: 'Craft', slug: 'craft' })

  // ── Ventures ─────────────────────────────────────────────────────────
  const phulhaar = await create('ventures', {
    _status: 'published',
    name: 'Phulhaar Gallery by PJK',
    slug: 'phulhaar-gallery',
    tagline: 'Contemporary fine art, curated and framed',
    stage: 'flagship',
    sector: 'Fine art',
    order: 1,
    summary:
      'A gallery for contemporary fine art that also frames the work it shows. Phulhaar works with artists and collectors, and treats the frame as part of the piece rather than an afterthought.',
    description: root(
      p('Phulhaar Gallery by PJK is the first business in the group.'),
      p(
        'It brings two jobs under one roof. The first is curation: finding contemporary work we believe in and showing it well. The second is framing, which protects a work and decides how it is seen for as long as it hangs on a wall.',
      ),
      h('h3', 'For collectors'),
      p(
        'Help choosing work you will want to live with, and a frame that suits both the piece and the room it goes in.',
      ),
      h('h3', 'For artists'),
      p(
        'A gallery that takes the work seriously, presents it carefully and wants a relationship that lasts longer than one exhibition.',
      ),
    ),
    highlights: [
      { label: 'Discipline', value: 'Curation and framing' },
      { label: 'Part of', value: 'PAT and J.K. Co.' },
    ],
  })

  await create('ventures', {
    _status: 'published',
    name: 'The next venture',
    slug: 'next-venture',
    tagline: 'We will announce it when it is ready.',
    stage: 'coming-soon',
    order: 2,
    summary: 'We will announce it when it is ready.',
  })

  // ── People ───────────────────────────────────────────────────────────
  await create('people', {
    name: 'Mr. Yuvraj Singh Pathania',
    role: 'Founder and Creative Director',
    order: 1,
    portrait: yuvrajPortrait.id,
    caption: 'Chooses the work, the materials, and the way both are shown.',
    bio: 'Yuvraj Singh Pathania founded PAT and J.K. Co. and leads its creative direction. He is responsible for how each of the group’s businesses looks, what it offers and how it treats the people it works with, starting with Phulhaar Gallery by PJK.',
  })

  await create('people', {
    name: 'Mr. Aryaveer Singh Parihar',
    role: 'Technical Director',
    order: 2,
    portrait: aryaveerPortrait.id,
    caption: 'Builds the systems the group runs on, and keeps them simple to use.',
    bio: 'Aryaveer Singh Parihar leads technology for the group. He designs and builds the websites and systems each business runs on, beginning with this one, and keeps them simple enough for anyone at PJK to look after.',
  })

  // ── Openings ─────────────────────────────────────────────────────────
  await create('openings', {
    title: 'Artist submissions for Phulhaar Gallery',
    type: 'artist',
    commitment: 'Open all year',
    summary:
      'We are looking for contemporary artists to show and represent. Send a link to your portfolio and a few lines about your practice.',
    applyLabel: 'Submit your work',
    applyUrl: '/collaborate#form',
    status: 'open',
    order: 1,
  })
  await create('openings', {
    title: 'Design and technology collaborators',
    type: 'collaborator',
    commitment: 'Project based, remote',
    summary:
      'We are building the websites and systems that every business in the group will share. Designers and engineers who care about detail are welcome to get in touch.',
    applyLabel: 'Express interest',
    applyUrl: '/collaborate#form',
    status: 'open',
    order: 2,
  })

  // ── Forms ────────────────────────────────────────────────────────────
  const notify = (subject: string) => [
    {
      emailTo: CONTACT_INBOX,
      replyTo: '{{email}}',
      subject,
      message: root(p('A new message was sent through the website:'), p('{{*:table}}')),
    },
  ]

  const contactForm = await create('forms', {
    title: 'Contact',
    submitButtonLabel: 'Send message',
    confirmationType: 'message',
    confirmationMessage: root(
      h('h3', 'Thank you.'),
      p('Your message has reached us. We will reply personally, usually within a few days.'),
    ),
    emails: notify('New enquiry from {{full-name}}'),
    fields: [
      { blockType: 'text', name: 'full-name', label: 'Name', required: true, width: 50 },
      { blockType: 'email', name: 'email', label: 'Email', required: true, width: 50 },
      {
        blockType: 'select',
        name: 'topic',
        label: 'Regarding',
        required: true,
        width: 100,
        options: [
          { label: 'The group', value: 'group' },
          { label: 'Phulhaar Gallery', value: 'phulhaar' },
          { label: 'Press', value: 'press' },
          { label: 'Something else', value: 'other' },
        ],
      },
      { blockType: 'textarea', name: 'message', label: 'Message', required: true, width: 100 },
    ],
  })

  const collaborateForm = await create('forms', {
    title: 'Collaborate',
    submitButtonLabel: 'Send',
    confirmationType: 'message',
    confirmationMessage: root(
      h('h3', 'Thank you.'),
      p('We read every message and will write back if there is a good fit.'),
    ),
    emails: notify('Collaboration enquiry from {{full-name}}'),
    fields: [
      { blockType: 'text', name: 'full-name', label: 'Name', required: true, width: 50 },
      { blockType: 'email', name: 'email', label: 'Email', required: true, width: 50 },
      {
        blockType: 'select',
        name: 'interest',
        label: 'I am',
        required: true,
        width: 50,
        options: [
          { label: 'An artist', value: 'artist' },
          { label: 'A maker or framer', value: 'maker' },
          { label: 'A designer or engineer', value: 'designer-engineer' },
          { label: 'A potential partner', value: 'partner' },
          { label: 'Something else', value: 'other' },
        ],
      },
      {
        blockType: 'text',
        name: 'portfolio',
        label: 'Portfolio or website',
        required: false,
        width: 50,
      },
      {
        blockType: 'textarea',
        name: 'message',
        label: 'About your work',
        required: true,
        width: 100,
      },
    ],
  })

  // ── Journal ──────────────────────────────────────────────────────────
  await create('posts', {
    _status: 'published',
    title: 'Introducing PAT and J.K. Co.',
    slug: 'introducing-pat-and-jk-co',
    publishedAt: new Date().toISOString(),
    categories: [announcements.id],
    excerpt: 'Why we started a group rather than a single business, and what comes first.',
    content: root(
      p(
        'PAT and J.K. Co., or PJK, is a new company set up to own and run a small number of businesses. This is the first entry in its journal.',
      ),
      h('h2', 'Why a group'),
      p(
        'Every small business has to solve the same problems before it can do the thing it exists for: a brand, a website, bookkeeping, suppliers, systems. We would rather solve those once, properly, and let each business get on with its real work.',
      ),
      h('h2', 'Starting with Phulhaar Gallery'),
      p(
        'Our first business is Phulhaar Gallery by PJK, a gallery for contemporary fine art that also frames the work it shows. It is a good test of what we care about: a good eye, careful making, and treating artists and collectors well.',
      ),
      h('h2', 'What happens next'),
      p(
        'We will add businesses slowly, and only when they are ready. When there is news, it will be here.',
      ),
    ),
  })

  // ── Pages ────────────────────────────────────────────────────────────
  const page = (title: string, slug: string, layout: unknown[], description?: string) =>
    create('pages', {
      _status: 'published',
      title,
      slug,
      layout,
      publishedAt: new Date().toISOString(),
      ...(description ? { meta: { description } } : {}),
    })

  const principleItems = [
    {
      title: 'Curation',
      text: 'We are selective about what carries our name. Fewer artists, fewer products, each chosen for a reason.',
    },
    {
      title: 'Craft',
      text: 'Small things decide the quality of the whole: the joints of a frame, the paper of a certificate, the words on a page.',
    },
    {
      title: 'Continuity',
      text: 'We plan in decades. Each business shares the group’s standards and support, so none of them has to start from nothing.',
    },
  ]

  const home = await page('Home', 'home', [
    {
      blockType: 'hero',
      variant: 'brand',
      eyebrow: 'Founded by Yuvraj Singh Pathania',
      heading: 'PAT and J.K. Co. builds and runs businesses in art and craft.',
      subheading:
        'The first is Phulhaar Gallery by PJK, which shows contemporary fine art and frames it. Others will follow, one at a time.',
      links: [
        url('/ventures/phulhaar-gallery', 'Phulhaar Gallery', 'default'),
        url('/about', 'About the group', 'text'),
      ],
      showOrnament: false,
    },
    {
      blockType: 'manifesto',
      eyebrow: 'Who we are',
      heading: 'Small on purpose.',
      content: root(
        p(
          'Most companies try to grow as fast as they can. We would rather grow as well as we can.',
        ),
        p(
          'PJK exists to hold a few businesses that each do one thing carefully. They share an owner, a standard of work and the same people behind the scenes, so every new business starts with what the previous one learned.',
        ),
        p(
          'That is the change we want to make: businesses that are built slowly, run honestly and meant to last.',
        ),
      ),
    },
    { blockType: 'ventureSpotlight', eyebrow: 'Our first venture', venture: phulhaar.id },
    {
      blockType: 'principles',
      eyebrow: 'How we work',
      heading: 'Three things we hold to',
      numbering: 'roman',
      items: principleItems,
    },
    {
      blockType: 'journalFeed',
      eyebrow: 'Journal',
      heading: 'News from the group',
      limit: 3,
      showViewAll: true,
      emptyMessage: 'There is nothing here yet.',
    },
    {
      blockType: 'ctaBand',
      tone: 'surface',
      eyebrow: 'Work with us',
      heading: 'We would like to hear from artists, collectors and makers.',
      text: 'And from anyone else who would like to build something with us.',
      links: [
        url('/contact', 'Get in touch', 'default'),
        url('/collaborate', 'Ways to collaborate', 'text'),
      ],
    },
  ])

  const about = await page(
    'About',
    'about',
    [
      {
        blockType: 'pageIntro',
        align: 'left',
        eyebrow: 'About',
        heading: 'About PAT and J.K. Co.',
        intro:
          'A privately held company, founded by Mr. Yuvraj Singh Pathania, that builds and runs businesses in art and craft.',
      },
      {
        blockType: 'manifesto',
        eyebrow: 'Our story',
        heading: 'How it started',
        content: root(
          p(
            'PAT and J.K. Co. was founded by Mr. Yuvraj Singh Pathania, who is also its creative director. The idea was to build a home for businesses that care about quality, and to give each of them the time and support to get things right.',
          ),
          p(
            'The first of these is Phulhaar Gallery by PJK, a gallery for contemporary fine art that also frames the work it shows. More businesses will join the group when they are ready, and not before.',
          ),
        ),
      },
      {
        blockType: 'split',
        mediaPosition: 'left',
        eyebrow: 'How the group works',
        heading: 'Separate names, shared foundations',
        content: root(
          p(
            'Each business in the group has its own name, its own voice and its own customers. What they share is everything underneath: the standard of work, the day-to-day operations, and the technology that runs their websites and systems.',
          ),
          p(
            'Building those things once, and building them well, means every new business begins on solid ground.',
          ),
        ),
        enableLink: true,
        link: url('/ventures', 'Our ventures', 'text').link,
      },
      {
        blockType: 'principles',
        eyebrow: 'Principles',
        heading: 'What we hold to',
        numbering: 'roman',
        items: [
          ...principleItems,
          {
            title: 'Candour',
            text: 'We say what we mean, price fairly and keep our word, with artists, partners and clients alike.',
          },
        ],
      },
      {
        blockType: 'ctaBand',
        tone: 'surface',
        eyebrow: 'Leadership',
        heading: 'The people behind the group',
        links: [url('/leadership', 'Leadership', 'default'), url('/contact', 'Contact', 'text')],
      },
    ],
    'PAT and J.K. Co. is a privately held company that builds and runs businesses in art and craft, starting with Phulhaar Gallery by PJK.',
  )

  const values = await page(
    'Our values',
    'values',
    [
      {
        blockType: 'pageIntro',
        align: 'left',
        eyebrow: 'Our values',
        heading: 'What we stand for',
        intro:
          'Written down so they can be held to: how we deal with people, what we do with what we learn about them, and how the work itself gets done.',
      },
      {
        blockType: 'manifesto',
        eyebrow: 'Ethics',
        heading: 'Ethics and company policy',
        content: root(
          p(
            'These are the rules we hold ourselves to. They apply to everyone who works for PAT and J.K. Co. or any business in the group.',
          ),
          h('h3', 'Honest dealing'),
          p(
            'We describe what we sell accurately: what a work is, what it is made of, what was restored or replaced, and what it costs. Prices are the same whoever is asking. If we get something wrong, we say so and put it right.',
          ),
          h('h3', 'Artists and makers'),
          p(
            'Artists are told in writing what is being shown, for how long and on what terms, and are paid on the dates we agreed. Work left with us is insured and looked after. We do not copy an artist’s work, and we credit the people who made a thing whenever we show it.',
          ),
          h('h3', 'Information about people'),
          p(
            'We collect only what we need to answer you or complete an order, we keep it no longer than we need it, and we never sell it. What we hold and how to have it removed is set out in our [privacy policy](/privacy).',
          ),
          h('h3', 'Conflicts of interest'),
          p(
            'If anyone at PJK stands to gain personally from a transaction, they say so before it happens and step back from the decision. We do not accept gifts intended to influence what we buy, show or recommend.',
          ),
          h('h3', 'People at work'),
          p(
            'Everyone who works with us is treated the same regardless of background, and harassment of any kind ends the relationship. We follow the law wherever we operate, and we pay suppliers on time.',
          ),
          h('h3', 'Raising a concern'),
          p(
            'If something here is not being followed, write to the founder directly. Concerns raised in good faith are taken seriously and never held against the person who raised them.',
          ),
        ),
      },
      {
        blockType: 'principles',
        eyebrow: 'How we work',
        heading: 'How we work',
        numbering: 'roman',
        items: [
          {
            title: 'We choose slowly',
            text: 'Nothing carries our name until we would be glad to live with it ourselves. That means turning down more than we take on.',
          },
          {
            title: 'We make carefully',
            text: 'Materials are chosen for how they will age, not for what they cost us. The parts nobody sees are finished as well as the parts they do.',
          },
          {
            title: 'We explain the work',
            text: 'You are told what was done, by whom and with what, before you are asked to pay for it. No pressure, and no invented scarcity.',
          },
          {
            title: 'We stay responsible for it',
            text: 'If something we made or sold fails, we repair it. A sale is the start of the relationship, not the end of it.',
          },
        ],
      },
      {
        blockType: 'ctaBand',
        tone: 'surface',
        eyebrow: 'Questions',
        heading: 'Anything here you would like to ask about?',
        text: 'We are glad to explain how we work, in as much detail as you would like.',
        links: [url('/contact', 'Get in touch', 'default')],
      },
    ],
    'The ethics, company policy and working practices of PAT and J.K. Co.',
  )

  const ventures = await page(
    'Ventures',
    'ventures',
    [
      {
        blockType: 'pageIntro',
        align: 'left',
        eyebrow: 'Ventures',
        heading: 'Our ventures',
        intro:
          'Each business in the group trades under its own name. This is where you will find all of them.',
      },
      { blockType: 'venturesGrid', eyebrow: 'Index', populateBy: 'all' },
      {
        blockType: 'ctaBand',
        tone: 'surface',
        eyebrow: 'New ventures',
        heading: 'Have an idea that belongs here?',
        text: 'If you are building something that fits the way we work, we would like to hear about it.',
        links: [url('/contact', 'Get in touch', 'default')],
      },
    ],
    'The businesses of PAT and J.K. Co., starting with Phulhaar Gallery by PJK for contemporary fine art and framing.',
  )

  const leadership = await page(
    'Leadership',
    'leadership',
    [
      {
        blockType: 'pageIntro',
        align: 'left',
        eyebrow: 'Leadership',
        heading: 'A dialogue between heritage, texture and expression.',
        intro:
          'Every venture in the group is the result of that conversation, and of the two people who hold it.',
      },
      { blockType: 'leadership', eyebrow: 'The people', populateBy: 'all' },
      {
        blockType: 'ctaBand',
        tone: 'surface',
        eyebrow: 'Join us',
        heading: 'We are a small team and will grow carefully.',
        text: 'If you would like to be part of it, here is how to work with us.',
        links: [url('/collaborate', 'Ways to collaborate', 'default')],
      },
    ],
    'The leadership of PAT and J.K. Co., including founder and creative director Mr. Yuvraj Singh Pathania.',
  )

  const journal = await page(
    'Journal',
    'journal',
    [
      {
        blockType: 'pageIntro',
        align: 'left',
        eyebrow: 'Journal',
        heading: 'Journal',
        intro: 'News and notes from the group and its ventures.',
      },
      {
        blockType: 'journalFeed',
        eyebrow: 'All entries',
        limit: 24,
        showViewAll: false,
        emptyMessage: 'There is nothing here yet.',
      },
    ],
    'News and notes from PAT and J.K. Co. and its ventures.',
  )

  const collaborate = await page(
    'Collaborate',
    'collaborate',
    [
      {
        blockType: 'pageIntro',
        align: 'left',
        eyebrow: 'Collaborate',
        heading: 'Work with us',
        intro:
          'We work with artists, craftspeople, designers, engineers and partners who care about doing things properly.',
      },
      {
        blockType: 'principles',
        eyebrow: 'Who we work with',
        numbering: 'none',
        items: [
          {
            title: 'Artists',
            text: 'Contemporary artists who would like to show and be represented through Phulhaar Gallery by PJK.',
          },
          {
            title: 'Makers and framers',
            text: 'Craftspeople who share our standards for materials, finish and care.',
          },
          {
            title: 'Designers and engineers',
            text: 'People who can help shape our brands, and the technology behind them, as the group grows.',
          },
          {
            title: 'Partners',
            text: 'Galleries, institutions, brands and investors who think in the long term, as we do.',
          },
        ],
      },
      { blockType: 'openings', eyebrow: 'Open calls', heading: 'Current openings' },
      {
        blockType: 'formBlock',
        form: collaborateForm.id,
        eyebrow: 'Get in touch',
        heading: 'Tell us about your work',
        intro: 'A few lines is enough. We read everything and reply personally.',
        showContactDetails: false,
      },
    ],
    'Work with PAT and J.K. Co.: artists, makers, designers, engineers and partners.',
  )

  const contact = await page(
    'Contact',
    'contact',
    [
      {
        blockType: 'pageIntro',
        align: 'left',
        eyebrow: 'Contact',
        heading: 'Contact',
        intro: 'For anything to do with the group or its ventures, write to us here or by email.',
      },
      {
        blockType: 'formBlock',
        form: contactForm.id,
        eyebrow: 'Enquiries',
        heading: 'Send us a message',
        intro: 'We reply to every message ourselves.',
        showContactDetails: true,
      },
    ],
    'Contact PAT and J.K. Co.',
  )

  const privacy = await page(
    'Privacy policy',
    'privacy',
    [
      {
        blockType: 'pageIntro',
        align: 'left',
        eyebrow: 'Legal',
        heading: 'Privacy policy',
        intro: 'Last updated 13 September 2026.',
      },
      {
        blockType: 'content',
        width: 'narrow',
        columns: [
          {
            size: 'full',
            richText: root(
              h('h2', 'Who we are'),
              p(
                'This website is run by PAT and J.K. Co. (“PJK”, “we”, “us”). This policy explains what personal data we collect through it, why, and what choices you have.',
              ),
              h('h2', 'What we collect'),
              p(
                'When you send us a message through a form on this site, we collect what you give us: usually your name, your email address and your message. We do not use advertising trackers and we do not sell personal data.',
              ),
              h('h2', 'How we use it'),
              p(
                'We use your details only to answer your message and, where relevant, to continue a conversation you started with us.',
              ),
              h('h2', 'How long we keep it'),
              p(
                'We keep messages for as long as we need to reply and for reasonable record keeping. After that they are deleted.',
              ),
              h('h2', 'Your rights'),
              p(
                'Under India’s Digital Personal Data Protection Act, 2023, you can ask us to show, correct or delete the personal data we hold about you, or withdraw your consent. Contact us using the details below.',
              ),
              h('h2', 'Cookies'),
              p(
                'This website only uses cookies that it needs to work, for example to keep editors signed in. It does not use advertising or tracking cookies.',
              ),
              h('h2', 'Contact'),
              p(
                `Questions about this policy can be sent to [${CONTACT_INBOX}](mailto:${CONTACT_INBOX}).`,
              ),
            ),
          },
        ],
      },
    ],
    'How PAT and J.K. Co. handles personal data sent through this website.',
  )

  // ── Site settings ────────────────────────────────────────────────────
  await create('site-settings', {
    siteName: 'PAT and J.K. Co.',
    shortName: 'PJK',
    tagline: 'Businesses in art and craft',
    description:
      'PAT and J.K. Co. (PJK) builds and runs businesses in art and craft. The first is Phulhaar Gallery by PJK, for contemporary fine art and framing.',
    ogImage: ogImage.id,
    logo: logo.id,
    logoOnDark: logoOnDark.id,
    colours: {
      primary: '#0F2A18',
      background: '#F6F3EC',
      surface: '#EEEADF',
      foreground: '#16201A',
    },
    headerNav: [
      pageRef(about.id, 'About'),
      pageRef(values.id, 'Our values'),
      pageRef(ventures.id, 'Ventures'),
      pageRef(leadership.id, 'Leadership'),
      pageRef(journal.id, 'Journal'),
      pageRef(collaborate.id, 'Collaborate'),
    ],
    enableHeaderCta: true,
    headerCta: pageRef(contact.id, 'Contact').link,
    footerBlurb: 'A privately held company that builds and runs businesses in art and craft.',
    footerNav: [
      pageRef(home.id, 'Home'),
      pageRef(about.id, 'About'),
      pageRef(values.id, 'Our values'),
      pageRef(ventures.id, 'Ventures'),
      pageRef(leadership.id, 'Leadership'),
      pageRef(journal.id, 'Journal'),
      pageRef(collaborate.id, 'Collaborate'),
      pageRef(contact.id, 'Contact'),
    ],
    legalLinks: [pageRef(privacy.id, 'Privacy policy')],
    copyrightName: 'PAT and J.K. Co.',
    email: CONTACT_INBOX,
    technicalEmail: TECHNICAL_INBOX,
    socials: [
      { platform: 'instagram', url: 'https://www.instagram.com/pjk.co/' },
      { platform: 'linkedin', url: 'https://www.linkedin.com/company/145005053/' },
    ],
  })

  payload.logger.info(
    'Done. Visit http://localhost:3000, then create your admin account at /admin.',
  )
  process.exit(0)
}

// Top-level await: `payload run` imports this module and exits once the import settles
try {
  await seed()
} catch (err) {
  console.error(err)
  process.exit(1)
}
