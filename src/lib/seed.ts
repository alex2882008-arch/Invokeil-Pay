import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { GATEWAY_CATALOG } from '@/lib/gateways'
import { WORKFLOW_TEMPLATES } from '@/lib/automation-engine'
import { generateEmailCatalog } from '@/lib/email-catalog'
import { ensureDefaultRiskRules } from '@/lib/risk-engine'
import type { User, Device } from '@prisma/client'

/**
 * Demo-data engine v2 — fills EVERY module with realistic, REMOVABLE data.
 * - seedDemoData(): users, gateways, devices+balances, 7 days of SMS→transactions,
 *   customers, checkouts, payment links, invoices+items, stores+API keys,
 *   webhook endpoints+deliveries, FAQ, activities, login attempts.
 * - clearDemoData(): wipes everything except the admin account + gateway catalog.
 * Nothing is hardcoded in UI components — everything lives in the DB.
 */

const DEMO_FLAG = 'demoSeeded'

function randPhone(): string {
  const prefixes = ['017', '018', '019', '016', '015', '013']
  return prefixes[Math.floor(Math.random() * prefixes.length)] + String(Math.floor(10000000 + Math.random() * 89999999))
}

function randTrxId(len = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const FIRST = ['Rakib', 'Sohel', 'Nayeem', 'Tanvir', 'Jubayer', 'Shakil', 'Rasel', 'Mizan', 'Fahim', 'Asif']
const LAST = ['Hasan', 'Islam', 'Ahmed', 'Khan', 'Mahmud', 'Uddin', 'Rahman', 'Chowdhury']

function randName(): string {
  return `${FIRST[Math.floor(Math.random() * FIRST.length)]} ${LAST[Math.floor(Math.random() * LAST.length)]}`
}

function atDay(daysAgo: number, hour: number, minute = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, minute, Math.floor(Math.random() * 59), 0)
  return d
}

const BKASH_BODIES = (amt: number, phone: string, trx: string, balance: number) =>
  `You have received Tk ${amt.toFixed(2)} from ${phone}. Ref None. Fee Tk 0.00. Balance Tk ${balance.toFixed(2)}. TrxID ${trx}`
const NAGAD_BODIES = (amt: number, phone: string, trx: string, balance: number) =>
  `Money Received! Amount: Tk ${amt.toFixed(2)} Sender: ${phone} Ref: ${randTrxId(6)} Balance: Tk ${balance.toFixed(2)} TrxID: ${trx}`
const ROCKET_BODIES = (amt: number, phone: string, trx: string, balance: number) =>
  `You have received Tk${amt.toFixed(2)} from ${phone}. TxnId: ${trx}. Balance: Tk${balance.toFixed(2)}`
const UPAY_BODIES = (amt: number, phone: string, trx: string, balance: number) =>
  `You have received Tk ${amt.toFixed(2)} from ${phone}. Fee Tk 0.00. Balance Tk ${balance.toFixed(2)}. TrxID ${trx}`
const BANK_BODIES = (amt: number, phone: string, trx: string, balance: number) =>
  `Txn of BDT ${amt.toFixed(2)} credited to A/C **4432 via BEFTN from ${phone}. Ref: ${trx}. Balance: BDT ${balance.toFixed(2)}`
const GPAY_BODIES = (amt: number, trx: string, balance: number) =>
  `You have received BDT ${amt.toFixed(2)} via Google Pay on your A/C **7781. UTR: ${trx}. Balance BDT ${balance.toFixed(2)}`

const NOISE_SMS: Array<[string, string]> = [
  ['bKash', 'You have sent Tk 250.00 to 01811223344. Fee Tk 5.00. Balance Tk 4,320.50. TrxID 9KK11A2B3C'],
  ['NAGAD', 'Your Nagad account balance is Tk 1,204.75 as at 11/09/2026.'],
  ['GP', 'Stay connected! Dial *566# to check your remaining internet balance. Robotic charge may apply.'],
  ['bKash', 'Payment of Tk 99.00 to MERCHANT XYZ was successful. TrxID 8PMT77AABB at 10:44'],
  ['internet.org', 'Your 30 day 12GB pack expires on 20/09/2026. Balance 8.2GB. Recharge *8444*88#.'],
]

const AMOUNTS = [99, 149, 199, 250, 320, 450, 500, 550, 649, 750, 800, 990, 1200, 1500, 1990, 2500, 5000, 12000]

async function seedGateways() {
  const count = await db.gateway.count()
  if (count === 0) {
    await db.gateway.createMany({
      data: GATEWAY_CATALOG.map((g) => ({
        code: g.code, name: g.name, mfs: g.mfs, category: g.category, type: g.type,
        accountType: g.accountType, color: g.color, textColor: g.textColor ?? '#FFFFFF',
        icon: g.icon ?? null, sortOrder: g.sortOrder, instructions: g.instructions ?? null,
        enabled: false,
      })),
    })
  }
  // Demo config: enable the BD core + set demo numbers & charges
  const demoNumbers: Record<string, string> = {
    BKASH_PERSONAL: '01711-000111', NAGAD_PERSONAL: '01811-000222',
    ROCKET_PERSONAL: '01911-033344', UPAY_PERSONAL: '01611-000444',
    BKASH_AGENT: '01711-000112', NAGAD_MERCHANT: '01811-000223',
  }
  for (const [code, num] of Object.entries(demoNumbers)) {
    await db.gateway.updateMany({ where: { code }, data: { enabled: true, accountNumber: num } })
  }
  await db.gateway.updateMany({
    where: { code: { in: ['BANK_TRANSFER', 'GOOGLE_PAY', 'APPLE_PAY', 'CARD_MANUAL'] } },
    data: { enabled: true },
  })
  await db.gateway.updateMany({
    where: { code: { in: ['BKASH_MERCHANT', 'NAGAD_PERSONAL'] } },
    data: { chargePercent: 1.5 },
  })
  await db.gateway.updateMany({
    where: { code: 'BKASH_PERSONAL' },
    data: { chargeFixed: 0, minAmount: 20, maxAmount: 25000 },
  })
}

export async function seedDemoData(): Promise<void> {
  await seedGateways()

  // ── Users ──────────────────────────────────────────────────────────────────
  const admin = await db.user.upsert({
    where: { email: 'admin@admin.com' },
    update: { twoFaEnabled: false, twoFaSecret: null, active: true },
    create: { email: 'admin@admin.com', name: 'Panel Admin', passwordHash: hashPassword('12345678'), role: 'ADMIN' },
  })
  const agentData = [
    { email: 'rakib@invokeilpay.com', name: 'Rakib Hasan' },
    { email: 'sohel@invokeilpay.com', name: 'Sohel Rana' },
  ]
  const agents: User[] = []
  for (const a of agentData) {
    agents.push(
      await db.user.upsert({
        where: { email: a.email },
        update: {},
        create: { email: a.email, name: a.name, passwordHash: hashPassword('12345678'), role: 'AGENT' },
      })
    )
  }

  // ── Devices + balances ────────────────────────────────────────────────────
  const deviceSpecs = [
    { name: 'Agent Phone — Dhaka', ownerId: agents[0].id, model: 'Samsung Galaxy A14', androidVersion: '14', appVersion: '2.0.0', battery: 78, signal: 'GOOD' },
    { name: 'Agent Phone — Chattogram', ownerId: agents[1].id, model: 'Xiaomi Redmi 12', androidVersion: '13', appVersion: '2.0.0', battery: 45, signal: 'GOOD' },
    { name: 'Shop Counter Phone', ownerId: admin.id, model: 'Tecno Spark 10', androidVersion: '12', appVersion: '2.0.0', battery: 91, signal: 'EXCELLENT' },
  ]
  const devices: Device[] = []
  for (const [i, spec] of deviceSpecs.entries()) {
    const sims = JSON.stringify(
      i === 2
        ? [{ number: '01711000101', carrier: 'bKash (GP)' }, { number: '01811000202', carrier: 'Nagad (Banglalink)' }]
        : [{ number: `017${1100000 + i}1`, carrier: i === 0 ? 'bKash (GP)' : 'Rocket (Teletalk)' }]
    )
    devices.push(
      await db.device.create({
        data: {
          name: spec.name,
          deviceKey: `ilp_demo${i}_${randTrxId(16).toLowerCase()}`,
          pairingCode: String(100000 + ((i + 1) * 137911) % 900000),
          model: spec.model,
          androidVersion: spec.androidVersion,
          appVersion: spec.appVersion,
          battery: spec.battery,
          signal: spec.signal,
          sims,
          status: 'ONLINE',
          lastSeen: atDay(0, new Date().getHours(), Math.max(0, new Date().getMinutes() - 2)),
          ownerId: spec.ownerId,
        },
      })
    )
  }

  await db.deviceBalance.createMany({
    data: [
      { deviceId: devices[0].id, mfs: 'BKASH', simNumber: '01711000101', accountType: 'PERSONAL', balance: 25430.5, verifiedAt: atDay(0, new Date().getHours() - 1) },
      { deviceId: devices[0].id, mfs: 'NAGAD', simNumber: '01811000202', accountType: 'PERSONAL', balance: 9120.25, verifiedAt: atDay(0, new Date().getHours() - 1) },
      { deviceId: devices[1].id, mfs: 'ROCKET', simNumber: '01911000303', accountType: 'PERSONAL', balance: 3204.0, verifiedAt: atDay(0, new Date().getHours() - 2) },
      { deviceId: devices[2].id, mfs: 'BKASH', simNumber: '01711000101', accountType: 'MERCHANT', balance: 84210.75, verifiedAt: atDay(0, new Date().getHours() - 1) },
    ],
  })

  // ── Customers ─────────────────────────────────────────────────────────────
  const customerSpecs = [
    { name: 'Tanvir Ahmed', phone: '01712345678', email: 'tanvir@example.com' },
    { name: 'Shakil Khan', phone: '01812345678', email: 'shakil@example.com' },
    { name: 'Mizan Rahman', phone: '01912345678', email: null },
    { name: 'Fahim Uddin', phone: '01612345678', email: 'fahim@example.com' },
    { name: 'Rasel Chowdhury', phone: '01312345678', email: null },
  ]
  const customers: Array<{ id: string; name: string; phone: string | null; email: string | null }> = []
  for (const c of customerSpecs) {
    customers.push(await db.customer.create({ data: { ...c, insertedVia: 'MANUAL' } }))
  }

  // ── Transactions + raw SMS across 7 days ──────────────────────────────────
  let balance = 25430
  const mfsGateway: Record<string, string> = {
    BKASH: 'BKASH_PERSONAL', NAGAD: 'NAGAD_PERSONAL', ROCKET: 'ROCKET_PERSONAL', UPAY: 'UPAY_PERSONAL',
  }
  for (let d = 6; d >= 0; d--) {
    const count = d === 0 ? 6 : 5 + Math.floor(Math.random() * 4)
    for (let i = 0; i < count; i++) {
      const roll = Math.random()
      const mfs = roll < 0.45 ? 'BKASH' : roll < 0.7 ? 'NAGAD' : roll < 0.82 ? 'ROCKET' : roll < 0.9 ? 'UPAY' : 'BANK'
      const amount = AMOUNTS[Math.floor(Math.random() * AMOUNTS.length)]
      const phone = randPhone()
      const trx = randTrxId()
      const device = devices[Math.floor(Math.random() * devices.length)]
      const senderId = mfs === 'BKASH' ? 'bKash' : mfs === 'NAGAD' ? 'NAGAD' : mfs === 'ROCKET' ? '8446' : mfs === 'UPAY' ? 'UPAY' : 'BRACBank'
      balance += amount
      const body =
        mfs === 'BKASH' ? BKASH_BODIES(amount, phone, trx, balance)
        : mfs === 'NAGAD' ? NAGAD_BODIES(amount, phone, trx, balance)
        : mfs === 'ROCKET' ? ROCKET_BODIES(amount, phone, trx, balance)
        : mfs === 'UPAY' ? UPAY_BODIES(amount, phone, trx, balance)
        : BANK_BODIES(amount, phone, trx, balance)

      const occurredAt = atDay(d, 9 + (i % 9), (i * 7 + d * 3) % 59)
      const status = Math.random() < 0.12 ? 'UNMATCHED' : 'PAID'
      const charge = mfs === 'BKASH' || mfs === 'NAGAD' ? Math.round(amount * 1.5) / 100 : 0
      const customer = Math.random() < 0.5 ? customers[Math.floor(Math.random() * customers.length)] : null

      const raw = await db.rawSms.create({
        data: { deviceId: device.id, sender: senderId, body, receivedAt: occurredAt, processed: true, parsed: true, note: status === 'PAID' ? 'Auto-matched' : 'No open target matched' },
      })
      await db.transaction.create({
        data: {
          trxId: trx, mfs, gatewayCode: mfsGateway[mfs] ?? null,
          method: mfs === 'BANK' ? 'BANK_TRANSFER' : 'WALLET',
          bankName: mfs === 'BANK' ? 'BRAC Bank' : null,
          amount, charge, netAmount: amount - charge, balance,
          senderNumber: phone,
          senderName: Math.random() < 0.3 ? randName() : null,
          status, deviceId: device.id, rawSmsId: raw.id,
          customerId: customer?.id ?? null,
          occurredAt,
        },
      })
    }

    for (const [sender, body] of NOISE_SMS.slice(0, 2)) {
      await db.rawSms.create({
        data: {
          deviceId: devices[Math.floor(Math.random() * devices.length)].id,
          sender, body, receivedAt: atDay(d, 8 + Math.floor(Math.random() * 12)),
          processed: true, parsed: false, review: 'ERROR', note: 'Not a money-received SMS',
        },
      })
    }

    if (d === 2 || d === 4) {
      const amount = 2499
      balance += amount
      const trx = randTrxId()
      await db.transaction.create({
        data: {
          trxId: trx, mfs: 'BANK', method: 'GOOGLE_PAY', bankName: 'City Bank',
          amount, balance, senderNumber: null, status: 'UNMATCHED',
          deviceId: devices[2].id, occurredAt: atDay(d, 15, 22),
        },
      })
      await db.rawSms.create({
        data: {
          deviceId: devices[2].id, sender: 'CityBank', body: GPAY_BODIES(amount, trx, balance),
          receivedAt: atDay(d, 15, 22), processed: true, parsed: true, note: 'No open target matched',
        },
      })
    }
  }

  // SMS review queue: 1 awaiting, 1 error with recoverable body
  await db.rawSms.create({
    data: {
      deviceId: devices[0].id, sender: 'bKash',
      body: 'You have received Tk 550.00 from 01712999888. Fee Tk 0.00. Balance Tk 26,100.50. TrxID AW8AIT2QQ4',
      receivedAt: atDay(0, new Date().getHours(), Math.max(0, new Date().getMinutes() - 20)),
      processed: true, parsed: true, review: 'AWAITING_REVIEW', note: 'Needs manual approval',
    },
  })
  await db.rawSms.create({
    data: {
      deviceId: devices[1].id, sender: '8446',
      body: 'You have received Tk 320.00 from 01812111222. TxnId: RR9KLM2PQR. Balance: Tk 3524.00',
      receivedAt: atDay(0, new Date().getHours(), Math.max(0, new Date().getMinutes() - 45)),
      processed: false, parsed: false, review: 'ERROR', note: 'Parser failed — retry available',
    },
  })

  // ── Stores + API keys + webhook endpoints ─────────────────────────────────
  const store = await db.store.create({
    data: {
      name: 'Invokeil Demo Store',
      contactEmail: 'billing@demostore.com',
      apiKey: `sk_live_demo_${randTrxId(18).toLowerCase()}`,
      secret: `whsec_${randTrxId(22).toLowerCase()}`,
      domainWhitelist: JSON.stringify(['demostore.com', 'shop.demostore.com']),
      active: true,
    },
  })
  const store2 = await db.store.create({
    data: {
      name: 'Nagorir Bazar (client)',
      contactEmail: 'accounts@nagorirbazar.com',
      apiKey: `sk_live_demo_${randTrxId(18).toLowerCase()}`,
      secret: `whsec_${randTrxId(22).toLowerCase()}`,
      active: true,
    },
  })

  const masterKey = await db.apiKey.create({
    data: { storeId: store.id, name: 'WooCommerce integration', key: `pk_demo_${randTrxId(20).toLowerCase()}`, scopes: 'create_payment,verify_payment', lastUsedAt: atDay(0, new Date().getHours() - 3) },
  })
  await db.apiKey.create({
    data: { storeId: store.id, name: 'Mobile app (read-only)', key: `pk_demo_${randTrxId(20).toLowerCase()}`, scopes: 'verify_payment', locked: true },
  })
  void masterKey

  const endpoint = await db.webhookEndpoint.create({
    data: { storeId: store.id, url: 'https://webhook.site/demo-invokeil-endpoint', events: '*', secret: `whsec_${randTrxId(20).toLowerCase()}`, active: true },
  })
  await db.webhookEndpoint.create({
    data: { storeId: store.id, url: 'https://shop.demostore.com/api/ipn/invokeil', events: 'checkout.paid,invoice.paid', secret: `whsec_${randTrxId(20).toLowerCase()}`, active: true },
  })

  // ── Checkouts ─────────────────────────────────────────────────────────────
  const checkoutSpecs = [
    { title: 'Order #INV-1024 — Wireless Earbuds', customerName: 'Tanvir Ahmed', amount: 1500, mfs: 'BKASH', status: 'PAID', daysAgo: 1, customFields: null as string | null, answers: null as string | null },
    { title: 'Order #INV-1031 — Linen Panjabi', customerName: 'Shakil Khan', amount: 1990, mfs: 'NAGAD', status: 'PAID', daysAgo: 2, customFields: null, answers: null },
    { title: 'Top-up — 320৳ gaming package', customerName: null, amount: 320, mfs: 'ROCKET', status: 'PAID', daysAgo: 3, customFields: null, answers: null },
    { title: 'Order #INV-1052 — Coffee Beans 500g', customerName: 'Mizan Rahman', amount: 850, mfs: 'ANY', status: 'PENDING', daysAgo: 0, customFields: JSON.stringify([{ name: 'address', label: 'Delivery address', required: true }]), answers: null },
    { title: 'Deposit — Fahim (agent collection)', customerName: 'Fahim Uddin', amount: 5000, mfs: 'BKASH', status: 'AWAITING', daysAgo: 0, customFields: null, answers: null },
    { title: 'Course fee — Spoken English (batch 12)', customerName: 'Rasel Chowdhury', amount: 2500, mfs: 'ANY', status: 'CANCELLED', daysAgo: 4, customFields: null, answers: null },
  ]
  for (const c of checkoutSpecs) {
    const paidTx =
      c.status === 'PAID'
        ? await db.transaction.findFirst({ where: { mfs: c.mfs === 'ANY' ? undefined : c.mfs, status: 'PAID' }, orderBy: { occurredAt: 'desc' } })
        : null
    const customer = customers.find((x) => x.name === c.customerName)
    await db.checkoutPage.create({
      data: {
        token: randTrxId(16).toLowerCase(),
        title: c.title,
        customerName: c.customerName,
        customerPhone: c.customerName ? randPhone() : null,
        customerId: customer?.id ?? null,
        amount: c.amount,
        mfs: c.mfs,
        status: c.status,
        customFields: c.customFields,
        answers: c.answers,
        storeId: store.id,
        createdAt: atDay(c.daysAgo, 10),
        paidAt: c.status === 'PAID' ? atDay(c.daysAgo, 11) : null,
        paidTrxId: paidTx?.trxId ?? null,
        expiresAt: c.status === 'PAID' || c.status === 'CANCELLED' ? null : new Date(Date.now() + 24 * 3600000),
      },
    })
  }

  // ── Payment links ─────────────────────────────────────────────────────────
  await db.paymentLink.createMany({
    data: [
      {
        slug: 'premium-consultation', token: randTrxId(16).toLowerCase(),
        title: 'Premium Consultation (60 min)', description: 'One-on-one video consultation. Pick a slot after payment.',
        amountType: 'FIXED', amount: 2000, gatewayCode: null,
        usageLimit: 20, usedCount: 6, status: 'ACTIVE',
        createdAt: atDay(5, 11),
      },
      {
        slug: 'donate', token: randTrxId(16).toLowerCase(),
        title: 'Support the Community Iftar', description: 'Donate any amount — every taka counts.',
        amountType: 'VARIABLE', minAmount: 50, maxAmount: 25000, gatewayCode: null,
        status: 'ACTIVE', usedCount: 34, createdAt: atDay(9, 14),
      },
      {
        slug: 'old-workshop', token: randTrxId(16).toLowerCase(),
        title: 'Freelancing Workshop (expired)', description: 'Last batch — closed.',
        amountType: 'FIXED', amount: 999, status: 'DISABLED',
        usedCount: 41, createdAt: atDay(20, 10), expiresAt: atDay(2, 23),
      },
    ],
  })

  // ── Invoices + items ──────────────────────────────────────────────────────
  const invoiceSpecs = [
    { status: 'SENT', daysAgo: 1, dueInDays: 6, customerIdx: 0, title: 'Website design — 50% advance', items: [
      { description: 'UI/UX design (10 pages)', quantity: 1, unitPrice: 18000 },
      { description: 'Logo refinement', quantity: 1, unitPrice: 4000 },
    ], discount: 2000 },
    { status: 'PAID', daysAgo: 3, dueInDays: 0, customerIdx: 1, title: 'Monthly retainer — September', items: [
      { description: 'Social media management', quantity: 1, unitPrice: 12000 },
      { description: 'Ad boost budget', quantity: 1, unitPrice: 5000 },
    ], discount: 0 },
    { status: 'OVERDUE', daysAgo: 12, dueInDays: -5, customerIdx: 3, title: 'Bulk SMS campaign setup', items: [
      { description: 'Campaign setup + copywriting', quantity: 1, unitPrice: 6500 },
      { description: '10,000 SMS credits', quantity: 10, unitPrice: 350 },
    ], discount: 500 },
    { status: 'DRAFT', daysAgo: 0, dueInDays: 10, customerIdx: 4, title: 'Product photography (quote)', items: [
      { description: 'Studio session (per hour)', quantity: 4, unitPrice: 2500 },
    ], discount: 0 },
  ]
  let invNum = 1
  for (const spec of invoiceSpecs) {
    const subtotal = spec.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0)
    const total = subtotal - spec.discount
    const customer = customers[spec.customerIdx]
    const inv = await db.invoice.create({
      data: {
        number: `INV-${String(invNum++).padStart(6, '0')}`,
        token: randTrxId(24).toLowerCase(),
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        title: spec.title,
        status: spec.status,
        subtotal, discount: spec.discount, tax: 0, shipping: 0, total,
        dueDate: atDay(-spec.dueInDays, 23),
        paidAt: spec.status === 'PAID' ? atDay(2, 16) : null,
        paidTrxId: spec.status === 'PAID' ? randTrxId() : null,
        publicNote: spec.status === 'PAID' ? 'Paid via bKash — thank you!' : null,
        createdAt: atDay(spec.daysAgo, 12),
      },
    })
    for (const it of spec.items) {
      await db.invoiceItem.create({
        data: { invoiceId: inv.id, description: it.description, quantity: it.quantity, unitPrice: it.unitPrice, total: it.quantity * it.unitPrice },
      })
    }
  }

  // ── Webhook deliveries history ────────────────────────────────────────────
  await db.webhookDelivery.createMany({
    data: [
      { storeId: store.id, endpointId: endpoint.id, event: 'checkout.paid', payload: JSON.stringify({ event: 'checkout.paid', data: { checkout_token: randTrxId(12).toLowerCase(), amount: 1500, status: 'PAID' } }), signature: 't=1757900000000,v1=demo', status: 'SUCCESS', httpCode: 200, attempts: 1, responseAt: atDay(1, 11) },
      { storeId: store.id, endpointId: endpoint.id, event: 'checkout.paid', payload: JSON.stringify({ event: 'checkout.paid', data: { checkout_token: randTrxId(12).toLowerCase(), amount: 1990, status: 'PAID' } }), signature: 't=1757900100000,v1=demo', status: 'FAILED', error: 'HTTP 500', httpCode: 500, attempts: 2, nextRetryAt: new Date(Date.now() + 120000), responseAt: atDay(2, 12) },
      { storeId: store.id, endpointId: endpoint.id, event: 'invoice.paid', payload: JSON.stringify({ event: 'invoice.paid', data: { invoice_number: 'INV-000002', amount: 17000 } }), signature: 't=1757900200000,v1=demo', status: 'SUCCESS', httpCode: 200, attempts: 1, responseAt: atDay(2, 16) },
      { storeId: store.id, endpointId: endpoint.id, event: 'test', payload: JSON.stringify({ event: 'test', data: { ping: true } }), signature: 't=1757900300000,v1=demo', status: 'FAILED', error: 'No webhook URL configured', attempts: 1 },
    ],
  })

  // ── FAQ ───────────────────────────────────────────────────────────────────
  await db.faqItem.createMany({
    data: [
      { question: 'How long does verification take?', answer: 'Payments are verified automatically within seconds — the moment your bKash/Nagad/Rocket/Upay SMS arrives on our SIM.', sortOrder: 1 },
      { question: 'I sent the wrong amount. What now?', answer: 'Contact support with your TrxID. We will match it manually or refund the difference.', sortOrder: 2 },
      { question: 'Which numbers can I pay from?', answer: 'Any personal bKash, Nagad, Rocket, Upay account, or bank transfer. The sending number must be yours.', sortOrder: 3 },
      { question: 'Is my payment information safe?', answer: 'Yes — we never store your PIN. Only the payment-confirmation SMS is processed.', sortOrder: 4 },
    ],
  })

  // ── Activities + login attempts ───────────────────────────────────────────
  const activities: Array<[string, string, string | null, number]> = [
    ['Panel Admin', 'auth.login', 'user:admin', 0],
    ['Panel Admin', 'checkout.created', 'checkout:demo-1052', 0],
    ['Rakib Hasan', 'sms.approved', 'sms:AW8AIT2QQ4', 0],
    ['Panel Admin', 'gateway.updated', 'gateway:BKASH_PERSONAL', 1],
    ['Sohel Rana', 'transaction.matched', 'tx:' + randTrxId(8), 1],
    ['Panel Admin', 'store.created', 'store:Invokeil Demo Store', 2],
    ['Panel Admin', 'apikey.created', 'key:pk_demo', 2],
    ['Panel Admin', 'settings.updated', 'settings:payment', 3],
    ['Rakib Hasan', 'device.registered', 'device:Agent Phone — Dhaka', 4],
    ['Panel Admin', 'invoice.sent', 'invoice:INV-000001', 1],
  ]
  for (const [actor, action, target, days] of activities) {
    await db.activityLog.create({
      data: { userId: admin.id, actorName: actor, action, target, ip: '103.108.44.12', userAgent: 'Chrome · macOS', createdAt: atDay(days, 10 + Math.floor(Math.random() * 9)) },
    })
  }
  await db.loginAttempt.createMany({
    data: [
      { email: 'admin@admin.com', ip: '103.108.44.12', success: true, createdAt: atDay(0, 9) },
      { email: 'rakib@invokeilpay.com', ip: '42.0.5.117', success: true, createdAt: atDay(0, 10) },
      { email: 'admin@admin.com', ip: '185.220.101.7', success: false, createdAt: atDay(1, 3) },
      { email: 'admin@admin.com', ip: '185.220.101.7', success: false, createdAt: atDay(1, 3) },
      { email: 'sohel@invokeilpay.com', ip: '42.0.5.201', success: true, createdAt: atDay(1, 11) },
    ],
  })

  // ── Settings ──────────────────────────────────────────────────────────────
  const settings: Record<string, string> = {
    brandName: 'Invokeil Pay',
    brandTagline: 'Personal MFS Payment Automation',
    supportPhone: '+880 1711 000000',
    supportEmail: 'support@invokeil.com',
    paymentTolerance: '0',
    checkoutExpiryHours: '24',
    setupCompleted: 'true',
    demoSeeded: 'true',
  }
  for (const [key, value] of Object.entries(settings)) {
    await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
  }
  await db.setting.upsert({ where: { key: DEMO_FLAG }, update: { value: 'true' }, create: { key: DEMO_FLAG, value: 'true' } })
  await seedV3Data()
}

/**
 * v3 demo dataset — communication suite, automations, risk, ops, money ops,
 * subscriptions. Removable via clearDemoData(). Safe to re-run (idempotent guards).
 */
async function seedV3Data(): Promise<void> {
  // ── Brands (multi-business) ──
  const mainBrand = await db.brand.upsert({
    where: { slug: 'invokeil-main' },
    update: {},
    create: { name: 'Invokeil Main', slug: 'invokeil-main', color: '#2563EB', supportEmail: 'support@invokeil.com', supportPhone: '+880 1711 000000' },
  })
  await db.brand.upsert({
    where: { slug: 'invokeil-digital' },
    update: {},
    create: { name: 'Invokeil Digital', slug: 'invokeil-digital', color: '#7C3AED', supportEmail: 'hello@invokeil.digital' },
  })

  // ── Email identities (purpose-based addresses) ──
  const domain = 'invokeil.com'
  const identities: Array<[string, string, string]> = [
    ['General', `hello@${domain}`, 'GENERAL'],
    ['Sales', `sales@${domain}`, 'SALES'],
    ['Payments', `payment@${domain}`, 'PAYMENTS'],
    ['Invoices', `invoice@${domain}`, 'INVOICES'],
    ['Support', `support@${domain}`, 'SUPPORT'],
    ['Refunds', `refund@${domain}`, 'REFUNDS'],
    ['Security', `security@${domain}`, 'SECURITY'],
    ['OTP', `otp@${domain}`, 'OTP'],
    ['Billing', `billing@${domain}`, 'BILLING'],
    ['No Reply', `noreply@${domain}`, 'NOREPLY'],
  ]
  for (let i = 0; i < identities.length; i++) {
    const [label, email, purpose] = identities[i]
    await db.emailIdentity.upsert({
      where: { email },
      update: {},
      create: { label, email, purpose, sortOrder: i, verified: false },
    })
  }

  // ── Email template catalog (320) ──
  if ((await db.emailTemplate.count()) === 0) {
    const catalog = generateEmailCatalog().map((t) => ({ ...t, variables: JSON.stringify(t.variables) }))
    for (let i = 0; i < catalog.length; i += 80) {
      await db.emailTemplate.createMany({ data: catalog.slice(i, i + 80) })
    }
  }

  // ── Per-brand notification message templates (default space) ──
  const msgTpl: Array<[string, string, string, string]> = [
    ['PAYMENT_SUCCESS', 'SMS', 'en', 'Hi {{customer_name}}, payment of {{amount}} BDT received. Ref: {{trx_id}}. Thank you! — {{brand}}'],
    ['PAYMENT_SUCCESS', 'SMS', 'bn', '{{customer_name}}, {{amount}} টাকার পেমেন্ট পেয়েছি। রেফ: {{trx_id}}। ধন্যবাদ! — {{brand}}'],
    ['PAYMENT_FAILED', 'SMS', 'en', 'Hi {{customer_name}}, your payment of {{amount}} BDT could not be completed. Retry from the link. — {{brand}}'],
    ['PAYMENT_DUE', 'SMS', 'en', 'Reminder: {{amount}} BDT payment pending. — {{brand}}'],
    ['INVOICE_OVERDUE', 'SMS', 'en', 'Invoice {{invoice_number}} ({{amount}} BDT) is overdue. Please settle. — {{brand}}'],
    ['OTP', 'SMS', 'en', '{{code}} is your verification code. Valid 5 minutes. Never share it. — {{brand}}'],
  ]
  for (const [event, channel, locale, body] of msgTpl) {
    const existing = await db.messageTemplate.findFirst({ where: { brandId: null, channel, event, locale } })
    if (!existing) await db.messageTemplate.create({ data: { brandId: null, channel, event, locale, body } })
  }

  // ── Automations from workflow templates (install 3) ──
  for (const key of ['payment_success_flow', 'failed_payment_recovery', 'invoice_due_reminder']) {
    const tpl = WORKFLOW_TEMPLATES.find((t) => t.key === key)
    if (!tpl) continue
    const exists = await db.automation.findFirst({ where: { name: tpl.name } })
    if (!exists) {
      await db.automation.create({
        data: {
          name: tpl.name,
          description: tpl.description,
          trigger: tpl.trigger,
          conditions: JSON.stringify(tpl.conditions),
          actions: JSON.stringify(tpl.actions),
          enabled: true,
          builtIn: true,
        },
      })
    }
  }

  // ── Risk rules + lists ──
  await ensureDefaultRiskRules()

  // ── Status components + a resolved incident ──
  if ((await db.statusComponent.count()) === 0) {
    const comps: Array<[string, number]> = [
      ['API & Checkout', 1], ['Admin Dashboard', 2], ['Webhooks', 3], ['Email Delivery', 4],
      ['SMS Gateway', 5], ['Device Network', 6], ['Public Status Page', 7],
    ]
    for (const [name, sortOrder] of comps) {
      await db.statusComponent.create({ data: { name, sortOrder } })
    }
    await db.incident.create({
      data: {
        title: 'Elevated webhook delivery latency',
        body: 'Some webhook deliveries were delayed up to 3 minutes due to an upstream provider incident.',
        impact: 'MINOR',
        status: 'RESOLVED',
        components: JSON.stringify(['Webhooks']),
        updates: JSON.stringify([
          { at: new Date(Date.now() - 86400_000 * 3).toISOString(), body: 'Investigating delayed webhook deliveries.', status: 'INVESTIGATING' },
          { at: new Date(Date.now() - 86400_000 * 3 + 1800_000).toISOString(), body: 'Root cause identified upstream; queue draining.', status: 'MONITORING' },
          { at: new Date(Date.now() - 86400_000 * 3 + 3600_000).toISOString(), body: 'All deliveries caught up. Resolved.', status: 'RESOLVED' },
        ]),
        startedAt: new Date(Date.now() - 86400_000 * 3),
        resolvedAt: new Date(Date.now() - 86400_000 * 3 + 3600_000),
      },
    })
  }

  // ── Marketplace builtins ──
  const apps: Array<[string, string, string, string]> = [
    ['woocommerce', 'WooCommerce', 'ECOMMERCE', 'Accept payments in WooCommerce via the Invokeil Pay merchant API and webhook verification.'],
    ['shopify', 'Shopify', 'ECOMMERCE', 'Mark Shopify orders paid when the Invokeil Pay webhook confirms a payment (where permitted).'],
    ['wordpress', 'WordPress', 'ECOMMERCE', 'Drop-in payment buttons and checkout links for WordPress sites.'],
    ['zapier', 'Zapier', 'TOOLING', 'Connect 6000+ apps: trigger zaps on payment.paid webhooks.'],
    ['google-sheets', 'Google Sheets', 'TOOLING', 'Log every transaction into a spreadsheet via outgoing HTTP actions.'],
    ['discord', 'Discord', 'NOTIFICATIONS', 'Post payment alerts to a Discord channel via webhook.'],
    ['slack', 'Slack', 'NOTIFICATIONS', 'Send payment notifications to Slack incoming webhooks.'],
    ['telegram', 'Telegram', 'NOTIFICATIONS', 'Bot notifications for payments, refunds and incidents.'],
    ['quickbooks', 'QuickBooks', 'ACCOUNTING', 'Export settlements and statements for QuickBooks reconciliation.'],
    ['xero', 'Xero', 'ACCOUNTING', 'Daily statement export formatted for Xero import.'],
    ['mailchimp', 'Mailchimp', 'CRM', 'Sync paying customers to a Mailchimp audience.'],
    ['hubspot', 'HubSpot', 'CRM', 'Create/update HubSpot contacts on successful payments.'],
    ['custom-webhook', 'Custom outgoing HTTP action', 'TOOLING', 'Connect your ERP/CRM: signed POST to any HTTPS endpoint.'],
  ]
  for (const [key, name, category, description] of apps) {
    await db.marketplaceApp.upsert({ where: { key }, update: {}, create: { key, name, category, description } })
  }

  // ── Currencies (multi-currency architecture, BDT base) ──
  for (const c of [
    { code: 'BDT', symbol: '৳', rate: 1, decimals: 2, enabled: true },
    { code: 'USD', symbol: '$', rate: 0.0084, decimals: 2, enabled: false },
    { code: 'EUR', symbol: '€', rate: 0.0077, decimals: 2, enabled: false },
    { code: 'GBP', symbol: '£', rate: 0.0066, decimals: 2, enabled: false },
    { code: 'INR', symbol: '₹', rate: 0.7, decimals: 2, enabled: false },
  ]) {
    await db.currency.upsert({ where: { code: c.code }, update: {}, create: c })
  }

  // ── Feature flags ──
  for (const f of [
    { key: 'passkeys', name: 'Passkey sign-in', description: 'WebAuthn/passkey registration in Security Center.', enabled: true, rolloutPercent: 100 },
    { key: 'outgoing_payments', name: 'Outgoing payments (beta)', description: 'Dynamic payment maker — dispatch send-money commands to paired devices.', enabled: true, rolloutPercent: 100 },
    { key: 'portal_beta', name: 'Customer portal (beta)', description: 'Hosted self-service portal for customers.', enabled: true, rolloutPercent: 100 },
    { key: 'upi_style_v2', name: 'Next-gen checkout v2', description: 'Redesigned checkout experience.', enabled: false, rolloutPercent: 25 },
  ]) {
    await db.featureFlag.upsert({ where: { key: f.key }, update: {}, create: f })
  }

  // ── Subscriptions ──
  const cust = await db.customer.findFirst({ orderBy: { createdAt: 'asc' } })
  if (cust && (await db.subscription.count()) === 0) {
    await db.subscription.create({
      data: {
        customerId: cust.id,
        customerName: cust.name,
        planName: 'Starter',
        amount: 999,
        interval: 'MONTHLY',
        status: 'ACTIVE',
        gatewayCode: 'BKASH_PERSONAL',
        nextBillingAt: new Date(Date.now() + 12 * 86400_000),
        cycles: 3,
      },
    })
    await db.subscription.create({
      data: {
        customerId: cust.id,
        customerName: cust.name,
        planName: 'Business Pro',
        amount: 2499,
        interval: 'MONTHLY',
        status: 'TRIALING',
        trialDays: 14,
        trialEndsAt: new Date(Date.now() + 9 * 86400_000),
        nextBillingAt: new Date(Date.now() + 9 * 86400_000),
      },
    })
  }

  // ── Money ops samples (refund, dispute, settlement) ──
  const paidTx = await db.transaction.findFirst({ where: { status: { in: ['PAID', 'MATCHED'] } }, orderBy: { occurredAt: 'desc' } })
  if (paidTx && (await db.refund.count()) === 0) {
    await db.refund.create({
      data: {
        transactionId: paidTx.id,
        trxRef: paidTx.trxId,
        customerRef: paidTx.customerId,
        type: 'FULL',
        amount: paidTx.amount,
        reason: 'Customer requested a refund (demo)',
        status: 'PROCESSED',
        requestedByName: 'Rakib Hasan',
        approvedByName: 'Admin',
        processedByName: 'Admin',
        processedAt: new Date(),
      },
    })
  }
  if (paidTx && (await db.dispute.count()) === 0) {
    await db.dispute.create({
      data: {
        transactionId: paidTx.id,
        trxRef: paidTx.trxId,
        amount: paidTx.amount,
        reason: 'Product not received (demo)',
        status: 'OPEN',
        deadlineAt: new Date(Date.now() + 11 * 86400_000),
        messages: JSON.stringify([{ by: 'customer', at: new Date().toISOString(), body: 'I have not received the package yet.' }]),
      },
    })
  }
  if ((await db.settlement.count()) === 0) {
    await db.settlement.create({
      data: {
        period: new Date(Date.now() - 86400_000 * 30).toISOString().slice(0, 7),
        provider: 'BKASH',
        expected: 48250,
        actual: 48250,
        fees: 482.5,
        adjustments: 0,
        status: 'RECONCILED',
        itemCount: 42,
        missingCount: 0,
        reconciledAt: new Date(),
      },
    })
  }

  // ── Maker–checker sample ──
  if ((await db.approvalRequest.count()) === 0) {
    await db.approvalRequest.create({
      data: {
        type: 'API_KEY',
        summary: 'Rotate live API key for Invokeil Main store',
        payload: JSON.stringify({ storeId: 'demo', action: 'rotate' }),
        status: 'PENDING',
        requestedByName: 'Sohel Islam',
      },
    })
  }

  // ── KYC samples ──
  if ((await db.kycProfile.count()) === 0) {
    await db.kycProfile.create({
      data: { entityType: 'BUSINESS', legalName: 'Invokeil Digital Ltd', contactEmail: 'hello@invokeil.digital', status: 'VERIFIED', submittedAt: new Date(Date.now() - 20 * 86400_000), reviewedAt: new Date(Date.now() - 18 * 86400_000), expiresAt: new Date(Date.now() + 340 * 86400_000) },
    })
    await db.kycProfile.create({
      data: { entityType: 'INDIVIDUAL', legalName: 'Jubayer Ahmed', contactPhone: '01711223344', status: 'SUBMITTED', submittedAt: new Date(Date.now() - 2 * 86400_000), documents: JSON.stringify([{ type: 'NID', name: 'nid-front.jpg' }, { type: 'TRADE_LICENSE', name: 'license.pdf' }]) },
    })
  }

  // ── Communication samples ──
  if ((await db.emailMessage.count()) === 0) {
    await db.emailMessage.createMany({
      data: [
        { toAddress: 'rakib@example.com', fromAddress: `noreply@${domain}`, subject: 'Payment received — ৳850', templateKey: 'payment_received_f', status: 'SENT', providerType: 'SANDBOX', providerChain: JSON.stringify([{ provider: 'SANDBOX', ok: true, detail: 'Simulated (sandbox mode)', ms: 0, simulated: true }]), sentAt: new Date(Date.now() - 3600_000) },
        { toAddress: 'nusrat@example.com', fromAddress: `invoice@${domain}`, subject: 'Invoice INV-000004 from Invokeil Pay', templateKey: 'invoice_created_f', status: 'OPENED', providerType: 'SANDBOX', sentAt: new Date(Date.now() - 7200_000) },
        { toAddress: 'karim@example.com', fromAddress: `support@${domain}`, subject: 'Re: Order help', status: 'RECEIVED', direction: 'RECEIVED', receivedAt: new Date(Date.now() - 5400_000) },
      ],
    })
    await db.smsMessage.createMany({
      data: [
        { toNumber: '01711111101', body: 'Payment of ৳850 received. Thank you! — Invokeil Pay', status: 'SENT', providerType: 'SANDBOX', sentAt: new Date(Date.now() - 3600_000) },
        { toNumber: '01822222202', body: 'Reminder: ৳1200 payment pending. — Invokeil Pay', status: 'SENT', providerType: 'SANDBOX', sentAt: new Date(Date.now() - 86400_000) },
      ],
    })
  }

  // ── Notification prefs (merchant defaults) ──
  if (!(await db.notificationPref.findFirst({ where: { audience: 'MERCHANT', subjectRef: null, event: 'PAYMENT_SUCCESS' } }))) {
    await db.notificationPref.create({ data: { audience: 'MERCHANT', subjectRef: null, event: 'PAYMENT_SUCCESS', email: true, sms: false, webhook: true, inapp: true } })
  }

  // ── Outgoing payment sample ──
  if ((await db.outgoingPayment.count()) === 0) {
    await db.outgoingPayment.create({
      data: { mfs: 'BKASH', toNumber: '01711223344', amount: 500, status: 'CONFIRMED', ref: 'SBXOUT1', note: 'Supplier payout (demo)', requestedByName: 'Admin', approvedByName: 'Owner', confirmedAt: new Date(Date.now() - 86400_000) },
    })
  }

  void mainBrand
}

export async function clearDemoData(): Promise<void> {
  await db.webhookDelivery.deleteMany({})
  await db.webhookEndpoint.deleteMany({})
  await db.apiKey.deleteMany({})
  await db.store.deleteMany({})
  await db.invoiceItem.deleteMany({})
  await db.invoice.deleteMany({})
  await db.paymentLink.deleteMany({})
  await db.transaction.deleteMany({})
  await db.rawSms.deleteMany({})
  await db.checkoutPage.deleteMany({})
  await db.deviceBalance.deleteMany({})
  await db.device.deleteMany({})
  await db.customer.deleteMany({})
  await db.faqItem.deleteMany({})
  await db.activityLog.deleteMany({})
  await db.loginAttempt.deleteMany({})
  // v3 models
  await db.automationRun.deleteMany({})
  await db.automation.deleteMany({})
  await db.refund.deleteMany({})
  await db.dispute.deleteMany({})
  await db.settlement.deleteMany({})
  await db.riskCase.deleteMany({})
  await db.riskRule.deleteMany({})
  await db.listEntry.deleteMany({})
  await db.approvalRequest.deleteMany({})
  await db.kycProfile.deleteMany({})
  await db.outgoingPayment.deleteMany({})
  await db.subscription.deleteMany({})
  await db.incident.deleteMany({})
  await db.importJob.deleteMany({})
  await db.smsMessage.deleteMany({})
  await db.emailMessage.deleteMany({})
  await db.messageTemplate.deleteMany({})
  await db.notificationPref.deleteMany({})
  await db.eventLedger.deleteMany({})
  await db.user.deleteMany({ where: { role: { not: 'ADMIN' } } })
  await db.setting.updateMany({ where: { key: { in: ['setupCompleted'] } }, data: { value: 'false' } })
  await db.setting.upsert({ where: { key: DEMO_FLAG }, update: { value: 'false' }, create: { key: DEMO_FLAG, value: 'false' } })
}

export async function isDemoSeeded(): Promise<boolean> {
  const s = await db.setting.findUnique({ where: { key: DEMO_FLAG } })
  return s?.value === 'true'
}
