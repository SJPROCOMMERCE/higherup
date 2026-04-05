import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export default async function ReferralPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const cookieStore = await cookies()
  cookieStore.set('genx_referral', code, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })

  redirect('/join')
}
