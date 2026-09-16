// ── Invokeil Pay — Gateway Catalog (PipraPay/Ownpay-class) ──────────────────
// ~50 gateways: BD MFS (Personal/Agent/Merchant tiers), banks, global PSPs.
// Each entry seeds the Gateway table; admin can edit every field in-panel.

export interface GatewaySeed {
  code: string
  name: string
  mfs: string
  category: 'MFS' | 'BANK' | 'GLOBAL'
  type: 'AUTOMATION' | 'MANUAL' | 'API'
  accountType: 'PERSONAL' | 'AGENT' | 'MERCHANT'
  color: string
  textColor?: string
  icon?: string
  sortOrder: number
  instructions?: string
}

const mfsBrands: Array<{
  mfs: string
  name: string
  color: string
  icon: string
  types: Array<'PERSONAL' | 'AGENT' | 'MERCHANT'>
  ussd?: string
}> = [
  { mfs: 'BKASH', name: 'bKash', color: '#E2136E', icon: 'bp', types: ['PERSONAL', 'AGENT', 'MERCHANT'], ussd: '*247#' },
  { mfs: 'NAGAD', name: 'Nagad', color: '#F6921E', icon: 'ng', types: ['PERSONAL', 'AGENT', 'MERCHANT'], ussd: '*167#' },
  { mfs: 'ROCKET', name: 'Rocket (DBBL)', color: '#8C3494', icon: 'rk', types: ['PERSONAL', 'AGENT', 'MERCHANT'], ussd: '*322#' },
  { mfs: 'UPAY', name: 'Upay', color: '#00A99D', icon: 'up', types: ['PERSONAL', 'AGENT', 'MERCHANT'], ussd: '*268#' },
  { mfs: 'TAP', name: 'Tap (Trust Axiata)', color: '#0A6EDE', icon: 'tp', types: ['PERSONAL', 'AGENT', 'MERCHANT'], ussd: '*221#' },
  { mfs: 'TELECASH', name: 'TeleCash (GP)', color: '#1B9AD2', icon: 'tc', types: ['PERSONAL', 'AGENT', 'MERCHANT'], ussd: '*322#' },
  { mfs: 'MCASH', name: 'mCash (IBBL)', color: '#00723F', icon: 'mc', types: ['PERSONAL', 'AGENT', 'MERCHANT'], ussd: '*248#' },
  { mfs: 'OKWALLET', name: 'OK Wallet', color: '#F1592A', icon: 'ok', types: ['PERSONAL', 'AGENT', 'MERCHANT'], ussd: '*225#' },
  { mfs: 'PATHAOPAY', name: 'Pathao Pay', color: '#E2151C', icon: 'pp', types: ['PERSONAL', 'MERCHANT'] },
  { mfs: 'CELLFIN', name: 'CellFin (IBBL)', color: '#00693E', icon: 'cf', types: ['PERSONAL', 'MERCHANT'] },
  { mfs: 'IPAY', name: 'iPay (City Bank)', color: '#0E4C92', icon: 'ip', types: ['PERSONAL', 'MERCHANT'] },
  { mfs: 'SURECASH', name: 'SureCash', color: '#7C2582', icon: 'sc', types: ['PERSONAL', 'AGENT'] },
  { mfs: 'MEGHNAPAY', name: 'Meghna Pay', color: '#00529B', icon: 'mp', types: ['PERSONAL', 'MERCHANT'] },
  { mfs: 'TRUSTMONEY', name: 'Trust Money', color: '#003B71', icon: 'tm', types: ['PERSONAL', 'MERCHANT'] },
  { mfs: 'DMONEY', name: 'dMoney', color: '#E4136E', icon: 'dm', types: ['PERSONAL'] },
  { mfs: 'AWALLET', name: 'A Wallet', color: '#6B2D8B', icon: 'aw', types: ['PERSONAL'] },
]

const suffix: Record<'PERSONAL' | 'AGENT' | 'MERCHANT', { label: string; hint: string }> = {
  PERSONAL: { label: 'Personal', hint: 'Send Money to your personal number — the SIM receives an SMS and the panel verifies it automatically.' },
  AGENT: { label: 'Agent', hint: 'Cash Out / send to your agent number — auto-verified from the agent app SMS.' },
  MERCHANT: { label: 'Merchant', hint: 'Pay via merchant number — payment-received SMS is captured and verified.' },
}

function buildMfsGateways(): GatewaySeed[] {
  const out: GatewaySeed[] = []
  let order = 10
  for (const b of mfsBrands) {
    for (const t of b.types) {
      const s = suffix[t]
      out.push({
        code: `${b.mfs}_${t}`,
        name: `${b.name} ${s.label}`,
        mfs: b.mfs,
        category: 'MFS',
        type: 'AUTOMATION',
        accountType: t,
        color: b.color,
        icon: b.icon,
        sortOrder: order++,
        instructions:
          b.ussd
            ? `1. Open your ${b.name} app or dial ${b.ussd}\n2. Choose Send Money and enter the number shown above\n3. Send the exact amount and confirm with your PIN\n4. Come back here and tap "I have sent the money"`
            : `1. Open the ${b.name} app\n2. Send exactly the amount shown above\n3. Confirm and return to this page`,
      })
    }
  }
  return out
}

const bankGateways: GatewaySeed[] = [
  { code: 'BANK_TRANSFER', name: 'Bank Transfer', mfs: 'BANK', category: 'BANK', type: 'MANUAL', accountType: 'PERSONAL', color: '#475569', icon: 'bn', sortOrder: 200, instructions: '1. Transfer the exact amount to the bank account shown\n2. Use your name as reference\n3. Submit the transaction reference below' },
  { code: 'SSLCOMMERZ', name: 'SSLCommerz', mfs: 'BANK', category: 'BANK', type: 'API', accountType: 'MERCHANT', color: '#DA1F26', icon: 'ssl', sortOrder: 201 },
  { code: 'AAMARPAY', name: 'AamarPay', mfs: 'BANK', category: 'BANK', type: 'API', accountType: 'MERCHANT', color: '#F7941D', icon: 'am', sortOrder: 202 },
  { code: 'SHURJOPAY', name: 'ShurjoPay', mfs: 'BANK', category: 'BANK', type: 'API', accountType: 'MERCHANT', color: '#ED1C24', icon: 'sp', sortOrder: 203 },
  { code: 'PAYSTATION', name: 'PayStation', mfs: 'BANK', category: 'BANK', type: 'API', accountType: 'MERCHANT', color: '#0C7C59', icon: 'ps', sortOrder: 204 },
  { code: 'PORTWALLET', name: 'PortWallet', mfs: 'BANK', category: 'BANK', type: 'API', accountType: 'MERCHANT', color: '#0F4C81', icon: 'pw', sortOrder: 205 },
  { code: 'NEXUSPAY', name: 'NexusPay (DBBL)', mfs: 'BANK', category: 'BANK', type: 'AUTOMATION', accountType: 'PERSONAL', color: '#8C3494', icon: 'nx', sortOrder: 206 },
]

const globalGateways: GatewaySeed[] = [
  { code: 'STRIPE', name: 'Stripe (Card)', mfs: 'GLOBAL', category: 'GLOBAL', type: 'API', accountType: 'MERCHANT', color: '#635BFF', icon: 'st', sortOrder: 300 },
  { code: 'PAYPAL', name: 'PayPal', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'MERCHANT', color: '#003087', icon: 'py', sortOrder: 301 },
  { code: 'GOOGLE_PAY', name: 'Google Pay', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'MERCHANT', color: '#4285F4', icon: 'gp', sortOrder: 302 },
  { code: 'APPLE_PAY', name: 'Apple Pay', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'MERCHANT', color: '#000000', icon: 'ap', sortOrder: 303 },
  { code: 'SAMSUNG_PAY', name: 'Samsung Pay', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'MERCHANT', color: '#1428A0', icon: 'sp2', sortOrder: 304 },
  { code: 'CARD_MANUAL', name: 'Credit / Debit Card', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'MERCHANT', color: '#1A1F36', icon: 'cd', sortOrder: 305 },
  { code: 'BINANCE_PAY', name: 'Binance Pay', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'PERSONAL', color: '#F0B90B', icon: 'bp2', sortOrder: 306 },
  { code: 'NOWPAYMENTS', name: 'NOWPayments (Crypto)', mfs: 'GLOBAL', category: 'GLOBAL', type: 'API', accountType: 'MERCHANT', color: '#1B6C5F', icon: 'np', sortOrder: 307 },
  { code: 'OXAPAY', name: 'OxaPay (Crypto)', mfs: 'GLOBAL', category: 'GLOBAL', type: 'API', accountType: 'MERCHANT', color: '#0BA7EA', icon: 'ox', sortOrder: 308 },
  { code: 'WISE', name: 'Wise', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'PERSONAL', color: '#9FE870', textColor: '#163A00', icon: 'wi', sortOrder: 309 },
  { code: 'PAYONEER', name: 'Payoneer', mfs: 'GLOBAL', category: 'GLOBAL', type: 'MANUAL', accountType: 'PERSONAL', color: '#FF4800', icon: 'po', sortOrder: 310 },
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
  CELLFIN: '#00693E', IPAY: '#0E4C92', SURECASH: '#7C2582', MEGHNAPAY: '#00529B',
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
