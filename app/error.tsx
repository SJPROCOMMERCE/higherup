'use client'

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{
      minHeight: '100vh', background: '#FFFFFF',
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
    }}>
      <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', color: '#111111', marginBottom: 24 }}>
        HigherUp
      </div>
      <div style={{ fontSize: 16, fontWeight: 300, color: '#111111' }}>
        Something went wrong.
      </div>
      <button
        onClick={reset}
        style={{
          marginTop: 16, fontSize: 13, color: '#111111',
          background: 'none', border: 'none', cursor: 'pointer',
          textDecoration: 'underline', textUnderlineOffset: 3,
          fontFamily: 'inherit',
        }}
      >
        Try again
      </button>
      <a
        href="/"
        style={{
          fontSize: 13, color: '#CCCCCC',
          textDecoration: 'underline', textUnderlineOffset: 3,
        }}
      >
        Go to sign in
      </a>
    </div>
  )
}
