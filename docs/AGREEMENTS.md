# Signing the artist and trade agreements

Applications ask only for consent to the privacy policy. Once someone is approved, they sign their agreement on its own page:

- Artists: `https://pjk.co.in/collaborate/artist-agreement`, the Master Artist Consignment & Representation Agreement (DOE 10-11-2026).
- Trade partners: `https://pjk.co.in/collaborate/trade-agreement`, the Master Trade Program & B2B Partner Agreement (DOE 11-11-2026).

Both pages are kept out of search engines.

## What the signer does

1. Signs in with the code emailed to them. Signed out, the page asks for it. Signed in without an AT or PT ID, it says the page is for approved members.
2. Reads the agreement. It is shown in full in a scrolling frame, with the founder's banner at the top and a menu of the seven segments beside it.
3. Gives the ID issued on approval (AT-xxxxx or PT-xxxxx). It must be this account's own ID.
4. Checks their details. They are shown as the agreement will name them:
   - Name: the name on their PAN, from their KYC record.
   - PAN: masked.
   - Email and phone.
   - Address.

   A trade partner also completes the firm's legal name, its GSTIN/COA/registration number and the business address. The partner application does not ask for these.
5. Gets a ten-minute code. They take or upload a live photo holding a paper with the code, their full legal name and their ID. It is encrypted into the KYC vault.
6. Reads the founder's notice, ticks both declarations, and types I AGREE.

   The button stays disabled until the photo is in, both boxes are ticked and I AGREE is typed exactly. The server checks each again.

   Beneath the button, a readout shows what will be recorded: the ID, IP, IST time, code and version.

## What is kept

One row in **Members → Signed agreements** (`agreement-executions`) per signing:

- the member and ID;
- the agreement version and a SHA-256 of its text;
- the code's HMAC and times;
- the photo and its SHA-256;
- the signer's details as printed;
- I AGREE, IP, browser and IST timestamp;
- the signed PDF and its SHA-256.

The PDF is the whole agreement with the signer's execution block filled in. The full PAN appears only in this encrypted PDF. PAT & J.K. Co.'s *Signature / Official Digital Stamp* (artist) or *Signature / Digital Stamp (DSC)* (trade) line and the approval date line are left blank.

The photo and both PDFs are KYC documents, so they are encrypted with their own keys. Opening one asks for a reason, which goes in the security log.

## Countersigning

When an agreement is signed, the staff inbox is told it is **Pending Admin DSC Countersignature**. Nothing is sent to the signer yet.

1. Open the agreement under **Members → Signed agreements**.
2. **Download Artist-Signed PDF** (or **Trade Partner-Signed PDF**), giving a reason.
3. Countersign it with the DSC outside the site, filling in the approval date.
4. **Upload Final DSC-Countersigned PDF & Send to Artist** (or **Trade Partner**). The copy is kept and the record becomes **Executed and sent**. It cannot be replaced afterwards. The PDF is emailed to the signer and to compliance@pjk.co.in in the company template.

If the email fails, the panel says so, and the copy is still kept. Send it by hand from the countersigned download.

## Changing an agreement

The texts are in `src/agreements/texts.ts`. They were converted from the founder's Word files and checked word for word. The page's wording (banner, photo steps, notice, declarations, button) is in `src/agreements/documents.ts`.

A new version means:

1. Convert the new Word file.
2. Update the version line and `lastUpdated`.
3. Check that the PDF test still finds every line of the signer's block.

Records keep the version and text digest they were signed against.
