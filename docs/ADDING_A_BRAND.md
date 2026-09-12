# Adding a brand

Every brand in the group can have its own website — own domain, logo, colours, pages and editors — running on this same codebase and admin panel. No new code is required for a standard brand site.

Example: launching **Phulhaar Gallery** at `phulhaar.pjk.co.in` (or its own domain).

## 1. Create the brand (super admin)

1. **Administration → Brands → Create new**
   - **Name:** Phulhaar Gallery by PJK
   - **Slug:** `phulhaar` (never change it after launch)
   - **Domains:** `phulhaar.pjk.co.in` (first = primary). For local testing also add `phulhaar.localhost`.
2. Switch the sidebar **Brand** selector to the new brand. From now on, everything you create belongs to it.

## 2. Brand identity

**Website → Site settings** (creates the brand's single settings document):

- Site name, tagline, description.
- **Brand → Logos.** Upload SVGs if possible. To turn a PNG logo into a crisp SVG:
  ```bash
  pnpm brand:trace path/to/logo.png public/brand/phulhaar-logo.svg
  ```
  The output uses `currentColor`. Before uploading, replace `currentColor` in the file with the brand colour (e.g. `#5A2A27`) for the light-background version, and with the background colour for the dark-background version.
- **Brand → Colours.** Four values (brand, background, paper, text). Hairlines, hovers and muted text are derived automatically. Check body text on the background has enough contrast (4.5:1 or more — use a contrast checker).
- **Navigation / Footer / Contact & social.**

## 3. Content

- **Pages** — create `home` first, then any others (e.g. `about`, `contact`). Build them from blocks.
- **Forms** — create a contact form and set its notification email.
- Optional: Journal posts, Ventures, People, Openings — each brand has its own.

Tip: to reuse PJK's page structure, open the PJK page alongside and recreate its blocks in the new brand — or extend `src/seed/` with a seed script for the new brand, which is the quickest way to launch with a full set of starter pages.

## 4. Point the domain

1. Vercel → Project → **Settings → Domains** → add `phulhaar.pjk.co.in`.
2. Add the DNS record Vercel shows (a `CNAME` to Vercel for a subdomain) at the registrar.
3. If the brand uses a completely different domain, add it to `ALLOWED_ORIGINS` in Vercel's environment variables (comma-separated, e.g. `https://phulhaar.com`) so the admin and API accept requests from it, then redeploy.

The site serves the right brand as soon as DNS resolves — routing is automatic from the hostname (`src/proxy.ts`).

## 5. Editors

**Administration → Users → Create new** — role **Editor**, and under **Tenants** add the new brand. They will only see that brand's content.

## 6. Link it from the group site

On the PJK brand, open **Group → Ventures → Phulhaar Gallery by PJK** and set **Website** to the new brand's URL.

---

### When a brand needs something new

If a brand needs a section the block library doesn't cover, add a block once and every brand can use it:

1. `src/blocks/<Name>/config.ts` (fields) and `Component.tsx` (rendering).
2. Add the config to `src/blocks/index.ts` and the component to `src/blocks/RenderBlocks.tsx`.
3. `pnpm generate:types`, then `pnpm payload migrate:create add-<name>-block` and commit.

Per-brand fonts are not yet configurable (all brands use Cormorant Garamond + EB Garamond). To add an alternative pairing, load it with `next/font` in `src/app/(frontend)/layout.tsx` and add a select field to Site settings → Brand that switches the `--font-serif`/`--font-sans` variables.
