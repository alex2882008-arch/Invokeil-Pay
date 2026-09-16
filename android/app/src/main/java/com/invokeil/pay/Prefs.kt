package com.invokeil.pay

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Persisted app state: panel credentials, counters, outbox, settings. */
object Prefs {

    private const val FILE = "invokeil_prefs"

    private fun sp(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    // ── Panel credentials ────────────────────────────────────────────────────

    fun url(ctx: Context): String =
        sp(ctx).getString("panel_url", "")!!.trim().trimEnd('/')

    fun setUrl(ctx: Context, v: String) =
        sp(ctx).edit().putString("panel_url", v.trim()).apply()

    fun key(ctx: Context): String = sp(ctx).getString("device_key", "") ?: ""

    fun setKey(ctx: Context, v: String) =
        sp(ctx).edit().putString("device_key", v.trim()).apply()

    fun deviceName(ctx: Context): String = sp(ctx).getString("device_name", "") ?: ""

    fun setDeviceName(ctx: Context, v: String) =
        sp(ctx).edit().putString("device_name", v).apply()

    fun pairingCode(ctx: Context): String = sp(ctx).getString("pairing_code", "") ?: ""

    fun setPairingCode(ctx: Context, v: String) =
        sp(ctx).edit().putString("pairing_code", v.trim()).apply()

    fun isConfigured(ctx: Context): Boolean =
        url(ctx).startsWith("http") && key(ctx).length > 8

    /** Set when the panel answered 401/403 — the key is bad or revoked. */
    fun authError(ctx: Context): Boolean = sp(ctx).getBoolean("auth_error", false)

    fun setAuthError(ctx: Context, v: Boolean) =
        sp(ctx).edit().putBoolean("auth_error", v).apply()

    /** Unpair: forget everything pairing-related (counters and log are kept). */
    fun clearCredentials(ctx: Context) {
        sp(ctx).edit()
            .remove("panel_url").remove("device_key")
            .remove("device_name").remove("pairing_code")
            .putBoolean("auth_error", false)
            .apply()
    }

    // ── Counters (dashboard stats) ───────────────────────────────────────────

    private fun todayKey(): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    fun forwardedToday(ctx: Context): Int {
        val s = sp(ctx)
        return if (s.getString("fwd_date", "") == todayKey()) s.getInt("fwd_today", 0) else 0
    }

    fun bumpForwarded(ctx: Context) {
        val s = sp(ctx)
        val cur = if (s.getString("fwd_date", "") == todayKey()) s.getInt("fwd_today", 0) else 0
        s.edit()
            .putString("fwd_date", todayKey())
            .putInt("fwd_today", cur + 1)
            .putInt("fwd_total", s.getInt("fwd_total", 0) + 1)
            .apply()
    }

    fun totalForwarded(ctx: Context): Int = sp(ctx).getInt("fwd_total", 0)

    fun lastSync(ctx: Context): Long = sp(ctx).getLong("last_sync", 0)

    fun setLastSync(ctx: Context, v: Long) = sp(ctx).edit().putLong("last_sync", v).apply()

    /** SIM number reported in heartbeats, reused as `simNumber` on forwarded SMS. */
    fun simNumber(ctx: Context): String = sp(ctx).getString("sim_number", "") ?: ""

    fun setSimNumber(ctx: Context, v: String) =
        sp(ctx).edit().putString("sim_number", v).apply()

    // ── Outbox (retry queue, v1 logic extended) ──────────────────────────────

    fun queueSms(ctx: Context, id: String, sender: String, body: String, ts: Long, attempts: Int = 0) {
        val arr = JSONArray(sp(ctx).getString("outbox", "[]"))
        arr.put(
            JSONObject()
                .put("id", id)
                .put("sender", sender)
                .put("body", body)
                .put("ts", ts)
                .put("attempts", attempts)
        )
        while (arr.length() > 200) arr.remove(0)
        sp(ctx).edit().putString("outbox", arr.toString()).apply()
    }

    fun outboxItems(ctx: Context): List<OutboxItem> {
        val arr = JSONArray(sp(ctx).getString("outbox", "[]"))
        return (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            OutboxItem(
                o.optString("id"), o.optString("sender"), o.optString("body"),
                o.optLong("ts"), o.optInt("attempts", 0)
            )
        }
    }

    fun saveOutbox(ctx: Context, items: List<OutboxItem>) {
        val arr = JSONArray()
        items.forEach {
            arr.put(
                JSONObject()
                    .put("id", it.id).put("sender", it.sender).put("body", it.body)
                    .put("ts", it.ts).put("attempts", it.attempts)
            )
        }
        sp(ctx).edit().putString("outbox", arr.toString()).apply()
    }

    fun outboxCount(ctx: Context): Int = outboxItems(ctx).size

    // ── Whitelist: user-added custom senders ─────────────────────────────────

    fun customSenders(ctx: Context): Set<String> =
        sp(ctx).getStringSet("custom_senders", emptySet()) ?: emptySet()

    fun addCustomSender(ctx: Context, sender: String) {
        val cur = customSenders(ctx).toMutableSet()
        cur.add(sender.trim())
        sp(ctx).edit().putStringSet("custom_senders", cur).apply()
    }

    fun removeCustomSender(ctx: Context, sender: String) {
        val cur = customSenders(ctx).toMutableSet()
        cur.remove(sender.trim())
        sp(ctx).edit().putStringSet("custom_senders", cur).apply()
    }

    // ── Settings ─────────────────────────────────────────────────────────────

    /** 0 = follow system, 1 = light, 2 = dark */
    fun themeMode(ctx: Context): Int = sp(ctx).getInt("theme_mode", 0)

    fun setThemeMode(ctx: Context, v: Int) = sp(ctx).edit().putInt("theme_mode", v).apply()

    fun language(ctx: Context): String = sp(ctx).getString("lang", "en") ?: "en"

    fun setLanguage(ctx: Context, v: String) = sp(ctx).edit().putString("lang", v).apply()

    fun statusNotifications(ctx: Context): Boolean =
        sp(ctx).getBoolean("status_notifications", true)

    fun setStatusNotifications(ctx: Context, v: Boolean) =
        sp(ctx).edit().putBoolean("status_notifications", v).apply()

    // ── App lock (4-digit PIN, stored SHA-256) ───────────────────────────────

    fun appLockEnabled(ctx: Context): Boolean =
        sp(ctx).getBoolean("app_lock", false) && pinHash(ctx).isNotEmpty()

    fun pinHash(ctx: Context): String = sp(ctx).getString("pin_hash", "") ?: ""

    fun setPinHash(ctx: Context, hash: String) =
        sp(ctx).edit().putString("pin_hash", hash).putBoolean("app_lock", hash.isNotEmpty()).apply()

    // ── Onboarding / foreground service flag ─────────────────────────────────

    fun onboarded(ctx: Context): Boolean = sp(ctx).getBoolean("onboarded", false)

    fun setOnboarded(ctx: Context, v: Boolean) =
        sp(ctx).edit().putBoolean("onboarded", v).apply()

    fun serviceRunning(ctx: Context): Boolean = sp(ctx).getBoolean("service_running", false)

    fun setServiceRunning(ctx: Context, v: Boolean) =
        sp(ctx).edit().putBoolean("service_running", v).apply()
}

/** One message waiting in the retry outbox. */
data class OutboxItem(
    val id: String,
    val sender: String,
    val body: String,
    val ts: Long,
    val attempts: Int
)
