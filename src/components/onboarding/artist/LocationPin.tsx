'use client'

import type { Circle, Layer, Map as LeafletMap, Marker } from 'leaflet'
import React, { useEffect, useRef, useState } from 'react'

import { STATE_CENTRES } from '@/members/forms/stateCentres'

import { GoogleLocationPin } from './GoogleLocationPin'
import { type MapStyle, MapStyleToggle } from './MapStyleToggle'
import {
  CITY_ZOOM,
  describeAccuracy,
  describeCoordinates,
  type Fix,
  roundCoordinate,
  useMyLocation,
  zoomForAccuracy,
} from './useMyLocation'

/**
 * The OpenStreetMap map's three looks, all free and without an account; the member pages' policy
 * allows exactly these hosts (src/security/memberPagePolicy.ts):
 *
 *   Map        OpenStreetMap's own tiles
 *   Satellite  Esri's World Imagery, with Esri's place names over it
 *   Terrain    OpenTopoMap (OpenStreetMap data with contours and hill shading)
 */
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer" target="_blank">OpenStreetMap</a> contributors'
const TILES = {
  map: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  imagery:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  places:
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
}
/** OpenStreetMap's own place search, asked once per opening of the map, for the town only */
const PLACE_SEARCH = 'https://nominatim.openstreetmap.org/search'
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
  /** The town (or else the district) they typed, so OpenStreetMap's map can start there */
  town?: string
  country?: string
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
  town,
  country,
  onValue,
  replacingGoogle = false,
}) => {
  const [open, setOpen] = useState(replacingGoogle)
  const [problem, setProblem] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const circle = useRef<Circle | null>(null)
  const tiles = useRef<Layer | null>(null)
  const leaflet = useRef<typeof import('leaflet') | null>(null)
  /** Once the artist has moved the pin or asked for their location, nothing else moves the map */
  const touched = useRef(false)
  const locateAfterOpen = useRef(false)
  const [live, setLive] = useState<{ lat: number; lng: number } | null>(null)
  const [style, setStyle] = useState<MapStyle>('map')
  const pinned = typeof latitude === 'number' && typeof longitude === 'number'
  const where = useMyLocation({ canSearch: false })

  const showFix = ({ latitude: lat, longitude: lng, accuracy }: Fix) => {
    const L = leaflet.current
    if (!L || !map.current || !marker.current) return
    marker.current.setLatLng([lat, lng])
    map.current.setView([lat, lng], zoomForAccuracy(accuracy))
    if (circle.current) circle.current.setLatLng([lat, lng]).setRadius(accuracy)
    else {
      circle.current = L.circle([lat, lng], {
        radius: accuracy,
        className: 'location-accuracy',
        interactive: false,
      }).addTo(map.current)
    }
    setLive({ lat, lng })
    onValue(rounded(lat), rounded(lng))
  }

  const locateMe = () => {
    touched.current = true
    where.locate(showFix)
  }

  /** Map, Satellite or Terrain: one tile layer (two for satellite) at a time */
  const showStyle = (next: MapStyle) => {
    const L = leaflet.current
    const m = map.current
    if (!L || !m) return
    tiles.current?.remove()
    tiles.current =
      next === 'satellite'
        ? L.layerGroup([
            L.tileLayer(TILES.imagery, {
              maxZoom: 19,
              maxNativeZoom: 18,
              attribution: 'Powered by Esri. Imagery &copy; Esri, Maxar, Earthstar Geographics',
            }),
            L.tileLayer(TILES.places, { maxZoom: 19, maxNativeZoom: 18 }),
          ])
        : next === 'terrain'
          ? L.tileLayer(TILES.terrain, {
              maxZoom: 19,
              maxNativeZoom: 17,
              subdomains: 'abc',
              attribution: `${OSM_ATTRIBUTION}, &copy; <a href="https://opentopomap.org" rel="noopener noreferrer" target="_blank">OpenTopoMap</a> (CC-BY-SA)`,
            })
          : L.tileLayer(TILES.map, { maxZoom: 19, attribution: OSM_ATTRIBUTION })
    tiles.current.addTo(m)
    setStyle(next)
  }

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
          zoom: pinned ? 17 : STATE_CENTRES[state ?? ''] ? 7 : 4,
          maxZoom: 19,
          scrollWheelZoom: false,
        })
        leaflet.current = L
        map.current = m
        showStyle(style)
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
        pin.on('dragstart', () => {
          touched.current = true
          // Their own placing wins over a better fix still on its way
          where.stop()
        })
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
          touched.current = true
          where.stop()
          const point = m.latLngToContainerPoint(pin.getLatLng()).add(step)
          pin.setLatLng(m.containerPointToLatLng(point))
          report()
        })
        marker.current = pin
        setTimeout(() => m.invalidateSize(), 0)
        if (pinned) setLive({ lat: start[0], lng: start[1] })
        if (locateAfterOpen.current) {
          locateAfterOpen.current = false
          locateMe()
        } else if (!pinned && town?.trim()) {
          // Start at the town they typed, if OpenStreetMap knows it; the pin is not placed until
          // they move it. Only the town, state and country are sent, never the street
          void findTown(town, state, country).then((spot) => {
            if (!spot || cancelled || touched.current || map.current !== m) return
            m.setView(spot, CITY_ZOOM)
            pin.setLatLng(spot)
          })
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
    circle.current = null
    tiles.current = null
    touched.current = false
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
              ? 'Drag the pin to where you live. Zoom in with the + button to place it closely.'
              : 'Drag the pin to where you live. Zoom in with the + button to place it closely. It is placed once you move it.'}
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
          <div className="mt-4">
            <MapStyleToggle
              disabled={loading || Boolean(problem)}
              onChange={showStyle}
              value={style}
            />
          </div>
          <div
            aria-describedby="location-pin-help"
            aria-label="Map"
            className="location-map mt-3 h-[min(60vh,26rem)] w-full overflow-hidden border border-border bg-surface"
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
          {where.fix && (
            <p className="muted text-base">
              Your device placed you {describeAccuracy(where.fix.accuracy)}: the shaded circle.
            </p>
          )}
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

/**
 * The town's centre from OpenStreetMap's place search (Nominatim), or nothing. Its rules allow an
 * occasional search like this one, not search-as-you-type; the browser sends our site as the
 * referrer, which is how it knows who is asking. Never slows the map: four seconds at most.
 */
const findTown = async (
  town: string,
  state: string | undefined,
  country: string | undefined,
): Promise<[number, number] | null> => {
  const inIndia = !country?.trim() || /^india$/i.test(country.trim())
  const params = new URLSearchParams({
    q: [town, state, inIndia ? 'India' : country].filter((part) => part?.trim()).join(', '),
    format: 'jsonv2',
    limit: '1',
    'accept-language': 'en',
  })
  if (inIndia) params.set('countrycodes', 'in')
  try {
    const response = await fetch(`${PLACE_SEARCH}?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4_000),
    })
    if (!response.ok) return null
    const [found] = (await response.json()) as { lat?: string; lon?: string }[]
    const lat = Number(found?.lat)
    const lon = Number(found?.lon)
    return Number.isFinite(lat) && Number.isFinite(lon) && found ? [lat, lon] : null
  } catch {
    return null
  }
}
