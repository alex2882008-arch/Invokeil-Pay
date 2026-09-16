// ── team / roles module strings (EN + BN) ───────────────────────────────────
// Keys prefixed team* — used by users-view for the 7-role system.
// Labels: teamRole<ROLE>; descriptions: teamRoleDesc<ROLE>.

export const TEAM_EN: Record<string, string> = {
  teamRoleOwner: 'Owner',
  teamRoleAdmin: 'Admin',
  teamRoleDeveloper: 'Developer',
  teamRoleFinance: 'Finance',
  teamRoleSupport: 'Support',
  teamRoleAgent: 'Agent',
  teamRoleViewer: 'Viewer',

  teamRoleDescOwner: 'Full control including ownership transfer and billing',
  teamRoleDescAdmin: 'Full panel access, manages users and settings',
  teamRoleDescDeveloper: 'API keys, webhooks, developer console, logs',
  teamRoleDescFinance: 'Refunds, disputes, settlements, reports and statements',
  teamRoleDescSupport: 'Customers, transactions lookup, risk review queue',
  teamRoleDescAgent: 'Day-to-day operations: checkouts, invoices, SMS review',
  teamRoleDescViewer: 'Read-only access to dashboards and records',

  teamRoleHint: 'Owners and admins manage everything. Pick the narrowest role that fits the job — every role can be changed later.',
}

export const TEAM_BN: Record<string, string> = {
  teamRoleOwner: 'মালিক',
  teamRoleAdmin: 'অ্যাডমিন',
  teamRoleDeveloper: 'ডেভেলপার',
  teamRoleFinance: 'ফাইন্যান্স',
  teamRoleSupport: 'সাপোর্ট',
  teamRoleAgent: 'এজেন্ট',
  teamRoleViewer: 'দর্শক',

  teamRoleDescOwner: 'মালিকানা হস্তান্তর ও বিলিং সহ সম্পূর্ণ নিয়ন্ত্রণ',
  teamRoleDescAdmin: 'সম্পূর্ণ প্যানেল অ্যাক্সেস, ইউজার ও সেটিংস পরিচালনা করে',
  teamRoleDescDeveloper: 'এপিআই কী, ওয়েবহুক, ডেভেলপার কনসোল, লগ',
  teamRoleDescFinance: 'রিফান্ড, ডিসপিউট, সেটেলমেন্ট, রিপোর্ট ও স্টেটমেন্ট',
  teamRoleDescSupport: 'কাস্টমার, লেনদেন খোঁজা, রিস্ক রিভিউ কিউ',
  teamRoleDescAgent: 'দৈনন্দিন কাজ: চেকআউট, ইনভয়েস, এসএমএস রিভিউ',
  teamRoleDescViewer: 'ড্যাশবোর্ড ও রেকর্ড শুধু দেখার অ্যাক্সেস',

  teamRoleHint: 'মালিক ও অ্যাডমিনরা সবকিছু পরিচালনা করেন। কাজের সাথে মানানসই সবচেয়ে সংকীর্ণ রোলটি বাছুন — পরে যেকোনো রোল বদলানো যায়।',
}
