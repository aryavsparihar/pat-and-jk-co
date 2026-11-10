import { MediaBlock } from '@/blocks/MediaBlock/Component'
import {
  DefaultNodeTypes,
  SerializedBlockNode,
  SerializedLinkNode,
  type DefaultTypedEditorState,
} from '@payloadcms/richtext-lexical'
import {
  JSXConvertersFunction,
  LinkJSXConverter,
  RichText as ConvertRichText,
} from '@payloadcms/richtext-lexical/react'

import type {
  BannerBlock as BannerBlockProps,
  MediaBlock as MediaBlockProps,
} from '@/payload-types'
import { BannerBlock } from '@/blocks/Banner/Component'
import { docPath } from '@/utilities/docHref'
import { cn } from '@/utilities/ui'

type NodeTypes = DefaultNodeTypes | SerializedBlockNode<MediaBlockProps | BannerBlockProps>

const internalDocToHref = ({ linkNode }: { linkNode: SerializedLinkNode }) => {
  const { value, relationTo } = linkNode.fields.doc!
  if (typeof value !== 'object') return '/'
  return docPath(relationTo, (value as { slug?: string }).slug)
}

import { headingId, nodeText } from '@/utilities/headingId'

const jsxConverters: JSXConvertersFunction<NodeTypes> = ({ defaultConverters }) => ({
  ...defaultConverters,
  // Every heading can be linked to, which the contents panel of a long document relies on
  heading: ({ node, nodesToJSX }) => {
    const Tag = node.tag
    return <Tag id={headingId(nodeText(node))}>{nodesToJSX({ nodes: node.children })}</Tag>
  },
  ...LinkJSXConverter({ internalDocToHref }),
  blocks: {
    banner: ({ node }) => <BannerBlock className="my-8" {...node.fields} />,
    mediaBlock: ({ node }) => (
      <MediaBlock
        {...node.fields}
        className="my-10"
        disableInnerContainer
        enableGutter={false}
        imgClassName="m-0"
      />
    ),
  },
})

type Props = {
  data: DefaultTypedEditorState
} & React.HTMLAttributes<HTMLDivElement>

/** Renders Lexical rich text with the site's `.rt` typography. */
export default function RichText(props: Props) {
  const { className, ...rest } = props
  return (
    <ConvertRichText
      converters={jsxConverters}
      className={cn('payload-richtext rt', className)}
      {...rest}
    />
  )
}
