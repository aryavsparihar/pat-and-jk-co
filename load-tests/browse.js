// 50 people browsing the public pages at once, each pausing 1 to 4 seconds between pages, as a
// reader does. docs/LOAD_TEST.md says how to run it (Preview only, never production).
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE = __ENV.BASE_URL
const bypass = __ENV.VERCEL_BYPASS ? { 'x-vercel-protection-bypass': __ENV.VERCEL_BYPASS } : {}

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: Number(__ENV.VUS || 50) },
        { duration: __ENV.DURATION || '3m', target: Number(__ENV.VUS || 50) },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
  },
}

const PAGES = [
  '/',
  '/about',
  '/values',
  '/ventures',
  '/ventures/phulhaar-gallery',
  '/leadership',
  '/journal',
  '/contact',
  '/collaborate',
  '/collaborate/artists',
]

export default function browse() {
  const page = PAGES[Math.floor(Math.random() * PAGES.length)]
  const response = http.get(`${BASE}${page}`, { headers: bypass, tags: { name: page } })
  check(response, { 'page loads': (r) => r.status === 200 })
  sleep(1 + Math.random() * 3)
}
