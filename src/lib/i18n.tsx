'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { CORE_EN, CORE_BN } from '@/lib/i18n/core'
import { DASHBOARD_EN, DASHBOARD_BN } from '@/lib/i18n/dashboard'
import { TRANSACTIONS_EN, TRANSACTIONS_BN } from '@/lib/i18n/transactions'
import { INVOICES_EN, INVOICES_BN } from '@/lib/i18n/invoices'
import { LINKS_EN, LINKS_BN } from '@/lib/i18n/links'
import { CUSTOMERS_EN, CUSTOMERS_BN } from '@/lib/i18n/customers'
import { GATEWAYS_EN, GATEWAYS_BN } from '@/lib/i18n/gateways'
import { DEVICES_EN, DEVICES_BN } from '@/lib/i18n/devices'
import { SMS_EN, SMS_BN } from '@/lib/i18n/sms'
import { CHECKOUTS_EN, CHECKOUTS_BN } from '@/lib/i18n/checkouts'
import { MERCHANTS_EN, MERCHANTS_BN } from '@/lib/i18n/merchants'
import { WEBHOOKS_EN, WEBHOOKS_BN } from '@/lib/i18n/webhooks'
import { REPORTS_EN, REPORTS_BN } from '@/lib/i18n/reports'
import { SECURITY_EN, SECURITY_BN } from '@/lib/i18n/security'
import { SETTINGS_EN, SETTINGS_BN } from '@/lib/i18n/settings'
import { WIZARD_EN, WIZARD_BN } from '@/lib/i18n/wizard'
import { DOCS_EN, DOCS_BN } from '@/lib/i18n/docs'
import { PUBLIC_EN, PUBLIC_BN } from '@/lib/i18n/public'
import { EMA_EN, EMA_BN } from '@/lib/i18n/email'
import { SMSP_EN, SMSP_BN } from '@/lib/i18n/sms-providers'
import { NTC_EN, NTC_BN } from '@/lib/i18n/notif-center'
import { AUTO_EN, AUTO_BN } from '@/lib/i18n/automations'
import { REF_EN, REF_BN } from '@/lib/i18n/refunds'
import { STL_EN, STL_BN } from '@/lib/i18n/settlements'
import { ACC_EN, ACC_BN } from '@/lib/i18n/accounting'
import { RSK_EN, RSK_BN } from '@/lib/i18n/risk'
import { APV_EN, APV_BN } from '@/lib/i18n/approvals'
import { KYC_EN, KYC_BN } from '@/lib/i18n/kyc'
import { SECC_EN, SECC_BN } from '@/lib/i18n/security-center'
import { TEAM_EN, TEAM_BN } from '@/lib/i18n/team'
import { OPS_EN, OPS_BN } from '@/lib/i18n/operations'
import { INC_EN, INC_BN } from '@/lib/i18n/incidents'
import { IMP_EN, IMP_BN } from '@/lib/i18n/imports'
import { MKT_EN, MKT_BN } from '@/lib/i18n/marketplace'
import { BRD_EN, BRD_BN } from '@/lib/i18n/brands'
import { C360_EN, C360_BN } from '@/lib/i18n/customer-360'
import { SUB_EN, SUB_BN } from '@/lib/i18n/subscriptions'
import { POR_EN, POR_BN } from '@/lib/i18n/portal'
import { VER_EN, VER_BN } from '@/lib/i18n/verify'
import { DEVC_EN, DEVC_BN } from '@/lib/i18n/developer-console'

// v3 nav labels — used by admin-shell (registered here so every view resolves)
const V3NAV_EN: Record<string, string> = {
  groupComms: 'Communication',
  emailAutomation: 'Email Automation',
  smsGatewayPlus: 'SMS Gateway',
  notificationCenter: 'Notification Center',
  automations: 'Automations',
  groupFinance: 'Finance',
  refundsDisputes: 'Refunds & Disputes',
  settlements: 'Settlements',
  accounting: 'Accounting',
  subscriptions: 'Subscriptions',
  groupTrust: 'Trust & Safety',
  riskEngine: 'Risk Engine',
  approvals: 'Approvals',
  kyc: 'KYC / KYB',
  securityCenter: 'Security Center',
  groupOps: 'Operations',
  operations: 'Operations',
  incidents: 'Incidents & Status',
  importsCenter: 'Import / Migration',
  marketplace: 'Marketplace',
  brands: 'Brands',
  customer360: 'Customer 360',
  developerConsole: 'Developer Console',
}
const V3NAV_BN: Record<string, string> = {
  groupComms: 'কমিউনিকেশন',
  emailAutomation: 'ইমেইল অটোমেশন',
  smsGatewayPlus: 'SMS গেটওয়ে',
  notificationCenter: 'নোটিফিকেশন সেন্টার',
  automations: 'অটোমেশন',
  groupFinance: 'ফাইন্যান্স',
  refundsDisputes: 'রিফান্ড ও ডিসপিউট',
  settlements: 'সেটেলমেন্ট',
  accounting: 'অ্যাকাউন্টিং',
  subscriptions: 'সাবস্ক্রিপশন',
  groupTrust: 'ট্রাস্ট অ্যান্ড সেফটি',
  riskEngine: 'রিস্ক ইঞ্জিন',
  approvals: 'অনুমোদন',
  kyc: 'কেওয়াইসি / কেওয়াইবি',
  securityCenter: 'সিকিউরিটি সেন্টার',
  groupOps: 'অপারেশনস',
  operations: 'অপারেশনস',
  incidents: 'ইনসিডেন্ট ও স্টেটাস',
  importsCenter: 'ইমপোর্ট / মাইগ্রেশন',
  marketplace: 'মার্কেটপ্লেস',
  brands: 'ব্র্যান্ড',
  customer360: 'কাস্টমার ৩৬০',
  developerConsole: 'ডেভেলপার কনসোল',
}

export type Lang = 'en' | 'bn'

function merge(...parts: Array<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of parts) Object.assign(out, p)
  return out
}

export const DICTS: Record<Lang, Record<string, string>> = {
  en: merge(
    CORE_EN, DASHBOARD_EN, TRANSACTIONS_EN, INVOICES_EN, LINKS_EN, CUSTOMERS_EN,
    GATEWAYS_EN, DEVICES_EN, SMS_EN, CHECKOUTS_EN, MERCHANTS_EN, WEBHOOKS_EN,
    REPORTS_EN, SECURITY_EN, SETTINGS_EN, WIZARD_EN, DOCS_EN, PUBLIC_EN,
    EMA_EN, SMSP_EN, NTC_EN, AUTO_EN, REF_EN, STL_EN, ACC_EN, RSK_EN, APV_EN,
    KYC_EN, SECC_EN, TEAM_EN, OPS_EN, INC_EN, IMP_EN, MKT_EN, BRD_EN, C360_EN,
    SUB_EN, POR_EN, VER_EN, DEVC_EN, V3NAV_EN,
  ),
  bn: merge(
    CORE_BN, DASHBOARD_BN, TRANSACTIONS_BN, INVOICES_BN, LINKS_BN, CUSTOMERS_BN,
    GATEWAYS_BN, DEVICES_BN, SMS_BN, CHECKOUTS_BN, MERCHANTS_BN, WEBHOOKS_BN,
    REPORTS_BN, SECURITY_BN, SETTINGS_BN, WIZARD_BN, DOCS_BN, PUBLIC_BN,
    EMA_BN, SMSP_BN, NTC_BN, AUTO_BN, REF_BN, STL_BN, ACC_BN, RSK_BN, APV_BN,
    KYC_BN, SECC_BN, TEAM_BN, OPS_BN, INC_BN, IMP_BN, MKT_BN, BRD_BN, C360_BN,
    SUB_BN, POR_BN, VER_BN, DEVC_BN, V3NAV_BN,
  ),
}

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string) => string
}

const Ctx = createContext<LangCtx>({
  lang: 'en',
  setLang: () => {},
  t: (k) => DICTS.en[k] ?? String(k),
})

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem('ilp_lang')) as Lang | null
    if (saved === 'en' || saved === 'bn') {
      // Deferred: keeps hydration deterministic (server + first client render both use 'en')
      const id = window.setTimeout(() => setLangState(saved), 0)
      return () => window.clearTimeout(id)
    }
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem('ilp_lang', l) } catch { /* ignore */ }
    document.documentElement.lang = l === 'bn' ? 'bn' : 'en'
  }, [])

  const t = useCallback((key: string) => DICTS[lang][key] ?? DICTS.en[key] ?? String(key), [lang])

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}

export function useLang() {
  return useContext(Ctx)
}

/** Re-export for module views that need dynamic lang without context. */
export function useLangValue(): Lang {
  return useContext(Ctx).lang
}
