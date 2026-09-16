package com.invokeil.pay

import android.content.Context
import android.content.res.ColorStateList
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.invokeil.pay.databinding.ItemNotificationBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Feed adapter for /api/v1/device/notifications.
 * Kind drives the leading icon (payment / email / sms) and the status chip color.
 */
class NotificationAdapter : ListAdapter<DeviceNotification, NotificationAdapter.VH>(DIFF) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
        VH(ItemNotificationBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) = holder.bind(getItem(position))

    inner class VH(private val binding: ItemNotificationBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(n: DeviceNotification) {
            val ctx: Context = binding.root.context
            binding.textTitle.text = n.title.ifEmpty { "—" }
            binding.textDetail.text = n.detail
            binding.textTime.text = fmt(n.at)
            binding.textKind.text = kindIcon(n.kind)

            val (labelRes, colorRes) = chipFor(n.status)
            binding.chipStatus.text = ctx.getString(labelRes)
            binding.chipStatus.backgroundTintList =
                ColorStateList.valueOf(ContextCompat.getColor(ctx, colorRes))
        }
    }

    private fun kindIcon(kind: String): String = when (kind) {
        "email" -> "✉"
        "sms" -> "💬"
        else -> "💸" // payment
    }

    private fun chipFor(status: String): Pair<Int, Int> = when (status.uppercase(Locale.US)) {
        "PAID", "MATCHED", "SENT", "DELIVERED", "OPENED", "CLICKED" ->
            R.string.status_forwarded to R.color.status_forwarded
        "QUEUED", "PENDING" ->
            R.string.status_queued to R.color.status_queued
        "FAILED", "BOUNCED", "REVERSED" ->
            R.string.status_failed to R.color.status_failed
        else ->
            R.string.status_filtered to R.color.status_filtered
    }

    private fun fmt(iso: String): String = try {
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
        parser.timeZone = TimeZone.getTimeZone("UTC")
        val d = parser.parse(iso.take(23))
        if (d != null) SimpleDateFormat("MMM d, HH:mm", Locale.getDefault()).format(d)
        else "—"
    } catch (e: Exception) {
        "—"
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<DeviceNotification>() {
            override fun areItemsTheSame(o: DeviceNotification, n: DeviceNotification) =
                o.at == n.at && o.title == n.title && o.kind == n.kind

            override fun areContentsTheSame(o: DeviceNotification, n: DeviceNotification) = o == n
        }
    }
}
