// A burst on /api/health: up to 100 requests a second for 30 seconds, the way a misbehaving
// monitor or a scanner might. Each request touches the database once.
import http from 'k6/http'
import { check } from 'k6'

const BASE = __ENV.BASE_URL
const bypass = __ENV.VERCEL_BYPASS ? { 'x-vercel-protection-bypass': __ENV.VERCEL_BYPASS } : {}

export const options = {
  scenarios: {
    burst: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '10s', target: Number(__ENV.RATE || 100) },
        { duration: '30s', target: Number(__ENV.RATE || 100) },
        { duration: '5s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
}

export default function health() {
  const response = http.get(`${BASE}/api/health`, { headers: bypass })
  check(response, { healthy: (r) => r.status === 200 && r.json('database') === 'ok' })
}
