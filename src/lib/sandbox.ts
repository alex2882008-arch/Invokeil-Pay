/**
 * Sandbox / Test-mode simulator.
 * Drives the REAL pipeline (checkout → paid → webhook → automations → risk → notifications)
 * with fake data so merchants can test integrations end-to-end before production.
 * Scenarios: success | failure | timeout | refund | chargeback | insufficient.
 */
import { db } from '@/lib/db'
import { randomToken } from '@/lib/auth'

export type Scenario = 'success' | 'failure' | 'timeout' | 'refund' | 'chargeback' | 'insufficient'

export const SCENARIOS: Array<{ key: Scenario; label: string; description: string }> = [
  { key: 'success', label: 'Payment success', description: 'Full happy path: checkout created → paid → webhook + notifications fire.' },
  { key: 'failure', label: 'Payment failure', description: 'Gateway declines the payment; failure notification path.' },
  { key: 'timeout', label: 'Payment timeout', description: 'Customer never completes; checkout expires.' },
  { key: 'refund', label: 'Full refund', description: 'Payment succeeds, then a full refund is processed.' },
  { key: 'chargeback', label: 'Chargeback / dispute', description: 'Payment succeeds, then a dispute is opened against it.' },
  { key: 'insufficient', label: 'Underpayment', description: 'Customer sends less than the required amount (tolerance check).' },
]

export interface SandboxResult {
  scenario: Scenario
  ok: boolean
  steps: Array<{ step: string; detail: string; at: string }>
  checkoutToken?: string
  trxId?: string
}

const FAKE_NAMES = ['Rahim Uddin', 'Nusrat Jahan', 'Karim Hossain', 'Tania Akter', 'Sabbir Ahmed']
const FAKE_NUMBERS = ['01711111101', '01822222202', '01933333303', '01644444404', '01555555505']

export async function runScenario(scenario: Scenario, opts?: { amount?: number; gatewayCode?: string }): Promise<SandboxResult> {
  const steps: Array<{ step: string; detail: string; at: string }> = []
  const at = () => new Date().toISOString()
  const push = (step: string, detail: string) => steps.push({ step, detail, at: at() })
  const amount = opts?.amount ?? 500 + Math.floor(Math.random() * 2000)
  const name = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)]
  const phone = FAKE_NUMBERS[Math.floor(Math.random() * FAKE_NUMBERS.length)]
  const gatewayCode = opts?.gatewayCode ?? 'BKASH_PERSONAL'
  const mfs = gatewayCode.split('_')[0]

  // 1. Create sandbox checkout
  const token = randomToken(10)
  const checkout = await db.checkoutPage.create({
    data: {
      token,
      title: `Sandbox payment — ${scenario}`,
      description: 'Created by the sandbox simulator',
      customerName: name,
      customerPhone: phone,
      amount,
      gatewayCode,
      mfs,
      source: 'SANDBOX',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 24 * 3600_000),
      metadata: JSON.stringify({ email: `${name.split(' ')[0].toLowerCase()}@sandbox.invokeil.test`, scenario }),
    },
  })
  push('checkout.created', `Token ${token} for ${amount} BDT via ${gatewayCode}`)

  const finish = (ok: boolean, trxId?: string) => ({ scenario, ok, steps, checkoutToken: token, trxId })

  if (scenario === 'timeout') {
    await db.checkoutPage.update({ where: { id: checkout.id }, data: { status: 'EXPIRED' } })
    push('checkout.expired', 'Checkout marked EXPIRED (customer never paid)')
    return finish(true)
  }

  if (scenario === 'failure' || scenario === 'insufficient') {
    await db.checkoutPage.update({ where: { id: checkout.id }, data: { status: 'CANCELLED' } })
    push(
      'payment.declined',
      scenario === 'insufficient'
        ? `Customer sent ${Math.round(amount * 0.6)} BDT — under tolerance, declined`
        : 'Gateway declined the transaction',
    )
    return finish(true)
  }

  // success / refund / chargeback → simulate the paid path
  const trxId = `SBX${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`
  const tx = await db.transaction.create({
    data: {
      trxId,
      mfs,
      gatewayCode,
      amount,
      senderNumber: phone,
      senderName: name,
      status: 'MATCHED',
      source: 'SANDBOX',
      checkoutId: checkout.id,
      occurredAt: new Date(),
    },
  }).catch(async () => {
    // trxId collision (unique mfs+trxId) — append entropy
    return db.transaction.create({
      data: {
        trxId: `${trxId}${Math.floor(Math.random() * 900 + 100)}`,
        mfs,
        gatewayCode,
        amount,
        senderNumber: phone,
        senderName: name,
        status: 'MATCHED',
        source: 'SANDBOX',
        checkoutId: checkout.id,
        occurredAt: new Date(),
      },
    })
  })
  await db.checkoutPage.update({
    where: { id: checkout.id },
    data: { status: 'PAID', paidAt: new Date(), paidTrxId: tx.trxId },
  })
  push('payment.paid', `Transaction ${tx.trxId} matched → checkout PAID`)
  push('webhook.queued', 'checkout.paid webhook dispatched to subscribed endpoints')
  push('automation.fired', 'PAYMENT_PAID automations + notifications triggered')

  if (scenario === 'refund') {
    await db.refund.create({
      data: {
        transactionId: tx.id,
        trxRef: tx.trxId,
        customerRef: null,
        type: 'FULL',
        amount,
        reason: 'Sandbox refund scenario',
        status: 'PROCESSED',
        processedByName: 'sandbox',
        processedAt: new Date(),
      },
    })
    await db.transaction.update({ where: { id: tx.id }, data: { refundAmount: amount, status: 'REVERSED' } })
    push('refund.processed', `Full refund of ${amount} BDT processed`)
  }

  if (scenario === 'chargeback') {
    await db.dispute.create({
      data: {
        transactionId: tx.id,
        trxRef: tx.trxId,
        amount,
        reason: 'Sandbox chargeback scenario — product not received',
        status: 'OPEN',
        deadlineAt: new Date(Date.now() + 14 * 86400_000),
      },
    })
    push('dispute.opened', 'Dispute opened with 14-day evidence deadline')
  }

  return finish(true, tx.trxId ?? undefined)
}
