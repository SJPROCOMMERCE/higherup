import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Admin login page itself — always allow
  if (pathname.startsWith('/admin/login')) {
    return NextResponse.next()
  }

  // All other /admin/* routes — require session cookie
  if (pathname.startsWith('/admin')) {
    const session = request.cookies.get('admin_session')?.value

    if (!session) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    // Fast expiry check (full HMAC validation happens in pages/API routes)
    const parts = session.split(':')
    if (parts.length !== 3) {
      const res = NextResponse.redirect(new URL('/admin/login', request.url))
      res.cookies.delete('admin_session')
      return res
    }

    const expiry = parseInt(parts[1])
    if (isNaN(expiry) || Date.now() > expiry) {
      const res = NextResponse.redirect(new URL('/admin/login', request.url))
      res.cookies.delete('admin_session')
      return res
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
