package com.invokeil.pay

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Local SMS log — SharedPreferences JSON, capped at 200 entries, newest first.
 * Every received SMS lands here (forwarded or filtered) for full transparency.
 */
object SmsLogStore {

    const val STATUS_FORWARDED = "FORWARDED"
    const val STATUS_QUEUED = "QUEUED"
    const val STATUS_FAILED = "FAILED"
    const val STATUS_FILTERED = "FILTERED"

    /** Machine-readable reasons, mapped to human strings in the UI. */
    const val REASON_NOT_WHITELISTED = "NOT_WHITELISTED"
    const val REASON_OTP = "OTP_BLOCKED"
    const val REASON_NOT_PAIRED = "NOT_PAIRED"
    const val REASON_KEY_REJECTED = "KEY_REJECTED"
    const val REASON_NETWORK = "NETWORK"

    private const val PREFS = "invokeil_log"
    private const val MAX = 200

    private fun sp(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    data class Entry(
        val id: String,
        val sender: String,
        val body: String,
        val time: Long,
        val status: String,
        val note: String = ""
    )

    @Synchronized
    fun list(ctx: Context): List<Entry> {
        val arr = JSONArray(sp(ctx).getString("sms_log", "[]"))
        return (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            Entry(
                o.optString("id"), o.optString("sender"), o.optString("body"),
                o.optLong("time"), o.optString("status", STATUS_QUEUED), o.optString("note")
            )
        }
    }

    /** Append an entry (newest first). Returns its id. */
    @Synchronized
    fun add(ctx: Context, sender: String, body: String, time: Long,
            status: String, note: String = ""): String {
        val id = "s" + java.lang.Long.toString(System.currentTimeMillis(), 36) +
            "-" + (0..9999).random()
        val list = mutableListOf(Entry(id, sender, body, time, status, note))
        list.addAll(list(ctx))
        save(ctx, list)
        return id
    }

    @Synchronized
    fun update(ctx: Context, id: String, status: String, note: String? = null) {
        val list = list(ctx).map {
            if (it.id == id) it.copy(status = status, note = note ?: it.note) else it
        }
        save(ctx, list)
    }

    @Synchronized
    fun clear(ctx: Context) = sp(ctx).edit().putString("sms_log", "[]").apply()

    private fun save(ctx: Context, list: List<Entry>) {
        val arr = JSONArray()
        list.take(MAX).forEach { e ->
            arr.put(
                JSONObject()
                    .put("id", e.id).put("sender", e.sender).put("body", e.body)
                    .put("time", e.time).put("status", e.status).put("note", e.note)
            )
        }
        sp(ctx).edit().putString("sms_log", arr.toString()).apply()
    }
}
