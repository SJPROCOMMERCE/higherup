export default function JoinPage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#FFFFFF', fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', color: '#111111', marginBottom: 32 }}>
          HigherUp
        </div>
        <div style={{ fontSize: 16, fontWeight: 300, color: '#111111', marginBottom: 8 }}>
          HigherUp is invite-only.
        </div>
        <div style={{ fontSize: 13, color: '#CCCCCC' }}>
          Ask your manager for an invite link.
        </div>
      </div>
    </div>
  )
}
