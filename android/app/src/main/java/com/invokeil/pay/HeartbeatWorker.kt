package com.invokeil.pay

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Periodic heartbeat (every 15 min — WorkManager minimum) so the panel knows the
 * device is alive even when the foreground service was killed, plus retry of any
 * SMS stuck in the outbox (v1 logic preserved).
 */
class HeartbeatWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        if (!Prefs.isConfigured(ctx)) return Result.success()
        ApiClient.drainOutbox(ctx)
        ApiClient.heartbeat(ctx)
        return Result.success()
    }

    companion object {
        fun schedule(ctx: Context) {
            val req = PeriodicWorkRequestBuilder<HeartbeatWorker>(15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                "invokeil-heartbeat",
                ExistingPeriodicWorkPolicy.KEEP,
                req
            )
        }
    }
}
