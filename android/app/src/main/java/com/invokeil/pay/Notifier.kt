package com.invokeil.pay

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * Status notifications (forwarded / failed) — a separate, dismissible channel from the
 * persistent foreground "listening" notification. Controlled by the Settings toggle.
 */
object Notifier {

    const val CHANNEL_SERVICE = "invokeil_listener"   // CHANNEL_LOW
    const val CHANNEL_ALERTS = "invokeil_alerts"      // forwarding events

    fun createChannels(ctx: Context) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_SERVICE,
                ctx.getString(R.string.notif_channel_service),
                NotificationManager.IMPORTANCE_LOW
            )
        )
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ALERTS,
                ctx.getString(R.string.notif_channel_alerts),
                NotificationManager.IMPORTANCE_DEFAULT
            )
        )
    }

    private fun canNotify(ctx: Context): Boolean =
        Prefs.statusNotifications(ctx) &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    private fun mainIntent(ctx: Context): PendingIntent =
        PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    fun notifyForwarded(ctx: Context, sender: String, body: String) {
        if (!canNotify(ctx)) return
        val text = ctx.getString(R.string.alert_forwarded_body, sender, body.take(160))
        val n: Notification = NotificationCompat.Builder(ctx, CHANNEL_ALERTS)
            .setSmallIcon(R.drawable.ic_shield)
            .setContentTitle(ctx.getString(R.string.alert_forwarded_title))
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(mainIntent(ctx))
            .setAutoCancel(true)
            .build()
        runCatching { NotificationManagerCompat.from(ctx).notify(sender.hashCode(), n) }
    }

    fun notifyFailed(ctx: Context, count: Int) {
        if (!canNotify(ctx)) return
        val n: Notification = NotificationCompat.Builder(ctx, CHANNEL_ALERTS)
            .setSmallIcon(R.drawable.ic_warning)
            .setContentTitle(ctx.getString(R.string.alert_failed_title))
            .setContentText(ctx.getString(R.string.alert_failed_body, count))
            .setContentIntent(mainIntent(ctx))
            .setAutoCancel(true)
            .build()
        runCatching { NotificationManagerCompat.from(ctx).notify(9001, n) }
    }
}
