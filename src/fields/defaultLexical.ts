import type { TextFieldSingleValidation } from 'payload'
import {
  BlockquoteFeature,
  BoldFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  UnderlineFeature,
  UnorderedListFeature,
  lexicalEditor,
  type LinkFields,
} from '@payloadcms/richtext-lexical'

import { linkableCollections } from './link'

const linkFeature = LinkFeature({
  enabledCollections: [...linkableCollections],
  fields: ({ defaultFields }) => {
    const defaultFieldsWithoutUrl = defaultFields.filter((field) => {
      if ('name' in field && field.name === 'url') return false
      return true
    })

    return [
      ...defaultFieldsWithoutUrl,
      {
        name: 'url',
        type: 'text',
        admin: {
          condition: (_data, siblingData) => siblingData?.linkType !== 'internal',
        },
        label: ({ t }) => t('fields:enterURL'),
        required: true,
        validate: ((value, options) => {
          if ((options?.siblingData as LinkFields)?.linkType === 'internal') {
            return true // no validation needed, as no url should exist for internal links
          }
          return value ? true : 'URL is required'
        }) as TextFieldSingleValidation,
      },
    ]
  },
})

/** Minimal editor: paragraphs with bold / italic / underline / links. */
export const defaultLexical = lexicalEditor({
  features: [ParagraphFeature(), UnderlineFeature(), BoldFeature(), ItalicFeature(), linkFeature],
})

/** Editor for longer copy: adds headings, lists, quotes and dividers plus a visible toolbar. */
export const bodyLexical = lexicalEditor({
  features: [
    ParagraphFeature(),
    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
    BoldFeature(),
    ItalicFeature(),
    UnderlineFeature(),
    linkFeature,
    UnorderedListFeature(),
    OrderedListFeature(),
    BlockquoteFeature(),
    HorizontalRuleFeature(),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ],
})
