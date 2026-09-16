package com.invokeil.pay

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * After reboot: restart the persistent foreground listener (v2) and keep the
 * 15-min heartbeat work scheduled (v1 logic preserved).
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED && Prefs.onboarded(context)) {
            HeartbeatWorker.schedule(context)
            if (Prefs.isConfigured(context)) ListenerService.start(context)
        }
    }
}
