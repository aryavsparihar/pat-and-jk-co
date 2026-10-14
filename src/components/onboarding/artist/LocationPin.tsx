'use client'

import type { Map as LeafletMap, Marker } from 'leaflet'
import React, { useEffect, useRef, useState } from 'react'

import { STATE_CENTRES } from '@/members/forms/stateCentres'

import { GoogleLocationPin } from './GoogleLocationPin'
import { describeCoordinates, roundCoordinate, useMyLocation } from './useMyLocation'

/** OpenStreetMap's own tiles: free, no account. The member pages' policy allows this host only */
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const INDIA: [number, number] = [22.6, 79.0]
/** How far one arrow key moves the pin, in screen pixels */
const NUDGE = 12

const PIN_SVG =
  '<svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true"><path d="M16 1C8 1 1.5 7.4 1.5 15.3 1.5 26 16 41 16 41s14.5-15 14.5-25.7C30.5 7.4 24 1 16 1z" fill="var(--primary)" stroke="var(--background)" stroke-width="2"/><circle cx="16" cy="15" r="5" fill="var(--background)"/></svg>'

const rounded = roundCoordinate

type PinProps = {
  latitude?: number | null
  longitude?: number | null
  state?: string
  /** What the artist has typed so far, so Google's map can start there */
  address?: string
  onValue: (latitude: number | undefined, longitude: number | undefined) => void
}

/**
 * "Pin your location on a map": optional, for an address that is hard to follow. Google's map,
 * with address search, where a key is set (NEXT_PUBLIC_GOOGLE_MAPS_KEY); otherwise, or if Google
 * refuses the key, OpenStreetMap's. Either way nothing loads until the artist asks for the map.
 */
export const LocationPin: React.FC<PinProps> = (props) => {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
  const [google, setGoogle] = useState(Boolean(key))
  const [replaced, setReplaced] = useState(false)
  return google && key ? (
    <GoogleLocationPin
      apiKey={key}
      {...props}
      onUnavailable={() => {
        setGoogle(false)
        setReplaced(true)
      }}
    />
  ) : (
    // When Google's map could not load, OpenStreetMap's opens in its place straight away
    <OpenStreetMapPin {...props} replacingGoogle={replaced} />
  )
}

/**
 * OpenStreetMap's map: only the map's own code and OpenStreetMap's tiles. The pin moves when the
 * artist drags it (or, from the keyboard, nudges it with the arrow keys), or to their device's
 * location if they ask, and the browser asks them first.
 */
const OpenStreetMapPin: React.FC<PinProps & { replacingGoogle?: boolean }> = ({
  latitude,
  longitude,
  state,
  onValue,
  replacingGoogle = false,
}) => {
  const [open, setOpen] = useState(replacingGoogle)
  const [problem, setProblem] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const locateAfterOpen = useRef(false)
  const [live, setLive] = useState<{ lat: number; lng: number } | null>(null)
  const pinned = typeof latitude === 'number' && typeof longitude === 'number'
  const where = useMyLocation({ canSearch: false })

  const locateMe = () =>
    where.locate((lat, lng) => {
      if (!map.current || !marker.current) return
      marker.current.setLatLng([lat, lng])
      map.current.setView([lat, lng], 18)
      setLive({ lat, lng })
      onValue(rounded(lat), rounded(lng))
    })

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
          setLive({ lat, lng })
          onValue(rounded(lat), rounded(lng))
        }
        pin.on('drag', () => setLive(pin.getLatLng()))
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
        if (pinned) setLive({ lat: start[0], lng: start[1] })
        if (locateAfterOpen.current) {
          locateAfterOpen.current = false
          locateMe()
        }
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
    setLive(null)
    where.clear()
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
          <button
            className="link link-caps min-h-11"
            onClick={() => {
              locateAfterOpen.current = true
              setOpen(true)
            }}
            type="button"
          >
            Use my location
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
          {replacingGoogle && (
            <p className="measure mb-3 text-base">
              Google&rsquo;s map is not available just now, so this is OpenStreetMap&rsquo;s.
            </p>
          )}
          <p className="measure text-base" id="location-pin-help">
            {pinned
              ? 'Drag the pin to where you live. Zoom in to place it closely.'
              : 'Drag the pin to where you live. Zoom in to place it closely. It is placed once you move it.'}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <button
              className="btn btn-outline min-h-11"
              disabled={where.busy || loading}
              onClick={locateMe}
              type="button"
            >
              {where.busy ? 'Finding you…' : 'Use my location'}
            </button>
            <span className="muted text-base">
              Your browser asks before it shares your location.
            </span>
          </div>
          {where.message && (
            <p className="measure mt-3 text-base" role="alert">
              {where.message}
            </p>
          )}
          <div
            aria-describedby="location-pin-help"
            aria-label="Map"
            className="location-map mt-4 h-[min(60vh,26rem)] w-full overflow-hidden border border-border bg-surface"
            ref={element}
            role="region"
          />
          <p aria-live="polite" className="muted mt-2 text-base" role="status">
            {loading
              ? 'Opening the map…'
              : problem
                ? problem
                : live
                  ? `Pin at ${describeCoordinates(live.lat, live.lng)}`
                  : ''}
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
