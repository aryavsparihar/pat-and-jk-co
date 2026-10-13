# Admin guide

For anyone editing the website. No technical knowledge needed.

**Sign in at `pjk.co.in/admin-access`.** Enter your `@pjk.co.in` address, type the six-digit code emailed to you, then enter your password. The code lasts ten minutes; the sign-in lasts the working day.

Changes you **Publish** appear on the live site within a few seconds. Inside the panel, **How to use this panel** in the sidebar repeats these instructions.

---

## The basics

- **Brand selector.** The sidebar has a **Brand** selector. Everything you see and edit belongs to the selected brand (for now, PAT and J.K. Co.).
- **Draft → Preview → Publish.** Pages, journal posts and ventures save as drafts while you work. **Preview** / **Live preview** shows the page exactly as it will look. Nothing goes live until you press **Publish**.
- **Schedule.** Next to Publish, choose **Schedule publish** to publish at a later date.
- **Versions.** Every published version is kept. Open the **Versions** tab on any page to compare or restore an older one.
- **Italics in headings.** Wrap words in asterisks to set them in italics: `A *quiet* revolution` → A *quiet* revolution.

## Pages

**Website → Pages.** Each page is made of **blocks**, stacked top to bottom. Open a page, go to the **Content** tab, and:

- **Add** a block with *Add block* — pick from the list below.
- **Reorder** by dragging the handle on the left of a block.
- **Remove** or **duplicate** a block with the ⋯ menu on its right.

| Block | Use it for |
| --- | --- |
| Hero | The big opening of the homepage (logo + statement), or a large headline |
| Page intro | The title at the top of any inner page |
| Statement | A heading with a few paragraphs — "who we are", "our story" |
| Text | Longer written content (headings, lists, links) |
| Image & text | A photograph beside some text. Without a photo it shows a framed brand panel |
| Image or video | A single large image or video |
| Venture spotlight | Feature one venture in detail |
| Ventures grid | Cards for all ventures (or the ones you pick) |
| Principles | Two to six short points, e.g. values or ways to work together |
| Quote | A single large quotation |
| People grid | Leadership profiles (all, or the ones you pick) |
| Journal feed | The latest journal posts |
| Openings list | Current open calls from **Group → Openings** |
| Form | A form from **Enquiries → Forms**, optionally with contact details beside it |
| Call to action | A closing band with a heading and one or two buttons |

The page with the slug **`home`** is the homepage. The **SEO** tab sets the title and description search engines show.

**Links** in blocks can point to another page, a journal post or a venture (*Internal link*), or to any web address or email (*Custom URL*, e.g. `https://…` or `mailto:hello@pjk.co.in`).

## Journal

**Website → Journal.** Write a title, a one-line **excerpt** (shown on cards), an optional **hero image**, and the article. Choose categories in the sidebar. Published posts appear automatically in every Journal feed block.

## Ventures

**Group → Ventures.** Each business in the group. The **Stage** field in the sidebar controls how it appears:

- **Flagship / Active** — a card linking to its own page at `/ventures/<slug>`.
- **Coming soon** — a teaser card with no page of its own.

**Order** controls position (lower first). Under *Media* there are two pictures, and the site falls back through them in order:

- **Cover** — a photograph, shown across the top of the venture's page and beside it on the homepage.
- **Logo** — the venture's own mark, shown on a paper panel wherever there is no cover. Upload it with a transparent background so it sits on the page properly.
- Neither — a typographic panel with the venture's name.

**Caption** (under *Content*) is a line or two in the venture's own voice, set under its mark on its own page. Leave a blank line between paragraphs.

**Opening** (sidebar) is for a venture that has been announced but has not opened yet. Fill in the date and, if you like, the occasion — "in celebration of Diwali" — and the notice appears under the mark, in the ventures index and beside the venture on the homepage. It takes itself down the day after the date, so nobody has to remember to.

**Theme** (sidebar) sets how the venture's row on the ventures index and its own page look. Leave it empty for PJK's own style. **Phulhaar** gives Phulhaar Gallery its cream ground, its garland and its colours on both, and a "For artists" link on its page that leads to the artist application. Other brands can be given their own theme as they grow; ask the developer.

## People, openings

- **Group → People** — name, role, portrait, bio. Shown by the People grid block.
- **Group → Openings** — open calls for artists, collaborators and partners. Set **Status** to *Closed* to hide one without deleting it.

## Artists and partners

People who want to work with PJK apply on the website, at **/collaborate/artists** or **/collaborate/partners**. They confirm their email with a code (there are no passwords), fill the application in at their own pace, and send it. You are emailed when one arrives.

**Members → Applications** lists them all, newest first. Use **Filters** to narrow the list by type (artist or partner), stage, or date, and the search box to find an application by its reference: A-7K3Q9X for an artist, PT-7K3Q9X for a partner (applications started before October 2026 keep their APP-7K3Q9X). The reference stays with the person for good.

**Opening and closing applications.** **Website → Site settings → Applications → Applications are open.** It is off until you turn it on. While it is off, the two application pages show a short note instead of the form (write your own under *Note while applications are closed*; on the artists' page it is set large, in Phulhaar's style, above a short list of what to have ready), and nothing can be started or sent; people who already have an account can still sign in.

**Terms & Conditions.** **Site settings → Applications → Artists' Terms & Conditions (PDF)**: upload the PDF (in Media). While one is there, the last step of the artist application links to it, and an artist must tick that they agree and type I AGREE before sending; their application records which document they agreed to, under *Declarations*. To change the terms, upload a new PDF and choose it: earlier agreements stay linked to the version agreed to, so never delete an old terms PDF from Media.

Open an application to read it. In the sidebar, under **Decision**:

- **Approve.** The person is given a member ID (AT000001 for artists, PT000001 for partners) and an email welcoming them. The ID never changes. Someone can be both an artist and a partner, with one ID of each.
- **Ask for changes.** Write a note saying what you need; they are emailed it and can edit their application and send it again.
- **Decline.** Write a short, kind note; they are emailed it, with the date they may apply again, hello@pjk.co.in for questions, and Phulhaar's social accounts (**Site settings → Contact & social**).
- **Applying again.** A declined applicant may apply again after the wait in **Site settings → Applications** (6 months unless changed). **Allow them to apply again now** on a declined application ends the wait early, and is logged. Applying again reopens the same application with the same reference: "About you", "Where you live" and "Your practice" come back filled in, to review; the work and identity details start fresh (the old identity details are deleted). The earlier decision is kept under **Earlier rounds**.

Every decision is recorded under **Administration → Security log**, with your name against it. Applications themselves cannot be edited here: they are the applicant's words. Use **Notes for staff** for anything the team should know; the applicant never sees it.

**Members → Members** lists everyone who has applied, with their member IDs. To stop someone signing in, set **Standing** to *Suspended*; every device they were signed in on is signed out at once.

### Identity and payout details

Artists give their PAN and a second ID with their address (a masked e-Aadhaar with its last four digits, or, if they prefer, a passport, voter ID or driving licence) as part of their application. They do not give bank details then: those are asked for only when a sale needs a payout (below). You see all of these under **Members → KYC records**, but only if you are a super admin or have the **KYC reviewer** role (given under **Users**). Editors never see them.

Everything is shown masked, like `ABCxxxxx4F`. In the record's sidebar:

- **Reveal full details.** You are asked why. The full values appear for one minute, then disappear. Your name and your reason go in the security log every time, so give a real reason ("Checking the account before the first payment").
- **Download** a document, again with a reason. It downloads to your computer: delete it when you are done, and never forward it.
- **Possible duplicates** lists other applications with the same PAN or account. Look before approving.
- A **name mismatch** (once payout details are approved) means the name on the bank account looks different from the name on the PAN. Often it is a joint account or initials; ask if you are not sure.

**Before you approve an artist**, check each of these:

1. The name on the PAN, and on the masked Aadhaar if given, is the artist's name. Small differences are fine (an initial, a middle name); a different person is not.
2. The PAN card and masked Aadhaar, if given, show the same details as were typed in. The face in the PAN card's photograph can be seen clearly.
3. Nothing under **Possible duplicates**, or you know why.
4. **The identity document, by hand, whatever the automatic check says.** On the masked e-Aadhaar or the other ID: the name matches the PAN and the application; the date of birth matches "About you"; the photo is of a real person and fits the age; and, for Aadhaar, the last four digits are the ones the artist typed.
5. **The identity photo.** It shows a real person's face, holding a handwritten paper with the code given (shown beside the photo in the sidebar, with when it was given), their full name as on the PAN, and their date of birth as in "About you", all legible. The face is the face on the PAN card and the ID. *Taken with* says whether it came from the camera in the page or was uploaded; an upload deserves a closer look. If anything is off (a different code, a missing name or date, a printed rather than handwritten paper, a photo of a screen), ask for changes and say what to retake.
6. **Read the "Identity document" box in the sidebar.** *Verified* means UIDAI's signature and the details all checked out. *Could not verify* gives the reason (a changed file, digits that do not match). *Needs a check by hand* means the check could not finish (a photo or scan, no password); do the checks above with extra care. A passport, voter ID or driving licence is always checked by hand.

**Payout details, when a work sells.** Open the artist's KYC record and press **Request payout details**. The artist is emailed a link to their account, where they add the account themselves after a code we email them; the email never asks for bank details and never contains any. The date you asked shows on the record, and you can ask again if needed. When they have added the details, you are emailed. Then:

1. Reveal the details (reason: "Checking the account before the first payment").
2. The account holder's name matches the artist, or you know why it does not (a joint account, say).
3. **Send ₹1 to the account and ask the artist to confirm it arrived.**
4. Press **Approve the details**. Only now are payments made to this account.

**Never accept bank details by email**, by WhatsApp, on the phone, or in any way but the artist's own account. If someone sends them, do not use them, do not forward them, and delete the message; reply asking them to add the details in their account. Someone asking you to pay into an account by email is the commonest way to steal a payment.

**When an artist changes their bank account** later, it works the same way: you are emailed, the old account stays in use until you approve the new one, and you send ₹1 to the new one first. If the artist says the change was not theirs, they can stop it from their email; you are told, and they are signed out everywhere. Call them before doing anything else.

**Consent and legal hold.** The dates in the sidebar cannot be edited. If an artist withdraws consent by letter or email rather than from their account, press **Record a withdrawal** and say how and when it reached you. If we must keep a record for longer (payment records for tax, say), press **Set a legal hold**, give the date, and say why; the same button changes or lifts it. Both go in the security log with your name and reason.

If an artist asks for a copy of their data, or for it to be deleted, you are emailed. Tell the developer, who runs the deletion (see docs/KYC.md).

### When an artist has lost access to their email

Members sign in with a code to their email, so someone who can no longer read that inbox cannot
sign in or change the address themselves. Only a **KYC reviewer** can change it for them, and only
for a member with identity details on file to check against. Nobody, including a super admin, can
type a new address into the member's record: the field is read-only, because changing it would
hand the account to whoever typed it.

1. **Check who they are, against the KYC record, before anything else.** Ask them for their full
   name, date of birth and the last four characters of their PAN, and compare with the record
   (**Reveal full details**, giving the reason "Identity check for an email change"). Then speak to
   them on the phone number in their application, or by video call if you can, and compare their
   face with the identity photo. If anything does not match, or you are unsure, stop and ask a super
   admin.
2. Open the member under **Members**, press **Change the email address** in the sidebar, give the
   new address, say how you checked (for example: "Phoned the number on file; name, date of birth
   and PAN match the KYC record"), and tick that you checked against the KYC record.
3. The address changes at once. Every device they were signed in on is signed out, both the old
   and the new address are emailed, and the change goes to the security log with your name and
   reason. They sign in with a code to the new address.

Never change an address on the strength of an email from the new address alone: that is exactly
what someone taking over an account would send. A partner has no identity details on file, so the
action refuses; a super admin decides what to do.

### Approved artists' works and profiles

Once approved, an artist has a portal at /account: their profile, their works, where we pay them, and their account. Nothing they write there is shown to the public until you approve it.

- **Members → Artworks** lists every work. Use **Filters → Review › State is "Waiting for review"** to see what needs looking at. Open a work: check the facts and the pictures, then in the sidebar press **Approve and publish**, or write a note and press **Ask for changes**. The artist is emailed either way.
- **Profiles** are reviewed the same way, from the artist's record in **Members → Members**, under **Profile review** in the sidebar.
- When an artist changes something already public, the version you approved stays up until you approve the change.
- An artist can **archive** a work themselves; it disappears from the public at once, with no review.
- Contact details (phone, postal address) change straight away: they are never shown to the public.

You are emailed whenever something is sent for review. Every approval and request for changes is in the security log with your name.

### The collaborate page

The page at /collaborate is an ordinary page, built from blocks. **Ways to work with us** is the block with the two large links to the applications; its words are yours to change, but where the links lead is fixed. **How it works** is a *Principles* block with roman numerals.

## Forms & enquiries

- **Enquiries → Form Submissions** — every message sent through the website, newest first.
- **Enquiries → Forms** — edit form fields, the button label, the thank-you message, and under **Emails** who gets notified.

## Media

**Website → Media.** Upload photographs, logos and PDFs. Always fill in **Alt text** — a short description of the image, for visitors using screen readers and for search engines. Use the focal point tool so crops keep the important part of an image. Large, high-quality images are fine; the site resizes them automatically.

## Site settings

**Website → Site settings** holds everything that isn't a page:

- **General** — site name, tagline, default search description, social sharing image.
- **Brand** — logos (for light backgrounds, dark backgrounds, and a compact header version) and the four brand colours.
- **Navigation** — header links and the header button.
- **Footer** — the short description, footer links, legal links, and whether to show the visitor count.
- **Contact & social** — the general, business and technical enquiry addresses, phone, social profiles, and the **Registered office**.

### The registered office

**Site settings → Contact & social → Registered office** holds the office address in separate lines: address lines 1 and 2, landmark, city, state, PIN code and country. Fill it in once and it appears, always with a *Get directions* link:

- in the footer, under the logo;
- on the contact page, beside the form (when the form block's *Show contact details* is ticked);
- at the end of any page that asks for it (below);
- at the foot of every email the site sends;
- in the information search engines read about the company.

*Get directions* opens Google Maps directions to the address. To send people somewhere more precise, paste a Google Maps share link into **Map link**. The older free-text **Address** box is only used while the registered office is empty, and can be cleared.

**Ending a page with the address.** Every page has a **Registered office** box in its sidebar. Tick *Show at the end of this page* and the page closes with the address. The privacy policy uses it with the label *Data controller* and a sentence about who is responsible for personal data; a terms page should do the same.

## Visitor count

**Website → Visitor count** is the running number of visits shown at the very bottom of the site. It is kept by the site itself and cannot be edited; to hide the number, untick *Show the visitor count* under **Site settings → Footer**.

A browser is counted once per visit, however many pages it then reads, and obvious robots are left out. Nothing is stored about anyone — no cookie, no address, no identifier — so treat it as a fair indication of traffic rather than an exact figure.

## Redirects

If a page's address changes, add a redirect under **Website → Redirects** from the old path (e.g. `/our-story`) to the new page, so old links keep working.

## Users (super admins)

**Administration → Users.** **Editors** can edit content for the brands listed on their account; **super admins** can do everything, including users and domains.

- **Someone new:** ask them to open `/admin-access` and press **Request access**. Their request appears under **Administration → Access requests**; set it to *Approved* and the account is created and emailed a link to choose a password.
- **Someone leaving:** open their account and set **Status → Suspended**. They can no longer sign in, and nothing they made is lost.
- **Security log:** every sign-in attempt and access request is listed under **Administration → Security log**.
