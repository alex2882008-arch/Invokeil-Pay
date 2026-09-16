// ── Invokeil Pay — Gateway Catalog (PipraPay-exact parity, read 1-by-1) ─────
// Every PipraPay gateway module (pp-content/pp-modules/pp-gateways/*) was read
// individually. This catalog reproduces ALL of them 1:1 — each gateway keeps
// its own distinct payment method (Send Money / Cash Out / Make Payment /
// Fund Transfer / Payment), QR availability, brand color and step-by-step
// payment instructions in English + Bangla. Invokeil Pay extras (SureCash,
// MeghnaPay, Trust Money, dMoney, A Wallet, PortWallet, wallets & more) are
// kept on top — so the panel covers PipraPay's full set AND more.
//
// PipraPay mapping (48 modules):
//   personal → "Send Money" · agent → "Cash Out" · merchant → "Make Payment"
//   cellfin  → "Fund Transfer" → CellFin · pathaopay-merchant → "Payment"
//   API: aamarpay, bkash-api-tokenized, eps, nagad-merchant-api, nowpayments,
//        oxapay, pathaopay-merchant-api, paypal-api, paystation, shurjopay,
//        sslcommerz, stripe, binance-personal
//   Manual: payeer, payoneer, paypal, taptap-send, wise

export type GatewayCategory = 'MFS' | 'BANK' | 'GLOBAL'
export type GatewayType = 'AUTOMATION' | 'MANUAL' | 'API'
export type GatewayAccountType = 'PERSONAL' | 'AGENT' | 'MERCHANT'

/** The distinct way a customer pays — one per gateway family (PipraPay-exact). */
export type GatewayMethod =
  | 'SEND_MONEY'      // bKash/Nagad/Rocket/Upay/Tap/TeleCash/mCash/OK Wallet/iPay/PathaoPay personal
  | 'CASH_OUT'        // *-agent gateways
  | 'MAKE_PAYMENT'    // *-merchant gateways (bKash/Nagad/Rocket/Upay/…/iPay)
  | 'PAYMENT'         // PathaoPay merchant ("Payment")
  | 'FUND_TRANSFER'   // CellFin ("Fund Transfer" → CellFin)
  | 'BANK_TRANSFER'   // Bank transfer / bank gateways
  | 'CARD'            // Card gateways
  | 'API_CHECKOUT'    // Hosted API PSP checkout
  | 'MANUAL_TRANSFER' // PayPal/Payoneer/Payeer/Wise/TapTap/Binance manual

export interface GatewaySeed {
  code: string
  name: string
  mfs: string
  category: GatewayCategory
  type: GatewayType
  accountType: GatewayAccountType
  color: string
  textColor?: string
  icon?: string
  sortOrder: number
  /** Distinct payment flow — drives the step-by-step instructions. */
  method: GatewayMethod
  /** QR code image can be uploaded/shown for this gateway (PipraPay `qr_code` field). */
  hasQr?: boolean
  /** Required credential fields for API-type gateways (PipraPay `fields()`). */
  apiFields?: string[]
  instructions?: string
}

interface MfsBrandDef {
  mfs: string
  name: string
  color: string
  icon: string
  ussd?: string
  /** accountType → method + QR availability (PipraPay 1-by-1). */
  tiers: Partial<Record<GatewayAccountType, { method: GatewayMethod; qr: boolean }>>
}

// ── BD MFS brands — each tier's flow read from the PipraPay module ──────────
const mfsBrands: MfsBrandDef[] = [
  {
    mfs: 'BKASH', name: 'bKash', color: '#E2136E', icon: 'bp', ussd: '*247#',
    tiers: {
      PERSONAL: { method: 'SEND_MONEY', qr: true },
      AGENT: { method: 'CASH_OUT', qr: true },
      MERCHANT: { method: 'MAKE_PAYMENT', qr: true },
    },
  },
  {
    mfs: 'NAGAD', name: 'Nagad', color: '#F6921E', icon: 'ng', ussd: '*167#',
    tiers: {
      PERSONAL: { method: 'SEND_MONEY', qr: false },
      AGENT: { method: 'CASH_OUT', qr: false },
      MERCHANT: { method: 'MAKE_PAYMENT', qr: true },
    },
  },
  {
    mfs: 'ROCKET', name: 'Rocket (DBBL)', color: '#8C3494', icon: 'rk', ussd: '*322#',
    tiers: {
      PERSONAL: { method: 'SEND_MONEY', qr: true },
      AGENT: { method: 'CASH_OUT', qr: true },
      MERCHANT: { method: 'MAKE_PAYMENT', qr: true },
    },
  },
  {
    mfs: 'UPAY', name: 'Upay', color: '#00A99D', icon: 'up', ussd: '*268#',
    tiers: {
      PERSONAL: { method: 'SEND_MONEY', qr: true },
      AGENT: { method: 'CASH_OUT', qr: true },
      MERCHANT: { method: 'MAKE_PAYMENT', qr: true },
    },
  },
  {
    mfs: 'TAP', name: 'Tap (Trust Axiata)', color: '#0A6EDE', icon: 'tp', ussd: '*221#',
    tiers: {
      PERSONAL: { method: 'SEND_MONEY', qr: false },
      AGENT: { method: 'CASH_OUT', qr: false },
      MERCHANT: { method: 'MAKE_PAYMENT', qr: true },
    },
  },
  {
    mfs: 'TELECASH', name: 'TeleCash (GP)', color: '#1B9AD2', icon: 'tc', ussd: '*322#',
    tiers: {
      PERSONAL: { method: 'SEND_MONEY', qr: true },
      AGENT: { method: 'CASH_OUT', qr: true },
      MERCHANT: { method: 'MAKE_PAYMENT', qr: true },
    },
  },
  {
    mfs: 'MCASH', name: 'mCash (IBBL)', color: '#00723F', icon: 'mc', ussd: '*248#',
    tiers: {
      PERSONAL: { method: 'SEND_MONEY', qr: true },
      AGENT: { method: 'CASH_OUT', qr: true },
      MERCHANT: { method: 'MAKE_PAYMENT', qr: true },
    },
  },
  {
    mfs: 'OKWALLET', name: 'OK Wallet', color: '#F1592A', icon: 'ok', ussd: '*225#',
    tiers: {
      PERSONAL: { method: 'SEND_MONEY', qr: true },
      AGENT: { method: 'CASH_OUT', qr: true },
      MERCHANT: { method: 'MAKE_PAYMENT', qr: true },
    },
  },
  {
    mfs: 'PATHAOPAY', name: 'Pathao Pay', color: '#E2151C', icon: 'pp',
    tiers: {
      PERSONAL: { method: 'SEND_MONEY', qr: true },
      MERCHANT: { method: 'PAYMENT', qr: true },
    },
  },
  {
    mfs: 'CELLFIN', name: 'CellFin (IBBL)', color: '#00693E', icon: 'cf',
    tiers: {
      PERSONAL: { method: 'FUND_TRANSFER', qr: false },
      MERCHANT: { method: 'FUND_TRANSFER', qr: true },
    },
  },
  {
    mfs: 'IPAY', name: 'iPay (City Bank)', color: '#019789', icon: 'ip',
    tiers: {
      PERSONAL: { method: 'SEND_MONEY', qr: false },
      MERCHANT: { method: 'MAKE_PAYMENT', qr: false },
    },
  },
  {
    mfs: 'SURECASH', name: 'SureCash', color: '#7C2582', icon: 'sc', ussd: '*269#',
    tiers: {
      PERSONAL: { method: 'SEND_MONEY', qr: false },
      AGENT: { method: 'CASH_OUT', qr: false },
    },
  },
  {
    mfs: 'MEGHNAPAY', name: 'Meghna Pay', color: '#00529B', icon: 'mp',
    tiers: {
      PERSONAL: { method: 'SEND_MONEY', qr: false },
      MERCHANT: { method: 'MAKE_PAYMENT', qr: false },
    },
  },
  {
    mfs: 'TRUSTMONEY', name: 'Trust Money', color: '#003B71', icon: 'tm',
    tiers: {
      PERSONAL: { method: 'SEND_MONEY', qr: false },
      MERCHANT: { method: 'MAKE_PAYMENT', qr: false },
    },
  },
  { mfs: 'DMONEY', name: 'dMoney', color: '#E4136E', icon: 'dm', tiers: { PERSONAL: { method: 'SEND_MONEY', qr: false } } },
  { mfs: 'AWALLET', name: 'A Wallet', color: '#6B2D8B', icon: 'aw', tiers: { PERSONAL: { method: 'SEND_MONEY', qr: false } } },
]

export const tierLabel: Record<GatewayAccountType, string> = {
  PERSONAL: 'Personal',
  AGENT: 'Agent',
  MERCHANT: 'Merchant',
}

export const tierHint: Record<GatewayAccountType, string> = {
  PERSONAL: 'Send Money to your personal number — the SIM receives an SMS and the panel verifies it automatically.',
  AGENT: 'Cash Out to your agent number — auto-verified from the agent app SMS.',
  MERCHANT: 'Pay via merchant number — payment-received SMS is captured and verified.',
}

const TIER_HINTS = new Set(Object.values(tierHint))

function buildMfsGateways(): GatewaySeed[] {
  const out: GatewaySeed[] = []
  let order = 10
  for (const b of mfsBrands) {
    for (const [tier, cfg] of Object.entries(b.tiers) as Array<[GatewayAccountType, { method: GatewayMethod; qr: boolean }]>) {
      const s = tierLabel[tier]
      out.push({
        code: `${b.mfs}_${tier}`,
        name: `${b.name} ${s}`,
        mfs: b.mfs,
        category: 'MFS',
        type: 'AUTOMATION',
        accountType: tier,
        color: b.color,
        icon: b.icon,
        sortOrder: order++,
        method: cfg.method,
        hasQr: cfg.qr,
        instructions: tierHint[tier],
      })
    }
  }
  return out
}

// ── Bank gateways ────────────────────────────────────────────────────────────
const bankGateways: GatewaySeed[] = [
  { code: 'BANK_TRANSFER', name: 'Bank Transfer', mfs: 'BANK', category: 'BANK', type: 'MANUAL', accountType: 'PERSONAL', color: '#475569', icon: 'bn', sortOrder: 200, method: 'BANK_TRANSFER', instructions: '1. Transfer the exact amount to the bank account shown\n2. Use your name as reference\n3. Submit the transaction reference below' },
  { code: 'ISLAMI_BANK', name: 'Islami Bank Bangladesh', mfs: 'BANK', category: 'BANK', type: 'MANUAL', accountType: 'PERSONAL', color: '#006B3F', icon: 'ib', sortOrder: 201, method: 'BANK_TRANSFER', instructions: '1. Transfer the exact amount to the Islami Bank account shown\n2. Use your name as reference\n3. Submit the transaction reference below' },
  { code: 'DBSL_BANK', name: 'Dutch-Bangla Bank', mfs: 'BANK', category: 'BANK', type: 'AUTOMATION', accountType: 'PERSONAL', color: '#00563F', icon: 'db', sortOrder: 202, method: 'BANK_TRANSFER', instructions: '1. Transfer via DBBL mobile banking (dial *322#) or internet banking\n2. Send the exact amount to the account shown\n3. The payment SMS verifies automatically' },
  { code: 'SSLCOMMERZ', name: 'SSLCommerz', mfs: 'BANK', category: 'BANK', type: 'API', accountType: 'MERCHANT', color: '#DA1F26', icon: 'ssl', sortOrder: 210, method: 'API_CHECKOUT', apiFields: ['store_id', 'store_password', 'product_category', 'mode'], instructions: 'You will be redirected to the secure SSLCommerz checkout to pay by card, net banking or wallet.' },
  { code: 'AAMARPAY', name: 'AamarPay', mfs: 'BANK', category: 'BANK', type: 'API', accountType: 'MERCHANT', color: '#F7941D', icon: 'am', sortOrder: 211, method: 'API_CHECKOUT', apiFields: ['store_id', 'signature_key', 'mode'], instructions: 'You will be redirected to the secure aamarPay checkout to complete the payment.' },
  { code: 'SHURJOPAY', name: 'ShurjoPay', mfs: 'BANK', category: 'BANK', type: 'API', accountType: 'MERCHANT', color: '#ED1C24', icon: 'sp', sortOrder: 212, method: 'API_CHECKOUT', apiFields: ['prefix', 'username', 'password', 'mode'], instructions: 'You will be redirected to the secure shurjoPay checkout to complete the payment.' },
  { code: 'PAYSTATION', name: 'PayStation', mfs: 'BANK', category: 'BANK', type: 'API', accountType: 'MERCHANT', color: '#351E53', icon: 'ps', sortOrder: 213, method: 'API_CHECKOUT', apiFields: ['merchant_id', 'merchant_password', 'checkout_items', 'pay_with_charge', 'mode'], instructions: 'You will be redirected to the secure PayStation checkout to complete the payment.' },
  { code: 'PORTWALLET', name: 'PortWallet', mfs: 'BANK', category: 'BANK', type: 'API', accountType: 'MERCHANT', color: '#0F4C81', icon: 'pw', sortOrder: 214, method: 'API_CHECKOUT', apiFields: ['invoice_username', 'api_token', 'mode'], instructions: 'You will be redirected to the secure PortWallet invoice page to complete the payment.' },
  { code: 'NEXPAY', name: 'NexusPay (DBBL)', mfs: 'BANK', category: 'BANK', type: 'AUTOMATION', accountType: 'PERSONAL', color: '#5B21B6', icon: 'nx', sortOrder: 215, method: 'BANK_TRANSFER', instructions: '1. Open NexusPay (DBBL) app\n2. Send the exact amount to the card/account shown\n3. The payment SMS verifies automatically' },
  { code: 'EPS', name: 'EPS Gateway', mfs: 'BANK', category: 'BANK', type: 'API', accountType: 'MERCHANT', color: '#EE2D42', icon: 'eps', sortOrder: 216, method: 'API_CHECKOUT', apiFields: ['merchant_id', 'store_id', 'username', 'password', 'hashkey', 'mode'], instructions: 'You will be redirected to the secure EPS checkout to complete the payment.' },
]

// ── Global PSPs / wallets / crypto ───────────────────────────────────────────
const globalGateways: GatewaySeed[] = [
  { code: 'STRIPE', name: 'Stripe (Card)', mfs: 'GLOBAL', category: 'GLOBAL', type: 'API', accountType: 'MERCHANT', color: '#635BFF', icon: 'st', sortOrder: 300, method: 'CARD', apiFields: ['secret_key', 'webhook_secret'], instructions: 'You will be redirected to the secure Stripe card checkout. Cards are charged and verified automatically.' },
  { code: 'PAYPAL_API', name: 'PayPal (API)', mfs: 'GLOBAL', category: 'GLOBAL', type: 'API', accountType: 'MERCHANT', color: '#003087', icon: 'py', sortOrder: 301, method: 'API_CHECKOUT', apiFields: ['client_id', 'client_secret', 'mode'], instructions: 'You will be redirected to the secure PayPal checkout to approve the payment.' },
  { code: 'PAYPAL', name: 'PayPal (Manual)', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'MERCHANT', color: '#253B80', icon: 'py', sortOrder: 302, method: 'MANUAL_TRANSFER', instructions: 'Send to the PayPal email shown, then submit the transaction ID below.' },
  { code: 'GOOGLE_PAY', name: 'Google Pay', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'MERCHANT', color: '#4285F4', icon: 'gp', sortOrder: 303, method: 'MANUAL_TRANSFER', instructions: 'Send via Google Pay to the UPI/handle shown, then submit the transaction ID below.' },
  { code: 'APPLE_PAY', name: 'Apple Pay', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'MERCHANT', color: '#000000', icon: 'ap', sortOrder: 304, method: 'MANUAL_TRANSFER', instructions: 'Pay via Apple Pay using the link/QR shown, then submit the transaction ID below.' },
  { code: 'SAMSUNG_PAY', name: 'Samsung Pay', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'MERCHANT', color: '#1428A0', icon: 'sp2', sortOrder: 305, method: 'MANUAL_TRANSFER', instructions: 'Send via Samsung Pay to the number shown, then submit the transaction ID below.' },
  { code: 'CARD_MANUAL', name: 'Credit / Debit Card', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'MERCHANT', color: '#1A1F36', icon: 'cd', sortOrder: 306, method: 'CARD', instructions: 'Enter your card details and press Pay — the payment is verified by the merchant.' },
  { code: 'BINANCE_PAY', name: 'Binance Pay', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'PERSONAL', color: '#F0B90B', icon: 'bp2', sortOrder: 307, method: 'MANUAL_TRANSFER', instructions: 'Transfer via Binance Pay to the Binance UID/QR shown, then submit the transaction ID below.' },
  { code: 'BINANCE_PERSONAL', name: 'Binance (Personal)', mfs: 'GLOBAL', category: 'GLOBAL', type: 'API', accountType: 'PERSONAL', color: '#F0B90B', icon: 'bp2', sortOrder: 308, method: 'API_CHECKOUT', apiFields: ['binance_uid', 'api_key', 'secret_key'], instructions: 'Scan the Binance Pay QR or send to the Binance UID shown. The payment is verified automatically.' },
  { code: 'NOWPAYMENTS', name: 'NOWPayments (Crypto)', mfs: 'GLOBAL', category: 'GLOBAL', type: 'API', accountType: 'MERCHANT', color: '#6C35C3', icon: 'np', sortOrder: 309, method: 'API_CHECKOUT', apiFields: ['api_key', 'ipn_secret_key', 'mode'], instructions: 'You will be redirected to the secure NOWPayments checkout to pay in crypto. IPN verifies automatically.' },
  { code: 'OXAPAY', name: 'OxaPay (Crypto)', mfs: 'GLOBAL', category: 'GLOBAL', type: 'API', accountType: 'MERCHANT', color: '#0BA7EA', icon: 'ox', sortOrder: 310, method: 'API_CHECKOUT', apiFields: ['api_key', 'fee_paid_by_payer', 'under_paid_coverage', 'mixed_payment', 'mode'], instructions: 'You will be redirected to the secure OxaPay checkout to pay in crypto. Webhook verifies automatically.' },
  { code: 'WISE', name: 'Wise', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'PERSONAL', color: '#9FE870', textColor: '#163300', icon: 'wi', sortOrder: 311, method: 'MANUAL_TRANSFER', instructions: 'Send to the Wise account shown, then submit the transaction ID below.' },
  { code: 'PAYONEER', name: 'Payoneer', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'PERSONAL', color: '#FF4800', icon: 'po', sortOrder: 312, method: 'MANUAL_TRANSFER', instructions: 'Send via Payoneer to the email shown, then submit the transaction ID below.' },
  { code: 'PAYEER', name: 'Payeer', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'PERSONAL', color: '#1B75BB', icon: 'pe', sortOrder: 313, method: 'MANUAL_TRANSFER', instructions: 'Transfer to the Payeer account ID shown, then submit the transaction ID below.' },
  { code: 'TAPTAP_SEND', name: 'TapTap Send', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'PERSONAL', color: '#03691F', icon: 'tts', sortOrder: 314, method: 'MANUAL_TRANSFER', instructions: 'Send via TapTap Send to the payout number shown, then submit the transaction ID below.' },
  // PipraPay parity: merchant API tiers of the big MFS brands
  { code: 'BKASH_TOKENIZED', name: 'bKash (Tokenized API)', mfs: 'BKASH', category: 'MFS', type: 'API', accountType: 'MERCHANT', color: '#E2136E', icon: 'bp', sortOrder: 320, method: 'API_CHECKOUT', apiFields: ['username', 'password', 'app_key', 'app_secret_key', 'mode', 'auto_refund'], instructions: 'The bKash tokenized checkout opens on this page — the customer pays with their bKash wallet and it verifies automatically.' },
  { code: 'NAGAD_MERCHANT_API', name: 'Nagad (Merchant API)', mfs: 'NAGAD', category: 'MFS', type: 'API', accountType: 'MERCHANT', color: '#F6921E', icon: 'ng', sortOrder: 321, method: 'API_CHECKOUT', apiFields: ['app_account', 'merchant_id', 'private_key', 'public_key', 'mode'], instructions: 'The Nagad merchant checkout opens on this page — the customer pays with their Nagad wallet and it verifies automatically.' },
  { code: 'PATHAOPAY_MERCHANT_API', name: 'PathaoPay (Merchant API)', mfs: 'PATHAOPAY', category: 'MFS', type: 'API', accountType: 'MERCHANT', color: '#E2151C', icon: 'pp', sortOrder: 322, method: 'API_CHECKOUT', apiFields: ['api_key', 'secret_key', 'mode'], instructions: 'The PathaoPay checkout opens on this page — the customer pays with their PathaoPay wallet and it verifies automatically.' },
]

export const GATEWAY_CATALOG: GatewaySeed[] = [
  ...buildMfsGateways(),
  ...bankGateways,
  ...globalGateways,
]

export const MFS_LIST = ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'TAP', 'TELECASH', 'MCASH', 'OKWALLET', 'PATHAOPAY', 'CELLFIN', 'IPAY', 'SURECASH', 'MEGHNAPAY', 'TRUSTMONEY', 'DMONEY', 'AWALLET', 'BANK', 'GLOBAL', 'OTHER']

export function gatewayColor(code?: string | null): string {
  if (!code) return '#2563EB'
  const g = GATEWAY_CATALOG.find((x) => x.code === code)
  return g?.color ?? '#2563EB'
}

export function mfsColor(mfs: string): string {
  const b = mfsBrands.find((x) => x.mfs === mfs)
  if (b) return b.color
  if (mfs === 'BANK') return '#475569'
  if (mfs === 'GLOBAL') return '#635BFF'
  return '#94A3B8'
}

export const MFS_COLORS: Record<string, string> = {
  BKASH: '#E2136E', NAGAD: '#F6921E', ROCKET: '#8C3494', UPAY: '#00A99D', TAP: '#0A6EDE',
  TELECASH: '#1B9AD2', MCASH: '#00723F', OKWALLET: '#F1592A', PATHAOPAY: '#E2151C',
  CELLFIN: '#00693E', IPAY: '#019789', SURECASH: '#7C2582', MEGHNAPAY: '#00529B',
  TRUSTMONEY: '#003B71', DMONEY: '#E4136E', AWALLET: '#6B2D8B', BANK: '#475569', GLOBAL: '#635BFF', OTHER: '#94A3B8',
}

/** Short 2-letter badge icon fallback for gateways/MFS. */
export function mfsShort(mfs: string): string {
  const map: Record<string, string> = {
    BKASH: 'বি', NAGAD: 'ন', ROCKET: 'র', UPAY: 'উ', TAP: 'T', TELECASH: 'T', MCASH: 'm',
    OKWALLET: 'OK', PATHAOPAY: 'P', CELLFIN: 'C', IPAY: 'i', SURECASH: 'S', MEGHNAPAY: 'M',
    TRUSTMONEY: 'T', DMONEY: 'd', AWALLET: 'A', BANK: 'B', GLOBAL: 'G', OTHER: '·',
  }
  return map[mfs] ?? mfs.slice(0, 2)
}

// ════════════════════════════════════════════════════════════════════════════
//  Per-gateway payment instructions — PipraPay-exact steps, EN + বাংলা.
//  Each MFS gateway family has its own flow (method + QR availability), read
//  1-by-1 from every PipraPay gateway module.
// ════════════════════════════════════════════════════════════════════════════

export type Lang = 'en' | 'bn'

export interface InstructionVars {
  /** Receiving number/account shown to the customer. */
  number?: string | null
  amount?: string | number | null
  currency?: string | null
  /** Extra value for manual flows (email / UID / account id …). */
  destination?: string | null
}

const METHOD_TEXT: Record<GatewayMethod, { en: string; bn: string }> = {
  SEND_MONEY: { en: 'Send Money', bn: '"Send Money" নির্বাচন করুন' },
  CASH_OUT: { en: 'Cash Out', bn: '"Cash Out" নির্বাচন করুন' },
  MAKE_PAYMENT: { en: 'Make Payment', bn: '"Make Payment" নির্বাচন করুন' },
  PAYMENT: { en: 'Payment', bn: '"Payment" নির্বাচন করুন' },
  FUND_TRANSFER: { en: 'Fund Transfer', bn: '"Fund Transfer" নির্বাচন করুন' },
  BANK_TRANSFER: { en: 'Bank Transfer', bn: 'ব্যাংক ট্রান্সফার' },
  CARD: { en: 'Card Payment', bn: 'কার্ড পেমেন্ট' },
  API_CHECKOUT: { en: 'Secure Checkout', bn: 'নিরাপদ চেকআউট' },
  MANUAL_TRANSFER: { en: 'Manual Transfer', bn: 'ম্যানুয়াল ট্রান্সফার' },
}

/** English label of the gateway's distinct payment method. */
export function methodLabelEn(method: GatewayMethod | string): string {
  return METHOD_TEXT[method as GatewayMethod]?.en ?? String(method)
}

/** Bangla label of the gateway's distinct payment method. */
export function methodLabelBn(method: GatewayMethod | string): string {
  return METHOD_TEXT[method as GatewayMethod]?.bn ?? String(method)
}

/** Resolve the MFS brand display name from a gateway seed/row. */
function brandDisplayName(mfs: string, name: string): string {
  const b = mfsBrands.find((x) => x.mfs === mfs)
  if (!b) return name
  return b.name.replace(/\s*\(.*\)$/, '') // "Rocket (DBBL)" → "Rocket"
}

/**
 * Build the PipraPay-exact step-by-step payment instructions for an MFS
 * gateway. Reproduces each module's lang_text 1:1:
 *   1. Go to your {Brand} Mobile App.
 *   2. Choose "{method}"
 *   2b. Choose "CellFin"            (CellFin only)
 *   3. Enter the Number: {number}
 *   4. Or Scan the QR Code          (only when the gateway has QR)
 *   5. Enter the Amount: {amount}
 *   6. Now enter your {Brand} PIN to confirm.
 *   7. Put the Transaction ID in the box below and press Verify
 */
function mfsSteps(
  method: GatewayMethod,
  brand: string,
  hasQr: boolean,
  v: InstructionVars,
  lang: Lang
): string[] {
  const isBn = lang === 'bn'
  const m = METHOD_TEXT[method]
  const steps: string[] = []
  steps.push(isBn ? `আপনার ${brand} মোবাইল অ্যাপে যান।` : `Go to your ${brand} Mobile App.`)
  steps.push(isBn ? m.bn : `Choose "${m.en}"`)
  if (method === 'FUND_TRANSFER') steps.push(isBn ? '"CellFin" নির্বাচন করুন' : 'Choose "CellFin"')
  steps.push(isBn ? `নম্বর লিখুন: ${v.number ?? ''}` : `Enter the Number: ${v.number ?? ''}`)
  if (hasQr) steps.push(isBn ? 'অথবা কিউআর কোড স্ক্যান করুন' : 'Or Scan the QR Code')
  steps.push(isBn ? `পরিমাণ লিখুন: ${v.amount ?? ''} ${v.currency ?? 'BDT'}` : `Enter the Amount: ${v.amount ?? ''} ${v.currency ?? 'BDT'}`)
  steps.push(isBn ? `এখন নিশ্চিত করতে আপনার ${brand} পিন লিখুন।` : `Now enter your ${brand} PIN to confirm.`)
  steps.push(isBn ? 'ট্রানজ্যাকশন আইডি নিচের বক্সে লিখুন এবং যাচাই করুন চাপুন।' : 'Put the Transaction ID in the box below and press Verify')
  return steps
}

/** Manual global flows (PayPal/Payoneer/Payeer/Wise/TapTap/Binance…) — PipraPay-exact texts. */
function manualSteps(code: string, v: InstructionVars, lang: Lang): string[] {
  const isBn = lang === 'bn'
  const dest = v.destination ?? v.number ?? ''
  const amt = `${v.amount ?? ''} ${v.currency ?? 'BDT'}`
  const final = isBn ? 'নিচের বক্সে ট্রানজ্যাকশন আইডি লিখুন এবং "Submit" চাপুন' : 'Enter the transaction ID in the box below and click "Submit"'
  const check = isBn ? 'সব তথ্য মিলিয়ে ট্রান্সফার নিশ্চিত করুন' : 'Check all details carefully and confirm the transfer'

  switch (code) {
    case 'PAYPAL':
      return [
        isBn ? 'আপনার PayPal মোবাইল অ্যাপ বা ওয়েবসাইটে যান' : 'Go to your PayPal Mobile App or Website',
        isBn ? '"Send Payment" নির্বাচন করুন' : 'Choose "Send Payment"',
        isBn ? `ইমেইল ঠিকানা লিখুন: "${dest}"` : `Enter the email address "${dest}"`,
        isBn ? `পরিমাণ লিখুন: ${amt}` : `Enter amount: ${amt}`,
        check,
        final,
      ]
    case 'PAYONEER':
      return [
        isBn ? 'আপনার Payoneer মোবাইল অ্যাপ বা ওয়েবসাইটে যান' : 'Go to your Payoneer Mobile App or Website',
        isBn ? '"Pay" এ ক্লিক করুন' : 'Click "Pay"',
        isBn ? '"Pay to a Payoneer recipient" নির্বাচন করুন' : 'Choose "Pay to a Payoneer recipient"',
        isBn ? `ইমেইল ঠিকানা লিখুন "${dest}"` : `Enter the email address "${dest}"`,
        isBn ? `পরিমাণ লিখুন: ${amt}` : `Enter amount: ${amt}`,
        check,
        final,
      ]
    case 'PAYEER':
      return [
        isBn ? 'Payeer.com এ লগ ইন করুন' : 'Log in to your Payeer account at Payeer.com',
        isBn ? '"Send Money" বা "Transfer" সেকশনে যান' : 'Go to the "Send Money" or "Transfer" section',
        isBn ? `প্রাপকের Payeer অ্যাকাউন্ট আইডি লিখুন: ${dest}` : `Enter the recipient's Payeer account ID: ${dest}`,
        isBn ? `পরিমাণ লিখুন: ${amt}` : `Enter the amount: ${amt}`,
        isBn ? 'কারেন্সি এবং ব্যালেন্স নির্বাচন করুন' : 'Select the currency and your Payeer balance to pay from',
        check,
        final,
      ]
    case 'WISE':
      return [
        isBn ? 'আপনার Wise মোবাইল অ্যাপ বা ওয়েবসাইটে যান' : 'Go to your Wise Mobile App or Website',
        isBn ? '"Send" এ ক্লিক করুন' : 'Click "Send"',
        isBn ? `কারেন্সি নির্বাচন করুন "${v.currency ?? 'BDT'}"` : `Choose Currency "${v.currency ?? 'BDT'}"`,
        isBn ? `পরিমাণ লিখুন: ${amt}` : `Enter amount: ${amt}`,
        isBn ? `প্রাপকের Wise অ্যাকাউন্ট লিখুন: ${dest}` : `Enter the recipient's Wise account: ${dest}`,
        check,
        final,
      ]
    case 'TAPTAP_SEND':
      return [
        isBn ? 'আপনার TapTap Send মোবাইল অ্যাপে যান' : 'Go to your TapTap Send Mobile App',
        isBn ? 'প্রাপকের দেশ নির্বাচন করুন' : 'Choose the recipient country',
        isBn ? `পরিমাণ লিখুন: ${amt}` : `Enter amount: ${amt}`,
        isBn ? 'প্রাপকের পেআউট মাধ্যম নির্বাচন করুন' : 'Choose the recipient payout method',
        isBn ? `প্রাপকের পেআউট নম্বর লিখুন: ${dest}` : `Enter the recipient payout number: ${dest}`,
        check,
        final,
      ]
    case 'BINANCE_PAY':
    case 'BINANCE_PERSONAL':
      return [
        isBn ? 'আপনার Binance মোবাইল অ্যাপ বা ওয়েবসাইটে যান' : 'Go to your Binance Mobile App or Website',
        isBn ? '"Send to Binance user" নির্বাচন করুন' : 'Choose "Send to Binance user"',
        isBn ? `Binance UID লিখুন "${dest}"` : `Enter the Binance UID "${dest}"`,
        isBn ? 'অথবা কিউআর কোড স্ক্যান করুন' : 'Or scan the QR Code',
        isBn ? `পরিমাণ লিখুন: ${amt}` : `Enter amount: ${amt}`,
        check,
        final,
      ]
    case 'GOOGLE_PAY':
    case 'APPLE_PAY':
    case 'SAMSUNG_PAY':
      return [
        isBn ? 'আপনার ফোনে সংশ্লিষ্ট পেমেন্ট অ্যাপটি খুলুন' : 'Open the matching payment app on your phone',
        isBn ? `নম্বর/হ্যান্ডেলে পাঠান: ${dest}` : `Send to the number/handle: ${dest}`,
        isBn ? `পরিমাণ লিখুন: ${amt}` : `Enter amount: ${amt}`,
        check,
        final,
      ]
    default:
      return [
        isBn ? 'উপরে দেখানো অ্যাকাউন্টে সঠিক পরিমাণ পাঠান' : 'Send the exact amount to the account shown above',
        check,
        final,
      ]
  }
}

function apiSteps(name: string, lang: Lang): string[] {
  const isBn = lang === 'bn'
  return isBn
    ? [
        `1. ${name} নির্বাচন করে Pay চাপুন`,
        `2. পেমেন্ট সম্পন্ন করতে আপনি ${name} এর নিরাপদ পেজে যাবেন`,
        '3. পেমেন্ট স্বয়ংক্রিয়ভাবে যাচাই হবে',
      ]
    : [
        `1. Choose ${name} and press Pay`,
        `2. You will be redirected to the secure ${name} page to complete the payment`,
        '3. The payment is verified automatically',
      ]
}

export interface InstructionGateway {
  code?: string | null
  mfs?: string | null
  name?: string | null
  accountType?: string | null
  type?: string | null
  method?: GatewayMethod | string | null
  hasQr?: boolean | null
  /** Admin-authored override (used as-is for EN; BN falls back to templates). */
  instructions?: string | null
}

/**
 * Full step-by-step instructions for a gateway in the requested language.
 * MFS gateways get the PipraPay-exact per-brand flow; manual global gateways
 * get their own flow; API gateways get a redirect flow. The customer-facing
 * numbered list is returned (one string per step, no numbering).
 */
export function gatewayInstructions(
  gw: InstructionGateway,
  lang: Lang,
  vars: InstructionVars = {}
): string[] {
  const code = gw.code ?? ''
  const mfs = (gw.mfs ?? '').toUpperCase()
  const type = (gw.type ?? '').toUpperCase()
  const method = (gw.method ?? '') as GatewayMethod

  if (type === 'API' || method === 'API_CHECKOUT') {
    return apiSteps(gw.name ?? 'the gateway', lang)
  }

  // MFS + bank automation families → PipraPay step flow
  const isMfsLike = ['SEND_MONEY', 'CASH_OUT', 'MAKE_PAYMENT', 'PAYMENT', 'FUND_TRANSFER'].includes(method)
  if (isMfsLike) {
    const brand = brandDisplayName(mfs, gw.name ?? '')
    const steps = mfsSteps(method, brand, gw.hasQr ?? false, vars, lang)
    if (lang === 'bn') return steps
    // EN: honour a genuine admin override, but ignore the seeded tier hint
    const ov = gw.instructions?.trim()
    if (ov && ov.length > 3 && !TIER_HINTS.has(ov)) {
      return ov
        .split('\n')
        .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
        .filter(Boolean)
    }
    return steps
  }

  // Manual global flows
  if (method === 'MANUAL_TRANSFER') return manualSteps(code, vars, lang)

  // Cards
  if (method === 'CARD' || code === 'CARD_MANUAL' || code === 'STRIPE') {
    return lang === 'bn'
      ? ['কার্ড নম্বর ও তথ্য দিন এবং Pay চাপুন', 'পেমেন্ট মার্চেন্ট দ্বারা যাচাই করা হবে']
      : ['Enter your card details and press Pay', 'The payment is verified by the merchant']
  }

  // Bank transfer
  if (lang === 'bn') {
    return [
      'উপরে দেখানো ব্যাংক অ্যাকাউন্টে সঠিক পরিমাণ ট্রান্সফার করুন',
      'রেফারেন্স হিসেবে আপনার নাম ব্যবহার করুন',
      'নিচে ট্রানজ্যাকশন রেফারেন্স জমা দিন',
    ]
  }
  if (gw.instructions && gw.instructions.trim()) {
    return gw.instructions
      .split('\n')
      .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter(Boolean)
  }
  return [
    'Transfer the exact amount to the bank account shown above',
    'Use your name as the reference',
    'Submit the transaction reference below',
  ]
}


