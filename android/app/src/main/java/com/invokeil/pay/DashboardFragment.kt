package com.invokeil.pay

import android.animation.ValueAnimator
import android.content.Intent
import android.content.res.ColorStateList
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.invokeil.pay.databinding.DialogPairingBinding
import com.invokeil.pay.databinding.FragmentDashboardBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Dashboard: status header card (paired + panel URL + device, edit/unpair),
 * live stats (refreshed every 30 s), big LISTENING/PAUSED indicator with pulse,
 * test-connection / send-test-SMS / open-web-dashboard actions, SANDBOX mode
 * badge, and Notifications / Outgoing payments summary cards (v3).
 */
class DashboardFragment : Fragment() {

    private var _b: FragmentDashboardBinding? = null
    private val b get() = _b!!
    private var pulse: ValueAnimator? = null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _b = FragmentDashboardBinding.inflate(inflater, container, false)
        return b.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        b.btnTest.setOnClickListener { testConnection() }
        b.btnSendTest.setOnClickListener { sendTestSms() }
        b.btnOpenDashboard.setOnClickListener { openDashboard() }
        b.btnEdit.setOnClickListener { showEditDialog() }
        b.btnUnpair.setOnClickListener { confirmUnpair() }

        // v3: summary cards open their tabs; the outgoing card can also refresh counts.
        b.cardNotifications.setOnClickListener {
            (activity as? MainActivity)?.openTab(MainActivity.TAG_NOTIFICATIONS)
        }
        b.cardOutgoing.setOnClickListener {
            (activity as? MainActivity)?.openTab(MainActivity.TAG_OUTGOING)
        }
        b.btnOutgoingRefresh.setOnClickListener { loadSummary() }

        // Live stats: refresh every 30 s while visible (counters + last sync).
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.RESUMED) {
                while (isActive) {
                    delay(30_000)
                    refresh()
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun refresh() {
        val ctx = requireContext()
        val configured = Prefs.isConfigured(ctx)
        val listening = configured && Prefs.serviceRunning(ctx) && smsGranted(ctx)

        b.textTitle.setText(if (configured) R.string.dash_paired else R.string.dash_unpaired)
        b.textUrl.text = Prefs.url(ctx).ifEmpty { "—" }
        b.textDevice.text = Prefs.deviceName(ctx).ifEmpty { android.os.Build.MODEL }
        b.bannerAuth.visibility = if (Prefs.authError(ctx)) View.VISIBLE else View.GONE

        if (listening) {
            b.textStatus.setText(R.string.dash_status_listening)
            b.textStatusSub.setText(R.string.dash_sub_listening)
            b.dotStatus.backgroundTintList =
                ColorStateList.valueOf(ContextCompat.getColor(ctx, R.color.status_forwarded))
            startPulse()
        } else {
            b.textStatus.setText(R.string.dash_status_paused)
            b.textStatusSub.setText(R.string.dash_sub_paused)
            b.dotStatus.backgroundTintList =
                ColorStateList.valueOf(ContextCompat.getColor(ctx, R.color.status_queued))
            stopPulse()
        }

        b.statToday.text = Prefs.forwardedToday(ctx).toString()
        b.statTotal.text = Prefs.totalForwarded(ctx).toString()
        b.statQueue.text = Prefs.outboxCount(ctx).toString()
        b.statSync.text = Prefs.lastSync(ctx).takeIf { it > 0 }
            ?.let { fmt(it) } ?: getString(R.string.value_never)

        loadSummary()
    }

    /**
     * v3 summary: SANDBOX badge from device config, notifications count and
     * outgoing command count from the panel. Silent on failure — the dashboard
     * keeps working offline.
     */
    private fun loadSummary() {
        val ctx = requireContext()
        if (!Prefs.isConfigured(ctx)) return
        viewLifecycleOwner.lifecycleScope.launch(Dispatchers.IO) {
            val cfgRes = ApiClient.getDeviceConfig(ctx)
            val cfg = (cfgRes as? ApiResult.SuccessData<DeviceConfig>)?.value
            val notifRes = ApiClient.getNotifications(ctx)
            val notifCount = (notifRes as? ApiResult.SuccessData<List<DeviceNotification>>)?.value?.size
            val cmdRes = ApiClient.getCommands(ctx)
            val cmdCount = (cmdRes as? ApiResult.SuccessData<List<OutgoingCommand>>)?.value?.size
            withContext(Dispatchers.Main) {
                if (_b == null) return@withContext
                // SANDBOX badge
                b.badgeMode.visibility =
                    if (cfg?.appMode == "SANDBOX") View.VISIBLE else View.GONE
                // Notifications count
                b.textNotifCount.text = notifCount?.let {
                    getString(R.string.dash_count_recent, it)
                } ?: "—"
                // Outgoing count
                b.textOutgoingCount.text = cmdCount?.let {
                    getString(R.string.dash_count_active, it)
                } ?: "—"
            }
        }
    }

    private fun startPulse() {
        if (pulse?.isRunning == true) return
        pulse = ValueAnimator.ofFloat(1f, 1.45f).apply {
            duration = 900
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            addUpdateListener { a ->
                _b?.let {
                    it.dotStatus.scaleX = a.animatedValue as Float
                    it.dotStatus.scaleY = a.animatedValue as Float
                }
            }
            start()
        }
    }

    private fun stopPulse() {
        pulse?.cancel()
        pulse = null
        _b?.let {
            it.dotStatus.scaleX = 1f
            it.dotStatus.scaleY = 1f
        }
    }

    private fun fmt(ms: Long): String =
        SimpleDateFormat("MMM d, HH:mm", Locale.getDefault()).format(Date(ms))

    private fun smsGranted(ctx: android.content.Context): Boolean =
        ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.RECEIVE_SMS) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.READ_SMS) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED

    // ── Actions ──────────────────────────────────────────────────────────────

    private fun testConnection() {
        val ctx = requireContext()
        b.btnTest.isEnabled = false
        viewLifecycleOwner.lifecycleScope.launch(Dispatchers.IO) {
            val res = ApiClient.heartbeat(ctx)
            withContext(Dispatchers.Main) {
                b.btnTest.isEnabled = true
                refresh()
                Toast.makeText(
                    ctx,
                    if (res is ApiResult.Success) getString(R.string.test_ok)
                    else getString(R.string.test_fail, ApiClient.message(res)),
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    private fun sendTestSms() {
        val ctx = requireContext()
        if (!Prefs.isConfigured(ctx)) {
            Toast.makeText(ctx, R.string.err_no_config, Toast.LENGTH_SHORT).show()
            return
        }
        viewLifecycleOwner.lifecycleScope.launch(Dispatchers.IO) {
            val body = getString(R.string.test_sms_body)
            val now = System.currentTimeMillis()
            val id = SmsLogStore.add(ctx, "InvokeilPay", body, now, SmsLogStore.STATUS_QUEUED, "")
            val item = OutboxItem(id, "InvokeilPay", body, now, 0)
            val res = ApiClient.forwardChunk(ctx, listOf(item))
            if (res !is ApiResult.Success) {
                Prefs.queueSms(ctx, id, item.sender, item.body, now)
                OutboxWorker.schedule(ctx)
            }
            withContext(Dispatchers.Main) {
                refresh()
                Toast.makeText(
                    ctx,
                    if (res is ApiResult.Success) getString(R.string.test_sms_sent)
                    else getString(R.string.test_sms_queued),
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    private fun openDashboard() {
        val url = Prefs.url(requireContext())
        if (url.startsWith("http")) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } else {
            Toast.makeText(requireContext(), R.string.err_no_config, Toast.LENGTH_SHORT).show()
        }
    }

    private fun showEditDialog() {
        val ctx = requireContext()
        val d = DialogPairingBinding.inflate(layoutInflater)
        d.inputUrl.setText(Prefs.url(ctx))
        d.inputKey.setText(Prefs.key(ctx))
        MaterialAlertDialogBuilder(ctx)
            .setTitle(getString(R.string.dialog_edit_title))
            .setView(d.root)
            .setPositiveButton(getString(R.string.save)) { _, _ ->
                val url = d.inputUrl.text?.toString()?.trim().orEmpty()
                val key = d.inputKey.text?.toString()?.trim().orEmpty()
                if (url.startsWith("http") && key.startsWith("ilp_")) {
                    Prefs.setUrl(ctx, url)
                    Prefs.setKey(ctx, key)
                    testConnection()
                } else {
                    Toast.makeText(ctx, R.string.err_bad_url, Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton(getString(R.string.cancel), null)
            .show()
    }

    private fun confirmUnpair() {
        val ctx = requireContext()
        MaterialAlertDialogBuilder(ctx)
            .setTitle(getString(R.string.unpair_confirm_title))
            .setMessage(getString(R.string.unpair_confirm_body))
            .setPositiveButton(getString(R.string.btn_unpair)) { _, _ ->
                ListenerService.stop(ctx)
                Prefs.clearCredentials(ctx)
                Prefs.setOnboarded(ctx, false)
                startActivity(Intent(ctx, OnboardingActivity::class.java))
                requireActivity().finish()
            }
            .setNegativeButton(getString(R.string.cancel), null)
            .show()
    }

    override fun onDestroyView() {
        stopPulse()
        _b = null
        super.onDestroyView()
    }
}
