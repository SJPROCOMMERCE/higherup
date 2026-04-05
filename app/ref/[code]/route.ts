import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createInvite } from '@/lib/invite'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://higherup.me'

  // Set the GENX referral cookie so the signup form can link the VA to this LG
  const cookieStore = await cookies()
  cookieStore.set('genx_referral', code, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })

  // Auto-create an invite so the VA can go through normal onboarding
  try {
    const { token } = await createInvite(`GENX referral: ${code}`, code)
    return NextResponse.redirect(new URL(`/join/${token}`, appUrl))
  } catch {
    // Fallback: if invite creation fails, redirect to generic join page
    return NextResponse.redirect(new URL('/join', appUrl))
  }
}
