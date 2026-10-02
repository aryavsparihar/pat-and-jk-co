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
const BUSINESS_INBOX = process.env.BUSINESS_INBOX || 'business@pjk.co.in'
const TECHNICAL_INBOX = process.env.TECHNICAL_INBOX || 'tech@pjk.co.in'
const PROPRIETOR = 'Mr. Yuvraj Singh Pathania'
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

  const phulhaarLogo = await upload(
    'Phulhaar Gallery by PJK',
    pngFile('ventures/phulhaar-logo.png', 'phulhaar-logo.png'),
  )

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
    tagline: 'Fine and contemporary art, curated and placed',
    stage: 'flagship',
    sector: 'Fine art',
    order: 1,
    logo: phulhaarLogo.id,
    caption:
      'A phulhaar is a garland. Every artist it gathers is a bloom of their own, and the gallery is the thread that draws them into a single piece of work.\n\nA space of vibrant artistry, anchored in quiet light.',
    opening: { date: '2026-11-08T00:00:00.000Z', note: 'in celebration of Diwali' },
    summary:
      'A gallery for fine and contemporary art. Phulhaar curates work worth living with, and works alongside curators, interior designers, decorators and mood setters to place it well.',
    description: root(
      p('Phulhaar Gallery by PJK is the latest venture under PAT and J.K. Co.'),
      p(
        'Its first discipline is curation: finding fine and contemporary work we believe in, and showing it properly. Its second is placement, which is a different craft altogether. A piece does not finish its journey on a gallery wall. It finishes it in a room, with a light above it, a colour behind it and a life going on around it.',
      ),
      p(
        'That is why Phulhaar works alongside curators, interior designers, decorators and mood setters as a matter of course. Between them they settle not only what is acquired, but where it will hang, what it will hang beside, and how the room should feel once it is there.',
      ),
      h('h3', 'For collectors'),
      p(
        'Help choosing work you will still want to live with in twenty years, and care taken over how it is presented, framed and hung in the room it is going to.',
      ),
      h('h3', 'For artists'),
      p(
        'A gallery that takes the work seriously, presents it carefully and wants a relationship that outlasts one exhibition.',
      ),
      h('h3', 'For businesses and interiors'),
      p(
        'Phulhaar works with businesses and with retail clients alike — curating a collection for one, mixing pieces into a finished room for another, and often doing both at once.',
      ),
    ),
    highlights: [
      { label: 'Discipline', value: 'Curation and placement' },
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
    bio: 'Yuvraj Singh Pathania founded PAT and J.K. Co. and is its proprietor. He leads the creative direction of every venture under it — how each one looks, what it offers and how it treats the people it works with — beginning with Phulhaar Gallery by PJK.',
  })

  await create('people', {
    name: 'Mr. Aryaveer Singh Parihar',
    role: 'Technical Director',
    order: 2,
    portrait: aryaveerPortrait.id,
    caption: 'Builds the systems our ventures run on, and keeps them simple to use.',
    bio: 'Aryaveer Singh Parihar leads technology across PJK. He designs and builds the websites and systems each venture runs on, beginning with this one, and keeps them simple enough for anyone here to look after.',
  })

  // ── Openings ─────────────────────────────────────────────────────────
  await create('openings', {
    title: 'Artist submissions for Phulhaar Gallery',
    type: 'artist',
    commitment: 'Open all year',
    summary:
      'We are looking for fine and contemporary artists to show and represent. Send a link to your portfolio and a few lines about your practice.',
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
      'We are building the websites and systems that every venture under PJK will share. Designers and engineers who care about detail are welcome to get in touch.',
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
          { label: 'PAT and J.K. Co.', value: 'pjk' },
          { label: 'Phulhaar Gallery', value: 'phulhaar' },
          { label: 'A business or trade enquiry', value: 'business' },
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
          { label: 'A craftsperson', value: 'craftsperson' },
          { label: 'A curator, interior designer or decorator', value: 'curator-designer' },
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
    excerpt:
      'Why we built an umbrella before we built a single shopfront, what the ventures beneath it share, and where Phulhaar Gallery fits.',
    content: root(
      p(
        'PAT and J.K. Co. — PJK — is a sole proprietorship of Mr. Yuvraj Singh Pathania. It is not one shopfront with one thing to sell. It is the umbrella under which several ventures in art and craft are built, run and held to the same standard. This is the first entry in its journal, and the plainest statement we can make of what it is for.',
      ),
      h('h2', 'Why an umbrella'),
      p(
        'Every small venture spends its first year solving problems that have nothing to do with why it exists. A name. A website. Books, suppliers, contracts, a way of answering the telephone. By the time all of that is settled, the attention that should have gone into the work has gone into the scaffolding instead.',
      ),
      p(
        'We would rather build the scaffolding once, build it properly, and keep it. PJK holds the parts every venture needs and none of them should have to invent: the standard of work, the way people are dealt with, the day-to-day operations, and the technology each one runs on. What is left to a venture is the thing it actually exists to do.',
      ),
      h('h2', 'Ventures, not departments'),
      p(
        'Each venture under PJK trades under its own name, speaks in its own voice and answers to its own customers. None of them is a department of something larger. A gallery ought to feel like a gallery, not like the art wing of a holding concern.',
      ),
      p(
        'What they hold in common sits underneath, out of sight: one proprietor, one standard, and the same people behind the scenes who will not let a shortcut through.',
      ),
      h('h2', 'What passes between them'),
      p(
        'The useful part of an umbrella is not what sits above the ventures. It is what passes between them. A supplier proven by one venture is a supplier the next can trust. A lesson about how a material ages, how a client wants to be spoken to, how long a thing honestly takes to make — that is paid for once and then kept.',
      ),
      p(
        'So each new initiative begins further along than the last. It inherits the judgement of everything PJK has already done, and it is expected to add something of its own to the pile before the next one starts.',
      ),
      h('h2', 'Phulhaar Gallery by PJK'),
      p(
        'The latest venture under the umbrella is Phulhaar Gallery by PJK, a gallery for fine and contemporary art.',
      ),
      p(
        'Phulhaar curates: it finds work worth living with and shows it properly. It also places work, which is a separate craft. A piece does not finish its journey on a gallery wall. It finishes it in a room — with a light above it, a colour behind it, and a life going on around it.',
      ),
      p(
        'That is why Phulhaar works alongside curators, interior designers, decorators and mood setters as a matter of course. Between them they settle not only what is acquired, but where it will hang, what it will hang beside, and how the room should feel once it is there. The gallery works with businesses and with retail clients alike: curating a collection for one, mixing pieces into a finished room for another, and frequently doing both at once.',
      ),
      h('h2', 'How we mean to grow'),
      p(
        'Slowly, and on purpose. A venture joins PJK when it is ready to stand on its own, not when there is a gap on a page to fill. We would rather have three ventures we are proud of than ten we find ourselves explaining.',
      ),
      p(
        'We plan in decades. That is an unfashionable thing to say and an easy thing to claim, so the only fair way to read it is to watch what we do over a long time.',
      ),
      h('h2', 'What you can hold us to'),
      p(
        'Our [values](/values) are written down in public so that they can be held against us: how we price, how we describe what we sell, how artists are paid, and what we do with whatever we learn about you. They apply to everyone who works under PJK, and to every outside business we deal with.',
      ),
      p(
        'When there is news worth having — a new venture, a show, a change we think you should know about — it will appear here first.',
      ),
    ),
  })

  // ── Pages ────────────────────────────────────────────────────────────
  const page = (
    title: string,
    slug: string,
    layout: unknown[],
    description?: string,
    extra: Record<string, unknown> = {},
  ) =>
    create('pages', {
      _status: 'published',
      title,
      slug,
      layout,
      publishedAt: new Date().toISOString(),
      ...(description ? { meta: { description } } : {}),
      ...extra,
    })

  const principleItems = [
    {
      title: 'Curation',
      text: 'We are selective about what carries our name. Fewer artists, fewer pieces, each chosen for a reason we can give you.',
    },
    {
      title: 'Craft',
      text: 'Small things decide the quality of the whole: the joints of a frame, the paper of a certificate, the words on a page, the emotions on the canvas.',
    },
    {
      title: 'Continuity',
      text: 'We plan in decades. Every venture inherits the standards, the suppliers and the support of the ones before it, so none of them starts from nothing.',
    },
  ]

  const home = await page('Home', 'home', [
    {
      blockType: 'hero',
      variant: 'brand',
      eyebrow: `Prop. ${PROPRIETOR}`,
      heading: 'PAT and J.K. Co. is the *umbrella* our ventures in art and craft stand under.',
      subheading:
        'One house, several ventures — each trading under its own name, each beginning with everything the last one learned. The latest is Phulhaar Gallery by PJK, for fine and contemporary art.',
      links: [
        url('/ventures/phulhaar-gallery', 'Phulhaar Gallery', 'default'),
        url('/about', 'About PJK', 'text'),
      ],
      showOrnament: false,
    },
    {
      blockType: 'manifesto',
      eyebrow: 'Who we are',
      heading: 'An umbrella, not a shopfront.',
      content: root(
        p(
          'Most ventures grow by adding more of the same. We would rather add something different, and only once the last thing is standing on its own.',
        ),
        p(
          'PAT and J.K. Co. is the umbrella. Beneath it sit ventures that each do one thing carefully — their own names, their own audiences, their own customers. What they hold in common sits underneath and out of sight: one proprietor, one standard of work, and the same people behind the scenes.',
        ),
        p(
          'Those ventures partner with established businesses and with retail clients alike. We curate, and we mix — matching what one venture makes to what another needs, and matching both to the person who will live with the result.',
        ),
        p(
          'That is the change we want to make: ventures built slowly, run honestly, and meant to last.',
        ),
      ),
    },
    {
      blockType: 'manifesto',
      layout: 'centered',
      eyebrow: 'The anchor',
      heading: 'Every venture begins with what the last one learned.',
      content: root(
        p(
          'PJK is the anchoring venture, and Phulhaar Gallery by PJK is the first of several to be moored to it. The ventures sit alongside one another rather than beneath one another, and the useful part of the arrangement is what passes sideways between them.',
        ),
        p(
          'A supplier proven by one venture is a supplier the next can trust. A lesson about how a material ages, or how long a thing honestly takes to make, is paid for once and then kept. Each new initiative draws on the judgement and the experience of everything PJK has already done — and is expected to add something of its own before the next one starts.',
        ),
      ),
    },
    { blockType: 'ventureSpotlight', eyebrow: 'Our latest venture', venture: phulhaar.id },
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
      heading: 'News from our ventures',
      limit: 3,
      showViewAll: true,
      emptyMessage: 'There is nothing here yet.',
    },
    {
      blockType: 'ctaBand',
      tone: 'surface',
      eyebrow: 'Work with us',
      heading: 'We would like to hear from artists, collectors and craftspeople.',
      text: 'And from businesses, interiors and anyone else who would like to build something with us.',
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
        intro: `A sole proprietorship of ${PROPRIETOR}, and the umbrella under which our ventures in art and craft are built and run.`,
      },
      {
        blockType: 'manifesto',
        eyebrow: 'Our story',
        heading: 'How it started',
        content: root(
          p(
            `PAT and J.K. Co. was founded by ${PROPRIETOR}, who is its proprietor and its creative director. The idea was to build a home for ventures that care about quality, and to give each of them the time and the support to get things right.`,
          ),
          p(
            'The latest of them is Phulhaar Gallery by PJK, a gallery for fine and contemporary art, which curates work and places it — alongside curators, interior designers, decorators and mood setters. More ventures will follow when they are ready, and not before.',
          ),
        ),
      },
      {
        blockType: 'split',
        mediaPosition: 'left',
        eyebrow: 'How the ventures work',
        heading: 'Separate names, shared foundations',
        content: root(
          p(
            'Each venture has its own name, its own voice and its own customers. What they share is everything underneath: the standard of work, the day-to-day operations, and the technology that runs their websites and systems.',
          ),
          p(
            'Building those things once, and building them well, means every new venture begins on solid ground rather than at the beginning.',
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
            text: 'We say what we mean, price fairly and keep our word, with artists, partners, businesses and retail clients alike.',
          },
        ],
      },
      {
        blockType: 'ctaBand',
        tone: 'surface',
        eyebrow: 'Leadership',
        heading: 'The people behind our ventures',
        links: [url('/leadership', 'Leadership', 'default'), url('/contact', 'Contact', 'text')],
      },
    ],
    'PAT and J.K. Co. is a sole proprietorship and the umbrella under which ventures in art and craft are built and run. Its latest is Phulhaar Gallery by PJK.',
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
        heading: 'Ethics and standing policy',
        content: root(
          p(
            'These are the rules we hold ourselves to. They apply to every individual of this venture — everyone who works for PAT and J.K. Co. or for any venture under it, in any role, paid or otherwise. They apply equally to every outside business we deal with: suppliers, contractors, galleries, partners and clients. Working with us means working to them.',
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
          h('h3', 'How we identify ourselves'),
          p(
            `No one here begins a transaction, an agreement or a negotiation from anything other than an official @pjk.co.in address. If a quotation, an invoice or a request for payment reaches you from anywhere else, it did not come from us — write to [${CONTACT_INBOX}](mailto:${CONTACT_INBOX}) before you act on it.`,
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
    'The ethics, standing policy and working practices of PAT and J.K. Co.',
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
          'Every venture under PAT and J.K. Co. trades under its own name. This is where you will find all of them.',
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
    'The ventures of PAT and J.K. Co., whose latest is Phulhaar Gallery by PJK for fine and contemporary art.',
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
          'Every venture under PJK is the result of that conversation, and of the people who hold it.',
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
    `The leadership of PAT and J.K. Co., including its proprietor and creative director ${PROPRIETOR}.`,
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
        intro: 'News and notes from PAT and J.K. Co. and its ventures.',
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
          'We work with artists, craftspeople, curators, designers, engineers and partners who care about doing things properly.',
      },
      {
        blockType: 'principles',
        eyebrow: 'Who we work with',
        numbering: 'none',
        items: [
          {
            title: 'Artists',
            text: 'Fine and contemporary artists who would like to show and be represented through Phulhaar Gallery by PJK.',
          },
          {
            title: 'Craftspeople',
            text: 'Individuals who share our standards for materials, finish and care.',
          },
          {
            title: 'Curators, interior designers and decorators',
            text: 'People who decide where work lives and how a room should feel, and who would like a gallery that thinks the same way.',
          },
          {
            title: 'Designers and engineers',
            text: 'People who can help shape our ventures, and the technology behind them, as PJK grows.',
          },
          {
            title: 'Partners',
            text: 'Galleries, institutions, businesses and retail clients who think in the long term, as we do.',
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
    'Work with PAT and J.K. Co.: artists, craftspeople, curators, designers, engineers and partners.',
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
        intro:
          'For anything to do with PAT and J.K. Co. or any of its ventures, write to us here or by email.',
      },
      {
        blockType: 'formBlock',
        form: contactForm.id,
        eyebrow: 'Enquiries',
        heading: 'Send us a message',
        intro: `We reply to every message ourselves. For business enquiries — partnerships, trade and retail clients — write to ${BUSINESS_INBOX}.`,
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
                `This website is run by PAT and J.K. Co. (“PJK”, “we”, “us”), a sole proprietorship of ${PROPRIETOR}. This policy explains what personal data we collect through it, why, and what choices you have.`,
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
              h('h2', 'How we contact you, and how to know it is us'),
              p(
                'No one working for PAT and J.K. Co. or for any venture under it will begin a transaction, an agreement or a negotiation from anything other than an official address at the pjk.co.in domain. Quotations, invoices, payment instructions and contracts reach you only from that domain.',
              ),
              p(
                `We are not responsible for any loss arising from correspondence, payment requests, offers or representations made from any other address, account, profile or channel, whether or not it claims to act for us. We will never ask you to send money to an account given over the telephone or by message alone. If anything looks doubtful, stop and write to [${CONTACT_INBOX}](mailto:${CONTACT_INBOX}) before you act on it, and we will confirm whether it came from us.`,
              ),
              h('h2', 'Contact'),
              p(
                `Questions about this policy can be sent to [${CONTACT_INBOX}](mailto:${CONTACT_INBOX}). Business enquiries go to [${BUSINESS_INBOX}](mailto:${BUSINESS_INBOX}); anything to do with this website goes to [${TECHNICAL_INBOX}](mailto:${TECHNICAL_INBOX}).`,
              ),
            ),
          },
        ],
      },
    ],
    'How PAT and J.K. Co. handles personal data sent through this website.',
    {
      officeAddress: {
        show: true,
        label: 'Data controller',
        note: 'PAT and J.K. Co. is responsible for the personal data collected through this website. Questions about it can be sent to the address below, or by email.',
      },
    },
  )

  // ── Site settings ────────────────────────────────────────────────────
  await create('site-settings', {
    siteName: 'PAT and J.K. Co.',
    shortName: 'PJK',
    tagline: 'An umbrella for ventures in art and craft',
    description:
      'PAT and J.K. Co. (PJK) is the umbrella under which ventures in art and craft are built and run. Its latest is Phulhaar Gallery by PJK, for fine and contemporary art.',
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
    footerBlurb:
      'The umbrella under which our ventures in art and craft are built and run. A sole proprietorship.',
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
    copyrightName: `PAT and J.K. Co. · Prop. ${PROPRIETOR}`,
    showVisitorCount: true,
    email: CONTACT_INBOX,
    office: {
      line1: 'Ward No. 7',
      line2: 'ITI Road',
      landmark: 'Opposite Brahman Sabha',
      city: 'Kathua',
      state: 'Jammu and Kashmir',
      postalCode: '184101',
      country: 'India',
    },
    businessEmail: BUSINESS_INBOX,
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
