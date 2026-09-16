/**
 * Invokeil Pay — Incoming-SMS parser
 * Detects "money received" SMS from Bangladeshi MFS providers + banks,
 * tolerating Bangla digits and formatting variants.
 */

export type ParsedMfs = 'BKASH' | 'NAGAD' | 'ROCKET' | 'UPAY' | 'BANK' | 'OTHER'

export type ParsedMethod =
  | 'WALLET'
  | 'BANK_TRANSFER'
  | 'GOOGLE_PAY'
  | 'APPLE_PAY'
  | 'SAMSUNG_PAY'
  | 'CARD'

export interface ParsedSms {
  mfs: ParsedMfs
  method: ParsedMethod
  bankName?: string
  amount: number
  fee?: number
  balance?: number
  senderNumber?: string
  senderName?: string
  trxId?: string
}

// Bangla digit normalization: ০১২৩৪৫৬৭৮৯ → 0-9 (also Arabic-Indic ٠-٩)
const DIGIT_MAP: Record<string, string> = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
}

export function normalizeDigits(text: string): string {
  return text.replace(/[০-৯٠-٩]/g, (d) => DIGIT_MAP[d] ?? d)
}

function toNumber(raw: string): number {
  return parseFloat(raw.replace(/,/g, ''))
}

const AMOUNT = '(?:Tk|TK|BDT|Rs)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)'
const PHONE = '((?:\\+?88)?01[3-9][0-9]{8})'

/** Guess MFS from SMS sender ID (pdu origin). */
export function detectMfsFromSender(sender: string): ParsedMfs | null {
  const s = sender.toUpperCase().replace(/\s+/g, '')
  if (s.includes('BKASH') || s === '16247') return 'BKASH'
  if (s.includes('NAGAD') || s === '16167') return 'NAGAD'
  if (s.includes('ROCKET') || s.includes('DBBL') || s === '8446') return 'ROCKET'
  if (s.includes('UPAY')) return 'UPAY'
  if (/(BANK|BANKING|FINANCE|BRAC|DBBL|DUTCH|CITYBANK|EBL|CBL|ISLAMI|SONALI|JANATA|AGRANI|MTB|PRIME|TRUST|UDBL|CIB|BKASHED)/.test(s)) return 'BANK'
  return null
}

function detectMethod(text: string): { method: ParsedMethod; bankName?: string } {
  const t = text.toLowerCase()
  if (/google\s*pay|\bgpay\b/.test(t)) return { method: 'GOOGLE_PAY' }
  if (/apple\s*pay/.test(t)) return { method: 'APPLE_PAY' }
  if (/samsung\s*pay/.test(t)) return { method: 'SAMSUNG_PAY' }
  if (/(visa|mastercard|amex|card\s*(purchase|payment)|pos)/.test(t)) return { method: 'CARD' }
  if (/(beftn|npsb|rtgs|eftn|fund\s*transfer|account\s*credit|a\/c\s*credit|bank\s*transfer)/.test(t)) return { method: 'BANK_TRANSFER' }
  return { method: 'WALLET' }
}

const BANK_NAMES =
  'BRAC\\s*Bank|Dutch[-\\s]?Bangla\\s*Bank|DBBL|City\\s*Bank|Eastern\\s*Bank|EBL|Islami\\s*Bank|IBBL|Sonali\\s*Bank|Janata\\s*Bank|Agrani\\s*Bank|MTB|Mutual\\s*Trust|Prime\\s*Bank|Trust\\s*Bank|UCB|Uttara\\s*Bank|Pubali\\s*Bank|Standard\\s*Chartered|SCB|HSBC|Bank\\s*Asia|One\\s*Bank|Midland\\s*Bank|Shahjalal\\s*Bank|Exim\\s*Bank|Al[-\\s]?Arafah'

/**
 * Parse an SMS body; returns null when it is NOT a money-received SMS.
 */
export function parseReceivedSms(
  rawBody: string,
  smsSender?: string
): ParsedSms | null {
  const body = normalizeDigits(rawBody).replace(/\s+/g, ' ').trim()
  const lower = body.toLowerCase()

  // Only credit-type SMS
  const isCredit =
    /(you have received|money received|payment received|received tk|received bdt|credited to|has been credited|cash in successful|deposit successful|received money)/.test(
      lower
    )
  // Explicit debit types we must ignore
  const isDebit =
    /(you have sent|payment successful|send money|cash out|paid to|purchase|bill pay|withdraw|debited|payment of tk)/.test(
      lower
    )
  if (!isCredit || isDebit) return null

  const senderId = (smsSender || '').toUpperCase()
  let mfs: ParsedMfs = detectMfsFromSender(senderId) ?? 'OTHER'

  const { method: methodFromBody, bankName } = detectMethod(body)

  // ── amount ────────────────────────────────────────────────────────────────
  let amount: number | undefined
  const amountPatterns = [
    new RegExp(`received\\s*(?:Tk|TK|BDT)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`, 'i'),
    new RegExp(`Money\\s*Received[^0-9]{0,20}${AMOUNT}`, 'i'),
    new RegExp(`Amount\\s*[:=]\\s*(?:Tk|TK|BDT)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`, 'i'),
    new RegExp(`(?:credited|deposited)[^0-9]{0,40}(?:Tk|TK|BDT)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`, 'i'),
    new RegExp(`${AMOUNT}\\s*(?:has been credited|credited to|received)`, 'i'),
    new RegExp(`Balance\\s*[:=]\\s*(?:Tk|TK|BDT)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`, 'i'),
  ]
  for (const p of amountPatterns) {
    const m = body.match(p)
    if (m) { amount = toNumber(m[1]); break }
  }
  if (amount === undefined || Number.isNaN(amount) || amount <= 0) return null

  // ── sender (payer) number / name ─────────────────────────────────────────
  let senderNumber: string | undefined
  let senderName: string | undefined
  const fromPhone = body.match(new RegExp(`from\\s*${PHONE}`, 'i'))
    ?? body.match(new RegExp(`Sender\\s*[:=]\\s*${PHONE}`, 'i'))
    ?? body.match(new RegExp(`${PHONE}`))
  if (fromPhone) {
    senderNumber = fromPhone[1].replace(/^\+?88/, '')
  }
  const fromName = body.match(/from\s+([A-Za-z][A-Za-z0-9 .&'-]{2,30}?)(?:[.,]|Balance|Ref|Fee|Trx|Txn|Amount|$)/i)
  if (!fromPhone && fromName) senderName = fromName[1].trim()

  // ── trx id ────────────────────────────────────────────────────────────────
  let trxId: string | undefined
  const trxPatterns = [
    new RegExp(`TrxID\\s*[:#=]?\\s*([A-Za-z0-9]{6,24})`, 'i'),
    new RegExp(`TrxId\\s*[:#=]?\\s*([A-Za-z0-9]{6,24})`, 'i'),
    new RegExp(`TxnId\\s*[:#=]?\\s*([A-Za-z0-9]{6,24})`, 'i'),
    new RegExp(`Txn\\s*ID\\s*[:#=]?\\s*([A-Za-z0-9]{6,24})`, 'i'),
    new RegExp(`(?:Ref|UTR|TxnNo|TrxNo)\\s*[:#=]?\\s*([A-Za-z0-9]{6,24})`, 'i'),
  ]
  for (const p of trxPatterns) {
    const m = body.match(p)
    if (m) { trxId = m[1]; break }
  }

  // ── fee & balance ─────────────────────────────────────────────────────────
  let fee: number | undefined
  let balance: number | undefined
  const feeM = body.match(/Fee\s*[:=]?\s*(?:Tk|TK|BDT)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i)
  if (feeM) fee = toNumber(feeM[1])
  const balM = body.match(/Balance\s*[:=]?\s*(?:Tk|TK|BDT)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i)
  if (balM) balance = toNumber(balM[1])

  // ── decide MFS / method ───────────────────────────────────────────────────
  if (mfs === 'OTHER') {
    if (/bkash/.test(lower)) mfs = 'BKASH'
    else if (/nagad/.test(lower)) mfs = 'NAGAD'
    else if (/rocket|dbbl/.test(lower)) mfs = 'ROCKET'
    else if (/upay/.test(lower)) mfs = 'UPAY'
    else if (/(bank|beftn|npsb|rtgs|a\/c|account|credited to)/.test(lower)) mfs = 'BANK'
  }

  let method: ParsedMethod = methodFromBody
  if (mfs !== 'BANK' && method === 'WALLET') method = 'WALLET'
  if (mfs === 'BANK' && method === 'WALLET') method = 'BANK_TRANSFER'

  const bankMatch = body.match(new RegExp(`(?:${BANK_NAMES})`, 'i'))
  const resolvedBank = bankName ?? (bankMatch ? bankMatch[0] : undefined)

  return {
    mfs,
    method,
    bankName: mfs === 'BANK' ? resolvedBank : undefined,
    amount,
    fee,
    balance,
    senderNumber,
    senderName,
    trxId,
  }
}

/** Sample SMS bodies for the demo-simulator / docs. */
export const SAMPLE_SMS: Array<{ sender: string; body: string; mfs: ParsedMfs }> = [
  {
    mfs: 'BKASH',
    sender: 'bKash',
    body: 'You have received Tk 1,500.00 from 01712345678. Ref None. Fee Tk 0.00. Balance Tk 25,430.50. TrxID 8G7A6B5C4D at 12/09/2026 10:24',
  },
  {
    mfs: 'NAGAD',
    sender: 'NAGAD',
    body: 'Money Received! Amount: Tk 750.50 Sender: 01898765432 Ref: INV-102 Balance: Tk 9,120.75 TrxID: 4NF9K2QW7P at 12/09/2026 10:31',
  },
  {
    mfs: 'ROCKET',
    sender: '8446',
    body: 'You have received Tk 320.00 from 01812345678. TxnId: 992F1B4477. Balance: Tk 3,204.11',
  },
  {
    mfs: 'UPAY',
    sender: 'UPAY',
    body: 'You have received Tk 99.00 from 01611223344. Fee Tk 0.00. Balance Tk 1,410.00. TrxID UP99A1B2C3 at 12/09/2026 10:40',
  },
  {
    mfs: 'BANK',
    sender: 'BRACBank',
    body: 'Txn of BDT 12,000.00 credited to A/C **4432 via BEFTN from 01712009988. Ref: FTN229911. Balance: BDT 84,000.00',
  },
  {
    mfs: 'BANK',
    sender: 'CityBank',
    body: 'You have received BDT 2,499.00 via Google Pay on your A/C **7781. UTR: CBL9X8Y7Z6. Balance BDT 31,200.00',
  },
  {
    mfs: 'BKASH',
    sender: 'bKash',
    body: 'আপনি ০১৭১২৩৪৫৬৭৮ থেকে ৫০০.০০ টাকা পেয়েছেন। ব্যালেন্স Tk 5,000.00. TrxID 3BNG99X',
  },
]
