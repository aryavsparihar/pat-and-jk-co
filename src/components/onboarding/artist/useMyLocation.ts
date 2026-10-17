'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * "Use my location": the device's own position, from the browser and nothing else (no lookup by
 * IP address, no guess standing in for it). The browser asks the person first, and nothing is
 * sent anywhere until they place the pin and save the step. If they say no, or the device cannot
 * tell, they are told kindly and can search or move the pin themselves.
 *
 * A phone has GPS and answers to a few metres. A computer has none: the browser estimates from
 * nearby Wi-Fi or the connection, and can be kilometres out. So we watch the position for a few
 * seconds and keep the best fix, stopping early once one is good enough, and pass on how accurate
 * it is, so the map can draw it and say when to drag the pin instead.
 */

/** A fix this close (metres) is as good as it gets; stop watching */
const GOOD_ENOUGH = 25
/** How long after the first fix to wait for a better one */
const WATCH_MS = 6_000
/** Beyond this (metres), say the location is only approximate */
export const APPROXIMATE_ABOVE = 500

export type Fix = { latitude: number; longitude: number; accuracy: number }

export const useMyLocation = ({ canSearch }: { canSearch: boolean }) => {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [fix, setFix] = useState<Fix | null>(null)
  const stopWatching = useRef<(() => void) | null>(null)
  const instead = canSearch
    ? 'Search for your address instead, or move the pin yourself.'
    : 'Move the pin to your home yourself instead.'

  // Never leave the device watching after the map has gone
  useEffect(() => () => stopWatching.current?.(), [])

  /**
   * Finds the device: `onFix` gets the first fix at once and each better one after it, so the
   * map moves as the browser narrows it down.
   */
  const locate = useCallback(
    (onFix: (fix: Fix) => void) => {
      stopWatching.current?.()
      setMessage(null)
      setFix(null)
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        setMessage(`This browser cannot share a location. ${instead}`)
        return
      }
      setBusy(true)
      let best: Fix | null = null
      let timer: ReturnType<typeof setTimeout> | undefined
      let done = false
      const stop = () => {
        done = true
        navigator.geolocation.clearWatch(watch)
        if (timer) clearTimeout(timer)
        stopWatching.current = null
        setBusy(false)
      }
      const finish = () => {
        stop()
        if (best && best.accuracy > APPROXIMATE_ABOVE) {
          setMessage(
            canSearch
              ? 'This is approximate on computers. Drag the pin to your exact place, or search your address.'
              : 'This is approximate on computers. Drag the pin to your exact place.',
          )
        }
      }
      // The browser always answers later, never inside this call, so `watch` is set by then
      const watch = navigator.geolocation.watchPosition(
        (position) => {
          if (done) return
          const next: Fix = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: Math.max(1, Math.round(position.coords.accuracy)),
          }
          if (best && next.accuracy >= best.accuracy) return
          const first = !best
          best = next
          setFix(next)
          onFix(next)
          if (next.accuracy <= GOOD_ENOUGH) return finish()
          if (first) timer = setTimeout(finish, WATCH_MS)
        },
        (error) => {
          if (done) return
          // A fix already in hand is better than an error
          if (best) return finish()
          stop()
          setMessage(
            error.code === error.PERMISSION_DENIED
              ? `That is fine; your location stays with you. ${instead}`
              : `We could not find where you are just now. ${instead}`,
          )
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
      )
      stopWatching.current = stop
    },
    [canSearch, instead],
  )

  return {
    locate,
    busy,
    message,
    /** The best fix so far, for the accuracy circle */
    fix,
    /** Stops waiting for a better fix: the artist is placing the pin themselves */
    stop: () => stopWatching.current?.(),
    clear: () => {
      stopWatching.current?.()
      setMessage(null)
      setFix(null)
    },
  }
}

/**
 * How close to zoom for a fix: street level for a good one, city level for a rough one, so the
 * whole area the device might be in is on screen without losing the town.
 */
export const zoomForAccuracy = (metres: number) =>
  metres <= 50 ? 18 : metres <= 150 ? 17 : metres <= 500 ? 16 : metres <= 1_500 ? 14 : 12

/** City level: a town and its surroundings, for a typed city or a rough fix */
export const CITY_ZOOM = 12

/** "within about 40 m" or "within about 3.2 km", for the line under the map */
export const describeAccuracy = (metres: number) =>
  metres >= 1_000
    ? `within about ${Math.round(metres / 100) / 10} km`
    : `within about ${Math.round(metres)} m`

/** "32.385° N, 75.517° E", for the live read-out under the map */
export const describeCoordinates = (latitude: number, longitude: number) =>
  `${Math.abs(latitude).toFixed(5)}° ${latitude >= 0 ? 'N' : 'S'}, ${Math.abs(longitude).toFixed(5)}° ${longitude >= 0 ? 'E' : 'W'}`

export const roundCoordinate = (n: number) => Math.round(n * 1e6) / 1e6
