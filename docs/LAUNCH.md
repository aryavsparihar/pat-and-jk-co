# Launch checklist

Phulhaar's applications open on **8 November 2026**. Everything here should be done by
**30 October**, so the last week is spare. Work from the top: the early items take other people's
time.

Each item says where to do it and how to tell it is done. Tick it here in a pull request, so the
history shows who did what and when. This list replaces "What needs doing by hand" in
[AUDIT.md](AUDIT.md).

## 1. Legal and records

These need a lawyer or a CA, so start them first.

- [ ] **Privacy notice.** A lawyer reviews [PRIVACY_DRAFT.md](PRIVACY_DRAFT.md) against the DPDP
      Act 2023 and Rules and resolves every **[confirm]**: the privacy contact address, the
      registered office, the offline-verification wording, data stored outside India, how long
      enquiries and declined applications are kept, the response time, and the date.
- [ ] **Publish it.** Paste the approved text into **Pages → Privacy policy** in the admin. Then
      raise `PRIVACY_NOTICE_VERSION` in `src/members/application.ts` (now `2026-10`) in a pull
      request, so consent given under the old text stays recorded against it.
- [ ] **Aadhaar wording.** The lawyer approves what the application says about Aadhaar: masked
      e-Aadhaar only, never the full number, and another ID as an equal choice.
- [ ] **The identity photo.** The lawyer approves asking artists for a photo of themselves holding
      their handwritten code and name, and the wording around it ([KYC.md](KYC.md)).
- [ ] **Artists' Terms & Conditions.** The lawyer approves the PDF; upload it in **Site settings →
      Applications → Artists' Terms & Conditions**. Until it is there, artists are not asked to
      agree to any terms.
- [ ] **Approved artists' KYC.** A CA confirms how many years after the last payment it must be
      kept. Put the number in [KYC.md](KYC.md) ("Retention") and in the privacy notice. Until a
      reviewer sets a legal hold, nothing about an approved artist is deleted automatically.

## 2. Services

- [ ] **Production database string is pooled.** Vercel → Settings → Environment Variables →
      `DATABASE_URL` (Production): the host contains `-pooler`.
- [ ] **Previews have their own database.** `DATABASE_URL` for Preview is the Neon `preview`
      branch, and `MIGRATE_ON_PREVIEW=1` is set for Preview only.
- [ ] **Turnstile.** Production has the real keys, Preview has Cloudflare's test keys. Production
      refuses to start with the test keys, so a successful deploy proves this. After the Turnstile
      pull request is merged, request a sign-in code and send a contact message on pjk.co.in.
- [x] **Firewall rate limit** published (4 October 2026): POSTs to the code, application, KYC,
      picture and form endpoints, 100 per 60 seconds per IP ([SECURITY.md](SECURITY.md)).
- [ ] **`PAYLOAD_SECRET` is 32 characters or more.** The logs warn once per cold start while it is
      24. Replace it with `openssl rand -hex 32`. Everyone signed in signs in again; nothing else
      changes.
- [ ] **The weekly KYC purge runs.** Vercel → Crons shows `/next/cron/kyc-purge` succeeding on
      Mondays at 02:00 UTC.
- [ ] **Payload is current.** The upgrade to 3.90.2 (a security release) is merged.

## 3. Keys and accounts

- [ ] **Offline copies of the KYC keys.** `KYC_ENCRYPTION_KEY` and `KYC_BLIND_INDEX_KEY` are written
      down and kept somewhere safe, away from any computer. Without the first, every KYC record is
      lost for good.
- [ ] **Two-factor authentication** on Vercel, Neon, GitHub, Resend, Cloudflare and GoDaddy.
- [ ] **Super admin password rotated**, and never typed into a chat, ticket or email.
- [ ] **Staff accounts.** Everyone who reviews applications has their own account. Only those who
      must see identity and payout details have the **KYC reviewer** role. They have read "Artists
      and partners" in [ADMIN_GUIDE.md](ADMIN_GUIDE.md), the checklist before approving above all.

## 4. Email

- [ ] **Sending.** Resend shows the pjk.co.in domain as verified, and mail from `noreply@pjk.co.in`
      reaches an ordinary Gmail inbox, not its spam folder.
- [ ] **Mailboxes.** Each of these exists and someone reads it: `hello@`, `business@` and `tech@`
      (shown on the site), `yuvraj@` (the grievance officer), and the privacy address the notice
      gives.
- [ ] **Notifications.** **Enquiries → Forms**: Contact and Collaborate each email an inbox. New
      applications, payout details waiting for a check, and works sent for review reach the staff
      inbox.

## 5. The site

- [x] **/collaborate leads to the applications.** "Two ways to begin" and "How it works" were added
      by a migration on 4 October 2026, and the open calls lead to the applications. Read the
      words once in the admin; they are yours to change.
- [ ] **The closed note.** Site settings → Applications → *Note while applications are closed*
      says what you want visitors to read until 8 November.

## 6. Dress rehearsal (week of 26 October)

One full application in production, with your own details, then deleted. It is the only test of
the real email, Blob store, Turnstile keys and KYC encryption together.

- [ ] **Open applications** (Site settings → Applications → *Applications are open*). The public
      can apply while it is on, so do the rehearsal in one sitting and close it straight after.
- [ ] **Apply as an artist** at pjk.co.in/collaborate/artists with your own email, PAN, masked
      e-Aadhaar and three pictures; it asks for no bank details. Stop halfway, sign in again from
      another device, and finish.
- [ ] **Check the emails:** the code, "We have your application", and the staff notification.
- [ ] **Check the admin:** the application is there. The KYC record shows everything masked.
      **Reveal** and **Download** ask for a reason and appear in the security log. The identity
      document box shows the e-Aadhaar check's result.
- [ ] **Ask for changes, do not approve.** Write a short note and press **Ask for changes**, then
      check that email arrives. Approving would use up `AT000001` for good (member IDs come from a
      sequence and are never reused), and it is kept for the first real artist. Approval is
      covered by the end-to-end tests.
- [ ] **Close applications.**
- [ ] **Delete it.** Signed in as the test applicant, **Account → Your data**: withdraw consent and
      ask for deletion. Run the purge (Vercel → Crons → `/next/cron/kyc-purge` → Run), or wait for
      Monday. The security log shows `kyc-purged`. Then, as a super admin, delete any works and
      portfolio pictures, then the application, then the member.

## 7. Launch day, 8 November

- [ ] Turn on **Site settings → Applications → Applications are open**.
- [ ] Apply's first step works on a phone: the code arrives.
- [ ] Watch the staff inbox and the security log during the day.

## 8. Before the first payout details are collected

Bank details are asked for only when a sale needs a payout ([KYC.md](KYC.md#payout-details)), so
these can wait until the first work sells.

- [ ] **Neon on the Launch plan**, with the restore window set to 7 days (Neon → Settings →
      Storage / History retention). Done when the plan page says Launch. Still recommended before
      applications open: the applications and identity documents are worth a 7-day restore window
      too.
- [ ] **The first payout, end to end.** On the artist's KYC record, press **Request payout
      details**; the artist adds them in their account; reveal them, send ₹1 and have the artist
      confirm it arrived; press **Approve the details**. Only then pay.
- [ ] **Everyone who pays artists knows the rule:** bank details are never accepted by email,
      WhatsApp or phone, only through the artist's own account ([ADMIN_GUIDE.md](ADMIN_GUIDE.md)).

## Not before launch, unless you choose

Each needs an account; ask before adding one.

- Uptime checks against `/api/health` (Better Stack or UptimeRobot).
- Error tracking (Sentry, with `sendDefaultPii: false`).
- Vercel Pro, once artist data is being collected.
