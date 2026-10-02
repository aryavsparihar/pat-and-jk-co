import React, { Fragment } from 'react'

import type { Page } from '@/payload-types'

import { ContentBlock } from './Content/Component'
import { CtaBandBlock } from './CtaBand/Component'
import { FormBlock } from './Form/Component'
import { HeroBlock } from './Hero/Component'
import { JournalFeedBlock } from './JournalFeed/Component'
import { LeadershipBlock } from './Leadership/Component'
import { ManifestoBlock } from './Manifesto/Component'
import { MediaBlock } from './MediaBlock/Component'
import { OpeningsBlock } from './Openings/Component'
import { PageIntroBlock } from './PageIntro/Component'
import { PrinciplesBlock } from './Principles/Component'
import { PathsBlock } from './Paths/Component'
import { QuoteBlock } from './Quote/Component'
import { SplitBlock } from './Split/Component'
import type { BlockContext } from './types'
import { VentureSpotlightBlock } from './VentureSpotlight/Component'
import { VenturesGridBlock } from './VenturesGrid/Component'

type LayoutBlock = Page['layout'][number]

// Maps each block's slug (from its config) to the component that renders it
const blockComponents: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in LayoutBlock['blockType']]: React.ComponentType<any>
} = {
  hero: HeroBlock,
  pageIntro: PageIntroBlock,
  manifesto: ManifestoBlock,
  content: ContentBlock,
  split: SplitBlock,
  mediaBlock: MediaBlock,
  ventureSpotlight: VentureSpotlightBlock,
  venturesGrid: VenturesGridBlock,
  principles: PrinciplesBlock,
  paths: PathsBlock,
  quote: QuoteBlock,
  leadership: LeadershipBlock,
  journalFeed: JournalFeedBlock,
  openings: OpeningsBlock,
  formBlock: FormBlock,
  ctaBand: CtaBandBlock,
}

export const RenderBlocks: React.FC<{
  blocks?: LayoutBlock[] | null
  ctx: Omit<BlockContext, 'isFirst'>
}> = ({ blocks, ctx }) => {
  if (!blocks?.length) return null

  return (
    <Fragment>
      {blocks.map((block, index) => {
        const Block = blockComponents[block.blockType]
        if (!Block) return null
        return <Block key={block.id ?? index} {...block} ctx={{ ...ctx, isFirst: index === 0 }} />
      })}
    </Fragment>
  )
}
