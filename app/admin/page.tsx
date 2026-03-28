'use client'

import { useRouter } from 'next/navigation'

export default function AdminEntryPage() {
  const router = useRouter()

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#FFFFFF', fontFamily: "'Inter', system-ui, sans-serif",
      gap: 0,
    }}>
      <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.03em', color: '#111111', marginBottom: 32 }}>
        HigherUp Admin
      </div>
      <button
        onClick={() => router.push('/admin/dashboard')}
        style={{
          fontSize: 13, fontWeight: 500, color: '#FFFFFF',
          background: '#111111', border: 'none', borderRadius: 100,
          padding: '12px 32px', cursor: 'pointer',
          fontFamily: 'inherit', transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        Enter admin
      </button>
    </div>
  )
}
