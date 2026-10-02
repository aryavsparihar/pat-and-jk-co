import type { Block } from 'payload'

import { Content } from './Content/config'
import { CtaBand } from './CtaBand/config'
import { FormBlock } from './Form/config'
import { Hero } from './Hero/config'
import { JournalFeed } from './JournalFeed/config'
import { Leadership } from './Leadership/config'
import { Manifesto } from './Manifesto/config'
import { MediaBlock } from './MediaBlock/config'
import { Openings } from './Openings/config'
import { PageIntro } from './PageIntro/config'
import { Paths } from './Paths/config'
import { Principles } from './Principles/config'
import { Quote } from './Quote/config'
import { Split } from './Split/config'
import { VentureSpotlight } from './VentureSpotlight/config'
import { VenturesGrid } from './VenturesGrid/config'

/**
 * Every block an editor can add to a page, in the order they appear in the "Add block" menu.
 * To add a new block: create `blocks/<Name>/config.ts` + `Component.tsx`, list the config here
 * and the component in `RenderBlocks.tsx`, then run `pnpm generate:types`.
 */
export const pageBlocks: Block[] = [
  Hero,
  PageIntro,
  Manifesto,
  Content,
  Split,
  MediaBlock,
  VentureSpotlight,
  VenturesGrid,
  Principles,
  Paths,
  Quote,
  Leadership,
  JournalFeed,
  Openings,
  FormBlock,
  CtaBand,
]
