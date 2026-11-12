import {
  ARTIST_AGREEMENT_TEXT,
  ARTIST_AGREEMENT_TITLE,
  TRADE_AGREEMENT_TEXT,
  TRADE_AGREEMENT_TITLE,
} from './texts'

/**
 * Everything about the two agreements that is not their text: where each is signed, whose ID it
 * binds, and the founder's on-screen wording for the signing page, word for word as he sent it on
 * 10 and 11 November 2026. Change the wording only from a new instruction of his.
 */
export type AgreementKind = 'artist' | 'partner'

export type AgreementDocument = {
  kind: AgreementKind
  /** The page, under /collaborate */
  slug: 'artist-agreement' | 'trade-agreement'
  /** The member ID it binds, and its prefix */
  idField: 'artistId' | 'partnerId'
  prefix: 'AT' | 'PT'
  /** Who signs, in the page's own words */
  signer: 'Artist' | 'Trade Partner'
  title: string
  /** Bound into every execution record and printed on the PDF */
  version: string
  lastUpdated: string
  text: { root: { children: unknown[] } }
  /** The jump menu: one label per segment, in order */
  segments: string[]
  banner: [string, string]
  photo: { heading: string; intro: string; steps: [string, string] }
  notice: { heading: string; intro: string[]; items: string[] }
  checkboxes: [string, string]
  inputLabel: string
  button: string
  /** The lines of the signing party's block at the foot of the agreement, in order */
  executionLines: string[]
}

const BANNER_READ =
  'Please scroll through and read all Seven (7) Segments and Twenty-Two (22) Clauses of this Agreement carefully before executing below.'

const PHOTO_HEADING = 'LIVE BIOMETRIC & CONTRACT EXECUTION VERIFICATION (10-MINUTE EXPIRING CODE)'

const PHOTO_STEP_2 =
  'Capture and upload a clear, well-lit live photograph of your face while holding the handwritten sheet of paper clearly visible next to you (no filters, masks, or digital overlays).'

const INPUT_LABEL =
  'Type "I AGREE" in capital letters below to legally sign and execute this Agreement:'

const OPERATOR =
  'PAT & J.K. Co. (operating Phulhaar Gallery across phulhaar.com, phulhaargallery.com, phulhaar.in, and phulhaargallery.in), having its registered office at Ward No.07, ITI Road, Opp. Brahman Sabha, Kathua, Jammu And Kashmir - 184101 (GSTIN: 01GPLPP4881L1ZA | MSME Udyam: UDYAM-JK-09-0029151).'

const EXPRESS_NOTICE =
  'Please take express notice of the following binding legal and commercial terms before signing:'

export const ARTIST_AGREEMENT: AgreementDocument = {
  kind: 'artist',
  slug: 'artist-agreement',
  idField: 'artistId',
  prefix: 'AT',
  signer: 'Artist',
  title: ARTIST_AGREEMENT_TITLE,
  version: 'PAT & J.K. CO. — MASTER ARTIST CONSIGNMENT & REPRESENTATION AGREEMENT DOE: 10-11-2026',
  lastUpdated: 'November 10, 2026',
  text: ARTIST_AGREEMENT_TEXT as never,
  segments: [
    'Segment I: Foundational Architecture, Definitions & Modifications (Clauses 1–3)',
    'Segment II: On boarding, Curatorial Authority & Exclusivity (Clauses 4–6)',
    'Segment III: Artist Warranties, Intellectual Property & Licensing (Clauses 7–8)',
    'Segment IV: Commissions, Trade Discounts, Conditional Settlements & Taxes (Clauses 9–10)',
    'Segment V: Logistics, Dispatch SLA, Packaging Liability & Online SKU Verification Portal (Clauses 11–13)',
    'Segment VI: Withdrawals, Non-Circumvention, Prohibitions & Breach Consequences (Clauses 14–17)',
    'Segment VII: Indemnity, Liability Caps, DPDP Vault, Disputes & Execution (Clauses 18–22)',
  ],
  banner: [
    'DOCUMENT FOR EXECUTION: PAT & J.K. CO. — MASTER ARTIST CONSIGNMENT & REPRESENTATION AGREEMENT (Last Updated: November 10, 2026)',
    BANNER_READ,
  ],
  photo: {
    heading: PHOTO_HEADING,
    intro:
      'To authenticate your identity and prevent unauthorized digital execution under the Information Technology Act, 2000 and Section 15 of the Digital Personal Data Protection Act, 2023, please complete the live visual verification below before signing:',
    steps: [
      'Take a blank sheet of physical paper and clearly write down by hand: (a) The 6-character Verification Code displayed on screen below (valid for 10 minutes), (b) Your Full Legal Name, and (c) Your Assigned Artist Application ID (AT-xxxxx).',
      PHOTO_STEP_2,
    ],
  },
  notice: {
    heading: 'PRE-SUBMISSION STATUTORY & CONTRACTUAL EXECUTION NOTICE:',
    intro: [
      `By completing this digital execution page at https://pjk.co.in/collaborate/artist-agreement, you are entering into a legally binding Principal-to-Principal Commercial Consignment Contract with ${OPERATOR}`,
      EXPRESS_NOTICE,
    ],
    items: [
      'Sole Merchant of Record & First-Priority Deductions: PAT & J.K. Co. acts as the exclusive Merchant of Record on all collector invoices. On every completed sale, all applicable indirect taxes (GST/VAT/customs), inward and outward shipping/insurance charges (where arranged or funded by PAT & J.K. Co.), the 10% B2B Trade Discount (where applicable), the geographic Gallery Commission (25% J&K / 35% Rest of India / 45% International), and any statutory tax deductions (TDS) are deducted first before calculating your net Artist Payout on the remaining Net Collected Base Price. Inspection-Contingent Settlement (Delivery + 2 Days) & 30-Day AML Payout: All settlements are conditional upon the successful closure of the Buyer’s 2-day post-delivery inspection and return window (supported by photo/unboxing video proof reported within 2 days, or claim resolution, whichever is longer) and are disbursed within 30 calendar days thereafter strictly via electronic bank transfer into a bank account bearing your exact legal name in compliance with AML/PMLA guidelines.',
      'Three-Route Fulfillment, 5-Day SLA, Physical Artist CoA & Online SKU Digital CoA: Upon sale intimation, you must securely package and dispatch the Artwork within 5 business days via (a) Gallery-provided AWB, (b) autonomous self-shipment at your own courier cost and 100% transit risk (obtaining PAT & J.K. Co.’s invoice/E-Way Bill first for orders exceeding ₹50,000), or (c) pre-approved inward facility transit. You must record a photographed Certified Condition Slip, physically sign the Artwork, and enclose a signed Physical Artist Certificate of Authenticity (Artist CoA) (strictly devoid of personal phone numbers, emails, URLs, QR codes, or social media handles) alongside Phulhaar Gallery’s Online SKU (PHUL-CV-xxx) Uniqueness Verification Portal & Digital CoA, absorbing 100% of financial loss (₹0 payout + reverse freight) for negligent packing, self-booked courier loss/damage, or inaccurate Artwork Metadata.',
      '36-Month Non-Circumvention & Liquidated Damages: You are strictly prohibited from contacting Buyers or Trade Partners directly (even for delivery coordination), enclosing contact inserts in parcels, or accepting off-platform sales or custom commissions for 36 months, under pre-estimated liquidated damages of 50% of the transaction value or ₹50,000, whichever is higher.',
      'DPDP Act Vault, 8-Year Tax Retention & Exclusive Kathua Jurisdiction: Your PAN/Tax ID, KYC records, and live verification photo are stored in an encrypted, admin-only vault (subject to mandatory 8-year statutory tax retention under the Income Tax Act, 1961 and CGST Act, 2017 where payouts occur), and all disputes are subject to the exclusive jurisdiction of the competent courts in Kathua, Jammu & Kashmir.',
    ],
  },
  checkboxes: [
    'I HAVE READ AND AGREE TO THE MASTER ARTIST CONSIGNMENT & REPRESENTATION AGREEMENT: I confirm that I am at least 18 years of age and legally competent to contract. I have read, understood, and unconditionally agree to be bound by all 22 Clauses (Segments I to VII) and the 10-Point Mandatory Artist Declaration of the PAT & J.K. Co. — Master Artist Consignment & Representation Agreement (Last Updated: November 10, 2026), including the Principal-to-Principal consignment structure, the 25% / 35% / 45% first-priority commission and tax deduction waterfall, the 36-month non-circumvention covenant, the 100% authorship, packaging, and metadata indemnity warranties, and the exclusive jurisdiction of the courts in Kathua, Jammu & Kashmir.',
    'I CONSENT TO DPDP ACT KYC VAULT PROCESSING & DIGITAL EXECUTION: I have read and agree to the PAT & J.K. Co. — Artist & Partner On boarding Privacy Policy & Statutory Notice (https://pjk.co.in/privacy). I explicitly consent to the collection and encrypted admin-vault storage of my PAN/Tax ID, bank routing details, and live 10-minute verification photograph for identity authentication, contract execution, payout remittance, and statutory 8-year tax audit retention. I affirm that ticking these boxes, uploading my live verification photograph, and typing "I AGREE" below constitutes my valid, binding electronic signature under Sections 4, 5, and 10A of the Information Technology Act, 2000.',
  ],
  inputLabel: INPUT_LABEL,
  button: 'EXECUTE & SIGN MASTER CONSIGNMENT AGREEMENT',
  executionLines: [
    'Artist Full Legal Name',
    'Assigned Artist Application ID',
    'PAN / Passport / National Tax ID',
    'Registered Email & Phone Number',
    'Studio / Residential Address',
    'Live 10-Min Verification Code & Photo Ref',
    'Artist Signature / Digital Execution ("I AGREE")',
    'Execution Portal, Date, Timestamp (IST) & IP Log',
  ],
}

export const TRADE_AGREEMENT: AgreementDocument = {
  kind: 'partner',
  slug: 'trade-agreement',
  idField: 'partnerId',
  prefix: 'PT',
  signer: 'Trade Partner',
  title: TRADE_AGREEMENT_TITLE,
  version: 'PAT & J.K. CO. — MASTER TRADE PROGRAM & B2B PARTNER AGREEMENT DOE: 11-11-2026',
  lastUpdated: 'November 11, 2026',
  text: TRADE_AGREEMENT_TEXT as never,
  segments: [
    'Segment I: Foundational Architecture, Definitions & Modifications (Clauses 1–3)',
    'Segment II: Eligibility, On boarding, Bona Fide Trade Warranty & Account Security (Clauses 4–6)',
    'Segment III: Commercial Terms, 10% Trade Discount, Bespoke Projects & Taxation (Clauses 7–9)',
    'Segment IV: Fulfillment, 2-Day Unboxing Video Protocol, Mutual Refund Guarantee & On-Site Disclaimer (Clauses 10–12)',
    'Segment V: Provenance, Online SKU Digital CoA, Intellectual Property & Project Photography (Clauses 13–14)',
    'Segment VI: 36-Month Non-Circumvention, Prohibitions, Withdrawal & Breach Consequences (Clauses 15–17)',
    'Segment VII: Indemnity, Liability Caps, DPDP Vault, Disputes & Execution (Clauses 18–22)',
  ],
  banner: [
    'DOCUMENT FOR EXECUTION: PAT & J.K. CO. — MASTER TRADE PROGRAM & B2B PARTNER AGREEMENT (Last Updated: November 11, 2026)',
    BANNER_READ,
  ],
  photo: {
    heading: PHOTO_HEADING,
    intro:
      'To authenticate your identity and prevent unauthorized B2B digital execution under the Information Technology Act, 2000 and Section 15 of the Digital Personal Data Protection Act, 2023, please complete the live visual verification below before signing:',
    steps: [
      'Take a blank sheet of physical paper and clearly write down by hand: (a) The 6-character Verification Code displayed on screen below (valid for 10 minutes), (b) Your Full Legal Name, and (c) Your Assigned Trade Partner Application ID (PT-xxx).',
      PHOTO_STEP_2,
    ],
  },
  notice: {
    heading: 'PRE-SUBMISSION STATUTORY & CONTRACTUAL EXECUTION Notice:',
    intro: [
      `By completing this digital execution page at https://pjk.co.in/collaborate/trade-agreement, you (and the architectural, interior design, art advisory, or commercial firm you represent) are entering into a legally binding Principal-to-Principal B2B Commercial Contract with ${OPERATOR}`,
      EXPRESS_NOTICE,
    ],
    items: [
      '10% Upfront B2B Trade Discount, 7-Day Proforma Expiry & Exclusions: Verified Trade Partners receive a flat 10% upfront B2B Trade Discount strictly on the Listed Base Retail Price of eligible original Artworks (excluding inward/outward shipping freight, protective packaging/crating, transit insurance, and GST/VAT/customs duties) when ordering through a logged-in Tagged Trade Account (PT-xxx) or an official B2B Proforma Invoice (valid for 7 calendar days without locking inventory prior to payment). Discounts cannot be stacked or claimed retroactively. While you enjoy complete commercial autonomy in privately billing your End-Clients, you are strictly prohibited from publicly listing or advertising any Phulhaar Gallery Artwork online below its published Phulhaar Listed Base Retail Price.',
      'Bespoke Projects & Pre-Approved Client Referrals (60-Day Lead Lock): Custom volume/hospitality discounts require a prior timestamped email agreement with PAT & J.K. Co.. Where PAT & J.K. Co. pre-approves a direct End-Client purchase, you must register the End-Client in writing with business@pjk.co.in prior to checkout (60-day Lead Lock), and any approved 10% Referral Commission (calculated after first-priority deduction of taxes, shipping/insurance, and statutory TDS) is settled within 30 calendar days after the Delivery + 2 Days inspection window closes, subject to automatic clawback upon return or chargeback.',
      'B2B GST Invoicing, No Service-TDS, International Exports (DAP/DDU) & AML Compliance: Domestic tax invoices are issued under the applicable Goods HSN classification (with zero Service-TDS withholding permitted on goods purchases and mandatory ITC reversal required on any Section 34 GST Credit Note). All payments must be made via traceable non-cash banking channels matching the billed entity’s legal name (mandatory PAN for domestic orders >₹50,000; zero cash ≥₹2,00,000 under Section 269ST). International orders ship as rolled canvases in heavy-duty tubes (unless bespoke crating is paid for) on a final-sale DAP/DDU (Incoterms 2020) basis, with the Trade Partner/consignee bearing 100% of SWIFT sender wire fees, destination import duties, customs tariffs, VAT, and local re-stretching/installation costs.',
      'Mandatory 2-Day Uncut Unboxing Video (Delivery + 2 Days), 100% Verified Damage Refund & Job-Site Risk: Under Section 42 of the Sale of Goods Act, 1930, you must inspect every delivered Artwork and submit a continuous, uncut unboxing video and clear timestamped photographs within 2 calendar days (48 hours) of courier delivery to qualify for PAT & J.K. Co.’s 100% refund and free return shipping guarantee on verified transit damage or metadata discrepancy. Delaying unpacking at a construction site or warehouse does not extend this 2-day window, and PAT & J.K. Co. bears zero liability for on-site dust, moisture, or contractor/framer handling after delivery.',
      '36-Month Artist Anti-Poaching Covenant (₹50,000 / 50% Liquidated Damages), DPDP Vault & Kathua Courts: You are strictly prohibited from removing SKU/CoA provenance records, reproducing/3D-scanning Artworks, or using Artist names, signatures, or courier waybill studio addresses/phone numbers to contact, commission, or purchase directly from any Phulhaar Gallery Artist for 36 months, under pre-estimated liquidated damages of 50% of the gross transaction/project value or ₹50,000, whichever is higher. Your KYC records and live verification photo are stored in an encrypted admin vault (subject to mandatory 8-year statutory tax retention), and all disputes are subject to the exclusive jurisdiction of the competent courts in Kathua, Jammu & Kashmir.',
    ],
  },
  checkboxes: [
    'I HAVE READ AND AGREE TO THE MASTER TRADE PROGRAM & B2B PARTNER AGREEMENT: I confirm that I am at least 18 years of age, legally competent to contract, and authorized to bind my firm. I have read, understood, and unconditionally agree to be bound by all 22 Clauses (Segments I to VII) and the 10-Point Mandatory Trade Partner Declaration of the PAT & J.K. Co. — Master Trade Program & B2B Partner Agreement (Last Updated: November 11, 2026), including the Principal-to-Principal B2B structure, the 10% Trade Discount and exclusion rules, the mandatory 2-day uncut unboxing video inspection protocol, the 36-month Artist non-circumvention covenant (backed by ₹50,000 or 50% liquidated damages), the End-Client dispute indemnification, and the exclusive jurisdiction of the courts in Kathua, Jammu & Kashmir.',
    'I CONSENT TO DPDP ACT KYC VAULT PROCESSING & DIGITAL EXECUTION: I have read and agree to the PAT & J.K. Co. — Artist & Partner On boarding Privacy Policy & Statutory Notice (https://pjk.co.in/privacy). I explicitly consent to the collection and encrypted admin-vault storage of my PAN/Tax ID, Firm GSTIN/registration credentials, bank routing details, and live 10-minute verification photograph for B2B credential authentication, contract execution, GST invoicing, and statutory 8-year tax audit retention. I affirm that ticking these boxes, uploading my live verification photograph, and typing "I AGREE" below constitutes my valid, binding electronic signature under Sections 4, 5, and 10A of the Information Technology Act, 2000.',
  ],
  inputLabel: INPUT_LABEL,
  button: 'EXECUTE & SIGN MASTER TRADE PROGRAM AGREEMENT',
  executionLines: [
    'Signatory Full Legal Name',
    'Firm / Studio Legal Name',
    'Assigned Trade Partner ID',
    'PAN / Passport / Tax ID',
    'Firm GSTIN / COA / Reg. No.',
    'Registered Email & Phone',
    'Registered Business Address',
    'Live 10-Min Code & Photo Ref',
    'Digital Execution ("I AGREE")',
    'Portal, Date, Time (IST) & IP',
  ],
}

export const AGREEMENTS: Record<AgreementKind, AgreementDocument> = {
  artist: ARTIST_AGREEMENT,
  partner: TRADE_AGREEMENT,
}

export const agreementBySlug = (slug: string): AgreementDocument | null =>
  Object.values(AGREEMENTS).find((a) => a.slug === slug) ?? null
