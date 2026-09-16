// ── KYC / KYB workflow module strings (EN + BN) ─────────────────────────────
// Keys prefixed kyc* — all module dicts merge into one flat namespace.

export const KYC_EN: Record<string, string> = {
  kycTitle: 'KYC / KYB',
  kycSubtitle: 'Know-your-customer and business verification pipeline',
  kycNewProfile: 'New profile',

  // Pipeline chips
  kycPipeline: 'Pipeline',
  kycStagePending: 'Pending',
  kycStageSubmitted: 'Submitted',
  kycStageVerified: 'Verified',
  kycStageRejected: 'Rejected',
  kycStageExpired: 'Expired',

  // Stats
  kycStatPending: 'Pending',
  kycStatSubmitted: 'In review',
  kycStatVerified: 'Verified',
  kycStatExpiring: 'Expiring in 30 days',

  // Expiry banner
  kycExpiryBanner: 'Expiring soon',
  kycExpiryBannerHint: 'These verified profiles expire within 30 days — ask for renewed documents.',
  kycExpiresOn: 'Expires',

  // Table
  kycColEntity: 'Entity',
  kycColContact: 'Contact',
  kycColDocs: 'Docs',
  kycColStatus: 'Status',
  kycColSubmitted: 'Submitted',
  kycColActions: 'Actions',
  kycEntityIndividual: 'Individual',
  kycEntityBusiness: 'Business',
  kycViewDetails: 'Details',

  // Create dialog
  kycCreateTitle: 'New KYC profile',
  kycCreateDesc: 'Register a customer or business for verification.',
  kycEntityType: 'Entity type',
  kycLegalName: 'Legal name',
  kycLegalNamePh: 'Full legal name as on documents',
  kycContactEmail: 'Contact email',
  kycContactPhone: 'Contact phone',
  kycDocuments: 'Documents',
  kycDocType: 'Type',
  kycDocTypePh: 'NID / Passport / Trade license…',
  kycDocName: 'Name',
  kycDocUrl: 'URL',
  kycAddDoc: 'Add document',
  kycNoDocs: 'No documents attached',
  kycNeedName: 'Legal name is required',

  // Detail drawer
  kycDetailsTitle: 'Profile details',
  kycDocList: 'Documents',
  kycReviewerNote: 'Reviewer note',
  kycReviewerNotePh: 'Internal note for this profile…',
  kycSubmittedAt: 'Submitted',
  kycReviewedAt: 'Reviewed',
  kycExpiresAt: 'Expires',
  kycCreated: 'Created',
  kycSaveNote: 'Save note',

  // State actions
  kycSubmitBtn: 'Submit for review',
  kycVerifyBtn: 'Verify',
  kycRejectBtn: 'Reject',
  kycExpireBtn: 'Mark expired',
  kycVerifyHint: 'Verification sets a 1-year validity on this profile.',

  // Statuses
  kycStatusPending: 'Pending',
  kycStatusSubmitted: 'Submitted',
  kycStatusVerified: 'Verified',
  kycStatusRejected: 'Rejected',
  kycStatusExpired: 'Expired',

  // Empty / toasts
  kycEmpty: 'No KYC profiles yet',
  kycEmptyHint: 'Add customers or businesses here and walk them through document verification.',
  kycNoResults: 'No profiles matched this filter',
  kycClearFilter: 'Clear filter',
  kycCreatedToast: 'KYC profile created',
  kycSubmittedToast: 'Profile submitted for review',
  kycVerifiedToast: 'Profile verified',
  kycRejectedToast: 'Profile rejected',
  kycExpiredToast: 'Profile marked expired',
  kycNoteSavedToast: 'Reviewer note saved',
  kycInvalidTransition: 'That action is not allowed in the current state',
  kycLoadFail: 'Failed to load KYC data',
  kycSearchPh: 'Search name, email or phone…',
}

export const KYC_BN: Record<string, string> = {
  kycTitle: 'কেওয়াইসি / কেওয়াইবি',
  kycSubtitle: 'গ্রাহক ও ব্যবসা যাচাইয়ের পাইপলাইন',
  kycNewProfile: 'নতুন প্রোফাইল',

  kycPipeline: 'পাইপলাইন',
  kycStagePending: 'অপেক্ষমাণ',
  kycStageSubmitted: 'জমা দেওয়া',
  kycStageVerified: 'যাচাইকৃত',
  kycStageRejected: 'প্রত্যাখ্যাত',
  kycStageExpired: 'মেয়াদোত্তীর্ণ',

  kycStatPending: 'অপেক্ষমাণ',
  kycStatSubmitted: 'রিভিউতে',
  kycStatVerified: 'যাচাইকৃত',
  kycStatExpiring: '৩০ দিনে মেয়াদ শেষ',

  kycExpiryBanner: 'শীঘ্রই মেয়াদ শেষ',
  kycExpiryBannerHint: 'এই যাচাইকৃত প্রোফাইলগুলোর ৩০ দিনের মধ্যে মেয়াদ শেষ হবে — নতুন কাগজ চান।',
  kycExpiresOn: 'মেয়াদ শেষ',

  kycColEntity: 'প্রতিষ্ঠান',
  kycColContact: 'যোগাযোগ',
  kycColDocs: 'কাগজ',
  kycColStatus: 'স্টেটাস',
  kycColSubmitted: 'জমার সময়',
  kycColActions: 'পদক্ষেপ',
  kycEntityIndividual: 'ব্যক্তি',
  kycEntityBusiness: 'ব্যবসা',
  kycViewDetails: 'বিস্তারিত',

  kycCreateTitle: 'নতুন কেওয়াইসি প্রোফাইল',
  kycCreateDesc: 'যাচাইয়ের জন্য একজন গ্রাহক বা ব্যবসা নিবন্ধন করুন।',
  kycEntityType: 'প্রতিষ্ঠানের ধরন',
  kycLegalName: 'আইনগত নাম',
  kycLegalNamePh: 'কাগজে থাকা সম্পূর্ণ আইনগত নাম',
  kycContactEmail: 'যোগাযোগের ইমেইল',
  kycContactPhone: 'যোগাযোগের ফোন',
  kycDocuments: 'কাগজপত্র',
  kycDocType: 'ধরন',
  kycDocTypePh: 'এনআইডি / পাসপোর্ট / ট্রেড লাইসেন্স…',
  kycDocName: 'নাম',
  kycDocUrl: 'লিংক',
  kycAddDoc: 'কাগজ যোগ করুন',
  kycNoDocs: 'কোনো কাগজ সংযুক্ত নেই',
  kycNeedName: 'আইনগত নাম দরকার',

  kycDetailsTitle: 'প্রোফাইলের বিস্তারিত',
  kycDocList: 'কাগজপত্র',
  kycReviewerNote: 'রিভিউয়ারের নোট',
  kycReviewerNotePh: 'এই প্রোফাইলের অভ্যন্তরীণ নোট…',
  kycSubmittedAt: 'জমা হয়েছে',
  kycReviewedAt: 'রিভিউ হয়েছে',
  kycExpiresAt: 'মেয়াদ শেষ',
  kycCreated: 'তৈরি হয়েছে',
  kycSaveNote: 'নোট সংরক্ষণ',

  kycSubmitBtn: 'রিভিউয়ের জন্য জমা দিন',
  kycVerifyBtn: 'যাচাই করুন',
  kycRejectBtn: 'প্রত্যাখ্যান করুন',
  kycExpireBtn: 'মেয়াদোত্তীর্ণ করুন',
  kycVerifyHint: 'যাচাই করলে এই প্রোফাইলে ১ বছরের বৈধতা সেট হয়।',

  kycStatusPending: 'অপেক্ষমাণ',
  kycStatusSubmitted: 'জমা দেওয়া',
  kycStatusVerified: 'যাচাইকৃত',
  kycStatusRejected: 'প্রত্যাখ্যাত',
  kycStatusExpired: 'মেয়াদোত্তীর্ণ',

  kycEmpty: 'এখনও কোনো কেওয়াইসি প্রোফাইল নেই',
  kycEmptyHint: 'এখানে গ্রাহক বা ব্যবসা যোগ করুন এবং কাগজ যাচাইয়ের মধ্য দিয়ে নিয়ে যান।',
  kycNoResults: 'এই ফিল্টারে কোনো প্রোফাইল মেলেনি',
  kycClearFilter: 'ফিল্টার সরান',
  kycCreatedToast: 'কেওয়াইসি প্রোফাইল তৈরি হয়েছে',
  kycSubmittedToast: 'প্রোফাইল রিভিউয়ের জন্য জমা হয়েছে',
  kycVerifiedToast: 'প্রোফাইল যাচাই করা হয়েছে',
  kycRejectedToast: 'প্রোফাইল প্রত্যাখ্যাত হয়েছে',
  kycExpiredToast: 'প্রোফাইল মেয়াদোত্তীর্ণ করা হয়েছে',
  kycNoteSavedToast: 'রিভিউয়ারের নোট সংরক্ষিত হয়েছে',
  kycInvalidTransition: 'বর্তমান অবস্থায় এই পদক্ষেপ অনুমোদিত নয়',
  kycLoadFail: 'কেওয়াইসি ডেটা লোড করা যায়নি',
  kycSearchPh: 'নাম, ইমেইল বা ফোন খুঁজুন…',
}
