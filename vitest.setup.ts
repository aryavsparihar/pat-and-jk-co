// Load .env files
import 'dotenv/config'

// Tests never send real email, whatever the local .env holds. Without a key the app prints
// messages to the log instead (src/security/email.ts, src/members/emails.ts).
delete process.env.RESEND_API_KEY
