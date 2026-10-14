'use client'

import { useCallback, useState } from 'react'

/**
 * "Use my location": the device's own position, from the browser, which asks the person first.
 * Nothing is sent anywhere until they place the pin and save the step. If they say no, or the
 * device cannot tell, they are told kindly and can search or move the pin themselves.
 */
export const useMyLocation = ({ canSearch }: { canSearch: boolean }) => {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const instead = canSearch
    ? 'Search for your address instead, or move the pin yourself.'
    : 'Move the pin to your home yourself instead.'

  const locate = useCallback(
    (onFound: (latitude: number, longitude: number) => void) => {
      setMessage(null)
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        setMessage(`This browser cannot share a location. ${instead}`)
        return
      }
      setBusy(true)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setBusy(false)
          onFound(position.coords.latitude, position.coords.longitude)
        },
        (error) => {
          setBusy(false)
          setMessage(
            error.code === error.PERMISSION_DENIED
              ? `That is fine; your location stays with you. ${instead}`
              : `We could not find where you are just now. ${instead}`,
          )
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
      )
    },
    [instead],
  )

  return { locate, busy, message, clear: () => setMessage(null) }
}

/** "32.385° N, 75.517° E", for the live read-out under the map */
export const describeCoordinates = (latitude: number, longitude: number) =>
  `${Math.abs(latitude).toFixed(5)}° ${latitude >= 0 ? 'N' : 'S'}, ${Math.abs(longitude).toFixed(5)}° ${longitude >= 0 ? 'E' : 'W'}`

export const roundCoordinate = (n: number) => Math.round(n * 1e6) / 1e6
