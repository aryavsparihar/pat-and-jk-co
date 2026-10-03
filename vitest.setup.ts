// Load .env files
import 'dotenv/config'

// Tests never send real email, whatever the local .env holds. Without a key the app prints
// messages to the log instead (src/security/email.ts, src/members/emails.ts).
delete process.env.RESEND_API_KEY

// Nor do they ask Cloudflare: without the keys the Turnstile check is skipped, and the tests that
// cover it set their own (tests/int/turnstile.int.spec.ts)
delete process.env.TURNSTILE_SECRET_KEY
delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
