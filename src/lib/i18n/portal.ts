// ── public customer portal strings (EN + BN) — /portal/[token] page ──
// All keys are `por` prefixed. These are consumed directly by the public page
// (imports the dictionaries itself so the page works without admin login).

export const POR_EN: Record<string, string> = {
  porPortal: 'Customer Portal',
  porWelcome: 'Welcome',
  porWelcomeHint: 'Your invoices, payments and subscriptions — all in one place.',
  porInvoices: 'Invoices',
  porPayments: 'Payments',
  porSubscriptions: 'Subscriptions',

  porColNumber: 'Number',
  porColTitle: 'Title',
  porColAmount: 'Amount',
  porColStatus: 'Status',
  porColDue: 'Due date',
  porColMethod: 'Method',
  porColDate: 'Date',
  porColPlan: 'Plan',
  porColNext: 'Next billing',

  porNoInvoices: 'No invoices yet',
  porNoPayments: 'No payments yet',
  porNoSubs: 'No subscriptions yet',

  porViewInvoice: 'View & pay invoice',
  porOpenInvoice: 'Open invoice',

  porNextBilling: 'Next billing',
  porCycles: 'billing cycles completed',
  porTrial: 'Trial',

  porDisputeTitle: 'Raise a dispute',
  porDisputeFor: 'Dispute invoice',
  porDisputeMsg: 'What went wrong?',
  porDisputePlaceholder: 'Describe the problem with this invoice…',
  porDisputeSubmit: 'Submit dispute',
  porDisputeSent: 'Dispute submitted — our team will review it shortly',
  porDisputeFail: 'Could not submit the dispute. Please try again.',

  porNotFoundTitle: 'Portal not found',
  porNotFoundHint: 'This link is invalid or no longer active. Please ask the merchant for a fresh link.',

  porTrust: 'Your data is masked for safety. Payments verified automatically via SMS.',
  porPowered: 'Powered by',
  porContact: 'Need help? Contact the merchant.',
  porLanguage: 'Language',
}

export const POR_BN: Record<string, string> = {
  porPortal: 'কাস্টমার পোর্টাল',
  porWelcome: 'স্বাগতম',
  porWelcomeHint: 'আপনার ইনভয়েস, পেমেন্ট ও সাবস্ক্রিপশন — সব এক জায়গায়।',
  porInvoices: 'ইনভয়েস',
  porPayments: 'পেমেন্ট',
  porSubscriptions: 'সাবস্ক্রিপশন',

  porColNumber: 'নম্বর',
  porColTitle: 'শিরোনাম',
  porColAmount: 'পরিমাণ',
  porColStatus: 'অবস্থা',
  porColDue: 'শেষ তারিখ',
  porColMethod: 'মাধ্যম',
  porColDate: 'তারিখ',
  porColPlan: 'প্ল্যান',
  porColNext: 'পরবর্তী বিলিং',

  porNoInvoices: 'এখনো কোনো ইনভয়েস নেই',
  porNoPayments: 'এখনো কোনো পেমেন্ট নেই',
  porNoSubs: 'এখনো কোনো সাবস্ক্রিপশন নেই',

  porViewInvoice: 'ইনভয়েস দেখুন ও পরিশোধ করুন',
  porOpenInvoice: 'ইনভয়েস খুলুন',

  porNextBilling: 'পরবর্তী বিলিং',
  porCycles: 'টি বিলিং চক্র সম্পন্ন',
  porTrial: 'ট্রায়াল',

  porDisputeTitle: 'অভিযোগ জানান',
  porDisputeFor: 'ইনভয়েসের বিরুদ্ধে অভিযোগ',
  porDisputeMsg: 'সমস্যাটি কী?',
  porDisputePlaceholder: 'এই ইনভয়েস সংক্রান্ত সমস্যা লিখুন…',
  porDisputeSubmit: 'অভিযোগ পাঠান',
  porDisputeSent: 'অভিযোগ জমা হয়েছে — আমাদের টিম শিগগিরই দেখবে',
  porDisputeFail: 'অভিযোগ পাঠানো যায়নি। আবার চেষ্টা করুন।',

  porNotFoundTitle: 'পোর্টাল খুঁজে পাওয়া যায়নি',
  porNotFoundHint: 'এই লিংকটি ভুল বা আর কাজ করছে না। নতুন লিংকের জন্য বিক্রেতার সাথে যোগাযোগ করুন।',

  porTrust: 'নিরাপত্তার জন্য আপনার তথ্য আংশিক দেখানো হয়। পেমেন্ট এসএমএসের মাধ্যমে স্বয়ংক্রিয়ভাবে যাচাই হয়।',
  porPowered: 'চালিত হচ্ছে',
  porContact: 'সাহায্য দরকার? বিক্রেতার সাথে যোগাযোগ করুন।',
  porLanguage: 'ভাষা',
}
