import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const cookieStore = await cookies()

  cookieStore.set('genx_referral', code, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })

  return NextResponse.redirect(new URL('/join', process.env.NEXT_PUBLIC_APP_URL || 'https://higherup.me'))
}
