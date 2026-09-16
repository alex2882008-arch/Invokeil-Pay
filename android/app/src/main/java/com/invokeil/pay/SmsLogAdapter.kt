package com.invokeil.pay

import android.content.Context
import android.content.res.ColorStateList
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.invokeil.pay.databinding.ItemSmsLogBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** RecyclerView + ListAdapter DiffUtil for the SMS log (no jank on updates). */
class SmsLogAdapter(private val onClick: (SmsLogStore.Entry) -> Unit) :
    ListAdapter<SmsLogStore.Entry, SmsLogAdapter.VH>(DIFF) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
        VH(ItemSmsLogBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) = holder.bind(getItem(position))

    inner class VH(private val binding: ItemSmsLogBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(e: SmsLogStore.Entry) {
            val ctx: Context = binding.root.context
            binding.textSender.text = e.sender
            binding.textBody.text = e.body.replace('\n', ' ')
            binding.textTime.text =
                SimpleDateFormat("MMM d, HH:mm", Locale.getDefault()).format(Date(e.time))
            binding.chipStatus.text = ctx.getString(statusLabel(e.status))
            binding.chipStatus.backgroundTintList =
                ColorStateList.valueOf(ContextCompat.getColor(ctx, statusColor(e.status)))
            binding.root.setOnClickListener { onClick(e) }
        }
    }

    private fun statusLabel(s: String): Int = when (s) {
        SmsLogStore.STATUS_FORWARDED -> R.string.status_forwarded
        SmsLogStore.STATUS_QUEUED -> R.string.status_queued
        SmsLogStore.STATUS_FAILED -> R.string.status_failed
        else -> R.string.status_filtered
    }

    private fun statusColor(s: String): Int = when (s) {
        SmsLogStore.STATUS_FORWARDED -> R.color.status_forwarded
        SmsLogStore.STATUS_QUEUED -> R.color.status_queued
        SmsLogStore.STATUS_FAILED -> R.color.status_failed
        else -> R.color.status_filtered
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<SmsLogStore.Entry>() {
            override fun areItemsTheSame(o: SmsLogStore.Entry, n: SmsLogStore.Entry) = o.id == n.id
            override fun areContentsTheSame(o: SmsLogStore.Entry, n: SmsLogStore.Entry) = o == n
        }
    }
}
