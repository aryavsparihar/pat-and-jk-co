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

import { h, p, root, ul } from './lexical'

const TENANT_SLUG = 'pjk'
const CONTACT_INBOX = process.env.CONTACT_INBOX || 'hello@pjk.co.in'
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
  const wordmark = await upload('PJK', svgFile('pjk-wordmark.svg', '#0F2A18', 'pjk-wordmark.svg'))
  const ogImage = await upload('PAT and J.K. Co.', pngFile('og-default.png', 'pjk-share.png'))

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
    tagline: 'Contemporary fine art curation & framing',
    stage: 'flagship',
    sector: 'Fine art',
    order: 1,
    summary:
      'Phulhaar Gallery brings contemporary art and thoughtful framing together under one roof — curating work of lasting quality and presenting each piece exactly as it deserves.',
    description: root(
      p(
        'Phulhaar Gallery by PJK is the group’s flagship venture, and its first expression of what PJK stands for.',
      ),
      p(
        'The gallery works across two disciplines that belong together: *curation* — discovering and presenting contemporary work with a considered eye — and *framing*, the quiet craft that protects a work and completes the way it is seen.',
      ),
      h('h3', 'For collectors'),
      p(
        'Guidance in choosing work you will live with for years, and framing that honours both the piece and the space it hangs in.',
      ),
      h('h3', 'For artists'),
      p(
        'A curatorial partner that takes the work seriously, presents it with care and builds lasting relationships.',
      ),
    ),
    highlights: [
      { label: 'Discipline', value: 'Curation & framing' },
      { label: 'Part of', value: 'PAT and J.K. Co.' },
    ],
  })

  await create('ventures', {
    _status: 'published',
    name: 'Next venture',
    slug: 'next-venture',
    tagline: 'In development',
    stage: 'coming-soon',
    order: 2,
    summary: 'New ventures are in development. Each joins the group only when it is ready.',
  })

  // ── People ───────────────────────────────────────────────────────────
  await create('people', {
    name: 'Mr. Yuvraj Singh Pathania',
    role: 'Founder & Creative Director',
    order: 1,
    bio: 'Yuvraj Singh Pathania founded PAT and J.K. Co. and leads its creative direction — shaping the brand, curation and experience of every venture in the group, beginning with Phulhaar Gallery by PJK.',
  })

  // ── Openings ─────────────────────────────────────────────────────────
  await create('openings', {
    title: 'Artist submissions — Phulhaar Gallery',
    type: 'artist',
    commitment: 'Rolling submissions',
    summary:
      'Contemporary artists are invited to introduce their work for consideration by Phulhaar Gallery by PJK. Share a portfolio link and a short note about your practice.',
    applyLabel: 'Submit your work',
    applyUrl: '/collaborate#form',
    status: 'open',
    order: 1,
  })
  await create('openings', {
    title: 'Technology & design collaborators',
    type: 'collaborator',
    commitment: 'Project-based · Remote',
    summary:
      'As the group grows we are building a shared technology and design foundation for every venture. We welcome designers and engineers who care about craft.',
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
    submitButtonLabel: 'Send enquiry',
    confirmationType: 'message',
    confirmationMessage: root(
      h('h3', 'Thank you.'),
      p('We have received your message and will reply personally.'),
    ),
    emails: notify('New enquiry from {{full-name}}'),
    fields: [
      { blockType: 'text', name: 'full-name', label: 'Full name', required: true, width: 50 },
      { blockType: 'email', name: 'email', label: 'Email', required: true, width: 50 },
      {
        blockType: 'select',
        name: 'topic',
        label: 'Your enquiry is about',
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
      h('h3', 'Thank you for reaching out.'),
      p('We read every message and will be in touch if there is a fit.'),
    ),
    emails: notify('Collaboration interest from {{full-name}}'),
    fields: [
      { blockType: 'text', name: 'full-name', label: 'Full name', required: true, width: 50 },
      { blockType: 'email', name: 'email', label: 'Email', required: true, width: 50 },
      {
        blockType: 'select',
        name: 'interest',
        label: 'I am a…',
        required: true,
        width: 50,
        options: [
          { label: 'Artist', value: 'artist' },
          { label: 'Maker or framer', value: 'maker' },
          { label: 'Designer or technologist', value: 'designer-technologist' },
          { label: 'Potential partner', value: 'partner' },
          { label: 'Other', value: 'other' },
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
        label: 'Tell us about your work',
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
    excerpt: 'A new group, a long view, and our first venture — Phulhaar Gallery by PJK.',
    content: root(
      p(
        'Today we are introducing PAT and J.K. Co. — *PJK* — a founder-led group building ventures in art, craft and culture.',
      ),
      h('h2', 'Why a group?'),
      p(
        'Good ideas deserve good foundations. Rather than building each business from scratch, PJK gives every venture a shared base of brand stewardship, operations and technology, so each can focus on what it does best.',
      ),
      h('h2', 'Beginning with Phulhaar Gallery'),
      p(
        'Our first venture, Phulhaar Gallery by PJK, is dedicated to contemporary fine art curation and framing. It reflects everything we care about: a discerning eye, careful craftsmanship and respect for the people we work with.',
      ),
      h('h2', 'What comes next'),
      p(
        'We will grow deliberately. New ventures will join the group only when they are ready — and we will share each step here in the journal.',
      ),
      p('Thank you for being here at the beginning.'),
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

  const ctaWorkWithUs = {
    blockType: 'ctaBand',
    tone: 'surface',
    eyebrow: 'Work with us',
    heading: 'Artists, partners and collaborators — *we would love to hear from you.*',
    text: 'Whether you create, collect or build, there may be a place for you in what we are making.',
    links: [
      url('/contact', 'Get in touch', 'default'),
      url('/collaborate', 'Collaborate', 'outline'),
    ],
  }

  const principleItems = [
    {
      title: 'Curation',
      text: 'We choose with care. Every artist, partner and product is selected for quality and meaning — never for volume.',
    },
    {
      title: 'Craft',
      text: 'Details are the work. From the joinery of a frame to the typography of a page, we attend to the parts most people never notice.',
    },
    {
      title: 'Continuity',
      text: 'We build for decades. Our ventures share values, standards and a common foundation, so each one makes the next stronger.',
    },
  ]

  const home = await page('Home', 'home', [
    {
      blockType: 'hero',
      variant: 'brand',
      eyebrow: 'A founder-led house of ventures',
      heading: 'Building enduring ventures in *art*, craft and culture.',
      subheading:
        'PAT and J.K. Co. brings considered ideas to life — beginning with Phulhaar Gallery by PJK, our home for contemporary fine art curation and framing.',
      links: [
        url('/ventures', 'Discover our ventures', 'default'),
        url('/about', 'Our story', 'text'),
      ],
      showOrnament: false,
    },
    {
      blockType: 'manifesto',
      layout: 'split',
      eyebrow: 'Who we are',
      heading: 'A *quiet* revolution in how things are made.',
      content: root(
        p('We believe the things worth keeping are made with intention.'),
        p(
          'In a world that rewards speed, PJK chooses care: fewer, better ventures, each built on craft, honest relationships and a long view. We would rather build one thing properly than ten things quickly.',
        ),
        p(
          'We are a young group at our founding stage — and that is the point. Every venture under PJK begins with a simple question: *does this make something genuinely better?* It grows only as fast as its quality allows.',
        ),
      ),
    },
    { blockType: 'ventureSpotlight', eyebrow: 'Our flagship', venture: phulhaar.id },
    {
      blockType: 'principles',
      eyebrow: 'What guides us',
      heading: 'Three principles, *every* venture.',
      numbering: 'roman',
      items: principleItems,
    },
    {
      blockType: 'quote',
      quote:
        'We are not in a hurry to be big. We intend to be good — and to stay good for a very long time.',
      attribution: 'PAT and J.K. Co.',
      role: 'A founding principle',
    },
    {
      blockType: 'journalFeed',
      eyebrow: 'Journal',
      heading: 'From the *journal*.',
      limit: 3,
      showViewAll: true,
      emptyMessage: 'New stories are on their way.',
    },
    ctaWorkWithUs,
  ])

  const about = await page(
    'About',
    'about',
    [
      {
        blockType: 'pageIntro',
        align: 'center',
        eyebrow: 'About',
        heading: 'Who *we* are.',
        intro:
          'PAT and J.K. Co. is the parent company behind a growing family of ventures in art, craft and culture. We are founder-led, independent and deliberately unhurried.',
      },
      {
        blockType: 'manifesto',
        layout: 'split',
        eyebrow: 'Our story',
        heading: 'Founded on *taste* and patience.',
        content: root(
          p(
            'PAT and J.K. Co. was founded by Mr. Yuvraj Singh Pathania with a simple conviction: that good taste, applied patiently, builds things that last.',
          ),
          p(
            'The group’s first venture, Phulhaar Gallery by PJK, brings that conviction to contemporary fine art — pairing thoughtful curation with framing made to honour each work.',
          ),
          p(
            'From here, PJK will grow venture by venture. Each new brand joins the group only when it is ready, and each one is held to the same standard as the first.',
          ),
        ),
      },
      {
        blockType: 'split',
        background: 'surface',
        mediaPosition: 'left',
        eyebrow: 'How the group works',
        heading: 'Distinct brands, *one* foundation.',
        content: root(
          p(
            'Every venture under PJK keeps its own name, voice and craft. Behind them sits a shared foundation — brand stewardship, operations and technology — so each new venture starts stronger than the last.',
          ),
          ul(
            'Independent brands, each with its own identity',
            'Shared standards of quality and service',
            'Common technology and operations, built once and reused',
          ),
        ),
        enableLink: true,
        link: url('/ventures', 'Explore our ventures', 'text').link,
      },
      {
        blockType: 'principles',
        eyebrow: 'Our principles',
        heading: 'What we *hold* to.',
        numbering: 'roman',
        items: [
          ...principleItems,
          {
            title: 'Candour',
            text: 'We say what we mean, price fairly and keep our word — with artists, partners and clients alike.',
          },
        ],
      },
      {
        blockType: 'ctaBand',
        tone: 'surface',
        eyebrow: 'Leadership',
        heading: 'Meet the people *behind* PJK.',
        links: [
          url('/leadership', 'Our leadership', 'default'),
          url('/contact', 'Contact us', 'outline'),
        ],
      },
    ],
    'PAT and J.K. Co. is the founder-led parent company behind a growing family of ventures in art, craft and culture.',
  )

  const ventures = await page(
    'Ventures',
    'ventures',
    [
      {
        blockType: 'pageIntro',
        align: 'center',
        eyebrow: 'Ventures',
        heading: 'One group, *distinct* houses.',
        intro:
          'Each PJK venture is built to stand on its own — with its own identity, craft and community — while sharing the group’s standards and long view.',
      },
      { blockType: 'venturesGrid', populateBy: 'all' },
      {
        blockType: 'ctaBand',
        tone: 'surface',
        eyebrow: 'New ventures',
        heading: 'Have an idea that *belongs* here?',
        text: 'We are always open to conversations with founders, makers and partners who share our values.',
        links: [url('/contact', 'Start a conversation', 'default')],
      },
    ],
    'The ventures of PAT and J.K. Co., beginning with Phulhaar Gallery by PJK — contemporary fine art curation and framing.',
  )

  const leadership = await page(
    'Leadership',
    'leadership',
    [
      {
        blockType: 'pageIntro',
        align: 'center',
        eyebrow: 'Leadership',
        heading: 'The people *behind* PJK.',
        intro:
          'PAT and J.K. Co. is led by its founder, with a small circle of collaborators who share a commitment to craft and a long view.',
      },
      { blockType: 'leadership', populateBy: 'all' },
      {
        blockType: 'ctaBand',
        tone: 'surface',
        eyebrow: 'Collaborate',
        heading: 'Join us in building something *lasting*.',
        links: [url('/collaborate', 'Ways to collaborate', 'default')],
      },
    ],
    'Meet the leadership of PAT and J.K. Co., including founder and creative director Mr. Yuvraj Singh Pathania.',
  )

  const journal = await page(
    'Journal',
    'journal',
    [
      {
        blockType: 'pageIntro',
        align: 'center',
        eyebrow: 'Journal',
        heading: 'News, notes & *stories*.',
        intro:
          'Announcements from the group, stories from our ventures, and notes on art, craft and making.',
      },
      {
        blockType: 'journalFeed',
        limit: 24,
        showViewAll: false,
        emptyMessage: 'New stories are on their way.',
      },
    ],
    'News and stories from PAT and J.K. Co. and its ventures.',
  )

  const collaborate = await page(
    'Collaborate',
    'collaborate',
    [
      {
        blockType: 'pageIntro',
        align: 'center',
        eyebrow: 'Collaborate',
        heading: 'Build something *lasting* with us.',
        intro:
          'We work with artists, craftspeople, designers, technologists and partners who care about quality. If that sounds like you, we would like to hear from you.',
      },
      {
        blockType: 'principles',
        eyebrow: 'Who we work with',
        heading: 'Ways to *work together*.',
        numbering: 'none',
        items: [
          {
            title: 'Artists',
            text: 'Contemporary artists interested in exhibiting and being represented through Phulhaar Gallery by PJK.',
          },
          {
            title: 'Makers & framers',
            text: 'Craftspeople who share our standards for materials, finish and care.',
          },
          {
            title: 'Designers & technologists',
            text: 'Collaborators who can help shape our brands and the technology behind them as the group grows.',
          },
          {
            title: 'Partners',
            text: 'Galleries, institutions, brands and investors aligned with our long-term view.',
          },
        ],
      },
      { blockType: 'openings', eyebrow: 'Open calls', heading: 'Current *opportunities*.' },
      {
        blockType: 'formBlock',
        form: collaborateForm.id,
        eyebrow: 'Express interest',
        heading: 'Tell us about *yourself*.',
        intro:
          'Share a little about your work and how you would like to collaborate. We read every message and reply personally.',
        showContactDetails: false,
      },
    ],
    'Collaborate with PAT and J.K. Co. — artists, makers, designers, technologists and partners.',
  )

  const contact = await page(
    'Contact',
    'contact',
    [
      {
        blockType: 'pageIntro',
        align: 'center',
        eyebrow: 'Contact',
        heading: 'Let’s *talk*.',
        intro:
          'For enquiries about the group, our ventures or working together, send us a note. We reply to every message personally.',
      },
      {
        blockType: 'formBlock',
        form: contactForm.id,
        eyebrow: 'Write to us',
        heading: 'Send an *enquiry*.',
        intro: 'Tell us a little about what you have in mind and we will get back to you.',
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
                'This website is operated by PAT and J.K. Co. (“PJK”, “we”, “us”). This policy explains what personal data we collect through this website, why we collect it, and the choices you have.',
              ),
              h('h2', 'What we collect'),
              p(
                'When you send us a message through a form on this site, we collect the details you provide — typically your name, email address and the content of your message. We do not use advertising trackers and we do not sell personal data.',
              ),
              h('h2', 'How we use it'),
              p(
                'We use your details only to respond to your enquiry and, where relevant, to continue a conversation you have started with us.',
              ),
              h('h2', 'How long we keep it'),
              p(
                'We keep enquiries for as long as needed to respond and for reasonable record-keeping, after which they are deleted.',
              ),
              h('h2', 'Your rights'),
              p(
                'Under India’s Digital Personal Data Protection Act, 2023, you may ask us to access, correct or erase the personal data we hold about you, or withdraw your consent. To do so, contact us using the details below.',
              ),
              h('h2', 'Cookies'),
              p(
                'This website uses only the cookies strictly necessary for it to work (for example, to keep signed-in editors logged in). It does not use advertising or tracking cookies.',
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
    'How PAT and J.K. Co. handles personal data submitted through this website.',
  )

  // ── Site settings ────────────────────────────────────────────────────
  await create('site-settings', {
    siteName: 'PAT and J.K. Co.',
    shortName: 'PJK',
    tagline: 'Building enduring ventures in art, craft and culture',
    description:
      'PAT and J.K. Co. (PJK) is a founder-led group building enduring ventures in art, craft and culture — beginning with Phulhaar Gallery by PJK, for contemporary fine art curation and framing.',
    ogImage: ogImage.id,
    logo: logo.id,
    logoOnDark: logoOnDark.id,
    wordmark: wordmark.id,
    colours: {
      primary: '#0F2A18',
      background: '#F6F3EC',
      surface: '#EFEAE0',
      foreground: '#16201A',
    },
    headerNav: [
      pageRef(about.id, 'About'),
      pageRef(ventures.id, 'Ventures'),
      pageRef(leadership.id, 'Leadership'),
      pageRef(journal.id, 'Journal'),
      pageRef(collaborate.id, 'Collaborate'),
    ],
    enableHeaderCta: true,
    headerCta: pageRef(contact.id, 'Contact').link,
    footerBlurb: 'A founder-led group building enduring ventures in art, craft and culture.',
    footerNav: [
      pageRef(home.id, 'Home'),
      pageRef(about.id, 'About'),
      pageRef(ventures.id, 'Ventures'),
      pageRef(leadership.id, 'Leadership'),
      pageRef(journal.id, 'Journal'),
      pageRef(collaborate.id, 'Collaborate'),
      pageRef(contact.id, 'Contact'),
    ],
    legalLinks: [pageRef(privacy.id, 'Privacy policy')],
    copyrightName: 'PAT and J.K. Co.',
    email: CONTACT_INBOX,
  })

  payload.logger.info(
    'Done. Visit http://localhost:3000 — then create your admin account at /admin.',
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
