// ── customer-360 module strings (EN + BN) — admin Customer 360 detail view ──
// All keys are `c360` prefixed to stay collision-free in the merged dictionary.

export const C360_EN: Record<string, string> = {
  c360Title: 'Customer 360',
  c360Back: 'Back to customers',
  c360NotFound: 'Customer not found',
  c360LoadFail: 'Failed to load customer',

  // header card
  c360Since: 'Customer since',
  c360Suspended: 'Suspended',
  c360SuspendReason: 'Reason',
  c360Active: 'In good standing',
  c360Phone: 'Phone',
  c360Email: 'Email',
  c360NoContact: 'No contact details on file',

  // header stats
  c360StatLtv: 'Lifetime value',
  c360StatTx: 'Payments',
  c360StatInv: 'Invoices',
  c360StatSubs: 'Subscriptions',

  // tags
  c360Tags: 'Tags',
  c360AddTag: 'Add',
  c360TagPlaceholder: 'Add a tag…',
  c360NoTags: 'No tags yet',
  c360TagAdded: 'Tag added',
  c360TagsSaved: 'Tags updated',
  c360TagTooLong: 'Tag is too long (max 24 chars)',
  c360TagDupe: 'This tag already exists',

  // portal link
  c360Portal: 'Customer portal',
  c360PortalHint: 'Share this link — the customer can see their invoices, payments and subscriptions, and raise disputes.',
  c360CopyPortal: 'Copy portal link',
  c360OpenPortal: 'Open portal',

  // tabs
  c360TabTimeline: 'Timeline',
  c360TabMoney: 'Money',
  c360TabComms: 'Comms',
  c360TabNotes: 'Notes',
  c360TabRisk: 'Risk',

  // timeline entry types
  c360TTransaction: 'Payment',
  c360TInvoice: 'Invoice',
  c360TRefund: 'Refund',
  c360TDispute: 'Dispute',
  c360TSubscription: 'Subscription',
  c360TEmail: 'Email',
  c360TSms: 'SMS',
  c360TActivity: 'Activity',
  c360TEvent: 'Event',
  c360TimelineEmpty: 'Nothing in the timeline yet',
  c360TimelineHint: 'Payments, invoices, emails, SMS, staff activity and events for this customer will appear here, newest first.',

  // money tab
  c360MoneyTx: 'Payments',
  c360MoneyInv: 'Invoices',
  c360ColTrxId: 'TrxID',
  c360ColMethod: 'Method',
  c360ColAmount: 'Amount',
  c360ColStatus: 'Status',
  c360ColDate: 'Date',
  c360ColNumber: 'Number',
  c360ColTitle: 'Title',
  c360ColDue: 'Due',
  c360NoTx: 'No payments yet',
  c360NoInv: 'No invoices yet',

  // comms tab
  c360Emails: 'Emails',
  c360Sms: 'SMS',
  c360ColSubject: 'Subject',
  c360ColTo: 'To',
  c360ColFrom: 'From',
  c360ColBody: 'Message',
  c360NoEmails: 'No emails yet',
  c360NoSms: 'No SMS yet',

  // notes tab
  c360NotesTitle: 'Internal notes',
  c360NotesHint: 'Timestamped notes are appended to the customer record — visible to your team only.',
  c360NotePlaceholder: 'Write a note…',
  c360AddNote: 'Add note',
  c360NoNotes: 'No notes yet',
  c360NoteAdded: 'Note added',
  c360NoteRequired: 'Note cannot be empty',

  // risk tab
  c360RiskTitle: 'Risk cases',
  c360RiskNone: 'No risk cases for this customer',
  c360RiskScore: 'Score',
  c360OpenRisk: 'Open risk center',
}

export const C360_BN: Record<string, string> = {
  c360Title: 'কাস্টমার ৩৬০',
  c360Back: 'কাস্টমার তালিকায় ফিরুন',
  c360NotFound: 'কাস্টমার খুঁজে পাওয়া যায়নি',
  c360LoadFail: 'কাস্টমারের তথ্য লোড করা যায়নি',

  c360Since: 'কাস্টমার যুক্ত হয়েছে',
  c360Suspended: 'স্থগিত',
  c360SuspendReason: 'কারণ',
  c360Active: 'স্বাভাবিক অবস্থায় আছে',
  c360Phone: 'ফোন',
  c360Email: 'ইমেইল',
  c360NoContact: 'কোনো যোগাযোগের তথ্য নেই',

  c360StatLtv: 'মোট লেনদেনের মূল্য',
  c360StatTx: 'পেমেন্ট',
  c360StatInv: 'ইনভয়েস',
  c360StatSubs: 'সাবস্ক্রিপশন',

  c360Tags: 'ট্যাগ',
  c360AddTag: 'যোগ করুন',
  c360TagPlaceholder: 'ট্যাগ লিখুন…',
  c360NoTags: 'এখনো কোনো ট্যাগ নেই',
  c360TagAdded: 'ট্যাগ যোগ হয়েছে',
  c360TagsSaved: 'ট্যাগ হালনাগাদ হয়েছে',
  c360TagTooLong: 'ট্যাগ খুব বড় (সর্বোচ্চ ২৪ অক্ষর)',
  c360TagDupe: 'এই ট্যাগটি আগেই আছে',

  c360Portal: 'কাস্টমার পোর্টাল',
  c360PortalHint: 'এই লিংকটি শেয়ার করুন — কাস্টমার নিজের ইনভয়েস, পেমেন্ট ও সাবস্ক্রিপশন দেখতে পাবে এবং অভিযোগ জানাতে পারবে।',
  c360CopyPortal: 'পোর্টাল লিংক কপি করুন',
  c360OpenPortal: 'পোর্টাল খুলুন',

  c360TabTimeline: 'টাইমলাইন',
  c360TabMoney: 'আর্থিক',
  c360TabComms: 'যোগাযোগ',
  c360TabNotes: 'নোট',
  c360TabRisk: 'ঝুঁকি',

  c360TTransaction: 'পেমেন্ট',
  c360TInvoice: 'ইনভয়েস',
  c360TRefund: 'রিফান্ড',
  c360TDispute: 'অভিযোগ',
  c360TSubscription: 'সাবস্ক্রিপশন',
  c360TEmail: 'ইমেইল',
  c360TSms: 'এসএমএস',
  c360TActivity: 'কার্যক্রম',
  c360TEvent: 'ইভেন্ট',
  c360TimelineEmpty: 'টাইমলাইনে এখনো কিছু নেই',
  c360TimelineHint: 'এই কাস্টমারের পেমেন্ট, ইনভয়েস, ইমেইল, এসএমএস, স্টাফ কার্যক্রম ও ইভেন্ট নতুন থেকে পুরোনো ক্রমে এখানে দেখা যাবে।',

  c360MoneyTx: 'পেমেন্ট',
  c360MoneyInv: 'ইনভয়েস',
  c360ColTrxId: 'ট্রানজেকশন আইডি',
  c360ColMethod: 'মাধ্যম',
  c360ColAmount: 'পরিমাণ',
  c360ColStatus: 'অবস্থা',
  c360ColDate: 'তারিখ',
  c360ColNumber: 'নম্বর',
  c360ColTitle: 'শিরোনাম',
  c360ColDue: 'শেষ তারিখ',
  c360NoTx: 'এখনো কোনো পেমেন্ট নেই',
  c360NoInv: 'এখনো কোনো ইনভয়েস নেই',

  c360Emails: 'ইমেইল',
  c360Sms: 'এসএমএস',
  c360ColSubject: 'বিষয়',
  c360ColTo: 'প্রাপক',
  c360ColFrom: 'প্রেরক',
  c360ColBody: 'বার্তা',
  c360NoEmails: 'এখনো কোনো ইমেইল নেই',
  c360NoSms: 'এখনো কোনো এসএমএস নেই',

  c360NotesTitle: 'অভ্যন্তরীণ নোট',
  c360NotesHint: 'সময়সহ নোট কাস্টমারের রেকর্ডে যুক্ত হয় — শুধু আপনার টিম দেখতে পাবে।',
  c360NotePlaceholder: 'নোট লিখুন…',
  c360AddNote: 'নোট যোগ করুন',
  c360NoNotes: 'এখনো কোনো নোট নেই',
  c360NoteAdded: 'নোট যোগ হয়েছে',
  c360NoteRequired: 'নোট খালি রাখা যাবে না',

  c360RiskTitle: 'ঝুঁকির কেস',
  c360RiskNone: 'এই কাস্টমারের বিরুদ্ধে কোনো ঝুঁকির কেস নেই',
  c360RiskScore: 'স্কোর',
  c360OpenRisk: 'রিস্ক সেন্টার খুলুন',
}
