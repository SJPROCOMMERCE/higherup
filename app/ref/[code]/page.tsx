import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { cookies } from 'next/headers'
import Link from 'next/link'

export default async function ReferralPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  // Validate the referral code
  const { data: lg } = await supabase
    .from('lead_generators')
    .select('id, referral_code, display_name, status')
    .eq('referral_code', code)
    .eq('status', 'active')
    .single()

  if (!lg) {
    // Invalid / inactive code — show generic join page
    return (
      <div style={{ minHeight: '100vh', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 600, color: '#111111', marginBottom: 24 }}>HigherUp</div>
          <div style={{ fontSize: 15, color: '#555555', marginBottom: 8 }}>This invite link is no longer active.</div>
          <div style={{ fontSize: 13, color: '#CCCCCC' }}>Ask your manager for a fresh one.</div>
        </div>
      </div>
    )
  }

  // Store referral code in cookie so signup form can read it
  const cookieStore = await cookies()
  cookieStore.set('genx_referral', code, {
    httpOnly: false,  // Readable by client-side form
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })

  // Also track the click (fire and forget via redirect target)
  // We'll track it on the join page load

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 400, width: '100%', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 600, color: '#111111', marginBottom: 8, letterSpacing: '-0.02em' }}>HigherUp</div>
        <div style={{ fontSize: 13, color: '#CCCCCC', marginBottom: 48 }}>AI-Powered Listing Optimization</div>

        <div style={{ background: '#F5F5F7', borderRadius: 16, padding: '32px 28px', marginBottom: 32 }}>
          <div style={{ fontSize: 13, color: '#86868B', marginBottom: 8 }}>Invited by</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#1D1D1F', marginBottom: 24 }}>
            {lg.display_name as string}
          </div>
          <p style={{ fontSize: 14, color: '#555555', lineHeight: 1.6, margin: '0 0 28px' }}>
            You&apos;ve been invited to join HigherUp — the platform that helps VA&apos;s optimize product listings with AI and earn more per hour.
          </p>
          <Link href="/join" style={{
            display: 'block', background: '#1D1D1F', color: '#FFFFFF',
            borderRadius: 12, padding: '14px 28px', fontSize: 15, fontWeight: 500,
            textDecoration: 'none',
          }}>
            Join HigherUp →
          </Link>
        </div>

        <div style={{ fontSize: 12, color: '#CCCCCC' }}>
          Referral code: {code}
        </div>
      </div>
    </div>
  )
}
