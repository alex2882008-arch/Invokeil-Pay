package com.invokeil.pay

import android.app.Application
import androidx.appcompat.app.AppCompatDelegate

/**
 * Application bootstrap: notification channels, DayNight theme, 15-min heartbeat work.
 * Language (EN/বাংলা) is persisted by AppCompat per-app locales (autoStoreLocales).
 */
class App : Application() {

    override fun onCreate() {
        super.onCreate()
        Notifier.createChannels(this)
        App.applyTheme(Prefs.themeMode(this))
        HeartbeatWorker.schedule(this)
    }

    companion object {
        /** 0 = follow system, 1 = light, 2 = dark */
        fun applyTheme(mode: Int) {
            AppCompatDelegate.setDefaultNightMode(
                when (mode) {
                    1 -> AppCompatDelegate.MODE_NIGHT_NO
                    2 -> AppCompatDelegate.MODE_NIGHT_YES
                    else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
                }
            )
        }
    }
}
