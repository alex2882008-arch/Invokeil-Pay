# Invokeil Pay — Companion Android App (v2.0.0)

The Invokeil Pay companion app runs on a **merchant's own Android phone** (the phone whose SIM
receives bKash/NAGAD/… payment SMS) and forwards whitelisted payment SMS to the Invokeil Pay
panel in real time, so customer payments are verified automatically.

- Package: `com.invokeil.pay` · minSdk 29 (Android 10) · targetSdk 35 (Android 15)
- Language: Kotlin · AGP 8.x (Gradle 8.7) · ViewBinding · Material 3 (brand `#2563EB`)
- Languages: English + বাংলা (full in-app toggle, per-app locale)

---

## 1. What's new in v2

| Area | v1 | v2 |
|---|---|---|
| Onboarding | single setup form | 3-step wizard: Welcome (EN/বাংলা) → Pair (QR scan / manual + test) → Permissions (rationale cards + prominent disclosure) |
| Pairing | manual URL+key | **Scan panel QR** (`com.journeyapps:zxing-android-embedded:4.3.0`) containing `{"url":"…","key":"ilp_…","code":"123456"}`, or manual entry, with a live connection test |
| Dashboard | — | paired-status card (panel URL, device, unpair), pulsing LISTENING/PAUSED indicator, counters (forwarded today / total / queued-failed / last sync), test connection, send test SMS, open web dashboard |
| SMS gate | forward-only | sender whitelist + OTP/PIN negative keywords → non-transactional SMS logged locally as **FILTERED** and never uploaded |
| SMS log | — | local log (cap 200) with status chips (FORWARDED / QUEUED / FAILED / FILTERED), filter chips, tap for full body + retry |
| Background | WorkManager heartbeat | + persistent foreground service (30 s live heartbeat & outbox drain), WorkManager 15-min heartbeat, outbox retry with exponential backoff, BootReceiver restart |
| Theming | light only | DayNight dark mode + in-app override (system/light/dark) |
| Security | — | optional app lock (4-digit PIN, SHA-256 stored + biometric prompt) |
| Settings | — | language, theme, app lock, custom senders editor, disclosure viewer, unpair, version |

## 2. Build

```bash
# Android Studio Ladybug+ or any AGP 8.x install
cd InvokeilPay-Android
./gradlew :app:assembleDebug     # debug APK
./gradlew :app:assembleRelease   # release (add signing config first)
```

Requirements: JDK 17, Android SDK 35. No API keys or secrets are needed to build; the device key
is entered at pairing time.

## 3. Pairing

1. In the web panel: **Devices → Add device** — a QR code + 6-digit pairing code are shown.
   The QR encodes JSON: `{"url":"https://panel-base","key":"ilp_xxx","code":"123456"}`.
2. In the app onboarding, step 2 **Pair**: tap *Scan QR code* (or type URL + key manually).
3. Tap *Connect & test* — the app calls `POST /api/v1/heartbeat` and shows ✓ on success.
   The device key is stored locally and sent as the `X-Device-Key` header on every call.

### Server API used

- `POST {base}/api/v1/sms` — body `{"messages":[{"sender","body","receivedAt" ISO-8601,"simNumber"}]}`,
  batch ≤ 50 → `{"results":[{smsId,parsed,matched,note}]}`. 401/403 ⇒ the app flags the key as rejected.
- `POST {base}/api/v1/heartbeat` — body `{battery, signal, model, androidVersion, appVersion,
  sims:[{number, carrier}]}` → `{"ok":true}`.
- Heartbeat cadence: every 30 s while the foreground service runs, plus a WorkManager 15-min
  safety net; failed SMS forwards retry with exponential backoff (5 attempts) then land in the
  log as FAILED.

## 4. Permissions & why (Play-store rationale)

| Permission | Why it is needed |
|---|---|
| `RECEIVE_SMS` / `READ_SMS` | Core function: capture incoming mobile-money payment SMS on the SIM owner's own phone so the panel can verify payments. A **prominent disclosure dialog** is shown immediately before the runtime prompt. |
| `POST_NOTIFICATIONS` | Shows the persistent "listening" status and forwarding results (Android 13+). |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Keeps SMS forwarding instant when the phone dozes; requested via the standard system dialog. |
| `FOREGROUND_SERVICE(SPECIAL_USE)` | Keeps the always-on listener alive; subtype declared in the manifest. |
| `READ_PHONE_STATE` / `READ_PHONE_NUMBERS` | Optional: reports the SIM number/carrier in heartbeats; degrades gracefully if denied. |

**Data handling:** SMS content is used solely for payment verification, sent only to the panel
the user paired with, never sold and never shared with other third parties. OTP/PIN/code
messages are filtered on-device and never leave the phone. Everything forwarded is visible in
the in-app SMS log and can be stopped instantly via **Unpair**. See
[PROMINENT_DISCLOSURE.md](PROMINENT_DISCLOSURE.md) for the exact disclosure text.

## 5. OEM battery-optimization steps (recommended per device)

Without an exemption, aggressive OEM power managers can delay or kill the listener:

- **Stock Android/Pixel:** Settings → Apps → Invokeil Pay → Battery → **Unrestricted**.
- **Samsung:** Settings → Battery → Background usage limits → remove Invokeil Pay from
  "Sleeping apps"; App battery usage → **Unrestricted**. Also disable "Put unused apps to sleep"
  for this app.
- **Xiaomi/POCO:** App info → **Autostart ON** → Battery saver → **No restrictions**, then
  battery icon → lock the app in Recents.
- **Oppo/Realme/OnePlus:** App info → Battery → **Allow background activity / Don't optimize**;
  enable Auto-launch where present.
- **Huawei:** Settings → Battery → App launch → Invokeil Pay → **Manage manually**: all three
  toggles ON.
- **Vivo/iQOO:** Settings → Battery → Background power consumption → **Allow high background
  power consumption**; enable Autostart.

The in-app Permissions step requests the Android-standard exemption; the above are OEM extras.

## 6. Project structure

```
app/src/main/java/com/invokeil/pay/
  App.kt              application: channels, DayNight theme, heartbeat scheduling
  Prefs.kt            credentials, counters, outbox, settings (SharedPreferences)
  SmsReceiver.kt      SMS_RECEIVED: PDU multipart merge → gate → forward/queue/log
  SmsGate.kt          whitelist (bKash, NAGAD, 16216, 8446, UPAY, 16259, CellFin, TeleCash,
                      mCash, OKWallet, PathaoPay, iPay + custom) + OTP/PIN negative keywords
  ApiClient.kt        OkHttp: /api/v1/sms + /api/v1/heartbeat, outbox drain, test-connection
  OutboxWorker.kt     one-time retry worker, exponential backoff (30 s → …, 5 attempts)
  HeartbeatWorker.kt  periodic 15-min heartbeat + outbox drain
  ListenerService.kt  persistent foreground service (specialUse): 30 s heartbeat + drain
  BootReceiver.kt     restarts service + heartbeat after reboot
  Notifier.kt         status channels: persistent listener + forwarded/failed alerts
  SmsLogStore.kt      local SMS log (SharedPreferences JSON, cap 200)
  OnboardingActivity.kt   3-step wizard (welcome/pair/permissions + prominent disclosure)
  MainActivity.kt     bottom-nav host: Dashboard / SMS log / Settings (+ PIN gate)
  DashboardFragment.kt    status card, counters, test/send-test/open-dashboard, unpair
  SmsLogFragment.kt   filter chips, detail dialog, retry
  SmsLogAdapter.kt    ListAdapter + DiffUtil
  SettingsFragment.kt language, theme, PIN lock, custom senders, disclosure, unpair, version
  PinGateActivity.kt  biometric + 4-digit PIN lock
app/src/main/res/values/strings.xml      English
app/src/main/res/values-bn/strings.xml   বাংলা (all strings)
app/src/main/res/values/themes.xml       Material3 DayNight, brand #2563EB, rounded shapes
```

## 7. Compliance notes

- The app is a **default-SMS-app-free** listener: it only *observes* incoming SMS and never
  deletes/sends messages, so it must ship with the prominent disclosure below (Play policy for
  restricted SMS/Call Log permission use). It is intended for merchant-side distribution
  (sideload/direct/managed Play listing) — not for the general consumer Play catalogue.
- Clearlog: the local log can be wiped in-app; unpairing stops all forwarding immediately.
