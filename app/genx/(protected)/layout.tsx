import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'
import GenxNav from './GenxNav'
import ReferralBar from './ReferralBar'

export default async function GenxLayout({ children }: { children: React.ReactNode }) {
  const session = await getGenxSession()

  if (!session) redirect('/genx/login')

  const { lg } = session
  const status = lg.status as string

  if (status === 'deactivated') redirect('/dashboard')

  // Fetch referral_code for persistent bar
  const db = genxDb()
  const { data: lgData } = await db
    .from('lead_generators')
    .select('referral_code')
    .eq('id', session.lgId)
    .single()

  const referralCode = (lgData?.referral_code as string) || ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://higherup.me'
  const referralLink = referralCode ? `${appUrl}/ref/${referralCode}` : ''

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFFFFF', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <GenxNav displayName={lg.display_name as string} lgId={session.lgId} />
      {referralLink && <ReferralBar link={referralLink} />}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 80px', boxSizing: 'border-box' }}>
        {children}
      </main>
    </div>
  )
}
