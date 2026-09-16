package com.invokeil.pay

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Persistent foreground listener — the "LISTENING" state users see on the dashboard.
 *
 * • Low-importance ongoing notification "Invokeil Pay — listening for payment SMS".
 * • Heartbeat every 30 s while running (live stats for the panel) + outbox drain,
 *   so queued messages go out even between WorkManager passes.
 * • START_STICKY + BootReceiver restart → survives reboots and process death.
 */
class ListenerService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Notifier.createChannels(this)
        Prefs.setServiceRunning(this, true)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, notification)
        }
        scope.launch {
            while (isActive) {
                try {
                    if (Prefs.isConfigured(applicationContext)) {
                        ApiClient.drainOutbox(applicationContext)
                        ApiClient.heartbeat(applicationContext)
                    }
                } catch (e: Exception) {
                    // keep looping — next tick retries
                }
                delay(HEARTBEAT_INTERVAL_MS)
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        Prefs.setServiceRunning(this, false)
        scope.cancel()
        super.onDestroy()
    }

    private fun buildNotification(): Notification {
        val pi = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, Notifier.CHANNEL_SERVICE)
            .setSmallIcon(R.drawable.ic_shield)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(getString(R.string.notif_text, Prefs.url(this)))
            .setContentIntent(pi)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    companion object {
        private const val NOTIF_ID = 1001
        private const val HEARTBEAT_INTERVAL_MS = 30_000L

        fun start(ctx: Context) {
            val i = Intent(ctx, ListenerService::class.java)
            ContextCompat.startForegroundService(ctx, i)
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, ListenerService::class.java))
        }
    }
}
