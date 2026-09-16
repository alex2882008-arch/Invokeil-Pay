// ── Public payment pages strings (EN + BN) ─────────────────────────────
// Checkout public page (/pay/[token]). Keys used by the money page.
// The seven unprefixed keys below are the spec'd core strings; everything
// else is `cpub*`-prefixed to stay collision-free in the merged dict.

export const PUBLIC_EN: Record<string, string> = {
  youArePaying: 'You are paying',
  sendMoneyTo: 'Send money to',
  iHavePaid: 'I have paid',
  verifying: 'Verifying your payment…',
  paidThanks: 'Payment received — thank you!',
  expired: 'Expired',
  needHelp: 'Need help?',

  // Gateway selector
  cpubChooseMethod: 'Choose how to pay',
  cpubTabMfs: 'MFS',
  cpubTabBank: 'Bank',
  cpubTabGlobal: 'Global',
  // Reference-style tab labels (Cards / Mobile / Net Banking)
  cpubTabCards: 'Cards',
  cpubTabMobile: 'Mobile',
  cpubTabNetBanking: 'Net Banking',
  cpubSelectCard: 'Select a card',
  cpubSelectMethod: 'Select a payment method',
  cpubQuickPayment: 'Quick Payment',
  cpubHello: 'Hello',
  cpubGuest: 'Guest',
  cpubViewDetails: 'View Details',
  cpubHideDetails: 'Hide Details',
  cpubAgreeTo: 'By clicking Pay, you agree to our',
  cpubTerms: 'Terms & Conditions.',
  cpubPayWith: 'Pay with',
  cpubCardNumber: 'Card Number',
  cpubExpiryDate: 'Expiration Date',
  cpubCvc: 'CW/CVC',
  cpubNameOnCard: 'Name on Card',
  cpubRememberCard: 'Remember this card.',
  cpubLearnMore: 'Learn more.',
  cpubMethodLabel: 'Method',
  cpubPersonal: 'Personal',
  cpubAgent: 'Agent',
  cpubMerchant: 'Merchant',
  cpubAmountRangeWarn: 'This gateway accepts ৳{min}–৳{max}',

  // Payment instructions
  cpubInstructions: 'Payment instructions',
  cpubAccountNumber: 'Account number',
  cpubSendExactly: 'Send exactly',
  cpubShowQr: 'Show QR',
  cpubScanHint: 'Scan with your mobile wallet app',
  cpubHowToPay: 'How to pay',
  cpubCharge: 'Charge',
  cpubYouSave: 'You save',
  cpubTotal: 'Total',
  cpubMin: 'Minimum',
  cpubMax: 'Maximum',

  // Fallback steps (no gateway configured)
  cpubStep1: 'Open your mobile wallet or banking app',
  cpubStep2: 'Send the exact amount to the number shown above',
  cpubStep3: 'Note the transaction ID from the confirmation SMS',
  cpubStep4: 'Come back here and tap "I have paid"',

  // Claim / verify form
  cpubAdditionalInfo: 'Additional details',
  cpubFieldRequired: 'This field is required',
  cpubYourNumber: 'Your payment number',
  cpubYourNumberHint: 'The number you are paying from — we use it to match your payment',
  cpubNumberInvalid: 'Enter a valid 11-digit number (e.g. 01712345678)',
  cpubTrxId: 'Transaction ID (optional)',
  cpubTrxIdHint: 'You will find it in your payment confirmation SMS',

  // Awaiting
  cpubVerifyingHint: 'We are matching your payment automatically — usually done within a minute. Keep this page open.',
  cpubPollSlow: 'Still checking — this is taking longer than usual.',
  cpubCheckAgain: 'Check again',

  // Success
  cpubSuccessHint: 'Your payment has been confirmed.',
  cpubTrxIdLabel: 'Transaction ID',
  cpubPaidAt: 'Paid at',
  cpubBackToMerchant: 'Back to merchant',

  // Terminal states
  cpubExpiredTitle: 'This payment link has expired',
  cpubExpiredHint: 'The payment window has closed. Please ask the merchant for a fresh link.',
  cpubCancelledTitle: 'This payment was cancelled',
  cpubCancelledHint: 'No money was taken. You can close this page or ask for a new link.',
  cpubNotFoundTitle: 'Payment page not found',
  cpubNotFoundHint: 'This link is invalid or the payment no longer exists.',
  cpubContactSupport: 'Contact support',

  // Expiry countdown
  cpubExpiresIn: 'Expires in',

  // Cancel
  cpubCancelPayment: 'Cancel this payment',
  cpubCancelTitle: 'Cancel this payment?',
  cpubCancelBody: 'If you already sent the money, keep this page open instead — verification usually completes within a minute.',
  cpubKeepWaiting: 'Keep waiting',
  cpubYesCancel: 'Yes, cancel payment',

  // Errors
  cpubClaimFailed: 'Something went wrong — please try again',
  cpubBlocked: 'This number is blocked from paying. Contact support.',

  // Footer / chrome
  cpubSecuredBy: 'Secured payment',
  cpubPoweredBy: 'Powered by',
  cpubFaq: 'Frequently asked questions',
  cpubPayNow: 'Pay now',
  cpubToggleTheme: 'Toggle theme',
  cpubToggleLang: 'Switch language',
}

export const PUBLIC_BN: Record<string, string> = {
  youArePaying: 'আপনি পরিশোধ করছেন',
  sendMoneyTo: 'সেন্ড মানি করুন',
  iHavePaid: 'আমি টাকা পাঠিয়েছি',
  verifying: 'আপনার পেমেন্ট যাচাই হচ্ছে…',
  paidThanks: 'পেমেন্ট পাওয়া গেছে — ধন্যবাদ!',
  expired: 'মেয়াদ শেষ হয়েছে',
  needHelp: 'সাহায্য দরকার?',

  cpubChooseMethod: 'কীভাবে পরিশোধ করবেন',
  cpubTabMfs: 'এমএফএস',
  cpubTabBank: 'ব্যাংক',
  cpubTabGlobal: 'গ্লোবাল',
  cpubTabCards: 'কার্ড',
  cpubTabMobile: 'মোবাইল',
  cpubTabNetBanking: 'নেট ব্যাংকিং',
  cpubSelectCard: 'কার্ড নির্বাচন করুন',
  cpubSelectMethod: 'পেমেন্ট মাধ্যম নির্বাচন করুন',
  cpubQuickPayment: 'কুইক পেমেন্ট',
  cpubHello: 'হ্যালো',
  cpubGuest: 'অতিথি',
  cpubViewDetails: 'বিস্তারিত দেখুন',
  cpubHideDetails: 'বিস্তারিত লুকান',
  cpubAgreeTo: 'Pay চাপলে আপনি আমাদের সাথে সম্মত হচ্ছেন',
  cpubTerms: 'শর্তাবলীতে।',
  cpubPayWith: 'পেমেন্ট করুন',
  cpubCardNumber: 'কার্ড নম্বর',
  cpubExpiryDate: 'মেয়াদ',
  cpubCvc: 'CW/CVC',
  cpubNameOnCard: 'কার্ডে নাম',
  cpubRememberCard: 'এই কার্ড মনে রাখুন।',
  cpubLearnMore: 'আরও জানুন।',
  cpubMethodLabel: 'মাধ্যম',
  cpubPersonal: 'পার্সোনাল',
  cpubAgent: 'এজেন্ট',
  cpubMerchant: 'মার্চেন্ট',
  cpubAmountRangeWarn: 'এই গেটওয়ে ৳{min}–৳{max} পর্যন্ত গ্রহণ করে',

  cpubInstructions: 'পেমেন্ট নির্দেশনা',
  cpubAccountNumber: 'অ্যাকাউন্ট নাম্বার',
  cpubSendExactly: 'ঠিক এই পরিমাণ পাঠান',
  cpubShowQr: 'কিউআর দেখুন',
  cpubScanHint: 'মোবাইল ওয়ালেট অ্যাপ দিয়ে স্ক্যান করুন',
  cpubHowToPay: 'কীভাবে পাঠাবেন',
  cpubCharge: 'চার্জ',
  cpubYouSave: 'আপনি বাঁচাচ্ছেন',
  cpubTotal: 'সর্বমোট',
  cpubMin: 'সর্বনিম্ন',
  cpubMax: 'সর্বোচ্চ',

  cpubStep1: 'আপনার মোবাইল ওয়ালেট বা ব্যাংকিং অ্যাপ খুলুন',
  cpubStep2: 'উপরের নাম্বারে ঠিক এই পরিমাণ টাকা পাঠান',
  cpubStep3: 'কনফার্মেশন এসএমএস থেকে ট্রানজেকশন আইডি সংরক্ষণ করুন',
  cpubStep4: 'এই পেজে ফিরে এসে "আমি টাকা পাঠিয়েছি" চাপুন',

  cpubAdditionalInfo: 'অতিরিক্ত তথ্য',
  cpubFieldRequired: 'এই ঘরটি পূরণ করুন',
  cpubYourNumber: 'আপনার পেমেন্ট নাম্বার',
  cpubYourNumberHint: 'যে নাম্বার থেকে টাকা পাঠাচ্ছেন — পেমেন্ট মেলাতে এটি ব্যবহার করা হবে',
  cpubNumberInvalid: 'সঠিক ১১ ডিজিটের নাম্বার লিখুন (যেমন ০১৭১২৩৪৫৬৭৮)',
  cpubTrxId: 'ট্রানজেকশন আইডি (ঐচ্ছিক)',
  cpubTrxIdHint: 'পেমেন্ট কনফার্মেশন এসএমএসে এটি পাবেন',

  cpubVerifyingHint: 'আমরা স্বয়ংক্রিয়ভাবে আপনার পেমেন্ট মিলছি — সাধারণত এক মিনিটের মধ্যেই সম্পন্ন হয়। এই পেজটি খোলা রাখুন।',
  cpubPollSlow: 'এখনও যাচাই চলছে — স্বাভাবিকের চেয়ে বেশি সময় নিচ্ছে।',
  cpubCheckAgain: 'আবার দেখুন',

  cpubSuccessHint: 'আপনার পেমেন্ট নিশ্চিত হয়েছে।',
  cpubTrxIdLabel: 'ট্রানজেকশন আইডি',
  cpubPaidAt: 'পরিশোধের সময়',
  cpubBackToMerchant: 'মার্চেন্টে ফিরে যান',

  cpubExpiredTitle: 'এই পেমেন্ট লিংকের মেয়াদ শেষ হয়েছে',
  cpubExpiredHint: 'পেমেন্টের সময় শেষ হয়ে গেছে। নতুন লিংকের জন্য মার্চেন্টের সাথে যোগাযোগ করুন।',
  cpubCancelledTitle: 'এই পেমেন্ট বাতিল করা হয়েছে',
  cpubCancelledHint: 'কোনো টাকা কাটা হয়নি। আপনি এই পেজটি বন্ধ করতে পারেন বা নতুন লিংক চাইতে পারেন।',
  cpubNotFoundTitle: 'পেমেন্ট পেজটি পাওয়া যায়নি',
  cpubNotFoundHint: 'এই লিংকটি সঠিক নয় বা পেমেন্টটি আর নেই।',
  cpubContactSupport: 'সাপোর্টে যোগাযোগ করুন',

  cpubExpiresIn: 'মেয়াদ শেষ হবে',

  cpubCancelPayment: 'এই পেমেন্ট বাতিল করুন',
  cpubCancelTitle: 'পেমেন্ট বাতিল করবেন?',
  cpubCancelBody: 'টাকা পাঠানো থাকলে এই পেজটি খোলা রাখুন — যাচাই সাধারণত এক মিনিটের মধ্যেই সম্পন্ন হয়।',
  cpubKeepWaiting: 'অপেক্ষা করুন',
  cpubYesCancel: 'হ্যাঁ, বাতিল করুন',

  cpubClaimFailed: 'কিছু একটা সমস্যা হয়েছে — আবার চেষ্টা করুন',
  cpubBlocked: 'এই নাম্বার থেকে পেমেন্ট করা বন্ধ রয়েছে। সাপোর্টে যোগাযোগ করুন।',

  cpubSecuredBy: 'নিরাপদ পেমেন্ট',
  cpubPoweredBy: 'পাওয়ার্ড বাই',
  cpubFaq: 'সাধারণ জিজ্ঞাসা',
  cpubPayNow: 'পরিশোধ করুন',
  cpubToggleTheme: 'থিম পরিবর্তন',
  cpubToggleLang: 'ভাষা পরিবর্তন',
}
