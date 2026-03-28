'use client'

import { useRouter } from 'next/navigation'
import { useVA } from '@/context/va-context'

export default function BlockedPage() {
  const router = useRouter()
  const { logout } = useVA()

  return (
    <div style={{
      paddingTop: 120, paddingBottom: 80, paddingInline: 24,
      textAlign: 'center', fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ fontSize: 28, fontWeight: 300, color: '#111111', marginBottom: 8 }}>
        Account suspended
      </div>
      <div style={{ fontSize: 14, color: '#999999', marginBottom: 40, maxWidth: 440, margin: '0 auto 40px' }}>
        Your account has been suspended. If you believe this is a mistake, please contact support.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <a
          href="mailto:support@higherup.io"
          style={{
            fontSize: 13, fontWeight: 500, color: '#FFFFFF',
            background: '#111111', borderRadius: 100, padding: '11px 28px',
            textDecoration: 'none', display: 'inline-block', transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          Contact support
        </a>
        <button
          onClick={() => { logout(); router.push('/') }}
          style={{ fontSize: 12, color: '#CCCCCC', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = '#111111'}
          onMouseLeave={e => e.currentTarget.style.color = '#CCCCCC'}
        >
          Log out
        </button>
      </div>
    </div>
  )
}
