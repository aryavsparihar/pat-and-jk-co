// 20 artists working through the application at once: reading where they are, saving About you,
// Where you live and Your practice, and asking for their identity code. Each artist is a signed-in
// session made beforehand by prepare-sessions.ts, as the test cannot receive emailed codes. A
// second, smaller scenario asks for sign-in codes for addresses that have no account (so no email
// is sent), through Cloudflare Turnstile's test keys, to load the code request itself.
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE = __ENV.BASE_URL
const bypass = __ENV.VERCEL_BYPASS ? { 'x-vercel-protection-bypass': __ENV.VERCEL_BYPASS } : {}
const sessions = JSON.parse(open('./sessions.json'))
// Multiplies every pause. At 1, twenty artists send about 320 POSTs a minute from this one machine,
// over the Firewall's 100 a minute per IP; at 4, about 80 (docs/LOAD_TEST.md)
const THINK = Number(__ENV.THINK || 4)

export const options = {
  scenarios: {
    apply: {
      executor: 'per-vu-iterations',
      vus: Math.min(Number(__ENV.ARTISTS || 20), sessions.length),
      iterations: Number(__ENV.ROUNDS || 3),
      maxDuration: '10m',
      exec: 'apply',
    },
    signIn: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.SIGNIN_PER_MINUTE || 10),
      timeUnit: '1m',
      duration: '3m',
      preAllocatedVUs: 5,
      exec: 'signIn',
    },
  },
  thresholds: {
    'http_req_failed{scenario:apply}': ['rate<0.01'],
    'http_req_duration{scenario:apply}': ['p(95)<2500'],
  },
}

const json = (cookie) => ({
  headers: { ...bypass, cookie, origin: BASE, 'content-type': 'application/json' },
})

const steps = {
  about: {
    legalName: 'Load Test Artist',
    displayName: 'Load Test',
    dateOfBirth: '1990-04-12',
    phone: '98765 43210',
    language: 'English',
  },
  address: {
    residence: {
      line1: 'House 1, Example Lane',
      city: 'Kathua',
      district: 'Kathua',
      state: 'Jammu and Kashmir',
      postalCode: '184101',
      country: 'India',
    },
    correspondenceSame: true,
  },
  practice: {
    mediums: ['painting'],
    stylesThemes:
      'Landscapes of the Shivalik foothills, painted outdoors in every season, in oil and watercolour.',
    yearsPractising: 6,
    bio: 'A painter working in oils and watercolour, mostly outdoors, across the seasons. '.repeat(
      4,
    ),
    priceRange: '25k-1l',
    recognition: [],
    recognitionNone: true,
  },
}

export function apply() {
  const cookie = sessions[(__VU - 1) % sessions.length]
  const read = http.get(`${BASE}/next/members/application?type=artist`, {
    ...json(cookie),
    tags: { name: 'read application' },
  })
  check(read, { 'application read': (r) => r.status === 200 })
  for (const [step, data] of Object.entries(steps)) {
    sleep((2 + Math.random() * 4) * THINK) // typing
    const saved = http.post(
      `${BASE}/next/members/application/step`,
      JSON.stringify({ step, data }),
      { ...json(cookie), tags: { name: `save ${step}` } },
    )
    check(saved, { [`${step} saved`]: (r) => r.status === 200 })
  }
  const code = http.post(`${BASE}/next/members/kyc/identity-code`, '{}', {
    ...json(cookie),
    tags: { name: 'identity code' },
  })
  check(code, { 'identity code given': (r) => r.status === 200 })
  sleep(3 * THINK)
}

export function signIn() {
  // The page carries a signed form token that must be a few seconds old
  const page = http.get(`${BASE}/collaborate/signin`, {
    headers: bypass,
    tags: { name: 'sign-in page' },
  })
  // The token reaches the page inside React's data, where its quotes are escaped
  const token = /formToken\\?":\\?"(\d+\.[\w-]+)/.exec(page.body || '')
  sleep(3)
  const response = http.post(
    `${BASE}/next/members/request-code`,
    JSON.stringify({
      email: `nobody-${__VU}-${__ITER}-${Date.now()}@load-test.invalid`,
      purpose: 'signin',
      formToken: token ? token[1] : '',
      // Cloudflare's test secret accepts this dummy token (Preview uses the test keys)
      'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX',
    }),
    {
      headers: { ...bypass, origin: BASE, 'content-type': 'application/json' },
      tags: { name: 'request code' },
    },
  )
  // 200 answered, 429 the app's own per-IP limit doing its job; anything else is a failure
  check(response, { 'code request answered': (r) => r.status === 200 || r.status === 429 })
}
