// Minimal SSRF guard: only http(s) to public hosts, no private ranges/localhost.
export function ssrfGuardUrl(raw: string | null | undefined): boolean {
  if (!raw) return false
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false
  // IPv4 literal checks
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    const oct = ipv4.slice(1).map(Number)
    if (oct.some((o) => o > 255)) return false
    const [a, b] = oct
    if (a === 10 || a === 127 || a === 0) return false
    if (a === 192 && b === 168) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 169 && b === 254) return false
  }
  if (host.startsWith('fd') || host.startsWith('fe80') || host === '::1') return false
  return true
}
