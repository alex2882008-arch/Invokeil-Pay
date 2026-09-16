/** Default panel settings — shared by admin settings API and public pay API. */
export const SETTING_DEFAULTS: Record<string, string> = {
  brandName: 'Invokeil Pay',
  brandTagline: 'Personal MFS Payment Automation',
  brandLogo: '',
  supportPhone: '+880 1711 000000',
  supportEmail: 'support@invokeil.com',
  supportWhatsApp: '',
  supportTelegram: '',
  number_bkash: '01711-000111',
  number_nagad: '01811-000222',
  number_rocket: '01911-000333',
  number_upay: '01611-000444',
  number_tap: '',
  number_telecash: '',
  number_mcash: '',
  number_okwallet: '',
  bank_hint: 'BRAC Bank • A/C 1501 2033 4455 66',
  heartbeatOfflineMinutes: '5',
  paymentTolerance: '0', // BDT underpayment allowed
  checkoutExpiryHours: '24', // default expiry for new checkouts
  invoiceDueDays: '7',
  webhookAttemptLimit: '5',
  landingEnabled: 'true', // show landing at /
  setupCompleted: 'false',
  setupStep: '0',
  defaultLanguage: 'en',
  currency: 'BDT',
  currencySymbol: '৳',
  // ── v3 ──
  appMode: 'SANDBOX', // SANDBOX | PRODUCTION — sandbox simulates all outbound provider/gateway calls
  emailFailoverChain: 'RESEND,SES,MAILERSEND,SMTP', // provider priority order (enabled ones only are tried)
  smsFailoverChain: 'TWILIO,TELNYX,PLIVO,TEXTBEE,AWS_SNS',
  emailReceiveEnabled: 'true', // inbound webhook endpoint active
  automationEnabled: 'true',
  riskEnabled: 'true',
  approvalThresholdAmount: '5000', // refunds/payouts above this need maker-checker approval
  defaultBrandSlug: 'default',
  featurePasskeys: 'false',
  publicStatusUrl: '/status',
  merchantPortalEnabled: 'true',
  receiptVerifyEnabled: 'true',
  refundWindowDays: '7',
  disputeWindowDays: '14',
  kycRequiredForPayout: 'false',
  smsCostPerMessage: '0.35', // BDT estimate for analytics
  emailCostPerMessage: '0.05',
  dailyDigestEnabled: 'false',
}

/** Fetch settings merged with defaults. */
export async function getMergedSettings(): Promise<Record<string, string>> {
  const { db } = await import('@/lib/db')
  const rows = await db.setting.findMany()
  const map: Record<string, string> = { ...SETTING_DEFAULTS }
  for (const r of rows) map[r.key] = r.value
  return map
}
