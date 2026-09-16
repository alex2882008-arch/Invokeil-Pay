import { NextRequest, NextResponse } from 'next/server'

/**
 * Fast edge guard: blocks /admin/* without a session cookie and adds
 * hardening headers. Full session validation runs in the admin layout.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const hasCookie = !!req.cookies.get('ilp_session')?.value

  if (pathname.startsWith('/admin') && !hasCookie) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  const res = NextResponse.next()
  res.headers.set('X-Frame-Options', 'SAMEORIGIN')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return res
}

export const config = {
  matcher: ['/admin/:path*'],
}
