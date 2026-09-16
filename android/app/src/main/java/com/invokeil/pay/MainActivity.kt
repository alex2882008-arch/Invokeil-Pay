package com.invokeil.pay

import android.content.Intent
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import com.invokeil.pay.databinding.ActivityMainBinding

/**
 * Post-setup home: bottom navigation between Dashboard / SMS log / Notifications /
 * Outgoing / Settings. Gates the app behind the PIN lock when enabled, and routes
 * first-run users to the 3-step onboarding (Welcome → Pair → Permissions).
 */
class MainActivity : AppCompatActivity() {

    private var b: ActivityMainBinding? = null

    private val pinLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == RESULT_OK) setupUi() else finish()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!Prefs.onboarded(this)) {
            startActivity(Intent(this, OnboardingActivity::class.java))
            finish()
            return
        }

        if (Prefs.appLockEnabled(this) && !PinGateActivity.unlockedNow) {
            pinLauncher.launch(Intent(this, PinGateActivity::class.java))
            return // PinGateActivity is opaque; UI is built once unlocked
        }

        setupUi()
    }

    private fun setupUi() {
        if (b != null) return
        val binding = ActivityMainBinding.inflate(layoutInflater)
        b = binding
        setContentView(binding.root)

        binding.bottomNav.setOnItemSelectedListener { item ->
            show(
                when (item.itemId) {
                    R.id.nav_log -> TAG_LOG
                    R.id.nav_notifications -> TAG_NOTIFICATIONS
                    R.id.nav_outgoing -> TAG_OUTGOING
                    R.id.nav_settings -> TAG_SETTINGS
                    else -> TAG_DASHBOARD
                }
            )
            true
        }
        show(TAG_DASHBOARD)
    }

    /** Select a tab programmatically (used by dashboard summary cards). */
    fun openTab(tag: String) {
        val itemId = when (tag) {
            TAG_LOG -> R.id.nav_log
            TAG_NOTIFICATIONS -> R.id.nav_notifications
            TAG_OUTGOING -> R.id.nav_outgoing
            TAG_SETTINGS -> R.id.nav_settings
            else -> R.id.nav_dashboard
        }
        b?.bottomNav?.setSelectedItemId(itemId)
    }

    private fun show(selected: String) {
        val fm = supportFragmentManager
        val tx = fm.beginTransaction()
        tx.setReorderingAllowed(true)
        for (tag in listOf(TAG_DASHBOARD, TAG_LOG, TAG_NOTIFICATIONS, TAG_OUTGOING, TAG_SETTINGS)) {
            val f = fm.findFragmentByTag(tag)
            if (tag == selected) {
                if (f == null) tx.add(R.id.fragment_container, newFragment(tag), tag)
                else tx.show(f)
            } else {
                f?.let { tx.hide(it) }
            }
        }
        tx.commit()
    }

    private fun newFragment(tag: String): Fragment = when (tag) {
        TAG_LOG -> SmsLogFragment()
        TAG_NOTIFICATIONS -> NotificationsFragment()
        TAG_OUTGOING -> OutgoingFragment()
        TAG_SETTINGS -> SettingsFragment()
        else -> DashboardFragment()
    }

    companion object {
        const val TAG_DASHBOARD = "dashboard"
        const val TAG_LOG = "log"
        const val TAG_NOTIFICATIONS = "notifications"
        const val TAG_OUTGOING = "outgoing"
        const val TAG_SETTINGS = "settings"
    }
}
