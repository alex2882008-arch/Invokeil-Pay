# PROMINENT DISCLOSURE — Invokeil Pay companion app

> Google Play policy requires apps that use the restricted `RECEIVE_SMS` / `READ_SMS`
> permissions to display a prominent disclosure **before** the runtime permission prompt.
> This is the exact text shown in-app (Onboarding → Permissions → *Grant SMS*, string
> `disclosure_body` in `values/strings.xml` and `values-bn/strings.xml`), in English and
> Bengali. It is repeated in Settings → *View SMS disclosure*.

---

## English

**SMS data disclosure**

Invokeil Pay collects incoming SMS messages and forwards them to the panel you pair it with,
for the sole purpose of verifying customer payments. SMS data is used only for payment
verification: it is not sold, and it is not shared with any other third party. Messages
containing OTP, PIN, or verification codes are filtered on your device and never uploaded.
Only senders on your whitelist (e.g. bKash, NAGAD) are forwarded, and every forwarded message
is recorded in the in-app SMS log. You can stop forwarding at any time by tapping **Unpair**
in Settings.

[ I understand & allow ]   [ Not now ]

## বাংলা (Bengali)

**এসএমএস তথ্য সংক্রান্ত প্রকাশনা**

Invokeil Pay আসা এসএমএস বার্তা সংগ্রহ করে এবং কেবল গ্রাহকের পেমেন্ট যাচাইয়ের উদ্দেশ্যে আপনার
যুক্ত প্যানেলে পাঠায়। এসএমএস তথ্য শুধু পেমেন্ট যাচাইয়ের জন্য ব্যবহৃত হয়: বিক্রি করা হয় না,
এবং অন্য কোনো তৃতীয় পক্ষের সাথে শেয়ার করা হয় না। OTP, পিন বা ভেরিফিকেশন কোডযুক্ত বার্তা
আপনার ডিভাইসেই বাদ দেওয়া হয়, কখনও আপলোড হয় না। শুধু আপনার তালিকাভুক্ত প্রেরকের (যেমন bKash,
NAGAD) বার্তা ফরওয়ার্ড হয় এবং প্রতিটি ফরওয়ার্ড হওয়া বার্তা অ্যাপের এসএমএস লগে সংরক্ষিত থাকে।
সেটিংসে **Unpair** চাপলে যেকোনো সময় ফরওয়ার্ডিং বন্ধ করতে পারবেন।

[ বুঝেছি ও অনুমতি দিচ্ছি ]   [ এখন না ]

---

## Implementation checklist (developer)

- [x] Disclosure is a modal dialog shown **before** `requestPermissions(RECEIVE_SMS/READ_SMS)`
      in `OnboardingActivity.onGrantSms()` — the user must actively accept to proceed.
- [x] Declining never triggers the permission prompt.
- [x] The same disclosure is viewable any time from Settings (`btn_disclosure`).
- [x] SMS content is transmitted **only** to the user-paired panel base URL via
      `POST /api/v1/sms` with the device key header; no analytics, ads, or other endpoints.
- [x] On-device filtering: OTP/PIN/verification-code messages and non-whitelisted senders are
      never uploaded (see `SmsGate.kt`), and are marked FILTERED in the local log.
- [x] Forwarding stops immediately on Unpair (credentials wiped, service stopped).
- [x] The in-app SMS log (cap 200, locally stored) gives full transparency; users can clear it.
