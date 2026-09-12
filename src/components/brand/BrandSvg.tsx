import React from 'react'

import { brandSvgs, type BrandSvgName } from './svgs'

type Props = {
  name: BrandSvgName
  title?: string
} & React.SVGProps<SVGSVGElement>

/** Inline brand artwork that inherits `color` via currentColor. */
export const BrandSvg: React.FC<Props> = ({ name, title, ...rest }) => {
  const { viewBox, markup } = brandSvgs[name]
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      {...rest}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
