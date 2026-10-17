'use client'

import React, { useEffect, useRef, useState } from 'react'

import { STATE_CENTRES } from '@/members/forms/stateCentres'

import { loadGoogleMaps, onGoogleMapsRefused } from './googleMaps'
import { circleColour, type MapStyle, MapStyleToggle } from './MapStyleToggle'
import {
  CITY_ZOOM,
  describeAccuracy,
  describeCoordinates,
  type Fix,
  roundCoordinate,
  useMyLocation,
  zoomForAccuracy,
} from './useMyLocation'

const INDIA = { lat: 22.6, lng: 79.0 }
/** Street level: close enough to tell one house from the next */
const STREET_ZOOM = 18
/** Satellite with road and place names, which makes a home easier to find than bare imagery */
const MAP_TYPES: Record<MapStyle, string> = {
  map: 'roadmap',
  satellite: 'hybrid',
  terrain: 'terrain',
}

/**
 * How close to zoom for a place Google found, from the typed address or the search: the house or
 * street when it found that; the neighbourhood or PIN code; the town (city level); the state.
 */
const zoomForPlace = (types: string[]): number | null => {
  const is = (...wanted: string[]) => wanted.some((type) => types.includes(type))
  if (is('street_address', 'premise', 'subpremise', 'route', 'plus_code', 'establishment'))
    return 17
  if (is('neighborhood', 'sublocality', 'sublocality_level_1', 'postal_code')) return 14
  if (is('locality', 'administrative_area_level_3', 'administrative_area_level_2')) return CITY_ZOOM
  if (is('administrative_area_level_1')) return 7
  if (is('country')) return 5
  return null
}

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
  const circle = useRef<google.maps.Circle | null>(null)
  const locateAfterOpen = useRef(false)
  const [style, setStyle] = useState<MapStyle>('map')
  const pinned = typeof latitude === 'number' && typeof longitude === 'number'
  const where = useMyLocation({ canSearch: true })

  const place = (lat: number, lng: number, zoom = STREET_ZOOM) => {
    if (!map.current || !marker.current) return
    marker.current.position = { lat, lng }
    map.current.panTo({ lat, lng })
    map.current.setZoom(zoom)
    setLive({ lat, lng })
    onValue(roundCoordinate(lat), roundCoordinate(lng))
  }

  const showFix = ({ latitude: lat, longitude: lng, accuracy }: Fix) => {
    if (!map.current) return
    place(lat, lng, zoomForAccuracy(accuracy))
    if (circle.current) {
      circle.current.setCenter({ lat, lng })
      circle.current.setRadius(accuracy)
    } else {
      const colour = circleColour(element.current)
      circle.current = new google.maps.Circle({
        map: map.current,
        center: { lat, lng },
        radius: accuracy,
        clickable: false,
        strokeColor: colour,
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: colour,
        fillOpacity: 0.15,
      })
    }
  }

  const locateMe = () => where.locate(showFix)

  const showStyle = (next: MapStyle) => {
    map.current?.setMapTypeId(MAP_TYPES[next])
    setStyle(next)
  }

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
          const best = found?.results[0]
          const closer = best ? zoomForPlace(best.types) : null
          if (best && closer) {
            center = best.geometry.location.toJSON()
            zoom = closer
          }
        }

        const m = new Map(element.current, {
          center,
          zoom,
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
          clickableIcons: false,
          streetViewControl: false,
          // Map, Satellite and Terrain are switched from our own buttons above the map
          mapTypeControl: false,
          mapTypeId: MAP_TYPES[style],
          fullscreenControl: false,
          // Big enough to press with a thumb
          zoomControl: true,
          controlSize: 44,
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
        // Their own placing wins over a better fix still on its way
        pin.addListener('dragstart', () => where.stop())
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
          where.stop()
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
          await found.fetchFields({ fields: ['location', 'types'] })
          if (found.location) {
            place(
              found.location.lat(),
              found.location.lng(),
              zoomForPlace(found.types ?? []) ?? STREET_ZOOM - 1,
            )
          }
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
    circle.current?.setMap(null)
    circle.current = null
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
          <div className="mt-4">
            <MapStyleToggle disabled={loading} onChange={showStyle} value={style} />
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
              : live
                ? `Pin at ${describeCoordinates(live.lat, live.lng)}`
                : 'The pin is placed once you move it, search, or use your location.'}
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
