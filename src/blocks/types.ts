import type { SiteSetting } from '@/payload-types'

/** Context handed to every block by RenderBlocks — which brand is rendering, and whether it's a preview. */
export type BlockContext = {
  tenantId: number
  settings: SiteSetting | null
  draft: boolean
  /** True for the first block on the page (gets the LCP-friendly treatment) */
  isFirst?: boolean
}
