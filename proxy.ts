import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Static assets — skip
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Admin login page — always allow
  if (pathname.startsWith('/admin/login')) {
    return NextResponse.next()
  }

  // All other /admin/* routes — require valid session cookie
  if (pathname.startsWith('/admin')) {
    const session = request.cookies.get('admin_session')?.value

    if (!session) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    // Fast expiry check (full HMAC validation happens in lib/admin-auth.ts)
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
