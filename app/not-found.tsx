import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh', background: '#FFFFFF',
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
    }}>
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#CCCCCC' }}>
        404
      </div>
      <div style={{ fontSize: 22, fontWeight: 300, color: '#111111' }}>
        Page not found
      </div>
      <div style={{ fontSize: 13, color: '#999999', marginTop: 4 }}>
        This page doesn&apos;t exist or you don&apos;t have access.
      </div>
      <Link
        href="/dashboard"
        style={{
          marginTop: 16, fontSize: 13, color: '#111111',
          textDecoration: 'underline', textUnderlineOffset: 3,
        }}
      >
        Back to dashboard
      </Link>
    </div>
  )
}
