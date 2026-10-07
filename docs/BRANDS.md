# Brands

The identity of each brand in the group, written down from the source files so nobody has to
reopen a 73 MB pack to find a colour. PJK's own system is described in
[ARCHITECTURE.md](ARCHITECTURE.md#design-system); this page covers the ventures.

Source packs are kept **outside the repository**, in `../brand-sources/<brand>/`. Only the files
the site actually uses are copied into `public/brand/ventures/`, optimised. `.gitignore` refuses
`drive-download-*/` folders and AI, EPS, INDD and PSD files, so a pack cannot be committed by
accident.

---

## Phulhaar Gallery by PJK

Pack: `../brand-sources/phulhaar/` (received 23 September 2026). AI, EPS, PDF, SVG, JPEG and
transparent PNG exports of three artboards. There is **no brand-guidelines document** in the pack,
and no typeface is named anywhere in it: the wordmark is outlined artwork. Everything below is
measured from the files. Where it says *rule*, it is a decision this site has made, not something
the pack prescribes; confirm with the designer if one ever turns up.

### The marks

| Artboard | What it is | Source files | On the site |
| --- | --- | --- | --- |
| 8 | **Full mark.** A garland of flowers and leaves in an upright oval, a lotus at the top and the foot, a pendant below; inside it a magenta **P** monogram with a paintbrush for its stem and gold acanthus at its waist. The wordmark and a gold rule sit underneath. | `1.pdf`, `1.ai`, `1.eps`, `Phulhaar_1.svg`, `Artboard 8*.{jpg,png,pdf}` | `phulhaar-logo.png` (the whole mark, uploaded to the CMS as the venture's Logo) |
| 8, cropped | **Garland.** The garland and monogram without the wordmark, cropped from the transparent 4x PNG. | derived from `PNG/4x/Artboard 8@4x.png` | `phulhaar-garland.webp`, 795 × 1200 |
| 10 | **Wordmark with rule.** `PHULHAAR` in green with the gold rule beneath. | `Artboard 10*`, `SVG/Artboard 10_01.svg` | `phulhaar-wordmark.svg`, 6.6 kB, pure vector |
| 12 | **Wordmark alone.** As above, without the rule. | `Artboard 12*`, `SVG/Artboard 12_01.svg` | not used |

Each artboard comes twice: on the cream ground, and (the "copy" files) on white.

`Phulhaar_1.svg` looks like the ideal source, but it is not a true vector. Its flowers are 354
embedded PNG tiles at the artboard's own resolution (about 3400 px across), so it is 650 kB and no
sharper than a large PNG. The site keeps the PNG for the full mark and uses the SVG only for the
wordmark, which is genuinely vector.

### Palette

Measured from the SVG fills and sampled from the artwork. Contrast is against the cream ground
(`#FBF4E5`); 4.5:1 is the WCAG AA minimum for body text, 3:1 for large text and interface parts.

| Role | Hex | Contrast on cream | Use |
| --- | --- | --- | --- |
| **Ink green** (wordmark) | `#023118` | 13.2:1 | Text, headings, the wordmark. The brand's primary colour. |
| **Cream** (ground) | `#FBF4E5` | — | The page. The mark is drawn for this ground. |
| **Monogram magenta** | `#C6014B` | 5.5:1 | The P. Safe for text and focus rings; the brand's accent. |
| **Lotus pink** | `#EE0156` | 4.0:1 | Petals. Large text or decoration only. |
| **Leaf green** | `#017448` | 5.3:1 | Leaves. Usable for text; good for "saved" and success notes. |
| **Deep leaf** | `#085F34` | 7.1:1 | Leaf shadows. |
| **Rule gold** | `#ED9F13` → `#D68F0B` | 2.5:1 | The gradient under the wordmark. Decoration only, never text. |
| **Acanthus gold** | `#D3901E` | 2.5:1 | The ornament at the P's waist. Decoration only. |
| **Marigold** | `#FEB91B` | — | Flowers. Decoration only. |
| **Saffron** | `#F96507` | 2.8:1 | Flowers. Decoration only. |
| **Violet** | `#6D5B9F` | 5.3:1 | Flowers. Usable for text. |

When gold has to carry meaning (a step marker, a hint), darken it to `#8A6A1F` (4.6:1) or pair it
with ink green.

### Type

The pack names no typeface, and the wordmark is outlined, so it cannot be set as live text.

- **Never typeset the name "PHULHAAR" to imitate the wordmark.** Use the artwork.
- For everything else the site uses its own serifs, which sit comfortably beside the wordmark's
  high-contrast, flared capitals: **Cormorant Garamond** for display and **EB Garamond** for text
  and small capitals. They are already loaded, so a Phulhaar page costs no extra font download.
- If a closer echo of the wordmark is wanted for short display lines, the nearest free match is
  **Marcellus** (flared Roman capitals, SIL Open Font License). It is installed as an option
  (`src/app/(frontend)/fonts/marcellus-latin-400-normal.woff2`, 14.5 kB, not preloaded) and chosen
  with one setting, `PHULHAAR_DISPLAY` in `src/brands/phulhaar.ts`, set to `'marcellus'` since 4 October 2026 (`'cormorant'` switches back). It
  applies to headings only; Marcellus has no italic, so an emphasised word keeps Cormorant's.
  In development, `?display=cormorant` or `?display=marcellus` previews either on the artist page.

### Usage rules

1. **The mark always sits on the paper tone, never on the dark green plate.** The wordmark is
   ink green and disappears on `#0F2A18`. `Plate` forces the paper tone whenever a `mark` is given.
   This is the site's existing rule and applies to the garland and the wordmark alike.
2. **Cream or white grounds only.** The pack supplies nothing for dark backgrounds, so there is no
   reversed version. Do not invert or recolour the mark to make one.
3. **Keep the garland whole.** Do not crop flowers off the oval, rotate it, or separate the P from
   the garland. The garland-without-wordmark crop is acceptable because the pack itself supplies the
   wordmark separately (Artboards 10 and 12).
4. **Clear space** of at least the height of the lotus at the top of the garland on every side.
5. **Minimum sizes:** the full mark no narrower than 120 px, the wordmark no narrower than 140 px;
   below that the rule and the swash on the R break up.
6. **Do not add effects:** no shadows, outlines, glows or gradients beyond those in the artwork.
7. **Motion is allowed only as a slow fade or a very slight scale ("breathing")** and never under
   `prefers-reduced-motion`. The petals must not be animated separately. Since 7 October 2026 the
   garland is **still** everywhere (`PHULHAAR_BREATHE` in `src/brands/phulhaar.ts`): the breathing
   read as a glitch. Arrivals (a gentle fade as a page opens) stay.

### Where Phulhaar's identity is used

- The venture page on the PJK site (`/ventures/phulhaar-gallery`), in full, through **Theme →
  Phulhaar** on the venture (`src/brands/themes.ts`): the cream ground and palette, Marcellus
  headings, the mark on its own cream inside the plate's frame, the opening notice under a
  gold rule with its occasion in magenta, and a "For artists" card leading to the application.
  Everything arrives gently and stays still under `prefers-reduced-motion`.
- Its row on the ventures index, through the same Theme: the cream ground under a gold rule, the
  garland beside the stage, the name in Marcellus, the number and the arrow in magenta. The rest of
  the index stays in PJK's style.
- The artist onboarding at `/collaborate/artists`, which follows this brand rather than PJK's
  (`src/components/phulhaar/`): the cream ground and palette as tokens on `.phulhaar`, the garland
  breathing slowly beside the form (still under `prefers-reduced-motion`), and the steps as a
  garland of beads, finished in leaf green, current in the monogram's magenta.
- The artists' card on `/collaborate`: Phulhaar's cream under a gold rule, with the garland.

Everything else on pjk.co.in stays in the PJK system.
