'use client'

import type { Map as LeafletMap, Marker } from 'leaflet'
import React, { useEffect, useRef, useState } from 'react'

import { STATE_CENTRES } from '@/members/forms/stateCentres'

/** OpenStreetMap's own tiles: free, no account. The member pages' policy allows this host only */
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const INDIA: [number, number] = [22.6, 79.0]
/** How far one arrow key moves the pin, in screen pixels */
const NUDGE = 12

const PIN_SVG =
  '<svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true"><path d="M16 1C8 1 1.5 7.4 1.5 15.3 1.5 26 16 41 16 41s14.5-15 14.5-25.7C30.5 7.4 24 1 16 1z" fill="var(--primary)" stroke="var(--background)" stroke-width="2"/><circle cx="16" cy="15" r="5" fill="var(--background)"/></svg>'

const rounded = (n: number) => Math.round(n * 1e6) / 1e6

/**
 * "Pin your location on a map": optional, for an address that is hard to follow. Nothing loads
 * until the artist asks for the map, and then only the map's own code and OpenStreetMap's tiles.
 * The pin moves only when they drag it (or, from the keyboard, nudge it with the arrow keys): the
 * browser's location is never asked for.
 */
export const LocationPin: React.FC<{
  latitude?: number | null
  longitude?: number | null
  state?: string
  onValue: (latitude: number | undefined, longitude: number | undefined) => void
}> = ({ latitude, longitude, state, onValue }) => {
  const [open, setOpen] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const pinned = typeof latitude === 'number' && typeof longitude === 'number'

  useEffect(() => {
    if (!open || !element.current || map.current) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const L = (await import('leaflet')).default
        await import('leaflet/dist/leaflet.css')
        if (cancelled || !element.current) return
        const start: [number, number] = pinned
          ? [latitude!, longitude!]
          : (STATE_CENTRES[state ?? ''] ?? INDIA)
        const m = L.map(element.current, {
          center: start,
          zoom: pinned ? 16 : STATE_CENTRES[state ?? ''] ? 7 : 4,
          scrollWheelZoom: false,
        })
        L.tileLayer(TILES, {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer" target="_blank">OpenStreetMap</a> contributors',
        }).addTo(m)
        const pin = L.marker(start, {
          draggable: true,
          keyboard: true,
          title: 'Your pin. Drag it to your home, or use the arrow keys.',
          alt: 'Your pin',
          icon: L.divIcon({
            className: 'location-pin',
            html: PIN_SVG,
            iconSize: [32, 42],
            iconAnchor: [16, 41],
          }),
        }).addTo(m)
        const report = () => {
          const { lat, lng } = pin.getLatLng()
          onValue(rounded(lat), rounded(lng))
        }
        pin.on('dragend', report)
        // From the keyboard: the arrow keys move the pin a little at a time
        pin.getElement()?.addEventListener('keydown', (event) => {
          const steps: Record<string, [number, number]> = {
            ArrowUp: [0, -NUDGE],
            ArrowDown: [0, NUDGE],
            ArrowLeft: [-NUDGE, 0],
            ArrowRight: [NUDGE, 0],
          }
          const step = steps[event.key]
          if (!step) return
          event.preventDefault()
          event.stopPropagation()
          const point = m.latLngToContainerPoint(pin.getLatLng()).add(step)
          pin.setLatLng(m.containerPointToLatLng(point))
          report()
        })
        map.current = m
        marker.current = pin
        setTimeout(() => m.invalidateSize(), 0)
      } catch {
        setProblem('The map could not load just now. Your address is all we need.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // Opened once; later changes come from the pin itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(
    () => () => {
      map.current?.remove()
      map.current = null
    },
    [],
  )

  const close = () => {
    map.current?.remove()
    map.current = null
    marker.current = null
    setOpen(false)
  }

  return (
    <div className="border-t border-border pt-8">
      <p className="label">Pin your location on a map</p>
      <p className="muted measure mt-1 text-base">
        Optional. A pin helps us find you when an address is hard to follow. The map is
        OpenStreetMap&rsquo;s, and it loads only if you open it.
      </p>
      {!open && (
        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
          <button className="btn btn-outline min-h-11" onClick={() => setOpen(true)} type="button">
            {pinned ? 'Move the pin' : 'Open the map'}
          </button>
          {pinned && (
            <>
              <span className="text-base">Your pin is placed.</span>
              <button
                className="link link-caps min-h-11"
                onClick={() => onValue(undefined, undefined)}
                type="button"
              >
                Remove the pin
              </button>
            </>
          )}
        </div>
      )}
      {open && (
        <div className="mt-4">
          <p className="measure text-base" id="location-pin-help">
            {pinned
              ? 'Drag the pin to where you live. Zoom in to place it closely.'
              : 'Drag the pin to where you live. Zoom in to place it closely. It is placed once you move it.'}
          </p>
          <div
            aria-describedby="location-pin-help"
            aria-label="Map"
            className="location-map mt-4 h-[min(60vh,26rem)] w-full overflow-hidden border border-border bg-surface"
            ref={element}
            role="region"
          />
          <p aria-live="polite" className="muted mt-2 text-base" role="status">
            {loading ? 'Opening the map…' : problem ? problem : pinned ? 'Your pin is placed.' : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-8">
            <button className="link link-caps min-h-11" onClick={close} type="button">
              Close the map
            </button>
            {pinned && (
              <button
                className="link link-caps min-h-11"
                onClick={() => {
                  onValue(undefined, undefined)
                  close()
                }}
                type="button"
              >
                Remove the pin
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
