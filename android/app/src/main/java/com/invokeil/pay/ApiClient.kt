package com.invokeil.pay

import android.content.Context
import android.os.BatteryManager
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/** Result of talking to the panel. */
sealed class ApiResult {
    object Success : ApiResult()
    data class SuccessData<T>(val value: T) : ApiResult()
    data class AuthError(val code: Int) : ApiResult()
    data class HttpError(val code: Int, val message: String) : ApiResult()
    data class NetworkError(val message: String) : ApiResult()
}

/** One entry of the /api/v1/device/notifications merged feed. */
data class DeviceNotification(
    val kind: String,      // payment | email | sms
    val title: String,
    val detail: String,
    val at: String,        // ISO-8601
    val status: String,
)

/** One row of the /api/v1/device/commands outgoing-payment queue. */
data class OutgoingCommand(
    val id: String,
    val mfs: String,
    val toNumber: String,
    val amount: Double,
    val note: String?,
    val status: String,    // QUEUED | DISPATCHED | CONFIRMED | FAILED | CANCELLED
)

/** One gateway of the /api/v1/device/config response. */
data class GatewayInfo(
    val code: String,
    val name: String,
    val mfs: String,
    val enabled: Boolean,
)

/** Device-scoped settings from /api/v1/device/config. */
data class DeviceConfig(
    val brandName: String,
    val appMode: String,   // SANDBOX | PRODUCTION
    val gateways: List<GatewayInfo>,
)

/**
 * HTTP client for the panel.
 *
 * Contracts (exact):
 *  POST {base}/api/v1/sms        header X-Device-Key: ilp_xxx
 *       body { "messages": [ { sender, body, receivedAt: "2026-09-16T10:00:00.000Z", simNumber } ] }
 *       → 200 { results: [ { smsId, parsed, transactionId?, matched?, note? } ] }, batch 1–50
 *       401/403 = bad/revoked key → Prefs.authError
 *  POST {base}/api/v1/heartbeat  header X-Device-Key
 *       body { battery, signal, model, androidVersion, appVersion, sims: [{ number, carrier }] }
 *       → 200 { ok: true }
 */
object ApiClient {

    const val MAX_ATTEMPTS = 5
    private const val BATCH_MAX = 50

    private val json = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private fun get(baseUrl: String, deviceKey: String, path: String): Pair<Int, String> {
        val req = Request.Builder()
            .url(baseUrl.trimEnd('/') + path)
            .header("X-Device-Key", deviceKey)
            .get()
            .build()
        client.newCall(req).execute().use { res ->
            return Pair(res.code, res.body?.string() ?: "")
        }
    }

    private fun post(baseUrl: String, deviceKey: String, path: String,
                     body: JSONObject): Pair<Int, String> {
        val req = Request.Builder()
            .url(baseUrl.trimEnd('/') + path)
            .header("X-Device-Key", deviceKey)
            .post(body.toString().toRequestBody(json))
            .build()
        client.newCall(req).execute().use { res ->
            return Pair(res.code, res.body?.string() ?: "")
        }
    }

    private fun classify(code: Int, body: String): ApiResult = when {
        code in 200..299 -> ApiResult.Success
        code == 401 || code == 403 -> ApiResult.AuthError(code)
        else -> ApiResult.HttpError(code, body.take(160))
    }

    /** ISO-8601 UTC timestamp, e.g. 2026-09-16T10:00:00.000Z */
    private fun iso(ms: Long): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date(ms))

    /**
     * One batch (≤50) forward to /api/v1/sms. On success the SMS log entries are
     * marked FORWARDED (with the panel's TrxID when returned) and counters bumped.
     */
    fun forwardChunk(ctx: Context, chunk: List<OutboxItem>): ApiResult {
        val payload = JSONObject().put("messages", JSONArray().apply {
            chunk.take(BATCH_MAX).forEach { m ->
                put(
                    JSONObject()
                        .put("sender", m.sender)
                        .put("body", m.body)
                        .put("receivedAt", iso(m.ts))
                        .put("simNumber", Prefs.simNumber(ctx))
                )
            }
        })
        return try {
            val (code, body) = post(Prefs.url(ctx), Prefs.key(ctx), "/api/v1/sms", payload)
            val res = classify(code, body)
            when (res) {
                is ApiResult.Success -> {
                    Prefs.setAuthError(ctx, false)
                    annotateAndCount(ctx, chunk.take(BATCH_MAX), body)
                }
                is ApiResult.AuthError -> Prefs.setAuthError(ctx, true)
                else -> Unit
            }
            res
        } catch (e: Exception) {
            ApiResult.NetworkError(e.message ?: "network error")
        }
    }

    private fun annotateAndCount(ctx: Context, sent: List<OutboxItem>, responseBody: String) {
        val results = try {
            JSONObject(responseBody).optJSONArray("results")
        } catch (e: Exception) {
            null
        }
        sent.forEachIndexed { i, m ->
            var note = ""
            try {
                val r = results?.optJSONObject(i)
                if (r != null) {
                    val trx = r.optString("transactionId", "")
                    if (trx.isNotEmpty()) note = "TrxID $trx"
                    else if (!r.optBoolean("parsed", true)) note = r.optString("note", "")
                }
            } catch (e: Exception) {
                // cosmetic only — the message was delivered
            }
            SmsLogStore.update(ctx, m.id, SmsLogStore.STATUS_FORWARDED, note)
            Prefs.bumpForwarded(ctx)
            Notifier.notifyForwarded(ctx, m.sender, m.body)
        }
    }

    /**
     * Retry everything in the outbox (≤50 per request). Messages that fail
     * MAX_ATTEMPTS times are marked FAILED in the log and dropped from the queue.
     * Returns the number of messages still queued.
     */
    fun drainOutbox(ctx: Context): Int {
        if (!Prefs.isConfigured(ctx)) return Prefs.outboxCount(ctx)
        var items = Prefs.outboxItems(ctx)
        var guard = 0
        while (items.isNotEmpty() && guard++ < 20) {
            val chunk = items.sortedBy { it.ts }.take(BATCH_MAX)
            val res = forwardChunk(ctx, chunk)
            if (res is ApiResult.Success) {
                items = items.filterNot { o -> chunk.any { c -> c.id == o.id } }
                Prefs.saveOutbox(ctx, items)
                continue
            }
            if (res is ApiResult.AuthError) Prefs.setAuthError(ctx, true)
            // Failed this cycle: bump attempt counters, give up after MAX_ATTEMPTS.
            val inChunk: (OutboxItem) -> Boolean = { o -> chunk.any { c -> c.id == o.id } }
            val failedNow = items.filter { inChunk(it) && it.attempts + 1 >= MAX_ATTEMPTS }
            items = items.map { if (inChunk(it)) it.copy(attempts = it.attempts + 1) else it }
                .filterNot { o -> failedNow.any { it.id == o.id } }
            Prefs.saveOutbox(ctx, items)
            failedNow.forEach {
                SmsLogStore.update(ctx, it.id, SmsLogStore.STATUS_FAILED, SmsLogStore.REASON_NETWORK)
            }
            if (failedNow.isNotEmpty()) Notifier.notifyFailed(ctx, failedNow.size)
            break // wait for the next retry cycle (exponential backoff)
        }
        return items.size
    }

    /** Forward one freshly received SMS. Returns true on 2xx. On failure the caller queues it. */
    fun sendSms(ctx: Context, id: String, sender: String, body: String, receivedAt: Long): Boolean {
        val item = OutboxItem(id, sender, body, receivedAt, 0)
        return forwardChunk(ctx, listOf(item)) is ApiResult.Success
    }

    /** Heartbeat with battery / signal / SIM info. Also caches the SIM number. */
    fun heartbeat(ctx: Context): ApiResult {
        val sims = simArray(ctx)
        val payload = JSONObject()
            .put("battery", batteryPct(ctx))
            .put("signal", signalLabel(ctx))
            .put("model", android.os.Build.MODEL)
            .put("androidVersion", android.os.Build.VERSION.RELEASE)
            .put("appVersion", BuildConfig.VERSION_NAME)
            .put("sims", sims)
        if (Prefs.simNumber(ctx).isEmpty() && sims.length() > 0) {
            Prefs.setSimNumber(ctx, sims.getJSONObject(0).optString("number", ""))
        }
        return try {
            val (code, body) = post(Prefs.url(ctx), Prefs.key(ctx), "/api/v1/heartbeat", payload)
            val res = classify(code, body)
            when (res) {
                is ApiResult.Success -> {
                    Prefs.setLastSync(ctx, System.currentTimeMillis())
                    Prefs.setAuthError(ctx, false)
                }
                is ApiResult.AuthError -> Prefs.setAuthError(ctx, true)
                else -> Unit
            }
            res
        } catch (e: Exception) {
            ApiResult.NetworkError(e.message ?: "network error")
        }
    }

    /**
     * Merged recent activity feed: last payments, sent emails and sent SMS
     * (30 items, newest first). GET /api/v1/device/notifications.
     */
    fun getNotifications(ctx: Context): ApiResult {
        return try {
            val (code, body) = get(Prefs.url(ctx), Prefs.key(ctx), "/api/v1/device/notifications")
            when {
                code in 200..299 -> {
                    Prefs.setAuthError(ctx, false)
                    val items = mutableListOf<DeviceNotification>()
                    val arr = try { JSONObject(body).optJSONArray("notifications") } catch (e: Exception) { null }
                    for (i in 0 until (arr?.length() ?: 0)) {
                        val o = arr!!.optJSONObject(i) ?: continue
                        items.add(
                            DeviceNotification(
                                kind = o.optString("kind", "payment"),
                                title = o.optString("title", ""),
                                detail = o.optString("detail", ""),
                                at = o.optString("at", ""),
                                status = o.optString("status", ""),
                            )
                        )
                    }
                    ApiResult.SuccessData(items)
                }
                code == 401 || code == 403 -> {
                    Prefs.setAuthError(ctx, true)
                    ApiResult.AuthError(code)
                }
                else -> ApiResult.HttpError(code, body.take(160))
            }
        } catch (e: Exception) {
            ApiResult.NetworkError(e.message ?: "network error")
        }
    }

    /**
     * Payout commands for this device. QUEUED rows claimed by this call come
     * back as DISPATCHED. GET /api/v1/device/commands.
     */
    fun getCommands(ctx: Context): ApiResult {
        return try {
            val (code, body) = get(Prefs.url(ctx), Prefs.key(ctx), "/api/v1/device/commands")
            when {
                code in 200..299 -> {
                    Prefs.setAuthError(ctx, false)
                    val items = mutableListOf<OutgoingCommand>()
                    val arr = try { JSONObject(body).optJSONArray("commands") } catch (e: Exception) { null }
                    for (i in 0 until (arr?.length() ?: 0)) {
                        val o = arr!!.optJSONObject(i) ?: continue
                        items.add(
                            OutgoingCommand(
                                id = o.optString("id", ""),
                                mfs = o.optString("mfs", ""),
                                toNumber = o.optString("toNumber", ""),
                                amount = o.optDouble("amount", 0.0),
                                note = if (o.isNull("note")) null else o.optString("note", ""),
                                status = o.optString("status", "DISPATCHED"),
                            )
                        )
                    }
                    ApiResult.SuccessData(items)
                }
                code == 401 || code == 403 -> {
                    Prefs.setAuthError(ctx, true)
                    ApiResult.AuthError(code)
                }
                else -> ApiResult.HttpError(code, body.take(160))
            }
        } catch (e: Exception) {
            ApiResult.NetworkError(e.message ?: "network error")
        }
    }

    /**
     * Report the result of executing an outgoing payment.
     * POST /api/v1/device/commands  { id, result: CONFIRMED|FAILED, ref?, error? }
     */
    fun postCommandResult(ctx: Context, id: String, result: String,
                          ref: String? = null, error: String? = null): ApiResult {
        val payload = JSONObject()
            .put("id", id)
            .put("result", result)
        if (!ref.isNullOrEmpty()) payload.put("ref", ref)
        if (!error.isNullOrEmpty()) payload.put("error", error)
        return try {
            val (code, body) = post(Prefs.url(ctx), Prefs.key(ctx), "/api/v1/device/commands", payload)
            when {
                code in 200..299 -> {
                    Prefs.setAuthError(ctx, false)
                    ApiResult.Success
                }
                code == 401 || code == 403 -> {
                    Prefs.setAuthError(ctx, true)
                    ApiResult.AuthError(code)
                }
                else -> ApiResult.HttpError(code, body.take(160))
            }
        } catch (e: Exception) {
            ApiResult.NetworkError(e.message ?: "network error")
        }
    }

    /**
     * Device-scoped settings for the home screen (brand name, gateways, app mode).
     * GET /api/v1/device/config.
     */
    fun getDeviceConfig(ctx: Context): ApiResult {
        return try {
            val (code, body) = get(Prefs.url(ctx), Prefs.key(ctx), "/api/v1/device/config")
            when {
                code in 200..299 -> {
                    Prefs.setAuthError(ctx, false)
                    val cfg = try { JSONObject(body).optJSONObject("config") } catch (e: Exception) { null }
                    val gateways = mutableListOf<GatewayInfo>()
                    val arr = cfg?.optJSONArray("gateways")
                    for (i in 0 until (arr?.length() ?: 0)) {
                        val g = arr!!.optJSONObject(i) ?: continue
                        gateways.add(
                            GatewayInfo(
                                code = g.optString("code", ""),
                                name = g.optString("name", ""),
                                mfs = g.optString("mfs", ""),
                                enabled = g.optBoolean("enabled", true),
                            )
                        )
                    }
                    val model = DeviceConfig(
                        brandName = cfg?.optString("brandName", "Invokeil Pay") ?: "Invokeil Pay",
                        appMode = cfg?.optString("appMode", "SANDBOX") ?: "SANDBOX",
                        gateways = gateways,
                    )
                    ApiResult.SuccessData(model)
                }
                code == 401 || code == 403 -> {
                    Prefs.setAuthError(ctx, true)
                    ApiResult.AuthError(code)
                }
                else -> ApiResult.HttpError(code, body.take(160))
            }
        } catch (e: Exception) {
            ApiResult.NetworkError(e.message ?: "network error")
        }
    }

    /** Quick connectivity test with explicit credentials (onboarding / edit pairing). */
    fun testConnection(ctx: Context, baseUrl: String, deviceKey: String): ApiResult {
        if (!baseUrl.startsWith("http")) return ApiResult.HttpError(0, "bad URL")
        val payload = JSONObject()
            .put("battery", batteryPct(ctx))
            .put("signal", signalLabel(ctx))
            .put("model", android.os.Build.MODEL)
            .put("androidVersion", android.os.Build.VERSION.RELEASE)
            .put("appVersion", BuildConfig.VERSION_NAME)
            .put("sims", JSONArray())
        return try {
            val (code, body) = post(baseUrl, deviceKey, "/api/v1/heartbeat", payload)
            val res = classify(code, body)
            if (res is ApiResult.Success) {
                Prefs.setLastSync(ctx, System.currentTimeMillis())
                Prefs.setAuthError(ctx, false)
            }
            res
        } catch (e: Exception) {
            ApiResult.NetworkError(e.message ?: "network error")
        }
    }

    /** Human-readable failure message for toasts. */
    fun message(result: ApiResult): String = when (result) {
        is ApiResult.Success -> ""
        is ApiResult.SuccessData<*> -> ""
        is ApiResult.AuthError -> "HTTP ${result.code}"
        is ApiResult.HttpError -> if (result.code == 0) result.message
            else "HTTP ${result.code} — ${result.message}"
        is ApiResult.NetworkError -> result.message
    }

    // ── Device info helpers (v1 logic preserved) ─────────────────────────────

    private fun batteryPct(ctx: Context): Int {
        val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return -1
        return try {
            bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        } catch (e: Exception) {
            -1
        }
    }

    private fun signalLabel(ctx: Context): String {
        return try {
            val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
                ?: return "UNKNOWN"
            val st = tm.signalStrength ?: return "NONE"
            @Suppress("DEPRECATION")
            when {
                st.level >= 3 -> "EXCELLENT"
                st.level == 2 -> "GOOD"
                st.level == 1 -> "POOR"
                else -> "NONE"
            }
        } catch (e: Exception) {
            "UNKNOWN"
        }
    }

    private fun simArray(ctx: Context): JSONArray {
        val arr = JSONArray()
        try {
            val sm = ctx.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE)
                as? SubscriptionManager
            val subs = sm?.activeSubscriptionInfoList ?: return arr
            for (s in subs) {
                val number = try {
                    // SubscriptionInfo.getNumber() — public since API 29 (our minSdk);
                    // returns "" when the carrier doesn't store MSISDN on the SIM.
                    s.number ?: ""
                } catch (e: Exception) {
                    ""
                }
                arr.put(
                    JSONObject()
                        .put("number", number.removePrefix("+88"))
                        .put("carrier", s.carrierName?.toString() ?: "SIM")
                )
            }
        } catch (e: Exception) {
            // permission not granted — send empty array, panel falls back to defaults
        }
        return arr
    }

    fun async(ctx: Context, block: (Context) -> Unit) {
        CoroutineScope(Dispatchers.Default).launch { block(ctx.applicationContext) }
    }

    suspend fun onMain(block: () -> Unit) = withContext(Dispatchers.Main) { block() }
}
