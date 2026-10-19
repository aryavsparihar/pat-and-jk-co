# KYC: identity and payout details

Artists and partners give us their identity details when they apply, so that we can be sure who
we work with; partners give less ([Partners](#partners)). Bank details (payout details) are not
part of the application: we ask for them only when a sale needs a payout, and the artist adds them
in their own account, never by email. Partners are never asked for them. This page is how
those details are taken, kept, shown, changed and deleted, and what each part protects against.
The code is in `src/kyc/`; nothing else touches a key.

## What we take

| | Required | Kept as |
| --- | --- | --- |
| PAN, and the name on it | **Required from every artist**: we need it to pay and for tax | Encrypted, plus a masked copy (`ABCxxxxx4F`) |
| PAN card | **Required.** A photo of the front of the card, or the e-PAN, with the face in its photograph clearly visible: reviewers compare it with the identity photo | Encrypted file |
| A second ID, with an address | **Required.** By default a **masked e-Aadhaar** (the PDF UIDAI issues with the first eight digits hidden) with its last four digits. As an equal choice, with no extra steps: **"I'd rather use another ID"**, a passport, voter ID or driving licence, checked by hand | Aadhaar: last four encrypted, plus `XXXX XXXX 1234`. Either way, the document as an encrypted file. Other ID numbers are not asked for |
| The masked e-Aadhaar PDF's password | Optional. Opens the PDF once, in memory, for the check below | **Never stored or logged** |
| Proof of address | Only if the ID shows an address other than the one given | Encrypted file |
| Identity photo | **Required.** A photo of the artist's face, holding a paper on which they have written their identity code (given on screen, e.g. `K7Q-4MX`), their full name as on the PAN, and their date of birth. Taken in the page with the front camera, or uploaded if there is no camera or they decline it. Proves a real person is applying, now, and that it is them | Encrypted file, re-encoded so camera and location data are gone, like every other document. The code it was taken with is sealed with the photo's own key, with when it was given and until when it held, and copied to the KYC record when the step is saved, so reviewers can compare. **[confirm with counsel: collecting face photographs for identity checks]** |
| Account holder's name, account number, IFSC, branch | **Only when a sale needs a payout**, added by the artist in their account ([Payout details](#payout-details)) | Encrypted, plus `XXXXXXXX1234` and `SBIN0xxxxxx` |
| Bank name, account type | With the payout details | Plain text: neither identifies anyone |
| Cancelled cheque or passbook | No longer asked for; ones given before are kept as they were | Encrypted file |

Applications sent before October 2026 included bank details. Those are kept as they are, under
the same encryption and retention; nothing about them changed.

Records saved before PAN became required may hold only Aadhaar digits, and records saved before a
second ID was required may have none; such an application cannot be sent until the missing part
is added. The full Aadhaar number is never accepted, anywhere: the form asks for four digits, the server
refuses twelve with a message that does not repeat them, and the logs would redact them anyway.
Why, in [SECURITY.md](SECURITY.md#aadhaar).

**The identity code** is six characters from the unambiguous alphabet (no 0/O, 1/I/L, U/V)
(`newIdentityCode` in `src/members/ids.ts`), given when the artist presses **Show my code** and good
for **ten minutes** (`src/kyc/identityCode.ts`). The application keeps only an HMAC of it under
`KYC_BLIND_INDEX_KEY` (`identityCodeHash`), with when it was given and when it runs out; the code
itself reaches the artist once, in the reply. **Get a new code** replaces the hash, so the old code
stops working at once. A photo is accepted only with the current code, and only if it arrives
before the code ran out, with two minutes' grace for a slow upload; the code is then sealed with
the photo. Nothing else in the step is timed.

The photo is tied to the name and date of birth written on the paper: the server keeps an HMAC of
the two with it. If the artist changes the name on their PAN in the step, the page clears the photo
and the code; if they change their date of birth in "About you", Identity is marked as not done,
and saving it again refuses the old photo. Either way they take a new one with a new code.

Applications started before codes expired kept a permanent code on the application
(`identityCode`, shown in the admin only where it is set). Records saved before the photo was asked
for cannot be sent until it is added.

**Consent** comes last in the step. Ticking it opens the privacy policy in a dialog; the artist
reads it to the end, confirms, and types I AGREE. Only then can the step be saved. The KYC record
keeps *Consented At*, the policy version (`PRIVACY_NOTICE_VERSION`, refused if the page held an
older one) and how consent was given.

Rules the form and the server share (`src/kyc/values.ts`, `src/kyc/schema.ts`): a PAN is
`^[A-Z]{5}[0-9]{4}[A-Z]$` with **P** as its fourth character (a person; a company's PAN is refused);
an IFSC is `^[A-Z]{4}0[A-Z0-9]{6}$`; an account number is 9 to 18 digits, typed twice, and the
second box refuses pasting. If the account holder's name shares no word with the name on the PAN,
the record is flagged for staff when the payout details are approved; it is not refused, because
joint accounts and initials are common.

**IFSC lookup.** When an artist types an IFSC in their account, the server (never the browser)
asks Razorpay's free public IFSC directory (`ifsc.razorpay.com`, no account, no key) for the bank
and branch, caches the answer for 30 days, and fills them in. Only the IFSC is sent. The fields
stay editable, and if the lookup fails the artist types them.

## Partners

A partner (curator, art dealer or consultant, designer, gallery, business) is not paid by us, so
only who they are is checked. On the partner form, before it is sent:

| | Required | Kept as |
| --- | --- | --- |
| PAN, and the name on it | **Required from every partner** | Encrypted, plus a masked copy, as for an artist |
| PAN card | **Required**, as for an artist | Encrypted file |
| Identity photo | **Required.** The same live check as an artist's: a code for ten minutes (**Show my code**), and a photo of their face holding a paper with the code and their full name as on the PAN. No date of birth is asked of a partner, so none is written | Encrypted file, as for an artist; the code is copied to the KYC record |
| A second ID, proof of address, bank details | **Not asked** | None |

Consent is given the same way, the privacy policy read to its end in a dialog, confirmed and
I AGREE typed. Everything on the form (their details, these, and agreement to the
Partner/Trade Program) goes in one request, checked together; nothing is kept unless all of it
passes (`submitPartnerApplication` in `src/members/application.ts`, `savePartnerKyc` in
`src/kyc/service.ts`). Identity details need a sign-in within the last 30 minutes, as for an
artist. A partner sending their application again after changes were asked for may keep the
details they gave.

**One record per person.** Someone who applies as both an artist and a partner has one KYC
record. The partner form replaces only the PAN, the name on it, the PAN card and the photo; an
artist's second ID, address answer and Aadhaar check stay. The record keeps the reference it was
first made under. Withdrawing, applying again or the weekly purge never delete what the other
application is still being considered, or was approved, on (`kycNeededByOther`).

The same encryption, storage, access and logging apply to a partner's details as to an artist's,
and reviewers check them with the same checklist (ADMIN_GUIDE.md, "Checking a partner's identity").

## How it flows

```
browser ── HTTPS ──▶ /next/members/kyc            (member session, same origin, rate limited)
                        │ zod check (src/kyc/schema.ts)
                        ▼
                     src/kyc/service.ts ── seals each value ──▶ kyc-records (Postgres)
                                                              masks + blind indexes beside it

browser ── file ───▶ /next/members/kyc/document   (4 MB, PDF or JPEG/PNG/WebP by magic bytes)
                        │ images re-encoded (EXIF gone), sealed
                        ▼
                     private Blob store pjk-kyc (KYC_STORE_ID + OIDC), key in kyc-documents
```

Nothing typed into the KYC step is kept in the browser: not in storage, and not in memory once it
is saved. The reply to every save is the masked view.

## How it is kept

**Envelope encryption, AES-256-GCM throughout** (`src/kyc/crypto.ts`):

- `KYC_ENCRYPTION_KEY`, the master key, lives only in the environment.
- Each record and each document has its own random data key, stored *wrapped* (encrypted) by the
  master key, with the master key's fingerprint beside it.
- Each field is encrypted with the record's data key. The additional authenticated data names the
  member and the field (`member:12:accountNumber`), so a value cannot be copied into another
  member's record, or into another field, without decryption failing.
- Documents are encrypted the same way before they leave the server, into the **private** Blob
  store `pjk-kyc`, separate from the public `pjk-media` store used for images. They are never
  served from a Blob URL, never through the image optimizer, and never cached.

**How the server reaches `pjk-kyc`** (`src/kyc/documentStore.ts`). A private store has no
read-write token: the deployment authenticates with its own short-lived OIDC token, and
`KYC_STORE_ID` names the store. `@vercel/blob` would fall back to `BLOB_STORE_ID` or
`BLOB_READ_WRITE_TOKEN` if either were missing, and both belong to the public store, so the code
never lets it choose: every call passes the OIDC token and `KYC_STORE_ID` explicitly, refuses to
run without them, refuses a `KYC_STORE_ID` that is the media store's, and checks that each upload
landed on a `private` URL of the KYC store (deleting it if not). Production will not start
without `KYC_STORE_ID`. Locally there is no store: documents go, still encrypted, to
`.uploads/kyc`.

**Production and previews share the store**, each in its own folder: `kyc/` for production,
`preview/kyc/` for previews (and `development/kyc/` on a laptop). A document outside the current
environment's folder can be neither read nor deleted. A preview database is a branch of
production's and may hold copies of production's rows; a purge on a preview deletes those copied
rows but leaves production's files alone, and `pnpm kyc:rotate-key` only ever touches the database
it is pointed at, never files.

**Blind indexes** (HMAC-SHA256 under `KYC_BLIND_INDEX_KEY`, a different key) let us see that two
members gave the same PAN or account, without decrypting anything. The record shows the other
application's reference under **Possible duplicates**.

**The API never returns a sealed column or a key** to anyone, staff included: those fields have no
read access. The admin shows masks. The collection is left out of GraphQL and of every
`defaultPopulate`, and nothing links to it from public content.

## Who can see what

| | Masked view | Full values | Documents |
| --- | --- | --- | --- |
| The artist | Their own, on their account | Never shown back | Can replace, not download |
| Editors | No | No | No |
| KYC reviewers and super admins | Yes | **Reveal**, with a typed reason | **Download**, with a typed reason |
| Anyone else, any API | No | No | No |

The **KYC reviewer** role is given under **Users**. It sees KYC records and nothing else that an
editor would not.

**Revealing** asks for a reason (at least ten characters), shows the values in the record's
sidebar for one minute, then wipes them. The reply is `Cache-Control: no-store`, the values are
held only in that component's memory, and the reveal is written to the security log with the
reviewer and the reason. **Downloading** a document works the same way: a POST with a reason, the
file sent as an attachment with `no-store`, `nosniff` and a sandboxing CSP, and a log entry.

## Payout details

Asked for only when a sale needs a payout, so that we hold bank details for as few people, and for
as short a time, as we can. The most common aim of an account takeover, or of a fake email, is to
redirect payments, so:

1. **Staff ask.** On an approved artist's KYC record, a reviewer presses **Request payout details**
   (`/api/kyc-records/:id/request-payout-details`). The artist is emailed a link to
   `/account/payouts`. That email never asks for bank details, never contains any, and says that
   we never ask for them by email. The request is logged with the reviewer's name, and the date
   shows on the record.
2. **The artist adds them in their account**, after a fresh code by email (**step-up**), even
   inside an active session (`/next/members/kyc/bank-change`): the account number typed twice,
   the IFSC looked up.
3. They are sealed into **Requested change of bank details** on the record: encrypted, shown only
   masked, and not used yet. Any earlier account stays in force.
4. The artist is emailed that it happened, with no details in the email and a **This was not me**
   link. Staff are emailed too.
5. A reviewer reveals the details, **sends ₹1 to the account and has the artist confirm it
   arrived**, then presses **Approve the details**. Only then are they used, marked verified by
   that reviewer. The name check and the duplicate check run at this point.

Changing the account later is the same, from step 2. **Bank details are never accepted by email**,
or by any route but this one: if someone sends them, they are not used, and the person is asked to
add them in their account.

**This was not me** (`/account/bank-change/cancel`) stops the change, signs the account out on
every device and tells staff. The page does nothing until its button is pressed, so a mail
scanner following the link cannot trigger it; the token is single-use and only its hash is stored.

The artist does all of this from **Payouts** in their account (`/account/payouts`).

## Retention

| What | Deleted |
| --- | --- |
| KYC of a declined application | 90 days after the decision |
| KYC of an application never sent | 180 days after it was last touched |
| KYC after consent is withdrawn | At the next purge, unless a legal hold applies |
| An uploaded document never saved with the step | After 7 days |
| Identity documents and photo of a declined artist who applies again | At once, when they press **Apply again**: the new application asks for them afresh. What they typed (PAN, the name on it, the last four digits) stays for the new application, if the 90-day rule has not already removed it |
| KYC of an application the applicant withdraws | At once, when they withdraw it, unless their application of the other kind (artist or partner) still needs it |
| KYC of someone who has applied as both an artist and a partner | Only once the current application of each kind is due, by the rules above |
| KYC after a decline, once the person has applied again | Judged by their current application, not the declined one |
| The identity code | Its hash is replaced by the next code; the code itself is kept only with the photo, and goes with it |
| KYC of an approved artist or partner | **[confirm with CA]** Kept while they work with us, then for **[N] years** after the last payment, as the Income Tax Act and GST rules require for payment records. Not deleted automatically until this is settled; a reviewer sets a legal hold on the record with **Set a legal hold** |

**Weekly purge.** Every Monday at 02:00 UTC, Vercel Cron calls `/next/cron/kyc-purge` (in
`vercel.json`), authorised by `CRON_SECRET` and refused without it. It applies the rules above,
deleting each file before its row; a file that cannot be deleted keeps its row, so the next run
tries again. Each deletion goes to the security log with its reason, and the run logs its counts
(`KYC purge` in the Vercel logs). Cron runs only on production.

By hand, `pnpm kyc:purge` shows what is due and `pnpm kyc:purge --apply` deletes it. Against
production this needs production's database URL and KYC variables, `VERCEL_ENV=production`, and an
OIDC token, which the Vercel CLI supplies once the project is linked (`vercel env pull`); with the
cron running, that should rarely be needed.

**Consent and legal hold are records, not settings.** *Consented At*, *Consent Withdrawn At* and
*Legal Hold Until* cannot be edited by anyone, in the admin or through the API. Consent is
withdrawn by the artist's own request, or, for a withdrawal that reached us by letter or email,
by a reviewer's **Record a withdrawal**. A legal hold is set, moved or lifted with **Set a legal
hold** / **Change the legal hold**. Both ask for a reason and write it to the security log
(`kyc-consent-withdrawn`, `kyc-legal-hold-changed`), with the old and new dates for a hold.

**Withdrawing consent and deletion.** A member can withdraw consent or ask for their data or its
deletion from **Account → Your data** (`/account/settings`, through `/next/members/data-request`). Withdrawal takes effect at
once: the record is marked, an application cannot be sent until consent is given again, and the
next purge deletes it. Every request is logged and emailed to staff. A deletion request is marked
on the member's record, and a super admin carries it out with **Delete this person**, the same
erasure as any deletion (docs/SECURITY.md, "Deleting someone"): their KYC is purged with the
purge above unless a legal hold is in force, in which case it stays, encrypted, until the hold
ends, and the record says why. A member record is never removed outright.

**Backups.** Neon keeps point-in-time history for its plan's window (6 hours on Free, 7 days on
Launch), and the nightly backups (RUNBOOK.md, "Backups") keep 14 daily and 8 weekly copies,
encrypted with a key kept offline. A purged record survives in them until they age out, at most 8
weeks; it is still encrypted there, twice over. Restoring a backup must not bring a purged record
back into use: after any restore, run `pnpm kyc:purge --apply` again before the site uses it.

## The keys

Generate each with `openssl rand -base64 32`, two different keys, and a separate pair for
Preview. **Keep an offline copy of `KYC_ENCRYPTION_KEY`** (a password manager entry and a printed
copy in a safe place): without it, every KYC record and document is unreadable for good. The
blind-index key can be replaced, at the cost of rebuilding the indexes.

**Rotating the encryption key**, yearly or whenever someone who could see it leaves:

1. Generate a new key. In Vercel set `KYC_ENCRYPTION_KEY_PREVIOUS` to the old key and
   `KYC_ENCRYPTION_KEY` to the new one. Redeploy. Both keys now work.
2. Locally, with the production values: `pnpm kyc:rotate-key` (counts), then
   `pnpm kyc:rotate-key --apply`.
3. When it reports nothing left and nothing failed, remove `KYC_ENCRYPTION_KEY_PREVIOUS` and
   redeploy. Keep the old key offline until the backups made before the rotation have aged out
   (8 weeks): restoring one of them needs the old key.

Rotation re-wraps the data keys; it does not re-encrypt the data. That is enough when a key is
retired. If the master key **and** a copy of the database leaked together, the data keys in that
copy are exposed whatever we rotate, and the affected values (bank accounts above all) should be
re-collected and re-verified.

## Verification

Today it is manual: a reviewer compares the details with the documents and marks the record
verified when approving a bank change. Two services could do it automatically; both are paid and
need an account, so neither is used without asking first:

- **Penny drop**: a ₹1 credit to the account returns the name the bank holds (Razorpay, Cashfree,
  Decentro and others offer it).
- **PAN verification**: confirms a PAN and the name against the Income Tax records, through an
  authorised provider.

The record has fields for the method and the provider's reference, ready for either.

### The masked e-Aadhaar check (advisory)

When an artist gives a masked e-Aadhaar, the server checks it (`src/kyc/aadhaarCheck.ts`) and
records what it found on the KYC record, shown in its sidebar:

1. **The original PDF.** A photo or scan is accepted, and marked *needs a check by hand*.
2. **UIDAI's digital signature,** read from the file's raw bytes, so no password is needed for
   this part: valid; covering the whole file, so nothing was changed after signing; made by UIDAI;
   and chaining to one of India's CCA root certificates (`src/kyc/ccaRoots.ts`), with dates
   checked as at the signing time.
3. **Inside, with the PDF's password** (the artist types it; it opens the file in memory and is
   dropped): the copy is masked, the last four digits are the ones typed, the name is the name on
   the PAN, and the date of birth is the one in "About you", read as an Indian date.

The result is **verified**, **could not verify** with a plain reason, or **needs a check by hand**
(no password, a photo, an unreadable file, a name that only partly matches, no CCA roots
installed). Reasons never repeat a value from the file. Every check is in the security log
(`kyc-aadhaar-checked`). If the file turns out to show a **full** Aadhaar number, it is deleted
at once rather than kept, and the record says so.

**Advisory, not enforcing.** `AADHAAR_CHECK_MODE` in `src/kyc/settings.ts` is `'advisory'`: the
check runs after the artist has their answer (Next.js `after()`), records its result, and never
blocks or delays an application. `'enforcing'` would run it first and refuse a masked e-Aadhaar
that could not be verified. **Enforcing stays off until the check has been confirmed on real
uploads**, which the CCA roots also need first:

- **Confirm on a real file:** `pnpm kyc:check-aadhaar /path/to/masked-eaadhaar.pdf` runs the same
  check on your own machine. It asks for the password and the details with typing hidden, and
  prints only the result, the reasons and the signer.
- **CCA roots are installed** (below), so a genuine, untouched e-Aadhaar can now come out *verified*.

#### The CCA root certificates

`src/kyc/ccaRoots.ts` holds the two roots of India's PKI that are for signing documents. They
were downloaded over HTTPS from cca.gov.in on 3 October 2026:

| Root | Source | SHA-256 fingerprint | Valid |
| --- | --- | --- | --- |
| CCA India 2022 | https://cca.gov.in/cca/sites/default/files/files/CCAIndia2022.cer | `9A3FD3176798E842DDCB12C262F11CFACCA70A8B84C6EA6FDA30842A95A94CD8` | 2022 to 2042 |
| CCA India 2014 | https://cca.gov.in/cca/sites/default/files/files/CCAIndia2014.cer | `60109BC6C38328598A112C7A25E38B0F23E5A7511CB815FB64E0C4FF05DB7DF7` | 2014 to 2024 (expired) |

**How they were checked.** cca.gov.in does not publish fingerprints on its root certificate page
(https://cca.gov.in/root_certificate.html); it offers out-of-band verification by email to
verifyroot@cca.gov.in instead. So each file's fingerprint was compared with Microsoft's
trusted-root record in the CCADB (the database the browser and OS root programs share), which
lists both under the CCA, for document signing, with exactly these SHA-256 values. Their subjects
and validity dates also match the cca.gov.in page. For a second confirmation, write to
verifyroot@cca.gov.in.

**What is left out, and why.** CCA India 2022 SPL and 2015 SPL are for websites (Microsoft lists
them for server authentication), not for signing documents, so trusting them here would widen
trust for nothing. The expired 2014 root is kept because a file is checked as at the moment UIDAI
signed it: a masked e-Aadhaar downloaded before March 2024 chains to it.

**When the roots change.** CCA India 2022 lasts to 2042. If the CCA issues a new document-signing
root, add it the same way: download from cca.gov.in, compare the fingerprint with an independent
record, and note both here.

Tests use made-up PDFs signed by a made-up chain (`tests/fixtures/eaadhaar`, rebuilt with
`scripts/fixtures/make-eaadhaar-fixtures.py`).

**UIDAI registration.** Checking the signature on an e-Aadhaar PDF is not one of the two modes the
2025 amendment's Regulation 13A names for OVSE registration (paperless offline e-KYC, and
Verifiable Credentials through the Aadhaar app), but the sources are not consistent: the lawyer
should confirm it. Making Aadhaar compulsory is not allowed for a private company, which is why
the other-ID choice is an equal one.

**Possible later addition: UIDAI offline e-KYC. Not built.** UIDAI's signed offline e-KYC, the
XML in a ZIP opened with the artist's share code or the Secure QR, would let us confirm a name,
date of birth and address without ever seeing the Aadhaar number. The server would check UIDAI's
signature, keep only the verified name, date of birth and address (encrypted, like the rest), and
discard the file, the photo and the share code. Two things come first:

- **OVSE registration.** Since the December 2025 amendment to the Aadhaar (Authentication and
  Offline Verification) Regulations, Regulation 13A requires an entity doing paperless offline
  e-KYC to register with UIDAI as an Offline Verification Seeking Entity. Sources disagree on
  whether the Secure QR needs it too. Registration is an application to UIDAI, possibly with fees
  and logging duties, so it is the business's decision.
- **Legal review.** A lawyer should confirm the registration question, what we may keep, and the
  privacy notice's wording, before any of it is built.

## Threat model

**A stolen database dump.** The attacker gets ciphertext, wrapped data keys, masks, bank names
and HMAC indexes. Without `KYC_ENCRYPTION_KEY` none of it opens. The indexes cannot be reversed
without `KYC_BLIND_INDEX_KEY`. Masks show the last four digits, which is what they are for.
*Residual:* if the environment leaked too, everything opens; that is why the keys are not in the
database, not in the repository, and not in logs.

**A leaked Blob URL.** The KYC store is private: a URL alone returns nothing without an OIDC token
for this project, which only our deployments (and linked team members' CLIs) can obtain, and
which expires within hours. Every object in it is encrypted with a key held only in Postgres,
under the master key. *Residual:* none from the URL alone. No read-write token for the store
exists to leak.

**A compromised staff account.** Editors see nothing. A reviewer or super admin can reveal, but
only one record at a time, each time with a reason, each time logged with their name, and the
values vanish after a minute. There is no export. Staff sign-in needs a company mailbox code and a
password, and staff are approved one by one. *Residual:* a compromised reviewer can read records
until noticed. Review the security log for `kyc-revealed` regularly; unusual volume is the signal.

**A member account takeover.** The attacker sees masks only, never full values, and cannot
download the documents. Changing the bank account needs a fresh code from the member's own
mailbox, waits for staff, and emails the member a way to stop it, which also signs the attacker
out. *Residual:* someone who controls the member's mailbox controls the account; the staff
re-verification is the backstop.

**Insider misuse** (a developer, or anyone with production access). Code can do anything with
the keys, so the controls are procedural: production variables are visible to as few people as
possible, all KYC code is in `src/kyc/` for review, every reveal and download is logged, and a
test checks that a PAN logged every possible way never comes out. *Residual:* real. Keep the
Vercel team small and use the Vercel audit log.

**Leaks we have closed off.** No KYC value in logs (redaction, and no request bodies logged), in
error messages (they name records, not people), in URLs (everything is POSTed), in analytics (the
site uses no third-party analytics), in emails (no details, ever), or in caches (`no-store`, and KYC pages are never
revalidated or statically rendered).
