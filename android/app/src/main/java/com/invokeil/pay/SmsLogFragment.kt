package com.invokeil.pay

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.invokeil.pay.databinding.DialogSmsDetailBinding
import com.invokeil.pay.databinding.FragmentSmsLogBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * SMS log with filter chips (All / Forwarded / Queued / Failed / Filtered).
 * Tap a row for the full body + retry for failed/queued entries.
 * Non-transactional SMS are shown here as FILTERED — never forwarded.
 */
class SmsLogFragment : Fragment() {

    private var _b: FragmentSmsLogBinding? = null
    private val b get() = _b!!
    private lateinit var adapter: SmsLogAdapter
    private var filter: String? = null // null = all

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _b = FragmentSmsLogBinding.inflate(inflater, container, false)
        return b.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        adapter = SmsLogAdapter { entry -> showDetail(entry) }
        b.recycler.layoutManager = LinearLayoutManager(requireContext())
        b.recycler.adapter = adapter

        b.chipGroup.setOnCheckedStateChangeListener { _, checkedIds ->
            filter = when (checkedIds.firstOrNull()) {
                R.id.chip_forwarded -> SmsLogStore.STATUS_FORWARDED
                R.id.chip_queued -> SmsLogStore.STATUS_QUEUED
                R.id.chip_failed -> SmsLogStore.STATUS_FAILED
                R.id.chip_filtered -> SmsLogStore.STATUS_FILTERED
                else -> null
            }
            reload()
        }

        b.btnClear.setOnClickListener { confirmClear() }
        reload()
    }

    override fun onResume() {
        super.onResume()
        reload()
    }

    private fun reload() {
        val all = SmsLogStore.list(requireContext())
        val shown = if (filter == null) all else all.filter { it.status == filter }
        adapter.submitList(shown)
        b.emptyState.visibility = if (shown.isEmpty()) View.VISIBLE else View.GONE
        b.recycler.visibility = if (shown.isEmpty()) View.GONE else View.VISIBLE
    }

    private fun statusLabel(s: String): Int = when (s) {
        SmsLogStore.STATUS_FORWARDED -> R.string.status_forwarded
        SmsLogStore.STATUS_QUEUED -> R.string.status_queued
        SmsLogStore.STATUS_FAILED -> R.string.status_failed
        else -> R.string.status_filtered
    }

    private fun reasonLabel(note: String): String = when (note) {
        "" -> "—"
        SmsLogStore.REASON_NOT_WHITELISTED -> getString(R.string.reason_not_whitelisted)
        SmsLogStore.REASON_OTP -> getString(R.string.reason_otp)
        SmsLogStore.REASON_NOT_PAIRED -> getString(R.string.reason_not_paired)
        SmsLogStore.REASON_KEY_REJECTED -> getString(R.string.reason_key_rejected)
        SmsLogStore.REASON_NETWORK -> getString(R.string.reason_network)
        else -> note
    }

    private fun fmtFull(ms: Long): String =
        SimpleDateFormat("MMM d, yyyy HH:mm:ss", Locale.getDefault()).format(Date(ms))

    private fun showDetail(entry: SmsLogStore.Entry) {
        val ctx = requireContext()
        val d = DialogSmsDetailBinding.inflate(layoutInflater)
        d.textSender.text = entry.sender
        d.textTime.text = fmtFull(entry.time)
        d.textStatus.setText(statusLabel(entry.status))
        d.textNote.text = reasonLabel(entry.note)
        d.textBody.text = entry.body

        val builder = MaterialAlertDialogBuilder(ctx)
            .setTitle(getString(R.string.detail_title, entry.sender))
            .setView(d.root)
            .setPositiveButton(R.string.ok, null)
        if (entry.status == SmsLogStore.STATUS_FAILED ||
            entry.status == SmsLogStore.STATUS_QUEUED
        ) {
            builder.setNegativeButton(R.string.btn_retry) { _, _ -> retry(entry) }
        }
        builder.show()
    }

    private fun retry(entry: SmsLogStore.Entry) {
        val ctx = requireContext()
        lifecycleScope.launch(Dispatchers.IO) {
            val ok = Prefs.isConfigured(ctx) &&
                ApiClient.sendSms(ctx, entry.id, entry.sender, entry.body, entry.time)
            if (ok) {
                SmsLogStore.update(ctx, entry.id, SmsLogStore.STATUS_FORWARDED, "")
                Prefs.bumpForwarded(ctx)
                Prefs.saveOutbox(ctx, Prefs.outboxItems(ctx).filterNot { it.id == entry.id })
            } else {
                Prefs.queueSms(ctx, entry.id, entry.sender, entry.body, entry.time)
                OutboxWorker.schedule(ctx)
            }
            withContext(Dispatchers.Main) {
                reload()
                Toast.makeText(
                    ctx,
                    if (ok) R.string.retried_ok else R.string.retried_fail,
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    private fun confirmClear() {
        MaterialAlertDialogBuilder(requireContext())
            .setMessage(getString(R.string.clear_log_confirm))
            .setPositiveButton(R.string.ok) { _, _ ->
                SmsLogStore.clear(requireContext())
                reload()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    override fun onDestroyView() {
        _b = null
        super.onDestroyView()
    }
}
