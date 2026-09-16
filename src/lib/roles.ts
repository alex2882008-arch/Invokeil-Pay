/** Client-safe role definitions — importable from both server and client components. */

export type Role = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'FINANCE' | 'SUPPORT' | 'AGENT' | 'VIEWER'

export const ROLE_LIST: Role[] = ['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'SUPPORT', 'AGENT', 'VIEWER']

/** Roles with full admin powers (nav visibility + destructive endpoints). */
export const ADMIN_ROLES: Role[] = ['OWNER', 'ADMIN']

export function isAdminRole(role?: string | null): boolean {
  return role === 'OWNER' || role === 'ADMIN'
}

/** Roles allowed to manage money records (refunds/settlements/reports). */
export const FINANCE_ROLES: Role[] = ['OWNER', 'ADMIN', 'FINANCE']

/** Roles allowed to use developer tools. */
export const DEV_ROLES: Role[] = ['OWNER', 'ADMIN', 'DEVELOPER']

/** Roles allowed to handle support/risk queues. */
export const OPS_ROLES: Role[] = ['OWNER', 'ADMIN', 'SUPPORT']

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: 'Full control including ownership transfer and billing',
  ADMIN: 'Full panel access, manages users and settings',
  DEVELOPER: 'API keys, webhooks, developer console, logs',
  FINANCE: 'Refunds, disputes, settlements, reports and statements',
  SUPPORT: 'Customers, transactions lookup, risk review queue',
  AGENT: 'Day-to-day operations: checkouts, invoices, SMS review',
  VIEWER: 'Read-only access to dashboards and records',
}
