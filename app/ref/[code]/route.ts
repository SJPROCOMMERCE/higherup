import { NextResponse } from 'next/server'
import { createInvite } from '@/lib/invite'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://higherup.me'

  // Auto-create an invite so the VA can go through normal onboarding
  let destination = '/join'
  try {
    const { token } = await createInvite(`GENX referral: ${code}`, code)
    destination = `/join/${token}`
  } catch { /* fall through to /join */ }

  // Set cookie directly on the redirect response
  // (cookieStore.set + NextResponse.redirect don't share headers)
  const response = NextResponse.redirect(new URL(destination, appUrl))
  response.cookies.set('genx_referral', code, {
    httpOnly: false,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   7 * 24 * 60 * 60,
    path:     '/',
  })
  return response
}
