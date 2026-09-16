package com.invokeil.pay

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.core.os.LocaleListCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.invokeil.pay.databinding.ActivityOnboardingBinding
import org.json.JSONObject

/**
 * First-run onboarding, 3 steps:
 *  1. Welcome (brand hero + EN/বাংলা toggle)
 *  2. Pair (scan the panel QR or enter manually + test connection)
 *  3. Permissions (SMS / notifications / battery, each with rationale;
 *     the full prominent disclosure is shown BEFORE the SMS permission prompt).
 */
class OnboardingActivity : AppCompatActivity() {

    private lateinit var b: ActivityOnboardingBinding
    private var step = 1

    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        val contents = result.contents ?: return@registerForActivityResult
        applyPairingJson(contents)
    }

    private val smsPerms =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            refreshPermStep()
        }

    private val notifPerm =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            refreshPermStep()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityOnboardingBinding.inflate(layoutInflater)
        setContentView(b.root)

        // ── Step 1: welcome ──────────────────────────────────────────────────
        b.viewWelcome.toggleLang.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (isChecked) {
                setLanguage(if (checkedId == R.id.btn_lang_bn) "bn" else "en")
            }
        }
        val current = AppCompatDelegate.getApplicationLocales().toLanguageTags()
            .takeIf { it.isNotEmpty() } ?: Prefs.language(this)
        b.viewWelcome.toggleLang.check(if (current.startsWith("bn")) R.id.btn_lang_bn else R.id.btn_lang_en)
        b.viewWelcome.btnStart.setOnClickListener { showStep(2) }

        // ── Step 2: pair ─────────────────────────────────────────────────────
        b.viewPair.btnScan.setOnClickListener { launchScanner() }
        b.viewPair.btnTest.setOnClickListener { testConnection() }
        b.viewPair.btnContinue.setOnClickListener { showStep(3) }

        // ── Step 3: permissions ──────────────────────────────────────────────
        b.viewPerm.btnGrantSms.setOnClickListener { onGrantSms() }
        b.viewPerm.btnGrantNotif.setOnClickListener {
            if (Build.VERSION.SDK_INT >= 33) {
                notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                refreshPermStep()
            }
        }
        b.viewPerm.btnGrantBattery.setOnClickListener { openBatterySettings() }
        b.viewPerm.btnFinish.setOnClickListener { finishSetup() }

        showStep(savedInstanceState?.getInt("step", if (Prefs.isConfigured(this)) 3 else 1)
            ?: (if (Prefs.isConfigured(this)) 3 else 1))
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putInt("step", step)
    }

    private fun setLanguage(lang: String) {
        Prefs.setLanguage(this, lang)
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(lang))
    }

    private fun showStep(s: Int) {
        step = s
        b.viewWelcome.root.visibility = if (s == 1) View.VISIBLE else View.GONE
        b.viewPair.root.visibility = if (s == 2) View.VISIBLE else View.GONE
        b.viewPerm.root.visibility = if (s == 3) View.VISIBLE else View.GONE
        b.stepLabel.text = getString(R.string.ob_step_of, s)
        if (s == 3) refreshPermStep()
    }

    // ── Pairing ──────────────────────────────────────────────────────────────

    private fun launchScanner() {
        val opts = ScanOptions()
            .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
            .setPrompt(getString(R.string.scan_prompt))
            .setBeepEnabled(false)
            .setOrientationLocked(true)
        scanLauncher.launch(opts)
    }

    /** QR contains JSON: { "url": "https://panel-base", "key": "ilp_xxx", "code": "123456" } */
    private fun applyPairingJson(contents: String) {
        try {
            val o = JSONObject(contents)
            val url = o.optString("url", "")
            val key = o.optString("key", "")
            val code = o.optString("code", "")
            if (!url.startsWith("http") || !key.startsWith("ilp_")) throw IllegalArgumentException()
            b.viewPair.inputUrl.setText(url)
            b.viewPair.inputKey.setText(key)
            if (code.isNotEmpty()) b.viewPair.inputCode.setText(code)
            testConnection()
        } catch (e: Exception) {
            b.viewPair.statusText.text = getString(R.string.err_scan_invalid)
        }
    }

    private fun testConnection() {
        val url = b.viewPair.inputUrl.text?.toString()?.trim().orEmpty()
        val key = b.viewPair.inputKey.text?.toString()?.trim().orEmpty()
        val code = b.viewPair.inputCode.text?.toString()?.trim().orEmpty()
        if (!url.startsWith("http")) {
            b.viewPair.statusText.text = getString(R.string.err_bad_url)
            return
        }
        if (!key.startsWith("ilp_")) {
            b.viewPair.statusText.text = getString(R.string.err_bad_key)
            return
        }
        Prefs.setUrl(this, url)
        Prefs.setKey(this, key)
        if (code.isNotEmpty()) Prefs.setPairingCode(this, code)
        if (Prefs.deviceName(this).isEmpty()) Prefs.setDeviceName(this, Build.MODEL)

        b.viewPair.btnTest.isEnabled = false
        b.viewPair.statusText.text = getString(R.string.testing)
        ApiClient.async(this) { ctx ->
            val res = ApiClient.testConnection(ctx, url, key)
            val ok = res is ApiResult.Success
            if (ok) HeartbeatWorker.schedule(ctx)
            ApiClient.onMain {
                b.viewPair.btnTest.isEnabled = true
                b.viewPair.btnContinue.isEnabled = ok
                b.viewPair.statusText.text = if (ok) getString(R.string.connected_ok)
                    else getString(R.string.test_fail, ApiClient.message(res))
            }
        }
    }

    // ── Permissions ──────────────────────────────────────────────────────────

    private fun onGrantSms() {
        // Prominent disclosure — shown BEFORE the runtime permission prompt.
        MaterialAlertDialogBuilder(this)
            .setTitle(getString(R.string.disclosure_title))
            .setMessage(getString(R.string.disclosure_body))
            .setPositiveButton(getString(R.string.disclosure_accept)) { _, _ ->
                smsPerms.launch(
                    arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS)
                )
            }
            .setNegativeButton(getString(R.string.disclosure_decline), null)
            .show()
    }

    private fun refreshPermStep() {
        val smsOk = ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) ==
            PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) ==
            PackageManager.PERMISSION_GRANTED
        val notifOk = Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        val battOk = batteryOptOut()
        setPermButton(b.viewPerm.btnGrantSms, smsOk)
        setPermButton(b.viewPerm.btnGrantNotif, notifOk)
        setPermButton(b.viewPerm.btnGrantBattery, battOk)
    }

    private fun setPermButton(btn: MaterialButton, ok: Boolean) {
        btn.text = getString(if (ok) R.string.granted else R.string.btn_grant)
        btn.isEnabled = !ok
    }

    private fun batteryOptOut(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    private fun openBatterySettings() {
        try {
            startActivity(
                Intent(
                    Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:$packageName")
                )
            )
        } catch (e: Exception) {
            try {
                startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            } catch (e2: Exception) {
                // no-op
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (step == 3) refreshPermStep()
    }

    private fun finishSetup() {
        Prefs.setOnboarded(this, true)
        HeartbeatWorker.schedule(this)
        if (Prefs.isConfigured(this)) ListenerService.start(this)
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
