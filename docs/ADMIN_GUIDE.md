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

## People, openings

- **Group → People** — name, role, portrait, bio. Shown by the People grid block.
- **Group → Openings** — open calls for artists, collaborators and partners. Set **Status** to *Closed* to hide one without deleting it.

## Artists and partners

People who want to work with PJK apply on the website, at **/collaborate/artists** or **/collaborate/partners**. They confirm their email with a code (there are no passwords), fill the application in at their own pace, and send it. You are emailed when one arrives.

**Members → Applications** lists them all, newest first. Use **Filters** to narrow the list by type (artist or partner), stage, or date, and the search box to find an application by its reference (e.g. APP-7K3Q9X).

**Opening and closing applications.** **Website → Site settings → Applications → Applications are open.** It is off until you turn it on. While it is off, the two application pages show a short note instead of the form (write your own under *Note while applications are closed*), and nothing can be started or sent; people who already have an account can still sign in.

Open an application to read it. In the sidebar, under **Decision**:

- **Approve.** The person is given a member ID (AT000001 for artists, PT000001 for partners) and an email welcoming them. The ID never changes. Someone can be both an artist and a partner, with one ID of each.
- **Ask for changes.** Write a note saying what you need; they are emailed it and can edit their application and send it again.
- **Decline.** Write a short, kind note; they are emailed it.

Every decision is recorded under **Administration → Security log**, with your name against it. Applications themselves cannot be edited here: they are the applicant's words. Use **Notes for staff** for anything the team should know; the applicant never sees it.

**Members → Members** lists everyone who has applied, with their member IDs. To stop someone signing in, set **Standing** to *Suspended*; every device they were signed in on is signed out at once.

### Identity and bank details

Artists give their PAN (and, if they choose, a masked Aadhaar with its last four digits, for their address) and their bank details as part of their application. You see them under **Members → KYC records**, but only if you are a super admin or have the **KYC reviewer** role (given under **Users**). Editors never see them.

Everything is shown masked, like `XXXXXXXX4821`. In the record's sidebar:

- **Reveal full details.** You are asked why. The full values appear for one minute, then disappear. Your name and your reason go in the security log every time, so give a real reason ("Checking the account before the first payment").
- **Download** a document, again with a reason. It downloads to your computer: delete it when you are done, and never forward it.
- **Possible duplicates** lists other applications with the same PAN or account. Look before approving.
- A **name mismatch** means the name on the bank account looks different from the artist's. Often it is a joint account or initials; ask if you are not sure.

**Before you approve an artist, or mark their details verified**, check each of these:

1. The name on the PAN, and on the masked Aadhaar if given, is the artist's name. Small differences are fine (an initial, a middle name); a different person is not.
2. The account holder's name matches the artist, or you know why it does not (a joint account, say).
3. The PAN card, masked Aadhaar and cheque or passbook, if given, show the same details as were typed in.
4. Nothing under **Possible duplicates**, or you know why.
5. **The identity document, by hand, whatever the automatic check says.** On the masked e-Aadhaar or the other ID: the name matches the PAN and the application; the date of birth matches "About you"; the photo is of a real person and fits the age; and, for Aadhaar, the last four digits are the ones the artist typed.
6. **Read the "Identity document" box in the sidebar.** *Verified* means UIDAI's signature and the details all checked out. *Could not verify* gives the reason (a changed file, digits that do not match). *Needs a check by hand* means the check could not finish (a photo or scan, no password); do the checks above with extra care. A passport, voter ID or driving licence is always checked by hand.
7. **Before the first payout to a new account**, send ₹1 to it and ask the artist to confirm they received it. Do the same after any change of bank account.

**When an artist changes their bank account** after approval, you are emailed. The old account stays in use until you approve the new one: open the record, reveal the details, check them against the documents (a cancelled cheque or passbook helps), and press **Approve the new details**. If the artist says the change was not theirs, they can stop it from their email; you are told, and they are signed out everywhere. Call them before doing anything else.

**Consent and legal hold.** The dates in the sidebar cannot be edited. If an artist withdraws consent by letter or email rather than from their account, press **Record a withdrawal** and say how and when it reached you. If we must keep a record for longer (payment records for tax, say), press **Set a legal hold**, give the date, and say why; the same button changes or lifts it. Both go in the security log with your name and reason.

If an artist asks for a copy of their data, or for it to be deleted, you are emailed. Tell the developer, who runs the deletion (see docs/KYC.md).

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
