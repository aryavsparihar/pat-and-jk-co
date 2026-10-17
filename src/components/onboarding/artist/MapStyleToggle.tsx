'use client'

import React from 'react'

import { cn } from '@/utilities/ui'

/** Map, Satellite or Terrain: the same three, the same way round, on Google's map and on OpenStreetMap's */
export type MapStyle = 'map' | 'satellite' | 'terrain'

const STYLES: { value: MapStyle; label: string }[] = [
  { value: 'map', label: 'Map' },
  { value: 'satellite', label: 'Satellite' },
  { value: 'terrain', label: 'Terrain' },
]

export const MapStyleToggle: React.FC<{
  value: MapStyle
  onChange: (style: MapStyle) => void
  disabled?: boolean
}> = ({ value, onChange, disabled = false }) => (
  <div aria-label="Map style" className="map-style inline-flex border border-border" role="group">
    {STYLES.map((style) => (
      <button
        aria-pressed={value === style.value}
        className={cn(
          'min-h-11 px-4 text-base transition-colors not-first:border-l not-first:border-border',
          value === style.value ? 'bg-primary text-primary-foreground' : 'hover:bg-surface',
        )}
        disabled={disabled}
        key={style.value}
        onClick={() => onChange(style.value)}
        type="button"
      >
        {style.label}
      </button>
    ))}
  </div>
)

/** The accuracy circle's colour: the page's accent where it has one, else its primary colour */
export const circleColour = (element: Element | null): string => {
  const styles = element ? getComputedStyle(element) : null
  const pick = (name: string) => styles?.getPropertyValue(name).trim() ?? ''
  const colour = pick('--accent') || pick('--primary')
  // Google's overlays take hex and rgb() colours, not every CSS colour
  return /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i.test(colour) ? colour : '#0f2a18'
}
