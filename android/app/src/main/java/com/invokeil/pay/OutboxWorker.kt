package com.invokeil.pay

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Immediate retry pass for the SMS outbox, scheduled with exponential backoff
 * (30 s → 1 min → 2 min → …). Messages that fail ApiClient.MAX_ATTEMPTS times are
 * marked FAILED in the log and dropped from the queue.
 */
class OutboxWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        if (!Prefs.isConfigured(ctx)) return Result.success()
        val left = ApiClient.drainOutbox(ctx)
        return if (left > 0) Result.retry() else Result.success()
    }

    companion object {
        fun schedule(ctx: Context) {
            val req = OneTimeWorkRequestBuilder<OutboxWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(ctx)
                .enqueueUniqueWork("invokeil-outbox", ExistingWorkPolicy.KEEP, req)
        }
    }
}
