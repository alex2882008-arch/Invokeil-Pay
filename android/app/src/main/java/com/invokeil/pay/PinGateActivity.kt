package com.invokeil.pay

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.invokeil.pay.databinding.ActivityPinBinding
import java.security.MessageDigest

/**
 * App-lock gate: biometric prompt when available, 4-digit PIN fallback.
 * Shown before MainActivity whenever the lock is enabled.
 */
class PinGateActivity : AppCompatActivity() {

    private lateinit var b: ActivityPinBinding
    private var attempts = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityPinBinding.inflate(layoutInflater)
        setContentView(b.root)

        b.btnUnlock.setOnClickListener { verifyPin() }
        b.btnUsePin.setOnClickListener { showPinInput() }

        val canBio = BiometricManager.from(this)
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) ==
            BiometricManager.BIOMETRIC_SUCCESS
        if (canBio && savedInstanceState == null) showBiometric() else showPinInput()
    }

    private fun showBiometric() {
        b.pinBox.visibility = View.GONE
        b.btnUsePin.visibility = View.VISIBLE
        val prompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    unlock()
                }

                override fun onAuthenticationError(code: Int, errString: CharSequence) {
                    if (code != BiometricPrompt.ERROR_NEGATIVE_BUTTON) showPinInput()
                }
            }
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(getString(R.string.biometric_title))
            .setSubtitle(getString(R.string.biometric_sub))
            .setNegativeButtonText(getString(R.string.btn_use_pin))
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
            .build()
        prompt.authenticate(info)
    }

    private fun showPinInput() {
        b.pinBox.visibility = View.VISIBLE
        b.btnUsePin.visibility = View.GONE
    }

    private fun verifyPin() {
        val entered = b.inputPin.text?.toString()?.trim().orEmpty()
        if (entered.length != 4 || hash(entered) != Prefs.pinHash(this)) {
            attempts++
            b.pinError.visibility = View.VISIBLE
            b.pinError.text = getString(R.string.err_pin_wrong)
            if (attempts >= 5) finishAffinity()
            return
        }
        unlock()
    }

    private fun unlock() {
        unlockedNow = true
        setResult(RESULT_OK)
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    companion object {
        /** True while the app stays open after a successful unlock. */
        @Volatile
        var unlockedNow = false

        fun hash(pin: String): String =
            MessageDigest.getInstance("SHA-256").digest(pin.toByteArray())
                .joinToString("") { "%02x".format(it) }
    }
}
