import { getGenxSession } from '@/lib/genx-auth'
import { redirect } from 'next/navigation'

export default async function GenxWelcomePage() {
  const session = await getGenxSession()
  if (!session) redirect('/genx/login')

  const status = session.lg.status as string
  if (status === 'active') redirect('/genx/command')
  if (status === 'deactivated') redirect('/dashboard')

  return (
    <div style={{
      minHeight: '100vh', background: '#0A0A0A', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 480, textAlign: 'center', padding: '0 24px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.12em', marginBottom: 40 }}>
          GENX
        </div>

        <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 40 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 24 }}>
            Application Received
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#FFFFFF', margin: '0 0 16px', lineHeight: 1.3 }}>
            Welcome, {session.lg.display_name as string}
          </h1>

          <p style={{ fontSize: 14, color: '#888888', lineHeight: 1.7, margin: '0 0 32px' }}>
            Your GENX application is under review. You&apos;ll gain access to your dashboard as soon as it&apos;s approved. This typically takes 24–48 hours.
          </p>

          <div style={{ borderTop: '1px solid #1F1F1F', paddingTop: 24, fontSize: 12, color: '#555555', lineHeight: 1.6 }}>
            Questions? Contact your HigherUp manager.
          </div>
        </div>
      </div>
    </div>
  )
}
