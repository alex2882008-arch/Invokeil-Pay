package com.invokeil.pay

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import androidx.fragment.app.Fragment
import com.google.android.material.chip.Chip
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.invokeil.pay.databinding.DialogAddSenderBinding
import com.invokeil.pay.databinding.DialogSetPinBinding
import com.invokeil.pay.databinding.FragmentSettingsBinding

/**
 * Settings: language (EN/বাংলা), theme (system/light/dark), app-lock PIN,
 * event notifications, custom whitelisted senders, SMS-gate info + disclosure,
 * unpair, version. Everything is persisted in [Prefs]; theme/locale apply instantly.
 */
class SettingsFragment : Fragment() {

    private var _b: FragmentSettingsBinding? = null
    private val b get() = _b!!

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _b = FragmentSettingsBinding.inflate(inflater, container, false)
        return b.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val ctx = requireContext()

        // ── Language ─────────────────────────────────────────────────────────
        val current = AppCompatDelegate.getApplicationLocales().toLanguageTags()
            .takeIf { it.isNotEmpty() } ?: Prefs.language(ctx)
        b.toggleLang.check(if (current.startsWith("bn")) R.id.btn_lang_bn else R.id.btn_lang_en)
        b.toggleLang.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (isChecked) {
                val lang = if (checkedId == R.id.btn_lang_bn) "bn" else "en"
                Prefs.setLanguage(ctx, lang)
                AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(lang))
            }
        }

        // ── Theme ────────────────────────────────────────────────────────────
        when (Prefs.themeMode(ctx)) {
            1 -> b.radioTheme.check(R.id.radio_theme_light)
            2 -> b.radioTheme.check(R.id.radio_theme_dark)
            else -> b.radioTheme.check(R.id.radio_theme_system)
        }
        b.radioTheme.setOnCheckedChangeListener { _, checkedId ->
            val mode = when (checkedId) {
                R.id.radio_theme_light -> 1
                R.id.radio_theme_dark -> 2
                else -> 0
            }
            Prefs.setThemeMode(ctx, mode)
            App.applyTheme(mode)
        }

        // ── App lock ─────────────────────────────────────────────────────────
        b.switchAppLock.isChecked = Prefs.appLockEnabled(ctx)
        b.switchAppLock.setOnCheckedChangeListener { _, checked ->
            if (checked) {
                b.switchAppLock.isChecked = false
                showSetPinDialog()
            } else {
                Prefs.setPinHash(ctx, "")
                refreshPinUi()
                Toast.makeText(ctx, R.string.app_lock_disabled, Toast.LENGTH_SHORT).show()
            }
        }
        b.btnPin.setOnClickListener {
            if (Prefs.appLockEnabled(ctx)) {
                Prefs.setPinHash(ctx, "")
                refreshPinUi()
            } else {
                showSetPinDialog()
            }
        }

        // ── Event notifications ──────────────────────────────────────────────
        b.switchNotifications.isChecked = Prefs.statusNotifications(ctx)
        b.switchNotifications.setOnCheckedChangeListener { _, checked ->
            Prefs.setStatusNotifications(ctx, checked)
        }

        // ── Custom senders ───────────────────────────────────────────────────
        b.btnAddSender.setOnClickListener { showAddSenderDialog() }

        // ── SMS gate info / prominent disclosure ─────────────────────────────
        b.btnDisclosure.setOnClickListener {
            MaterialAlertDialogBuilder(ctx)
                .setTitle(getString(R.string.disclosure_title))
                .setMessage(getString(R.string.disclosure_body))
                .setPositiveButton(R.string.ok, null)
                .show()
        }

        // ── Unpair ───────────────────────────────────────────────────────────
        b.btnUnpair.setOnClickListener {
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

        // ── Version ──────────────────────────────────────────────────────────
        b.textVersion.text =
            getString(R.string.settings_version) + ": Invokeil Pay v" + BuildConfig.VERSION_NAME
    }

    override fun onResume() {
        super.onResume()
        refreshPinUi()
        reloadSenders()
    }

    private fun refreshPinUi() {
        val ctx = context ?: return
        val enabled = Prefs.appLockEnabled(ctx)
        _b?.let {
            it.switchAppLock.isChecked = enabled
            it.btnPin.setText(if (enabled) R.string.btn_remove_pin else R.string.btn_set_pin)
        }
    }

    private fun showSetPinDialog() {
        val ctx = context ?: return
        val d = DialogSetPinBinding.inflate(layoutInflater)
        MaterialAlertDialogBuilder(ctx)
            .setTitle(getString(R.string.dialog_pin_title))
            .setView(d.root)
            .setPositiveButton(getString(R.string.save)) { _, _ ->
                val p1 = d.inputPinNew.text?.toString()?.trim().orEmpty()
                val p2 = d.inputPinConfirm.text?.toString()?.trim().orEmpty()
                when {
                    p1.length != 4 || p1.any { !it.isDigit() } ->
                        Toast.makeText(ctx, R.string.err_pin_digits, Toast.LENGTH_LONG).show()
                    p1 != p2 ->
                        Toast.makeText(ctx, R.string.err_pin_mismatch, Toast.LENGTH_LONG).show()
                    else -> {
                        Prefs.setPinHash(ctx, PinGateActivity.hash(p1))
                        refreshPinUi()
                    }
                }
            }
            .setNegativeButton(getString(R.string.cancel), null)
            .show()
    }

    private fun showAddSenderDialog() {
        val ctx = context ?: return
        val d = DialogAddSenderBinding.inflate(layoutInflater)
        MaterialAlertDialogBuilder(ctx)
            .setTitle(getString(R.string.dialog_sender_title))
            .setView(d.root)
            .setPositiveButton(getString(R.string.save)) { _, _ ->
                val s = d.inputSender.text?.toString()?.trim().orEmpty()
                if (s.isNotEmpty()) {
                    Prefs.addCustomSender(ctx, s)
                    reloadSenders()
                    Toast.makeText(ctx, R.string.sender_added, Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton(getString(R.string.cancel), null)
            .show()
    }

    private fun reloadSenders() {
        val ctx = context ?: return
        val group = _b?.chipSenders ?: return
        group.removeAllViews()
        val senders = Prefs.customSenders(ctx).sorted()
        _b?.textSendersHint?.visibility = if (senders.isEmpty()) View.GONE else View.VISIBLE
        senders.forEach { sender ->
            val chip = Chip(requireContext())
            chip.text = sender
            chip.isCloseIconVisible = false
            chip.setOnClickListener {
                Prefs.removeCustomSender(ctx, sender)
                reloadSenders()
                Toast.makeText(ctx, R.string.sender_removed, Toast.LENGTH_SHORT).show()
            }
            group.addView(chip)
        }
    }

    override fun onDestroyView() {
        _b = null
        super.onDestroyView()
    }
}
