import React from 'react'

import { BrandSvg } from '@/components/brand/BrandSvg'

/** Large logo on the admin login screen. */
export const Logo: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
    <BrandSvg name="logo" title="PAT and J.K. Co." style={{ width: 220, height: 'auto' }} />
    <span
      style={{
        fontSize: 11,
        letterSpacing: '0.28em',
        textTransform: 'uppercase',
        opacity: 0.7,
      }}
    >
      Admin
    </span>
  </div>
)

/** Small mark in the admin navigation. */
export const Icon: React.FC = () => (
  <BrandSvg name="wordmark" title="PJK" style={{ width: 46, height: 'auto' }} />
)
