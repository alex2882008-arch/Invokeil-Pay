package com.invokeil.pay

import android.content.Context

/**
 * v2 smart SMS gate.
 *
 * Only whitelisted payment-provider senders are forwarded. Any message that looks
 * like an OTP / PIN / password is blocked locally and never leaves the phone.
 * Fail-safe: if the stored whitelist cannot be read, the built-in default list is used.
 */
object SmsGate {

    /** Built-in payment-provider sender IDs (Bangladesh MFS + banks). */
    val DEFAULT_SENDERS = listOf(
        "bKash", "NAGAD", "16216", "8446", "UPAY", "uPay", "Tap.", "16259",
        "CellFin", "TeleCash", "mCash", "OKWallet", "PathaoPay", "iPay", "09638-900800"
    )

    /** Messages containing any of these (as standalone words) are filtered locally. */
    private val NEGATIVE_KEYWORDS = listOf(
        "otp", "o.t.p", "one time password", "one-time password", "passcode",
        "password", "pin", "pin code", "verification code", "verify code",
        "security code", "activation code", "confirmation code",
        "ওটিপি", "পিন", "পাসওয়ার্ড"
    )

    // Lookarounds (not \b) so Bengali words are handled correctly too.
    private val NEGATIVE_REGEX = Regex(
        "(?<![\\p{L}\\p{N}])(?:" +
            NEGATIVE_KEYWORDS.joinToString("|") { Regex.escape(it) } +
            ")(?![\\p{L}\\p{N}])",
        RegexOption.IGNORE_CASE
    )

    private fun normalize(s: String): String =
        s.trim().lowercase().filter { it.isLetterOrDigit() }

    /** Exact match after normalization; numeric shortcodes also match inside sender IDs. */
    fun senderMatches(sender: String, whitelist: Collection<String>): Boolean {
        val n = normalize(sender)
        if (n.isEmpty()) return false
        for (w in whitelist) {
            val nw = normalize(w)
            if (nw.isEmpty()) continue
            if (n == nw) return true
            // Numeric shortcodes can arrive as "bKash-16216" style sender IDs.
            if (nw.length >= 4 && nw.all { it.isDigit() } && n.contains(nw)) return true
        }
        return false
    }

    data class Decision(val forward: Boolean, val reason: String)

    /** Gate decision for an incoming SMS. */
    fun evaluate(ctx: Context, sender: String, body: String): Decision {
        val whitelist = try {
            DEFAULT_SENDERS + Prefs.customSenders(ctx)
        } catch (e: Exception) {
            DEFAULT_SENDERS // fail-safe
        }
        return when {
            !senderMatches(sender, whitelist) ->
                Decision(false, SmsLogStore.REASON_NOT_WHITELISTED)
            NEGATIVE_REGEX.containsMatchIn(body) ->
                Decision(false, SmsLogStore.REASON_OTP)
            else ->
                Decision(true, "")
        }
    }
}
