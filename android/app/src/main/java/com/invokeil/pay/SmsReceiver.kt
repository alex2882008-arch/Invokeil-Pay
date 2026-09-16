package com.invokeil.pay

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/**
 * v2 smart SMS receiver.
 *
 * 1. Multipart PDU messages are merged (v1 logic kept).
 * 2. The smart gate decides: whitelisted payment sender + no OTP/PIN keywords → forward;
 *    everything else is logged locally as FILTERED and never leaves the phone.
 * 3. Every SMS lands in the in-app log (forwarded or filtered) for transparency.
 * 4. Delivery failures go to the persistent outbox — WorkManager retry with
 *    exponential backoff, 5 attempts (see OutboxWorker / ApiClient.drainOutbox).
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val msgs = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (msgs.isEmpty()) return

        // Messages from one sender may arrive split into multiple PDUs — join them (v1 logic).
        val sender = msgs.firstOrNull()?.originatingAddress ?: return
        val body = msgs.joinToString("") { it.messageBody ?: "" }
        val timestamp = msgs.firstOrNull()?.timestampMillis ?: System.currentTimeMillis()

        val ctx = context.applicationContext

        // Smart gate: whitelist + negative keywords. Fail-safe defaults inside.
        val decision = SmsGate.evaluate(ctx, sender, body)
        if (!decision.forward) {
            SmsLogStore.add(ctx, sender, body, timestamp, SmsLogStore.STATUS_FILTERED, decision.reason)
            return
        }

        if (!Prefs.isConfigured(ctx)) {
            // Keep it for later — it will be forwarded right after pairing.
            val id = SmsLogStore.add(
                ctx, sender, body, timestamp,
                SmsLogStore.STATUS_QUEUED, SmsLogStore.REASON_NOT_PAIRED
            )
            Prefs.queueSms(ctx, id, sender, body, timestamp)
            return
        }

        val id = SmsLogStore.add(ctx, sender, body, timestamp, SmsLogStore.STATUS_QUEUED, "")
        val pending = goAsync()
        ApiClient.async(ctx) { c ->
            val ok = ApiClient.sendSms(c, id, sender, body, timestamp)
            if (!ok) {
                Prefs.queueSms(c, id, sender, body, timestamp)
                OutboxWorker.schedule(c)          // exponential-backoff retry (5 attempts)
                ApiClient.drainOutbox(c)          // opportunistic drain of older failures (v1 logic)
            }
            pending.finish()
        }
    }
}
