# Email setup (Resend + GoDaddy DNS)

The site sends two kinds of email:

- **Admin sign-in codes** — the six digits needed to reach `/admin`. Without working email, nobody
  can sign in to the live site.
- **Enquiry notifications** — a copy of every message sent through the contact and collaborate forms.

Receiving stays exactly as it is: `pjk.co.in` mail already goes to GoDaddy, and nothing below changes
that. Resend only adds the ability to *send*, from a separate `send.pjk.co.in` subdomain.

Free tier: 3,000 emails a month, 100 a day. Far more than this site needs.

---

## 1. Create the Resend account

Sign up at <https://resend.com> using a **company address** (`aryaveer@pjk.co.in`), not a personal
one, so the company keeps ownership. Turn on two-factor authentication while you are there.

## 2. Add the domain

**Domains → Add Domain** → `pjk.co.in` → choose the region closest to India (**ap-south-1 (Mumbai)**
if offered, otherwise EU/US — it only affects speed).

Resend then shows three records. They look like this (**your values will differ — copy Resend's, not
these**):

| Type | Name/Host | Value |
| --- | --- | --- |
| MX | `send` | `feedback-smtp.ap-south-1.amazonses.com` (priority 10) |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |
| TXT | `resend._domainkey` | `p=MIGfMA0GCSq…` (a long key) |

## 3. Add them at GoDaddy

GoDaddy holds the DNS for `pjk.co.in` (nameservers `ns45/ns46.domaincontrol.com`).

1. Sign in to GoDaddy → **My Products → Domains → pjk.co.in → DNS → Manage Zones**.
2. **Add New Record** for each of the three rows above.
3. **Important:** in the Name/Host box type only the short name — `send` or `resend._domainkey` —
   never `send.pjk.co.in`. GoDaddy adds the domain for you; typing the full name creates
   `send.pjk.co.in.pjk.co.in`, which is the usual reason verification fails.
4. Leave TTL at the default (1 hour).
5. Do **not** touch the existing `MX` records for the root domain or the existing
   `v=spf1 include:secureserver.net -all` record. Your GoDaddy mailboxes keep working; the new
   records only apply to the `send` subdomain.

Back in Resend, press **Verify**. It usually completes in a few minutes; GoDaddy can take up to an
hour. Check progress any time with:

```bash
pnpm check-email
```

## 4. Create an API key

Resend → **API Keys → Create API Key** → name it `pjk-website`, permission **Sending access**,
domain `pjk.co.in`.

Copy it once (it is only shown once) and put it in your local `.env`:

```
RESEND_API_KEY=re_your_key_here
```

> Paste the key straight into the file. Don't send it in a chat, a ticket or an email — anything
> pasted there should be treated as leaked and rotated in Resend.

Then restart the dev server (Ctrl-C, `pnpm dev`).

For the live site, add the same variable in **Vercel → Settings → Environment Variables**
(Production and Preview) and redeploy.

## 5. Check it works

```bash
pnpm check-email aryaveer@pjk.co.in
```

This prints the settings, the DNS state and, if a key is set, sends a real test message. Then try the
whole flow: open `/admin-access`, request a code, and confirm it arrives in the mailbox.

## Addresses used

| Setting | Default | What it is |
| --- | --- | --- |
| `EMAIL_FROM_ADDRESS` | `noreply@pjk.co.in` | Who the mail comes from. No mailbox needed for this one — it only has to be at the verified domain. |
| `EMAIL_FROM_NAME` | `PAT and J.K. Co.` | The sender's name shown in the inbox |
| `CONTACT_INBOX` | `hello@pjk.co.in` | Where enquiries are sent. **This one must be a real mailbox or forwarder** — change it to `aryaveer@pjk.co.in` if `hello@` doesn't exist yet. |

The enquiry address is also set per form under **Enquiries → Forms → Emails**, which overrides the
default for that form.

## If mail doesn't arrive

- `pnpm check-email` shows which piece is missing.
- **Verification stuck:** check for a doubled name (`send.pjk.co.in.pjk.co.in`) in GoDaddy.
- **Codes not arriving but the test message does:** the address must be an `@pjk.co.in` address with
  an active account. Check **Administration → Security log** for what happened.
- **Landing in spam:** send a couple of real messages and mark them "not spam"; new sending domains
  warm up over a few days. DKIM and SPF being verified is what matters most.
- **Locked out entirely:** `ADMIN_EMAIL=aryaveer@pjk.co.in pnpm gate-token` — see [SECURITY.md](SECURITY.md).
