import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'

export default async function WelcomePage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')

  const { lg } = session
  const status = lg.status as string

  if (status === 'active') redirect('/genx/command')

  return (
    <div style={{
      minHeight: '100vh', background: '#0A0A0A', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 480, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.12em', marginBottom: 48 }}>GENX</div>

        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#141414', border: '1px solid #1F1F1F', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#F59E0B' }} />
        </div>

        <div style={{ fontSize: 18, fontWeight: 600, color: '#FFFFFF', marginBottom: 12 }}>
          Application received
        </div>
        <div style={{ fontSize: 14, color: '#888888', lineHeight: 1.6, marginBottom: 32 }}>
          Your lead generator account is pending review. You will receive your access code once approved.
        </div>

        <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 20, textAlign: 'left' }}>
          <div style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>What happens next</div>
          {[
            'Admin reviews your application',
            'You receive your login code',
            'Access your GENX dashboard',
            'Start recruiting VAs with your referral link',
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: i < 3 ? 10 : 0 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#333333', minWidth: 16, marginTop: 2 }}>0{i + 1}</div>
              <div style={{ fontSize: 13, color: '#888888' }}>{step}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
