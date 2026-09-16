/**
 * Notification center glue — the single place events become notifications.
 * Respects the Notification Preference Center (per event × audience × channel)
 * and per-brand message templates. Channels: EMAIL, SMS, WEBHOOK, IN-APP (in-app
 * is represented through the event ledger surfaced on dashboards).
 */
import { db } from '@/lib/db'
import { getMergedSettings } from '@/lib/settings-defaults'
import { sendTemplatedEmail, sendEmail } from '@/lib/providers/email'
import { sendBrandSms } from '@/lib/providers/sms'
import { fireEvent } from '@/lib/automation-engine'
import { recordEvent } from '@/lib/event-ledger'

export type NotifyEvent =
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_CANCEL'
  | 'PAYMENT_DUE'
  | 'INVOICE_CREATED'
  | 'INVOICE_OVERDUE'
  | 'SUBSCRIPTION_RENEWED'
  | 'REFUND_PROCESSED'
  | 'DISPUTE_OPENED'
  | 'KYC_STATUS'
  | 'OTP'
  | 'CUSTOM'

export interface NotifyContext {
  event: NotifyEvent
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  customerId?: string
  customerRef?: string
  amount?: number
  currency?: string
  trxId?: string
  checkoutToken?: string
  invoiceNumber?: string
  invoiceToken?: string
  planName?: string
  brandId?: string | null
  brandName?: string
  relatedType?: string
  relatedId?: string
  idempotencyKey?: string
}

/** Resolve channel switches from the preference center (falls back to defaults). */
async function prefsFor(event: NotifyEvent, customerRef?: string) {
  const [merchant, customer] = await Promise.all([
    db.notificationPref.findFirst({
      where: { audience: 'MERCHANT', subjectRef: null, event },
    }),
    customerRef
      ? db.notificationPref.findFirst({
          where: { audience: 'CUSTOMER', subjectRef: customerRef, event },
        })
      : null,
  ])
  return {
    email: customer?.email ?? merchant?.email ?? true,
    sms: customer?.sms ?? merchant?.sms ?? false,
    webhook: customer?.webhook ?? merchant?.webhook ?? true,
    inapp: customer?.inapp ?? merchant?.inapp ?? true,
  }
}

const EMAIL_TEMPLATE_KEY: Partial<Record<NotifyEvent, string>> = {
  PAYMENT_SUCCESS: 'payment_received_f',
  PAYMENT_FAILED: 'payment_failed_f',
  PAYMENT_CANCEL: 'payment_cancelled_f',
  PAYMENT_DUE: 'payment_reminder_f',
  INVOICE_CREATED: 'invoice_created_f',
  INVOICE_OVERDUE: 'invoice_overdue_f',
  SUBSCRIPTION_RENEWED: 'sub_renewal_success_f',
  REFUND_PROCESSED: 'refund_processed_f',
  DISPUTE_OPENED: 'dispute_opened_f',
  OTP: 'otp_6digit_f',
}

export interface NotifyResult {
  event: NotifyEvent
  deduped: boolean
  email?: { ok: boolean; simulated?: boolean; error?: string }
  sms?: { ok: boolean; simulated?: boolean; error?: string }
}

/**
 * Fire all configured notifications for an event.
 * Idempotent when idempotencyKey is provided (safe to call from retries/webhooks).
 * Also triggers automations bound to the mapped automation trigger.
 */
export async function notify(ctx: NotifyContext): Promise<NotifyResult> {
  const out: NotifyResult = { event: ctx.event, deduped: false }
  const idem = ctx.idempotencyKey ?? `notify:${ctx.event}:${ctx.relatedId ?? ctx.trxId ?? ctx.customerRef ?? Math.random()}`

  const ledger = await recordEvent({
    type: `notify.${ctx.event.toLowerCase()}`,
    idempotencyKey: idem,
    subjectRef: ctx.relatedId ?? ctx.customerRef ?? null,
    payload: ctx,
    processor: async () => {
      const settings = await getMergedSettings()
      const prefs = await prefsFor(ctx.event, ctx.customerRef)
      const vars: Record<string, string> = {
        customer_name: ctx.customerName ?? 'Customer',
        amount: ctx.amount != null ? `${ctx.amount}` : '',
        currency: ctx.currency ?? settings.currency ?? 'BDT',
        currency_symbol: settings.currencySymbol ?? '৳',
        trx_id: ctx.trxId ?? '',
        invoice_number: ctx.invoiceNumber ?? '',
        plan_name: ctx.planName ?? '',
        brand: ctx.brandName ?? settings.brandName ?? 'Invokeil Pay',
      }

      if (prefs.email && ctx.customerEmail) {
        const key = EMAIL_TEMPLATE_KEY[ctx.event]
        const res = key
          ? await sendTemplatedEmail({
              key,
              to: ctx.customerEmail,
              vars,
              identityId: null,
              relatedType: ctx.relatedType ?? null,
              relatedId: ctx.relatedId ?? null,
              customerRef: ctx.customerRef ?? null,
              overrides: { subject: vars.brand, html: undefined },
            }).catch(async () =>
              sendEmail({
                to: ctx.customerEmail as string,
                subject: `${vars.brand}: ${ctx.event.replaceAll('_', ' ').toLowerCase()}`,
                html: `<p>Hi ${vars.customer_name},</p><p>${ctx.event.replaceAll('_', ' ').toLowerCase()} — ${vars.currency_symbol}${vars.amount}</p>`,
                customerRef: ctx.customerRef ?? null,
              }),
            )
          : await sendEmail({
              to: ctx.customerEmail,
              subject: `${vars.brand}: ${ctx.event.replaceAll('_', ' ').toLowerCase()}`,
              html: `<p>Hi ${vars.customer_name},</p><p>${ctx.event.replaceAll('_', ' ').toLowerCase()} — ${vars.currency_symbol}${vars.amount}</p>`,
              customerRef: ctx.customerRef ?? null,
              relatedType: ctx.relatedType ?? null,
              relatedId: ctx.relatedId ?? null,
            })
        out.email = { ok: res.ok, simulated: res.simulated, error: res.error }
      }

      if (prefs.sms && ctx.customerPhone) {
        const res = await sendBrandSms({
          event: ctx.event,
          to: ctx.customerPhone,
          vars,
          brandId: ctx.brandId ?? null,
          relatedType: ctx.relatedType ?? null,
          relatedId: ctx.relatedId ?? null,
          customerRef: ctx.customerRef ?? null,
        })
        out.sms = { ok: res.ok, simulated: res.simulated, error: res.error }
      }

      // Automations bound to this domain event
      const triggerMap: Partial<Record<NotifyEvent, string>> = {
        PAYMENT_SUCCESS: 'PAYMENT_PAID',
        INVOICE_OVERDUE: 'INVOICE_OVERDUE',
        SUBSCRIPTION_RENEWED: 'SUBSCRIPTION_DUE',
      }
      const trigger = triggerMap[ctx.event]
      if (trigger) {
        await fireEvent(trigger, {
          trigger,
          checkoutToken: ctx.checkoutToken,
          checkoutId: ctx.relatedId,
          transactionId: ctx.trxId ? undefined : undefined,
          invoiceId: ctx.invoiceNumber,
          customerId: ctx.customerId,
          customerName: ctx.customerName,
          customerEmail: ctx.customerEmail,
          customerPhone: ctx.customerPhone,
          amount: ctx.amount,
          brandId: ctx.brandId,
          vars: { trxId: ctx.trxId ?? '', invoiceNumber: ctx.invoiceNumber ?? '' },
        }).catch(() => {})
      }
      return out
    },
  })

  out.deduped = ledger.deduped
  return (ledger.result as NotifyResult) ?? out
}
