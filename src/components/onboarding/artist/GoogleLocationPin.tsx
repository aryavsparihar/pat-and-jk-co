'use client'

import React, { useEffect, useRef, useState } from 'react'

import { STATE_CENTRES } from '@/members/forms/stateCentres'

import { loadGoogleMaps, onGoogleMapsRefused } from './googleMaps'
import { describeCoordinates, roundCoordinate, useMyLocation } from './useMyLocation'

const INDIA = { lat: 22.6, lng: 79.0 }
/** Street level: close enough to tell one house from the next */
const STREET_ZOOM = 18

type Props = {
  apiKey: string
  latitude?: number | null
  longitude?: number | null
  state?: string
  /** What the artist has typed so far, to start the map there */
  address?: string
  onValue: (latitude: number | undefined, longitude: number | undefined) => void
  /** Google refused the key or could not be reached: show OpenStreetMap's map instead */
  onUnavailable: () => void
}

/**
 * The map on the address step, Google's: search for an address with Google's suggestions, use the
 * device's location, or drag the pin; the coordinates update as it moves. Google's code loads only
 * when the artist opens the map or asks for their location.
 */
export const GoogleLocationPin: React.FC<Props> = ({
  apiKey,
  latitude,
  longitude,
  state,
  address,
  onValue,
  onUnavailable,
}) => {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [live, setLive] = useState<{ lat: number; lng: number } | null>(null)
  const element = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLDivElement>(null)
  const map = useRef<google.maps.Map | null>(null)
  const marker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const locateAfterOpen = useRef(false)
  const pinned = typeof latitude === 'number' && typeof longitude === 'number'
  const where = useMyLocation({ canSearch: true })

  const place = (lat: number, lng: number, { zoom = true } = {}) => {
    if (!map.current || !marker.current) return
    marker.current.position = { lat, lng }
    map.current.panTo({ lat, lng })
    if (zoom) map.current.setZoom(STREET_ZOOM)
    setLive({ lat, lng })
    onValue(roundCoordinate(lat), roundCoordinate(lng))
  }

  const locateMe = () =>
    where.locate((lat, lng) => {
      if (map.current) place(lat, lng)
    })

  useEffect(() => {
    if (!open || !element.current || map.current) return
    let cancelled = false
    setLoading(true)
    onGoogleMapsRefused(() => onUnavailable())
    void (async () => {
      try {
        await loadGoogleMaps(apiKey)
        const [{ Map }, { AdvancedMarkerElement }, { PlaceAutocompleteElement }, { Geocoder }] =
          await Promise.all([
            google.maps.importLibrary('maps') as Promise<google.maps.MapsLibrary>,
            google.maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
            google.maps.importLibrary('places') as Promise<google.maps.PlacesLibrary>,
            google.maps.importLibrary('geocoding') as Promise<google.maps.GeocodingLibrary>,
          ])
        if (cancelled || !element.current) return

        // Where to start: their pin; else the address they typed; else their state; else India
        let center: google.maps.LatLngLiteral = pinned
          ? { lat: latitude!, lng: longitude! }
          : (() => {
              const c = STATE_CENTRES[state ?? '']
              return c ? { lat: c[0], lng: c[1] } : INDIA
            })()
        let zoom = pinned ? 17 : STATE_CENTRES[state ?? ''] ? 7 : 5
        if (!pinned && address?.trim()) {
          const found = await new Geocoder()
            .geocode({ address, region: 'in', componentRestrictions: { country: 'IN' } })
            .catch(() => null)
          const spot = found?.results[0]?.geometry.location
          if (spot) {
            center = spot.toJSON()
            zoom = 16
          }
        }

        const m = new Map(element.current, {
          center,
          zoom,
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
          clickableIcons: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          gestureHandling: 'cooperative',
        })
        const pin = new AdvancedMarkerElement({
          map: m,
          position: center,
          gmpDraggable: true,
          title: 'Your pin. Drag it to your home.',
        })
        const at = () => {
          const p = pin.position
          if (!p) return null
          return 'lat' in p && typeof p.lat === 'function'
            ? { lat: (p as google.maps.LatLng).lat(), lng: (p as google.maps.LatLng).lng() }
            : (p as google.maps.LatLngLiteral)
        }
        pin.addListener('drag', () => setLive(at()))
        pin.addListener('dragend', () => {
          const p = at()
          if (p) {
            setLive(p)
            onValue(roundCoordinate(p.lat), roundCoordinate(p.lng))
          }
        })
        // A tap on the map moves the pin there
        m.addListener('click', (event: google.maps.MapMouseEvent) => {
          if (!event.latLng) return
          pin.position = event.latLng
          setLive(event.latLng.toJSON())
          onValue(roundCoordinate(event.latLng.lat()), roundCoordinate(event.latLng.lng()))
        })

        // Google's address search, limited to India
        const box = new PlaceAutocompleteElement({ includedRegionCodes: ['in'] })
        box.id = 'location-search'
        box.setAttribute('aria-label', 'Search for your address')
        box.addEventListener('gmp-select', async (event) => {
          const chosen = (event as unknown as google.maps.places.PlacePredictionSelectEvent)
            .placePrediction
          const found = chosen.toPlace()
          await found.fetchFields({ fields: ['location'] })
          if (found.location) place(found.location.lat(), found.location.lng())
        })
        search.current?.replaceChildren(box)

        map.current = m
        marker.current = pin
        if (pinned) setLive(center)
        if (locateAfterOpen.current) {
          locateAfterOpen.current = false
          locateMe()
        }
      } catch {
        if (!cancelled) onUnavailable()
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

  const close = () => {
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
        Google&rsquo;s, and it loads only if you open it.
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
          <p className="measure text-base" id="location-pin-help">
            Search for your address, or use your location, then drag the pin (or tap the map) to
            place it exactly.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
            <div className="location-search min-w-0 flex-1 basis-72">
              <label className="label mb-1 block" htmlFor="location-search">
                Search for your address
              </label>
              <div ref={search} />
            </div>
            <button
              className="btn btn-outline min-h-11"
              disabled={where.busy || loading}
              onClick={locateMe}
              type="button"
            >
              {where.busy ? 'Finding you…' : 'Use my location'}
            </button>
          </div>
          <p className="muted mt-2 text-base">Your browser asks before it shares your location.</p>
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
              : live
                ? `Pin at ${describeCoordinates(live.lat, live.lng)}`
                : 'The pin is placed once you move it, search, or use your location.'}
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
