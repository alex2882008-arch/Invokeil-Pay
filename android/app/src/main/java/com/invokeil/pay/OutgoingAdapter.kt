package com.invokeil.pay

import android.content.Context
import android.content.res.ColorStateList
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.invokeil.pay.databinding.ItemOutgoingBinding
import java.util.Locale

/**
 * Outgoing payments adapter. Rows show the payout command (mfs → number,
 * amount, note) with a status chip; DISPATCHED rows expose Confirm / Failed
 * action buttons that POST the result back to the panel.
 */
class OutgoingAdapter(
    private val onConfirm: (OutgoingCommand) -> Unit,
    private val onFailed: (OutgoingCommand) -> Unit,
) : ListAdapter<OutgoingCommand, OutgoingAdapter.VH>(DIFF) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
        VH(ItemOutgoingBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) = holder.bind(getItem(position))

    inner class VH(private val binding: ItemOutgoingBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(c: OutgoingCommand) {
            val ctx: Context = binding.root.context
            binding.textTitle.text = c.mfs
            binding.textDetail.text = c.toNumber
            binding.textAmount.text = String.format(Locale.getDefault(), "৳%,.2f", c.amount)
            binding.textNote.text = c.note?.takeIf { it.isNotBlank() } ?: "—"

            val (labelRes, colorRes) = chipFor(c.status)
            binding.chipStatus.text = ctx.getString(labelRes)
            binding.chipStatus.backgroundTintList =
                ColorStateList.valueOf(ContextCompat.getColor(ctx, colorRes))

            val actionable = c.status == "DISPATCHED" || c.status == "QUEUED"
            binding.btnConfirm.visibility = if (actionable) View.VISIBLE else View.GONE
            binding.btnFailed.visibility = if (actionable) View.VISIBLE else View.GONE
            binding.btnConfirm.setOnClickListener { if (actionable) onConfirm(c) }
            binding.btnFailed.setOnClickListener { if (actionable) onFailed(c) }
        }

        private fun chipFor(status: String): Pair<Int, Int> = when (status) {
            "CONFIRMED" -> R.string.outgoing_confirmed to R.color.status_forwarded
            "DISPATCHED" -> R.string.outgoing_dispatched to R.color.brand_primary
            "QUEUED" -> R.string.status_queued to R.color.status_queued
            "FAILED" -> R.string.status_failed to R.color.status_failed
            else -> R.string.outgoing_cancelled to R.color.status_filtered
        }
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<OutgoingCommand>() {
            override fun areItemsTheSame(o: OutgoingCommand, n: OutgoingCommand) = o.id == n.id
            override fun areContentsTheSame(o: OutgoingCommand, n: OutgoingCommand) = o == n
        }
    }
}
