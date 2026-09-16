/**
 * Legal document library — 15 documents rendered by /legal/[slug].
 *
 * Grounded in current Bangladeshi statutes (verified July 2026):
 *  - Payment and Settlement Systems Act, 2024 (as amended)
 *  - Bangladesh Mobile Financial Services (MFS) Regulations, 2022 + BB PSD circulars
 *  - Personal Data Protection Act, 2026 (which repealed the Personal Data Protection
 *    Ordinance, 2025 and its February 2026 amendment ordinance)
 *  - Cyber Security Ordinance, 2025 (Ordinance No. 25 of 2025; replaced the Cyber
 *    Security Act, 2023 and the Digital Security Act, 2018)
 *  - Money Laundering Prevention Act, 2012 (as amended) · Anti-Terrorism Act, 2009 (as amended)
 *  - Consumer Rights Protection Act, 2009 · Contract Act, 1872 · Companies Act, 1994
 *  - Evidence Act, 1872 (as amended for electronic records) · ICT Act, 2006 (residual provisions)
 *
 * Every page renders a prominent not-legal-advice disclaimer. Statutes are cited
 * generically with "(as amended)" because amendment instruments change frequently.
 */

export interface LegalSection {
  h: string
  ps: string[]
  list?: string[]
}

export interface LegalDoc {
  slug: string
  title: string
  updated: string
  summary: string
  sections: LegalSection[]
}

export const LEGAL_SLUGS = [
  'terms', 'privacy', 'merchant-agreement', 'acceptable-use', 'refund-policy',
  'dispute-chargeback', 'aml-kyc', 'cookie', 'dpa', 'security',
  'responsible-disclosure', 'sla', 'subprocessors', 'grievance', 'license',
] as const

export const LEGAL_DOCS: LegalDoc[] = [
  // ─────────────────────────────── 1. Terms ───────────────────────────────
  {
    slug: 'terms',
    title: 'Terms of Service',
    updated: '2026-07-10',
    summary: 'The agreement between you and Invokeil Pay when you use the software or the public website.',
    sections: [
      {
        h: '1. Who these terms apply to',
        ps: [
          'These Terms of Service (“Terms”) govern your access to and use of the Invokeil Pay software, the merchant dashboard, the public payment pages and this website (together, the “Service”). Invokeil Pay is a self-hosted payment-automation platform: the instance you interact with is operated by the person or entity that installed it (the “Operator”), and these Terms apply both to Operators and to end customers who pay through pages powered by the Service.',
          'Invokeil Pay is a software product. We are not a bank, a mobile financial service provider, or an agent of any bank or MFS provider, and we do not hold, move or settle customer funds. Payment services referenced in the Service are provided by banks and licensed MFS providers under the Payment and Settlement Systems Act, 2024 (as amended) and the Bangladesh Mobile Financial Services (MFS) Regulations, 2022, as further amended by Bangladesh Bank circulars.',
        ],
      },
      {
        h: '2. Acceptance and contract formation',
        ps: [
          'By installing the software, creating a dashboard account or completing a payment through a hosted page, you agree to these Terms, which together with the Privacy Policy form a binding contract under the Contract Act, 1872. If you use the Service on behalf of a company, you confirm you are authorised to bind that company under the Companies Act, 1994 (where incorporated in Bangladesh).',
          'You must be at least 18 years old and legally capable of contracting. Accounts obtained through misrepresentation may be suspended without notice.',
        ],
      },
      {
        h: '3. Your responsibilities as an Operator',
        ps: ['Operators remain solely responsible for the lawfulness of the payments collected through their instance, including:'],
        list: [
          'holding any license or registration their business activity requires in Bangladesh;',
          'complying with the Money Laundering Prevention Act, 2012 (as amended) and Anti-Terrorism Act, 2009 (as amended) in relation to the payments they accept;',
          'the accuracy of prices, invoices, refunds and taxes presented to their customers;',
          'securing their server, paired devices and API keys (see the Security page for our baseline controls);',
          'obtaining all consents required by the Personal Data Protection Act, 2026 for personal data they process through the Service.',
        ],
      },
      {
        h: '4. Acceptable use',
        ps: ['You may not use the Service for unlawful activity, prohibited goods or services, or in any way that breaches the Acceptable Use Policy. The Service is designed for personal and small to semi-medium business use under the Community License; white-label and resale uses require an Enterprise agreement.'],
      },
      {
        h: '5. Availability, changes and termination',
        ps: [
          'The Service is provided “as is”. For self-hosted instances, availability depends on your infrastructure; the Service Level page applies only where an Enterprise agreement says so. We may update the software and these Terms; material changes are announced in the changelog at least 14 days before taking effect.',
          'Either party may stop using the Service at any time. Sections that by their nature should survive termination (license limits, disclaimers, governing law) do so.',
        ],
      },
      {
        h: '6. Disclaimers and limits',
        ps: [
          'To the fullest extent permitted by law, Invokeil Pay disclaims implied warranties of merchantability and fitness for a particular purpose, and is not liable for indirect, incidental or consequential losses, including lost profits or lost MFS balances caused by unpaired devices, expired checkouts or operator error.',
          'Electronic records and logs generated by the Service are retained in a form intended to support admissibility under the Evidence Act, 1872 (as amended for electronic records).',
          'Nothing in these Terms excludes liability that cannot be excluded under the Consumer Rights Protection Act, 2009 or other mandatory Bangladeshi law.',
        ],
      },
      {
        h: '7. Governing law and disputes',
        ps: [
          'These Terms are governed by the laws of the People’s Republic of Bangladesh. Disputes are resolved as set out in the Grievance & Complaints page — escalation to the courts of Dhaka only after our internal escalation window has run.',
        ],
      },
    ],
  },

  // ─────────────────────────────── 2. Privacy ───────────────────────────────
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    updated: '2026-07-10',
    summary: 'How personal data is processed by the Service and this website, under the Personal Data Protection Act, 2026.',
    sections: [
      {
        h: '1. Scope and roles',
        ps: [
          'This policy explains how personal data flows through Invokeil Pay. For self-hosted instances, the Operator is the data controller for the customer data they collect, and Invokeil Pay (the software vendor) acts as a processor only where you use our hosted update channel or contact us for support. This website processes only the data described in section 5.',
          'We design the Service to support compliance with the Personal Data Protection Act, 2026 — the law that repealed the Personal Data Protection Ordinance, 2025 — read together with sectoral rules issued by Bangladesh Bank for payment services.',
        ],
      },
      {
        h: '2. Data the Service processes',
        ps: ['The categories below are processed on your own instance, under your control:'],
        list: [
          'Customer data you or your customers provide: name, phone number, email, and any custom fields you define.',
          'Transaction data: amounts, gateway, TrxID, timestamps and the raw MFS confirmation SMS text needed for matching.',
          'Device data: device model, Android version, battery and signal telemetry, SIM carrier, app version.',
          'Technical logs: IP address, user agent and audit-trail entries required for fraud prevention and record-keeping.',
          'Credentials: password hashes (bcrypt), 2FA secrets, passkey public keys — never plaintext.',
        ],
      },
      {
        h: '3. Why we process it (purposes and lawful basis)',
        ps: ['Processing is limited to: (a) verifying and reconciling payments you request — necessary for the contract with you; (b) fraud, AML and risk screening under the Money Laundering Prevention Act, 2012 (as amended); (c) security and service integrity, including cyber-incident response consistent with the Cyber Security Ordinance, 2025; (d) legal retention duties; and (e) product improvement only on aggregated, non-identifying data.'],
      },
      {
        h: '4. Retention',
        ps: [
          'Transaction records and associated customer identifiers are retained for at least five (5) years to satisfy Bangladesh Bank record-keeping expectations that flow through to payment-adjacent service providers. Other personal data (e.g. abandoned checkout drafts) is purged automatically after 24 months of inactivity, or sooner at the Operator’s instruction.',
        ],
      },
      {
        h: '5. This website',
        ps: [
          'The public website stores only what you type into the contact form (name, email, message), the technical metadata required to detect abuse (IP, user agent, timestamp), and strictly necessary cookies described in the Cookie Policy. Contact-form data is used solely to answer you and is retained for 24 months.',
        ],
      },
      {
        h: '6. Your rights',
        ps: ['Subject to the Personal Data Protection Act, 2026, you may request from the relevant Operator:'],
        list: [
          'access to, and a copy of, the personal data held about you;',
          'correction of inaccurate or incomplete data;',
          'erasure where retention is not legally required;',
          'withdrawal of consent for optional processing, without affecting earlier lawful processing;',
          'a response within the timelines published in the Grievance & Complaints page.',
        ],
      },
      {
        h: '7. Cross-border and disclosure',
        ps: [
          'Self-hosted instances keep data where you deploy them. If an Operator configures off-site backups outside Bangladesh, they remain responsible for meeting transfer conditions under applicable law. We disclose data to third parties only as described in the Subprocessors page, or where compelled by a valid order of a court or regulator of Bangladesh.',
        ],
      },
      {
        h: '8. Contact',
        ps: ['Privacy questions: dpo@invokeil.com (see the Grievance page for the full contact template and escalation windows).'],
      },
    ],
  },

  // ─────────────────────────────── 3. Merchant agreement ───────────────────────────────
  {
    slug: 'merchant-agreement',
    title: 'Merchant Agreement',
    updated: '2026-07-10',
    summary: 'Specific terms for merchants collecting payments through a self-hosted Invokeil Pay instance.',
    sections: [
      {
        h: '1. Definitions',
        ps: [
          '“Merchant” means the business using Invokeil Pay to collect payments; “Payer” means the customer paying through a checkout, link or invoice; “Gateway” means a bank, MFS provider or PSP configured in the merchant’s instance; “TrxID” means the transaction identifier issued by the Gateway in its confirmation SMS.',
        ],
      },
      {
        h: '2. Service description',
        ps: [
          'Invokeil Pay provides software that: creates hosted payment pages; receives MFS confirmation SMS on merchant-controlled Android devices; matches those SMS to open payments; and exposes records, webhooks and a merchant API. The merchant holds the underlying wallet or merchant account relationship with each Gateway and is bound by that Gateway’s own terms, including wallet tiers and limits under the Bangladesh MFS Regulations, 2022.',
        ],
      },
      {
        h: '3. Fees and settlement',
        ps: [
          'Invokeil Pay charges no per-transaction fee on Community instances. Gateway charges (cash-in, cash-out, merchant fees) are set by the Gateway and may be passed to the Payer transparently via the charge engine. Funds settle directly into the merchant’s own wallet or bank account; Invokeil Pay never takes custody of merchant funds.',
        ],
      },
      {
        h: '4. Verification and matching',
        ps: [
          'Payment verification depends on the Gateway’s SMS reaching a paired device. The merchant is responsible for: keeping at least one healthy paired device per active SIM; keeping device keys confidential; and configuring amount tolerances prudently. Where a Payer claims to have paid but no matching SMS arrives within the checkout window, the dispute process on the Dispute & Chargeback page applies.',
        ],
      },
      {
        h: '5. Compliance warranties',
        ps: ['The merchant warrants that it:'],
        list: [
          'holds all registrations and licenses needed for its trade (including trade license, TIN and — where its turnover requires — VAT registration);',
          'will use the Service only for its lawful business and comply with the AML/CFT & KYC Policy;',
          'will not process payments on behalf of third parties without a written Enterprise agreement;',
          'will honour its published refund policy and the refund rights available to consumers under the Consumer Rights Protection Act, 2009.',
        ],
      },
      {
        h: '6. Suspension and termination',
        ps: [
          'A merchant account (user, API key or store) may be suspended where we reasonably believe the AML/CFT policy, acceptable use or these terms are breached — for example repeated processing for sanctioned categories, or device keys posted publicly. Suspension is notified with reasons, and unfrozen when the cause is cured, subject to the grievance process.',
        ],
      },
      {
        h: '7. Liability cap',
        ps: [
          'Except for breaches that cannot be limited by law, each party’s aggregate liability under this agreement is capped at the amounts the merchant actually paid to us for the Service in the 12 months before the claim (which for Community Edition is typically zero). Nothing limits liability for fraud, wilful misconduct, or death/personal injury caused by negligence.',
        ],
      },
    ],
  },

  // ─────────────────────────────── 4. Acceptable use ───────────────────────────────
  {
    slug: 'acceptable-use',
    title: 'Acceptable Use Policy',
    updated: '2026-07-10',
    summary: 'What the Service may and may not be used for — enforced with risk rules, suspension and, where required, reporting.',
    sections: [
      {
        h: '1. Purpose',
        ps: ['This policy keeps Invokeil Pay out of the hands of fraudsters and out of conflict with Bangladeshi law, including the Penal Code, the Money Laundering Prevention Act, 2012 (as amended), the Anti-Terrorism Act, 2009 (as amended) and the Cyber Security Ordinance, 2025 (which replaced the Cyber Security Act, 2023).'],
      },
      {
        h: '2. Prohibited conduct',
        ps: ['You must not use the Service to:'],
        list: [
          'collect payments for goods or services that are illegal in Bangladesh — including gambling, unlicensed lending, lottery, narcotics, weapons, wildlife trafficking and unapproved foreign-exchange schemes;',
          'defraud payers: fake invoices, bait pricing, non-delivery scams, or misrepresenting who is collecting the money;',
          'launder money, structure transactions to evade reporting, or move funds for third parties under the cover of your own business (“money mule” activity);',
          'harass, threaten or defame any person through payment descriptions, links or messages sent via the Service;',
          'attack the Service or others: unauthorised scanning, credential stuffing, denial-of-service, or distribution of malware — conduct separately punishable under the Cyber Security Ordinance, 2025;',
          'circumvent limits: rotating device keys, spoofing heartbeats, or automating “I have paid” claims with false TrxIDs;',
          'resell white-labelled copies of the Service without an Enterprise agreement.',
        ],
      },
      {
        h: '3. Enforcement',
        ps: [
          'We may warn, throttle, suspend or terminate accounts that breach this policy. Risk rules configured in the Service (velocity, amount, list-match, hour-pattern) can automatically hold payments for review. Where conduct may constitute a criminal offence, we will preserve evidence and assist law-enforcement authorities acting under due process, consistent with the Evidence Act, 1872 (as amended for electronic records).',
        ],
      },
      {
        h: '4. Reporting abuse',
        ps: ['To report abuse of an Invokeil Pay payment page, email abuse@invokeil.com with the page URL, TrxID and evidence. We acknowledge reports within 2 business days.'],
      },
    ],
  },

  // ─────────────────────────────── 5. Refund policy ───────────────────────────────
  {
    slug: 'refund-policy',
    title: 'Refund Policy',
    updated: '2026-07-10',
    summary: 'How refunds work end-to-end: merchant-led MFS reversals, the refund workflow, and consumer rights.',
    sections: [
      {
        h: '1. Principle',
        ps: [
          'Because funds settle directly into the merchant’s own MFS wallet or bank account, refunds are initiated by the merchant, not by Invokeil Pay. The Service provides the workflow, the audit trail and the customer notifications; the money moves through your Gateway.',
        ],
      },
      {
        h: '2. Merchant refund workflow',
        ps: ['Refunds in the panel follow a controlled path designed to survive staff turnover:'],
        list: [
          'A refund is requested against a specific transaction (FULL or PARTIAL) with a mandatory reason.',
          'Requests above the approval threshold require a second person to approve — the approval is logged (who, when, decision).',
          'Once approved, staff send the refund from the merchant’s own bKash/Nagad/Rocket app or bank channel to the Payer’s number, and record the reference in the refund row.',
          'The transaction is marked refunded, the customer is notified through your configured channels, and refund.reversed entries appear in reports and exports.',
        ],
      },
      {
        h: '3. Timing',
        ps: [
          'Merchants should publish their own refund window (commonly 7 days for undelivered goods). We recommend processing approved refunds within 3 business days — MFS reversals are typically instantaneous once sent. Statutory rights under the Consumer Rights Protection Act, 2009 always take precedence over any shorter merchant policy.',
        ],
      },
      {
        h: '4. Failed and duplicate payments',
        ps: [
          'Where a Payer demonstrably sent money that could not be matched to a checkout (wrong amount, wrong number, expired page), the standard remedy is a merchant-led refund of the unmatched transaction once identified. Keep the original TrxID — it is the key to locating the payment in the unmatched queue.',
        ],
      },
      {
        h: '5. What is not refundable by us',
        ps: [
          'Invokeil Pay collects no transaction fee, so there is no platform fee to refund. Gateway-side charges (e.g. cash-out fees already incurred to move money) are set by the Gateway and may not be recoverable; the merchant decides whether to absorb them.',
        ],
      },
      {
        h: '6. Disputes about refunds',
        ps: ['If a merchant refuses a refund you believe you are owed, use the escalation path in the Grievance & Complaints page; consumer complaints may also be made to the Directorate of National Consumer Rights Protection (DNCRP) under the Consumer Rights Protection Act, 2009.'],
      },
    ],
  },

  // ─────────────────────────────── 6. Dispute & chargeback ───────────────────────────────
  {
    slug: 'dispute-chargeback',
    title: 'Dispute & Chargeback Policy',
    updated: '2026-07-10',
    summary: 'How payment disputes are raised, evidenced and resolved — including card chargebacks on bank gateways.',
    sections: [
      {
        h: '1. Scope',
        ps: [
          '“Dispute” covers any contested payment: a Payer says they paid and the merchant says they did not receive (or vice versa), or the goods/service is contested. MFS rails in Bangladesh do not operate card-style chargebacks; bank-card routes may, through the issuing bank under Bangladesh Bank’s card rules.',
        ],
      },
      {
        h: '2. Evidence the Service preserves',
        ps: ['Every transaction carries a dispute-ready evidence bundle:'],
        list: [
          'the raw gateway SMS (sender, timestamp, TrxID, amount) that matched the payment;',
          'checkout metadata, custom fields and the customer claim entry with IP and timestamp;',
          'device identity and heartbeat state at match time;',
          'all webhook deliveries and notifications sent for the payment.',
        ],
        },
      {
        h: '3. Raising a dispute',
        ps: [
          'Open the payment page or contact the merchant first — most disputes are delivery questions. If unresolved within 7 days, either party escalates through the Grievance & Complaints page. Disputes opened in the panel track OPEN → UNDER_REVIEW → WON/LOST with a deadline and a message thread attached to the original transaction.',
        ],
      },
      {
        h: '4. Card chargebacks (bank gateways)',
        ps: [
          'For card-paying customers, the cardholder may dispute through their issuing bank. The issuer investigates under its network rules and Bangladesh Bank’s card-issuance guidelines; the merchant’s evidence bundle above is what the acquirer will request. Outcomes: chargeback upheld (funds reversed) or merchant represents successfully. Invokeil Pay surfaces the reversal as a transaction.reversed event so books stay accurate.',
        ],
      },
      {
        h: '5. Fraudulent disputes',
        ps: [
          'Knowingly false “I did not receive” claims with evidence to the contrary may constitute cheque/dishonesty or fraud offences under Bangladeshi law. We preserve logs and assist lawful investigations; merchants should report clear fraud to the police and, for cyber elements, follow the reporting guidance in the Security page.',
        ],
      },
    ],
  },

  // ─────────────────────────────── 7. AML / KYC ───────────────────────────────
  {
    slug: 'aml-kyc',
    title: 'AML/CFT & KYC Policy',
    updated: '2026-07-10',
    summary: 'Anti-money-laundering and counter-terrorism-financing controls for the Service and its operators, under MLPA 2012 (as amended), ATA 2009 and Bangladesh Bank guidance.',
    sections: [
      {
        h: '1. Regulatory foundation',
        ps: [
          'Invokeil Pay is a software provider, not a financial institution. Nevertheless, because the Service touches payment flows regulated by Bangladesh Bank — the Payment and Settlement Systems Act, 2024 (as amended) and the Bangladesh Mobile Financial Services (MFS) Regulations, 2022 — we operate a risk-based AML/CFT programme consistent with the Money Laundering Prevention Act, 2012 (as amended), the Anti-Terrorism Act, 2009 (as amended), and instructions of the Bangladesh Financial Intelligence Unit (BFIU).',
          'Operators remain the first line: where their activity makes them reporting entities under applicable BFIU circulars, their own KYC/STR obligations sit with them, not with us.',
        ],
      },
      {
        h: '2. Customer due diligence (KYC)',
        ps: ['The Service supports CDD at the point of collection:'],
        list: [
          'payer identity anchors: verified phone number (SMS possession), optional email, and any KYC profile fields the merchant enables;',
          'a KYC workflow (PENDING → SUBMITTED → VERIFIED/REJECTED/EXPIRED) with document metadata storage for merchants who require enhanced due diligence on high-value payers;',
          'per-gateway wallet limits inherited from the MFS Regulations, 2022 tier structure, so collections respect wallet ceilings;',
          'customer suspension with mandatory reason, blocking further checkouts to a risky number.',
        ],
      },
      {
        h: '3. Transaction monitoring',
        ps: [
          'The built-in risk engine screens for structuring (many just-below-threshold payments), velocity spikes, unusual hour patterns, and matches against the merchant’s block list. Matches create risk cases that a human reviewer must clear or block — the system never silently drops a payment without a trace.',
        ],
      },
      {
        h: '4. Sanctions and watchlists',
        ps: [
          'Merchants operating under international exposure should configure list-matching rules against UN Security Council consolidated lists and any Bangladesh Bank-designated terrorist lists under the Anti-Terrorism Act, 2009 (as amended). Positive matches on listed names must be escalated to BFIU through the merchant’s reporting channel.',
        ],
      },
      {
        h: '5. Record keeping',
        ps: [
          'Transaction records, raw SMS evidence, KYC documents metadata and audit logs are retained for a minimum of five (5) years, in line with BFIU record-keeping expectations, in a form supporting admissibility under the Evidence Act, 1872 (as amended for electronic records).',
        ],
      },
      {
        h: '6. Reporting and cooperation',
        ps: [
          'Suspicious transactions are the merchant’s regulatory duty to report where they are a reporting entity; we provide the exports to make that possible. We respond to lawful requests from BFIU, Bangladesh Bank, law enforcement and courts, verified against due process, and we never tip off subjects of a lawful disclosure request.',
        ],
      },
      {
        h: '7. Programme governance',
        ps: ['Our internal programme includes a designated compliance owner, annual policy review, staff training, and a documented escalation matrix — reviewed most recently in July 2026.'],
      },
    ],
  },

  // ─────────────────────────────── 8. Cookie ───────────────────────────────
  {
    slug: 'cookie',
    title: 'Cookie Policy',
    updated: '2026-07-10',
    summary: 'The few cookies this website and the Service actually set — no advertising trackers, ever.',
    sections: [
      {
        h: '1. Strictly necessary cookies',
        ps: ['This website sets no advertising or analytics cookies. The only cookies are functional:'],
        list: [
          'Session cookie (dashboard only) — authenticates your signed-in session; HttpOnly, SameSite=Lax, cleared on sign-out.',
          'Theme preference — stores light/dark/system so the interface renders the way you left it.',
          'CSRF token where forms require one.',
        ],
      },
      {
        h: '2. Local storage',
        ps: [
          'The dashboard and public payment pages use browser local storage for non-sensitive preferences (selected language, collapsed panels, pairing draft). No payment data is stored client-side beyond the current page session.',
        ],
      },
      {
        h: '3. Third parties',
        ps: [
          'We do not embed third-party analytics, ad networks or social pixels on any page — marketing pages included. Webhooks and APIs are server-to-server; your browsing of the public site is not profiled by us or anyone else.',
        ],
      },
      {
        h: '4. Managing cookies',
        ps: [
          'You can clear or block cookies in your browser settings; the only cost is being signed out of the dashboard. Because our cookies are strictly necessary, consent banners are not required for them, and we do not run the kind of processing that would trigger consent rules under the Personal Data Protection Act, 2026 on this website.',
        ],
      },
    ],
  },

  // ─────────────────────────────── 9. DPA ───────────────────────────────
  {
    slug: 'dpa',
    title: 'Data Processing Addendum',
    updated: '2026-07-10',
    summary: 'Controller–processor terms incorporating the Personal Data Protection Act, 2026 for Operators who need them.',
    sections: [
      {
        h: '1. When this DPA applies',
        ps: [
          'For self-hosted Community instances, the Operator processes personal data on their own infrastructure and no processor relationship with us exists. This DPA applies automatically where the Operator uses a hosted feature we provide (update channel, support with data access) or where an Enterprise agreement incorporates it by reference.',
        ],
      },
      {
        h: '2. Roles and instructions',
        ps: [
          'The Operator is the data controller; Invokeil Pay is the data processor. We process personal data only on the Operator’s documented instructions (configuration choices, support tickets, this DPA) unless required by Bangladeshi law — in which case we notify the Operator before complying unless legally prohibited.',
        ],
      },
      {
        h: '3. Confidentiality and staff',
        ps: ['Personnel who may touch personal data are bound by written confidentiality obligations and receive data-protection training appropriate to their role.'],
      },
      {
        h: '4. Security measures',
        ps: ['As processor we maintain the controls described on the Security page, including encryption of stored provider credentials, signed releases for the hosted channel, and least-privilege access with audit logging.'],
      },
      {
        h: '5. Sub-processing',
        ps: [
          'Sub-processors are listed on the Subprocessors page. We give 30 days’ notice of additions, and the Operator may object on reasonable data-protection grounds.',
        ],
      },
      {
        h: '6. Data subject requests and breach notice',
        ps: [
          'We assist the Operator to answer requests exercisable under the Personal Data Protection Act, 2026. Where we become aware of a personal-data breach affecting data we process, we notify the Operator without undue delay and within 72 hours of confirmation, with the information reasonably required for the Operator’s own notification duties.',
        ],
      },
      {
        h: '7. Deletion and return',
        ps: ['On termination of the relevant service, personal data processed by us is returned in a machine-readable export and then deleted within 90 days, except where retention is required by law.'],
      },
      {
        h: '8. Audits',
        ps: ['Enterprise customers may audit our compliance once per year on 30 days’ notice, or more frequently following a reported breach.'],
      },
    ],
  },

  // ─────────────────────────────── 10. Security ───────────────────────────────
  {
    slug: 'security',
    title: 'Security',
    updated: '2026-07-10',
    summary: 'How Invokeil Pay protects credentials, devices and data — and what you must protect as the operator.',
    sections: [
      {
        h: '1. Architecture principle',
        ps: [
          'Self-hosted means the threat model is yours to own. The software’s job is to make the secure path the easy path: secrets encrypted at rest, least-privilege APIs, and no plaintext credentials anywhere in the database.',
        ],
      },
      {
        h: '2. Platform controls',
        ps: ['Controls built into every instance:'],
        list: [
          'Passwords stored as bcrypt hashes; sessions are HttpOnly cookies with server-side revocation.',
          'Two-factor authentication (TOTP) and WebAuthn passkeys for dashboard users.',
          'API keys presented as Bearer tokens with store scoping, granular permissions, rotation and one-way hashing at rest.',
          'Webhook signatures (HMAC-SHA256 over “{timestamp}.{payload}”, header t=,v1=) with an 8-second timeout and SSRF guards on outbound URLs.',
          'Role-based access control (Owner, Admin, Developer, Finance, Support, Agent, Viewer) enforced server-side on every route.',
          'Full audit trail (ActivityLog) of privileged actions with actor, target, IP and user agent.',
          'Provider credentials (email/SMS configs) encrypted with a key derived from your APP_KEY and returned masked in every API response.',
          'Rate limiting on authentication and public endpoints; honeypot + throttling on public forms.',
        ],
      },
      {
        h: '3. Device security',
        ps: [
          'Device keys are per-device, revocable by unpairing, and usable only to post SMS and heartbeats — never to read data. The Android app filters OTP-bearing messages locally before upload and supports PIN/biometric app lock for phones shared with staff.',
        ],
      },
      {
        h: '4. Operator checklist',
        ps: ['You are responsible for:'],
        list: [
          'TLS on every public hostname (the bundled Caddy config does this in two lines);',
          'server patching, firewalling and off-site encrypted backups;',
          'keeping APP_KEY and database backups out of version control and out of email;',
          'promptly unpairing lost or retired devices.',
        ],
      },
      {
        h: '5. Incident response',
        ps: [
          'Suspected compromise? Rotate the APP_KEY (invalidates encrypted provider configs — re-enter them), rotate API keys, unpair devices, and restore from a pre-compromise backup. Report cyber-intrusions to us at security@invokeil.com; where an offence under the Cyber Security Ordinance, 2025 is suspected, preserve logs for law enforcement.',
        ],
      },
      {
        h: '6. Vulnerability handling',
        ps: ['See the Responsible Disclosure page for how to report vulnerabilities safely, and our maximum time-to-first-response commitments.'],
      },
    ],
  },

  // ─────────────────────────────── 11. Responsible disclosure ───────────────────────────────
  {
    slug: 'responsible-disclosure',
    title: 'Responsible Disclosure (VDP)',
    updated: '2026-07-10',
    summary: 'Our vulnerability disclosure programme: scope, safe harbour and response timelines.',
    sections: [
      {
        h: '1. Scope',
        ps: ['In-scope: the Invokeil Pay source code, the merchant dashboard, the public payment pages (checkout, link, invoice, portal, verify), the merchant API (v1) and this website. Out-of-scope: the underlying MFS/bank services, third-party provider outages, volumetric denial-of-service without a novel vector, and social engineering of staff.'],
      },
      {
        h: '2. How to report',
        ps: ['Email security@invokeil.com with:'],
        list: [
          'a description and, ideally, a minimal proof-of-concept;',
          'affected component and version (the footer of any page shows v3.x);',
          'your contact details and whether you want public credit.',
        ],
      },
      {
        h: '3. Our commitments',
        ps: ['Our maximum response commitments:'],
        list: [
          'Acknowledge within 2 business days (target: 24 hours).',
          'Initial triage and severity assignment within 5 business days.',
          'Fix or mitigation for critical issues within 30 days; high within 60; others on the public roadmap.',
          'Public credit (if desired) after the fix ships; CVE requested where applicable.',
        ],
      },
      {
        h: '4. Safe harbour',
        ps: [
          'We will not pursue legal action for good-faith research that: uses only accounts you control, avoids privacy violations and service degradation, stops at proof of impact, and reports promptly. Testing must comply with the Cyber Security Ordinance, 2025 — unauthorised access outside this policy is unlawful even if well-intentioned.',
        ],
      },
      {
        h: '5. Hall of thanks',
        ps: ['Contributors who choose credit are listed in the repository’s SECURITY.md with the finding and date, permanently.'],
      },
    ],
  },

  // ─────────────────────────────── 12. SLA ───────────────────────────────
  {
    slug: 'sla',
    title: 'Service Level',
    updated: '2026-07-10',
    summary: 'What availability and support response you can expect — and how SLA credits work on Enterprise.',
    sections: [
      {
        h: '1. Self-hosted reality',
        ps: [
          'Community instances run on your infrastructure: availability is a function of your server, your network and your devices. The platform is engineered for 99.9%+ achievable uptime (stateless app + SQLite with WAL, health checks, and device heartbeats), but no contractual SLA attaches to Community.',
        ],
      },
      {
        h: '2. Enterprise SLA',
        ps: ['Where an Enterprise agreement incorporates this page:'],
        list: [
          'Monthly uptime commitment: 99.9% of calendar minutes, measured on the dashboard and public payment pages.',
          'Exclusions: your infrastructure, MFS/bank outages, force majeure, and maintenance announced ≥ 48 hours ahead (max 4 h/month).',
          'Credits: 10% of monthly fees per full 0.1% below target, capped at 30% per month; claimed within 30 days.',
          'Severity response: P1 (payments down) 30 min, 24×7; P2 (degraded) 2 h; P3 (minor) 1 business day.',
        ],
      },
      {
        h: '3. Support response (all plans)',
        ps: ['Without a contract, we still publish our targets: community GitHub issues — best effort; Pro — first response within 1 business day, priority queue; security reports — per the Responsible Disclosure page. Support hours: Sunday–Thursday, 10:00–18:00 BST (UTC+6).'],
      },
      {
        h: '4. Status transparency',
        ps: ['Component health and incidents are published at /status with 60-second auto-refresh, and historical incidents remain visible for 90 days.'],
      },
    ],
  },

  // ─────────────────────────────── 13. Subprocessors ───────────────────────────────
  {
    slug: 'subprocessors',
    title: 'Subprocessors',
    updated: '2026-07-10',
    summary: 'Third parties the Service can be configured to use, and what is shared with each — always under your configuration.',
    sections: [
      {
        h: '1. Principle',
        ps: [
          'A self-hosted instance shares data with exactly the third parties the Operator configures — and with nobody else. The platform phones home to no telemetry endpoint. The categories below apply only when the corresponding feature is enabled.',
        ],
      },
      {
        h: '2. Categories',
        ps: ['The Service supports these configurable processor categories:'],
        list: [
          'Email delivery providers (Resend, Amazon SES, MailerSend, Plunk, Loops, generic SMTP) — receive recipient address and rendered message content for the notifications you author.',
          'SMS delivery providers (Twilio, Telynx, Plivo, textbee, AWS SNS) — receive destination number and message body for outbound notifications and OTPs.',
          'Paired Android devices — receive nothing beyond their own credentials; they upload SMS and telemetry to your instance.',
          'Webhook endpoints you register — receive the event payloads described in the Webhooks documentation, signed with your endpoint secret.',
          'Hosting/infrastructure of your choosing — where your instance runs, the data lives.',
        ],
      },
      {
        h: '3. Vendor management',
        ps: [
          'We evaluate provider categories for security posture and regional reliability before shipping an integration, and credentials for each are stored encrypted and masked in all panel responses. Operators are responsible for their own data-processing agreements with the providers they enable.',
        ],
      },
      {
        h: '4. Changes',
        ps: ['New processor categories ship in the changelog and this page is updated at the same time; hosted-channel customers receive 30 days’ notice before a category becomes available to enable.'],
      },
    ],
  },

  // ─────────────────────────────── 14. Grievance ───────────────────────────────
  {
    slug: 'grievance',
    title: 'Grievance & Complaints',
    updated: '2026-07-10',
    summary: 'How to complain, what happens in 7, 14 and 30 days, and the external pathways (Bangladesh Bank, DNCRP, BTRC, data protection authority).',
    sections: [
      {
        h: '1. Our promise',
        ps: [
          'Every complaint gets a human, a ticket and a deadline. Complaints about this website or about Invokeil Pay as a vendor go to us. Complaints about a merchant’s goods, services or refund — start with the merchant, then use this page’s escalation if they stall. This process is provided for transparency; it is not legal advice, and statutory or regulatory remedies remain available to you at all times.',
        ],
      },
      {
        h: '2. How to complain',
        ps: ['Use whichever is easiest:'],
        list: [
          'The form on the Contact page — it creates a tracked ticket automatically (fastest).',
          'Email grievance@invokeil.com with subject “Complaint” — include the payment TrxID, merchant name, page URL, amount and date.',
          'In writing: Invokeil Pay, Grievance Officer, Level 6, House 12, Road 5, Dhanmondi, Dhaka 1205, Bangladesh.',
        ],
      },
      {
        h: '3. Escalation timeline',
        ps: ['We commit to the following clock, counted in calendar days from receipt:'],
        list: [
          'Day 0 — acknowledgement with a unique ticket reference and the named handler.',
          'Within 7 days — substantive first response: findings so far, or resolution where the facts are simple.',
          'Within 14 days — resolution letter for complaints requiring internal investigation (e.g. matching logs, device evidence).',
          'Within 30 days — final decision for complex complaints, including any remedy (refund coordination, account action, corrective fix). If we need more time, we say so in writing before day 30 with the specific reason and a firm date — silence is never the answer.',
        ],
      },
      {
        h: '4. External pathways',
        ps: ['You are free to go outside at any point. Depending on the subject matter:'],
        list: [
          'Bangladesh Bank — complaints about banks and MFS providers (bKash, Nagad, Rocket, Upay and others) can be made through Bangladesh Bank’s complaint channels; the Payment and Settlement Systems Act, 2024 (as amended) strengthened the central bank’s supervision of payment service providers.',
          'Directorate of National Consumer Rights Protection (DNCRP) — consumer-rights complaints (unfair trade practices, refund refusal) under the Consumer Rights Protection Act, 2009; complaints can be filed via their hotline 16127 and regional offices.',
          'BTRC — matters involving telecom services or SMS delivery through mobile operators.',
          'Data protection authority designated under the Personal Data Protection Act, 2026 — unresolved personal-data grievances (access, correction, erasure) after our 30-day window.',
          'Courts of Bangladesh — nothing here limits any right of action; our records are maintained to support evidence under the Evidence Act, 1872 (as amended for electronic records).',
        ],
      },
      {
        h: '5. Data protection officer',
        ps: ['For personal-data requests and privacy complaints, contact the DPO directly. Template (copy, fill, send to dpo@invokeil.com):'],
        list: [
          'Subject: Personal data request — [access / correction / erasure / complaint]',
          'Full name and phone/email used on the payment:',
          'Transaction TrxID and date (or payment page URL):',
          'Merchant/instance name (the site where you paid):',
          'Exact request and any supporting documents:',
          'Identity verification: I confirm the details above are mine and understand verification may be required.',
        ],
      },
      {
        h: '6. Grievance officer',
        ps: ['Our designated grievance officer can be reached at grievance@invokeil.com during office hours (Sunday–Thursday, 10:00–18:00 BST). Escalations inside the company go to the compliance owner and, if unresolved, to the founders — the ticket history makes that automatic.'],
      },
    ],
  },

  // ─────────────────────────────── 15. License ───────────────────────────────
  {
    slug: 'license',
    title: 'License',
    updated: '2026-07-10',
    summary: 'The Invokeil Pay Community License in plain language — what you may do, what you may not, and when to talk to us.',
    sections: [
      {
        h: '1. Summary',
        ps: [
          'Invokeil Pay is distributed under the Invokeil Pay Community License (the full text lives in the LICENSE file of the repository). In plain language:',
        ],
        list: [
          'You MAY self-host the complete, unmodified platform for personal use and for use by small and semi-medium businesses, free of charge, forever.',
          'You MAY study the source code, modify it for your own use, and contribute improvements back.',
          'You MAY NOT remove or obscure the “Invokeil Pay” branding, footer marks or admin UI marks from a deployment you offer to others.',
          'You MAY NOT resell, rebrand, white-label or offer the software (or a derivative of it) as a hosted payments product to third parties without a written Enterprise agreement.',
          'You MAY NOT use the software to operate a payment service for others where doing so requires a license under the Payment and Settlement Systems Act, 2024 (as amended) that you do not hold.',
          'ALL uses remain subject to the Terms of Service, the Acceptable Use Policy and the AML/CFT & KYC Policy.',
        ],
      },
      {
        h: '2. Why this license',
        ps: [
          'The Community License keeps the platform genuinely free for the people it was built for — individuals and small businesses collecting their own payments — while ensuring that companies who want to sell Invokeil Pay under their own brand contribute through the Enterprise program that funds development.',
        ],
      },
      {
        h: '3. Contributed code',
        ps: ['Pull requests accepted into the main repository are licensed to us under the same Community License, so improvements stay free for everyone.'],
      },
      {
        h: '4. Commercial licensing',
        ps: ['White-label rights, resale rights, indemnification and compliance review are available under the Enterprise plan — see Pricing or email sales@invokeil.com.'],
      },
      {
        h: '5. Disclaimer',
        ps: ['This page summarizes the license for convenience. Where this summary and the LICENSE file differ, the LICENSE file controls. This page is not legal advice.'],
      },
    ],
  },
]

export function getLegalDoc(slug: string): LegalDoc | undefined {
  return LEGAL_DOCS.find((d) => d.slug === slug)
}
