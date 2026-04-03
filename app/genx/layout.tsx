import { redirect } from 'next/navigation'
import { getGenxSession } from '@/lib/genx-auth'
import GenxNav from './GenxNav'

export default async function GenxLayout({ children }: { children: React.ReactNode }) {
  const session = await getGenxSession()

  if (!session) redirect('/genx/login')

  const { lg } = session
  const status = lg.status as string

  if (status === 'pending') redirect('/genx/welcome')
  if (status === 'deactivated') redirect('/dashboard')

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFFFFF', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <GenxNav displayName={lg.display_name as string} lgId={session.lgId} />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 80px', boxSizing: 'border-box' }}>
        {children}
      </main>
    </div>
  )
}
