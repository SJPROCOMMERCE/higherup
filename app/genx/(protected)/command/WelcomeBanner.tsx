'use client'
import { useState } from 'react'

export default function WelcomeBanner({ referralCode, appUrl }: { referralCode: string; appUrl: string }) {
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)
  const link = `${appUrl}/ref/${referralCode}`

  if (dismissed) return null

  function copy() {
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      background: '#0D1F0D', border: '1px solid #1A3B1A', borderRadius: 8,
      padding: '16px 20px', marginBottom: 32, display: 'flex',
      alignItems: 'center', gap: 16, flexWrap: 'wrap' as const,
    }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <span style={{ fontSize: 13, color: '#22C55E', fontWeight: 600, display: 'block', marginBottom: 4 }}>
          Welcome to GENX
        </span>
        <span style={{ fontSize: 13, color: '#888888', fontFamily: "'JetBrains Mono', monospace" }}>
          {link}
        </span>
      </div>
      <button onClick={copy} style={{
        background: '#22C55E', color: '#000000', border: 'none', borderRadius: 6,
        padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}>
        {copied ? 'Copied!' : 'Copy Link'}
      </button>
      <button onClick={() => setDismissed(true)} style={{
        background: 'none', border: 'none', color: '#555555', cursor: 'pointer', fontSize: 18, lineHeight: 1,
      }}>&#x00D7;</button>
    </div>
  )
}
